/**
 * Optimized Reranking System
 *
 * Implements candidate reduction and smart filtering to reduce Tier 3 processing time
 * from 2.5s to target 1.5s while maintaining result quality.
 */

import { CohereClient } from 'cohere-ai';
import { cosineSimilarity, generateQueryEmbedding } from './embeddings';
import type { SearchResult, SearchQuery, QueryIntent } from './types';

// =======================
// Configuration
// =======================

interface OptimizedRerankConfig {
  // Candidate reduction settings
  maxInitialCandidates: number; // Reduce from 50+ to this number
  earlyFilterThreshold: number; // Pre-filter threshold (0-1)
  fastPreRankEnabled: boolean; // Enable fast pre-ranking

  // Quality preservation
  minQualityCandidates: number; // Always keep top N high-quality results
  diversityPreservation: boolean; // Maintain result diversity

  // Performance settings
  batchSize: number; // Process in batches for large sets
  timeoutMs: number; // Max processing time
}

const DEFAULT_OPTIMIZED_CONFIG: OptimizedRerankConfig = {
  maxInitialCandidates: 25, // Reduce from 50+ to 25
  earlyFilterThreshold: 0.4, // Filter out results below 0.4 relevance
  fastPreRankEnabled: true,
  minQualityCandidates: 8, // Always keep top 8 quality results
  diversityPreservation: true,
  batchSize: 15, // Process 15 at a time
  timeoutMs: 3000, // 3 second timeout
};

interface CandidateScore {
  result: SearchResult;
  fastScore: number;
  qualityIndicators: {
    titleMatch: number;
    contentLength: number;
    authorityScore: number;
    recency: number;
  };
}

// =======================
// Optimized Reranking Engine
// =======================

export class OptimizedRerankingEngine {
  private cohereClient: CohereClient;
  private config: OptimizedRerankConfig;

  constructor(config: Partial<OptimizedRerankConfig> = {}) {
    this.config = { ...DEFAULT_OPTIMIZED_CONFIG, ...config };
    this.cohereClient = new CohereClient({
      token: process.env.COHERE_API_KEY || '',
    });
  }

  /**
   * Main optimized reranking method with aggressive candidate reduction
   */
  async optimizedRerank(
    query: SearchQuery,
    candidates: SearchResult[],
    queryIntent?: QueryIntent,
    targetCount: number = 10
  ): Promise<{
    results: SearchResult[];
    metrics: {
      originalCount: number;
      candidatesProcessed: number;
      reductionRatio: number;
      processingTime: number;
      qualityScore: number;
    };
    strategy: string;
  }> {
    const startTime = Date.now();

    console.log(
      `⚡ Starting optimized reranking: ${candidates.length} -> ${targetCount} candidates`
    );

    try {
      // Phase 1: Early filtering and fast scoring
      const scoredCandidates = await this.fastPreScore(query, candidates);

      // Phase 2: Aggressive candidate reduction
      const reducedCandidates = this.reduceCandicates(
        scoredCandidates,
        queryIntent
      );

      // Phase 3: High-quality reranking on reduced set
      const finalResults = await this.precisionRerank(
        query,
        reducedCandidates.map(c => c.result),
        targetCount
      );

      const processingTime = Date.now() - startTime;
      const reductionRatio = candidates.length / reducedCandidates.length;

      console.log(
        `🎯 Optimized reranking complete: ${candidates.length} -> ${reducedCandidates.length} -> ${finalResults.length} (${processingTime}ms)`
      );

      return {
        results: finalResults,
        metrics: {
          originalCount: candidates.length,
          candidatesProcessed: reducedCandidates.length,
          reductionRatio,
          processingTime,
          qualityScore: this.calculateQualityScore(finalResults),
        },
        strategy: 'optimized_fast_rerank',
      };
    } catch (error) {
      console.error('Optimized reranking failed:', error);

      // Fallback to simple top-K selection
      return {
        results: candidates.slice(0, targetCount),
        metrics: {
          originalCount: candidates.length,
          candidatesProcessed: candidates.length,
          reductionRatio: 1,
          processingTime: Date.now() - startTime,
          qualityScore: 0.5,
        },
        strategy: 'fallback_simple',
      };
    }
  }

