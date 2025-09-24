/**
 * Unified Document Ingestion Service
 * 
 * Consolidates single and batch document processing into a unified pipeline
 * that handles document processing, chunking, embedding generation, and database persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { documentProcessor } from './document-processors';
import { chunkText } from './chunking';
import { createPatentChunks } from './patent-chunking';
import { createArticleChunks } from './article-chunking';
import { embeddingService } from './embeddings';
import { extractGooglePatentData, formatPatentContent } from './google-patents-extractor';
import { extractEntityFromSingleChunk } from './entity-extraction';
import { IngestionWebhookManager, BatchProgressTracker } from './ingestion-webhook';
import { documentAnalyzer } from './unified-document-analyzer';
import { typeRegistry, DEFAULT_PERSONA } from './type-registry';
import { templateRegistry } from './metadata-templates';
import type { DocumentType, DocumentMetadata, ProcessingJob, Persona } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

// =======================
// Common Interfaces
// =======================

export interface BaseIngestionRequest {
  title?: string;
  metadata?: Record<string, any>;
  userId: string;
  persona?: Persona; // Optional persona for document processing
}

export interface SingleIngestionRequest extends BaseIngestionRequest {
  type: 'single';
  content?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  docType?: DocumentType;
  url?: string;
  patentUrl?: string;
  doi?: string;
}

export interface BatchIngestionRequest extends BaseIngestionRequest {
  type: 'batch';
  documents: BatchDocumentRequest[];
  batchDescription?: string;
}

export interface BatchDocumentRequest {
  title: string;
  content?: string;
  fileContent?: string; // Base64 encoded
  fileKey?: string;
  detectedType: string;
  confidence: number;
  metadata: {
    doi?: string;
    patentNumber?: string;
    patentUrl?: string;
    sourceUrl?: string;
    description?: string;
    batch?: boolean;
    fileName?: string;
    fileSize?: number;
  };
}

export interface IngestionResult {
  success: boolean;
  documentId?: string;
  jobId?: string;
  batchId?: string;
  batchJobId?: string;
  totalDocuments?: number;
  message: string;
  error?: string;
}

export interface ProcessingContext {
  supabase: SupabaseClient;
  user: { id: string; email?: string };
  progressTracker?: BatchProgressTracker;
  webhookManager?: IngestionWebhookManager;
}

// =======================
// Main Ingestion Service
// =======================

export class UnifiedIngestionService {
  private supabaseAdmin = createOptimizedAdminClient();

  /**
   * Main ingestion entry point - handles both single and batch requests
   */
  async ingestDocuments(
    request: SingleIngestionRequest | BatchIngestionRequest,
    context: ProcessingContext
  ): Promise<IngestionResult> {
    try {
      // Validate environment setup
      const envValidation = this.validateEnvironment(request);
      if (!envValidation.isValid) {
        return {
          success: false,
          message: 'Environment validation failed',
          error: envValidation.error
        };
      }

      if (request.type === 'single') {
        return await this.processSingleDocument(request, context);
      } else {
        return await this.processBatchDocuments(request, context);
      }
    } catch (error) {
      console.error('Ingestion service error:', error);
      return {
        success: false,
        message: 'Ingestion failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a single document
   */
  private async processSingleDocument(
    request: SingleIngestionRequest,
    context: ProcessingContext
  ): Promise<IngestionResult> {
    const { supabase, user } = context;


    // Continue with normal single document processing
    const finalTitle = await this.generateDocumentTitle(request);
    const docType = await this.determineDocumentType(request);

    // Create processing job
    const job = await this.createProcessingJob({
      type: 'single',
      userId: user.id,
      title: finalTitle,
      docType,
      metadata: {
        ...request.metadata,
        url: request.url,
        patentUrl: request.patentUrl,
        doi: request.doi,
        hasFile: !!request.fileBuffer,
        fileName: request.fileName
      }
    });

    // Create document record
    const document = await this.createDocumentRecord({
      title: finalTitle,
      docType: docType,
      url: request.url || request.patentUrl || (request.doi ? `https://doi.org/${request.doi}` : null),
      sourceUrl: null, // Single documents don't have separate source URLs
      doi: request.doi || null,
      patentNo: request.patentUrl ? this.extractPatentNumber(request.patentUrl) : null,
      canonicalUrl: null,
      arxivId: null,
      userId: user.id,
      processingStatus: 'pending'
    });

    // Update job with document ID
    await supabase
      .from('processing_jobs')
      .update({ document_id: document.id })
      .eq('id', job.id);

    // Start background processing
    this.processDocumentBackground(document.id, request, context);

    return {
      success: true,
      documentId: document.id,
      jobId: job.id,
      message: 'Document ingestion started. Processing in background.'
    };
  }

  /**
   * Process multiple documents in batch
   */
  private async processBatchDocuments(
    request: BatchIngestionRequest,
    context: ProcessingContext
  ): Promise<IngestionResult> {
    const { supabase, user } = context;
    
    // Validate batch
    this.validateBatchRequest(request);
    
    // Generate batch IDs
    const batchId = uuidv4();
    const batchJobId = uuidv4();

    // Auto-generate titles for documents without titles
    await this.generateBatchTitles(request.documents);

    // Create batch progress tracker
    const batchTracker = new BatchProgressTracker(batchId, user.id, request.documents.length);
    
    // Create batch processing job
    const batchJob = await this.createProcessingJob({
      type: 'batch',
      userId: user.id,
      batchId,
      totalDocuments: request.documents.length,
      batchDescription: request.batchDescription
    });

    // Start background batch processing asynchronously
    console.log(`🚀 About to start background batch processing for batch ${batchId} with ${request.documents.length} documents`);
    this.processBatchBackground(batchId, batchJob.id, request, { ...context, progressTracker: batchTracker })
      .catch(error => {
        console.error(`❌ Background batch processing failed for batch ${batchId}:`, error);
      });

    return {
      success: true,
      batchId,
      batchJobId: batchJob.id,
      totalDocuments: request.documents.length,
      message: `Batch ingestion started. Processing ${request.documents.length} documents in background.`
    };
  }



  /**
   * Generate appropriate title for document
   */
  private async generateDocumentTitle(request: SingleIngestionRequest): Promise<string> {
    if (request.title?.trim()) {
      return request.title.trim();
    }

    // Auto-generate based on content type
    if (request.patentUrl) {
      const patentMatch = request.patentUrl.match(/([A-Z]{2}\d+[A-Z]\d)/);
      return patentMatch ? `Patent ${patentMatch[1]}` : 'Patent Document';
    }

    if (request.doi) {
      return `Document (DOI: ${request.doi})`;
    }

    if (request.fileName) {
      return request.fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    }

    if (request.url) {
      try {
        const urlObj = new URL(request.url);
        return `Document from ${urlObj.hostname}`;
      } catch {
        return 'Web Document';
      }
    }

    return 'Untitled Document';
  }

  /**
   * Generate titles for batch documents
   */
  private async generateBatchTitles(documents: BatchDocumentRequest[]): Promise<void> {
    for (const doc of documents) {
      if (!doc.title?.trim()) {
        if (doc.metadata?.patentUrl) {
          const patentMatch = doc.metadata.patentUrl.match(/([A-Z]{2}\d+[A-Z]\d)/);
          doc.title = patentMatch ? `Patent ${patentMatch[1]}` : 'Patent Document';
        } else if (doc.metadata?.patentNumber) {
          doc.title = `Patent ${doc.metadata.patentNumber}`;
        } else if (doc.metadata?.doi) {
          doc.title = `Document (DOI: ${doc.metadata.doi})`;
        } else if (doc.metadata?.fileName) {
          doc.title = doc.metadata.fileName.replace(/\.[^/.]+$/, '');
        } else {
          doc.title = 'Untitled Document';
        }
      }
    }
  }

  /**
   * Determine document type based on request parameters
   */
  private async determineDocumentType(request: SingleIngestionRequest): Promise<DocumentType> {
    if (request.docType) {
      return request.docType;
    }

    if (request.patentUrl || request.metadata?.patentNumber) {
      return 'patent';
    }

    if (request.doi) {
      return 'paper';
    }

    if (request.fileBuffer) {
      return 'pdf';
    }

    if (request.url) {
      return 'url';
    }

    return 'text';
  }

  /**
   * Create processing job record
   */
  private async createProcessingJob(config: {
    type: 'single' | 'batch';
    userId: string;
    title?: string;
    docType?: DocumentType;
    batchId?: string;
    totalDocuments?: number;
    batchDescription?: string;
    metadata?: Record<string, any>;
  }): Promise<ProcessingJob> {
    const jobConfig = config.type === 'single' 
      ? {
          title: config.title,
          docType: config.docType,
          ...config.metadata
        }
      : {
          batchId: config.batchId,
          totalDocuments: config.totalDocuments,
          batchDescription: config.batchDescription
        };

    const { data: job, error } = await this.supabaseAdmin
      .from('processing_jobs')
      .insert({
        type: 'document_ingest',
        user_id: config.userId,
        priority: 1,
        config: jobConfig,
        ...(config.type === 'batch' && {
          status: 'processing',
          started_at: new Date().toISOString(),
          progress: 0.0,
          progress_message: `Starting ${config.type} processing`
        })
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create processing job: ${error.message}`);
    }

    return job;
  }

  /**
   * Check if document already exists using identifiers, URL, or title similarity
   */
  private async findExistingDocument(config: {
    title: string;
    url?: string | null;
    doi?: string | null;
    patentNo?: string | null;
    canonicalUrl?: string | null;
  }): Promise<any | null> {
    let query = this.supabaseAdmin
      .from('documents')
      .select('*')
      .limit(1);

    // Priority order for deduplication using new JSONB schema:
    // 1. DOI (most reliable)
    if (config.doi) {
      const { data } = await query.eq('identifiers->doi', config.doi);
      if (data && data.length > 0) {
        return data[0];
      }
    }

    // 2. Patent number (very reliable)
    if (config.patentNo) {
      const { data } = await query.eq('identifiers->patent_no', config.patentNo);
      if (data && data.length > 0) {
        return data[0];
      }
    }

    // 3. Exact URL match
    if (config.url || config.canonicalUrl) {
      const urlToCheck = config.canonicalUrl || config.url;
      const { data } = await query.eq('url', urlToCheck);
      if (data && data.length > 0) {
        return data[0];
      }
    }

    // 4. Title similarity (last resort for exact matches)
    if (config.title && config.title.length > 10) {
      const { data } = await query.eq('title', config.title);
      if (data && data.length > 0) {
        return data[0];
      }
    }

    return null;
  }

  /**
   * Create document record with deduplication
   */
  private async createDocumentRecord(config: {
    title: string;
    docType: DocumentType;
    url?: string | null;
    sourceUrl?: string | null;
    doi?: string | null;
    patentNo?: string | null;
    canonicalUrl?: string | null;
    arxivId?: string | null;
    userId: string;
    processingStatus: string;
  }) {
    // Check for existing document using new schema
    const existingDoc = await this.findExistingDocument({
      title: config.title,
      url: config.canonicalUrl || config.url,
      doi: config.doi,
      patentNo: config.patentNo,
      canonicalUrl: config.canonicalUrl
    });

    if (existingDoc) {
      console.log(`📄 Document already exists: "${config.title}" (ID: ${existingDoc.id})`);
      return existingDoc;
    }

    // Build identifiers JSONB object
    const identifiers: Record<string, string> = {};
    if (config.doi) identifiers.doi = config.doi;
    if (config.patentNo) identifiers.patent_no = config.patentNo;
    if (config.arxivId) identifiers.arxiv_id = config.arxivId;

    // Build dates JSONB object (will be populated during processing)
    const dates: Record<string, string> = {};

    // Create new document with generic schema
    const { data: document, error } = await this.supabaseAdmin
      .from('documents')
      .insert({
        title: config.title,
        doc_type: config.docType,
        url: config.url,
        identifiers,
        dates,
        processing_status: config.processingStatus,
        created_by: config.userId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }

    console.log(`✅ Created new document: "${config.title}" (ID: ${document.id})`);
    return document;
  }

  /**
   * Background processing for single document
   */
  private async processDocumentBackground(
    documentId: string,
    request: SingleIngestionRequest,
    context: ProcessingContext
  ): Promise<void> {
    try {
      const { supabase } = context;
      
      // Update job status
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ 
          status: 'processing', 
          started_at: new Date().toISOString(),
          progress: 0.1,
          progress_message: 'Starting document analysis and content extraction'
        })
        .eq('document_id', documentId);

      let processedContent: string;
      let extractedMetadata: Record<string, unknown> = {};
      let frontmatterMetadata: Record<string, unknown> = {};

      // Step 1: Extract content based on type using enhanced DocumentProcessor
      if (request.fileBuffer) {
        // Check if it's a text-based file (markdown, txt, etc.)
        const fileName = request.fileName || '';
        const isTextFile = fileName.endsWith('.md') || fileName.endsWith('.txt') || fileName.endsWith('.json');
        
        if (isTextFile) {
          // For text-based files, read content directly
          processedContent = request.fileBuffer.toString('utf-8');

          // Parse frontmatter from markdown files
          if (fileName.endsWith('.md')) {
            const frontmatterResult = this.parseFrontmatter(processedContent);
            frontmatterMetadata = frontmatterResult.frontmatter;
            console.log(`✅ Parsed frontmatter metadata:`, Object.keys(frontmatterMetadata));
          }

          extractedMetadata = { fileName };
        } else {
          // For binary files (PDF, etc.) - use enhanced GROBID processing
          const result = await documentProcessor.processDocument({
            type: 'file',
            content: request.fileBuffer,
            metadata: { title: request.title, ...request.metadata }
          });
          processedContent = result?.content || '';
          extractedMetadata = result?.metadata || {};
        }
      } else if (request.content) {
        // Direct markdown content
        processedContent = request.content;

        // Parse frontmatter from markdown content
        const frontmatterResult = this.parseFrontmatter(processedContent);
        frontmatterMetadata = frontmatterResult.frontmatter;
        console.log(`✅ Parsed frontmatter metadata from content:`, Object.keys(frontmatterMetadata));
      } else if (request.patentUrl) {
        // Google Patents URL - use EXA for better extraction
        console.log('Processing patent URL with EXA:', request.patentUrl);
        const result = await documentProcessor.processDocument({
          type: 'url',
          content: request.patentUrl,
          metadata: { title: request.title }
        });
        processedContent = result?.content || '';
        extractedMetadata = result?.metadata || {};
        
        // Fallback to old method if EXA fails
        if (!processedContent || processedContent.length < 500) {
          console.log('EXA failed, falling back to Google Patents extractor');
          const patentData = await extractGooglePatentData(request.patentUrl);
          processedContent = formatPatentContent(patentData);
          extractedMetadata = patentData;
        }
      } else if (request.doi) {
        // DOI/arXiv link processing - detect if it's an ArXiv ID and route accordingly
        const isArxivId = /^\d{4}\.\d{4,5}(?:v\d+)?$/.test(request.doi);
        const processingType = isArxivId ? 'arxiv' : 'doi';

        console.log(`📋 Processing ${processingType} document: ${request.doi}`);

        const result = await documentProcessor.processDocument({
          type: processingType,
          content: request.doi,
          metadata: { title: request.title }
        });
        processedContent = result?.content || '';
        extractedMetadata = result?.metadata || {};
      } else if (request.url) {
        // General URL processing - detect ArXiv URLs and route to enhanced processing
        const isArxivUrl = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/.test(request.url);

        if (isArxivUrl) {
          // Extract ArXiv ID and process as ArXiv document
          const arxivMatch = request.url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
          const arxivId = arxivMatch ? arxivMatch[1] : null;

          console.log(`📋 Detected ArXiv URL, processing as ArXiv document: ${arxivId}`);

          const result = await documentProcessor.processDocument({
            type: 'arxiv',
            content: arxivId,
            metadata: { title: request.title }
          });
          processedContent = result?.content || '';
          extractedMetadata = result?.metadata || {};
        } else {
          // General URL processing
          const result = await documentProcessor.processDocument({
            type: 'url',
            content: request.url,
            metadata: { title: request.title }
          });
          processedContent = result?.content || '';
          extractedMetadata = result?.metadata || {};
        }
      } else {
        throw new Error('No valid content source provided');
      }

      // ENHANCED CONTENT VALIDATION
      // Validate that we actually extracted meaningful content, not just URLs
      const isValidContent = this.validateExtractedContent(processedContent, request);

      if (!isValidContent.isValid) {
        // Mark document and job as failed due to content extraction failure
        await this.supabaseAdmin
          .from('processing_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: isValidContent.reason
          })
          .eq('document_id', documentId);

        await this.supabaseAdmin
          .from('documents')
          .update({
            processing_status: 'failed',
            error_message: isValidContent.reason
          })
          .eq('id', documentId);

        console.error(`❌ Content extraction failed for document ${documentId}: ${isValidContent.reason}`);
        return; // Exit early - don't proceed with chunking
      }

      console.log(`✅ Content validation passed: ${processedContent.length} characters extracted`);

      // If we got here but content is still short, try one more extraction attempt with different strategy
      if (processedContent.length < 1000 && (request.url || request.patentUrl)) {
        console.log(`⚠️ Content is short (${processedContent.length} chars), attempting fallback extraction...`);

        const fallbackContent = await this.attemptFallbackExtraction(request.url || request.patentUrl);
        if (fallbackContent && fallbackContent.length > processedContent.length) {
          console.log(`✅ Fallback extraction improved content: ${fallbackContent.length} chars`);
          processedContent = fallbackContent;
        }
      }

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ 
          progress: 0.3,
          progress_message: 'Content analysis complete, starting document chunking'
        })
        .eq('document_id', documentId);

      // Step 2: Chunk the document using enhanced metadata system
      const { createSemanticChunks } = await import('./semantic-chunking');
      const legacyChunks = await createSemanticChunks(
        processedContent,
        documentId,
        {
          title: request.title || 'Untitled Document',
          docType: request.docType as any,
          ...extractedMetadata
        }
      );

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          progress: 0.4,
          progress_message: `Legacy chunking complete (${legacyChunks.length} chunks), applying enhanced metadata processing`
        })
        .eq('document_id', documentId);

      // Step 3: Enhanced processing with metadata chunks and actors extraction
      console.log(`🔄 Starting enhanced processing with metadata chunks and actors extraction`);

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          progress: 0.4,
          progress_message: `Generating enhanced chunks and extracting actors (${legacyChunks.length} content chunks)`
        })
        .eq('document_id', documentId);

      // Extract actors information from metadata
      const actors = this.extractActors(extractedMetadata, request);

      // Generate metadata chunk for SQL tier fast lookups
      const metadataChunk = this.generateMetadataChunk(extractedMetadata, request, actors);

      // Prepare all chunks (content + metadata)
      const allChunks = [...legacyChunks];
      if (metadataChunk) {
        allChunks.push(metadataChunk);
      }

      // Generate embeddings for all chunks
      const embeddings = await embeddingService.generateEmbeddings(allChunks.map(c => c.content));

      const chunksToInsert = allChunks.map((chunk, index) => ({
        document_id: documentId,
        content: chunk.content,
        content_hash: chunk.content_hash || createHash('md5').update(chunk.content).digest('hex'),
        token_count: chunk.token_count || Math.floor(chunk.content.length / 4),
        chunk_index: chunk.position || index,
        section_title: chunk.metadata?.section_title || null,
        embedding: JSON.stringify(embeddings[index]),
        metadata: chunk.metadata || null,
        tsvector_content: null,
        chunk_type: chunk.chunk_type || 'content'
      }));

      const { error: chunksError } = await this.supabaseAdmin
        .from('document_chunks')
        .insert(chunksToInsert);

      if (chunksError) {
        throw new Error(`Failed to save chunks: ${chunksError.message}`);
      }

      console.log(`✅ Enhanced processing completed: ${legacyChunks.length} content chunks + ${metadataChunk ? 1 : 0} metadata chunk, actors extracted`);

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          progress: 0.7,
          progress_message: 'Embeddings generated, starting entity extraction'
        })
        .eq('document_id', documentId);

      // Step 5: Extract entities and relationships for knowledge graph
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ 
          progress: 0.7,
          progress_message: 'Extracting entities and relationships for knowledge graph'
        })
        .eq('document_id', documentId);

      try {
        // Extract entities and relationships using unified processor
        const { processDocumentEntities } = await import('./entity-extraction');
        await processDocumentEntities(documentId);
        console.log(`✅ Unified entity extraction completed for document: ${request.title}`);
      } catch (error) {
        console.warn(`Unified entity extraction failed for document ${request.title}:`, error);
        // Don't fail the entire ingestion for entity extraction errors
      }

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ 
          progress: 0.95,
          progress_message: 'Knowledge graph updated, finalizing document metadata'
        })
        .eq('document_id', documentId);

      // Step 6: Update document with extracted metadata and actors
      const documentUpdate = await this.buildDocumentUpdate(extractedMetadata, request, actors, frontmatterMetadata);
      await this.supabaseAdmin
        .from('documents')
        .update(documentUpdate)
        .eq('id', documentId);

      // Step 7: Complete the job
      const finalResults = {
        chunksCreated: legacyChunks.length,
        embeddingsGenerated: legacyChunks.length,
        enhancedProcessing: false,
        simpleProcessing: true,
        metadata: extractedMetadata
      };

      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: 1.0,
          progress_message: 'Document ingestion completed successfully - ready for search and chat',
          results: finalResults
        })
        .eq('document_id', documentId);

      console.log(`✅ Document ${documentId} processed successfully with simple processing`);

    } catch (error) {
      console.error(`❌ Document processing failed for ${documentId}:`, error);
      
      // Update job with error
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ 
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('document_id', documentId);

      // Update document status
      await this.supabaseAdmin
        .from('documents')
        .update({
          processing_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Processing failed'
        })
        .eq('id', documentId);
    }
  }

  /**
   * Background processing for batch documents
   */
  private async processBatchBackground(
    batchId: string,
    batchJobId: string,
    request: BatchIngestionRequest,
    context: ProcessingContext
  ): Promise<void> {
    try {
      const { progressTracker } = context;
      
      console.log(`Starting background batch processing for batch ${batchId} with ${request.documents.length} documents`);
      
      // Update batch job status to processing
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          progress: 0.1,
          progress_message: `Starting batch processing for ${request.documents.length} documents`
        })
        .eq('id', batchJobId);

      // Determine if we need sequential processing (for URL extractions)
      const hasUrlDocuments = request.documents.some(doc =>
        doc.metadata?.sourceUrl ||
        doc.metadata?.patentUrl ||
        doc.content?.includes('http') ||
        doc.metadata?.doi
      );

      if (hasUrlDocuments) {
        console.log(`📋 Detected URL documents, processing sequentially to avoid rate limits and 403 errors`);

        // Process sequentially for URL-based documents
        let totalProcessedCount = 0;

        for (const doc of request.documents) {
          try {
            await this.processBatchDocument(doc, context, batchId);
            totalProcessedCount++;

            const progressPercent = totalProcessedCount / request.documents.length;

            // Update batch progress in database for SSE to pick up
            await this.supabaseAdmin
              .from('processing_jobs')
              .update({
                progress: progressPercent * 0.9, // Keep some room for final completion
                progress_message: `Processed ${totalProcessedCount}/${request.documents.length} documents (sequential)`,
                updated_at: new Date().toISOString()
              })
              .eq('id', batchJobId);

            // Update batch progress tracker
            if (progressTracker) {
              await progressTracker.updateProgress(progressPercent);
            }

            console.log(`📊 Sequential progress: ${totalProcessedCount}/${request.documents.length} documents processed (${Math.round(progressPercent * 100)}%)`);

            // Small delay between sequential requests to be respectful to external APIs
            if (totalProcessedCount < request.documents.length) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }

          } catch (error) {
            console.error(`❌ Failed to process document "${doc.title}" in sequential batch:`, error);
            totalProcessedCount++; // Still count as processed to avoid infinite loops
          }
        }
      } else {
        console.log(`📋 No URL documents detected, processing with concurrency limit of 3`);

        // Process documents concurrently but with some limit to avoid overwhelming external APIs
        const concurrencyLimit = 3;
        const batches: BatchDocumentRequest[][] = [];

        for (let i = 0; i < request.documents.length; i += concurrencyLimit) {
          batches.push(request.documents.slice(i, i + concurrencyLimit));
        }

        let totalProcessedCount = 0;

        for (const batch of batches) {
          const results = await Promise.allSettled(
            batch.map(doc => this.processBatchDocument(doc, context, batchId))
          );

          totalProcessedCount += batch.length;
          const progressPercent = totalProcessedCount / request.documents.length;

          // Update batch progress in database for SSE to pick up
          await this.supabaseAdmin
            .from('processing_jobs')
            .update({
              progress: progressPercent * 0.9, // Keep some room for final completion
              progress_message: `Processed ${totalProcessedCount}/${request.documents.length} documents (concurrent)`,
              updated_at: new Date().toISOString()
            })
            .eq('id', batchJobId);

          // Update batch progress tracker
          if (progressTracker) {
            await progressTracker.updateProgress(progressPercent);
          }

          console.log(`📊 Concurrent progress: ${totalProcessedCount}/${request.documents.length} documents processed (${Math.round(progressPercent * 100)}%)`);
        }
      }

      // Mark batch as completed
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: 1.0,
          progress_message: `Batch completed: ${request.documents.length} documents processed`,
          results: {
            totalDocuments: request.documents.length,
            completedDocuments: request.documents.length,
            failedDocuments: 0 // TODO: Track failed documents properly
          }
        })
        .eq('id', batchJobId);
      
      console.log(`✅ Batch processing completed for batch ${batchId}: ${request.documents.length} documents processed`);

      // Send final batch completion notification
      if (progressTracker) {
        await progressTracker.notifyBatchProgress();
      }
      
    } catch (error) {
      console.error(`❌ Batch processing failed for batch ${batchId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single document within a batch
   */
  private async processBatchDocument(
    doc: BatchDocumentRequest,
    context: ProcessingContext,
    batchId: string
  ): Promise<void> {
    try {
      // Create document record
      const document = await this.createDocumentRecord({
        title: doc.title,
        docType: doc.detectedType as DocumentType,
        url: doc.metadata?.patentUrl || doc.url || null,
        sourceUrl: doc.metadata?.sourceUrl || null,
        doi: doc.metadata?.doi || null,
        patentNo: doc.metadata?.patentNumber || null,
        canonicalUrl: doc.metadata?.canonicalUrl || null,
        arxivId: doc.metadata?.arxivId || null,
        userId: context.user.id,
        processingStatus: 'pending'
      });

      // Create processing job
      const job = await this.createProcessingJob({
        type: 'single',
        userId: context.user.id,
        title: doc.title,
        docType: doc.detectedType as DocumentType,
        metadata: {
          ...doc.metadata,
          batchId,
          fileName: doc.metadata?.fileName
        }
      });

      // Update job with document ID
      await this.supabaseAdmin
        .from('processing_jobs')
        .update({ document_id: document.id })
        .eq('id', job.id);

      // Convert BatchDocumentRequest to SingleIngestionRequest
      // ENHANCED: Add file content reading logic (same as single upload)
      let processedContent = doc.content;
      const fileBuffer = doc.fileContent ? Buffer.from(doc.fileContent, 'base64') : undefined;

      // Read text files if we have a buffer and filename (consistent with single upload)
      if (fileBuffer && doc.metadata?.fileName) {
        const fileName = doc.metadata.fileName;
        const isTextFile = fileName.endsWith('.md') ||
                          fileName.endsWith('.txt') ||
                          fileName.endsWith('.markdown') ||
                          fileName.endsWith('.json');

        if (isTextFile && !processedContent) {
          try {
            processedContent = fileBuffer.toString('utf-8');
            console.log(`📄 Batch: Read text file content: ${fileName} (${processedContent.length} characters)`);
          } catch (error) {
            console.warn(`⚠️ Batch: Failed to read text file ${fileName}:`, error);
          }
        }
      }

      const singleRequest: SingleIngestionRequest = {
        type: 'single',
        title: doc.title,
        content: processedContent,
        fileBuffer,
        fileName: doc.metadata?.fileName,
        docType: doc.detectedType as DocumentType,
        url: doc.metadata?.sourceUrl || doc.metadata?.url || null, // FIXED: Check both sourceUrl and url
        patentUrl: doc.metadata?.patentUrl,
        doi: doc.metadata?.doi || (doc.metadata?.isArxiv ? doc.metadata?.arxivId : undefined),
        metadata: doc.metadata,
        userId: context.user.id
      };

      // Process the document
      await this.processDocumentBackground(document.id, singleRequest, context);
      
      console.log(`✅ Batch document processed: ${doc.title}`);
      
    } catch (error) {
      console.error(`❌ Failed to process batch document "${doc.title}":`, error);
      throw error;
    }
  }

  /**
   * Extract actors (people and organizations) from metadata
   */
  private extractActors(
    extractedMetadata: Record<string, unknown>,
    request: SingleIngestionRequest
  ): Record<string, any> {
    const actors: Record<string, any> = {};

    // Extract inventors from patent metadata
    if (extractedMetadata.inventors && Array.isArray(extractedMetadata.inventors)) {
      actors.inventors = extractedMetadata.inventors.map((inventor: any, index: number) => ({
        name: typeof inventor === 'string' ? inventor : inventor.name || inventor.fullName,
        role: 'inventor',
        primary: index === 0, // First inventor is typically primary
        type: 'person'
      })).filter(inv => inv.name);
    }

    // Extract assignees from patent metadata
    if (extractedMetadata.assignees && Array.isArray(extractedMetadata.assignees)) {
      actors.assignees = extractedMetadata.assignees.map((assignee: any) => ({
        name: typeof assignee === 'string' ? assignee : assignee.name,
        role: 'assignee',
        type: 'organization'
      })).filter(assignee => assignee.name);
    } else if (extractedMetadata.assignee) {
      actors.assignees = [{
        name: extractedMetadata.assignee,
        role: 'assignee',
        type: 'organization'
      }];
    }

    // Extract authors from academic papers
    if (extractedMetadata.authors && Array.isArray(extractedMetadata.authors)) {
      actors.authors = extractedMetadata.authors.map((author: any, index: number) => ({
        name: typeof author === 'string' ? author : author.fullName || author.name || `${author.firstName || ''} ${author.surname || ''}`.trim(),
        role: 'author',
        primary: index === 0,
        type: 'person',
        affiliation: author.affiliation || null
      })).filter(author => author.name);
    } else if (extractedMetadata.authorsAffiliations && Array.isArray(extractedMetadata.authorsAffiliations)) {
      actors.authors = extractedMetadata.authorsAffiliations.map((author: any, index: number) => ({
        name: author.name,
        role: 'author',
        primary: index === 0,
        type: 'person',
        affiliation: author.affiliation || null
      })).filter(author => author.name);
    }

    // Extract editors, contributors, etc. for other document types
    if (extractedMetadata.editors && Array.isArray(extractedMetadata.editors)) {
      actors.editors = extractedMetadata.editors.map((editor: any) => ({
        name: typeof editor === 'string' ? editor : editor.name,
        role: 'editor',
        type: 'person'
      })).filter(editor => editor.name);
    }

    console.log(`🎭 Extracted actors:`, {
      inventors: actors.inventors?.length || 0,
      assignees: actors.assignees?.length || 0,
      authors: actors.authors?.length || 0,
      editors: actors.editors?.length || 0
    });

    return actors;
  }

  /**
   * Generate metadata chunk for SQL tier fast lookups
   */
  private generateMetadataChunk(
    extractedMetadata: Record<string, unknown>,
    request: SingleIngestionRequest,
    actors: Record<string, any>
  ): any | null {
    const title = extractedMetadata.title || request.title || 'Untitled Document';

    // Build metadata content for searchable chunk
    const metadataLines = [`**Document**: ${title}`];

    // Add document type and identifiers
    if (extractedMetadata.patentNumber) {
      metadataLines.push(`**Patent Number**: ${extractedMetadata.patentNumber}`);
    }
    if (extractedMetadata.doi) {
      metadataLines.push(`**DOI**: ${extractedMetadata.doi}`);
    }
    if (extractedMetadata.arxivId) {
      metadataLines.push(`**ArXiv ID**: ${extractedMetadata.arxivId}`);
    }

    // Add actors information
    if (actors.inventors?.length > 0) {
      const inventorNames = actors.inventors.map((inv: any) => inv.name).join(', ');
      metadataLines.push(`**Inventors**: ${inventorNames}`);
    }
    if (actors.assignees?.length > 0) {
      const assigneeNames = actors.assignees.map((assignee: any) => assignee.name).join(', ');
      metadataLines.push(`**Assignees**: ${assigneeNames}`);
    }
    if (actors.authors?.length > 0) {
      const authorNames = actors.authors.map((author: any) => author.name).join(', ');
      metadataLines.push(`**Authors**: ${authorNames}`);
    }

    // Add dates
    if (extractedMetadata.filingDate || extractedMetadata.filed_date) {
      metadataLines.push(`**Filed**: ${extractedMetadata.filingDate || extractedMetadata.filed_date}`);
    }
    if (extractedMetadata.grantDate || extractedMetadata.granted_date) {
      metadataLines.push(`**Granted**: ${extractedMetadata.grantDate || extractedMetadata.granted_date}`);
    }
    if (extractedMetadata.publishedDate || extractedMetadata.published_date) {
      metadataLines.push(`**Published**: ${extractedMetadata.publishedDate || extractedMetadata.published_date}`);
    }

    // Add abstract if available
    if (extractedMetadata.abstract) {
      metadataLines.push(`**Abstract**: ${extractedMetadata.abstract}`);
    }

    if (metadataLines.length <= 1) {
      return null; // No meaningful metadata to create chunk
    }

    const content = metadataLines.join('\n');

    return {
      content,
      content_hash: createHash('md5').update(content).digest('hex'),
      token_count: Math.floor(content.length / 4),
      chunk_type: 'metadata',
      metadata: {
        type: 'metadata_chunk',
        actors_count: Object.values(actors).reduce((total, actorList) =>
          total + (Array.isArray(actorList) ? actorList.length : 0), 0),
        created_at: new Date().toISOString()
      }
    };
  }

  /**
   * Build document update object from frontmatter and extracted metadata using new generic schema
   * Prioritizes frontmatter over extracted metadata
   */
  private async buildDocumentUpdate(
    extractedMetadata: Record<string, unknown>,
    request: SingleIngestionRequest,
    actors?: Record<string, any>,
    frontmatterMetadata?: Record<string, unknown>
  ): Promise<Record<string, any>> {
    const documentUpdate: Record<string, any> = {
      processing_status: 'completed',
      processed_at: new Date().toISOString()
    };

    // Update document title - prioritize frontmatter over extraction
    if (frontmatterMetadata?.title && typeof frontmatterMetadata.title === 'string' && frontmatterMetadata.title.trim().length > 0) {
      documentUpdate.title = frontmatterMetadata.title.trim();
      console.log(`✅ Using document title from frontmatter: "${frontmatterMetadata.title}"`);
    } else if (extractedMetadata.title &&
        typeof extractedMetadata.title === 'string' &&
        extractedMetadata.title !== 'Untitled' &&
        extractedMetadata.title !== 'PDF-1.5' &&
        extractedMetadata.title.trim().length > 0) {
      documentUpdate.title = extractedMetadata.title.trim();
      console.log(`✅ Using document title from extraction: "${extractedMetadata.title}"`);
    }

    // Build identifiers JSONB object - prioritize frontmatter
    const identifiers: Record<string, any> = {};

    // First, extract identifiers from frontmatter
    if (frontmatterMetadata) {
      if (frontmatterMetadata.doi && typeof frontmatterMetadata.doi === 'string') {
        identifiers.doi = frontmatterMetadata.doi;
      }
      if (frontmatterMetadata.arxiv_id && typeof frontmatterMetadata.arxiv_id === 'string') {
        identifiers.arxiv_id = frontmatterMetadata.arxiv_id;
      }
      if (frontmatterMetadata.patent_no && typeof frontmatterMetadata.patent_no === 'string') {
        identifiers.patent_no = frontmatterMetadata.patent_no;
      }
      if (frontmatterMetadata.application_no && typeof frontmatterMetadata.application_no === 'string') {
        identifiers.application_no = frontmatterMetadata.application_no;
      }
      if (frontmatterMetadata.publication_no && typeof frontmatterMetadata.publication_no === 'string') {
        identifiers.publication_no = frontmatterMetadata.publication_no;
      }
      if (frontmatterMetadata.url && typeof frontmatterMetadata.url === 'string') {
        identifiers.url = frontmatterMetadata.url;
      }
    }

    // Add identifiers based on document type and extracted metadata (fallback)
    if (extractedMetadata.doi && typeof extractedMetadata.doi === 'string') {
      identifiers.doi = extractedMetadata.doi;
    }
    if (extractedMetadata.arxivId && typeof extractedMetadata.arxivId === 'string') {
      identifiers.arxiv_id = extractedMetadata.arxivId;
    }
    if (extractedMetadata.patentNumber && typeof extractedMetadata.patentNumber === 'string') {
      identifiers.patent_no = extractedMetadata.patentNumber;
    }
    if (extractedMetadata.applicationNumber && typeof extractedMetadata.applicationNumber === 'string') {
      identifiers.application_no = extractedMetadata.applicationNumber;
    }
    if (extractedMetadata.publicationNumber && typeof extractedMetadata.publicationNumber === 'string') {
      identifiers.publication_no = extractedMetadata.publicationNumber;
    }

    // Build dates JSONB object - prioritize frontmatter
    const dates: Record<string, any> = {};

    // First, extract dates from frontmatter
    if (frontmatterMetadata) {
      if (frontmatterMetadata.published_date && typeof frontmatterMetadata.published_date === 'string') {
        dates.published = frontmatterMetadata.published_date;
      }
      if (frontmatterMetadata.filed_date && typeof frontmatterMetadata.filed_date === 'string') {
        dates.filed = frontmatterMetadata.filed_date;
      }
      if (frontmatterMetadata.granted_date && typeof frontmatterMetadata.granted_date === 'string') {
        dates.granted = frontmatterMetadata.granted_date;
      }
      if (frontmatterMetadata.priority_date && typeof frontmatterMetadata.priority_date === 'string') {
        dates.priority = frontmatterMetadata.priority_date;
      }
      if (frontmatterMetadata.expires_date && typeof frontmatterMetadata.expires_date === 'string') {
        dates.expires = frontmatterMetadata.expires_date;
      }
    }

    // Fallback to extracted dates if not in frontmatter
    if (!dates.filed && (extractedMetadata.filingDate || extractedMetadata.filed_date)) {
      dates.filed = extractedMetadata.filingDate || extractedMetadata.filed_date;
    }
    if (!dates.granted && (extractedMetadata.grantDate || extractedMetadata.granted_date)) {
      dates.granted = extractedMetadata.grantDate || extractedMetadata.granted_date;
    }
    if (!dates.published && (extractedMetadata.publicationDate || extractedMetadata.published_date)) {
      dates.published = extractedMetadata.publicationDate || extractedMetadata.published_date;
    }
    if (!dates.priority && extractedMetadata.priorityDate) {
      dates.priority = extractedMetadata.priorityDate;
    }
    if (extractedMetadata.expirationDate) {
      dates.expires = extractedMetadata.expirationDate;
    } else if (dates.filed) {
      // Calculate expiration date if not found - patents typically expire 20 years from filing
      const filingDate = new Date(dates.filed);
      if (!isNaN(filingDate.getTime())) {
        const expirationDate = new Date(filingDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 20);
        dates.expires = expirationDate.toISOString().split('T')[0];
        console.log('📊 Calculated patent expiration from filing date (20 years):', dates.expires);
      }
    }

    // For academic papers, add publication year
    if (extractedMetadata.year) {
      const year = typeof extractedMetadata.year === 'number' ?
        extractedMetadata.year :
        parseInt(extractedMetadata.year as string, 10);

      if (!isNaN(year) && year > 1900 && year < 2100) {
        dates.published = `${year}-01-01`;
        console.log(`✅ Set publication year: ${year}`);
      }
    }

    // Build actors from frontmatter if available
    let finalActors = actors || {};
    if (frontmatterMetadata) {
      const frontmatterActors: Record<string, any> = {};

      // Map common frontmatter fields to actors
      if (frontmatterMetadata.inventor && Array.isArray(frontmatterMetadata.inventor)) {
        frontmatterActors.inventors = frontmatterMetadata.inventor;
      }
      if (frontmatterMetadata.assignee && Array.isArray(frontmatterMetadata.assignee)) {
        frontmatterActors.assignees = frontmatterMetadata.assignee;
      }
      if (frontmatterMetadata.author && Array.isArray(frontmatterMetadata.author)) {
        frontmatterActors.authors = frontmatterMetadata.author;
      }
      if (frontmatterMetadata.journalist && Array.isArray(frontmatterMetadata.journalist)) {
        frontmatterActors.journalists = frontmatterMetadata.journalist;
      }
      if (frontmatterMetadata.oem && Array.isArray(frontmatterMetadata.oem)) {
        frontmatterActors.companies = frontmatterMetadata.oem;
      }

      // Merge frontmatter actors with extracted actors (frontmatter takes priority)
      finalActors = { ...finalActors, ...frontmatterActors };
    }

    // Update identifiers, dates, and actors if we have any
    if (Object.keys(identifiers).length > 0) {
      documentUpdate.identifiers = identifiers;
    }
    if (Object.keys(dates).length > 0) {
      documentUpdate.dates = dates;
    }
    if (finalActors && Object.keys(finalActors).length > 0) {
      documentUpdate.actors = finalActors;
    }

    console.log(`✅ Updated document metadata with frontmatter priority:`, {
      identifiers: Object.keys(identifiers),
      dates: Object.keys(dates),
      actors: finalActors ? Object.keys(finalActors) : [],
      hasTitle: !!documentUpdate.title,
      frontmatterFields: frontmatterMetadata ? Object.keys(frontmatterMetadata) : []
    });

    return documentUpdate;
  }

  /**
   * Validate batch request
   */
  private validateBatchRequest(request: BatchIngestionRequest): void {
    if (!request.documents || !Array.isArray(request.documents) || request.documents.length === 0) {
      throw new Error('Documents array is required');
    }

    if (request.documents.length > 100) {
      throw new Error('Maximum 100 documents per batch');
    }

    for (const doc of request.documents) {
      if (!doc.content && !doc.fileContent && !doc.fileKey && 
          !doc.metadata?.doi && !doc.metadata?.patentUrl) {
        throw new Error('Each document must have content, file content, file upload, or a URL/DOI');
      }
    }
  }

  /**
   * Extract patent number from URL
   */
  private extractPatentNumber(patentUrl: string): string | null {
    const match = patentUrl.match(/([A-Z]{2}\d+[A-Z]\d)/);
    return match ? match[1] : null;
  }

  /**
   * Validate environment setup for required API keys
   */
  private validateEnvironment(request: SingleIngestionRequest | BatchIngestionRequest): {
    isValid: boolean;
    error?: string;
  } {
    const requiredKeys: string[] = [];
    const missingKeys: string[] = [];

    // Check if EXA API is needed
    const needsExa = this.requiresExaApi(request);
    if (needsExa) {
      requiredKeys.push('EXA_API_KEY');
      if (!process.env.EXA_API_KEY) {
        missingKeys.push('EXA_API_KEY');
      }
    }

    // OpenAI is always required for embeddings
    requiredKeys.push('OPENAI_API_KEY');
    if (!process.env.OPENAI_API_KEY) {
      missingKeys.push('OPENAI_API_KEY');
    }

    if (missingKeys.length > 0) {
      return {
        isValid: false,
        error: `Missing required environment variables: ${missingKeys.join(', ')}. Please set these in your .env.local file.`
      };
    }

    console.log(`✅ Environment validation passed. Required keys: ${requiredKeys.join(', ')}`);
    return { isValid: true };
  }

  /**
   * Check if request requires EXA API
   */
  private requiresExaApi(request: SingleIngestionRequest | BatchIngestionRequest): boolean {
    if (request.type === 'single') {
      // Check for patent URLs, DOIs, or general URLs
      return !!(request.patentUrl || request.doi || request.url);
    } else {
      // Check batch documents
      return request.documents.some(doc => 
        doc.metadata?.patentUrl || 
        doc.metadata?.doi || 
        doc.content?.includes('http') ||
        (doc.metadata?.fileName?.endsWith('.md') && doc.content) // Markdown files might contain URL lists
      );
    }
  }

  /**
   * Validate that extracted content is meaningful and not just URLs
   */
  private validateExtractedContent(
    content: string,
    request: SingleIngestionRequest
  ): { isValid: boolean; reason?: string } {
    // Basic content checks
    if (!content || content.trim().length === 0) {
      return { isValid: false, reason: 'No content extracted from source' };
    }

    // Check if content is just a URL (common failure case)
    const urlRegex = /^https?:\/\/[^\s]+$/;
    if (urlRegex.test(content.trim())) {
      return {
        isValid: false,
        reason: `Content extraction failed: only URL returned (${content.trim()})`
      };
    }

    // Check for minimum content length (more lenient for text files)
    const isTextFile = request.fileName?.endsWith('.md') ||
                      request.fileName?.endsWith('.txt') ||
                      request.content; // Direct content input

    const minLength = isTextFile ? 100 : 500; // Text files can be shorter

    if (content.length < minLength) {
      return {
        isValid: false,
        reason: `Content too short: ${content.length} chars (minimum ${minLength} required)`
      };
    }

    // Check for typical extraction failure patterns
    const failurePatterns = [
      /^Error:/i,
      /^Failed to/i,
      /^Cannot access/i,
      /^403 Forbidden/i,
      /^404 Not Found/i,
      /^Access denied/i,
    ];

    for (const pattern of failurePatterns) {
      if (pattern.test(content)) {
        return {
          isValid: false,
          reason: `Content extraction error detected: ${content.substring(0, 100)}...`
        };
      }
    }

    // Content appears valid
    return { isValid: true };
  }

  /**
   * Attempt fallback content extraction using different strategies
   */
  private async attemptFallbackExtraction(url: string): Promise<string | null> {
    try {
      console.log(`🔄 Attempting fallback extraction for: ${url}`);

      // Strategy 1: Try basic web scraping if it's a public URL
      if (url.startsWith('http')) {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000 // 10 second timeout
          } as any);

          if (response.ok) {
            const html = await response.text();

            // Basic HTML content extraction (remove scripts, styles, etc.)
            const cleanText = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (cleanText.length > 1000) {
              console.log(`✅ Fallback web scraping successful: ${cleanText.length} chars`);
              return cleanText;
            }
          }
        } catch (error) {
          console.log(`❌ Fallback web scraping failed: ${error.message}`);
        }
      }

      // Strategy 2: For DOI links, try different API approaches
      if (url.includes('doi.org') || url.includes('dx.doi.org')) {
        try {
          const doiMatch = url.match(/doi\.org\/(.+)/) || url.match(/dx\.doi\.org\/(.+)/);
          if (doiMatch) {
            const { CrossrefClient } = await import('./document-processors');
            const crossref = new CrossrefClient();
            const metadata = await crossref.resolveDOI(doiMatch[1]);

            if (metadata?.abstract && metadata.abstract.length > 200) {
              console.log(`✅ Fallback DOI extraction successful via Crossref`);
              return `${metadata.title}\n\n${metadata.abstract}`;
            }
          }
        } catch (error) {
          console.log(`❌ Fallback DOI extraction failed: ${error.message}`);
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ All fallback extraction strategies failed for ${url}:`, error);
      return null;
    }
  }


  /**
   * Parse frontmatter from markdown content
   */
  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    content: string;
    hasFrontmatter: boolean;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        content: content,
        hasFrontmatter: false
      };
    }

    try {
      // Use js-yaml to parse the frontmatter
      const yaml = require('js-yaml');
      const frontmatter = yaml.load(match[1]) as any;
      return {
        frontmatter: frontmatter || {},
        content: match[2],
        hasFrontmatter: true
      };
    } catch (error) {
      console.error('Failed to parse frontmatter YAML:', error);
      return {
        frontmatter: {},
        content: content,
        hasFrontmatter: false
      };
    }
  }
}

// Export singleton instance
export const unifiedIngestionService = new UnifiedIngestionService();