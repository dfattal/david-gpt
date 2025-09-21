/**
 * Unified LLM-Based Entity Extractor
 *
 * Single, configurable entity extraction system that replaces multiple
 * pattern-based extractors with an LLM-powered approach.
 *
 * Key features:
 * - Configurable domain focus and entity types
 * - Built-in deduplication against existing entities
 * - Structured JSON output with confidence scores
 * - Easy adaptation for different knowledge graph projects
 */

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { personaManager } from '@/lib/personas/persona-manager';
import type {
  Entity,
  EntityKind,
  DocumentMetadata,
  DocumentChunk,
  RelationType,
  ExtractedEdge,
  EntityEdgeExtractionResult,
  Persona
} from './types';
import { EDGE_VALIDATION_MATRIX } from './types';

// =======================
// Configuration Types
// =======================

export interface LLMEntityExtractionConfig {
  systemPrompt: string;
  focusDomains: string[];
  entityTypes: EntityKind[];
  maxEntitiesPerDocument: number;
  confidenceThreshold: number;
  includeDomainDescription: boolean;
}

export interface ExtractedEntity {
  name: string;
  type: EntityKind;
  aliases: string[];
  evidence: string;
  confidence: number;
  temp_id: string; // For linking to edges within extraction result
}

// =======================
// Schema for LLM Output
// =======================

const ExtractedEntitySchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['person', 'organization', 'technology', 'product', 'component']),
  aliases: z.array(z.string()).max(5),
  evidence: z.string().max(200),
  confidence: z.number().min(0).max(1),
  temp_id: z.string().min(1).max(10) // e1, e2, e3, etc.
});

const ExtractedEdgeSchema = z.object({
  src_temp_id: z.string().min(1).max(10),
  dst_temp_id: z.string().min(1).max(10),
  relation: z.enum(['affiliated_with', 'made_by', 'implements', 'uses_component', 'supplied_by']),
  evidence: z.string().max(200),
  confidence: z.number().min(0).max(1)
});

const EntityEdgeExtractionResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema).max(50),
  edges: z.array(ExtractedEdgeSchema).max(100)
});

// =======================
// Unified LLM Entity Extractor
// =======================

export class UnifiedLLMEntityExtractor {
  private readonly model = openai('gpt-4o', {
    apiKey: process.env.OPENAI_API_KEY
  });

  /**
   * Generate persona-specific extraction configuration
   */
  static generatePersonaConfig(persona: Persona): LLMEntityExtractionConfig {
    const enhancedPersona = personaManager.getEnhancedPersona(persona);

    if (enhancedPersona) {
      // Use rich persona configuration to create extraction config
      const domainKeywords = enhancedPersona.expertise.domains.flatMap(domain => domain.keywords);
      const focusDomains = enhancedPersona.expertise.domains.map(domain => `${domain.name}: ${domain.description}`);

      return {
        systemPrompt: `You are an expert entity extractor specializing in ${enhancedPersona.name}.

EXTRACTION FOCUS:
${enhancedPersona.expertise.domains.map(domain =>
  `- ${domain.name}: ${domain.description}`
).join('\n')}

SPECIALIZED KNOWLEDGE:
${enhancedPersona.expertise.achievements.slice(0, 5).map(achievement => `- ${achievement}`).join('\n')}

Extract entities that are relevant to this expertise, focusing on:
${domainKeywords.slice(0, 10).map(keyword => `- ${keyword}`).join('\n')}

Prioritize entities that align with the persona's specialized knowledge and domain expertise.`,
        focusDomains,
        entityTypes: ['person', 'organization', 'technology', 'product', 'component'],
        maxEntitiesPerDocument: 30,
        confidenceThreshold: 0.6,
        includeDomainDescription: true
      };
    }

    // Fallback configurations for basic personas
    return this.getBasicPersonaConfig(persona);
  }

