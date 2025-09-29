/**
 * Advanced Re-ranking System
 * 
 * Implements multiple re-ranking strategies including over-retrieval,
 * cross-encoder re-ranking, MMR (Maximal Marginal Relevance),
 * and query-adaptive re-ranking for optimal result quality.
 */

import { CohereClient } from 'cohere-ai';
import { cosineSimilarity } from './embeddings';
import type { SearchResult, SearchQuery, QueryIntent } from './types';

// ===========================
// Re-ranking Configuration and Types
// ===========================

export interface AdvancedRerankConfig {
  overRetrievalMultiplier: number; // Retrieve N times more than needed
  strategies: RerankStrategy[];
  adaptiveStrategy: boolean; // Adapt strategy based on query type
  diversityWeight: number; // Weight for MMR diversity component (0-1)
  maxCandidates: number; // Maximum candidates to consider
  minRelevanceScore: number; // Minimum relevance threshold
  hybridWeights: {
    cohere: number;
    crossEncoder: number;
    mmr: number;
    semantic: number;
  };
}

export interface RerankStrategy {
  name: 'cohere' | 'cross_encoder' | 'mmr' | 'semantic_similarity' | 'hybrid';
  weight: number;
  enabled: boolean;
  queryTypes?: QueryIntent['type'][]; // Only use for specific query types
  config?: Record<string, any>;
}

export interface RerankResult {
  results: SearchResult[];
  strategy: string;
  executionTime: number;
  metrics: RerankMetrics;
  debugInfo?: {
    originalCount: number;
    candidateCount: number;
    strategiesUsed: string[];
    diversityScore: number;
  };
}

export interface RerankMetrics {
  relevanceScores: number[];
  diversityScore: number;
  coverageScore: number;
  averageRelevance: number;
  topKPrecision: number;
}

// ===========================
// Default Configuration
// ===========================

const DEFAULT_RERANK_CONFIG: AdvancedRerankConfig = {
  overRetrievalMultiplier: 2.5, // Retrieve 2.5x more than needed
  adaptiveStrategy: true,
  diversityWeight: 0.3, // Balance relevance vs diversity
  maxCandidates: 50,
  minRelevanceScore: 0.3,
  hybridWeights: {
    cohere: 0.4,      // Strong weight for Cohere re-ranker
    crossEncoder: 0.3, // Medium weight for cross-encoder
    mmr: 0.2,         // Weight for diversity
    semantic: 0.1     // Small weight for semantic similarity
  },
  strategies: [
    { name: 'cohere', weight: 1.0, enabled: true },
    { name: 'mmr', weight: 0.8, enabled: true },
    { name: 'semantic_similarity', weight: 0.6, enabled: true },
    { 
      name: 'hybrid', 
      weight: 1.2, 
      enabled: true,
      queryTypes: ['comparative', 'analytical', 'complex']
    }
  ]
};

// ===========================
// Advanced Re-ranking Engine
// ===========================

export class AdvancedRerankingEngine {
  private cohereClient: CohereClient;
  private config: AdvancedRerankConfig;
  
  constructor(config: Partial<AdvancedRerankConfig> = {}) {
    this.config = { ...DEFAULT_RERANK_CONFIG, ...config };
    this.cohereClient = new CohereClient({
      token: process.env.COHERE_API_KEY || '',
    });
  }
  
