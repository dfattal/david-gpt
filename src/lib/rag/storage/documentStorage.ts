/**
 * Document Storage Utility
 * Handles storing extracted documents in database before ingestion
 */

import { createClient } from '@/lib/supabase/server';
import matter from 'gray-matter';
import crypto from 'crypto';

export interface ExtractedDocument {
  markdown: string;
  personaSlug: string;
  filename: string;
  extractionMetadata?: {
    documentType?: string;
    totalPages?: number;
    totalChunks?: number;
    originalChars?: number;
    formattedChars?: number;
    retentionRatio?: number;
    [key: string]: any;
  };
}

export interface StoredDocumentResult {
  success: boolean;
  docId?: string;
  title?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Store an extracted document in the database (without ingestion)
 * Creates records in: docs, document_files, and storage bucket
 */
export async function storeExtractedDocument(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  document: ExtractedDocument
): Promise<StoredDocumentResult> {
  try {
    const { markdown, personaSlug, filename, extractionMetadata } = document;

    // Parse frontmatter to get metadata
    const { data: frontmatter, content: bodyContent } = matter(markdown);
    const docId = frontmatter.id;

    if (!docId) {
      return {
        success: false,
        error: 'Document ID not found in frontmatter',
      };
    }

    // Calculate content hash and size
    const contentHash = crypto
      .createHash('sha256')
      .update(markdown)
      .digest('hex');
    const fileSize = new Blob([markdown]).size;

    // Upload to Supabase Storage
    const storagePath = `${personaSlug}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('formatted-documents')
      .upload(storagePath, markdown, {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return {
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
      };
    }

    // Create or update docs record (status: 'extracted', not ingested yet)
    const { error: docsError } = await supabase.from('docs').upsert(
      {
        id: docId,
        title: frontmatter.title || docId,
        type: frontmatter.type || 'document',
        personas: [personaSlug],
        date: frontmatter.date || null,
        source_url: frontmatter.source_url || null,
        tags: frontmatter.tags || [],
        summary: frontmatter.summary || null,
        license: frontmatter.license || null,
        identifiers: frontmatter.identifiers || {},
        dates_structured: frontmatter.dates || {},
        actors: frontmatter.actors || [],
        raw_content: markdown,
        ingestion_status: 'extracted', // Mark as extracted, not ingested
        extraction_metadata: extractionMetadata || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (docsError) {
      console.error('Database insert error:', docsError);
      // Clean up uploaded file
      await supabase.storage
        .from('formatted-documents')
        .remove([storagePath]);

      return {
        success: false,
        error: `Database error: ${docsError.message}`,
      };
    }

    // Create or update document_files record
    const { error: filesError } = await supabase.from('document_files').upsert(
      {
        doc_id: docId,
        persona_slug: personaSlug,
        storage_path: storagePath,
        file_size: fileSize,
        content_hash: contentHash,
        uploaded_by: userId,
      },
      { onConflict: 'storage_path' }
    );

    if (filesError) {
      console.error('Document files error:', filesError);
      // Continue anyway - docs record is the source of truth
    }

    console.log(`✅ Stored extracted document: ${docId} (status: extracted)`);

    return {
      success: true,
      docId,
      title: frontmatter.title || docId,
      storagePath,
    };
  } catch (error) {
    console.error('Error storing extracted document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Store multiple extracted documents in batch
 */
export async function storeBatchExtractedDocuments(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  documents: ExtractedDocument[]
): Promise<StoredDocumentResult[]> {
  const results: StoredDocumentResult[] = [];

  for (const doc of documents) {
    const result = await storeExtractedDocument(supabase, userId, doc);
    results.push(result);
  }

  return results;
}

/**
 * Update document ingestion status
 */
export async function updateDocumentIngestionStatus(
  supabase: ReturnType<typeof createClient>,
  docId: string,
  status: 'extracted' | 'ingested' | 'failed',
  error?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {
      ingestion_status: status,
      updated_at: new Date().toISOString(),
    };

    if (error && status === 'failed') {
      updateData.extraction_metadata = {
        error,
        failedAt: new Date().toISOString(),
      };
    }

    const { error: updateError } = await supabase
      .from('docs')
      .update(updateData)
      .eq('id', docId);

    if (updateError) {
      console.error('Failed to update ingestion status:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating ingestion status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
