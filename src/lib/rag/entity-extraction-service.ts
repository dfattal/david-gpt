/**
 * Modern Entity Extraction Service
 *
 * Simplified, LLM-powered entity extraction that replaces the complex
 * pattern-based approach with a unified, configurable system.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { extractEntitiesAndEdgesWithLLM, extractEntitiesWithLLM } from './unified-llm-entity-extractor';
import { selectConfigForDocument, DAVID_GPT_LEIA_CONFIG } from './extraction-configs';
import type {
  Entity,
  EntityKind,
  EntityAlias,
  DocumentMetadata,
  DocumentChunk
} from './types';

// =======================
// Modern Entity Extraction Service
// =======================

export class EntityExtractionService {

  /**
   * Extract entities and edges from document using modern LLM approach
   */
  async extractFromDocument(
    documentId: string,
    metadata: DocumentMetadata,
    chunks: DocumentChunk[]
  ): Promise<{
    entities: Partial<Entity>[];
    aliases: Partial<EntityAlias>[];
    relationships: Array<any>;
    edges: Array<{
      srcEntityId: string;
      dstEntityId: string;
      relation: string;
      confidence: number;
      evidenceText: string;
    }>;
    rawLLMEdges?: Array<any>;
  }> {
    console.log(`🔍 Starting modern entity extraction for: ${metadata.title}`);

    try {
      // Get existing entities for deduplication
      const existingEntities = await this.getExistingEntities();

      // Select appropriate configuration based on document
      const config = selectConfigForDocument(
        metadata.docType,
        metadata.title,
        chunks.map(c => c.content).join(' ').substring(0, 1000)
      );

      console.log(`🎯 Using configuration: ${config.focusDomains.join(', ')}`);

      // Extract entities and edges using LLM
      const extractionResult = await extractEntitiesAndEdgesWithLLM(
        documentId,
        metadata,
        chunks,
        existingEntities,
        config
      );

      const { entities, extractionMetadata } = extractionResult;
      const llmEdges = (extractionResult as any).rawLLMEdges || []; // Raw edges with temp_ids from LLM
      const originalEntitiesWithTempIds = (extractionResult as any).originalEntitiesWithTempIds || [];

      console.log(`🔗 LLM extracted ${extractionMetadata.edgesExtracted} edges (${llmEdges.length} with temp_ids)`);
      console.log(`📋 Original entities with temp_ids: ${originalEntitiesWithTempIds.length}`);
      console.log(`🐛 Debug - llmEdges type:`, typeof llmEdges, 'Array.isArray:', Array.isArray(llmEdges));
      console.log(`🐛 Debug - llmEdges content:`, JSON.stringify(llmEdges, null, 2));

      // Extract metadata-based entities (inventors, assignees, etc.)
      const metadataEntities = this.extractFromMetadata(metadata);

      // Combine and deduplicate
      const allEntities = [...entities, ...metadataEntities.entities];
      const deduplicatedEntities = this.deduplicateEntities(allEntities);

      console.log(`✅ Extraction completed: ${deduplicatedEntities.length} entities, ${llmEdges.length} LLM edges`);
      console.log(`⚡ Processing time: ${extractionMetadata.processingTime}ms`);

      return {
        entities: deduplicatedEntities,
        aliases: [],
        relationships: metadataEntities.relationships,
        edges: [], // Will be populated after entity persistence with actual entity IDs
        rawLLMEdges: llmEdges, // LLM edges with temp_ids for processing after entity creation
        originalEntitiesWithTempIds // Original LLM entities with temp_ids for mapping
      };

    } catch (error) {
      console.error('❌ Entity extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract entities from structured metadata (high confidence)
   */
  private extractFromMetadata(metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];

    // Extract patent inventors
    if (metadata.docType === 'patent' && metadata.inventors) {
      let inventors = metadata.inventors;

      // Handle JSON string case
      if (typeof inventors === 'string') {
        try {
          inventors = JSON.parse(inventors);
        } catch (e) {
          inventors = [];
        }
      }

      if (Array.isArray(inventors)) {
        inventors.forEach((inventor: string) => {
          if (inventor && this.isValidPersonName(inventor.trim())) {
            entities.push({
              name: inventor.trim(),
              kind: 'person' as EntityKind,
              description: `Patent inventor for ${metadata.patentNo || metadata.title}`,
              authorityScore: 0.95, // High authority for structured data
              mentionCount: 1
            });

            relationships.push({
              srcName: inventor.trim(),
              srcType: 'person',
              relation: 'inventor_of',
              dstName: metadata.title,
              dstType: 'document',
              evidenceText: `Listed as inventor in patent ${metadata.patentNo || 'metadata'}`
            });
          }
        });
      }
    }

    // Extract patent assignees
    if (metadata.docType === 'patent' && metadata.assignees) {
      let assignees = metadata.assignees;

      // Handle JSON string case
      if (typeof assignees === 'string') {
        try {
          assignees = JSON.parse(assignees);
        } catch (e) {
          assignees = [];
        }
      }

      if (Array.isArray(assignees)) {
        assignees.forEach((assignee: string) => {
          if (assignee && this.isValidOrganizationName(assignee.trim())) {
            entities.push({
              name: assignee.trim(),
              kind: 'organization' as EntityKind,
              description: `Patent assignee for ${metadata.patentNo || metadata.title}`,
              authorityScore: 0.95,
              mentionCount: 1
            });

            relationships.push({
              srcName: assignee.trim(),
              srcType: 'organization',
              relation: 'assignee_of',
              dstName: metadata.title,
              dstType: 'document',
              evidenceText: `Listed as assignee in patent ${metadata.patentNo || 'metadata'}`
            });
          }
        });
      }
    }

    return { entities, relationships };
  }

  /**
   * Get existing entities from database for deduplication
   */
  private async getExistingEntities(): Promise<Entity[]> {
    try {
      const { data: entities, error } = await supabaseAdmin
        .from('entities')
        .select('id, name, kind, description, authority_score, mention_count, created_at, updated_at')
        .order('authority_score', { ascending: false })
        .limit(1000); // Get top 1000 entities for deduplication

      if (error) {
        console.warn('Failed to fetch existing entities:', error);
        return [];
      }

      return (entities || []).map(e => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        description: e.description,
        authorityScore: e.authority_score,
        mentionCount: e.mention_count,
        createdAt: new Date(e.created_at),
        updatedAt: new Date(e.updated_at)
      }));

    } catch (error) {
      console.warn('Error fetching existing entities:', error);
      return [];
    }
  }

  /**
   * Basic validation for person names
   */
  private isValidPersonName(name: string): boolean {
    const words = name.trim().split(/\s+/);
    return words.length >= 2 && words.length <= 4 &&
           words.every(word => /^[A-Z][a-z'-]*$/.test(word) || /^[A-Z]\.?$/.test(word));
  }

  /**
   * Basic validation for organization names
   */
  private isValidOrganizationName(name: string): boolean {
    return name.length >= 2 && name.length <= 100 &&
           /^[A-Z]/.test(name) &&
           !['Method', 'System', 'Device', 'Process'].includes(name);
  }

  /**
   * Deduplicate entities by name and type
   */
  private deduplicateEntities(entities: Partial<Entity>[]): Partial<Entity>[] {
    const deduped = new Map<string, Partial<Entity>>();

    entities.forEach(entity => {
      if (!entity.name || !entity.kind) return;

      const key = `${entity.kind}:${entity.name.toLowerCase()}`;
      const existing = deduped.get(key);

      if (existing) {
        // Merge with higher authority score and combined mention count
        existing.mentionCount = (existing.mentionCount || 0) + (entity.mentionCount || 0);
        existing.authorityScore = Math.max(existing.authorityScore || 0, entity.authorityScore || 0);
      } else {
        deduped.set(key, { ...entity });
      }
    });

    return Array.from(deduped.values());
  }

  /**
   * Save entities, relationships, and edges to database with canonical consolidation
   */
  async saveEntities(
    documentId: string,
    entities: Partial<Entity>[],
    aliases: Partial<EntityAlias>[],
    relationships: Array<any>,
    edges?: Array<{
      srcEntityId: string;
      dstEntityId: string;
      relation: string;
      confidence: number;
      evidenceText: string;
    }>
  ): Promise<void> {
    console.log(`💾 Saving ${entities.length} entities to database...`);

    try {
      // Import consolidators
      const { entityConsolidator } = await import('./entity-consolidator');
      const { consolidateEntityName } = await import('./canonical-entities');

      let reusedCount = 0;
      let newCount = 0;
      let canonicalConsolidationCount = 0;

      // Process entities with canonical consolidation
      for (const entity of entities) {
        if (!entity.name || !entity.kind) continue;

        // Apply canonical consolidation
        const canonicalResult = consolidateEntityName(entity.name, entity.kind);

        if (canonicalResult.wasConsolidated) {
          canonicalConsolidationCount++;
          console.log(`🔄 Canonical consolidation: "${entity.name}" → "${canonicalResult.canonicalName}"`);
          entity.name = canonicalResult.canonicalName;
          if (canonicalResult.matchedCanonical) {
            entity.description = canonicalResult.matchedCanonical.description;
            entity.authorityScore = Math.max(entity.authorityScore || 0, 0.9);
          }
        }

        // Use existing consolidator to check for database entities
        const consolidationResult = await entityConsolidator.consolidateEntityOnIngestion(
          entity.name,
          entity.kind,
          entity.description
        );

        if (consolidationResult.wasReused) {
          reusedCount++;
        } else {
          newCount++;
        }
      }

      console.log(`✅ Entities processed: ${canonicalConsolidationCount} canonically consolidated, ${reusedCount} reused, ${newCount} new`);

      // Save relationships
      if (relationships.length > 0) {
        await this.saveRelationships(relationships, documentId);
        console.log(`🔗 Saved ${relationships.length} relationships`);
      }

      // Save edges from LLM extraction
      if (edges && edges.length > 0) {
        await this.saveLLMEdges(edges, documentId);
        console.log(`🔗 Saved ${edges.length} LLM-extracted edges`);
      }

    } catch (error) {
      console.error('Error saving entities:', error);
      throw error;
    }
  }

  /**
   * Save relationships to database
   */
  private async saveRelationships(relationships: Array<any>, documentId: string): Promise<void> {
    for (const rel of relationships) {
      try {
        // Find source entity ID
        const { data: srcEntity } = await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('name', rel.srcName)
          .eq('kind', rel.srcType)
          .single();

        // For document relationships, use the document ID
        let dstId = null;
        let dstType: 'entity' | 'document' = 'entity';

        if (rel.dstType === 'document') {
          dstId = documentId;
          dstType = 'document';
        } else {
          const { data: dstEntity } = await supabaseAdmin
            .from('entities')
            .select('id')
            .eq('name', rel.dstName)
            .eq('kind', rel.dstType)
            .single();

          if (dstEntity) {
            dstId = dstEntity.id;
          }
        }

        // Create relationship if both entities exist
        if (srcEntity && dstId) {
          const { error } = await supabaseAdmin
            .from('edges')
            .upsert({
              src_id: srcEntity.id,
              src_type: 'entity',
              rel: rel.relation,
              dst_id: dstId,
              dst_type: dstType,
              weight: 0.8,
              evidence_text: rel.evidenceText,
              evidence_doc_id: documentId
            }, {
              onConflict: 'src_id,src_type,rel,dst_id,dst_type',
              ignoreDuplicates: false
            });

          if (error) {
            console.warn(`Failed to save relationship ${rel.srcName} → ${rel.dstName}:`, error.message);
          }
        }
      } catch (error) {
        console.warn(`Error processing relationship ${rel.srcName} → ${rel.dstName}:`, error);
      }
    }
  }

  /**
   * Save LLM-extracted edges to database
   */
  private async saveLLMEdges(
    edges: Array<{
      srcEntityId: string;
      dstEntityId: string;
      relation: string;
      confidence: number;
      evidenceText: string;
    }>,
    documentId: string
  ): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    for (const edge of edges) {
      try {
        // Validate edge relation against our strict types
        const { EDGE_VALIDATION_MATRIX } = await import('./types');

        if (!EDGE_VALIDATION_MATRIX[edge.relation as keyof typeof EDGE_VALIDATION_MATRIX]) {
          console.warn(`🔄 Skipping edge with invalid relation: ${edge.relation}`);
          failCount++;
          continue;
        }

        // Create edge in database (using existing 'edges' table)
        const { error } = await supabaseAdmin
          .from('edges')
          .upsert({
            src_id: edge.srcEntityId,
            src_type: 'entity',
            rel: edge.relation,
            dst_id: edge.dstEntityId,
            dst_type: 'entity',
            weight: edge.confidence,
            evidence_text: edge.evidenceText,
            evidence_doc_id: documentId
          }, {
            onConflict: 'src_id,src_type,rel,dst_id,dst_type',
            ignoreDuplicates: false
          });

        if (error) {
          console.warn(`Failed to save edge ${edge.relation}:`, error.message);
          failCount++;
        } else {
          console.log(`✅ Saved edge: ${edge.relation} (confidence: ${edge.confidence})`);
          successCount++;
        }

      } catch (error) {
        console.warn(`Error processing edge ${edge.relation}:`, error);
        failCount++;
      }
    }

    console.log(`🔗 Edge persistence results: ${successCount} saved, ${failCount} failed`);
  }

  /**
   * Process LLM edges after entities have been persisted to database
   */
  async processLLMEdgesAfterEntityPersistence(
    documentId: string,
    rawLLMEdges: Array<any>,
    extractedEntities: Partial<Entity>[],
    originalEntitiesWithTempIds?: Array<any>
  ): Promise<void> {
    console.log(`🔗 Processing ${rawLLMEdges.length} LLM edges after entity persistence...`);

    try {
      // Step 1: Create temp_id to entity mapping
      const tempIdToEntityId = await this.createTempIdMapping(
        rawLLMEdges,
        extractedEntities,
        originalEntitiesWithTempIds
      );

      console.log(`📋 Created temp_id mapping for ${Object.keys(tempIdToEntityId).length} entities`);

      // Step 2: Process edges using temp_id mapping
      const processedEdges: Array<{
        srcEntityId: string;
        dstEntityId: string;
        relation: string;
        confidence: number;
        evidenceText: string;
      }> = [];

      for (const rawEdge of rawLLMEdges) {
        const srcEntityId = tempIdToEntityId[rawEdge.src_temp_id];
        const dstEntityId = tempIdToEntityId[rawEdge.dst_temp_id];

        if (srcEntityId && dstEntityId) {
          processedEdges.push({
            srcEntityId,
            dstEntityId,
            relation: rawEdge.relation,
            confidence: rawEdge.confidence,
            evidenceText: rawEdge.evidence || 'Extracted via LLM'
          });
        } else {
          console.log(`🔄 Skipping edge: temp_id mapping failed (${rawEdge.src_temp_id} -> ${rawEdge.dst_temp_id})`);
        }
      }

      // Step 3: Save the processed edges
      if (processedEdges.length > 0) {
        await this.saveLLMEdges(processedEdges, documentId);
        console.log(`✅ Successfully processed ${processedEdges.length}/${rawLLMEdges.length} LLM edges`);
      } else {
        console.log(`⚠️ No edges could be processed - check temp_id mapping`);
      }

    } catch (error) {
      console.error('Error processing LLM edges:', error);
    }
  }

  /**
   * Create mapping from LLM temp_ids to actual database entity IDs
   */
  private async createTempIdMapping(
    rawLLMEdges: Array<any>,
    extractedEntities: Partial<Entity>[],
    originalEntitiesWithTempIds?: Array<any>
  ): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};

    console.log(`🔍 Creating temp_id mapping for ${rawLLMEdges.length} edges...`);

    // Use original entities with temp_ids if available (preferred method)
    if (originalEntitiesWithTempIds && originalEntitiesWithTempIds.length > 0) {
      console.log(`📋 Using ${originalEntitiesWithTempIds.length} original entities with temp_ids for mapping`);

      for (const originalEntity of originalEntitiesWithTempIds) {
        if (originalEntity.temp_id && originalEntity.name && originalEntity.type) {
          // Find this entity in the database
          const dbEntity = await this.findEntityByNameAndType(originalEntity.name, originalEntity.type);
          if (dbEntity) {
            mapping[originalEntity.temp_id] = dbEntity.id;
            console.log(`✅ Mapped temp_id ${originalEntity.temp_id} (${originalEntity.name}) to entity ID ${dbEntity.id}`);
          } else {
            console.log(`⚠️ Could not find database entity for temp_id ${originalEntity.temp_id} (${originalEntity.name})`);
          }
        }
      }
    } else {
      // Fallback: try to reconstruct mapping from edge evidence and extracted entities
      console.log(`🔄 No original entities with temp_ids available, using fallback mapping...`);

      // Get all unique temp_ids from edges
      const tempIds = new Set<string>();
      rawLLMEdges.forEach(edge => {
        tempIds.add(edge.src_temp_id);
        tempIds.add(edge.dst_temp_id);
      });

      // Try to match temp_ids to entities by order (less reliable)
      const tempIdArray = Array.from(tempIds);
      for (let i = 0; i < Math.min(tempIdArray.length, extractedEntities.length); i++) {
        const tempId = tempIdArray[i];
        const entity = extractedEntities[i];

        if (entity.name && entity.kind) {
          const dbEntity = await this.findEntityByNameAndType(entity.name, entity.kind);
          if (dbEntity) {
            mapping[tempId] = dbEntity.id;
            console.log(`🔄 Fallback mapped temp_id ${tempId} to entity ID ${dbEntity.id} (${entity.name})`);
          }
        }
      }
    }

    console.log(`📊 Final mapping: ${Object.keys(mapping).length} temp_ids mapped`);
    return mapping;
  }

  /**
   * Find entity by name and type in database
   */
  private async findEntityByNameAndType(
    name: string,
    type: string
  ): Promise<{ id: string } | null> {
    try {
      const { data: entity } = await supabaseAdmin
        .from('entities')
        .select('id')
        .eq('name', name)
        .eq('kind', type)
        .single();

      return entity;
    } catch {
      return null;
    }
  }
}