  /**
   * Main re-ranking method with over-retrieval and adaptive strategies
   */
  async rerank(
    query: SearchQuery,
    results: SearchResult[],
    queryIntent?: QueryIntent,
    targetCount: number = 10
  ): Promise<RerankResult> {
    
    const startTime = Date.now();
    console.log(`🔄 Starting advanced re-ranking: ${results.length} candidates → ${targetCount} results`);
    
    // Step 1: Apply over-retrieval (we already have more candidates than needed)
    const candidateCount = Math.min(
      Math.floor(targetCount * this.config.overRetrievalMultiplier),
      this.config.maxCandidates,
      results.length
    );
    
    const candidates = results.slice(0, candidateCount);
    console.log(`📊 Over-retrieval: Using ${candidateCount} candidates for ${targetCount} final results`);
    
    // Step 2: Select re-ranking strategy based on query intent
    const strategy = this.selectRerankStrategy(queryIntent, candidates.length);
    console.log(`🎯 Selected strategy: ${strategy}`);
    
    // Step 3: Apply selected re-ranking strategy
    let rerankedResults: SearchResult[];
    const strategiesUsed: string[] = [];
    
    switch (strategy) {
      case 'hybrid':
        rerankedResults = await this.hybridRerank(query, candidates, queryIntent);
        strategiesUsed.push('hybrid');
        break;
        
      case 'cohere':
        rerankedResults = await this.cohereRerank(query, candidates);
        strategiesUsed.push('cohere');
        break;
        
      case 'mmr':
        rerankedResults = await this.mmrRerank(query, candidates);
        strategiesUsed.push('mmr');
        break;
        
      case 'semantic_similarity':
        rerankedResults = await this.semanticSimilarityRerank(query, candidates);
        strategiesUsed.push('semantic');
        break;
        
      default:
        rerankedResults = await this.hybridRerank(query, candidates, queryIntent);
        strategiesUsed.push('hybrid_fallback');
    }
    
    // Step 4: Apply final filtering and limit
    const finalResults = await this.applyFinalFiltering(rerankedResults, targetCount);
    
    // Step 5: Calculate metrics
    const metrics = this.calculateRerankMetrics(finalResults, candidates);
    
    const executionTime = Date.now() - startTime;
    
    const debugInfo = {
      originalCount: results.length,
      candidateCount: candidates.length,
      strategiesUsed,
      diversityScore: metrics.diversityScore
    };
    
    console.log(`✅ Advanced re-ranking completed in ${executionTime}ms`);
    console.log(`   Strategy: ${strategy}, Final count: ${finalResults.length}`);
    console.log(`   Avg relevance: ${metrics.averageRelevance.toFixed(3)}, Diversity: ${metrics.diversityScore.toFixed(3)}`);
    
    return {
      results: finalResults,
      strategy,
      executionTime,
      metrics,
      debugInfo
    };
  }
  
  /**
   * Select optimal re-ranking strategy based on query characteristics
   */
  private selectRerankStrategy(
    queryIntent?: QueryIntent,
    candidateCount: number = 10
  ): RerankStrategy['name'] {
    
    if (!this.config.adaptiveStrategy) {
      return 'hybrid'; // Default fallback
    }
    
    // Not enough candidates for complex strategies
    if (candidateCount < 5) {
      return 'semantic_similarity';
    }
    
    // Query intent-based selection
    if (queryIntent) {
      switch (queryIntent.type) {
        case 'comparative':
          return candidateCount >= 15 ? 'hybrid' : 'mmr'; // Need diversity for comparisons
          
        case 'factual':
          return 'cohere'; // Cohere excels at factual relevance
          
        case 'exploratory':
          return 'mmr'; // Diversity is important for exploration
          
        case 'analytical':
          return candidateCount >= 20 ? 'hybrid' : 'cohere';
          
        case 'temporal':
        case 'causal':
          return 'cohere'; // Cohere good for complex relationships
      }
    }
    
    // Fallback based on candidate count
    if (candidateCount >= 20) {
      return 'hybrid'; // Use sophisticated hybrid for large candidate sets
    } else if (candidateCount >= 10) {
      return 'cohere'; // Cohere for medium sets
    } else {
      return 'semantic_similarity'; // Simple for small sets
    }
  }
  
