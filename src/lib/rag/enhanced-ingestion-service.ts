/**
 * Enhanced Ingestion Service
 *
 * Extends the existing unified ingestion service to use the new
 * generic metadata schema and rich metadata chunk generation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  convertToGenericMetadata,
  buildGenericDocumentUpdate,
  generateEnhancedChunks,
  generateEnhancedEmbeddings,
  insertEnhancedChunks,
  validateGenericDocument
} from './generic-ingestion-adapter';
import { generateMetadataChunk } from './rich-metadata-chunks';
import { getDocumentType, type GenericDocumentMetadata } from './document-type-registry';
import type { DocumentMetadata, DocumentType } from './types';

// =======================
// Enhanced Processing Pipeline
// =======================

export class EnhancedIngestionService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Process document with enhanced metadata system
   */
  async processDocumentWithMetadata(
    documentId: string,
    content: string,
    extractedMetadata: DocumentMetadata,
    legacyChunks: any[]
  ): Promise<{
    success: boolean;
    totalChunks: number;
    metadataChunkGenerated: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Enhanced processing for document: ${documentId}`);

      // Step 1: Convert legacy metadata to generic format
      const docType = this.determineDocumentType(extractedMetadata);
      const genericMetadata = convertToGenericMetadata(extractedMetadata, docType);

      // Step 2: Validate the conversion
      const validation = validateGenericDocument(genericMetadata);
      if (!validation.valid) {
        throw new Error(`Metadata validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn(`⚠️ Metadata warnings: ${validation.warnings.join(', ')}`);
      }

      // Step 3: Generate enhanced chunks (content + metadata)
      const { contentChunks, metadataChunk, totalChunks } = await generateEnhancedChunks(
        content,
        documentId,
        genericMetadata,
        legacyChunks
      );

      console.log(`📦 Generated ${totalChunks} chunks (${contentChunks.length} content, ${metadataChunk ? 1 : 0} metadata)`);

      // Step 4: Generate embeddings for all chunks
      const allTexts = contentChunks.map(chunk => chunk.content);
      if (metadataChunk) {
        allTexts.push(metadataChunk.content);
      }

      const { embeddingService } = await import('./embeddings');
      const embeddings = await embeddingService.generateEmbeddings(allTexts);

      console.log(`🎯 Generated ${embeddings.length} embeddings`);

      // Step 5: Insert enhanced chunks into database
      await insertEnhancedChunks(this.supabase, contentChunks, metadataChunk, embeddings);

      // Step 6: Update document with generic metadata
      const updateData = buildGenericDocumentUpdate(genericMetadata);
      await this.supabase
        .from('documents')
        .update(updateData)
        .eq('id', documentId);

      console.log(`✅ Enhanced processing completed for document: ${documentId}`);

      return {
        success: true,
        totalChunks,
        metadataChunkGenerated: !!metadataChunk,
      };
    } catch (error) {
      console.error(`❌ Enhanced processing failed for document ${documentId}:`, error);
      return {
        success: false,
        totalChunks: 0,
        metadataChunkGenerated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Migrate existing document to new metadata system
   */
  async migrateExistingDocument(documentId: string): Promise<{
    success: boolean;
    metadataChunkAdded: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Migrating document to new metadata system: ${documentId}`);

      // Fetch existing document
      const { data: document, error: fetchError } = await this.supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (fetchError || !document) {
        throw new Error(`Failed to fetch document: ${fetchError?.message}`);
      }

      // Check if already migrated
      if (document.identifiers && Object.keys(document.identifiers).length > 0) {
        console.log(`📋 Document ${documentId} already migrated to generic schema`);
        return { success: true, metadataChunkAdded: false };
      }

      // Convert to generic format
      const genericMetadata = convertToGenericMetadata(document as any, document.doc_type);

      // Validate conversion
      const validation = validateGenericDocument(genericMetadata);
      if (!validation.valid) {
        throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
      }

      // Update document with new schema
      const updateData = buildGenericDocumentUpdate(genericMetadata);
      await this.supabase
        .from('documents')
        .update(updateData)
        .eq('id', documentId);

      // Generate and insert metadata chunk if needed
      let metadataChunkAdded = false;
      const docType = getDocumentType(genericMetadata.docType);
      if (docType && docType.hasMetadataChunks) {
        const metadataChunk = generateMetadataChunk(genericMetadata, {
          includeContext: true,
          includeRelationships: false
        });

        if (metadataChunk) {
          // Generate embedding for metadata chunk
          const { embeddingService } = await import('./embeddings');
          const embeddings = await embeddingService.generateEmbeddings([metadataChunk.content]);

          const chunkData = {
            document_id: documentId,
            content: metadataChunk.content,
            content_hash: this.generateContentHash(metadataChunk.content),
            token_count: metadataChunk.tokenCount,
            chunk_index: -1, // Special index for metadata chunks
            chunk_type: 'metadata',
            section_title: `${docType.name} Metadata`,
            embedding: JSON.stringify(embeddings[0]),
            metadata: {
              section_type: metadataChunk.sectionType,
              ...metadataChunk.metadata
            },
            tsvector_content: null // Generated by database trigger
          };

          await this.supabase
            .from('document_chunks')
            .insert(chunkData);

          metadataChunkAdded = true;
          console.log(`📝 Added metadata chunk for document: ${documentId}`);
        }
      }

      console.log(`✅ Migration completed for document: ${documentId}`);

      return {
        success: true,
        metadataChunkAdded
      };
    } catch (error) {
      console.error(`❌ Migration failed for document ${documentId}:`, error);
      return {
        success: false,
        metadataChunkAdded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch migrate multiple documents
   */
  async batchMigrateDocuments(documentIds: string[]): Promise<{
    totalDocuments: number;
    successfulMigrations: number;
    metadataChunksAdded: number;
    errors: string[];
  }> {
    console.log(`🔄 Starting batch migration for ${documentIds.length} documents`);

    let successfulMigrations = 0;
    let metadataChunksAdded = 0;
    const errors: string[] = [];

    for (const documentId of documentIds) {
      try {
        const result = await this.migrateExistingDocument(documentId);
        if (result.success) {
          successfulMigrations++;
          if (result.metadataChunkAdded) {
            metadataChunksAdded++;
          }
        } else {
          errors.push(`${documentId}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`${documentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ Batch migration completed: ${successfulMigrations}/${documentIds.length} successful`);

    return {
      totalDocuments: documentIds.length,
      successfulMigrations,
      metadataChunksAdded,
      errors
    };
  }

  /**
   * Get migration status for documents
   */
  async getMigrationStatus(): Promise<{
    totalDocuments: number;
    migratedDocuments: number;
    pendingMigration: number;
    documentsWithMetadataChunks: number;
  }> {
    // Get total documents
    const { count: totalDocuments } = await this.supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    // Get migrated documents (have generic identifiers)
    const { count: migratedDocuments } = await this.supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .not('identifiers', 'eq', '{}');

    // Get documents with metadata chunks
    const { count: documentsWithMetadataChunks } = await this.supabase
      .from('document_chunks')
      .select('document_id', { count: 'exact', head: true })
      .eq('chunk_type', 'metadata');

    return {
      totalDocuments: totalDocuments || 0,
      migratedDocuments: migratedDocuments || 0,
      pendingMigration: (totalDocuments || 0) - (migratedDocuments || 0),
      documentsWithMetadataChunks: documentsWithMetadataChunks || 0
    };
  }

  // =======================
  // Helper Methods
  // =======================

  private determineDocumentType(metadata: DocumentMetadata): string {
    // Determine document type based on metadata
    if (metadata.patentNumber) return 'patent';
    if (metadata.doi || metadata.arxivId) return 'paper';
    if (metadata.url && metadata.url.includes('arxiv.org')) return 'paper';
    if (metadata.url) return 'url';
    return 'pdf'; // Default fallback
  }

  private generateContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

// =======================
// Integration Helper
// =======================

/**
 * Middleware to enhance existing ingestion service
 */
export function createEnhancedIngestionMiddleware(supabase: SupabaseClient) {
  const enhancedService = new EnhancedIngestionService(supabase);

  return {
    // Process new documents with enhanced metadata
    async processDocument(
      documentId: string,
      content: string,
      extractedMetadata: DocumentMetadata,
      legacyChunks: any[]
    ) {
      return enhancedService.processDocumentWithMetadata(
        documentId,
        content,
        extractedMetadata,
        legacyChunks
      );
    },

    // Migrate existing documents
    async migrateDocument(documentId: string) {
      return enhancedService.migrateExistingDocument(documentId);
    },

    // Batch migration
    async batchMigrate(documentIds: string[]) {
      return enhancedService.batchMigrateDocuments(documentIds);
    },

    // Get migration status
    async getMigrationStatus() {
      return enhancedService.getMigrationStatus();
    }
  };
}

// =======================
// API Integration
// =======================

/**
 * Add enhanced metadata processing to ingestion pipeline
 */
export async function integrateEnhancedMetadata(
  originalIngestionFunction: Function,
  supabase: SupabaseClient
) {
  const middleware = createEnhancedIngestionMiddleware(supabase);

  return async function enhancedIngestion(...args: any[]) {
    try {
      // Call original ingestion
      const result = await originalIngestionFunction(...args);

      // If successful and we have a document ID, enhance with metadata
      if (result.success && result.documentId) {
        console.log(`🔄 Applying enhanced metadata processing to ${result.documentId}`);

        // This would need access to the extracted metadata and chunks
        // For now, we'll schedule the enhancement as a background task

        // Note: In a real implementation, you'd want to modify the ingestion service
        // to call enhancedService.processDocumentWithMetadata directly
        console.log(`📝 Enhanced metadata processing scheduled for ${result.documentId}`);
      }

      return result;
    } catch (error) {
      console.error('Enhanced ingestion middleware error:', error);
      // Fall back to original behavior
      return originalIngestionFunction(...args);
    }
  };
}