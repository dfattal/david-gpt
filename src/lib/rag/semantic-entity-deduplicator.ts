/**
 * Semantic Entity Deduplicator
 * 
 * Provides semantic post-processing deduplication to prevent duplicate entities
 * representing the same concept from being saved to the database.
 */

import type { Entity, EntityKind } from './types';

export interface DeduplicationResult {
  isNew: boolean;
  canonicalEntity: Partial<Entity> | null;
  matchedEntityId?: string;
  similarity: number;
  action: 'create' | 'merge' | 'reject';
  explanation: string;
}

export interface EntitySimilarityResult {
  entity: Partial<Entity>;
  similarity: number;
  reasons: string[];
}

/**
 * Semantic Entity Deduplicator Class
 */
export class SemanticEntityDeduplicator {
  
  /**
   * Check if a new entity should be created or merged with existing ones
   */
  async checkEntityDuplication(
    newEntity: Partial<Entity>,
    existingEntities: Partial<Entity>[]
  ): Promise<DeduplicationResult> {
    
    if (!newEntity.name || !newEntity.kind) {
      return {
        isNew: false,
        canonicalEntity: null,
        similarity: 0,
        action: 'reject',
        explanation: 'Invalid entity: missing name or kind'
      };
    }

    // Find the most similar existing entity
    const similarEntities = this.findSimilarEntities(newEntity, existingEntities);
    
    if (similarEntities.length === 0) {
      const normalizedEntity = this.normalizeEntity(newEntity);
      
      // Check if entity should be rejected
      if ((normalizedEntity as any)._shouldReject) {
        return {
          isNew: false,
          canonicalEntity: null,
          similarity: 0,
          action: 'reject',
          explanation: `Entity rejected due to quality issues: "${normalizedEntity.name}" appears to be generic, invalid, or an extraction artifact`
        };
      }
      
      return {
        isNew: true,
        canonicalEntity: normalizedEntity,
        similarity: 0,
        action: 'create',
        explanation: 'No similar entities found - creating new entity'
      };
    }

    const mostSimilar = similarEntities[0];
    
    // High similarity threshold for same entity concept
    if (mostSimilar.similarity >= 0.6) {
      // Determine which entity form is more canonical
      const canonicalEntity = this.selectCanonicalForm(newEntity, mostSimilar.entity);
      
      return {
        isNew: false,
        canonicalEntity,
        similarity: mostSimilar.similarity,
        action: 'merge',
        explanation: `High similarity (${(mostSimilar.similarity * 100).toFixed(1)}%) with existing entity. Reasons: ${mostSimilar.reasons.join(', ')}`
      };
    }
    
    // Medium similarity - might be related but different concepts
    if (mostSimilar.similarity >= 0.4) {
      return {
        isNew: false,
        canonicalEntity: null,
        similarity: mostSimilar.similarity,
        action: 'reject',
        explanation: `Medium similarity (${(mostSimilar.similarity * 100).toFixed(1)}%) suggests possible duplicate but below merge threshold. Manual review needed.`
      };
    }

    // Low similarity - likely different entity
    return {
      isNew: true,
      canonicalEntity: this.normalizeEntity(newEntity),
      similarity: mostSimilar.similarity,
      action: 'create',
      explanation: `Low similarity (${(mostSimilar.similarity * 100).toFixed(1)}%) - creating new entity`
    };
  }

