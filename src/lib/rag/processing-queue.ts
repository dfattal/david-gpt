import { createServiceClient } from "@/lib/supabase/service";
import { chunkText } from "./chunking";
import { generateChunkEmbeddings } from "./embeddings";
import {
  KnowledgeGraphExtractor,
  mergeKnowledgeGraphExtractions,
} from "./knowledge-graph";
import { randomUUID } from "crypto";

export type ProcessingJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type ProcessingJobType =
  | "document_chunking"
  | "embedding_generation"
  | "knowledge_graph_extraction"
  | "full_document_processing";

export interface ProcessingJob {
  id: string;
  document_id: string;
  job_type: ProcessingJobType;
  status: ProcessingJobStatus;
  progress: number;
  error_message?: string;
  result_data?: any;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  metadata: {
    retry_count: number;
    max_retries: number;
    priority: number;
    estimated_duration_ms?: number;
    actual_duration_ms?: number;
  };
}

export interface ProcessingResult {
  success: boolean;
  chunks?: any[];
  embeddings?: any[];
  knowledgeGraph?: any;
  error?: string;
  stats: {
    totalChunks: number;
    totalEmbeddings: number;
    totalEntities: number;
    totalRelationships: number;
    processingTimeMs: number;
  };
}

export class DocumentProcessingQueue {
  private getSupabase() {
    return createServiceClient();
  }
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startProcessing();
  }

  async addJob(
    documentId: string,
    jobType: ProcessingJobType,
    priority: number = 0,
    maxRetries: number = 3
  ): Promise<string> {
    const jobId = randomUUID();

    const job: ProcessingJob = {
      id: jobId,
      document_id: documentId,
      job_type: jobType,
      status: "pending",
      progress: 0,
      created_at: new Date().toISOString(),
      metadata: {
        retry_count: 0,
        max_retries: maxRetries,
        priority,
      },
    };

    const supabase = this.getSupabase();

    // Get the document owner
    const { data: document, error: docError } = await supabase
      .from("rag_documents")
      .select("owner")
      .eq("id", documentId)
      .single();

    console.log(`Document query result for ${documentId}:`, {
      document,
      docError,
    });

    if (docError) {
      throw new Error(`Failed to get document owner: ${docError.message}`);
    }

    if (!document?.owner) {
      throw new Error(
        `Document ${documentId} has no owner or document not found`
      );
    }

    const { error } = await supabase.from("rag_ingest_jobs").insert([
      {
        owner: document.owner, // Get owner from document
        payload: {
          document_id: job.document_id,
          job_type: job.job_type,
          progress: job.progress,
          metadata: job.metadata,
        },
        status: job.status === "pending" ? "queued" : job.status,
      },
    ]);

    if (error) {
      throw new Error(`Failed to add processing job: ${error.message}`);
    }

    console.log(`Added processing job: ${jobId} for document ${documentId}`);
    return jobId;
  }

  async updateJobStatus(
    jobId: string,
    status: ProcessingJobStatus,
    progress?: number,
    errorMessage?: string,
    resultData?: any
  ): Promise<void> {
    // rag_ingest_jobs schema only has: id, owner, payload, status, error, created_at, updated_at
    // Store progress/timestamps/results inside payload to avoid writing non-existent columns
    const supabase = this.getSupabase();

    // Fetch current payload to merge JSON fields safely
    const { data: currentJob } = await supabase
      .from("rag_ingest_jobs")
      .select("payload")
      .eq("id", jobId)
      .single();

    const currentPayload =
      (currentJob?.payload as Record<string, unknown>) || {};

    const mergedPayload: Record<string, unknown> = {
      ...currentPayload,
      // Only add keys when provided
      ...(progress !== undefined
        ? { progress: Math.max(0, Math.min(100, progress)) }
        : {}),
      ...(resultData ? { result_data: resultData } : {}),
      ...(status === "processing"
        ? { started_at: new Date().toISOString() }
        : {}),
      ...(status === "completed" || status === "failed"
        ? { completed_at: new Date().toISOString() }
        : {}),
    };

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
      ...(errorMessage ? { error: errorMessage } : {}),
      payload: mergedPayload,
      ...(progress !== undefined
        ? { progress: Math.max(0, Math.min(100, progress)) }
        : {}),
    };

    const { error } = await supabase
      .from("rag_ingest_jobs")
      .update(updateData)
      .eq("id", jobId);

    if (error) {
      console.error(`Failed to update job status: ${error.message}`);
    }
  }

  async getNextPendingJob(): Promise<ProcessingJob | null> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from("rag_ingest_jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    // Transform database record to ProcessingJob interface
    return {
      id: data.id,
      document_id: data.payload.document_id,
      job_type: data.payload.job_type,
      status: data.status,
      progress: (data as any).progress ?? data.payload.progress ?? 0,
      created_at: data.created_at,
      metadata: data.payload.metadata || {
        retry_count: 0,
        max_retries: 3,
        priority: 0,
      },
    } as ProcessingJob;
  }

  async processDocument(documentId: string, jobId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    let totalChunks = 0;
    let totalEmbeddings = 0;
    let totalEntities = 0;
    let totalRelationships = 0;

    try {
      console.log(`Starting processDocument for: ${documentId}`);
      const supabase = this.getSupabase();
      const { data: document, error: docError } = await supabase
        .from("rag_documents")
        .select("*")
        .eq("id", documentId)
        .single();

      if (docError || !document) {
        console.log(`Document error:`, docError);
        throw new Error(`Document not found: ${documentId}`);
      }

      console.log(
        `Processing document: ${document.title}, content length: ${
          document.content?.length || 0
        }`
      );

      // Do NOT create another job here - this would cause infinite loop
      // The job should already exist and be in processing state when this method is called

      if (!document.content) {
        throw new Error("Document has no content to process");
      }

      const contentType =
        document.source_type === "markdown" || document.source_type === "md"
          ? "markdown"
          : "text";

      const chunkingResult = chunkText(document.content, {
        chunkSize: 800,
        overlap: 100,
        preserveParagraphs: true,
        preserveSentences: true,
      });

      totalChunks = chunkingResult.chunks.length;
      console.log(`Created ${totalChunks} chunks`);

      // Clear existing chunks for this document to prevent accumulation
      console.log(`Clearing existing chunks for document ${documentId}`);
      const { error: deleteError } = await supabase
        .from("rag_chunks")
        .delete()
        .eq("doc_id", documentId);

      if (deleteError) {
        console.warn(`Failed to clear existing chunks: ${deleteError.message}`);
      } else {
        console.log(`Cleared existing chunks for document ${documentId}`);
      }

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
          chunk_type: "text",
          overlap_with_previous: index > 0,
        },
        created_at: new Date().toISOString(),
      }));

      const { error: chunksError } = await supabase
        .from("rag_chunks")
        .insert(chunksToStore);

      if (chunksError) {
        throw new Error(`Failed to store chunks: ${chunksError.message}`);
      }

      await this.updateJobStatus(jobId, "processing", 50);

      // Get the inserted chunks with their IDs
      const { data: insertedChunks, error: fetchError } = await supabase
        .from("rag_chunks")
        .select("id, chunk_index, content")
        .eq("doc_id", documentId)
        .order("chunk_index");

      if (fetchError || !insertedChunks) {
        throw new Error("Failed to fetch inserted chunks");
      }

      const chunkEmbeddings = await generateChunkEmbeddings(
        documentId,
        insertedChunks.map((chunk) => ({
          content: chunk.content,
          chunk_index: chunk.chunk_index,
          chunk_id: chunk.id.toString(),
        }))
      );

      totalEmbeddings = chunkEmbeddings.length;
      console.log(`Generated ${totalEmbeddings} embeddings`);

      // Update each chunk with its embedding
      for (const embedding of chunkEmbeddings) {
        const chunkId = parseInt(embedding.chunk_id);
        await supabase
          .from("rag_chunks")
          .update({ embedding: embedding.embedding })
          .eq("id", chunkId);
      }

      // Embeddings are stored directly in chunk records, no separate embeddings table

      await this.updateJobStatus(jobId, "processing", 70);

      // Use the fixed buildKnowledgeGraphForDocument function instead
      console.log("Starting knowledge graph extraction...");
      const kgResult = await import("@/lib/rag/knowledge-graph").then(
        (module) =>
          module.buildKnowledgeGraphForDocument(documentId, document.owner)
      );

      totalEntities = kgResult.entitiesExtracted;
      totalRelationships = kgResult.relationsExtracted;

      console.log(
        `KG Extraction: ${totalEntities} entities, ${totalRelationships} relations`
      );

      // Note: buildKnowledgeGraphForDocument already stores data in the database
      // No additional entity/relationship storage needed

      await this.updateJobStatus(jobId, "processing", 90);

      const { error: docUpdateError } = await supabase
        .from("rag_documents")
        .update({
          labels: {
            ...document.labels,
            processing_status: "completed",
            processed_at: new Date().toISOString(),
            chunk_count: totalChunks,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      if (docUpdateError) {
        console.error(
          "Failed to update document status:",
          docUpdateError.message
        );
      }

      const processingTimeMs = Date.now() - startTime;
      await this.updateJobStatus(jobId, "completed", 100, undefined, {
        chunks_created: totalChunks,
        embeddings_generated: totalEmbeddings,
        entities_extracted: totalEntities,
        relationships_extracted: totalRelationships,
        processing_time_ms: processingTimeMs,
      });

      console.log(`Document processing completed in ${processingTimeMs}ms`);

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
          processingTimeMs,
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(`Document processing failed: ${errorMessage}`);

      const supabase2 = this.getSupabase();
      const { data: job } = await supabase2
        .from("rag_ingest_jobs")
        .select("payload")
        .eq("payload->document_id", `"${documentId}"`)
        .single();

      if (job) {
        const retryCount = (job.payload?.retry_count || 0) + 1;
        const maxRetries = job.payload?.max_retries || 3;

        await supabase2
          .from("rag_ingest_jobs")
          .update({
            payload: { ...job.payload, retry_count: retryCount },
          })
          .eq("payload->document_id", `"${documentId}"`);

        if (retryCount < maxRetries) {
          // Update the existing job status to retry
          await supabase2
            .from("rag_ingest_jobs")
            .update({
              status: "queued",
              error: `Retry ${retryCount}/${maxRetries}: ${errorMessage}`,
              updated_at: new Date().toISOString()
            })
            .eq("payload->document_id", `"${documentId}"`);
        } else {
          // Update the existing job status to failed
          await supabase2
            .from("rag_ingest_jobs")
            .update({
              status: "error",
              error: errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq("payload->document_id", `"${documentId}"`);
          // Update document status to failed  
          await supabase2
            .from("rag_documents")
            .update({
              labels: { processing_status: "failed" },
              updated_at: new Date().toISOString(),
            })
            .eq("id", documentId);
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
          processingTimeMs,
        },
      };
    }
  }

  private async processJobs(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const job = await this.getNextPendingJob();

      if (job) {
        console.log(
          `Processing job: ${job.id}, type: ${job.job_type}, document: ${job.document_id}`
        );

        try {
          // Mark job as processing
          await this.updateJobStatus(job.id, "processing", 0);

          if (job.job_type === "full_document_processing") {
            console.log(`About to call processDocument for: ${job.document_id}`);
            const result = await this.processDocument(job.document_id, job.id);
            console.log(`processDocument completed for: ${job.document_id}`);
            
            // Mark job as completed
            if (result.success) {
              await this.updateJobStatus(job.id, "completed", 100);
            } else {
              await this.updateJobStatus(job.id, "failed", 0, result.error);
            }
          } else {
            console.log(`Unknown job type: ${job.job_type}`);
            await this.updateJobStatus(job.id, "failed", 0, `Unknown job type: ${job.job_type}`);
          }
        } catch (jobError) {
          console.error(`Job ${job.id} failed:`, jobError);
          await this.updateJobStatus(job.id, "failed", 0, jobError instanceof Error ? jobError.message : 'Unknown error');
        }
      } else {
        console.log("No pending job found");
      }
    } catch (error) {
      console.error("Job processing error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private startProcessing(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, 5000);

    console.log("Document processing queue started");
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log("Document processing queue stopped");
    }
  }

  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from("rag_ingest_jobs")
      .select("status");

    if (error) {
      console.error("Failed to get queue stats:", error);
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };

    for (const job of data || []) {
      if (job.status in stats) {
        stats[job.status as keyof typeof stats]++;
      }
    }

    return stats;
  }
}

export const documentProcessingQueue = new DocumentProcessingQueue();

export async function triggerDocumentProcessing(
  documentId: string
): Promise<string> {
  return documentProcessingQueue.addJob(
    documentId,
    "full_document_processing",
    1
  );
}
