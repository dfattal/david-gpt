/**
 * Unified Entity Processor
 * 
 * Consolidates three separate entity extractors into a single dispatcher system:
 * - entity-extraction.ts (main, comprehensive)
 * - domain-entity-extractor.ts (3D displays focus)  
 * - press-article-entity-extractor.ts (product focus)
 * 
 * Provides document-type routing and standardized quality assessment.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { 
  Entity, 
  EntityKind, 
  EntityAlias,
  DocumentMetadata,
  DocumentChunk,
  KnowledgeEdge,
  RelationType
} from './types';

// Import new unified system
import { modernEntityExtractor } from './entity-extraction-service';
import { semanticEntityDeduplicator } from './semantic-entity-deduplicator';

// ===========================
// Unified Entity Processing Types
// ===========================

export interface EntityExtractionResult {
  entities: Partial<Entity>[];
  aliases: Partial<EntityAlias>[];
  relationships: Array<{
    srcName: string;
    srcType: EntityKind;
    relation: RelationType | string;
    dstName: string; 
    dstType: EntityKind;
    confidence: number;
    evidenceText: string;
  }>;
  strategy: EntityExtractionStrategy;
  metadata: {
    totalEntitiesFound: number;
    entitiesByKind: Record<EntityKind, number>;
    avgAuthorityScore: number;
    relationshipsFound: number;
    extractionTime: number;
  };
}

export interface EntityExtractionStrategy {
  name: string;
  description: string;
  primary: boolean;
  qualityThresholds: Record<EntityKind, number>;
  sectionAware: boolean;
  relationshipExtraction: boolean;
}

export interface ExtractionContext {
  documentType: string;
  documentAnalysis?: any;
  contentLength: number;
  hasStructuredMetadata: boolean;
  domainSpecific: boolean;
  chunks?: DocumentChunk[];
}

// ===========================
// Extraction Strategies
// ===========================

const EXTRACTION_STRATEGIES: Record<string, EntityExtractionStrategy> = {
  technical: {
    name: 'Technical Documentation',
    description: 'Specialized extraction for technical FAQs, specifications, and documentation',
    primary: false,
    qualityThresholds: {
      person: 0.3,
      organization: 0.4,
      technology: 0.2,
      product: 0.3,
      component: 0.15,
      document: 0.5,
      dataset: 0.4
    },
    sectionAware: true,
    relationshipExtraction: true
  },

  comprehensive: {
    name: 'Comprehensive',
    description: 'Main extraction using comprehensive patterns and section awareness',
    primary: true,
    qualityThresholds: {
      person: 0.4,
      organization: 0.3,
      technology: 0.25,
      product: 0.3,
      component: 0.2,
      document: 0.6,
      dataset: 0.4
    },
    sectionAware: true,
    relationshipExtraction: true
  },

  domain: {
    name: 'Domain-Specific',
    description: 'Specialized extraction for 3D displays and computer vision',
    primary: false,
    qualityThresholds: {
      person: 0.7,
      organization: 0.8,
      technology: 0.7,
      product: 0.8,
      component: 0.6,
      document: 0.8,
      dataset: 0.7
    },
    sectionAware: true,
    relationshipExtraction: true
  },

  press: {
    name: 'Press Article',
    description: 'Specialized extraction for press articles with product relationships',
    primary: false,
    qualityThresholds: {
      person: 0.6,
      organization: 0.7,
      technology: 0.7,
      product: 0.6,
      component: 0.5,
      document: 0.6,
      dataset: 0.4
    },
    sectionAware: false,
    relationshipExtraction: true
  },

  fallback: {
    name: 'Fallback',
    description: 'Basic extraction with conservative patterns',
    primary: false,
    qualityThresholds: {
      person: 0.6,
      organization: 0.5,
      technology: 0.4,
      product: 0.5,
      component: 0.3,
      document: 0.7,
      dataset: 0.5
    },
    sectionAware: false,
    relationshipExtraction: false
  }
};

// ===========================
// Main Unified Entity Processor
// ===========================

export class UnifiedEntityProcessor {
  
  /**
   * Extract entities using the most appropriate strategy for the document
   */
  async extractEntities(
    documentId: string,
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Starting unified entity extraction for: ${metadata.title}`);
    
    // 1. Analyze context and select strategy
    const context = this.analyzeExtractionContext(metadata, chunks);
    const strategy = this.selectExtractionStrategy(context);
    
    console.log(`📋 Selected strategy: ${strategy.name} (${strategy.description})`);
    
    // 2. Execute extraction using selected strategy
    const result = await this.executeExtractionStrategy(
      strategy, 
      documentId,
      metadata, 
      chunks, 
      context
    );
    
    console.log(`🔍 Raw extraction results:`);
    console.log(`   Entities: ${result.entities.length}`);
    console.log(`   Relationships: ${result.relationships.length}`);
    console.log(`   Aliases: ${result.aliases.length}`);
    if (result.relationships.length > 0) {
      console.log(`   Sample relationships:`);
      result.relationships.slice(0, 3).forEach(rel => {
        console.log(`     ${rel.srcName} (${rel.srcType}) --${rel.relation}--> ${rel.dstName} (${rel.dstType}) [${rel.confidence}]`);
      });
    }
    
    // 3. Apply quality filtering and consolidation
    const filteredResult = await this.applyQualityFiltering(result, strategy, metadata, chunks);
    
    // 4. Calculate extraction metadata
    const extractionTime = Date.now() - startTime;
    const extractionMetadata = this.calculateExtractionMetadata(
      filteredResult, 
      extractionTime
    );
    
    console.log(`✅ Unified extraction completed in ${extractionTime}ms`);
    console.log(`   Entities: ${filteredResult.entities.length}, Relationships: ${filteredResult.relationships.length}`);
    
    return {
      ...filteredResult,
      strategy,
      metadata: extractionMetadata
    };
  }
  
  /**
   * Analyze extraction context to inform strategy selection
   */
  private analyzeExtractionContext(
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): ExtractionContext {
    const contentLength = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    
    // Check for structured metadata
    const hasStructuredMetadata = Boolean(
      metadata.patentNo || 
      metadata.doi || 
      metadata.arxivId ||
      (metadata as any).oem ||
      (metadata as any).model
    );
    
    // Check for domain-specific content
    const fullContent = chunks.map(c => c.content).join(' ').toLowerCase();
    const domainKeywords = ['3d display', 'lightfield', 'holographic', 'leia', 'autostereoscopic', 'parallax'];
    const domainSpecific = domainKeywords.some(keyword => fullContent.includes(keyword));
    
    return {
      documentType: metadata.docType,
      contentLength,
      hasStructuredMetadata,
      domainSpecific,
      chunks
    };
  }
  
  /**
   * Select the most appropriate extraction strategy
   */
  private selectExtractionStrategy(context: ExtractionContext): EntityExtractionStrategy {
    console.log(`🔍 Strategy selection context:`, {
      documentType: context.documentType,
      contentLength: context.contentLength,
      hasStructuredMetadata: context.hasStructuredMetadata,
      domainSpecific: context.domainSpecific,
      documentAnalysis: context.documentAnalysis?.characteristics
    });
    
    // Technical documentation gets highest priority for FAQ/technical content
    const isTechnical = this.isTechnicalDocument(context);
    if (isTechnical) {
      console.log(`✅ Selected strategy: Technical Documentation (${isTechnical.reason})`);
      return EXTRACTION_STRATEGIES.technical;
    }
    
    // Press articles get high priority for commercial announcements
    const isPress = context.documentType === 'press-article' || this.isPressArticleContent(context);
    if (isPress) {
      console.log(`✅ Selected strategy: Press Article (documentType = ${context.documentType}, content detected = ${this.isPressArticleContent(context)})`);
      return EXTRACTION_STRATEGIES.press;
    }
    
    // Domain-specific content for 3D displays (but not press articles or technical docs)
    if (context.domainSpecific && !isPress && !isTechnical) {
      console.log(`✅ Selected strategy: Domain-Specific (domainSpecific = true, not press/technical)`);
      return EXTRACTION_STRATEGIES.domain;
    }
    
    // Patents and academic papers with structured metadata
    if (context.hasStructuredMetadata && 
        ['patent', 'paper', 'pdf'].includes(context.documentType)) {
      console.log(`✅ Selected strategy: Comprehensive (hasStructuredMetadata = true, docType = ${context.documentType})`);
      return EXTRACTION_STRATEGIES.comprehensive;
    }
    
    // Large documents with potential complexity
    if (context.contentLength > 10000) {
      console.log(`✅ Selected strategy: Comprehensive (contentLength = ${context.contentLength})`);
      return EXTRACTION_STRATEGIES.comprehensive;
    }
    
    // Fallback for simple documents
    console.log(`✅ Selected strategy: Comprehensive (fallback)`);
    return EXTRACTION_STRATEGIES.comprehensive;
  }

  /**
   * Check if document is technical documentation (FAQ, specs, etc.)
   */
  private isTechnicalDocument(context: ExtractionContext): { reason: string } | false {
    // Check document analysis characteristics
    if (context.documentAnalysis?.characteristics) {
      const characteristics = context.documentAnalysis.characteristics;
      
      if (characteristics.includes('technical-faq')) {
        return { reason: 'FAQ structure detected' };
      }
      
      if (characteristics.includes('technical-documentation')) {
        return { reason: 'technical documentation patterns detected' };
      }
      
      if (characteristics.includes('faq-filename')) {
        return { reason: 'FAQ in filename' };
      }
      
      if (characteristics.includes('technical-filename')) {
        return { reason: 'technical keywords in filename' };
      }
    }
    
    // Check document type and content patterns for notes/markdown
    if (context.documentType === 'note') {
      // Look for technical content indicators in chunks if available
      if (context.chunks && context.chunks.length > 0) {
        const content = context.chunks.map(c => c.content).join(' ');
        
        // FAQ patterns
        const faqPatterns = [
          /(?:^|\n)#{1,6}\s*(?:What|How|Why|When|Where|Which)\s+[^?\n]*\??\s*$/gmi,
          /(?:^|\n)\*\*Q(?:uestion)?:?\*\*\s+/gmi,
          /(?:^|\n)Q:?\s+/gmi,
        ];
        
        let faqMatches = 0;
        for (const pattern of faqPatterns) {
          faqMatches += (content.match(pattern) || []).length;
        }
        
        if (faqMatches >= 3) {
          return { reason: 'FAQ structure in content' };
        }
        
        // Technical terminology density
        const technicalTerms = [
          /\b(?:DLB|LCD|OLED|3D\s+Cell|LC\s+lens|lightfield)\b/gi,
          /\b(?:API|SDK|algorithm|calibration|configuration)\b/gi,
          /\b(?:specification|parameter|implementation)\b/gi,
        ];
        
        let technicalMatches = 0;
        for (const pattern of technicalTerms) {
          technicalMatches += (content.match(pattern) || []).length;
        }
        
        const words = content.split(/\s+/).length;
        const technicalDensity = technicalMatches / (words / 100); // per 100 words
        
        if (technicalDensity > 2) { // More than 2 technical terms per 100 words
          return { reason: 'high technical term density' };
        }
      }
    }
    
    return false;
  }
  
  /**
   * Execute extraction using the selected strategy
   */
  private async executeExtractionStrategy(
    strategy: EntityExtractionStrategy,
    documentId: string,
    metadata: DocumentMetadata,
    chunks: DocumentChunk[],
    context: ExtractionContext
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    let result: Omit<EntityExtractionResult, 'strategy' | 'metadata'>;
    
    switch (strategy.name) {
      case 'Technical Documentation':
        result = await this.executeTechnical(metadata, chunks);
        break;
        
      case 'Press Article':
        result = await this.executePress(metadata, chunks);
        break;
        
      case 'Domain-Specific':
        result = await this.executeDomain(metadata, chunks);
        break;
        
      case 'Comprehensive':
        result = await this.executeComprehensive(documentId, metadata, chunks);
        break;
        
      case 'Fallback':
      default:
        result = await this.executeFallback(documentId, metadata, chunks);
        break;
    }
    
    return result;
  }

  /**
   * Execute technical documentation extraction strategy
   */
  private async executeTechnical(
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    const fullContent = chunks.map(chunk => chunk.content).join('\n\n');
    
    const technicalResult = await technicalDocumentEntityExtractor.extractEntities(
      fullContent,
      metadata,
      chunks
    );
    
    // Convert format to match unified processor expectations
    const entities = technicalResult.entities.map(e => ({
      name: e.name,
      kind: e.kind,
      description: e.description,
      mentionCount: e.mentionCount,
      authorityScore: e.authorityScore,
    }));

    return {
      entities,
      aliases: [], // Technical extractor doesn't currently extract aliases
      relationships: technicalResult.relationships,
    };
  }
  
  /**
   * Execute press article extraction strategy
   */
  private async executePress(
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    const fullContent = chunks.map(chunk => chunk.content).join('\n\n');
    
    const pressResult = pressArticleEntityExtractor.extractFromPressArticle(
      metadata.title,
      fullContent,
      metadata
    );
    
    return {
      entities: pressResult.entities,
      aliases: [], // Press extractor doesn't generate aliases
      relationships: pressResult.relationships
    };
  }
  
  /**
   * Execute domain-specific extraction strategy
   */
  private async executeDomain(
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    return await domainEntityExtractor.extractFromDocument(metadata, chunks);
  }
  
  /**
   * Execute comprehensive extraction strategy
   */
  private async executeComprehensive(
    documentId: string,
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    return await entityExtractor.extractFromDocument(documentId, metadata, chunks);
  }
  
  /**
   * Execute fallback extraction strategy
   */
  private async executeFallback(
    documentId: string,
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    // Use comprehensive extractor but with more conservative settings
    const result = await entityExtractor.extractFromDocument(metadata, chunks);
    
    // Apply more aggressive filtering for fallback
    const filteredEntities = result.entities.filter(entity => 
      (entity.authorityScore || 0) > 0.5 && 
      (entity.mentionCount || 0) > 1
    );
    
    return {
      ...result,
      entities: filteredEntities
    };
  }
  
  /**
   * Apply comprehensive quality filtering using the quality framework
   */
  private async applyQualityFiltering(
    result: Omit<EntityExtractionResult, 'strategy' | 'metadata'>,
    strategy: EntityExtractionStrategy,
    metadata: DocumentMetadata,
    chunks: DocumentChunk[]
  ): Promise<Omit<EntityExtractionResult, 'strategy' | 'metadata'>> {
    
    const { assessEntitiesQuality } = await import('./entity-quality-framework');
    
    // Assess quality of all entities
    const qualityProfiles = assessEntitiesQuality(result.entities, {
      documentMetadata: metadata,
      chunks,
      extractionSource: strategy.primary ? 'structured' : 'content'
    });
    
    // Filter entities based on quality assessment
    const filteredProfiles = qualityProfiles.filter(profile => {
      // Use strategy thresholds as minimum, but also consider quality tier
      const minThreshold = strategy.qualityThresholds[profile.entity.kind!] || 0.3;
      const meetsThreshold = profile.metrics.overallScore >= minThreshold;
      const acceptableQuality = !['rejected'].includes(profile.qualityTier);
      
      return meetsThreshold && acceptableQuality;
    });
    
    // Extract the filtered entities
    const filteredEntities = filteredProfiles.map(profile => profile.entity);
    
    // Apply relationship quality filtering
    const filteredRelationships = result.relationships.filter(rel => 
      (rel.confidence || 0) >= 0.4
    );
    
    console.log(`🔍 Quality filtering: ${result.entities.length} → ${filteredEntities.length} entities`);
    console.log(`   Quality distribution: ${filteredProfiles.map(p => p.qualityTier).join(', ')}`);
    
    return {
      entities: filteredEntities,
      aliases: result.aliases,
      relationships: filteredRelationships
    };
  }
  
  /**
   * Calculate extraction metadata and statistics
   */
  private calculateExtractionMetadata(
    result: Omit<EntityExtractionResult, 'strategy' | 'metadata'>,
    extractionTime: number
  ) {
    const entitiesByKind: Record<EntityKind, number> = {
      person: 0,
      organization: 0,
      technology: 0,
      product: 0,
      component: 0,
      document: 0,
      dataset: 0
    };
    
    let totalAuthorityScore = 0;
    
    result.entities.forEach(entity => {
      if (entity.kind) {
        entitiesByKind[entity.kind]++;
      }
      if (entity.authorityScore) {
        totalAuthorityScore += entity.authorityScore;
      }
    });
    
    const avgAuthorityScore = result.entities.length > 0 
      ? totalAuthorityScore / result.entities.length 
      : 0;
    
    return {
      totalEntitiesFound: result.entities.length,
      entitiesByKind,
      avgAuthorityScore,
      relationshipsFound: result.relationships.length,
      extractionTime
    };
  }
  
  /**
   * Save extracted entities and relationships to database
   */
  async saveExtractedData(
    documentId: string,
    extractionResult: EntityExtractionResult
  ): Promise<void> {
    console.log(`💾 Saving ${extractionResult.entities.length} entities and ${extractionResult.relationships.length} relationships...`);
    
    // 1. Deduplicate entities in memory first
    const deduplicatedEntities = this.deduplicateEntities(extractionResult.entities);
    console.log(`🔀 In-memory deduplication: ${extractionResult.entities.length} → ${deduplicatedEntities.length} entities`);
    
    // 2. Apply semantic deduplication against existing database entities
    const semanticallyFilteredEntities = await this.applySemanticDeduplication(deduplicatedEntities);
    console.log(`🧠 Semantic deduplication: ${deduplicatedEntities.length} → ${semanticallyFilteredEntities.length} entities`);
    
    // 3. Validate relationships before saving
    const validRelationships = extractionResult.relationships.filter(rel => {
      if (!rel.srcName || !rel.dstName || !rel.relation) {
        console.warn(`⚠️  Invalid relationship: ${rel.srcName} --${rel.relation}--> ${rel.dstName}`);
        return false;
      }
      return true;
    });
    
    console.log(`🔍 Relationship validation: ${extractionResult.relationships.length} -> ${validRelationships.length} valid relationships`);
    
    // 4. Save entities with upsert logic
    for (const entity of semanticallyFilteredEntities) {
      if (!entity.name || !entity.kind) continue;
      
      await this.upsertEntity(entity);
    }
    
    // Save relationships with enhanced debugging
    console.log(`🔍 Processing ${validRelationships.length} relationships...`);
    
    for (const rel of validRelationships) {
      try {
        // Find source entity ID
        const { data: srcEntity } = await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('name', rel.srcName)
          .eq('kind', rel.srcType)
          .single();
          
        // Find destination entity ID  
        const { data: dstEntity } = await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('name', rel.dstName)
          .eq('kind', rel.dstType)
          .single();
          
        if (!srcEntity || !dstEntity) {
          console.warn(`⚠️  Skipping relationship - missing entities: ${rel.srcName} (${srcEntity ? '✓' : '✗'}) -> ${rel.dstName} (${dstEntity ? '✓' : '✗'})`);
          continue;
        }
        
        // Create entity-to-entity relationship
        const { error: relError } = await supabaseAdmin
          .from('edges')
          .insert({
            source_entity_id: srcEntity.id,
            target_entity_id: dstEntity.id,
            relation_type: rel.relation as any, // Type assertion for custom relation types
            confidence: rel.confidence,
            evidence_text: `${rel.srcName} (${rel.srcType}) -> ${rel.dstName} (${rel.dstType}): ${rel.evidenceText}`.substring(0, 500),
            source: 'entity_extraction',
            evidence_document_id: documentId
          });
          
        if (relError && relError.code !== '23505') { // Ignore duplicates
          console.error(`❌ Error saving relationship ${rel.srcName} -> ${rel.dstName}:`, relError);
          console.error('Full relationship data:', {
            srcName: rel.srcName,
            srcType: rel.srcType, 
            dstName: rel.dstName,
            dstType: rel.dstType,
            relation: rel.relation,
            confidence: rel.confidence
          });
        } else if (relError?.code === '23505') {
          console.log(`🔄 Relationship already exists: ${rel.srcName} -> ${rel.relation} -> ${rel.dstName}`);
        } else {
          console.log(`✅ Saved entity relationship: ${rel.srcName} -> ${rel.relation} -> ${rel.dstName}`);
        }
        
      } catch (err) {
        console.error(`❌ Exception saving relationship ${rel.srcName} -> ${rel.dstName}:`, err);
      }
    }
    
    console.log('✅ Entity extraction data saved successfully');
  }

  /**
   * Apply semantic deduplication against existing database entities
   */
  private async applySemanticDeduplication(entities: Entity[]): Promise<Entity[]> {
    console.log(`🧠 Starting semantic deduplication for ${entities.length} entities...`);
    
    // Get all existing entities from database by kind for comparison
    const existingEntitiesByKind = new Map<EntityKind, Partial<Entity>[]>();
    
    // Group entities by kind and fetch existing entities
    const entityKinds = [...new Set(entities.map(e => e.kind!).filter(k => k))];
    
    for (const kind of entityKinds) {
      const { data: existingEntities } = await supabaseAdmin
        .from('entities')
        .select('id, name, kind, description, authority_score, mention_count')
        .eq('kind', kind);
        
      if (existingEntities) {
        existingEntitiesByKind.set(kind, existingEntities);
        console.log(`🔍 Found ${existingEntities.length} existing ${kind} entities for comparison`);
      }
    }
    
    const filteredEntities: Entity[] = [];
    const mergedEntities: Array<{entity: Entity, mergedWith: string}> = [];
    const rejectedEntities: Array<{entity: Entity, reason: string}> = [];
    
    for (const newEntity of entities) {
      if (!newEntity.name || !newEntity.kind) {
        rejectedEntities.push({entity: newEntity, reason: 'Missing name or kind'});
        continue;
      }
      
      const existingOfSameKind = existingEntitiesByKind.get(newEntity.kind) || [];
      
      // INTRA-BATCH DEDUPLICATION: Also check against entities already processed in this batch
      const alreadyProcessedOfSameKind = filteredEntities.filter(e => e.kind === newEntity.kind);
      const allEntitiesForComparison = [...existingOfSameKind, ...alreadyProcessedOfSameKind];
      
      // Check for semantic similarity with existing entities AND entities already processed in this batch
      const deduplicationResult = await semanticEntityDeduplicator.checkEntityDuplication(
        newEntity, 
        allEntitiesForComparison
      );
      
      console.log(`🔍 "${newEntity.name}" (${newEntity.kind}): ${deduplicationResult.action} - ${deduplicationResult.explanation}`);
      
      switch (deduplicationResult.action) {
        case 'create':
          // This is a truly new entity
          filteredEntities.push(deduplicationResult.canonicalEntity as Entity);
          break;
          
        case 'merge':
          // This entity should be merged with an existing one
          if (deduplicationResult.canonicalEntity) {
            await this.updateExistingEntityStats(deduplicationResult.canonicalEntity, newEntity);
            mergedEntities.push({
              entity: newEntity, 
              mergedWith: deduplicationResult.canonicalEntity.name!
            });
          }
          break;
          
        case 'reject':
          // This entity should be rejected (likely duplicate below threshold)
          rejectedEntities.push({entity: newEntity, reason: deduplicationResult.explanation});
          break;
      }
    }
    
    console.log(`✅ Semantic deduplication results:`);
    console.log(`   📝 New entities: ${filteredEntities.length}`);
    console.log(`   🔄 Merged entities: ${mergedEntities.length}`);
    console.log(`   ❌ Rejected entities: ${rejectedEntities.length}`);
    
    if (mergedEntities.length > 0) {
      console.log(`🔄 Merged entities:`);
      mergedEntities.forEach(({entity, mergedWith}) => {
        console.log(`   - "${entity.name}" -> "${mergedWith}"`);
      });
    }
    
    if (rejectedEntities.length > 0) {
      console.log(`❌ Rejected entities:`);
      rejectedEntities.forEach(({entity, reason}) => {
        console.log(`   - "${entity.name}": ${reason}`);
      });
    }
    
    return filteredEntities;
  }

  /**
   * Update existing entity with new mention/authority stats
   */
  private async updateExistingEntityStats(canonicalEntity: Partial<Entity>, newEntity: Entity): Promise<void> {
    if (!canonicalEntity.name || !canonicalEntity.kind) return;
    
    try {
      const { error } = await supabaseAdmin
        .from('entities')
        .update({
          mention_count: (canonicalEntity.mentionCount || 0) + (newEntity.mentionCount || 1),
          authority_score: Math.max(canonicalEntity.authorityScore || 0, newEntity.authorityScore || 0),
          description: newEntity.description || canonicalEntity.description
        })
        .eq('name', canonicalEntity.name)
        .eq('kind', canonicalEntity.kind);
        
      if (error) {
        console.error(`❌ Error updating existing entity "${canonicalEntity.name}":`, error);
      } else {
        console.log(`🔄 Updated stats for existing entity: "${canonicalEntity.name}"`);
      }
    } catch (error) {
      console.error(`❌ Exception updating existing entity "${canonicalEntity.name}":`, error);
    }
  }

  /**
   * Deduplicate entities in memory before database operations
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const entityMap = new Map<string, Entity>();
    
    for (const entity of entities) {
      if (!entity.name || !entity.kind) continue;
      
      const key = `${entity.name.toLowerCase()}:${entity.kind.toLowerCase()}`;
      const existing = entityMap.get(key);
      
      if (existing) {
        // Merge entities: use higher authority score, combine mention counts
        const merged: Entity = {
          ...existing,
          authorityScore: Math.max(existing.authorityScore || 0, entity.authorityScore || 0),
          mentionCount: (existing.mentionCount || 0) + (entity.mentionCount || 0),
          // Use more descriptive description if available
          description: entity.description && entity.description.length > (existing.description?.length || 0) 
            ? entity.description 
            : existing.description
        };
        entityMap.set(key, merged);
      } else {
        entityMap.set(key, entity);
      }
    }
    
    return Array.from(entityMap.values());
  }

  /**
   * Upsert entity to database with proper conflict handling
   */
  private async upsertEntity(entity: Entity): Promise<void> {
    try {
      // First, try to find existing entity
      const { data: existingEntity } = await supabaseAdmin
        .from('entities')
        .select('id, mention_count, authority_score')
        .eq('name', entity.name)
        .eq('kind', entity.kind)
        .single();

      if (existingEntity) {
        // Update existing entity with combined stats
        const { error: updateError } = await supabaseAdmin
          .from('entities')
          .update({
            mention_count: (existingEntity.mention_count || 0) + (entity.mentionCount || 0),
            authority_score: Math.max(existingEntity.authority_score || 0, entity.authorityScore || 0),
            description: entity.description && entity.description.length > 0 ? entity.description : undefined
          })
          .eq('id', existingEntity.id);

        if (updateError) {
          console.error(`❌ Error updating entity ${entity.name}:`, updateError);
        } else {
          console.log(`🔄 Updated existing entity: ${entity.name} (${entity.kind})`);
        }
      } else {
        // Insert new entity
        const { error: insertError } = await supabaseAdmin
          .from('entities')
          .insert({
            name: entity.name,
            kind: entity.kind,
            description: entity.description,
            mention_count: entity.mentionCount || 1,
            authority_score: entity.authorityScore || 0.5
          });

        if (insertError && insertError.code !== '23505') { // Ignore unique constraint violations
          console.error(`❌ Error inserting entity ${entity.name}:`, insertError);
        } else if (insertError?.code === '23505') {
          console.log(`🔄 Entity already exists: ${entity.name} (${entity.kind})`);
        } else {
          console.log(`✅ Inserted new entity: ${entity.name} (${entity.kind})`);
        }
      }
    } catch (error) {
      console.error(`❌ Exception upserting entity ${entity.name}:`, error);
    }
  }

  /**
   * Detect if content appears to be from a press article based on patterns
   */
  private isPressArticleContent(context: ExtractionContext): boolean {
    if (!context.chunks || context.chunks.length === 0) {
      console.log(`🔍 Press article detection: No chunks available`);
      return false;
    }
    
    const text = context.chunks.map(chunk => chunk.content).join(' ').toLowerCase();
    
    // Look for press article indicators
    const pressIndicators = [
      // Company names that frequently appear in press releases
      /\b(samsung|lg|sony|tcl|apple|google|microsoft|nvidia)\b/gi,
      // Product categories
      /\b(smartphone|tablet|monitor|display|tv|gaming|console)\b/gi,
      // Technology terms common in press articles
      /\b(3d|oled|qled|refresh rate|resolution|gaming|immersive)\b/gi,
      // Press-specific language
      /\b(announces|launches|unveils|introduces|features|available)\b/gi,
      // Pricing and availability
      /\b(priced at|starts at|\$\d+|available|launch)\b/gi
    ];
    
    let matchCount = 0;
    for (const pattern of pressIndicators) {
      const matches = text.match(pattern);
      if (matches) {
        matchCount += matches.length;
      }
    }
    
    // If we have multiple indicators, likely a press article
    const threshold = 3;
    const isPress = matchCount >= threshold;
    
    console.log(`🔍 Press article detection: ${matchCount} indicators found (threshold: ${threshold}) -> ${isPress ? 'YES' : 'NO'}`);
    
    return isPress;
  }
}

// Export singleton instance
export const unifiedEntityProcessor = new UnifiedEntityProcessor();

/**
 * Create author-document relationships from document metadata
 */
async function createAuthorDocumentRelationships(documentId: string, document: any): Promise<void> {
  console.log(`🔗 Creating author-document relationships for: ${document.title}`);
  
  try {
    const authors: string[] = [];
    
    console.log(`🔍 Raw authors_affiliations field:`, {
      value: document.authors_affiliations,
      type: typeof document.authors_affiliations,
      isNull: document.authors_affiliations === null,
      isArray: Array.isArray(document.authors_affiliations)
    });
    
    // Extract authors from authors_affiliations field (handle both JSON string and object)
    if (document.authors_affiliations) {
      try {
        let authorsData;
        
        // Handle JSON string case (most common from Supabase)
        if (typeof document.authors_affiliations === 'string') {
          console.log(`📝 Parsing JSON string: ${document.authors_affiliations.substring(0, 100)}...`);
          authorsData = JSON.parse(document.authors_affiliations);
        }
        // Handle already parsed object case
        else if (typeof document.authors_affiliations === 'object') {
          console.log(`📋 Using already parsed object`);
          authorsData = document.authors_affiliations;
        }
        
        // Ensure we have an array
        const authorsArray = Array.isArray(authorsData) ? authorsData : [authorsData];
        console.log(`👥 Processing ${authorsArray.length} author entries`);
        
        for (const authorEntry of authorsArray) {
          let authorName = null;
          
          if (typeof authorEntry === 'string') {
            authorName = authorEntry;
          } else if (authorEntry && typeof authorEntry === 'object') {
            // Handle objects with name field
            if (authorEntry.name && typeof authorEntry.name === 'string') {
              authorName = authorEntry.name;
            } else if (authorEntry.author && typeof authorEntry.author === 'string') {
              authorName = authorEntry.author;
            }
          }
          
          if (authorName && authorName.trim()) {
            authors.push(authorName.trim());
            console.log(`✅ Added author: ${authorName.trim()}`);
          }
        }
      } catch (err) {
        console.warn(`⚠️  Failed to parse authors_affiliations:`, err);
        console.warn(`Raw data:`, document.authors_affiliations);
      }
    }
    
    // Extract inventors from inventors field (handle both JSON string and object)
    if (document.inventors) {
      console.log(`🔍 Raw inventors field:`, {
        value: document.inventors,
        type: typeof document.inventors,
        isNull: document.inventors === null
      });
      
      try {
        let inventorsData;
        
        // Handle JSON string case (most common from Supabase)
        if (typeof document.inventors === 'string') {
          console.log(`📝 Parsing inventors JSON string`);
          inventorsData = JSON.parse(document.inventors);
        }
        // Handle already parsed object case
        else if (typeof document.inventors === 'object') {
          console.log(`📋 Using already parsed inventors object`);
          inventorsData = document.inventors;
        }
        
        // Ensure we have an array
        const inventorsArray = Array.isArray(inventorsData) ? inventorsData : [inventorsData];
        console.log(`🔧 Processing ${inventorsArray.length} inventor entries`);
        
        for (const inventorEntry of inventorsArray) {
          let inventorName = null;
          
          if (typeof inventorEntry === 'string') {
            inventorName = inventorEntry;
          } else if (inventorEntry && typeof inventorEntry === 'object') {
            // Handle objects with name field
            if (inventorEntry.name && typeof inventorEntry.name === 'string') {
              inventorName = inventorEntry.name;
            } else if (inventorEntry.inventor && typeof inventorEntry.inventor === 'string') {
              inventorName = inventorEntry.inventor;
            }
          }
          
          if (inventorName && inventorName.trim()) {
            authors.push(inventorName.trim());
            console.log(`✅ Added inventor: ${inventorName.trim()}`);
          }
        }
      } catch (err) {
        console.warn(`⚠️  Failed to parse inventors:`, err);
        console.warn(`Raw inventors data:`, document.inventors);
      }
    }
    
    if (authors.length === 0) {
      console.log(`ℹ️  No authors/inventors found for document: ${document.title}`);
      return;
    }
    
    console.log(`👥 Found ${authors.length} authors/inventors: ${authors.join(', ')}`);
    
    // Create or update author entities and relationships
    let successfulRelationships = 0;
    for (const authorName of authors) {
      if (!authorName.trim()) continue;
      
      try {
        console.log(`🔄 Processing author: ${authorName}`);
        
        // Create or find author entity
        const authorEntity = await findOrCreateAuthorEntity(authorName);
        console.log(`👤 Author entity ready: ${authorEntity.name} (${authorEntity.id})`);
        
        // Create author-document relationship
        await createAuthorDocumentEdge(authorEntity.id, documentId, authorName);
        console.log(`🔗 Relationship created: ${authorName} <-> document`);
        
        successfulRelationships++;
        
      } catch (err) {
        console.error(`❌ Failed to create relationship for author ${authorName}:`, err);
      }
    }
    
    console.log(`✅ Successfully created ${successfulRelationships}/${authors.length} author-document relationships`);
    
  } catch (error) {
    console.error('❌ Error creating author-document relationships:', error);
    // Don't throw - this should not block entity processing
  }
}

/**
 * Find or create an author entity
 */
async function findOrCreateAuthorEntity(authorName: string): Promise<{id: string, name: string}> {
  const normalizedName = authorName.trim();
  
  // First try to find existing entity
  const { data: existingEntity } = await supabaseAdmin
    .from('entities')
    .select('id, name')
    .eq('name', normalizedName)
    .eq('kind', 'Person')
    .single();
  
  if (existingEntity) {
    console.log(`👤 Found existing author entity: ${normalizedName}`);
    return existingEntity;
  }
  
  // Create new author entity
  const { data: newEntity, error } = await supabaseAdmin
    .from('entities')
    .insert({
      name: normalizedName,
      kind: 'Person',
      authority_score: 0.8, // High confidence for document authors
      description: `Author/Inventor: ${normalizedName}`,
      source: 'document_metadata'
    })
    .select('id, name')
    .single();
  
  if (error || !newEntity) {
    throw new Error(`Failed to create author entity: ${error?.message}`);
  }
  
  console.log(`👤 Created new author entity: ${normalizedName}`);
  return newEntity;
}

/**
 * Create author-document relationship edge
 */
async function createAuthorDocumentEdge(authorEntityId: string, documentId: string, authorName: string): Promise<void> {
  console.log(`🔍 Creating edge: ${authorName} (${authorEntityId}) -> document (${documentId})`);
  
  // Check if relationship already exists
  const { data: existingEdge, error: checkError } = await supabaseAdmin
    .from('edges')
    .select('id')
    .eq('source_entity_id', authorEntityId)
    .eq('target_document_id', documentId)
    .eq('relation_type', 'AUTHORED_BY')
    .single();
  
  if (checkError && checkError.code !== 'PGRST116') {
    console.warn(`⚠️  Error checking existing edge:`, checkError);
  }
  
  if (existingEdge) {
    console.log(`🔄 Author-document relationship already exists: ${authorName} (${existingEdge.id})`);
    return;
  }
  
  // Create new relationship edge
  const edgeData = {
    source_entity_id: authorEntityId,
    target_document_id: documentId,
    relation_type: 'AUTHORED_BY',
    confidence: 0.95, // High confidence for document metadata
    evidence_text: `Author of document: ${authorName}`,
    source: 'document_metadata'
  };
  
  console.log(`📝 Inserting edge data:`, edgeData);
  
  const { data: newEdge, error } = await supabaseAdmin
    .from('edges')
    .insert(edgeData)
    .select('id')
    .single();
  
  if (error) {
    console.error(`❌ Database error creating edge:`, error);
    throw new Error(`Failed to create author-document edge: ${error.message}`);
  }
  
  console.log(`✅ Created author-document relationship: ${authorName} -> document (edge: ${newEdge?.id})`);
}

/**
 * Main entry point for document entity processing
 * Replaces the individual extractor functions
 */
export async function processDocumentEntities(documentId: string): Promise<void> {
  console.log(`🚀 Starting unified entity processing for document: ${documentId}`);
  
  try {
    // Get document metadata including author information
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, title, doc_type, patent_no, doi, arxiv_id, published_date, authors_affiliations, inventors')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // Get document chunks
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId);

    if (chunksError || !chunks) {
      throw new Error(`Document chunks not found: ${chunksError?.message}`);
    }

    // Transform to expected format
    const metadata: DocumentMetadata = {
      title: document.title,
      docType: document.doc_type,
      patentNo: document.patent_no,
      doi: document.doi,
      arxivId: document.arxiv_id,
      date: document.published_date
    };

    const documentChunks: DocumentChunk[] = chunks.map(chunk => ({ content: chunk.content }));

    // Extract entities using unified processor
    const result = await unifiedEntityProcessor.extractEntities(documentId, metadata, documentChunks);
    
    // Create author-document relationships
    await createAuthorDocumentRelationships(documentId, document);
    
    if (result.entities.length === 0) {
      console.log('✅ No entities extracted from this document, but author relationships created');
      return;
    }

    // Save to database
    await unifiedEntityProcessor.saveExtractedData(documentId, result);
    
    console.log(`✅ Unified entity processing completed for document: ${document.title}`);
    console.log(`   Strategy: ${result.strategy.name}`);
    console.log(`   Entities: ${result.metadata.totalEntitiesFound}`);
    console.log(`   Relationships: ${result.metadata.relationshipsFound}`);
    console.log(`   Avg Authority: ${result.metadata.avgAuthorityScore.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error in unified entity processing:', error);
    throw error;
  }
}