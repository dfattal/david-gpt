import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { 
  IngestionWebhookManager, 
  BatchProgressTracker 
} from '@/lib/rag/ingestion-webhook';
import { v4 as uuidv4 } from 'uuid';
import { documentProcessor } from '@/lib/rag/document-processors';
import { chunkText } from '@/lib/rag/chunking';
import { embeddingService } from '@/lib/rag/embeddings';

interface BatchDocumentRequest {
  title: string;
  content?: string; // Direct text content
  fileContent?: string; // Base64 encoded file content for PDFs
  fileKey?: string; // Key for FormData file uploads (file_0, file_1, etc.)
  detectedType: string;
  confidence: number;
  metadata: {
    doi?: string;
    patentNumber?: string;
    patentUrl?: string;
    description?: string;
    batch?: boolean;
    fileName?: string;
    fileSize?: number;
  };
}

interface BatchIngestRequest {
  documents: BatchDocumentRequest[];
  batchDescription?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Check for service role bypass (for testing only)
    const authHeader = req.headers.get('Authorization');
    const isServiceRoleRequest = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    let supabase;
    let user;
    
    if (isServiceRoleRequest) {
      // Use admin client for service role requests
      const { createOptimizedAdminClient } = await import('@/lib/supabase/server');
      supabase = createOptimizedAdminClient();
      user = { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', email: 'dfattal@gmail.com' };
      console.log('🔑 Using service role authentication for batch testing');
    } else {
      // Normal authentication flow
      supabase = await createClient();
      
      // Get the authenticated user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser) {
        throw new AppError('Authentication required', 401);
      }
      
      user = authUser;

      // Check user role - only admin can ingest documents
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        throw new AppError('Admin access required', 403);
      }
    }

    // Handle both JSON and FormData requests (similar to single pipeline)
    let body: BatchIngestRequest;
    const fileMap = new Map<string, { buffer: Buffer; fileName: string }>();
    
    const contentType = req.headers.get('content-type');
    if (contentType?.includes('multipart/form-data')) {
      // Handle FormData with file uploads
      const formData = await req.formData();
      const documentsField = formData.get('documents') as string | null;
      const batchDescriptionField = formData.get('batchDescription') as string | null;
      
      if (!documentsField) {
        throw new AppError('Documents field is required in FormData', 400);
      }
      
      body = {
        documents: JSON.parse(documentsField),
        batchDescription: batchDescriptionField || undefined
      };
      
      // Extract any uploaded files
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('file_') && value instanceof File) {
          const fileBuffer = Buffer.from(await value.arrayBuffer());
          fileMap.set(key, { buffer: fileBuffer, fileName: value.name });
        }
      }
    } else {
      // Handle JSON request
      body = await req.json();
    }
    
    const { documents, batchDescription } = body;

    // Validation
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new AppError('Documents array is required', 400);
    }

    if (documents.length > 100) {
      throw new AppError('Maximum 100 documents per batch', 400);
    }

    // Validate and auto-generate titles for documents
    for (const doc of documents) {
      // Auto-generate title if not provided
      if (!doc.title?.trim()) {
        if (doc.metadata?.patentUrl) {
          const patentMatch = doc.metadata.patentUrl.match(/([A-Z]{2}\d+[A-Z]\d)/);
          doc.title = patentMatch ? `Patent ${patentMatch[1]}` : 'Patent Document';
        } else if (doc.metadata?.patentNumber) {
          doc.title = `Patent ${doc.metadata.patentNumber}`;
        } else if (doc.metadata?.doi) {
          doc.title = `Document (DOI: ${doc.metadata.doi})`;
        } else if (doc.fileKey && fileMap.has(doc.fileKey)) {
          const fileName = fileMap.get(doc.fileKey)!.fileName;
          doc.title = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
        } else {
          doc.title = 'Untitled Document';
        }
      }
      if (!doc.content && !doc.fileContent && !doc.fileKey && !doc.metadata?.doi && !doc.metadata?.patentUrl) {
        throw new AppError('Each document must have content, file content, file upload, or a URL/DOI', 400);
      }
      // Validate fileKey references exist in fileMap
      if (doc.fileKey && !fileMap.has(doc.fileKey)) {
        throw new AppError(`File reference '${doc.fileKey}' not found in uploaded files`, 400);
      }
    }

    // Generate batch ID and batch job ID
    const batchId = uuidv4();
    const batchJobId = uuidv4();
    
    // Initialize batch progress tracker
    const batchTracker = new BatchProgressTracker(batchId, user.id, documents.length);

    // Create batch processing job
    const { data: batchJob, error: batchJobError } = await supabase
      .from('processing_jobs')
      .insert({
        id: batchJobId,
        type: 'document_ingest',
        user_id: user.id,
        priority: 1,
        config: {
          batchId,
          totalDocuments: documents.length,
          batchDescription
        },
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: 0.0,
        progress_message: `Starting batch processing of ${documents.length} documents`
      })
      .select()
      .single();

    if (batchJobError) {
      console.error('Failed to create batch job:', batchJobError);
      throw new AppError('Failed to create batch job', 500);
    }

    // Process documents in background
    processBatchInBackground(batchId, documents, user.id, batchDescription || '', batchTracker, fileMap).catch((error) => {
      console.error(`❌ Background batch processing failed for batch ${batchId}:`, error);
    });

    return NextResponse.json({ 
      batchId,
      batchJobId: batchJob.id,
      totalDocuments: documents.length,
      message: `Batch ingestion started. Processing ${documents.length} documents in background.`
    }, { status: 201 });

  } catch (error) {
    return handleApiError(error);
  }
}

