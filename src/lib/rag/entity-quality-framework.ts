/**
 * Entity Quality Assessment Framework
 *
 * Standardized quality evaluation and filtering system for extracted entities.
 * Provides consistent validation, scoring, and quality metrics across all extractors.
 */

import type {
  Entity,
  EntityKind,
  DocumentMetadata,
  DocumentChunk,
} from './types';

// ===========================
// Quality Assessment Types
// ===========================

export interface QualityMetrics {
  authorityScore: number; // 0-1: Authority/reliability of entity extraction
  validationScore: number; // 0-1: Validation against patterns and rules
  contextScore: number; // 0-1: Contextual relevance within document
  mentionScore: number; // 0-1: Mention frequency and distribution
  structuralScore: number; // 0-1: Structural metadata vs content extraction
  overallScore: number; // 0-1: Weighted combination of all scores
}

export interface QualityThresholds {
  minimal: number; // Bare minimum for inclusion (0.2-0.4)
  standard: number; // Standard quality threshold (0.4-0.6)
  high: number; // High quality threshold (0.6-0.8)
  premium: number; // Premium quality threshold (0.8-1.0)
}

export interface EntityQualityProfile {
  entity: Partial<Entity>;
  metrics: QualityMetrics;
  issues: QualityIssue[];
  recommendations: string[];
  qualityTier: 'premium' | 'high' | 'standard' | 'minimal' | 'rejected';
}

export interface QualityIssue {
  type:
    | 'pattern_violation'
    | 'context_mismatch'
    | 'low_authority'
    | 'duplicate'
    | 'incomplete'
    | 'noise';
  severity: 'critical' | 'major' | 'minor' | 'warning';
  description: string;
  suggestion?: string;
}

export interface QualityConfig {
  thresholds: Record<EntityKind, QualityThresholds>;
  weights: {
    authority: number;
    validation: number;
    context: number;
    mention: number;
    structural: number;
  };
  strictMode: boolean;
  documentTypeAdjustments: Record<string, number>; // Multiplier for different doc types
}

// ===========================
// Default Quality Configuration
// ===========================

const DEFAULT_QUALITY_THRESHOLDS: Record<EntityKind, QualityThresholds> = {
  person: {
    minimal: 0.4,
    standard: 0.55,
    high: 0.7,
    premium: 0.85,
  },
  organization: {
    minimal: 0.3,
    standard: 0.5,
    high: 0.7,
    premium: 0.85,
  },
  technology: {
    minimal: 0.25,
    standard: 0.45,
    high: 0.65,
    premium: 0.8,
  },
  product: {
    minimal: 0.3,
    standard: 0.5,
    high: 0.7,
    premium: 0.85,
  },
  component: {
    minimal: 0.2,
    standard: 0.4,
    high: 0.6,
    premium: 0.8,
  },
  document: {
    minimal: 0.6,
    standard: 0.75,
    high: 0.85,
    premium: 0.95,
  },
  dataset: {
    minimal: 0.4,
    standard: 0.6,
    high: 0.75,
    premium: 0.9,
  },
};

const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  thresholds: DEFAULT_QUALITY_THRESHOLDS,
  weights: {
    authority: 0.35, // Authority from extraction source/method
    validation: 0.25, // Pattern validation and format checks
    context: 0.2, // Contextual relevance and placement
    mention: 0.15, // Mention frequency and distribution
    structural: 0.05, // Bonus for structured metadata extraction
  },
  strictMode: false,
  documentTypeAdjustments: {
    patent: 1.1, // Patents have structured metadata - higher quality
    paper: 1.05, // Academic papers have good structure
    'press-article': 0.95, // Press articles can be noisier
    url: 0.9, // Web content quality varies
    text: 0.85, // Plain text has less structure
  },
};

// ===========================
// Quality Assessment Engine
// ===========================

export class EntityQualityAssessor {
  private config: QualityConfig;

  constructor(config: Partial<QualityConfig> = {}) {
    this.config = { ...DEFAULT_QUALITY_CONFIG, ...config };
  }