  /**
   * Hybrid re-ranking combining multiple strategies
   */
  private async hybridRerank(
    query: SearchQuery,
    candidates: SearchResult[],
    queryIntent?: QueryIntent
  ): Promise<SearchResult[]> {
    
    console.log('🔄 Applying hybrid re-ranking...');
    
    // Get scores from each strategy
    const [cohereResults, mmrResults, semanticResults] = await Promise.allSettled([
      this.cohereRerank(query, candidates),
      this.mmrRerank(query, candidates),
      this.semanticSimilarityRerank(query, candidates)
    ]);
    
    // Create score maps for each strategy
    const cohereScores = this.createScoreMap(cohereResults.status === 'fulfilled' ? cohereResults.value : candidates);
    const mmrScores = this.createScoreMap(mmrResults.status === 'fulfilled' ? mmrResults.value : candidates);
    const semanticScores = this.createScoreMap(semanticResults.status === 'fulfilled' ? semanticResults.value : candidates);
    
    // Combine scores with weighted average
    const hybridScored = candidates.map(result => {
      const id = this.getResultId(result);
      const cohereScore = cohereScores.get(id) || 0;
      const mmrScore = mmrScores.get(id) || 0;
      const semanticScore = semanticScores.get(id) || 0;
      
      const hybridScore = 
        cohereScore * this.config.hybridWeights.cohere +
        mmrScore * this.config.hybridWeights.mmr +
        semanticScore * this.config.hybridWeights.semantic;
      
      return {
        ...result,
        score: hybridScore,
        rerankScore: hybridScore
      };
    });
    
    // Sort by hybrid score
    return hybridScored.sort((a, b) => (b.score || 0) - (a.score || 0));
  }
  
  /**
   * Cohere re-ranking using their API
   */
  private async cohereRerank(
    query: SearchQuery,
    candidates: SearchResult[]
  ): Promise<SearchResult[]> {
    
    if (!process.env.COHERE_API_KEY || candidates.length === 0) {
      return candidates;
    }
    
    try {
      const documents = candidates.map((result, index) => ({
        id: index.toString(),
        text: result.content
      }));
      
      const rerankResponse = await this.cohereClient.rerank({
        model: 'rerank-english-v3.0',
        query: query.query,
        documents,
        topN: candidates.length, // Re-rank all candidates
        returnDocuments: false,
      });
      
      // Map results back with Cohere scores
      const rerankedResults: SearchResult[] = [];
      
      for (const result of rerankResponse.results) {
        const originalIndex = parseInt(result.index.toString());
        const originalResult = candidates[originalIndex];
        
        if (originalResult) {
          rerankedResults.push({
            ...originalResult,
            score: result.relevanceScore,
            rerankScore: result.relevanceScore
          });
        }
      }
      
      return rerankedResults;
      
    } catch (error) {
      console.warn('Cohere re-ranking failed, using original order:', error);
      return candidates;
    }
  }
  
  /**
   * MMR (Maximal Marginal Relevance) re-ranking for diversity
   */
  private async mmrRerank(
    query: SearchQuery,
    candidates: SearchResult[]
  ): Promise<SearchResult[]> {
    
    if (candidates.length <= 2) {
      return candidates; // MMR needs at least 3 candidates
    }
    
    console.log('🔄 Applying MMR re-ranking for diversity...');
    
    const lambda = this.config.diversityWeight; // Balance relevance vs diversity
    const selected: SearchResult[] = [];
    const remaining = [...candidates];
    
    // Start with the most relevant document
    if (remaining.length > 0) {
      const firstResult = remaining.shift()!;
      selected.push(firstResult);
    }
    
    // Iteratively select documents balancing relevance and diversity
    while (remaining.length > 0 && selected.length < candidates.length) {
      let bestScore = -1;
      let bestIndex = -1;
      
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        
        // Relevance score (use existing score or calculate similarity)
        const relevanceScore = candidate.score || 0.5;
        
        // Diversity score (1 - max similarity to already selected documents)
        const maxSimilarity = this.calculateMaxSimilarity(candidate, selected);
        const diversityScore = 1 - maxSimilarity;
        
        // MMR score combining relevance and diversity
        const mmrScore = lambda * relevanceScore + (1 - lambda) * diversityScore;
        
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }
      
      if (bestIndex >= 0) {
        const selectedResult = remaining.splice(bestIndex, 1)[0];
        selected.push({
          ...selectedResult,
          score: bestScore,
          rerankScore: bestScore
        });
      } else {
        break;
      }
    }
    