// Background batch processing function
async function processBatchInBackground(
  batchId: string,
  documents: BatchDocumentRequest[],
  userId: string,
  batchDescription: string,
  batchTracker: BatchProgressTracker,
  fileMap: Map<string, { buffer: Buffer; fileName: string }>
) {
  console.log(`🚀 Starting background batch processing for batch ${batchId} with ${documents.length} documents`);
  
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[]
  };

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    
    try {
      await processDocument(doc, batchId, userId, batchDescription, batchTracker, i + 1, fileMap);
      results.successful++;
    } catch (error) {
      console.error(`Failed to process document "${doc.title}":`, error);
      results.failed++;
      results.errors.push(`${doc.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Small delay between documents to prevent overwhelming the system
    if (i < documents.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Update batch job with final results - use admin client for background updates
  const { createOptimizedAdminClient } = await import('@/lib/supabase/server');
  const supabase = createOptimizedAdminClient();
  
  // Get the batch job ID from the config
  const { data: batchJobs } = await supabase
    .from('processing_jobs')
    .select('id')
    .eq('type', 'document_ingest')
    .contains('config', { batchId })
    .limit(1);

  if (batchJobs && batchJobs.length > 0) {
    await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: 1.0,
        progress_message: `Batch completed: ${results.successful} successful, ${results.failed} failed`,
        results: {
          successful: results.successful,
          failed: results.failed,
          errors: results.errors
        }
      })
      .eq('id', batchJobs[0].id);
  }

  console.log(`✅ Batch ${batchId} completed: ${results.successful} successful, ${results.failed} failed`);
}

async function processDocument(
  doc: BatchDocumentRequest,
  batchId: string,
  userId: string,
  batchDescription: string,
  batchTracker: BatchProgressTracker,
  position: number,
  fileMap: Map<string, { buffer: Buffer; fileName: string }>
): Promise<void> {
  // Use admin client for background processing to bypass RLS
  const { createOptimizedAdminClient } = await import('@/lib/supabase/server');
  const supabase = createOptimizedAdminClient();
  
  // Create document record
  const { data: document, error: docError } = await supabase
    .from('documents')
    .insert({
      title: doc.title.trim(),
      doc_type: doc.detectedType as any,
      url: doc.metadata?.patentUrl || (doc.metadata?.doi ? `https://doi.org/${doc.metadata.doi}` : null),
      doi: doc.metadata?.doi || null,
      patent_no: doc.metadata?.patentNumber || null,
      processing_status: 'pending',
      created_by: userId
    })
    .select()
    .single();

  if (docError) {
    console.error('Failed to create document:', docError);
    throw new Error(`Failed to create document: ${docError.message}`);
  }

  // Create processing job for individual document
  const { data: job, error: jobError } = await supabase
    .from('processing_jobs')
    .insert({
      type: 'document_ingest',
      user_id: userId,
      document_id: document.id,
      priority: 1,
      config: {
        title: doc.title,
        docType: doc.detectedType,
        batchId,
        position,
        metadata: {
          ...doc.metadata,
          description: batchDescription,
          batch: true,
          confidence: doc.confidence
        }
      }
    })
    .select()
    .single();

  if (jobError) {
    console.error('Failed to create processing job:', jobError);
    throw new Error(`Failed to create processing job: ${jobError.message}`);
  }

  const jobId = job.id;
  const documentId = document.id;

  try {
    // Stage 1: Queued
    await batchTracker.notifyDocumentProgress(
      documentId, 
      jobId,
      IngestionWebhookManager.STAGES.QUEUED(position)
    );

    // Update job status
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'processing', 
        started_at: new Date().toISOString(),
        progress: 0.1,
        progress_message: 'Starting document processing'
      })
      .eq('id', jobId);

    // Stage 2: Analyzing
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.ANALYZING()
    );

    let processedContent: string;
    let extractedMetadata: Record<string, unknown> = {};

    // Stage 3: Extracting content based on type
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.EXTRACTING(doc.detectedType)
    );

    if (doc.fileKey && fileMap.has(doc.fileKey)) {
      // Process uploaded file from FormData
      const fileData = fileMap.get(doc.fileKey)!;
      const fileName = fileData.fileName || '';
      const isTextFile = fileName.endsWith('.md') || fileName.endsWith('.txt') || fileName.endsWith('.json');
      
      if (isTextFile) {
        // For text-based files, read content directly
        processedContent = fileData.buffer.toString('utf-8');
        extractedMetadata = { fileName };
      } else {
        // For binary files (PDF, etc.) - use enhanced DocumentProcessor
        const result = await documentProcessor.processDocument({
          type: 'file',
          content: fileData.buffer,
          metadata: { 
            title: doc.title,
            fileName: fileName,
            ...doc.metadata 
          }
        });
        processedContent = result?.content || '';
        extractedMetadata = result?.metadata || {};
      }
    } else if (doc.fileContent) {
      // Process PDF file content - decode base64 and use enhanced GROBID processing
      const fileBuffer = Buffer.from(doc.fileContent, 'base64');
      const result = await documentProcessor.processDocument({
        type: 'file',
        content: fileBuffer,
        metadata: { 
          title: doc.title,
          fileName: doc.metadata?.fileName,
          ...doc.metadata 
        }
      });
      processedContent = result?.content || '';
      extractedMetadata = result?.metadata || {};
    } else if (doc.content) {
      processedContent = doc.content;
    } else if (doc.metadata?.patentUrl) {
      // Process patent URL using enhanced Google Patents extractor
      const { extractGooglePatentData, formatPatentContent } = await import('@/lib/rag/google-patents-extractor');
      const patentData = await extractGooglePatentData(doc.metadata.patentUrl);
      processedContent = formatPatentContent(patentData);
      extractedMetadata = patentData;
    } else if (doc.metadata?.doi) {
      // Process DOI/arXiv - use enhanced DocumentProcessor
      const result = await documentProcessor.processDocument({
        type: 'doi',
        content: doc.metadata.doi,
        metadata: { title: doc.title }
      });
      processedContent = result?.content || '';
      extractedMetadata = result?.metadata || {};
    } else {
      throw new Error('No valid content source provided');
    }

    // Stage 4: Chunking
    const chunks = await chunkText(processedContent, documentId);
    
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.CHUNKING(chunks.length)
    );

    // Stage 5: Embedding
    const embeddings = await embeddingService.generateEmbeddings(chunks.map(c => c.content));
    
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.EMBEDDING(embeddings.length)
    );

    // Stage 6: Indexing
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.INDEXING()
    );

    // Create hash function
    const createHash = (algorithm: string) => {
      const crypto = require('crypto');
      return crypto.createHash(algorithm);
    };

    // Save chunks with embeddings to database
    const chunksToInsert = chunks.map((chunk, index) => ({
      document_id: documentId,
      content: chunk.content,
      content_hash: createHash('sha256').update(chunk.content).digest('hex'),
      token_count: chunk.tokenCount,
      chunk_index: index,
      section_title: chunk.sectionTitle,
      embedding: JSON.stringify(embeddings[index]),
      tsvector_content: null // Will be generated by database trigger
    }));

    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunksToInsert);

    if (chunksError) {
      throw new Error(`Failed to save chunks: ${chunksError.message}`);
    }

    // Update document with extracted metadata
    // Map patent-specific fields to database columns
    const documentUpdate: any = {
      processing_status: 'completed',
      processed_at: new Date().toISOString()
    };

    // For patent documents, map enhanced metadata to specific database fields
    if (doc.metadata?.patentUrl || extractedMetadata.patentNumber) {
      // Core patent identification fields
      if (extractedMetadata.patentNumber) documentUpdate.patent_no = extractedMetadata.patentNumber;
      if (extractedMetadata.applicationNumber) documentUpdate.application_no = extractedMetadata.applicationNumber;
      if (extractedMetadata.publicationNumber) documentUpdate.publication_no = extractedMetadata.publicationNumber;
      
      // Patent dates
      if (extractedMetadata.filingDate) documentUpdate.filed_date = extractedMetadata.filingDate;
      if (extractedMetadata.grantDate) documentUpdate.granted_date = extractedMetadata.grantDate;
      if (extractedMetadata.publicationDate) documentUpdate.published_date = extractedMetadata.publicationDate;
      if (extractedMetadata.priorityDate) documentUpdate.priority_date = extractedMetadata.priorityDate;
      if (extractedMetadata.expirationDate) documentUpdate.expiration_date = extractedMetadata.expirationDate;
      
      // Patent entities and content
      if (extractedMetadata.inventors) documentUpdate.inventors = JSON.stringify(extractedMetadata.inventors);
      if (extractedMetadata.assignees) documentUpdate.assignees = JSON.stringify(extractedMetadata.assignees);
      if (extractedMetadata.originalAssignee) documentUpdate.original_assignee = extractedMetadata.originalAssignee;
      if (extractedMetadata.status) documentUpdate.patent_status = extractedMetadata.status;
      
      // Patent content for searchability
      if (extractedMetadata.abstract) documentUpdate.abstract = extractedMetadata.abstract;
      if (extractedMetadata.description) documentUpdate.description = extractedMetadata.description;
      if (extractedMetadata.claims && Array.isArray(extractedMetadata.claims)) {
        documentUpdate.claims = JSON.stringify(extractedMetadata.claims);
      }
      if (extractedMetadata.classification && Array.isArray(extractedMetadata.classification)) {
        documentUpdate.classification = JSON.stringify(extractedMetadata.classification);
      }
      
      console.log(`✅ [Batch] Mapped patent metadata for ${extractedMetadata.patentNumber}: inventors=${extractedMetadata.inventors?.length}, assignees=${extractedMetadata.assignees?.length}, claims=${extractedMetadata.claims?.length}`);
    } else {
      // For non-patent documents, preserve existing behavior
      Object.assign(documentUpdate, extractedMetadata);
    }

    await supabase
      .from('documents')
      .update(documentUpdate)
      .eq('id', documentId);

    // Stage 7: Entity Extraction and Knowledge Graph Integration
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.EXTRACTING_ENTITIES()
    );

    try {
      // Extract entities and relationships
      const { processDocumentEntities } = await import('@/lib/rag/entity-extraction');
      await processDocumentEntities(documentId);
      console.log(`✅ Entity extraction completed for document: ${doc.title}`);
    } catch (error) {
      console.warn(`Entity extraction failed for document ${doc.title}:`, error);
      // Don't fail the entire ingestion for entity extraction errors
    }

    // Stage 8: Completed
    const endTime = Date.now();
    const startTime = new Date(job.created_at).getTime();
    const timeElapsed = endTime - startTime;

    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.COMPLETED(chunks.length, embeddings.length, timeElapsed)
    );

    // Complete the job
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: 1.0,
        progress_message: 'Document processing completed successfully',
        results: {
          chunksCreated: chunks.length,
          embeddingsGenerated: embeddings.length,
          metadata: extractedMetadata,
          timeElapsed
        }
      })
      .eq('id', jobId);

    console.log(`✅ Document "${doc.title}" processed successfully: ${chunks.length} chunks created`);

  } catch (error) {
    console.error(`❌ Document processing failed for "${doc.title}":`, error);
    
    // Notify failure
    await batchTracker.notifyDocumentProgress(
      documentId,
      jobId,
      IngestionWebhookManager.STAGES.FAILED(error instanceof Error ? error.message : 'Unknown error')
    );
    
    // Update job with error
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', jobId);

    // Update document status
    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq('id', documentId);

    throw error; // Re-throw to be caught by batch processor
  }
}