  /**
   * Assess the quality of an entity and return detailed metrics
   */
  assessEntity(
    entity: Partial<Entity>,
    context: {
      documentMetadata: DocumentMetadata;
      chunks: DocumentChunk[];
      extractionSource: 'structured' | 'content' | 'inference';
      sectionContext?: string;
    }
  ): EntityQualityProfile {
    if (!entity.name || !entity.kind) {
      return {
        entity,
        metrics: this.createZeroMetrics(),
        issues: [
          {
            type: 'incomplete',
            severity: 'critical',
            description: 'Entity missing required name or kind',
          },
        ],
        recommendations: ['Provide entity name and kind before assessment'],
        qualityTier: 'rejected',
      };
    }

    // Calculate individual quality scores
    const authorityScore = this.calculateAuthorityScore(entity, context);
    const validationScore = this.calculateValidationScore(entity);
    const contextScore = this.calculateContextScore(entity, context);
    const mentionScore = this.calculateMentionScore(entity, context);
    const structuralScore = this.calculateStructuralScore(entity, context);

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore({
      authorityScore,
      validationScore,
      contextScore,
      mentionScore,
      structuralScore,
    });

    const metrics: QualityMetrics = {
      authorityScore,
      validationScore,
      contextScore,
      mentionScore,
      structuralScore,
      overallScore,
    };

    // Identify quality issues
    const issues = this.identifyQualityIssues(entity, metrics, context);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      entity,
      metrics,
      issues
    );

    // Determine quality tier
    const qualityTier = this.determineQualityTier(entity, metrics);