  /**
   * Fast pre-scoring using lightweight metrics
   */
  private async fastPreScore(
    query: SearchQuery,
    candidates: SearchResult[]
  ): Promise<CandidateScore[]> {
    console.log(`⚡ Fast pre-scoring ${candidates.length} candidates`);

    const queryTerms = query.query.toLowerCase().split(/\s+/);
    const queryEmbedding = await generateQueryEmbedding(query.query);

    return candidates.map(result => {
      // Fast scoring based on multiple lightweight factors
      const titleMatch = this.calculateTitleMatch(queryTerms, result.title);
      const contentRelevance = this.calculateContentRelevance(
        queryTerms,
        result.content
      );
      const semanticScore = result.score || 0; // Use existing semantic score

      // Quality indicators
      const qualityIndicators = {
        titleMatch,
        contentLength: Math.min(result.content.length / 1000, 1), // Normalize to 0-1
        authorityScore: result.metadata?.authorityScore || 0,
        recency: this.calculateRecency(result.metadata?.publishedDate),
      };

      // Combined fast score (weighted combination)
      const fastScore =
        titleMatch * 0.3 +
        contentRelevance * 0.25 +
        semanticScore * 0.25 +
        qualityIndicators.authorityScore * 0.1 +
        qualityIndicators.recency * 0.1;

      return {
        result,
        fastScore,
        qualityIndicators,
      };
    });
  }

  /**
   * Aggressive candidate reduction while preserving quality
   */
  private reduceCandicates(
    scoredCandidates: CandidateScore[],
    queryIntent?: QueryIntent
  ): CandidateScore[] {
    console.log(
      `🔥 Reducing candidates from ${scoredCandidates.length} to max ${this.config.maxInitialCandidates}`
    );

    // Sort by fast score
    const sorted = scoredCandidates.sort((a, b) => b.fastScore - a.fastScore);

    // Phase 1: Keep minimum quality candidates
    const topQuality = sorted.slice(0, this.config.minQualityCandidates);

    // Phase 2: Filter remaining by threshold
    const filtered = sorted
      .slice(this.config.minQualityCandidates)
      .filter(
        candidate => candidate.fastScore >= this.config.earlyFilterThreshold
      );

    // Phase 3: Combine and apply final limit
    const combined = [...topQuality, ...filtered];
    const reduced = combined.slice(0, this.config.maxInitialCandidates);

    // Phase 4: Ensure diversity if enabled
    const final = this.config.diversityPreservation
      ? this.ensureDiversity(reduced)
      : reduced;

    console.log(
      `   Quality preserved: ${topQuality.length}, Filtered: ${filtered.length}, Final: ${final.length}`
    );

    return final;
  }