  /**
   * Find entities similar to the new entity
   */
  private findSimilarEntities(
    newEntity: Partial<Entity>,
    existingEntities: Partial<Entity>[]
  ): EntitySimilarityResult[] {
    
    const similarities: EntitySimilarityResult[] = [];
    
    // Only compare with entities of the same kind
    const sameKindEntities = existingEntities.filter(e => e.kind === newEntity.kind);
    
    for (const existing of sameKindEntities) {
      const similarity = this.calculateEntitySimilarity(newEntity, existing);
      
      if (similarity.similarity > 0.3) { // Only consider entities with >30% similarity
        similarities.push(similarity);
      }
    }
    
    // Sort by similarity descending
    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate semantic similarity between two entities
   */
  private calculateEntitySimilarity(
    entity1: Partial<Entity>,
    entity2: Partial<Entity>
  ): EntitySimilarityResult {
    
    const reasons: string[] = [];
    let totalScore = 0;
    let maxScore = 0;

    if (!entity1.name || !entity2.name) {
      return { entity: entity2, similarity: 0, reasons: ['Missing entity names'] };
    }

    const name1 = entity1.name.toLowerCase().trim();
    const name2 = entity2.name.toLowerCase().trim();

    // Exact match
    maxScore += 100;
    if (name1 === name2) {
      totalScore += 100;
      reasons.push('exact name match');
    }
    
    // Substring containment (one contains the other)
    maxScore += 80;
    if (name1.includes(name2) || name2.includes(name1)) {
      totalScore += 80;
      reasons.push('substring containment');
    }
    
    // Core product name similarity (for products)
    if (entity1.kind === 'product') {
      maxScore += 70;
      const coreMatch = this.calculateCoreProductSimilarity(name1, name2);
      if (coreMatch.score > 0) {
        totalScore += coreMatch.score;
        reasons.push(...coreMatch.reasons);
      }
    }
    
    // Company name variations (for organizations)
    if (entity1.kind === 'organization') {
      maxScore += 70;
      const companyMatch = this.calculateCompanySimilarity(name1, name2);
      if (companyMatch.score > 0) {
        totalScore += companyMatch.score;
        reasons.push(...companyMatch.reasons);
      }
    }
    
    // Word overlap similarity
    maxScore += 60;
    const wordSimilarity = this.calculateWordOverlapSimilarity(name1, name2);
    if (wordSimilarity.score > 0) {
      totalScore += wordSimilarity.score;
      reasons.push(...wordSimilarity.reasons);
    }
    
    // Edit distance similarity (for close matches)
    maxScore += 40;
    const editSimilarity = this.calculateEditDistanceSimilarity(name1, name2);
    if (editSimilarity.score > 0) {
      totalScore += editSimilarity.score;
      reasons.push(...editSimilarity.reasons);
    }

    const normalizedScore = maxScore > 0 ? totalScore / maxScore : 0;
    
    return {
      entity: entity2,
      similarity: normalizedScore,
      reasons
    };
  }

  /**
   * Calculate similarity for product names (handles model variations)
   */
  private calculateCoreProductSimilarity(name1: string, name2: string): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Extract core product identifiers
    const extractCore = (name: string) => {
      // Remove common prefixes/suffixes
      return name
        .replace(/^(announced the|new|this|just|is|enhanced|the)\s+/gi, '')
        .replace(/\s+(tablet|phone|display|monitor|device)$/gi, '')
        .trim();
    };

    const core1 = extractCore(name1);
    const core2 = extractCore(name2);

    // Check if cores are very similar
    if (core1 === core2) {
      score += 70;
      reasons.push('identical core product name');
    } else if (core1.includes(core2) || core2.includes(core1)) {
      score += 60;
      reasons.push('core product name containment');
    }

    // Special handling for hyphenated product fragments
    // Example: "Free 3D Tablet" should match "Glasses-Free 3D Tablet"
    const checkHyphenatedFragments = (full: string, fragment: string) => {
      const hyphenatedParts = full.split('-');
      if (hyphenatedParts.length > 1) {
        const restOfName = hyphenatedParts.slice(1).join('-');
        if (fragment.toLowerCase().includes(restOfName.toLowerCase()) || 
            restOfName.toLowerCase().includes(fragment.toLowerCase())) {
          return true;
        }
      }
      return false;
    };

    if (checkHyphenatedFragments(name1, name2) || checkHyphenatedFragments(name2, name1)) {
      score += 65;
      reasons.push('hyphenated product name fragment match');
    }

    // Check for model number similarity
    const model1 = this.extractModelInfo(name1);
    const model2 = this.extractModelInfo(name2);
    
    if (model1.length > 0 && model2.length > 0) {
      const modelOverlap = model1.filter(m => model2.includes(m));
      if (modelOverlap.length > 0) {
        score += 40;
        reasons.push(`shared model identifiers: ${modelOverlap.join(', ')}`);
      }
    }

    return { score, reasons };
  }

  /**
   * Calculate similarity for company names with enhanced matching
   */
  private calculateCompanySimilarity(name1: string, name2: string): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Remove common company suffixes
    const normalizeCompany = (name: string) => {
      return name
        .replace(/\s+(inc\.?|llc|corp\.?|corporation|ltd\.?|limited|co\.?|company)$/gi, '')
        .trim();
    };

    const norm1 = normalizeCompany(name1);
    const norm2 = normalizeCompany(name2);

    // Exact match after normalization
    if (norm1 === norm2) {
      score += 70;
      reasons.push('identical company name (excluding legal suffixes)');
      return { score, reasons }; // Early return for exact match
    }

