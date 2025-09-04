import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { processDocument } from '@/lib/rag/document-processors';
import { chunkDocument } from '@/lib/rag/chunking';
import { generateEmbeddings } from '@/lib/rag/embeddings';
import { extractGooglePatentData as extractPatentData, formatPatentContent } from '@/lib/rag/google-patents-extractor';
import type { DocumentType } from '@/lib/rag/types';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Check user role - only admin can ingest documents
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

    const body = await req.json();
    const { 
      title, 
      content, 
      docType, 
      url, 
      patentUrl,
      doi,
      metadata = {} 
    } = body;

    // Validation
    if (!title?.trim()) {
      throw new AppError('Title is required', 400);
    }

    if (!content && !url && !patentUrl && !doi) {
      throw new AppError('Content, URL, patent URL, or DOI is required', 400);
    }

    if (!docType) {
      throw new AppError('Document type is required', 400);
    }

    // Create processing job
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        type: 'document_ingest',
        user_id: user.id,
        priority: 1,
        config: {
          title,
          docType,
          url,
          patentUrl,
          doi,
          metadata
        }
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create processing job:', jobError);
      throw new AppError('Failed to create processing job', 500);
    }

    // Create document record
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        title: title.trim(),
        doc_type: docType as DocumentType,
        url: url || patentUrl || (doi ? `https://doi.org/${doi}` : null),
        doi: doi || null,
        patent_no: patentUrl ? extractPatentNumber(patentUrl) : null,
        processing_status: 'pending',
        created_by: user.id
      })
      .select()
      .single();

    if (docError) {
      console.error('Failed to create document:', docError);
      throw new AppError('Failed to create document', 500);
    }

    // Update job with document ID
    await supabase
      .from('processing_jobs')
      .update({ document_id: document.id })
      .eq('id', job.id);

    // Process document in background
    processDocumentBackground(document.id, { title, content, docType, url, patentUrl, doi, metadata });

    return NextResponse.json({ 
      document,
      jobId: job.id,
      message: 'Document ingestion started. Processing in background.'
    }, { status: 201 });

  } catch (error) {
    return handleApiError(error);
  }
}

// Background processing function (fire and forget)
async function processDocumentBackground(
  documentId: string, 
  config: any
) {
  try {
    const supabase = await createClient();
    
    // Update job status
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'processing', 
        started_at: new Date().toISOString(),
        progress: 0.1,
        progress_message: 'Starting document processing'
      })
      .eq('document_id', documentId);

    let processedContent: string;
    let extractedMetadata: any = {};

    // Step 1: Extract content based on type
    if (config.content) {
      // Direct markdown content
      processedContent = config.content;
    } else if (config.patentUrl) {
      // Google Patents URL - extract via JSON-LD
      const patentData = await extractPatentData(config.patentUrl);
      processedContent = formatPatentContent(patentData);
      extractedMetadata = patentData;
    } else if (config.doi) {
      // DOI/arXiv link processing
      const metadata = await processDocument(config.doi, 'paper');
      processedContent = metadata.content || '';
      extractedMetadata = metadata;
    } else if (config.url) {
      // General URL processing
      const response = await fetch(config.url);
      processedContent = await response.text();
    } else {
      throw new Error('No valid content source provided');
    }

    await supabase
      .from('processing_jobs')
      .update({ 
        progress: 0.3,
        progress_message: 'Content extracted, starting chunking'
      })
      .eq('document_id', documentId);

    // Step 2: Chunk the document
    const chunks = await chunkDocument(processedContent, {
      title: config.title,
      documentId,
      metadata: extractedMetadata
    });

    await supabase
      .from('processing_jobs')
      .update({ 
        progress: 0.5,
        progress_message: `Created ${chunks.length} chunks, generating embeddings`
      })
      .eq('document_id', documentId);

    // Step 3: Generate embeddings for chunks
    const embeddings = await generateEmbeddings(chunks.map(c => c.content));

    // Step 4: Save chunks with embeddings to database
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

    await supabase
      .from('processing_jobs')
      .update({ 
        progress: 0.8,
        progress_message: 'Chunks saved, updating document metadata'
      })
      .eq('document_id', documentId);

    // Step 5: Update document with extracted metadata
    await supabase
      .from('documents')
      .update({
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        ...extractedMetadata
      })
      .eq('id', documentId);

    // Step 6: Complete the job
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
          metadata: extractedMetadata
        }
      })
      .eq('document_id', documentId);

    console.log(`✅ Document ${documentId} processed successfully: ${chunks.length} chunks created`);

  } catch (error) {
    console.error(`❌ Document processing failed for ${documentId}:`, error);
    
    // Update job with error
    const supabase = await createClient();
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('document_id', documentId);

    // Update document status
    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq('id', documentId);
  }
}

// Helper functions
function extractPatentNumber(patentUrl: string): string | null {
  // Extract patent number from Google Patents URL
  const match = patentUrl.match(/patent\/([A-Z]{2}\d+[A-Z]\d+)/);
  return match ? match[1] : null;
}

// formatPatentContent is now imported from google-patents-extractor

function createHash(algorithm: string) {
  const crypto = require('crypto');
  return crypto.createHash(algorithm);
}