  /**
   * High-precision reranking on reduced candidate set
   */
  private async precisionRerank(
    query: SearchQuery,
    candidates: SearchResult[],
    targetCount: number
  ): Promise<SearchResult[]> {
    if (candidates.length <= targetCount) {
      return candidates;
    }

    console.log(
      `🎯 Precision reranking ${candidates.length} candidates to ${targetCount}`
    );

    try {
      // Use Cohere reranking for final precision
      const documents = candidates.map((result, index) => ({
        text: `${result.title}\n\n${result.content.substring(0, 1000)}`, // Limit content for speed
        id: index.toString(),
      }));

      const response = await this.cohereClient.rerank({
        model: 'rerank-english-v3.0',
        query: query.query,
        documents,
        topN: targetCount,
        returnDocuments: false, // Save bandwidth
      });

      // Map back to original results
      const rerankedResults = response.results
        .map(item => candidates[parseInt(item.id)])
        .filter(Boolean);

      console.log(
        `   Cohere reranking: ${candidates.length} -> ${rerankedResults.length}`
      );

      return rerankedResults;
    } catch (error) {
      console.warn(
        'Cohere reranking failed, using fast score fallback:',
        error
      );

      // Fallback to fast score ranking
      return candidates
        .map(result => ({ result, score: result.score || 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, targetCount)
        .map(item => item.result);
    }
  }

  /**
   * Ensure diversity in results while maintaining speed
   */
  private ensureDiversity(candidates: CandidateScore[]): CandidateScore[] {
    if (candidates.length <= 10) return candidates;

    const diverse: CandidateScore[] = [];
    const used = new Set<string>();

    // Always include top 3 by score
    diverse.push(...candidates.slice(0, 3));
    candidates.slice(0, 3).forEach(c => {
      used.add(this.getContentFingerprint(c.result.content));
    });

    // Add diverse candidates from the rest
    for (const candidate of candidates.slice(3)) {
      const fingerprint = this.getContentFingerprint(candidate.result.content);

      if (!used.has(fingerprint)) {
        diverse.push(candidate);
        used.add(fingerprint);
      }

      if (diverse.length >= this.config.maxInitialCandidates) break;
    }

    return diverse;
  }

  /**
   * Calculate title match score
   */
  private calculateTitleMatch(queryTerms: string[], title: string): number {
    const titleLower = title.toLowerCase();
    const matches = queryTerms.filter(term => titleLower.includes(term)).length;
    return matches / queryTerms.length;
  }

  /**
   * Calculate content relevance score
   */
  private calculateContentRelevance(
    queryTerms: string[],
    content: string
  ): number {
    const contentLower = content.toLowerCase();
    const termFrequency = queryTerms.reduce((score, term) => {
      const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
      return score + matches;
    }, 0);

    // Normalize by content length and query length
    return Math.min(
      termFrequency / (content.length / 100) / queryTerms.length,
      1
    );
  }

  /**
   * Calculate recency score
   */
  private calculateRecency(publishedDate?: string): number {
    if (!publishedDate) return 0.5; // Neutral score for unknown dates

    const published = new Date(publishedDate);
    const now = new Date();
    const ageMonths =
      (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // Recent papers get higher scores, but not too aggressive
    if (ageMonths < 12) return 1.0; // Last year
    if (ageMonths < 36) return 0.8; // Last 3 years
    if (ageMonths < 60) return 0.6; // Last 5 years
    return 0.4; // Older content
  }

  /**
   * Get content fingerprint for diversity
   */
  private getContentFingerprint(content: string): string {
    // Simple fingerprint based on first 200 chars
    return content.substring(0, 200).replace(/\s+/g, ' ').trim();
  }

  /**
   * Calculate quality score of final results
   */
  private calculateQualityScore(results: SearchResult[]): number {
    if (results.length === 0) return 0;

    const avgScore =
      results.reduce((sum, result) => sum + (result.score || 0), 0) /
      results.length;
    const diversity = this.calculateDiversityScore(results);

    return avgScore * 0.7 + diversity * 0.3;
  }

  /**
   * Calculate diversity score
   */
  private calculateDiversityScore(results: SearchResult[]): number {
    if (results.length <= 1) return 1;

    const fingerprints = results.map(r =>
      this.getContentFingerprint(r.content)
    );
    const unique = new Set(fingerprints).size;

    return unique / results.length;
  }
}

// =======================
// Exports
// =======================

export const optimizedReranking = new OptimizedRerankingEngine();

/**
 * Quick rerank function for immediate use
 */
export async function quickRerank(
  query: SearchQuery,
  candidates: SearchResult[],
  targetCount: number = 10
): Promise<SearchResult[]> {
  const result = await optimizedReranking.optimizedRerank(
    query,
    candidates,
    undefined,
    targetCount
  );
  return result.results;
}
