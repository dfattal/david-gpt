/**
 * Entity Resolution System
 * 
 * Handles duplicate detection, entity merging, alias management,
 * and authority score calculation for the mini knowledge graph.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { Entity, EntityAlias, EntityKind } from './types';

// =======================
// Entity Resolution Types
// =======================

export interface EntityCandidate extends Partial<Entity> {
  confidence: number;
  sources: string[];
  mentionContexts: string[];
}

export interface EntityMatch {
  existingEntity: Entity;
  candidate: EntityCandidate;
  similarityScore: number;
  matchType: 'exact' | 'fuzzy' | 'alias' | 'contextual';
}

export interface ResolutionResult {
  resolved: Entity;
  aliases: EntityAlias[];
  confidence: number;
  mergedFromIds?: string[];
}

// =======================
// Entity Resolver Class
// =======================

export class EntityResolver {
  private readonly EXACT_MATCH_THRESHOLD = 0.95;
  private readonly FUZZY_MATCH_THRESHOLD = 0.85;
  private readonly CONTEXTUAL_MATCH_THRESHOLD = 0.7;
  
  /**
   * Resolve a candidate entity against existing entities in the database
   */
  async resolveEntity(candidate: EntityCandidate): Promise<ResolutionResult> {
    console.log(`🔍 Resolving entity: ${candidate.name} (${candidate.kind})`);
    
    try {
      // Find potential matches
      const matches = await this.findEntityMatches(candidate);
      
      if (matches.length === 0) {
        // No matches found, create new entity
        return await this.createNewEntity(candidate);
      }
      
      // Sort matches by similarity score
      matches.sort((a, b) => b.similarityScore - a.similarityScore);
      const bestMatch = matches[0];
      
      // Decide whether to merge or create new entity
      if (bestMatch.similarityScore >= this.EXACT_MATCH_THRESHOLD) {
        return await this.mergeWithExistingEntity(bestMatch.existingEntity, candidate);
      } else if (bestMatch.similarityScore >= this.FUZZY_MATCH_THRESHOLD) {
        return await this.mergeWithFuzzyMatch(bestMatch.existingEntity, candidate, bestMatch.similarityScore);
      } else {
        // Create new entity but add potential aliases
        return await this.createNewEntityWithAliases(candidate, matches);
      }
      
    } catch (error) {
      console.error('Error in resolveEntity:', error);
      throw error;
    }
  }
  
  /**
   * Find potential entity matches using various strategies
   */
  private async findEntityMatches(candidate: EntityCandidate): Promise<EntityMatch[]> {
    const matches: EntityMatch[] = [];
    
    if (!candidate.name || !candidate.kind) {
      return matches;
    }
    
    // Strategy 1: Exact name match within same entity kind
    const exactMatches = await this.findExactMatches(candidate);
    matches.push(...exactMatches);
    
    // Strategy 2: Fuzzy name matching
    const fuzzyMatches = await this.findFuzzyMatches(candidate);
    matches.push(...fuzzyMatches);
    
    // Strategy 3: Alias matching
    const aliasMatches = await this.findAliasMatches(candidate);
    matches.push(...aliasMatches);
    
    // Strategy 4: Contextual matching (for similar entities)
    const contextualMatches = await this.findContextualMatches(candidate);
    matches.push(...contextualMatches);
    
    // Deduplicate matches
    return this.deduplicateMatches(matches);
  }
  
  /**
   * Find exact name matches
   */
  private async findExactMatches(candidate: EntityCandidate): Promise<EntityMatch[]> {
    const { data: entities } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('name', candidate.name)
      .eq('kind', candidate.kind);
    
    return (entities || []).map(entity => ({
      existingEntity: entity,
      candidate,
      similarityScore: 1.0,
      matchType: 'exact' as const
    }));
  }
  
  /**
   * Find fuzzy name matches using string similarity
   */
  private async findFuzzyMatches(candidate: EntityCandidate): Promise<EntityMatch[]> {
    const { data: entities } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('kind', candidate.kind)
      .limit(50); // Limit to avoid too many comparisons
    
    const matches: EntityMatch[] = [];
    
    if (entities && candidate.name) {
      for (const entity of entities) {
        const similarity = this.calculateStringSimilarity(candidate.name, entity.name);
        if (similarity >= this.FUZZY_MATCH_THRESHOLD) {
          matches.push({
            existingEntity: entity,
            candidate,
            similarityScore: similarity,
            matchType: 'fuzzy'
          });
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Find matches through aliases
   */
  private async findAliasMatches(candidate: EntityCandidate): Promise<EntityMatch[]> {
    if (!candidate.name) return [];
    
    const { data: aliases } = await supabaseAdmin
      .from('aliases')
      .select(`
        *,
        entities (*)
      `)
      .eq('alias', candidate.name);
    
    return (aliases || []).map(alias => ({
      existingEntity: alias.entities as Entity,
      candidate,
      similarityScore: alias.confidence || 0.8,
      matchType: 'alias' as const
    }));
  }
  
  /**
   * Find contextual matches (entities that appear in similar contexts)
   */
  private async findContextualMatches(candidate: EntityCandidate): Promise<EntityMatch[]> {
    // This is a simplified version - in practice, you might use embeddings
    // or more sophisticated contextual analysis
    
    if (!candidate.name || !candidate.description) {
      return [];
    }
    
    const keywords = this.extractKeywords(candidate.description);
    if (keywords.length === 0) return [];
    
    // Find entities with similar descriptions
    const { data: entities } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('kind', candidate.kind)
      .not('description', 'is', null)
      .limit(20);
    
    const matches: EntityMatch[] = [];
    
    if (entities) {
      for (const entity of entities) {
        if (entity.description) {
          const similarity = this.calculateContextualSimilarity(
            candidate.description,
            entity.description
          );
          
          if (similarity >= this.CONTEXTUAL_MATCH_THRESHOLD) {
            matches.push({
              existingEntity: entity,
              candidate,
              similarityScore: similarity,
              matchType: 'contextual'
            });
          }
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Calculate string similarity using Jaro-Winkler distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simplified Jaro-Winkler implementation
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    // Handle common variations
    const normalized1 = this.normalizeEntityName(s1);
    const normalized2 = this.normalizeEntityName(s2);
    
    if (normalized1 === normalized2) return 0.95;
    
    // Basic edit distance calculation
    const editDistance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    
    return Math.max(0, (maxLength - editDistance) / maxLength);
  }
  
  /**
   * Normalize entity names for comparison
   */
  private normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(?:inc|corp|ltd|llc|co|company|incorporated|corporation|limited)\b/g, '')
      .replace(/\b(?:dr|prof|professor|mr|ms|mrs)\b/g, '')
      .trim();
  }
  
  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Calculate contextual similarity based on description keywords
   */
  private calculateContextualSimilarity(desc1: string, desc2: string): number {
    const keywords1 = new Set(this.extractKeywords(desc1));
    const keywords2 = new Set(this.extractKeywords(desc2));
    
    const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
    const union = new Set([...keywords1, ...keywords2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    
    return text
      .toLowerCase()
      .match(/\b\w+\b/g)
      ?.filter(word => word.length > 2 && !stopWords.has(word))
      ?.slice(0, 20) || []; // Limit to first 20 keywords
  }
  
  /**
   * Remove duplicate matches
   */
  private deduplicateMatches(matches: EntityMatch[]): EntityMatch[] {
    const seen = new Set<string>();
    return matches.filter(match => {
      const key = `${match.existingEntity.id}_${match.matchType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Create a new entity from candidate
   */
  private async createNewEntity(candidate: EntityCandidate): Promise<ResolutionResult> {
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .insert({
        name: candidate.name!,
        kind: candidate.kind!,
        description: candidate.description,
        authority_score: this.calculateAuthorityScore(candidate),
        mention_count: candidate.mentionCount || 1
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create entity: ${error.message}`);
    }
    
    return {
      resolved: entity,
      aliases: [],
      confidence: candidate.confidence || 1.0
    };
  }
  
  /**
   * Merge candidate with existing entity (high confidence)
   */
  private async mergeWithExistingEntity(
    existingEntity: Entity,
    candidate: EntityCandidate
  ): Promise<ResolutionResult> {
    // Update entity with improved data
    const updatedAuthorityScore = Math.max(
      existingEntity.authority_score,
      this.calculateAuthorityScore(candidate)
    );
    
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .update({
        mention_count: existingEntity.mention_count + (candidate.mentionCount || 1),
        authority_score: updatedAuthorityScore,
        description: candidate.description || existingEntity.description,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingEntity.id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update entity: ${error.message}`);
    }
    
    return {
      resolved: entity,
      aliases: [],
      confidence: 0.95
    };
  }
  
  /**
   * Merge candidate with fuzzy match
   */
  private async mergeWithFuzzyMatch(
    existingEntity: Entity,
    candidate: EntityCandidate,
    similarityScore: number
  ): Promise<ResolutionResult> {
    // Create alias for the candidate name if different
    const aliases: EntityAlias[] = [];
    
    if (candidate.name && candidate.name !== existingEntity.name) {
      const { data: alias } = await supabaseAdmin
        .from('aliases')
        .insert({
          entity_id: existingEntity.id,
          alias: candidate.name,
          is_primary: false,
          confidence: similarityScore
        })
        .select()
        .single();
      
      if (alias) {
        aliases.push(alias);
      }
    }
    
    // Update entity stats
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .update({
        mention_count: existingEntity.mention_count + (candidate.mentionCount || 1),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingEntity.id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update entity: ${error.message}`);
    }
    
    return {
      resolved: entity,
      aliases,
      confidence: similarityScore
    };
  }
  
  /**
   * Create new entity but add potential aliases
   */
  private async createNewEntityWithAliases(
    candidate: EntityCandidate,
    potentialMatches: EntityMatch[]
  ): Promise<ResolutionResult> {
    const newEntity = await this.createNewEntity(candidate);
    
    // Add weak aliases for potential matches (for future reference)
    const aliases: EntityAlias[] = [];
    
    for (const match of potentialMatches.slice(0, 3)) { // Limit to top 3
      if (match.similarityScore >= 0.5) {
        const { data: alias } = await supabaseAdmin
          .from('aliases')
          .insert({
            entity_id: newEntity.resolved.id,
            alias: match.existingEntity.name,
            is_primary: false,
            confidence: match.similarityScore * 0.5 // Reduced confidence for weak matches
          })
          .select()
          .single();
        
        if (alias) {
          aliases.push(alias);
        }
      }
    }
    
    return {
      ...newEntity,
      aliases
    };
  }
  
  /**
   * Calculate authority score based on candidate data
   */
  private calculateAuthorityScore(candidate: EntityCandidate): number {
    let score = candidate.authorityScore || 0.5;
    
    // Boost score based on sources
    if (candidate.sources) {
      score += candidate.sources.length * 0.1;
    }
    
    // Boost score based on mention contexts
    if (candidate.mentionContexts) {
      score += candidate.mentionContexts.length * 0.05;
    }
    
    // Boost score based on mention count
    if (candidate.mentionCount && candidate.mentionCount > 1) {
      score += Math.min(candidate.mentionCount * 0.1, 0.3);
    }
    
    return Math.min(score, 1.0); // Cap at 1.0
  }
  
  /**
   * Batch resolve multiple entities
   */
  async batchResolveEntities(candidates: EntityCandidate[]): Promise<ResolutionResult[]> {
    const results: ResolutionResult[] = [];
    
    console.log(`🔄 Batch resolving ${candidates.length} entities...`);
    
    for (const candidate of candidates) {
      try {
        const result = await this.resolveEntity(candidate);
        results.push(result);
      } catch (error) {
        console.error(`Failed to resolve entity ${candidate.name}:`, error);
        // Continue with other entities
      }
    }
    
    console.log(`✅ Resolved ${results.length}/${candidates.length} entities`);
    return results;
  }
  
  /**
   * Find and merge duplicate entities
   */
  async findAndMergeDuplicates(entityKind?: EntityKind): Promise<number> {
    let query = supabaseAdmin
      .from('entities')
      .select('*')
      .order('mention_count', { ascending: false });
    
    if (entityKind) {
      query = query.eq('kind', entityKind);
    }
    
    const { data: entities } = await query.limit(500);
    
    if (!entities || entities.length < 2) {
      return 0;
    }
    
    let mergeCount = 0;
    const processed = new Set<string>();
    
    for (let i = 0; i < entities.length; i++) {
      const entity1 = entities[i];
      
      if (processed.has(entity1.id)) continue;
      
      for (let j = i + 1; j < entities.length; j++) {
        const entity2 = entities[j];
        
        if (processed.has(entity2.id)) continue;
        
        const similarity = this.calculateStringSimilarity(entity1.name, entity2.name);
        
        if (similarity >= this.EXACT_MATCH_THRESHOLD) {
          await this.mergeDuplicateEntities(entity1, entity2);
          processed.add(entity2.id);
          mergeCount++;
        }
      }
      
      processed.add(entity1.id);
    }
    
    console.log(`✅ Merged ${mergeCount} duplicate entities`);
    return mergeCount;
  }
  
  /**
   * Merge two duplicate entities
   */
  private async mergeDuplicateEntities(keepEntity: Entity, mergeEntity: Entity): Promise<void> {
    try {
      // Update the kept entity with combined stats
      await supabaseAdmin
        .from('entities')
        .update({
          mention_count: keepEntity.mention_count + mergeEntity.mention_count,
          authority_score: Math.max(keepEntity.authority_score, mergeEntity.authority_score),
          updated_at: new Date().toISOString()
        })
        .eq('id', keepEntity.id);
      
      // Move aliases from merged entity to kept entity
      await supabaseAdmin
        .from('aliases')
        .update({ entity_id: keepEntity.id })
        .eq('entity_id', mergeEntity.id);
      
      // Create alias for the merged entity's name if different
      if (mergeEntity.name !== keepEntity.name) {
        await supabaseAdmin
          .from('aliases')
          .insert({
            entity_id: keepEntity.id,
            alias: mergeEntity.name,
            is_primary: false,
            confidence: 0.95
          });
      }
      
      // Delete the merged entity
      await supabaseAdmin
        .from('entities')
        .delete()
        .eq('id', mergeEntity.id);
      
      console.log(`✅ Merged entity "${mergeEntity.name}" into "${keepEntity.name}"`);
      
    } catch (error) {
      console.error(`Failed to merge entities:`, error);
    }
  }
}

// =======================
// Export Functions
// =======================

export const entityResolver = new EntityResolver();

/**
 * Resolve a single entity candidate
 */
export async function resolveEntity(candidate: EntityCandidate): Promise<ResolutionResult> {
  return entityResolver.resolveEntity(candidate);
}

/**
 * Batch resolve multiple entities
 */
export async function batchResolveEntities(candidates: EntityCandidate[]): Promise<ResolutionResult[]> {
  return entityResolver.batchResolveEntities(candidates);
}

/**
 * Find and merge duplicate entities
 */
export async function deduplicateEntities(entityKind?: EntityKind): Promise<number> {
  return entityResolver.findAndMergeDuplicates(entityKind);
}

/**
 * Clean up the entity database
 */
export async function cleanupEntityDatabase(): Promise<void> {
  console.log('🧹 Starting entity database cleanup...');
  
  try {
    // Remove entities with very low authority scores and single mentions
    const { data: lowQualityEntities } = await supabaseAdmin
      .from('entities')
      .delete()
      .lt('authority_score', 0.2)
      .eq('mention_count', 1)
      .select('id');
    
    console.log(`✅ Removed ${lowQualityEntities?.length || 0} low-quality entities`);
    
    // Remove orphaned aliases
    const { data: orphanedAliases } = await supabaseAdmin
      .from('aliases')
      .delete()
      .not('entity_id', 'in', `(SELECT id FROM entities)`)
      .select('id');
    
    console.log(`✅ Removed ${orphanedAliases?.length || 0} orphaned aliases`);
    
    // Merge duplicates for each entity kind
    const entityKinds: EntityKind[] = ['person', 'org', 'product', 'algorithm', 'material', 'concept'];
    let totalMerged = 0;
    
    for (const kind of entityKinds) {
      const merged = await deduplicateEntities(kind);
      totalMerged += merged;
    }
    
    console.log(`✅ Entity database cleanup completed. Merged ${totalMerged} duplicates.`);
    
  } catch (error) {
    console.error('Error during entity database cleanup:', error);
    throw error;
  }
}