    // Enhanced company name matching
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length <= norm2.length ? norm1 : norm2;

    // Case 1: Shorter name is contained in longer name (Leia vs Leia Inc)
    if (longer.toLowerCase().includes(shorter.toLowerCase()) && shorter.length >= 3) {
      const lengthRatio = shorter.length / longer.length;
      
      // High score for very similar lengths (minor suffix differences)
      if (lengthRatio >= 0.8) {
        score += 65;
        reasons.push('company name with minor suffix variation');
      } 
      // Medium-high score for moderate length differences (Leia vs Leia Inc)
      else if (lengthRatio >= 0.6) {
        score += 60;
        reasons.push('company name abbreviation/expansion match');
      }
      // Lower score for larger differences
      else if (lengthRatio >= 0.4) {
        score += 45;
        reasons.push('partial company name match');
      }
    }

    // Case 2: Word-based matching for multi-word companies
    const words1 = norm1.toLowerCase().split(/\s+/);
    const words2 = norm2.toLowerCase().split(/\s+/);
    
    if (words1.length > 1 || words2.length > 1) {
      const commonWords = words1.filter(w => words2.includes(w) && w.length >= 3);
      if (commonWords.length > 0) {
        const wordScore = (commonWords.length / Math.max(words1.length, words2.length)) * 50;
        score += wordScore;
        reasons.push(`shared company words: ${commonWords.join(', ')}`);
      }
    }

    // Case 3: Special handling for common abbreviations and variations
    const abbreviationPairs = [
      ['international', 'intl'],
      ['corporation', 'corp'],
      ['incorporated', 'inc'],
      ['company', 'co'],
      ['limited', 'ltd'],
      ['technologies', 'tech'],
      ['systems', 'sys']
    ];

    for (const [full, abbrev] of abbreviationPairs) {
      if ((norm1.toLowerCase().includes(full) && norm2.toLowerCase().includes(abbrev)) ||
          (norm1.toLowerCase().includes(abbrev) && norm2.toLowerCase().includes(full))) {
        score += 30;
        reasons.push(`abbreviation match: ${full}/${abbrev}`);
        break;
      }
    }