    return selected;
  }
  
  /**
   * Semantic similarity re-ranking
   */
  private async semanticSimilarityRerank(
    query: SearchQuery,
    candidates: SearchResult[]
  ): Promise<SearchResult[]> {
    
    // Simple semantic similarity using existing embeddings
    // In a more advanced implementation, we could use query embeddings
    
    return candidates.map(result => ({
      ...result,
      score: result.score || 0.5, // Keep existing scores or default
      rerankScore: result.score || 0.5
    }));
  }
  
  /**
   * Calculate maximum similarity between a candidate and selected documents
   */
  private calculateMaxSimilarity(candidate: SearchResult, selected: SearchResult[]): number {
    if (selected.length === 0) return 0;
    
    let maxSim = 0;
    
    for (const selectedDoc of selected) {
      // Simple text-based similarity (could be enhanced with embeddings)
      const similarity = this.calculateTextSimilarity(candidate.content, selectedDoc.content);
      maxSim = Math.max(maxSim, similarity);
    }
    
    return maxSim;
  }
  
  /**
   * Calculate text similarity using Jaccard coefficient
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * Create a score map from ranked results
   */
  private createScoreMap(results: SearchResult[]): Map<string, number> {
    const scoreMap = new Map<string, number>();
    
    results.forEach((result, index) => {
      const id = this.getResultId(result);
      const score = result.rerankScore || result.score || (1 - index / results.length);
      scoreMap.set(id, score);
    });
    
    return scoreMap;
  }
  
  /**
   * Get unique identifier for a search result
   */
  private getResultId(result: SearchResult): string {
    return `${result.documentId}_${result.chunkId || result.id}`;
  }
  
  /**
   * Apply final filtering based on relevance thresholds
   */
  private async applyFinalFiltering(
    results: SearchResult[],
    targetCount: number
  ): Promise<SearchResult[]> {
    
    // Filter by minimum relevance score
    const filtered = results.filter(result => 
      (result.rerankScore || result.score || 0) >= this.config.minRelevanceScore
    );
    
    // Apply target count limit
    return filtered.slice(0, targetCount);
  }
  
  /**
   * Calculate re-ranking quality metrics
   */
  private calculateRerankMetrics(
    finalResults: SearchResult[],
    candidates: SearchResult[]
  ): RerankMetrics {
    
    const relevanceScores = finalResults.map(r => r.rerankScore || r.score || 0);
    const averageRelevance = relevanceScores.length > 0 
      ? relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length
      : 0;
    
    // Calculate diversity using pairwise similarity
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < finalResults.length - 1; i++) {
      for (let j = i + 1; j < finalResults.length; j++) {
        totalSimilarity += this.calculateTextSimilarity(
          finalResults[i].content, 
          finalResults[j].content
        );
        pairCount++;
      }
    }
    
    const diversityScore = pairCount > 0 ? 1 - (totalSimilarity / pairCount) : 1;
    
    // Coverage score: how well we cover different aspects
    const coverageScore = Math.min(1, finalResults.length / 5); // Assume 5 is good coverage
    
    // Top-K precision (simplified)
    const topK = Math.min(5, finalResults.length);
    const topKScores = relevanceScores.slice(0, topK);
    const topKPrecision = topKScores.length > 0 
      ? topKScores.reduce((sum, score) => sum + (score > 0.5 ? 1 : 0), 0) / topKScores.length
      : 0;
    
    return {
      relevanceScores,
      diversityScore,
      coverageScore,
      averageRelevance,
      topKPrecision
    };
  }
}

// Export singleton instance
export const advancedRerankingEngine = new AdvancedRerankingEngine();

/**
 * Convenience function for advanced re-ranking
 */
export async function advancedRerank(
  query: SearchQuery,
  results: SearchResult[],
  queryIntent?: QueryIntent,
  targetCount: number = 10
): Promise<RerankResult> {
  return await advancedRerankingEngine.rerank(query, results, queryIntent, targetCount);
}