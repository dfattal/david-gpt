/**
 * Unified Entity Processor (Updated for New LLM System)
 *
 * Simple dispatcher that uses the new unified LLM-based entity extraction system.
 * Replaces the complex pattern-based extraction with a single, consistent approach.
 */

import { modernEntityExtractor } from './entity-extraction-service';
import type {
  Entity,
  EntityKind,
  EntityAlias,
  DocumentMetadata,
  DocumentChunk,
} from './types';

// ===========================
// Simplified Types
// ===========================

export interface EntityExtractionResult {
  entities: Partial<Entity>[];
  aliases: Partial<EntityAlias>[];
  relationships: Array<{
    srcName: string;
    srcType: EntityKind;
    relation: string;
    dstName: string;
    dstType: EntityKind;
    confidence: number;
    evidenceText: string;
  }>;
  edges?: Array<{
    srcEntityId: string;
    dstEntityId: string;
    relation: string;
    confidence: number;
    evidenceText: string;
  }>;
  rawLLMEdges?: Array<any>;
  originalEntitiesWithTempIds?: Array<any>;
  metadata: {
    totalEntitiesFound: number;
    entitiesByKind: Record<EntityKind, number>;
    processingTime: number;
    strategy: string;
  };
}

// ===========================
// Unified Entity Processor
// ===========================

export class UnifiedEntityProcessor {
  /**
   * Process entities from document using modern LLM approach
   */
  async processEntities(
    documentId: string,
    metadata: DocumentMetadata,
    chunks: DocumentChunk[]
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();

    console.log(`🔄 Processing entities for document: ${metadata.title}`);

    try {
      // Use the modern entity extractor with edge support
      const {
        entities,
        aliases,
        relationships,
        edges,
        rawLLMEdges,
        originalEntitiesWithTempIds,
      } = (await modernEntityExtractor.extractFromDocument(
        documentId,
        metadata,
        chunks
      )) as any;

      console.log(
        `🔗 Extracted ${edges?.length || 0} edges, ${rawLLMEdges?.length || 0} raw LLM edges`
      );

      // Calculate metadata
      const entitiesByKind = this.calculateEntitiesByKind(entities);
      const processingTime = Date.now() - startTime;

      const result: EntityExtractionResult = {
        entities,
        aliases,
        relationships,
        edges: edges || [],
        rawLLMEdges: rawLLMEdges || [],
        originalEntitiesWithTempIds: originalEntitiesWithTempIds || [],
        metadata: {
          totalEntitiesFound: entities.length,
          entitiesByKind,
          processingTime,
          strategy: 'modern_llm',
        },
      };

      console.log(
        `✅ Entity processing completed: ${entities.length} entities in ${processingTime}ms`
      );
      return result;
    } catch (error) {
      console.error('❌ Entity processing failed:', error);
      throw error;
    }
  }

  /**
   * Calculate entities by kind for reporting
   */
  private calculateEntitiesByKind(
    entities: Partial<Entity>[]
  ): Record<EntityKind, number> {
    const counts: Record<EntityKind, number> = {
      person: 0,
      organization: 0,
      technology: 0,
      product: 0,
      component: 0,
      document: 0,
    };

    entities.forEach(entity => {
      if (entity.kind) {
        counts[entity.kind]++;
      }
    });

    return counts;
  }

  /**
   * Save extraction results to database
   */
  async saveResults(
    documentId: string,
    result: EntityExtractionResult
  ): Promise<void> {
    await modernEntityExtractor.saveEntities(
      documentId,
      result.entities,
      result.aliases,
      result.relationships,
      result.edges
    );

    // Process LLM edges after entities are persisted
    if (result.rawLLMEdges && result.rawLLMEdges.length > 0) {
      await modernEntityExtractor.processLLMEdgesAfterEntityPersistence(
        documentId,
        result.rawLLMEdges,
        result.entities,
        (result as any).originalEntitiesWithTempIds
      );
    }
  }
}

// Export singleton instance
export const unifiedEntityProcessor = new UnifiedEntityProcessor();

/**
 * Main processing function for documents
 */
export async function processDocumentEntitiesUnified(
  documentId: string
): Promise<EntityExtractionResult> {
  const { supabaseAdmin } = await import('@/lib/supabase');

  // Get document metadata
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!document) {
    throw new Error('Document not found');
  }

  // Get document chunks
  const { data: chunks } = await supabaseAdmin
    .from('document_chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index');

  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks found for document');
  }

  // Map database fields to types
  const documentMetadata: DocumentMetadata = {
    ...document,
    docType: document.doc_type,
    processingStatus: document.processing_status,
    createdAt: new Date(document.created_at),
    updatedAt: new Date(document.updated_at),
  } as DocumentMetadata;

  // Process entities
  const result = await unifiedEntityProcessor.processEntities(
    documentId,
    documentMetadata,
    chunks as DocumentChunk[]
  );

  // Save results
  await unifiedEntityProcessor.saveResults(documentId, result);

  return result;
}

// Export alias for compatibility with ingestion service
export const processDocumentEntities = processDocumentEntitiesUnified;
