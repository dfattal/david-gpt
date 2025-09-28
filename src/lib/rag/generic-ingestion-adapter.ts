/**
 * Generic Ingestion Adapter
 *
 * Adapts the existing ingestion service to use the new generic metadata schema
 * and rich metadata chunk generation system.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenericDocumentMetadata } from './document-type-registry';
import {
  getDocumentType,
  extractStructuredMetadata,
  validateDocumentMetadata,
} from './document-type-registry';
import { generateMetadataChunk } from './rich-metadata-chunks';
import type { DocumentMetadata, DocumentType } from './types';

// =======================
// Migration Helpers
// =======================

/**
 * Convert legacy document metadata to generic format
 */
export function convertToGenericMetadata(
  legacyMetadata: DocumentMetadata,
  docType: string
): GenericDocumentMetadata {
  const identifiers: Record<string, string> = {};
  const dates: Record<string, string> = {};

  // Map legacy fields to generic identifiers
  if (legacyMetadata.patentNumber)
    identifiers.patent_no = legacyMetadata.patentNumber;
  if (legacyMetadata.publicationNumber)
    identifiers.publication_no = legacyMetadata.publicationNumber;
  if (legacyMetadata.applicationNumber)
    identifiers.application_no = legacyMetadata.applicationNumber;
  if (legacyMetadata.doi) identifiers.doi = legacyMetadata.doi;
  if (legacyMetadata.arxivId) identifiers.arxiv_id = legacyMetadata.arxivId;
  if (legacyMetadata.url) identifiers.url = legacyMetadata.url;

  // Map legacy dates to generic format
  if (legacyMetadata.filedDate)
    dates.filed = legacyMetadata.filedDate.toISOString().split('T')[0];
  if (legacyMetadata.grantedDate)
    dates.granted = legacyMetadata.grantedDate.toISOString().split('T')[0];
  if (legacyMetadata.publishedDate)
    dates.published = legacyMetadata.publishedDate.toISOString().split('T')[0];
  if (legacyMetadata.priorityDate)
    dates.priority = legacyMetadata.priorityDate.toISOString().split('T')[0];
  if (legacyMetadata.expirationDate)
    dates.expires = legacyMetadata.expirationDate.toISOString().split('T')[0];

  return {
    id: legacyMetadata.id || '',
    title: legacyMetadata.title || 'Untitled',
    docType,
    identifiers,
    dates,

    // Rich metadata fields (preserved from legacy)
    inventors: legacyMetadata.inventors,
    assignees: legacyMetadata.assignee ? [legacyMetadata.assignee] : undefined,
    originalAssignee: legacyMetadata.assignee,
    authorsAffiliations: legacyMetadata.authors,
    venue: legacyMetadata.venue,
    publicationYear: legacyMetadata.publishedDate?.getFullYear(),
    keywords: legacyMetadata.keywords,
    citationCount: legacyMetadata.citationCount,
    abstract: legacyMetadata.abstract,
    classification: legacyMetadata.classification,
    jurisdiction: legacyMetadata.jurisdiction,
    authority: legacyMetadata.authority,
    claimCount: legacyMetadata.claimCount,
    independentClaimCount: legacyMetadata.independentClaimCount,
    patentStatus: legacyMetadata.status,

    // System metadata
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Build document update object using new generic schema
 */
export function buildGenericDocumentUpdate(
  metadata: GenericDocumentMetadata,
  legacyFields?: Record<string, any>
): Record<string, any> {
  const { identifiers, dates, richMetadata } =
    extractStructuredMetadata(metadata);

  const update: Record<string, any> = {
    title: metadata.title,
    doc_type: metadata.docType,
    identifiers,
    dates,
    updated_at: new Date().toISOString(),
  };

  // Preserve rich metadata fields for backward compatibility
  // These will eventually be moved to dedicated metadata chunks
  if (metadata.inventors) update.inventors = metadata.inventors;
  if (metadata.assignees) update.assignees = metadata.assignees;
  if (metadata.originalAssignee)
    update.original_assignee = metadata.originalAssignee;
  if (metadata.authorsAffiliations)
    update.authors_affiliations = metadata.authorsAffiliations;
  if (metadata.venue) update.venue = metadata.venue;
  if (metadata.publicationYear)
    update.publication_year = metadata.publicationYear;
  if (metadata.keywords) update.keywords = metadata.keywords;
  if (metadata.citationCount) update.citation_count = metadata.citationCount;
  if (metadata.abstract) update.abstract = metadata.abstract;
  if (metadata.classification) update.classification = metadata.classification;
  if (metadata.jurisdiction) update.jurisdiction = metadata.jurisdiction;
  if (metadata.authority) update.authority = metadata.authority;
  if (metadata.claimCount) update.claim_count = metadata.claimCount;
  if (metadata.independentClaimCount)
    update.independent_claim_count = metadata.independentClaimCount;
  if (metadata.patentStatus) update.patent_status = metadata.patentStatus;

  // Merge any additional legacy fields
  if (legacyFields) {
    Object.assign(update, legacyFields);
  }

  return update;
}

/**
 * Enhanced chunk generation that includes metadata chunks
 */
export async function generateEnhancedChunks(
  content: string,
  documentId: string,
  metadata: GenericDocumentMetadata,
  legacyChunks: any[]
): Promise<{
  contentChunks: any[];
  metadataChunk: any | null;
  totalChunks: number;
}> {
  // Remove metadata injection from content chunks (clean separation)
  const contentChunks = legacyChunks.map(chunk => ({
    ...chunk,
    chunk_type: 'content',
    // Remove any injected metadata from content
    content: removeInjectedMetadata(chunk.content),
  }));

  // Generate rich metadata chunk
  const metadataChunkData = generateMetadataChunk(metadata, {
    includeContext: true,
    includeRelationships: false, // Can be enabled later
  });

  let metadataChunk = null;
  if (metadataChunkData) {
    metadataChunk = {
      document_id: documentId,
      content: metadataChunkData.content,
      content_hash: generateContentHash(metadataChunkData.content),
      token_count: metadataChunkData.tokenCount,
      chunk_index: -1, // Special index for metadata chunks
      chunk_type: 'metadata',
      section_title: `${getDocumentType(metadata.docType)?.name || metadata.docType} Metadata`,
      metadata: {
        section_type: metadataChunkData.sectionType,
        ...metadataChunkData.metadata,
      },
    };
  }

  return {
    contentChunks,
    metadataChunk,
    totalChunks: contentChunks.length + (metadataChunk ? 1 : 0),
  };
}

/**
 * Insert enhanced chunks (content + metadata) into database
 */
export async function insertEnhancedChunks(
  supabase: SupabaseClient,
  contentChunks: any[],
  metadataChunk: any | null,
  embeddings: number[][]
): Promise<void> {
  const allChunksToInsert: any[] = [];

  // Add content chunks with embeddings
  contentChunks.forEach((chunk, index) => {
    allChunksToInsert.push({
      ...chunk,
      embedding: JSON.stringify(embeddings[index]),
      tsvector_content: null, // Generated by database trigger
    });
  });

  // Add metadata chunk with embedding (if exists)
  if (metadataChunk && embeddings.length > contentChunks.length) {
    const metadataEmbedding = embeddings[embeddings.length - 1];
    allChunksToInsert.push({
      ...metadataChunk,
      embedding: JSON.stringify(metadataEmbedding),
      tsvector_content: null, // Generated by database trigger
    });
  }

  // Insert all chunks in a single transaction
  const { error } = await supabase
    .from('document_chunks')
    .insert(allChunksToInsert);

  if (error) {
    throw new Error(`Failed to insert enhanced chunks: ${error.message}`);
  }
}

/**
 * Generate embeddings for content + metadata chunks
 */
export async function generateEnhancedEmbeddings(
  contentChunks: any[],
  metadataChunk: any | null,
  embeddingService: any
): Promise<number[][]> {
  const textsToEmbed: string[] = contentChunks.map(chunk => chunk.content);

  // Add metadata chunk content for embedding
  if (metadataChunk) {
    textsToEmbed.push(metadataChunk.content);
  }

  return await embeddingService.generateEmbeddings(textsToEmbed);
}

/**
 * Validate and prepare document for generic ingestion
 */
export function validateGenericDocument(metadata: GenericDocumentMetadata): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const validation = validateDocumentMetadata(metadata.docType, metadata);
  const warnings: string[] = [];

  // Additional validation for ingestion
  if (!metadata.title || metadata.title.trim().length === 0) {
    validation.errors.push('Document title is required');
  }

  if (Object.keys(metadata.identifiers).length === 0) {
    warnings.push(
      'No document identifiers provided - may affect searchability'
    );
  }

  if (Object.keys(metadata.dates).length === 0) {
    warnings.push('No date information provided - may affect timeline queries');
  }

  // Document type specific warnings
  const docType = getDocumentType(metadata.docType);
  if (docType) {
    const missingIdentifiers = docType.identifierFields.filter(
      field => !metadata.identifiers[field]
    );

    if (missingIdentifiers.length > 0) {
      warnings.push(
        `Missing recommended identifiers for ${docType.name}: ${missingIdentifiers.join(', ')}`
      );
    }

    const missingDates = docType.dateFields.filter(
      field => !metadata.dates[field]
    );

    if (missingDates.length > 0) {
      warnings.push(
        `Missing recommended dates for ${docType.name}: ${missingDates.join(', ')}`
      );
    }
  }

  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings,
  };
}