    return {
      entity,
      metrics,
      issues,
      recommendations,
      qualityTier,
    };
  }

  /**
   * Batch assess multiple entities with cross-entity analysis
   */
  assessEntities(
    entities: Partial<Entity>[],
    context: {
      documentMetadata: DocumentMetadata;
      chunks: DocumentChunk[];
      extractionSource: 'structured' | 'content' | 'inference';
    }
  ): EntityQualityProfile[] {
    const profiles = entities.map(entity => this.assessEntity(entity, context));

    // Post-process for cross-entity issues (duplicates, conflicts, etc.)
    this.identifyCrossEntityIssues(profiles);

    return profiles;
  }

  /**
   * Filter entities based on quality thresholds
   */
  filterByQuality(
    profiles: EntityQualityProfile[],
    minTier: 'minimal' | 'standard' | 'high' | 'premium' = 'minimal'
  ): EntityQualityProfile[] {
    const tierOrder = ['rejected', 'minimal', 'standard', 'high', 'premium'];
    const minTierIndex = tierOrder.indexOf(minTier);

    return profiles.filter(profile => {
      const profileTierIndex = tierOrder.indexOf(profile.qualityTier);
      return profileTierIndex >= minTierIndex;
    });
  }

  /**
   * Calculate authority score based on extraction source and confidence
   */
  private calculateAuthorityScore(
    entity: Partial<Entity>,
    context: {
      extractionSource: string;
      sectionContext?: string;
      documentMetadata: DocumentMetadata;
    }
  ): number {
    let baseScore = entity.authorityScore || 0.5;

    // Boost for structured metadata extraction
    if (context.extractionSource === 'structured') {
      baseScore = Math.min(1.0, baseScore * 1.3);
    }

    // Section-aware scoring
    if (context.sectionContext) {
      const sectionMultiplier = this.getSectionAuthorityMultiplier(
        context.sectionContext
      );
      baseScore *= sectionMultiplier;
    }

    // Document type adjustment
    const docType = context.documentMetadata.docType || 'text';
    const adjustment = this.config.documentTypeAdjustments[docType] || 1.0;
    baseScore *= adjustment;

    return Math.max(0, Math.min(1.0, baseScore));
  }

  /**
   * Calculate validation score based on pattern matching and format checks
   */
  private calculateValidationScore(entity: Partial<Entity>): number {
    if (!entity.name || !entity.kind) return 0;

    const validationRules = this.getValidationRules(entity.kind);
    let score = 0;
    let totalWeight = 0;
    let criticalFailures = 0;

    for (const rule of validationRules) {
      const passed = rule.test(entity.name);
      if (passed) {
        score += rule.weight;
      } else {
        // Check if this is a critical validation rule (high weight)
        if (rule.weight >= 0.85) {
          criticalFailures++;
        }
      }
      totalWeight += rule.weight;
    }

    // If there are critical failures, drastically reduce the score
    if (criticalFailures > 0) {
      const baseScore = totalWeight > 0 ? score / totalWeight : 0.5;
      const penaltyMultiplier = Math.pow(0.3, criticalFailures); // Exponential penalty for critical failures
      return baseScore * penaltyMultiplier;
    }

    return totalWeight > 0 ? score / totalWeight : 0.5; // Default to neutral if no rules
  }

  /**
   * Calculate context score based on relevance within document
   */
  private calculateContextScore(
    entity: Partial<Entity>,
    context: { chunks: DocumentChunk[]; documentMetadata: DocumentMetadata }
  ): number {
    if (!entity.name) return 0;

    // Check mention distribution across chunks
    const mentionChunks = context.chunks.filter(chunk =>
      chunk.content.toLowerCase().includes(entity.name.toLowerCase())
    );

    const distributionScore = Math.min(1.0, mentionChunks.length / 3); // Better if mentioned in multiple chunks

    // Check contextual relevance (semantic coherence)
    const relevanceScore = this.calculateSemanticRelevance(entity, context);

    return (distributionScore + relevanceScore) / 2;
  }

  /**
   * Calculate mention score based on frequency and patterns
   */
  private calculateMentionScore(
    entity: Partial<Entity>,
    context: { chunks: DocumentChunk[] }
  ): number {
    if (!entity.name || !entity.mentionCount) return 0;

    const mentionCount = entity.mentionCount;
    const totalChunks = context.chunks.length;

    // Normalize mention frequency (sweet spot is 2-5 mentions)
    let frequencyScore: number;
    if (mentionCount === 1) {
      frequencyScore = 0.3; // Single mentions are suspicious
    } else if (mentionCount <= 5) {
      frequencyScore = 0.5 + (mentionCount - 1) * 0.125; // Linear increase
    } else if (mentionCount <= 10) {
      frequencyScore = 1.0 - (mentionCount - 5) * 0.05; // Slight penalty for too many
    } else {
      frequencyScore = 0.5; // Very high frequency might be noise
    }

    // Bonus for mentions spread across multiple chunks
    const mentionChunks = context.chunks.filter(chunk =>
      chunk.content.toLowerCase().includes(entity.name!.toLowerCase())
    ).length;

    const distributionBonus = Math.min(0.2, mentionChunks / totalChunks);

    return Math.min(1.0, frequencyScore + distributionBonus);
  }

  /**
   * Calculate structural score for metadata-extracted entities
   */
  private calculateStructuralScore(
    entity: Partial<Entity>,
    context: { extractionSource: string; documentMetadata: DocumentMetadata }
  ): number {
    if (context.extractionSource !== 'structured') return 0;

    // Higher score for entities extracted from structured metadata
    const docType = context.documentMetadata.docType;

    switch (docType) {
      case 'patent':
        // Patents have very structured metadata
        return entity.kind === 'person' || entity.kind === 'organization'
          ? 1.0
          : 0.8;
      case 'paper':
        // Academic papers have structured author/venue data
        return entity.kind === 'person' || entity.kind === 'organization'
          ? 0.9
          : 0.6;
      default:
        return 0.5;
    }
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(
    metrics: Omit<QualityMetrics, 'overallScore'>
  ): number {
    const weights = this.config.weights;

    return (
      metrics.authorityScore * weights.authority +
      metrics.validationScore * weights.validation +
      metrics.contextScore * weights.context +
      metrics.mentionScore * weights.mention +
      metrics.structuralScore * weights.structural
    );
  }

  /**
   * Get section authority multiplier based on section context
   */
  private getSectionAuthorityMultiplier(sectionContext: string): number {
    const section = sectionContext.toLowerCase();

    // High authority sections
    if (section.includes('title') || section.includes('abstract')) {
      return 1.2;
    }

    // Medium authority sections
    if (section.includes('summary') || section.includes('introduction')) {
      return 1.1;
    }

    // Low authority sections
    if (
      section.includes('reference') ||
      section.includes('citation') ||
      section.includes('bibliography')
    ) {
      return 0.6;
    }

    return 1.0; // Neutral for other sections
  }

  /**
   * Get validation rules for entity kind
   */
  private getValidationRules(
    kind: EntityKind
  ): Array<{ test: (name: string) => boolean; weight: number }> {
    const rules: Array<{ test: (name: string) => boolean; weight: number }> =
      [];

    // Universal filters applied to all entity types
    rules.push(
      // Length filters
      { test: name => name.length >= 2 && name.length <= 100, weight: 0.8 },

      // Fragment detection - reject partial phrases and incomplete entities
      {
        test: name =>
          !/^(of|and|or|the|in|at|to|for|with|from|by|on|bringing|featuring|using|including)\s/i.test(
            name
          ),
        weight: 0.9,
      },
      {
        test: name =>
          !/\s(of|and|or|the|in|at|to|for|with|from|by|on)$/i.test(name),
        weight: 0.9,
      },

      // Stop words - reject entities that are just common words
      {
        test: name =>
          !/^(professional|premium|standard|basic|advanced|new|old|current|recent|latest|next|first|last|main|primary|secondary|additional|special|general|international|global|worldwide|annual|monthly|weekly|daily)$/i.test(
            name
          ),
        weight: 0.95,
      },

      // Event/venue filtering
      {
        test: name =>
          !/^(CES|MWC|IFA|Computex|SIGGRAPH|GDC|E3|PAX|Gamescom|NAB|CEATEC)\s*\d{4}$/i.test(
            name
          ),
        weight: 0.7,
      },
      {
        test: name =>
          !/^(Hall|Booth|Room|Floor|Level|Stage|Area|Zone|Pavilion|Section)\s*\d+/i.test(
            name
          ),
        weight: 0.7,
      },

      // Technical specification filtering - reject raw specs as entities
      {
        test: name =>
          !/^\d+[\-\"′″]?\s*(inch|inches|mm|cm|Hz|fps|GB|TB|MB|mAh|W|V|A)(?:es)?$/i.test(
            name
          ),
        weight: 0.8,
      },
      {
        test: name =>
          !/^(A\s*)?\d+(\.\d+)?\s*(inch|GB|TB|mAh|Hz|fps|W|V|A)/i.test(name),
        weight: 0.8,
      },

      // Price and currency filtering
      {
        test: name =>
          !/^\$\d+|\d+\s*(USD|EUR|GBP|dollars?|euros?|pounds?)$/i.test(name),
        weight: 0.9,
      },

      // Contains meaningful letters (not just numbers/punctuation)
      { test: name => /[A-Za-z]/.test(name), weight: 0.8 }
    );

    // Entity-kind specific rules
    switch (kind) {
      case 'person':
        rules.push(
          {
            test: name =>
              /^[A-Z][a-z]+(\s+[A-Z]\.?\s*)*[A-Z][a-z]+$/.test(name),
            weight: 0.8,
          }, // Proper name format
          {
            test: name =>
              name.split(' ').length >= 2 && name.split(' ').length <= 4,
            weight: 0.6,
          }, // Reasonable name length
          {
            test: name => !/\b(the|and|or|of|in|at|to|for)\b/i.test(name),
            weight: 0.4,
          } // No common words
        );
        break;

      case 'organization':
        rules.push(
          { test: name => /^[A-Z]/.test(name), weight: 0.6 }, // Starts with capital
          { test: name => name.length >= 3 && name.length <= 50, weight: 0.5 }, // Reasonable length
          { test: name => !/^(the|and|or|of|in|at)$/i.test(name), weight: 0.7 }, // Not just common words
          // Company vs product disambiguation for organizations
          {
            test: name =>
              !/^(Samsung|Apple|LG|Sony|TCL|Hisense|Microsoft|Google|Amazon|Meta|Intel|AMD|NVIDIA|Qualcomm)\s+(Galaxy|iPhone|iPad|MacBook|Pixel|Surface|Xbox|PlayStation|Kindle|Quest|GeForce|Radeon|Snapdragon)/i.test(
                name
              ),
            weight: 0.9,
          }
        );
        break;

      case 'technology':
      case 'component':
        rules.push(
          { test: name => name.length >= 3 && name.length <= 50, weight: 0.5 }, // Reasonable length
          {
            test: name =>
              !/^(new|old|recent|current|existing|additional)$/i.test(name),
            weight: 0.6,
          }, // Not just adjectives
          { test: name => /[A-Za-z]/.test(name), weight: 0.8 } // Contains letters
        );
        break;

      case 'product':
        rules.push(
          { test: name => name.length >= 3 && name.length <= 60, weight: 0.5 }, // Products can have longer names
          {
            test: name =>
              !/^(new|old|recent|current|existing|additional|professional|premium|standard|basic|advanced)$/i.test(
                name
              ),
            weight: 0.7,
          }, // Not just adjectives
          { test: name => /[A-Za-z]/.test(name), weight: 0.8 }, // Contains letters
          // Prevent company names from being classified as products
          {
            test: name =>
              !/^(Samsung|Apple|LG|Sony|TCL|Hisense|Microsoft|Google|Amazon|Meta|Intel|AMD|NVIDIA|Qualcomm|Panasonic|Sharp|Philips|Vizio|BOE|CSOT|AUO|Innolux|Nintendo|ASUS|MSI|OnePlus|Xiaomi|Huawei|OPPO|Vivo|Motorola)$/i.test(
                name
              ),
            weight: 0.95,
          }
        );
        break;

      default:
        rules.push(
          { test: name => name.length >= 2 && name.length <= 100, weight: 0.5 }, // Basic length check
          { test: name => /[A-Za-z]/.test(name), weight: 0.6 } // Contains letters
        );
    }

    return rules;
  }

  /**
   * Calculate semantic relevance of entity within document context
   */
  private calculateSemanticRelevance(
    entity: Partial<Entity>,
    context: { documentMetadata: DocumentMetadata; chunks: DocumentChunk[] }
  ): number {
    // Simplified semantic relevance based on document type and entity kind matching
    const docType = context.documentMetadata.docType;
    const entityKind = entity.kind;

    // Domain-specific relevance scoring
    if (docType === 'patent') {
      if (entityKind === 'person' || entityKind === 'organization') return 0.9; // High relevance
      if (entityKind === 'technology' || entityKind === 'component') return 0.8;
      return 0.6;
    }

    if (docType === 'paper') {
      if (entityKind === 'person' || entityKind === 'organization') return 0.8;
      if (entityKind === 'technology' || entityKind === 'dataset') return 0.9;
      return 0.6;
    }

    if (docType === 'press-article') {
      if (entityKind === 'organization' || entityKind === 'product') return 0.9;
      if (entityKind === 'technology' || entityKind === 'person') return 0.7;
      return 0.5;
    }

    return 0.6; // Default relevance for other document types
  }

  /**
   * Identify specific quality issues
   */
  private identifyQualityIssues(
    entity: Partial<Entity>,
    metrics: QualityMetrics,
    context: any
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check for low authority
    if (metrics.authorityScore < 0.3) {
      issues.push({
        type: 'low_authority',
        severity: 'major',
        description: 'Entity has low authority score, may be unreliable',
        suggestion:
          'Verify entity through additional sources or structured metadata',
      });
    }

    // Check for pattern violations
    if (metrics.validationScore < 0.4) {
      issues.push({
        type: 'pattern_violation',
        severity: 'minor',
        description:
          'Entity name does not match expected patterns for its kind',
        suggestion: `Review entity name format for ${entity.kind} entities`,
      });
    }

    // Check for context mismatch
    if (metrics.contextScore < 0.3) {
      issues.push({
        type: 'context_mismatch',
        severity: 'minor',
        description:
          'Entity may not be contextually relevant to document content',
        suggestion: 'Verify entity relevance to document theme and content',
      });
    }

    // Check for potential noise (very low mention score)
    if (metrics.mentionScore < 0.2) {
      issues.push({
        type: 'noise',
        severity: 'warning',
        description: 'Entity may be noise due to single or irregular mentions',
        suggestion:
          'Consider filtering entities with very low mention frequencies',
      });
    }

    return issues;
  }

  /**
   * Generate improvement recommendations
   */
  private generateRecommendations(
    entity: Partial<Entity>,
    metrics: QualityMetrics,
    issues: QualityIssue[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.overallScore < 0.5) {
      recommendations.push(
        'Consider additional validation before including in knowledge graph'
      );
    }

    if (issues.some(issue => issue.type === 'low_authority')) {
      recommendations.push(
        'Cross-reference with structured metadata sources if available'
      );
    }

    if (issues.some(issue => issue.type === 'context_mismatch')) {
      recommendations.push(
        'Review entity relevance to document domain and themes'
      );
    }

    if (metrics.mentionScore > 0.8 && metrics.contextScore < 0.5) {
      recommendations.push(
        'High mention frequency with low context score - possible false positive'
      );
    }

    return recommendations;
  }

  /**
   * Determine quality tier based on metrics and thresholds
   */
  private determineQualityTier(
    entity: Partial<Entity>,
    metrics: QualityMetrics
  ): 'premium' | 'high' | 'standard' | 'minimal' | 'rejected' {
    if (!entity.kind) return 'rejected';

    const thresholds = this.config.thresholds[entity.kind];
    const score = metrics.overallScore;

    if (score >= thresholds.premium) return 'premium';
    if (score >= thresholds.high) return 'high';
    if (score >= thresholds.standard) return 'standard';
    if (score >= thresholds.minimal) return 'minimal';

    return 'rejected';
  }

  /**
   * Identify cross-entity issues like duplicates and conflicts
   */
  private identifyCrossEntityIssues(profiles: EntityQualityProfile[]): void {
    // First check for same-type duplicates
    this.identifySameTypeeDuplicates(profiles);

    // Then check for cross-type duplicates (same entity with different types)
    this.identifyCrossTypeDuplicates(profiles);
  }

  /**
   * Identify duplicates within the same entity type
   */
  private identifySameTypeeDuplicates(profiles: EntityQualityProfile[]): void {
    // Group entities by kind and check for near-duplicates
    const entityGroups = new Map<EntityKind, EntityQualityProfile[]>();

    profiles.forEach(profile => {
      if (!profile.entity.kind) return;

      if (!entityGroups.has(profile.entity.kind)) {
        entityGroups.set(profile.entity.kind, []);
      }
      entityGroups.get(profile.entity.kind)!.push(profile);
    });

    // Check for duplicates within each group
    entityGroups.forEach(group => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const entity1 = group[i].entity;
          const entity2 = group[j].entity;

          if (entity1.name && entity2.name) {
            const similarity = this.calculateNameSimilarity(
              entity1.name,
              entity2.name
            );

            if (similarity > 0.8) {
              group[i].issues.push({
                type: 'duplicate',
                severity: 'major',
                description: `Possible duplicate of "${entity2.name}" (${Math.round(similarity * 100)}% similar)`,
                suggestion:
                  'Consider merging or deduplicating similar entities',
              });
            }
          }
        }
      }
    });
  }

  /**
   * Identify cross-type duplicates (same entity extracted with different types)
   */
  private identifyCrossTypeDuplicates(profiles: EntityQualityProfile[]): void {
    const crossTypeIssues = new Map<string, EntityQualityProfile[]>();

    // Group entities by normalized name
    profiles.forEach(profile => {
      if (!profile.entity.name) return;

      const normalizedName = this.normalizeEntityName(profile.entity.name);
      if (!crossTypeIssues.has(normalizedName)) {
        crossTypeIssues.set(normalizedName, []);
      }
      crossTypeIssues.get(normalizedName)!.push(profile);
    });

    // Identify problematic cross-type extractions
    crossTypeIssues.forEach((duplicateProfiles, normalizedName) => {
      if (duplicateProfiles.length <= 1) return;

      const entityTypes = new Set(duplicateProfiles.map(p => p.entity.kind));
      if (entityTypes.size <= 1) return; // Same type duplicates handled elsewhere

      const typeConflictSeverity = this.assessCrossTypeConflictSeverity(
        Array.from(entityTypes)
      );

      // Add issues to lower-quality entities in the conflict
      const sortedProfiles = duplicateProfiles.sort(
        (a, b) => b.metrics.overallScore - a.metrics.overallScore
      );

      for (let i = 1; i < sortedProfiles.length; i++) {
        const conflictingTypes = Array.from(entityTypes).filter(
          t => t !== sortedProfiles[i].entity.kind
        );

        sortedProfiles[i].issues.push({
          type: 'duplicate',
          severity: typeConflictSeverity,
          description: `Cross-type duplicate: "${normalizedName}" also extracted as ${conflictingTypes.join(', ')}`,
          suggestion: this.getCrossTypeResolutionSuggestion(
            Array.from(entityTypes),
            normalizedName
          ),
        });
      }
    });
  }

  /**
   * Normalize entity name for cross-type duplicate detection
   */
  private normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(
        /\b(the|inc|corp|ltd|llc|co|company|corporation|incorporated)\b/g,
        ''
      ) // Remove common company suffixes
      .trim();
  }

  /**
   * Assess severity of cross-type conflicts
   */
  private assessCrossTypeConflictSeverity(
    types: EntityKind[]
  ): 'critical' | 'major' | 'minor' | 'warning' {
    const typeSet = new Set(types);

    // Critical conflicts: company extracted as product
    if (typeSet.has('organization') && typeSet.has('product')) {
      return 'critical';
    }

    // Major conflicts: person extracted as organization or product
    if (
      typeSet.has('person') &&
      (typeSet.has('organization') || typeSet.has('product'))
    ) {
      return 'major';
    }

    // Minor conflicts: technology vs component vs product
    if (
      (typeSet.has('technology') || typeSet.has('component')) &&
      typeSet.has('product')
    ) {
      return 'minor';
    }

    // Warning for other cross-type issues
    return 'warning';
  }

  /**
   * Generate resolution suggestions for cross-type conflicts
   */
  private getCrossTypeResolutionSuggestion(
    types: EntityKind[],
    entityName: string
  ): string {
    const typeSet = new Set(types);

    if (typeSet.has('organization') && typeSet.has('product')) {
      return `"${entityName}" should be classified as organization (company name), not product. Review product vs company naming patterns.`;
    }

    if (typeSet.has('person') && typeSet.has('organization')) {
      return `"${entityName}" appears to be a person name, not an organization. Check name format patterns.`;
    }

    if (typeSet.has('technology') && typeSet.has('product')) {
      return `"${entityName}" may be better classified as either a specific product or general technology. Consider context and specificity.`;
    }

    return `Review entity type classification for "${entityName}" - ensure consistent categorization across similar contexts.`;
  }

  /**
   * Calculate similarity between two entity names
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const s1 = name1.toLowerCase().trim();
    const s2 = name2.toLowerCase().trim();

    if (s1 === s2) return 1.0;

    // Simple Levenshtein distance-based similarity
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    return 1.0 - this.levenshteinDistance(s1, s2) / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
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

  /**
   * Create zero metrics for failed assessments
   */
  private createZeroMetrics(): QualityMetrics {
    return {
      authorityScore: 0,
      validationScore: 0,
      contextScore: 0,
      mentionScore: 0,
      structuralScore: 0,
      overallScore: 0,
    };
  }
}

// Export singleton instance
export const entityQualityAssessor = new EntityQualityAssessor();

/**
 * Convenience function for assessing single entity
 */
export function assessEntityQuality(
  entity: Partial<Entity>,
  context: {
    documentMetadata: DocumentMetadata;
    chunks: DocumentChunk[];
    extractionSource: 'structured' | 'content' | 'inference';
    sectionContext?: string;
  }
): EntityQualityProfile {
  return entityQualityAssessor.assessEntity(entity, context);
}

/**
 * Convenience function for batch assessment
 */
export function assessEntitiesQuality(
  entities: Partial<Entity>[],
  context: {
    documentMetadata: DocumentMetadata;
    chunks: DocumentChunk[];
    extractionSource: 'structured' | 'content' | 'inference';
  }
): EntityQualityProfile[] {
  return entityQualityAssessor.assessEntities(entities, context);
}