    return { score, reasons };
  }

  /**
   * Calculate word overlap similarity
   */
  private calculateWordOverlapSimilarity(name1: string, name2: string): { score: number; reasons: string[] } {
    const words1 = new Set(name1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(name2.split(/\s+/).filter(w => w.length > 2));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    if (union.size === 0) return { score: 0, reasons: [] };
    
    const jaccardSimilarity = intersection.size / union.size;
    const score = jaccardSimilarity * 60;
    
    const reasons = intersection.size > 0 
      ? [`${intersection.size}/${union.size} word overlap: ${[...intersection].join(', ')}`]
      : [];
      
    return { score, reasons };
  }

  /**
   * Calculate edit distance similarity  
   */
  private calculateEditDistanceSimilarity(name1: string, name2: string): { score: number; reasons: string[] } {
    const editDistance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    
    if (maxLength === 0) return { score: 0, reasons: [] };
    
    const similarity = 1 - (editDistance / maxLength);
    const score = similarity > 0.8 ? similarity * 40 : 0;
    
    const reasons = score > 0 
      ? [`high string similarity (${(similarity * 100).toFixed(1)}%)`]
      : [];
      
    return { score, reasons };
  }

  /**
   * Extract model information from product names
   */
  private extractModelInfo(name: string): string[] {
    const models: string[] = [];
    
    // Model patterns
    const patterns = [
      /(\d+(?:\.\d+)?)/g,                    // Numbers (3, 3.5, etc.)
      /([A-Z]\d+)/g,                         // Letter+number (S24, etc.)
      /\b(Pro|Ultra|Plus|Max|Mini|3D|II|III|IV)\b/gi  // Common suffixes
    ];
    
    patterns.forEach(pattern => {
      const matches = name.match(pattern);
      if (matches) {
        models.push(...matches.map(m => m.toLowerCase()));
      }
    });
    
    return [...new Set(models)]; // Remove duplicates
  }

  /**
   * Select the more canonical form between two entities
   */
  private selectCanonicalForm(entity1: Partial<Entity>, entity2: Partial<Entity>): Partial<Entity> {
    if (!entity1.name || !entity2.name) {
      return entity1.name ? entity1 : entity2;
    }

    // Prefer the form without prefixes like "announced the", "new", etc.
    const hasPrefix1 = /^(announced the|new|this|just|is|enhanced|the)\s+/i.test(entity1.name);
    const hasPrefix2 = /^(announced the|new|this|just|is|enhanced|the)\s+/i.test(entity2.name);
    
    if (hasPrefix1 && !hasPrefix2) {
      return { ...entity2, mentionCount: (entity1.mentionCount || 0) + (entity2.mentionCount || 0) };
    }
    if (hasPrefix2 && !hasPrefix1) {
      return { ...entity1, mentionCount: (entity1.mentionCount || 0) + (entity2.mentionCount || 0) };
    }

    // Prefer longer, more specific names
    if (entity1.name.length > entity2.name.length) {
      return { ...entity1, mentionCount: (entity1.mentionCount || 0) + (entity2.mentionCount || 0) };
    }
    
    // Prefer higher authority/mention count
    const authority1 = entity1.authorityScore || 0;
    const authority2 = entity2.authorityScore || 0;
    
    if (authority1 > authority2) {
      return { ...entity1, mentionCount: (entity1.mentionCount || 0) + (entity2.mentionCount || 0) };
    }
    
    return { ...entity2, mentionCount: (entity1.mentionCount || 0) + (entity2.mentionCount || 0) };
  }

  /**
   * Normalize entity names and properties with enhanced contextual prefix handling
   */
  private normalizeEntity(entity: Partial<Entity>): Partial<Entity> {
    if (!entity.name) return entity;

    let normalizedName = entity.name;

    // Enhanced contextual prefix removal
    normalizedName = normalizedName
      // Remove extraction/contextual prefixes
      .replace(/^(announced the|new|this|just|is|enhanced|the|like|latest|upcoming|next|current|recent)\s+/i, '')
      // Remove comparative/descriptive prefixes
      .replace(/^(such as|including|called|named|known as|referred to as)\s+/i, '')
      // Remove action-based prefixes
      .replace(/^(introducing|featuring|showcasing|presenting|offering|providing)\s+/i, '')
      // Remove temporal prefixes
      .replace(/^(now|today|recently|currently|previously|formerly)\s+/i, '')
      .trim();

    // Additional filtering for obviously invalid entities
    if (this.isInvalidEntity(normalizedName, entity.kind)) {
      return {
        ...entity,
        name: normalizedName,
        _shouldReject: true // Flag for rejection
      };
    }

    return {
      ...entity,
      name: normalizedName,
    };
  }

  /**
   * Check if an entity should be rejected based on various quality criteria
   */
  private isInvalidEntity(name: string, kind?: string): boolean {
    if (!name || name.length < 2) return true;

    const lowerName = name.toLowerCase();

    // Generic/vague product descriptors that should be rejected
    const genericProductTerms = [
      'gaming tablet', 'latest gaming tablet', 'new tablet', 'this tablet',
      'display technology', 'new technology', 'advanced technology',
      'mobile device', 'smart device', 'electronic device',
      'professional', 'premium', 'advanced', 'enhanced', 'improved',
      'solution', 'system', 'platform', 'service', 'product'
    ];

    // Price-related terms
    const pricePatterns = [
      /^\$\d+/,           // $1199
      /\d+\s*dollars?/,   // 2499 dollars
      /\d+\s*euros?/,     // 500 euros
      /price|cost|fee/i    // price, cost, fee
    ];

    // Technical specifications that shouldn't be entities
    const specPatterns = [
      /^\d+-inch/i,       // 49-inch
      /^\d+hz$/i,         // 120Hz
      /^\d+mah/i,         // 10000mAh
      /^\d+gb$/i,         // 256GB
      /^\d+mp$/i          // 48MP
    ];

    // Check for generic terms
    if (kind === 'product' && genericProductTerms.some(term => 
      lowerName === term || lowerName.endsWith(' ' + term)
    )) {
      return true;
    }

    // Check for price patterns
    if (pricePatterns.some(pattern => pattern.test(lowerName))) {
      return true;
    }

    // Check for specification patterns
    if (specPatterns.some(pattern => pattern.test(lowerName))) {
      return true;
    }

    // Reject entities that are just single common words
    const commonWords = [
      'professional', 'premium', 'advanced', 'enhanced', 'latest', 'new',
      'technology', 'display', 'screen', 'device', 'tablet', 'phone',
      'system', 'solution', 'platform', 'service', 'product', 'feature'
    ];

    if (commonWords.includes(lowerName)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
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
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Export a singleton instance
export const semanticEntityDeduplicator = new SemanticEntityDeduplicator();