  /**
   * Get basic persona configuration for non-enhanced personas
   */
  static getBasicPersonaConfig(persona: Persona): LLMEntityExtractionConfig {
    const configs = {
      david: {
        systemPrompt: `You are extracting entities from documents in David Fattal's technology domain.
Focus on 3D display technology, spatial computing, patents, and emerging tech.`,
        focusDomains: ['3D Display Technology', 'Spatial Computing', 'Patent Innovation', 'Emerging Technology'],
        entityTypes: ['person', 'organization', 'technology', 'product', 'component'] as EntityKind[],
        maxEntitiesPerDocument: 25,
        confidenceThreshold: 0.6,
        includeDomainDescription: true
      },
      legal: {
        systemPrompt: `You are extracting entities from legal documents.
Focus on legal entities, court cases, statutes, and judicial proceedings.`,
        focusDomains: ['Legal Entities', 'Court Cases', 'Statutes and Regulations', 'Judicial Proceedings'],
        entityTypes: ['person', 'organization'] as EntityKind[],
        maxEntitiesPerDocument: 20,
        confidenceThreshold: 0.7,
        includeDomainDescription: true
      },
      medical: {
        systemPrompt: `You are extracting entities from medical and clinical documents.
Focus on medical entities, clinical trials, treatments, and healthcare organizations.`,
        focusDomains: ['Medical Entities', 'Clinical Trials', 'Treatments and Therapies', 'Healthcare Organizations'],
        entityTypes: ['person', 'organization', 'technology', 'product'] as EntityKind[],
        maxEntitiesPerDocument: 20,
        confidenceThreshold: 0.7,
        includeDomainDescription: true
      }
    };

    return configs[persona] || configs.david;
  }

