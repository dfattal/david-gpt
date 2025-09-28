/**
 * Cross-Document Entity Consolidation System
 *
 * Consolidates entities across document boundaries to create a unified
 * knowledge graph with merged authority scores, relationships, and aliases.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { Entity, EntityKind, EntityAlias, KnowledgeEdge } from './types';

// ===========================
// Entity Consolidation Types
// ===========================

export interface EntityConsolidationConfig {
  similarityThreshold: number; // Name similarity threshold for merging
  authorityMergeStrategy: 'max' | 'average' | 'weighted_sum';
  mentionMergeStrategy: 'sum' | 'max' | 'weighted_average';
  enableCrossTypeConsolidation: boolean; // Allow merging across entity types
  maxConsolidationCandidates: number; // Limit candidates per entity
  batchSize: number; // Entities to process per batch
  preserveSourceDocuments: boolean; // Keep track of source documents
  enableAliasDetection: boolean; // Detect and merge aliases
}

export interface ConsolidationResult {
  entitiesProcessed: number;
  entitiesMerged: number;
  aliasesCreated: number;
  relationshipsUpdated: number;
  executionTime: number;
  qualityMetrics: ConsolidationQualityMetrics;
  mergeDecisions: MergeDecision[];
}

export interface ConsolidationQualityMetrics {
  avgSimilarityScore: number;
  confidenceScore: number;
  consolidationRatio: number; // % of entities that were consolidated
  authorityImprovement: number; // Improvement in average authority
  qualityScore: number; // Overall quality of consolidation
}

export interface MergeDecision {
  primaryEntityId: string;
  primaryEntityName: string;
  mergedEntityIds: string[];
  mergedEntityNames: string[];
  similarityScore: number;
  mergeReason: 'name_similarity' | 'alias_match' | 'manual_override';
  confidence: number;
  mergedAuthority: number;
  mergedMentions: number;
}

export interface EntityCluster {
  entities: Entity[];
  primaryEntity: Entity;
  averageSimilarity: number;
  consolidatedAuthority: number;
  consolidatedMentions: number;
  aliases: string[];
  sourceDocuments: Set<string>;
}

// ===========================
// Default Configuration
// ===========================

const DEFAULT_CONSOLIDATION_CONFIG: EntityConsolidationConfig = {
  similarityThreshold: 0.85, // High threshold for conservative merging
  authorityMergeStrategy: 'weighted_sum', // Weight by mention count
  mentionMergeStrategy: 'sum', // Add all mentions together
  enableCrossTypeConsolidation: false, // Don't merge across types initially
  maxConsolidationCandidates: 20, // Limit search space
  batchSize: 100, // Process 100 entities at a time
  preserveSourceDocuments: true, // Track document sources
  enableAliasDetection: true, // Enable alias detection
};

// ===========================
// Cross-Document Entity Consolidator
// ===========================

export class CrossDocumentEntityConsolidator {
  private config: EntityConsolidationConfig;

  constructor(config: Partial<EntityConsolidationConfig> = {}) {
    this.config = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
  }

  /**
   * Main consolidation method - processes all entities in the database
   */
  async consolidateEntities(): Promise<ConsolidationResult> {
    const startTime = Date.now();

    console.log('🔄 Starting cross-document entity consolidation...');

    // Get all entities grouped by type for efficient processing
    const entitiesByType = await this.getEntitiesGroupedByType();

    let totalProcessed = 0;
    let totalMerged = 0;
    let totalAliases = 0;
    let totalRelationshipsUpdated = 0;
    const allMergeDecisions: MergeDecision[] = [];

    // Process each entity type separately
    for (const [entityType, entities] of entitiesByType.entries()) {
      console.log(`🔍 Processing ${entities.length} ${entityType} entities...`);

      const typeResult = await this.consolidateEntitiesByType(
        entities,
        entityType
      );

      totalProcessed += typeResult.entitiesProcessed;
      totalMerged += typeResult.entitiesMerged;
      totalAliases += typeResult.aliasesCreated;
      totalRelationshipsUpdated += typeResult.relationshipsUpdated;
      allMergeDecisions.push(...typeResult.mergeDecisions);

      console.log(
        `   ✅ ${entityType}: ${typeResult.entitiesMerged} merges, ${typeResult.aliasesCreated} aliases`
      );
    }

    // Calculate overall quality metrics
    const qualityMetrics = this.calculateConsolidationQuality(
      allMergeDecisions,
      totalProcessed,
      totalMerged
    );

    const executionTime = Date.now() - startTime;

    console.log(
      `✅ Cross-document consolidation completed in ${executionTime}ms`
    );
    console.log(`   Processed: ${totalProcessed} entities`);
    console.log(
      `   Merged: ${totalMerged} entities (${((totalMerged / totalProcessed) * 100).toFixed(1)}%)`
    );
    console.log(`   Aliases: ${totalAliases} created`);
    console.log(`   Quality score: ${qualityMetrics.qualityScore.toFixed(3)}`);

    return {
      entitiesProcessed: totalProcessed,
      entitiesMerged: totalMerged,
      aliasesCreated: totalAliases,
      relationshipsUpdated: totalRelationshipsUpdated,
      executionTime,
      qualityMetrics,
      mergeDecisions: allMergeDecisions,
    };
  }

  /**
   * Get all entities grouped by type for efficient processing
   */
  private async getEntitiesGroupedByType(): Promise<Map<EntityKind, Entity[]>> {
    const { data: entities, error } = await supabaseAdmin
      .from('entities')
      .select('*')
      .order('authority_score', { ascending: false }); // Process high-authority entities first

    if (error) {
      throw new Error(`Failed to fetch entities: ${error.message}`);
    }

    if (!entities) {
      return new Map();
    }

    const groupedEntities = new Map<EntityKind, Entity[]>();

    for (const entity of entities) {
      const kind = entity.kind as EntityKind;
      if (!groupedEntities.has(kind)) {
        groupedEntities.set(kind, []);
      }
      groupedEntities.get(kind)!.push(entity as Entity);
    }

    return groupedEntities;
  }

  /**
   * Consolidate entities of a specific type
   */
  private async consolidateEntitiesByType(
    entities: Entity[],
    entityType: EntityKind
  ): Promise<ConsolidationResult> {
    let entitiesProcessed = 0;
    let entitiesMerged = 0;
    let aliasesCreated = 0;
    let relationshipsUpdated = 0;
    const mergeDecisions: MergeDecision[] = [];

    // Create clusters of similar entities
    const clusters = await this.createEntityClusters(entities);

    console.log(
      `   📊 Created ${clusters.length} clusters from ${entities.length} entities`
    );

    // Process each cluster
    for (const cluster of clusters) {
      if (cluster.entities.length > 1) {
        const mergeResult = await this.mergeEntityCluster(cluster);

        entitiesProcessed += cluster.entities.length;
        entitiesMerged += cluster.entities.length - 1; // All but primary entity
        aliasesCreated += mergeResult.aliasesCreated;
        relationshipsUpdated += mergeResult.relationshipsUpdated;

        if (mergeResult.mergeDecision) {
          mergeDecisions.push(mergeResult.mergeDecision);
        }
      } else {
        entitiesProcessed += 1; // Count single entities as processed
      }
    }

    return {
      entitiesProcessed,
      entitiesMerged,
      aliasesCreated,
      relationshipsUpdated,
      executionTime: 0, // Will be calculated at top level
      qualityMetrics: this.calculateConsolidationQuality(
        mergeDecisions,
        entitiesProcessed,
        entitiesMerged
      ),
      mergeDecisions,
    };
  }

  /**
   * Create clusters of similar entities using similarity thresholds
   */
  private async createEntityClusters(
    entities: Entity[]
  ): Promise<EntityCluster[]> {
    const clusters: EntityCluster[] = [];
    const processed = new Set<string>();

    for (const entity of entities) {
      if (processed.has(entity.id)) continue;

      const cluster: EntityCluster = {
        entities: [entity],
        primaryEntity: entity,
        averageSimilarity: 1.0,
        consolidatedAuthority: entity.authorityScore || 0,
        consolidatedMentions: entity.mentionCount || 0,
        aliases: [],
        sourceDocuments: new Set(),
      };

      processed.add(entity.id);

      // Find similar entities to add to this cluster
      const similarEntities = await this.findSimilarEntities(
        entity,
        entities.filter(e => !processed.has(e.id))
      );

      for (const similar of similarEntities) {
        cluster.entities.push(similar.entity);
        processed.add(similar.entity.id);

        // Update cluster metrics
        cluster.consolidatedAuthority = this.mergeAuthority(
          cluster.consolidatedAuthority,
          similar.entity.authorityScore || 0,
          cluster.consolidatedMentions,
          similar.entity.mentionCount || 0
        );

        cluster.consolidatedMentions = this.mergeMentions(
          cluster.consolidatedMentions,
          similar.entity.mentionCount || 0
        );
      }

      // Calculate average similarity within cluster
      if (cluster.entities.length > 1) {
        cluster.averageSimilarity = this.calculateClusterSimilarity(
          cluster.entities
        );
      }

      // Determine primary entity (highest authority)
      cluster.primaryEntity = cluster.entities.reduce((best, current) =>
        (current.authorityScore || 0) > (best.authorityScore || 0)
          ? current
          : best
      );

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Find entities similar to the given entity
   */
  private async findSimilarEntities(
    targetEntity: Entity,
    candidateEntities: Entity[]
  ): Promise<Array<{ entity: Entity; similarity: number }>> {
    const similarEntities: Array<{ entity: Entity; similarity: number }> = [];

    // Limit candidates for performance
    const candidates = candidateEntities.slice(
      0,
      this.config.maxConsolidationCandidates
    );

    for (const candidate of candidates) {
      const similarity = this.calculateEntitySimilarity(
        targetEntity,
        candidate
      );

      if (similarity >= this.config.similarityThreshold) {
        similarEntities.push({ entity: candidate, similarity });
      }
    }

    // Sort by similarity (highest first)
    return similarEntities.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity between two entities
   */
  private calculateEntitySimilarity(entity1: Entity, entity2: Entity): number {
    // Don't merge across types unless explicitly enabled
    if (
      !this.config.enableCrossTypeConsolidation &&
      entity1.kind !== entity2.kind
    ) {
      return 0;
    }

    // Primary similarity based on name
    const nameSimilarity = this.calculateNameSimilarity(
      entity1.name,
      entity2.name
    );

    // Bonus for additional matching factors
    let bonusScore = 0;

    // Same description patterns
    if (entity1.description && entity2.description) {
      const descSimilarity = this.calculateTextSimilarity(
        entity1.description,
        entity2.description
      );
      bonusScore += descSimilarity * 0.1;
    }

    // Similar authority scores (indicates similar extraction confidence)
    const authDiff = Math.abs(
      (entity1.authorityScore || 0) - (entity2.authorityScore || 0)
    );
    if (authDiff < 0.2) {
      bonusScore += 0.05;
    }

    return Math.min(1.0, nameSimilarity + bonusScore);
  }

  /**
   * Calculate name similarity with normalization
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);

    // Exact match after normalization
    if (normalized1 === normalized2) {
      return 1.0;
    }

    // Levenshtein-based similarity
    const editDistance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    if (maxLength === 0) return 0;

    const similarity = 1 - editDistance / maxLength;

    // Bonus for common prefixes/suffixes
    const prefixMatch = this.longestCommonPrefix(normalized1, normalized2);
    const suffixMatch = this.longestCommonSuffix(normalized1, normalized2);

    const prefixBonus = Math.min(
      0.1,
      prefixMatch / Math.max(normalized1.length, normalized2.length)
    );
    const suffixBonus = Math.min(
      0.1,
      suffixMatch / Math.max(normalized1.length, normalized2.length)
    );

    return Math.min(1.0, similarity + prefixBonus + suffixBonus);
  }

  /**
   * Normalize entity name for comparison
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\b(inc|corp|ltd|llc|company|co)\b/g, '') // Remove company suffixes
      .trim();
  }

  /**
   * Merge an entity cluster into a single consolidated entity
   */
  private async mergeEntityCluster(cluster: EntityCluster): Promise<{
    aliasesCreated: number;
    relationshipsUpdated: number;
    mergeDecision: MergeDecision | null;
  }> {
    const primaryEntity = cluster.primaryEntity;
    const entitiesToMerge = cluster.entities.filter(
      e => e.id !== primaryEntity.id
    );

    if (entitiesToMerge.length === 0) {
      return {
        aliasesCreated: 0,
        relationshipsUpdated: 0,
        mergeDecision: null,
      };
    }

    console.log(
      `   🔗 Merging ${entitiesToMerge.length} entities into "${primaryEntity.name}"`
    );

    let aliasesCreated = 0;
    let relationshipsUpdated = 0;

    // Update primary entity with consolidated data
    const consolidatedAuthority = cluster.consolidatedAuthority;
    const consolidatedMentions = cluster.consolidatedMentions;

    const { error: updateError } = await supabaseAdmin
      .from('entities')
      .update({
        authority_score: consolidatedAuthority,
        mention_count: consolidatedMentions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', primaryEntity.id);

    if (updateError) {
      console.error(
        `Failed to update primary entity ${primaryEntity.id}:`,
        updateError
      );
      return {
        aliasesCreated: 0,
        relationshipsUpdated: 0,
        mergeDecision: null,
      };
    }

    // Create aliases for merged entities
    for (const entityToMerge of entitiesToMerge) {
      if (
        this.config.enableAliasDetection &&
        entityToMerge.name !== primaryEntity.name
      ) {
        const { error: aliasError } = await supabaseAdmin
          .from('entity_aliases')
          .insert({
            entity_id: primaryEntity.id,
            alias: entityToMerge.name,
            confidence: this.calculateEntitySimilarity(
              primaryEntity,
              entityToMerge
            ),
            created_at: new Date().toISOString(),
          });

        if (!aliasError) {
          aliasesCreated++;
        } else {
          console.warn(
            `Failed to create alias "${entityToMerge.name}" for "${primaryEntity.name}":`,
            aliasError
          );
        }
      }
    }

    // Update relationships to point to primary entity
    for (const entityToMerge of entitiesToMerge) {
      // Update relationships where this entity is the source
      const { error: sourceUpdateError } = await supabaseAdmin
        .from('knowledge_edges')
        .update({ source_entity: primaryEntity.name })
        .eq('source_entity', entityToMerge.name);

      // Update relationships where this entity is the target
      const { error: targetUpdateError } = await supabaseAdmin
        .from('knowledge_edges')
        .update({ target_entity: primaryEntity.name })
        .eq('target_entity', entityToMerge.name);

      if (!sourceUpdateError && !targetUpdateError) {
        relationshipsUpdated++;
      }
    }

    // Remove merged entities from entities table
    const entityIdsToRemove = entitiesToMerge.map(e => e.id);
    const { error: deleteError } = await supabaseAdmin
      .from('entities')
      .delete()
      .in('id', entityIdsToRemove);

    if (deleteError) {
      console.warn(`Failed to delete merged entities:`, deleteError);
    }

    // Create merge decision record
    const mergeDecision: MergeDecision = {
      primaryEntityId: primaryEntity.id,
      primaryEntityName: primaryEntity.name,
      mergedEntityIds: entityIdsToRemove,
      mergedEntityNames: entitiesToMerge.map(e => e.name),
      similarityScore: cluster.averageSimilarity,
      mergeReason: 'name_similarity',
      confidence: cluster.averageSimilarity,
      mergedAuthority: consolidatedAuthority,
      mergedMentions: consolidatedMentions,
    };

    return {
      aliasesCreated,
      relationshipsUpdated,
      mergeDecision,
    };
  }

  /**
   * Helper methods for text processing and similarity calculation
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1, // deletion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private longestCommonPrefix(str1: string, str2: string): number {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++;
    }
    return i;
  }

  private longestCommonSuffix(str1: string, str2: string): number {
    let i = 0;
    while (
      i < str1.length &&
      i < str2.length &&
      str1[str1.length - 1 - i] === str2[str2.length - 1 - i]
    ) {
      i++;
    }
    return i;
  }

  /**
   * Authority and mention merging strategies
   */
  private mergeAuthority(
    authority1: number,
    authority2: number,
    mentions1: number,
    mentions2: number
  ): number {
    switch (this.config.authorityMergeStrategy) {
      case 'max':
        return Math.max(authority1, authority2);

      case 'average':
        return (authority1 + authority2) / 2;

      case 'weighted_sum':
        const totalMentions = mentions1 + mentions2;
        if (totalMentions === 0) return Math.max(authority1, authority2);
        return (
          (authority1 * mentions1 + authority2 * mentions2) / totalMentions
        );

      default:
        return Math.max(authority1, authority2);
    }
  }

  private mergeMentions(mentions1: number, mentions2: number): number {
    switch (this.config.mentionMergeStrategy) {
      case 'sum':
        return mentions1 + mentions2;

      case 'max':
        return Math.max(mentions1, mentions2);

      case 'weighted_average':
        return Math.round((mentions1 + mentions2) / 2);

      default:
        return mentions1 + mentions2;
    }
  }

  /**
   * Calculate average similarity within a cluster
   */
  private calculateClusterSimilarity(entities: Entity[]): number {
    if (entities.length < 2) return 1.0;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < entities.length - 1; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        totalSimilarity += this.calculateEntitySimilarity(
          entities[i],
          entities[j]
        );
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 1.0;
  }

  /**
   * Calculate overall consolidation quality metrics
   */
  private calculateConsolidationQuality(
    mergeDecisions: MergeDecision[],
    totalProcessed: number,
    totalMerged: number
  ): ConsolidationQualityMetrics {
    if (mergeDecisions.length === 0) {
      return {
        avgSimilarityScore: 0,
        confidenceScore: 0,
        consolidationRatio: 0,
        authorityImprovement: 0,
        qualityScore: 0,
      };
    }

    const avgSimilarityScore =
      mergeDecisions.reduce(
        (sum, decision) => sum + decision.similarityScore,
        0
      ) / mergeDecisions.length;

    const confidenceScore =
      mergeDecisions.reduce((sum, decision) => sum + decision.confidence, 0) /
      mergeDecisions.length;

    const consolidationRatio =
      totalProcessed > 0 ? totalMerged / totalProcessed : 0;

    // Calculate authority improvement (simplified)
    const authorityImprovement =
      mergeDecisions.reduce(
        (sum, decision) => sum + Math.max(0, decision.mergedAuthority - 0.5),
        0
      ) / mergeDecisions.length;

    const qualityScore =
      avgSimilarityScore * 0.4 +
      confidenceScore * 0.3 +
      consolidationRatio * 0.2 +
      authorityImprovement * 0.1;

    return {
      avgSimilarityScore,
      confidenceScore,
      consolidationRatio,
      authorityImprovement,
      qualityScore,
    };
  }
}

// Export singleton instance
export const crossDocumentEntityConsolidator =
  new CrossDocumentEntityConsolidator();

/**
 * Convenience function for running entity consolidation
 */
export async function consolidateEntitiesAcrossDocuments(
  config?: Partial<EntityConsolidationConfig>
): Promise<ConsolidationResult> {
  const consolidator = new CrossDocumentEntityConsolidator(config);
  return await consolidator.consolidateEntities();
}

/**
 * Batch consolidation for specific entity types
 */
export async function consolidateEntitiesByType(
  entityType: EntityKind,
  config?: Partial<EntityConsolidationConfig>
): Promise<ConsolidationResult> {
  const consolidator = new CrossDocumentEntityConsolidator(config);

  const { data: entities, error } = await supabaseAdmin
    .from('entities')
    .select('*')
    .eq('kind', entityType)
    .order('authority_score', { ascending: false });

  if (error || !entities) {
    throw new Error(
      `Failed to fetch ${entityType} entities: ${error?.message}`
    );
  }

  return await consolidator['consolidateEntitiesByType'](
    entities as Entity[],
    entityType
  );
}