// =======================
// Export Functions
// =======================

export const modernEntityExtractor = new EntityExtractionService();

/**
 * Process a document for entity extraction using modern LLM approach
 */
export async function processDocumentEntitiesModern(documentId: string): Promise<void> {
  try {
    console.log(`🚀 Starting modern entity extraction for document: ${documentId}`);

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
      console.log('No chunks found for document, skipping entity extraction');
      return;
    }

    // Map database fields to DocumentMetadata interface
    const documentMetadata: DocumentMetadata = {
      ...document,
      docType: document.doc_type,
      processingStatus: document.processing_status,
      createdAt: new Date(document.created_at),
      updatedAt: new Date(document.updated_at),
    } as DocumentMetadata;

    // Extract entities using modern approach
    const { entities, aliases, relationships, edges, rawLLMEdges, originalEntitiesWithTempIds } = await modernEntityExtractor.extractFromDocument(
      documentId,
      documentMetadata,
      chunks as DocumentChunk[]
    ) as any;

    // Save entities to database first
    await modernEntityExtractor.saveEntities(documentId, entities, aliases, relationships, edges);

    // Process LLM edges after entities are persisted
    if (rawLLMEdges && rawLLMEdges.length > 0) {
      await modernEntityExtractor.processLLMEdgesAfterEntityPersistence(
        documentId,
        rawLLMEdges,
        entities,
        originalEntitiesWithTempIds
      );
    }

    console.log(`✅ Modern entity extraction completed for document: ${document.title}`);

  } catch (error) {
    console.error('Error in processDocumentEntitiesModern:', error);
    throw error;
  }
}