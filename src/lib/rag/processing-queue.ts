import { createClient } from '@/lib/supabase/server'
import { chunkText } from './chunking'
import { generateChunkEmbeddings } from './embeddings'
import { KnowledgeGraphExtractor, mergeKnowledgeGraphExtractions } from './knowledge-graph'

export type ProcessingJobStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ProcessingJobType = 
  | 'document_chunking'
  | 'embedding_generation'
  | 'knowledge_graph_extraction'
  | 'full_document_processing'

export interface ProcessingJob {
  id: string
  document_id: string
  job_type: ProcessingJobType
  status: ProcessingJobStatus
  progress: number
  error_message?: string
  result_data?: any
  created_at: string
  started_at?: string
  completed_at?: string
  metadata: {
    retry_count: number
    max_retries: number
    priority: number
    estimated_duration_ms?: number
    actual_duration_ms?: number
  }
}

export interface ProcessingResult {
  success: boolean
  chunks?: any[]
  embeddings?: any[]
  knowledgeGraph?: any
  error?: string
  stats: {
    totalChunks: number
    totalEmbeddings: number
    totalEntities: number
    totalRelationships: number
    processingTimeMs: number
  }
}

export class DocumentProcessingQueue {
  private async getSupabase() {
    return createClient()
  }
  private isProcessing = false
  private processingInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startProcessing()
  }

  async addJob(
    documentId: string,
    jobType: ProcessingJobType,
    priority: number = 0,
    maxRetries: number = 3
  ): Promise<string> {
    const jobId = `job_${documentId}_${jobType}_${Date.now()}`
    
    const job: ProcessingJob = {
      id: jobId,
      document_id: documentId,
      job_type: jobType,
      status: 'pending',
      progress: 0,
      created_at: new Date().toISOString(),
      metadata: {
        retry_count: 0,
        max_retries: maxRetries,
        priority,
      }
    }

    const supabase = await this.getSupabase()
    
    // Get the document owner
    const { data: document } = await supabase
      .from('rag_documents')
      .select('owner')
      .eq('id', documentId)
      .single()
      
    const { error } = await supabase
      .from('rag_ingest_jobs')
      .insert([{
        owner: document?.owner, // Get owner from document
        payload: {
          document_id: job.document_id,
          job_type: job.job_type,
          progress: job.progress,
          metadata: job.metadata
        },
        status: job.status === 'pending' ? 'queued' : job.status
      }])

    if (error) {
      throw new Error(`Failed to add processing job: ${error.message}`)
    }

    console.log(`Added processing job: ${jobId} for document ${documentId}`)
    return jobId
  }

  async updateJobStatus(
    jobId: string,
    status: ProcessingJobStatus,
    progress?: number,
    errorMessage?: string,
    resultData?: any
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (progress !== undefined) {
      updateData.progress = Math.max(0, Math.min(100, progress))
    }

    if (status === 'processing' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString()
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString()
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    if (resultData) {
      updateData.result_data = resultData
    }

    const supabase = await this.getSupabase()
    const { error } = await supabase
      .from('processing_jobs')
      .update(updateData)
      .eq('id', jobId)

    if (error) {
      console.error(`Failed to update job status: ${error.message}`)
    }
  }

  async getNextPendingJob(): Promise<ProcessingJob | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('metadata->priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return data as ProcessingJob
  }

  async processDocument(documentId: string): Promise<ProcessingResult> {
    const startTime = Date.now()
    let totalChunks = 0
    let totalEmbeddings = 0
    let totalEntities = 0
    let totalRelationships = 0

    try {
      const supabase = await this.getSupabase()
      const { data: document, error: docError } = await supabase
        .from('rag_documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (docError || !document) {
        throw new Error(`Document not found: ${documentId}`)
      }

      console.log(`Processing document: ${document.title}`)

      const jobId = await this.addJob(documentId, 'full_document_processing', 1)
      await this.updateJobStatus(jobId, 'processing', 10)

      if (!document.content) {
        throw new Error('Document has no content to process')
      }

      const contentType = document.source_type === 'markdown' || document.source_type === 'md' 
        ? 'markdown' 
        : 'text'

      const chunkingResult = chunkText(document.content, {
        chunkSize: 800,
        overlap: 100,
        preserveParagraphs: true,
        preserveSentences: true
      })

      totalChunks = chunkingResult.chunks.length
      console.log(`Created ${totalChunks} chunks`)
      await this.updateJobStatus(jobId, 'processing', 30)

      const chunksToStore = chunkingResult.chunks.map((chunk, index) => ({
        doc_id: documentId,
        chunk_index: index,
        content: chunk.content,
        tags: [],
        labels: {
          token_count: chunk.tokenCount,
          char_count: chunk.content.length,
          start_offset: chunk.startOffset,
          end_offset: chunk.endOffset,
          chunk_type: 'text',
          overlap_with_previous: index > 0
        },
        created_at: new Date().toISOString()
      }))

      const { error: chunksError } = await supabase
        .from('rag_chunks')
        .insert(chunksToStore)

      if (chunksError) {
        throw new Error(`Failed to store chunks: ${chunksError.message}`)
      }

      await this.updateJobStatus(jobId, 'processing', 50)

      // Get the inserted chunks with their IDs
      const { data: insertedChunks, error: fetchError } = await supabase
        .from('rag_chunks')
        .select('id, chunk_index, content')
        .eq('doc_id', documentId)
        .order('chunk_index')

      if (fetchError || !insertedChunks) {
        throw new Error('Failed to fetch inserted chunks')
      }

      const chunkEmbeddings = await generateChunkEmbeddings(
        documentId,
        insertedChunks.map(chunk => ({
          content: chunk.content,
          chunk_index: chunk.chunk_index,
          chunk_id: chunk.id.toString()
        }))
      )

      totalEmbeddings = chunkEmbeddings.length
      console.log(`Generated ${totalEmbeddings} embeddings`)

      // Update each chunk with its embedding
      for (const embedding of chunkEmbeddings) {
        const chunkId = parseInt(embedding.chunk_id)
        await supabase
          .from('rag_chunks')
          .update({ embedding: `[${embedding.embedding.join(',')}]` })
          .eq('id', chunkId)
      }

      // Embeddings are stored directly in chunk records, no separate embeddings table

      await this.updateJobStatus(jobId, 'processing', 70)

      // Use the fixed buildKnowledgeGraphForDocument function instead
      console.log('Starting knowledge graph extraction...')
      const kgResult = await import('@/lib/rag/knowledge-graph').then(module => 
        module.buildKnowledgeGraphForDocument(documentId, document.owner)
      )

      totalEntities = kgResult.entitiesExtracted
      totalRelationships = kgResult.relationsExtracted

      console.log(`KG Extraction: ${totalEntities} entities, ${totalRelationships} relations`)

      // Note: buildKnowledgeGraphForDocument already stores data in the database
      // No additional entity/relationship storage needed

      await this.updateJobStatus(jobId, 'processing', 90)

      const { error: docUpdateError } = await supabase
        .from('rag_documents')
        .update({
          labels: {
            ...document.labels,
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
            chunk_count: totalChunks
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId)

      if (docUpdateError) {
        console.error('Failed to update document status:', docUpdateError.message)
      }

      const processingTimeMs = Date.now() - startTime
      await this.updateJobStatus(jobId, 'completed', 100, undefined, {
        chunks_created: totalChunks,
        embeddings_generated: totalEmbeddings,
        entities_extracted: totalEntities,
        relationships_extracted: totalRelationships,
        processing_time_ms: processingTimeMs
      })

      console.log(`Document processing completed in ${processingTimeMs}ms`)

      return {
        success: true,
        chunks: insertedChunks,
        embeddings: chunkEmbeddings,
        knowledgeGraph: kgResult,
        stats: {
          totalChunks,
          totalEmbeddings,
          totalEntities,
          totalRelationships,
          processingTimeMs
        }
      }

    } catch (error) {
      const processingTimeMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.error(`Document processing failed: ${errorMessage}`)

      const supabase2 = await this.getSupabase()
      const { data: job } = await supabase2
        .from('processing_jobs')
        .select('metadata')
        .eq('document_id', documentId)
        .eq('job_type', 'full_document_processing')
        .single()

      if (job) {
        const retryCount = (job.metadata?.retry_count || 0) + 1
        const maxRetries = job.metadata?.max_retries || 3

        await supabase2
          .from('processing_jobs')
          .update({
            'metadata->retry_count': retryCount
          })
          .eq('document_id', documentId)
          .eq('job_type', 'full_document_processing')

        if (retryCount < maxRetries) {
          await this.updateJobStatus(
            `job_${documentId}_full_document_processing_${Date.now()}`, 
            'pending', 
            0, 
            `Retry ${retryCount}/${maxRetries}: ${errorMessage}`
          )
        } else {
          await this.updateJobStatus(
            `job_${documentId}_full_document_processing_${Date.now()}`, 
            'failed', 
            0, 
            errorMessage
          )

          await supabase2
            .from('documents')
            .update({
              processing_status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', documentId)
        }
      }

      return {
        success: false,
        error: errorMessage,
        stats: {
          totalChunks,
          totalEmbeddings,
          totalEntities,
          totalRelationships,
          processingTimeMs
        }
      }
    }
  }

  private async processJobs(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      const job = await this.getNextPendingJob()
      
      if (job) {
        console.log(`Processing job: ${job.id}`)
        
        if (job.job_type === 'full_document_processing') {
          await this.processDocument(job.document_id)
        }
      }
    } catch (error) {
      console.error('Job processing error:', error)
    } finally {
      this.isProcessing = false
    }
  }

  private startProcessing(): void {
    if (this.processingInterval) {
      return
    }

    this.processingInterval = setInterval(() => {
      this.processJobs()
    }, 5000)

    console.log('Document processing queue started')
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
      console.log('Document processing queue stopped')
    }
  }

  async getQueueStats(): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
  }> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('status')

    if (error) {
      console.error('Failed to get queue stats:', error)
      return { pending: 0, processing: 0, completed: 0, failed: 0 }
    }

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 }
    
    for (const job of data || []) {
      if (job.status in stats) {
        stats[job.status as keyof typeof stats]++
      }
    }

    return stats
  }
}

export const documentProcessingQueue = new DocumentProcessingQueue()

export async function triggerDocumentProcessing(documentId: string): Promise<string> {
  return documentProcessingQueue.addJob(documentId, 'full_document_processing', 1)
}