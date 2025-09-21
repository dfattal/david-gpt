/**
 * Query Transformation Pipeline
 * 
 * Advanced query processing with rewriting, expansion, and decomposition
 * for improved retrieval performance. Integrates with existing hybrid search.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { SearchQuery, SearchFilters } from './types';

// ===========================
// Query Transformation Types
// ===========================

export interface QueryIntent {
  type: 'factual' | 'comparative' | 'analytical' | 'temporal' | 'causal' | 'exploratory';
  confidence: number;
  entities: string[];
  temporalMarkers: string[];
  comparativeMarkers: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'multi_part';
}

export interface QueryDecomposition {
  originalQuery: string;
  subQueries: SubQuery[];
  queryPlan: QueryPlan;
  executionStrategy: 'sequential' | 'parallel' | 'hybrid';
}

export interface SubQuery {
  query: string;
  intent: QueryIntent;
  priority: number;
  dependencies: string[]; // IDs of sub-queries this depends on
  expectedAnswerType: 'entity' | 'fact' | 'explanation' | 'list' | 'comparison';
  searchStrategy: 'semantic' | 'keyword' | 'hybrid' | 'metadata';
}

export interface QueryPlan {
  steps: QueryStep[];
  totalEstimatedTime: number;
  cachingStrategy: 'aggressive' | 'moderate' | 'minimal';
}

export interface QueryStep {
  id: string;
  action: 'search' | 'merge' | 'synthesize' | 'validate';
  subQueryIds: string[];
  estimatedTime: number;
}

export interface QueryExpansion {
  originalQuery: string;
  expandedQueries: string[];
  synonyms: Record<string, string[]>;
  relatedTerms: string[];
  domainExpansions: DomainExpansion[];
}

export interface DomainExpansion {
  domain: string;
  terms: string[];
  confidence: number;
  source: 'knowledge_graph' | 'corpus_analysis' | 'domain_ontology';
}

export interface QueryRewriting {
  originalQuery: string;
  rewrittenQueries: RewrittenQuery[];
  transformations: QueryTransformation[];
}

export interface RewrittenQuery {
  query: string;
  confidence: number;
  transformationType: 'clarification' | 'specification' | 'generalization' | 'reformulation';
  expectedImprovement: number;
}

export interface QueryTransformation {
  type: 'entity_normalization' | 'spell_correction' | 'grammar_fix' | 'disambiguation' | 'term_expansion';
  applied: boolean;
  confidence: number;
  description: string;
}

// ===========================
// Domain Knowledge for Query Enhancement
// ===========================

const DOMAIN_SYNONYMS = {
  // Technology terms
  'artificial_intelligence': ['AI', 'machine learning', 'ML', 'deep learning', 'neural networks'],
  'augmented_reality': ['AR', 'mixed reality', 'MR', 'extended reality', 'XR'],
  'virtual_reality': ['VR', 'immersive technology', 'virtual environment'],
  '3d_display': ['three-dimensional display', 'stereoscopic display', 'autostereoscopic', 'glasses-free 3D'],
  'lightfield': ['light field', 'plenoptic', 'holographic display', 'volumetric display'],
  
  // Academic terms
  'research': ['study', 'investigation', 'analysis', 'examination', 'paper'],
  'methodology': ['method', 'approach', 'technique', 'procedure', 'framework'],
  'results': ['findings', 'outcomes', 'conclusions', 'data', 'evidence'],
  
  // Patent terms
  'invention': ['patent', 'innovation', 'technology', 'device', 'apparatus'],
  'claim': ['patent claim', 'independent claim', 'dependent claim'],
  'prior_art': ['background', 'existing technology', 'state of the art'],
  
  // People and organizations
  'inventor': ['creator', 'developer', 'innovator', 'researcher', 'engineer'],
  'assignee': ['company', 'organization', 'patent holder', 'owner'],
  'author': ['researcher', 'scientist', 'academic', 'writer']
};

const TEMPORAL_PATTERNS = [
  /\b(recent|recently|latest|newest|current|modern|contemporary)\b/gi,
  /\b(old|older|previous|prior|historical|legacy|traditional)\b/gi,
  /\b(future|upcoming|next|planned|projected|expected)\b/gi,
  /\b(during|while|when|after|before|since|until)\b/gi,
  /\b(\d{4}|\d{1,2}\/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi
];

const COMPARATIVE_PATTERNS = [
  /\b(versus|vs\.?|compared? to|difference between|contrast|compare)\b/gi,
  /\b(better|worse|superior|inferior|higher|lower|greater|less)\b/gi,
  /\b(similar|different|alike|unlike|same|distinct)\b/gi,
  /\b(advantages?|disadvantages?|pros?|cons?|benefits?|drawbacks?)\b/gi
];

const CAUSAL_PATTERNS = [
  /\b(because|due to|caused by|results? in|leads? to|why|how)\b/gi,
  /\b(reason|cause|effect|impact|influence|consequence)\b/gi,
  /\b(enable|prevent|allow|trigger|generate|produce)\b/gi
];

// ===========================
// Query Transformation Engine
// ===========================

export class QueryTransformationEngine {
  
  /**
   * Main entry point: transform a query for optimal search
   */
  async transformQuery(
    originalQuery: string,
    context?: {
      conversationHistory?: string[];
      documentContext?: string[];
      userPreferences?: Record<string, any>;
    }
  ): Promise<{
    intent: QueryIntent;
    rewriting: QueryRewriting;
    expansion: QueryExpansion;
    decomposition?: QueryDecomposition;
    optimizedSearchQueries: SearchQuery[];
  }> {
    
    console.log(`🔄 Starting query transformation for: "${originalQuery}"`);
    
    // Step 1: Analyze query intent and complexity
    const intent = await this.analyzeQueryIntent(originalQuery);
    console.log(`🎯 Query intent: ${intent.type} (complexity: ${intent.complexity})`);
    
    // Step 2: Apply query rewriting for clarity and optimization
    const rewriting = await this.rewriteQuery(originalQuery, intent);
    
    // Step 3: Expand query with synonyms and related terms
    const expansion = await this.expandQuery(originalQuery, intent);
    
    // Step 4: Decompose complex queries into sub-queries if needed
    let decomposition: QueryDecomposition | undefined;
    if (intent.complexity === 'complex' || intent.complexity === 'multi_part') {
      decomposition = await this.decomposeQuery(originalQuery, intent);
    }
    
    // Step 5: Generate optimized search queries
    const optimizedSearchQueries = await this.generateOptimizedSearchQueries(
      originalQuery,
      intent,
      rewriting,
      expansion,
      decomposition
    );
    
    console.log(`✅ Query transformation complete: ${optimizedSearchQueries.length} search strategies generated`);
    
    return {
      intent,
      rewriting,
      expansion,
      decomposition,
      optimizedSearchQueries
    };
  }
  
  /**
   * Analyze query intent, entities, and complexity
   */
  private async analyzeQueryIntent(query: string): Promise<QueryIntent> {
    const queryLower = query.toLowerCase();
    
    // Detect intent type
    let type: QueryIntent['type'] = 'factual';
    let confidence = 0.5;
    
    if (COMPARATIVE_PATTERNS.some(pattern => pattern.test(query))) {
      type = 'comparative';
      confidence = 0.8;
    } else if (CAUSAL_PATTERNS.some(pattern => pattern.test(query))) {
      type = 'causal';
      confidence = 0.7;
    } else if (TEMPORAL_PATTERNS.some(pattern => pattern.test(query))) {
      type = 'temporal';
      confidence = 0.7;
    } else if (queryLower.includes('analy') || queryLower.includes('research') || queryLower.includes('study')) {
      type = 'analytical';
      confidence = 0.6;
    } else if (queryLower.includes('explore') || queryLower.includes('investigate') || query.includes('?')) {
      type = 'exploratory';
      confidence = 0.6;
    }
    
    // Extract entities (simplified - could use NER in future)
    const entities = await this.extractEntities(query);
    
    // Extract temporal and comparative markers
    const temporalMarkers = this.extractMatches(query, TEMPORAL_PATTERNS);
    const comparativeMarkers = this.extractMatches(query, COMPARATIVE_PATTERNS);
    
    // Determine complexity
    const complexity = this.determineComplexity(query, entities, temporalMarkers, comparativeMarkers);
    
    return {
      type,
      confidence,
      entities,
      temporalMarkers,
      comparativeMarkers,
      complexity
    };
  }
  
  /**
   * Extract entities from query (simplified implementation)
   */
  private async extractEntities(query: string): Promise<string[]> {
    // Simple entity extraction - could be enhanced with NER
    const entities: string[] = [];
    
    // Look for capitalized words/phrases (likely proper nouns)
    const capitalizedMatches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    entities.push(...capitalizedMatches);
    
    // Look for quoted terms
    const quotedMatches = query.match(/"([^"]+)"/g) || [];
    entities.push(...quotedMatches.map(m => m.slice(1, -1)));
    
    // Look for known domain terms
    for (const [domain, synonyms] of Object.entries(DOMAIN_SYNONYMS)) {
      for (const synonym of synonyms) {
        if (query.toLowerCase().includes(synonym.toLowerCase())) {
          entities.push(synonym);
        }
      }
    }
    
    return [...new Set(entities)]; // Remove duplicates
  }
  
  /**
   * Extract pattern matches from query
   */
  private extractMatches(query: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const found = query.match(pattern) || [];
      matches.push(...found);
    }
    return [...new Set(matches)];
  }
  
  /**
   * Determine query complexity based on various factors
   */
  private determineComplexity(
    query: string,
    entities: string[],
    temporalMarkers: string[],
    comparativeMarkers: string[]
  ): QueryIntent['complexity'] {
    
    let complexityScore = 0;
    
    // Length-based scoring
    if (query.split(' ').length > 15) complexityScore += 2;
    else if (query.split(' ').length > 8) complexityScore += 1;
    
    // Multiple entities suggest complexity
    if (entities.length > 3) complexityScore += 2;
    else if (entities.length > 1) complexityScore += 1;
    
    // Temporal and comparative elements add complexity
    complexityScore += temporalMarkers.length;
    complexityScore += comparativeMarkers.length;
    
    // Multiple questions or conjunctions
    const questionCount = (query.match(/\?/g) || []).length;
    const conjunctionCount = (query.match(/\b(and|or|but|while|also|furthermore|however)\b/gi) || []).length;
    complexityScore += questionCount + conjunctionCount;
    
    // Complexity classification
    if (complexityScore >= 6) return 'multi_part';
    if (complexityScore >= 4) return 'complex';
    if (complexityScore >= 2) return 'moderate';
    return 'simple';
  }
  
  /**
   * Rewrite query for better search performance
   */
  private async rewriteQuery(originalQuery: string, intent: QueryIntent): Promise<QueryRewriting> {
    const rewrittenQueries: RewrittenQuery[] = [];
    const transformations: QueryTransformation[] = [];
    
    let workingQuery = originalQuery;
    
    // 1. Entity normalization
    const entityNormalization = await this.normalizeEntities(workingQuery);
    if (entityNormalization.transformed) {
      workingQuery = entityNormalization.query;
      transformations.push({
        type: 'entity_normalization',
        applied: true,
        confidence: 0.8,
        description: 'Normalized entity names for better matching'
      });
    }
    
    // 2. Spell correction (simple implementation)
    const spellCorrected = this.applySpellCorrection(workingQuery);
    if (spellCorrected !== workingQuery) {
      transformations.push({
        type: 'spell_correction',
        applied: true,
        confidence: 0.7,
        description: 'Applied spell correction'
      });
      rewrittenQueries.push({
        query: spellCorrected,
        confidence: 0.7,
        transformationType: 'clarification',
        expectedImprovement: 0.6
      });
    }
    
    // 3. Intent-specific rewriting
    switch (intent.type) {
      case 'comparative':
        const comparativeRewrite = this.rewriteComparative(workingQuery);
        rewrittenQueries.push(...comparativeRewrite);
        break;
        
      case 'temporal':
        const temporalRewrite = this.rewriteTemporal(workingQuery);
        rewrittenQueries.push(...temporalRewrite);
        break;
        
      case 'causal':
        const causalRewrite = this.rewriteCausal(workingQuery);
        rewrittenQueries.push(...causalRewrite);
        break;
    }
    
    // 4. Generic improvements
    const genericRewrites = this.generateGenericRewrites(workingQuery, intent);
    rewrittenQueries.push(...genericRewrites);
    
    return {
      originalQuery,
      rewrittenQueries,
      transformations
    };
  }
  
  /**
   * Normalize entities in query for better matching
   */
  private async normalizeEntities(query: string): Promise<{ query: string; transformed: boolean }> {
    let normalizedQuery = query;
    let transformed = false;
    
    // Normalize common variations
    const normalizations = {
      'AI': 'artificial intelligence',
      'ML': 'machine learning',
      'VR': 'virtual reality',
      'AR': 'augmented reality',
      '3-D': '3D',
      'three dimensional': '3D',
      'three-dimensional': '3D'
    };
    
    for (const [from, to] of Object.entries(normalizations)) {
      const regex = new RegExp(`\\b${from}\\b`, 'gi');
      if (regex.test(normalizedQuery)) {
        normalizedQuery = normalizedQuery.replace(regex, to);
        transformed = true;
      }
    }
    
    return { query: normalizedQuery, transformed };
  }
  
  /**
   * Simple spell correction (placeholder for more sophisticated implementation)
   */
  private applySpellCorrection(query: string): string {
    // Simple corrections for common technical terms
    const corrections = {
      'artifical': 'artificial',
      'inteligence': 'intelligence',
      'machien': 'machine',
      'learing': 'learning',
      'displayes': 'displays',
      'tehnology': 'technology',
      'reserch': 'research',
      'algorythm': 'algorithm',
      'compuer': 'computer'
    };
    
    let corrected = query;
    for (const [wrong, right] of Object.entries(corrections)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      corrected = corrected.replace(regex, right);
    }
    
    return corrected;
  }
  
  /**
   * Generate rewritten queries for comparative intent
   */
  private rewriteComparative(query: string): RewrittenQuery[] {
    const rewrites: RewrittenQuery[] = [];
    
    // Extract comparison entities if possible
    const vsMatch = query.match(/(.+?)\s+(?:versus|vs\.?|compared?\s+to)\s+(.+)/i);
    if (vsMatch) {
      const [, entity1, entity2] = vsMatch;
      
      rewrites.push({
        query: `differences between ${entity1.trim()} and ${entity2.trim()}`,
        confidence: 0.8,
        transformationType: 'specification',
        expectedImprovement: 0.7
      });
      
      rewrites.push({
        query: `${entity1.trim()} advantages disadvantages ${entity2.trim()}`,
        confidence: 0.7,
        transformationType: 'reformulation',
        expectedImprovement: 0.6
      });
    }
    
    return rewrites;
  }
  
  /**
   * Generate rewritten queries for temporal intent
   */
  private rewriteTemporal(query: string): RewrittenQuery[] {
    const rewrites: RewrittenQuery[] = [];
    
    // Add explicit temporal terms if missing
    if (!query.includes('recent') && !query.includes('latest') && !query.includes('current')) {
      rewrites.push({
        query: `recent ${query}`,
        confidence: 0.6,
        transformationType: 'specification',
        expectedImprovement: 0.5
      });
    }
    
    // Add chronological context
    rewrites.push({
      query: `${query} timeline development history`,
      confidence: 0.7,
      transformationType: 'specification',
      expectedImprovement: 0.6
    });
    
    return rewrites;
  }
  
  /**
   * Generate rewritten queries for causal intent
   */
  private rewriteCausal(query: string): RewrittenQuery[] {
    const rewrites: RewrittenQuery[] = [];
    
    // Add explicit causal terms
    const causalTerms = ['why', 'how', 'reason', 'cause', 'effect', 'impact'];
    const hasCausalTerm = causalTerms.some(term => query.toLowerCase().includes(term));
    
    if (!hasCausalTerm) {
      rewrites.push({
        query: `why ${query}`,
        confidence: 0.6,
        transformationType: 'clarification',
        expectedImprovement: 0.5
      });
      
      rewrites.push({
        query: `${query} reasons causes`,
        confidence: 0.7,
        transformationType: 'specification',
        expectedImprovement: 0.6
      });
    }
    
    return rewrites;
  }
  
  /**
   * Generate generic query improvements
   */
  private generateGenericRewrites(query: string, intent: QueryIntent): RewrittenQuery[] {
    const rewrites: RewrittenQuery[] = [];
    
    // More specific version
    if (intent.entities.length > 0) {
      const specificQuery = `${query} ${intent.entities.join(' ')}`;
      rewrites.push({
        query: specificQuery,
        confidence: 0.6,
        transformationType: 'specification',
        expectedImprovement: 0.5
      });
    }
    
    // More general version for broader matching
    const generalQuery = query.replace(/\b(specific|particular|exact|precise)\b/gi, '');
    if (generalQuery !== query) {
      rewrites.push({
        query: generalQuery,
        confidence: 0.5,
        transformationType: 'generalization',
        expectedImprovement: 0.4
      });
    }
    
    return rewrites;
  }
  
  /**
   * Expand query with synonyms and related terms
   */
  private async expandQuery(originalQuery: string, intent: QueryIntent): Promise<QueryExpansion> {
    console.log('🔄 Expanding query with synonyms and related terms...');
    
    const expandedQueries: string[] = [];
    const synonyms: Record<string, string[]> = {};
    const relatedTerms: string[] = [];
    const domainExpansions: DomainExpansion[] = [];
    
    // Find domain-specific synonyms
    for (const [domain, domainSynonyms] of Object.entries(DOMAIN_SYNONYMS)) {
      for (const synonym of domainSynonyms) {
        if (originalQuery.toLowerCase().includes(synonym.toLowerCase())) {
          synonyms[synonym] = domainSynonyms.filter(s => s !== synonym);
          relatedTerms.push(...synonyms[synonym]);
          
          domainExpansions.push({
            domain: domain.replace('_', ' '),
            terms: domainSynonyms,
            confidence: 0.8,
            source: 'domain_ontology'
          });
        }
      }
    }
    
    // Generate expanded queries
    if (relatedTerms.length > 0) {
      // Create OR expansion
      const orExpansion = `${originalQuery} OR ${relatedTerms.slice(0, 3).join(' OR ')}`;
      expandedQueries.push(orExpansion);
      
      // Create additive expansion
      const additiveExpansion = `${originalQuery} ${relatedTerms.slice(0, 2).join(' ')}`;
      expandedQueries.push(additiveExpansion);
    }
    
    // Add entity-specific expansions
    for (const entity of intent.entities) {
      if (entity.length > 3) { // Skip very short entities
        expandedQueries.push(`${originalQuery} "${entity}"`);
      }
    }
    
    return {
      originalQuery,
      expandedQueries,
      synonyms,
      relatedTerms,
      domainExpansions
    };
  }
  
  /**
   * Decompose complex queries into manageable sub-queries
   */
  private async decomposeQuery(originalQuery: string, intent: QueryIntent): Promise<QueryDecomposition> {
    console.log('🔄 Decomposing complex query into sub-queries...');
    
    const subQueries: SubQuery[] = [];
    
    // Split by conjunctions
    const parts = originalQuery.split(/\b(and|or|but|also|furthermore|however|while)\b/i);
    
    if (parts.length > 2) {
      // Multiple parts found
      for (let i = 0; i < parts.length; i += 2) {
        const part = parts[i].trim();
        if (part && part.length > 10) {
          subQueries.push({
            query: part,
            intent: await this.analyzeQueryIntent(part),
            priority: i === 0 ? 1 : 2, // First part gets higher priority
            dependencies: [],
            expectedAnswerType: this.determineExpectedAnswerType(part),
            searchStrategy: this.determineSearchStrategy(part, intent)
          });
        }
      }
    } else {
      // Single complex query - break down by topic
      const topics = await this.extractTopics(originalQuery);
      
      for (const [index, topic] of topics.entries()) {
        subQueries.push({
          query: `${topic} ${originalQuery}`,
          intent: await this.analyzeQueryIntent(`${topic} ${originalQuery}`),
          priority: index + 1,
          dependencies: [],
          expectedAnswerType: this.determineExpectedAnswerType(originalQuery),
          searchStrategy: this.determineSearchStrategy(originalQuery, intent)
        });
      }
      
      // Add a general query as fallback
      if (subQueries.length > 0) {
        subQueries.push({
          query: originalQuery,
          intent,
          priority: subQueries.length + 1,
          dependencies: [],
          expectedAnswerType: 'explanation',
          searchStrategy: 'hybrid'
        });
      }
    }
    
    // Generate query plan
    const queryPlan = this.generateQueryPlan(subQueries);
    
    // Determine execution strategy
    const executionStrategy: QueryDecomposition['executionStrategy'] = 
      subQueries.length > 3 ? 'hybrid' : 'parallel';
    
    return {
      originalQuery,
      subQueries,
      queryPlan,
      executionStrategy
    };
  }
  
  /**
   * Extract main topics from query
   */
  private async extractTopics(query: string): Promise<string[]> {
    const topics: string[] = [];
    
    // Look for domain-specific terms
    for (const [domain, synonyms] of Object.entries(DOMAIN_SYNONYMS)) {
      for (const synonym of synonyms) {
        if (query.toLowerCase().includes(synonym.toLowerCase())) {
          topics.push(synonym);
        }
      }
    }
    
    // If no domain topics found, extract noun phrases (simplified)
    if (topics.length === 0) {
      const words = query.split(' ');
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = words.slice(i, i + 2).join(' ');
        if (/^[A-Z]/.test(phrase) || /\b(technology|system|method|approach)\b/i.test(phrase)) {
          topics.push(phrase);
        }
      }
    }
    
    return topics.slice(0, 3); // Limit to top 3 topics
  }
  
  /**
   * Determine expected answer type for query
   */
  private determineExpectedAnswerType(query: string): SubQuery['expectedAnswerType'] {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('who') || queryLower.includes('person') || queryLower.includes('inventor')) {
      return 'entity';
    }
    
    if (queryLower.includes('what is') || queryLower.includes('define') || queryLower.includes('meaning')) {
      return 'fact';
    }
    
    if (queryLower.includes('list') || queryLower.includes('examples') || queryLower.includes('types')) {
      return 'list';
    }
    
    if (queryLower.includes('compare') || queryLower.includes('difference') || queryLower.includes('versus')) {
      return 'comparison';
    }
    
    return 'explanation';
  }
  
  /**
   * Determine optimal search strategy for query
   */
  private determineSearchStrategy(query: string, intent: QueryIntent): SubQuery['searchStrategy'] {
    // Factual queries benefit from metadata search
    if (intent.type === 'factual' && intent.entities.length > 0) {
      return 'metadata';
    }
    
    // Comparative queries need hybrid search
    if (intent.type === 'comparative') {
      return 'hybrid';
    }
    
    // Simple entity queries can use keyword search
    if (intent.complexity === 'simple' && intent.entities.length === 1) {
      return 'keyword';
    }
    
    // Complex analytical queries benefit from semantic search
    if (intent.type === 'analytical' || intent.complexity === 'complex') {
      return 'semantic';
    }
    
    return 'hybrid'; // Default to hybrid
  }
  
  /**
   * Generate execution plan for sub-queries
   */
  private generateQueryPlan(subQueries: SubQuery[]): QueryPlan {
    const steps: QueryStep[] = [];
    
    // Sort by priority
    const sortedQueries = [...subQueries].sort((a, b) => a.priority - b.priority);
    
    // Create search steps
    for (const [index, subQuery] of sortedQueries.entries()) {
      steps.push({
        id: `search_${index}`,
        action: 'search',
        subQueryIds: [subQuery.query],
        estimatedTime: this.estimateSearchTime(subQuery)
      });
    }
    
    // Add merge step if multiple queries
    if (subQueries.length > 1) {
      steps.push({
        id: 'merge_results',
        action: 'merge',
        subQueryIds: sortedQueries.map(q => q.query),
        estimatedTime: 500 // 500ms for merging
      });
    }
    
    // Add synthesis step
    steps.push({
      id: 'synthesize',
      action: 'synthesize',
      subQueryIds: [],
      estimatedTime: 1000 // 1s for synthesis
    });
    
    const totalEstimatedTime = steps.reduce((sum, step) => sum + step.estimatedTime, 0);
    
    return {
      steps,
      totalEstimatedTime,
      cachingStrategy: totalEstimatedTime > 5000 ? 'aggressive' : 'moderate'
    };
  }
  
  /**
   * Estimate search time for sub-query
   */
  private estimateSearchTime(subQuery: SubQuery): number {
    const baseTime = 1000; // 1 second base
    
    // Strategy-based adjustments
    const strategyMultipliers = {
      'semantic': 1.2,
      'hybrid': 1.5,
      'keyword': 0.8,
      'metadata': 0.6
    };
    
    return baseTime * (strategyMultipliers[subQuery.searchStrategy] || 1.0);
  }
  
  /**
   * Generate optimized search queries for the search system
   */
  private async generateOptimizedSearchQueries(
    originalQuery: string,
    intent: QueryIntent,
    rewriting: QueryRewriting,
    expansion: QueryExpansion,
    decomposition?: QueryDecomposition
  ): Promise<SearchQuery[]> {
    
    const searchQueries: SearchQuery[] = [];
    
    // 1. Original query (always include)
    searchQueries.push({
      query: originalQuery,
      limit: 10,
      threshold: 0.7
    });
    
    // 2. Best rewritten queries
    const topRewrites = rewriting.rewrittenQueries
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);
      
    for (const rewrite of topRewrites) {
      searchQueries.push({
        query: rewrite.query,
        limit: 8,
        threshold: 0.65
      });
    }
    
    // 3. Expanded queries
    if (expansion.expandedQueries.length > 0) {
      searchQueries.push({
        query: expansion.expandedQueries[0], // Best expanded query
        limit: 12,
        threshold: 0.6
      });
    }
    
    // 4. Decomposed sub-queries (if available)
    if (decomposition) {
      const topSubQueries = decomposition.subQueries
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3);
        
      for (const subQuery of topSubQueries) {
        searchQueries.push({
          query: subQuery.query,
          limit: 6,
          threshold: 0.65
        });
      }
    }
    
    // 5. Entity-focused queries
    for (const entity of intent.entities.slice(0, 2)) {
      if (entity.length > 3) {
        searchQueries.push({
          query: `"${entity}"`,
          limit: 5,
          threshold: 0.8
        });
      }
    }
    
    console.log(`🎯 Generated ${searchQueries.length} optimized search queries`);
    return searchQueries;
  }
}

// Export singleton instance
export const queryTransformationEngine = new QueryTransformationEngine();

/**
 * Convenience function for transforming queries
 */
export async function transformQuery(
  query: string,
  context?: {
    conversationHistory?: string[];
    documentContext?: string[];
    userPreferences?: Record<string, any>;
  }
) {
  return await queryTransformationEngine.transformQuery(query, context);
}

/**
 * Simple query analysis for quick intent detection
 */
export async function analyzeQuery(query: string): Promise<QueryIntent> {
  const engine = new QueryTransformationEngine();
  return await engine['analyzeQueryIntent'](query);
}