  /**
   * Extract entities and edges from document using LLM in single pass
   */
  async extractEntitiesAndEdges(
    documentText: string,
    existingEntities: Entity[],
    metadata: DocumentMetadata,
    config: LLMEntityExtractionConfig
  ): Promise<EntityEdgeExtractionResult> {
    console.log(`🤖 Starting LLM entity+edge extraction for: ${metadata.title}`);
    console.log(`🎯 Domain focus: ${config.focusDomains.join(', ')}`);
    console.log(`📊 Entity types: ${config.entityTypes.join(', ')}`);
    console.log(`📝 Checking against ${existingEntities.length} existing entities`);

    try {
      // Prepare existing entities list for deduplication
      const existingEntitiesJson = this.formatExistingEntities(existingEntities);

      // Construct user prompt with document content and existing entities
      const userPrompt = this.buildUserPrompt(
        documentText,
        existingEntitiesJson,
        metadata,
        config
      );

      // Call LLM with structured output for entities + edges
      const result = await generateObject({
        model: this.model,
        system: config.systemPrompt,
        prompt: userPrompt,
        schema: EntityEdgeExtractionResultSchema,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      // Filter entities by confidence threshold
      const filteredEntities = result.object.entities.filter(
        entity => entity.confidence >= config.confidenceThreshold
      );

      // Validate and filter edges
      const validatedEdges = this.validateEdges(result.object.edges, filteredEntities, config.confidenceThreshold);

      console.log(`✅ LLM extracted ${result.object.entities.length} entities (${filteredEntities.length} above confidence threshold)`);
      console.log(`✅ LLM extracted ${result.object.edges.length} edges (${validatedEdges.length} validated)`);

      return {
        entities: filteredEntities,
        edges: validatedEdges
      };

    } catch (error) {
      console.error('❌ LLM entity+edge extraction failed:', error);
      throw new Error(`LLM entity+edge extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate edges against validation matrix and filter by confidence
   */
  private validateEdges(
    edges: ExtractedEdge[],
    validEntities: ExtractedEntity[],
    confidenceThreshold: number
  ): ExtractedEdge[] {
    const entityMap = new Map(validEntities.map(e => [e.temp_id, e]));

    return edges.filter(edge => {
      // Check confidence threshold
      if (edge.confidence < confidenceThreshold) {
        console.log(`🔄 Dropping edge ${edge.src_temp_id}->${edge.dst_temp_id} (${edge.relation}): low confidence (${edge.confidence})`);
        return false;
      }

      // Check that both entities exist
      const srcEntity = entityMap.get(edge.src_temp_id);
      const dstEntity = entityMap.get(edge.dst_temp_id);

      if (!srcEntity || !dstEntity) {
        console.log(`🔄 Dropping edge ${edge.src_temp_id}->${edge.dst_temp_id} (${edge.relation}): missing entities`);
        return false;
      }

      // Validate against edge matrix
      const validationRule = EDGE_VALIDATION_MATRIX[edge.relation];
      if (!validationRule) {
        console.log(`🔄 Dropping edge ${edge.src_temp_id}->${edge.dst_temp_id}: unknown relation (${edge.relation})`);
        return false;
      }

      if (srcEntity.type !== validationRule.srcType || dstEntity.type !== validationRule.dstType) {
        console.log(`🔄 Dropping edge ${edge.src_temp_id}->${edge.dst_temp_id} (${edge.relation}): invalid types (${srcEntity.type}->${dstEntity.type}, expected ${validationRule.srcType}->${validationRule.dstType})`);
        return false;
      }

      return true;
    });
  }

  /**
   * Format existing entities for LLM deduplication check
   */
  private formatExistingEntities(entities: Entity[]): string {
    if (entities.length === 0) {
      return JSON.stringify([], null, 2);
    }

    // Group entities by type for better organization
    const groupedEntities = entities.reduce((acc, entity) => {
      if (!acc[entity.kind]) {
        acc[entity.kind] = [];
      }
      acc[entity.kind].push({
        name: entity.name,
        aliases: [], // TODO: Load aliases if needed
        authority_score: entity.authorityScore
      });
      return acc;
    }, {} as Record<string, any[]>);

    return JSON.stringify(groupedEntities, null, 2);
  }

  /**
   * Build user prompt with document text and context
   */
  private buildUserPrompt(
    documentText: string,
    existingEntitiesJson: string,
    metadata: DocumentMetadata,
    config: LLMEntityExtractionConfig
  ): string {
    const domainContext = config.includeDomainDescription
      ? this.getDomainContext(config.focusDomains)
      : '';

    return `${domainContext}

Existing entities (avoid duplicates):
${existingEntitiesJson}

Document metadata:
- Title: ${metadata.title}
- Type: ${metadata.docType}
- Patent Number: ${metadata.patentNo || 'N/A'}
- DOI: ${metadata.doi || 'N/A'}

Document text:
"""
${documentText.substring(0, 8000)} ${documentText.length > 8000 ? '...' : ''}
"""`;
  }

  /**
   * Get domain-specific context descriptions
   */
  private getDomainContext(domains: string[]): string {
    const domainDescriptions: Record<string, string> = {
      'quantum': 'Quantum computing technologies including qubits, quantum gates, error correction, and quantum algorithms.',
      'nanophotonics': 'Nanoscale photonic devices, metamaterials, plasmonics, and optical nanostructures.',
      'spatial_computing': '3D displays, AR/VR technologies, spatial interfaces, eye tracking, and immersive computing.',
      'leia_technology': 'Leia Inc. display technologies including lightfield displays, autostereoscopic screens, switchable 2D/3D displays.',
      'computer_vision': 'Machine learning for visual perception, depth estimation, object recognition, and image processing.',
      'display_technology': 'LCD, OLED, MicroLED displays, optical components, and visual interface technologies.'
    };

    const descriptions = domains
      .map(domain => domainDescriptions[domain])
      .filter(Boolean);

    if (descriptions.length === 0) {
      return '';
    }

    return `Domain focus areas:
${descriptions.map(desc => `• ${desc}`).join('\n')}
`;
  }

  /**
   * Convert LLM extracted entities to internal format
   */
  convertToInternalFormat(
    extractedEntities: ExtractedEntity[],
    documentId: string
  ): Partial<Entity>[] {
    return extractedEntities.map(entity => ({
      name: entity.name,
      kind: entity.type,
      description: `${this.getKindDescription(entity.type)} extracted via LLM from document content`,
      authorityScore: entity.confidence,
      mentionCount: 1
    }));
  }

  /**
   * Convert LLM extracted edges to internal format with entity mapping
   */
  convertEdgesToInternalFormat(
    extractedEdges: ExtractedEdge[],
    entityTempIdMap: Map<string, string>, // temp_id -> actual entity ID
    documentId: string
  ): Array<{
    srcEntityId: string;
    dstEntityId: string;
    relation: RelationType;
    confidence: number;
    evidenceText: string;
  }> {
    return extractedEdges.map(edge => ({
      srcEntityId: entityTempIdMap.get(edge.src_temp_id) || '',
      dstEntityId: entityTempIdMap.get(edge.dst_temp_id) || '',
      relation: edge.relation,
      confidence: edge.confidence,
      evidenceText: edge.evidence
    })).filter(edge => edge.srcEntityId && edge.dstEntityId);
  }

  private getKindDescription(kind: EntityKind): string {
    const descriptions = {
      person: 'Person',
      organization: 'Organization',
      product: 'Product',
      technology: 'Technology',
      component: 'Component',
      document: 'Document'
    };
    return descriptions[kind] || 'Entity';
  }
}

// =======================
// Export singleton instance
// =======================

export const unifiedLLMEntityExtractor = new UnifiedLLMEntityExtractor();

// =======================
// Utility Functions
// =======================

/**
 * Extract entities and edges from document chunks using LLM approach
 */
export async function extractEntitiesAndEdgesWithLLM(
  documentId: string,
  metadata: DocumentMetadata,
  chunks: DocumentChunk[],
  existingEntities: Entity[],
  config: LLMEntityExtractionConfig
): Promise<{
  entities: Partial<Entity>[];
  edges: Array<{
    srcEntityId: string;
    dstEntityId: string;
    relation: RelationType;
    confidence: number;
    evidenceText: string;
  }>;
  extractionMetadata: {
    totalProcessed: number;
    llmCalls: number;
    processingTime: number;
    entitiesExtracted: number;
    edgesExtracted: number;
  };
}> {
  const startTime = Date.now();

  // Combine all chunks into a single text for LLM processing
  const fullContent = chunks.map(chunk => chunk.content).join('\n\n');

  console.log(`🚀 Processing document with ${chunks.length} chunks (${fullContent.length} characters)`);

  try {
    // Extract entities and edges using LLM
    const extractionResult = await unifiedLLMEntityExtractor.extractEntitiesAndEdges(
      fullContent,
      existingEntities,
      metadata,
      config
    );

    // Convert entities to internal format
    const entities = unifiedLLMEntityExtractor.convertToInternalFormat(
      extractionResult.entities,
      documentId
    );

    // Return the extracted edges for processing after entity persistence
    // Note: these edges contain temp_id references that need to be mapped to actual entity IDs
    const edges = extractionResult.edges;

    const processingTime = Date.now() - startTime;

    console.log(`✅ LLM entity+edge extraction completed in ${processingTime}ms`);
    console.log(`📊 Results: ${entities.length} entities, ${extractionResult.edges.length} edges extracted`);

    return {
      entities,
      edges: [], // Empty - will be processed after entity persistence
      extractionMetadata: {
        totalProcessed: chunks.length,
        llmCalls: 1,
        processingTime,
        entitiesExtracted: entities.length,
        edgesExtracted: extractionResult.edges.length
      },
      // Include the validated edges with temp_ids for processing after entity persistence
      rawLLMEdges: extractionResult.edges,
      // Include the original extracted entities with temp_ids for mapping
      originalEntitiesWithTempIds: extractionResult.entities
    };

  } catch (error) {
    console.error('❌ LLM entity+edge extraction failed:', error);
    throw error;
  }
}

/**
 * Legacy function for backward compatibility - now uses combined extraction
 */
export async function extractEntitiesWithLLM(
  documentId: string,
  metadata: DocumentMetadata,
  chunks: DocumentChunk[],
  existingEntities: Entity[],
  config: LLMEntityExtractionConfig
): Promise<{
  entities: Partial<Entity>[];
  extractionMetadata: {
    totalProcessed: number;
    llmCalls: number;
    processingTime: number;
  };
}> {
  const result = await extractEntitiesAndEdgesWithLLM(
    documentId,
    metadata,
    chunks,
    existingEntities,
    config
  );

  return {
    entities: result.entities,
    extractionMetadata: {
      totalProcessed: result.extractionMetadata.totalProcessed,
      llmCalls: result.extractionMetadata.llmCalls,
      processingTime: result.extractionMetadata.processingTime
    }
  };
}

/**
 * Persona-aware entity extraction - automatically generates configuration based on persona
 */
export async function extractEntitiesWithPersona(
  documentId: string,
  metadata: DocumentMetadata,
  chunks: DocumentChunk[],
  existingEntities: Entity[],
  persona: Persona
): Promise<{
  entities: Partial<Entity>[];
  extractionMetadata: {
    totalProcessed: number;
    llmCalls: number;
    processingTime: number;
    personaUsed: Persona;
    isEnhanced: boolean;
  };
}> {
  console.log(`🎭 Starting persona-aware entity extraction with persona: ${persona}`);

  // Generate persona-specific configuration
  const config = UnifiedLLMEntityExtractor.generatePersonaConfig(persona);
  const isEnhanced = personaManager.isEnhanced(persona);

  console.log(`🔧 Generated ${isEnhanced ? 'enhanced' : 'basic'} extraction config for ${persona}`);
  console.log(`🎯 Focus domains: ${config.focusDomains.join(', ')}`);

  const result = await extractEntitiesAndEdgesWithLLM(
    documentId,
    metadata,
    chunks,
    existingEntities,
    config
  );

  return {
    entities: result.entities,
    extractionMetadata: {
      totalProcessed: result.extractionMetadata.totalProcessed,
      llmCalls: result.extractionMetadata.llmCalls,
      processingTime: result.extractionMetadata.processingTime,
      personaUsed: persona,
      isEnhanced
    }
  };
}