/**
 * Migration helper: Update existing documents to use generic schema
 */
export async function migrateDocumentToGeneric(
  supabase: SupabaseClient,
  documentId: string
): Promise<{ success: boolean; errors: string[] }> {
  try {
    // Fetch existing document
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      return {
        success: false,
        errors: [`Failed to fetch document: ${fetchError?.message}`],
      };
    }

    // Convert to generic format
    const genericMetadata = convertToGenericMetadata(
      document as any,
      document.doc_type
    );

    // Validate conversion
    const validation = validateGenericDocument(genericMetadata);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Update document with new schema
    const updateData = buildGenericDocumentUpdate(genericMetadata);
    const { error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    if (updateError) {
      return {
        success: false,
        errors: [`Failed to update document: ${updateError.message}`],
      };
    }

    // Generate and insert metadata chunk if needed
    const metadataChunk = generateMetadataChunk(genericMetadata);
    if (metadataChunk) {
      const chunkData = {
        document_id: documentId,
        content: metadataChunk.content,
        content_hash: generateContentHash(metadataChunk.content),
        token_count: metadataChunk.tokenCount,
        chunk_index: -1,
        chunk_type: 'metadata',
        section_title: `${getDocumentType(genericMetadata.docType)?.name || genericMetadata.docType} Metadata`,
        metadata: {
          section_type: metadataChunk.sectionType,
          ...metadataChunk.metadata,
        },
      };

      // Generate embedding for metadata chunk
      const { embeddingService } = await import('./embeddings');
      const embeddings = await embeddingService.generateEmbeddings([
        metadataChunk.content,
      ]);

      chunkData.embedding = JSON.stringify(embeddings[0]);

      const { error: chunkError } = await supabase
        .from('document_chunks')
        .insert(chunkData);

      if (chunkError) {
        console.warn(
          `Failed to insert metadata chunk for document ${documentId}:`,
          chunkError
        );
        // Don't fail the migration for chunk insertion errors
      }
    }

    return { success: true, errors: [] };
  } catch (error) {
    return {
      success: false,
      errors: [
        `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

// =======================
// Utility Functions
// =======================

function removeInjectedMetadata(content: string): string {
  // Remove metadata injection patterns (simple heuristic)
  // This could be enhanced with more sophisticated detection
  const lines = content.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();

    // Skip metadata-like lines
    if (trimmed.startsWith('Patent ') && trimmed.includes(' - ')) return false;
    if (trimmed.startsWith('Authors: ') && trimmed.includes(' - '))
      return false;
    if (trimmed.startsWith('DOI: ') || trimmed.startsWith('arXiv: '))
      return false;

    return true;
  });

  return filteredLines.join('\n').trim();
}

function generateContentHash(content: string): string {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Legacy compatibility wrapper
 */
export function createLegacyAdapter() {
  return {
    convertToGeneric: convertToGenericMetadata,
    buildUpdate: buildGenericDocumentUpdate,
    generateChunks: generateEnhancedChunks,
    insertChunks: insertEnhancedChunks,
    generateEmbeddings: generateEnhancedEmbeddings,
    validate: validateGenericDocument,
    migrate: migrateDocumentToGeneric,
  };
}
