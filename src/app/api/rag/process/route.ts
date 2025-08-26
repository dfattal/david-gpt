import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { processDocumentJob } from '@/lib/rag/processor'

interface ProcessJobRequest {
  job_id: string
}

interface ProcessDocumentRequest {
  title: string
  content: string
  source_type: 'text' | 'url' | 'pdf' | 'docx'
  source_uri?: string
  doc_date?: string
  tags?: string[]
  labels?: Record<string, unknown>
  auto_process?: boolean
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Check if this is a job processing request or document upload request
    if ('job_id' in body) {
      // Process existing job
      const { job_id } = body as ProcessJobRequest
      
      if (!job_id) {
        return Response.json({ 
          error: 'Missing required field: job_id' 
        }, { status: 400 })
      }
      
      // Verify user owns the job
      const { data: job, error: jobError } = await supabase
        .from('rag_ingest_jobs')
        .select('id, owner, status')
        .eq('id', job_id)
        .eq('owner', user.id)
        .single()
      
      if (jobError || !job) {
        return Response.json({ 
          error: 'Job not found or access denied' 
        }, { status: 404 })
      }
      
      if (job.status !== 'queued') {
        return Response.json({ 
          error: `Job is not in queued status: ${job.status}` 
        }, { status: 400 })
      }
      
      // Process the job
      const result = await processDocumentJob(job_id)
      
      return Response.json({
        success: result.success,
        result,
        message: result.success 
          ? `Document processed successfully: ${result.chunksCreated} chunks created`
          : `Processing failed: ${result.error}`
      })
      
    } else {
      // Upload and optionally process document
      const { 
        title, 
        content, 
        source_type, 
        source_uri, 
        doc_date, 
        tags = [], 
        labels = {},
        auto_process = false
      } = body as ProcessDocumentRequest
      
      // Validate required fields
      if (!title || !content || !source_type) {
        return Response.json({ 
          error: 'Missing required fields: title, content, source_type' 
        }, { status: 400 })
      }
      
      if (!['text', 'url', 'pdf', 'docx'].includes(source_type)) {
        return Response.json({ 
          error: 'Invalid source_type. Must be one of: text, url, pdf, docx' 
        }, { status: 400 })
      }
      
      // Parse and validate doc_date
      let documentDate: Date
      if (doc_date) {
        documentDate = new Date(doc_date)
        if (isNaN(documentDate.getTime())) {
          return Response.json({ 
            error: 'Invalid doc_date format. Use ISO date string (YYYY-MM-DD)' 
          }, { status: 400 })
        }
      } else {
        documentDate = new Date()
      }
      
      // Insert document
      const startTime = performance.now()
      const { data: document, error: insertError } = await supabase
        .from('rag_documents')
        .insert({
          owner: user.id,
          title,
          source_type,
          source_uri,
          doc_date: documentDate.toISOString().split('T')[0],
          tags,
          labels
        })
        .select('*')
        .single()
      
      if (insertError) {
        console.error('Error inserting document:', insertError)
        return Response.json({ 
          error: 'Failed to create document' 
        }, { status: 500 })
      }
      
      // Create processing job
      const jobPayload = {
        document_id: document.id,
        operation: 'chunk_and_embed',
        user_id: user.id,
        content // Store content in job for processing
      }
      
      const { data: job, error: jobError } = await supabase
        .from('rag_ingest_jobs')
        .insert({
          owner: user.id,
          payload: jobPayload,
          status: 'queued'
        })
        .select('*')
        .single()
      
      if (jobError) {
        console.error('Error creating job:', jobError)
        return Response.json({ 
          error: 'Failed to create processing job' 
        }, { status: 500 })
      }
      
      let processingResult = null
      
      // If auto_process is enabled, process immediately
      if (auto_process) {
        processingResult = await processDocumentJob(job.id)
      }
      
      return Response.json({
        document,
        job,
        processing_result: processingResult,
        message: auto_process 
          ? (processingResult?.success 
              ? `Document uploaded and processed: ${processingResult.chunksCreated} chunks created`
              : `Document uploaded but processing failed: ${processingResult?.error}`)
          : 'Document uploaded successfully. Use job_id to process or call with auto_process=true'
      })
    }

  } catch (error) {
    console.error('Unexpected error in document processing:', error)
    return Response.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}