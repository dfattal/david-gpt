// Hybrid Search: Vector + BM25 with Reciprocal Rank Fusion
import { createClient } from '@/lib/supabase/server'
import { vectorSearch, type VectorSearchResult } from './search'
import { generateEmbedding } from './embeddings'
import type { RAGChunk } from './types'

// Hybrid search configuration
export interface HybridSearchConfig {
  maxResults?: number
  vectorWeight?: number
  bm25Weight?: number
  minVectorSimilarity?: number
  minBM25Score?: number
  rrfK?: number // RRF parameter (typically 60)
  enableFallback?: boolean
}

export interface HybridSearchResult extends VectorSearchResult {
  bm25Score: number
  rrfScore: number
  source: 'vector' | 'bm25' | 'both'
}

export interface HybridSearchStats {
  vectorResults: number
  bm25Results: number
  mergedResults: number
  vectorAvgScore: number
  bm25AvgScore: number
  searchTimeMs: number
  queryType: 'semantic' | 'keyword' | 'hybrid'
}

const DEFAULT_CONFIG: Required<HybridSearchConfig> = {
  maxResults: 10,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  minVectorSimilarity: 0.1,
  minBM25Score: 0.01,
  rrfK: 60,
  enableFallback: true
}

/**
 * Determine query type based on content
 */
export function analyzeQuery(query: string): 'semantic' | 'keyword' | 'hybrid' {
  const keywordIndicators = [
    /\b(exact|specific|name|number|date|time|version)\b/i,
    /\b(list|show|find|search)\s+\w+/i,
    /[A-Z][A-Z_]+[A-Z]/,  // ALL_CAPS constants
    /\b\d{4}-\d{2}-\d{2}\b/, // dates
    /\bv?\d+\.\d+/,       // version numbers
  ]

  const semanticIndicators = [
    /\b(explain|how|why|what|describe|understand|concept|idea)\b/i,
    /\b(similar|like|related|compared|difference)\b/i,
    /\b(process|workflow|approach|strategy)\b/i,
  ]

  const keywordScore = keywordIndicators.reduce((score, pattern) => 
    score + (pattern.test(query) ? 1 : 0), 0)
  const semanticScore = semanticIndicators.reduce((score, pattern) => 
    score + (pattern.test(query) ? 1 : 0), 0)

  if (keywordScore > semanticScore && keywordScore > 0) return 'keyword'
  if (semanticScore > keywordScore && semanticScore > 0) return 'semantic'
  return 'hybrid'
}

/**
 * Perform BM25 full-text search
 */
async function bm25Search(
  query: string,
  userId: string,
  maxResults: number,
  minScore: number
): Promise<{ results: RAGChunk[], avgScore: number }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(`
      id,
      doc_id,
      content,
      embedding,
      chunk_index,
      chunk_date,
      tags,
      labels,
      created_at,
      rag_documents!inner (
        owner
      )
    `)
    .eq('rag_documents.owner', userId)
    .textSearch('content', query, { type: 'websearch' })
    .limit(maxResults)

  if (error) {
    console.error('BM25 search error:', error)
    return { results: [], avgScore: 0 }
  }

  const results = (data || []).map(item => ({
    ...item,
    bm25_score: 0.5 // Simple placeholder score for now
  })) as (RAGChunk & { bm25_score: number })[]
  
  const avgScore = results.length > 0 ? 0.5 : 0

  return { results, avgScore }
}

/**
 * Perform PostgreSQL full-text search as BM25 fallback
 */
async function fallbackTextSearch(
  query: string,
  userId: string,
  maxResults: number
): Promise<{ results: RAGChunk[], avgScore: number }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(`
      *,
      rag_documents!inner (
        owner
      )
    `)
    .eq('rag_documents.owner', userId)
    .textSearch('content', query, { type: 'websearch', config: 'english' })
    .limit(maxResults)

  if (error) {
    console.error('Fallback text search error:', error)
    return { results: [], avgScore: 0 }
  }

  const results = (data || []) as RAGChunk[]
  // Assign simple relevance scores based on position
  const avgScore = results.length > 0 ? 0.5 : 0

  return { results, avgScore }
}

/**
 * Reciprocal Rank Fusion (RRF) scoring
 */
function calculateRRF(
  vectorResults: VectorSearchResult[],
  bm25Results: (RAGChunk & { bm25_score?: number })[],
  k: number = 60
): Map<string, number> {
  const rrfScores = new Map<string, number>()

  // Add RRF scores from vector results
  vectorResults.forEach((result, index) => {
    const chunkId = result.chunk.id.toString()
    const currentScore = rrfScores.get(chunkId) || 0
    rrfScores.set(chunkId, currentScore + (1 / (k + index + 1)))
  })

  // Add RRF scores from BM25 results
  bm25Results.forEach((result, index) => {
    const chunkId = result.id.toString()
    const currentScore = rrfScores.get(chunkId) || 0
    rrfScores.set(chunkId, currentScore + (1 / (k + index + 1)))
  })

  return rrfScores
}

/**
 * Merge and deduplicate results using RRF
 */
function mergeResults(
  vectorResults: VectorSearchResult[],
  bm25Results: (RAGChunk & { bm25_score?: number })[],
  rrfScores: Map<string, number>,
  config: Required<HybridSearchConfig>
): HybridSearchResult[] {
  const resultMap = new Map<string, HybridSearchResult>()

  // Add vector results
  vectorResults.forEach(vResult => {
    const chunkId = vResult.chunk.id.toString()
    const rrfScore = rrfScores.get(chunkId) || 0

    resultMap.set(chunkId, {
      ...vResult,
      bm25Score: 0,
      rrfScore,
      source: 'vector' as const
    })
  })

  // Add or merge BM25 results
  bm25Results.forEach(bResult => {
    const chunkId = bResult.id.toString()
    const rrfScore = rrfScores.get(chunkId) || 0
    const bm25Score = bResult.bm25_score || 0

    const existingResult = resultMap.get(chunkId)
    if (existingResult) {
      // Merge with existing vector result
      existingResult.bm25Score = bm25Score
      existingResult.rrfScore = rrfScore
      existingResult.source = 'both'
    } else {
      // New BM25-only result - create VectorSearchResult format
      resultMap.set(chunkId, {
        chunk: bResult,
        similarity: 0,
        rank: 0,
        bm25Score,
        rrfScore,
        source: 'bm25' as const
      })
    }
  })

  // Sort by RRF score and return top results
  return Array.from(resultMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, config.maxResults)
}

/**
 * Log search statistics for performance tuning
 */
async function logSearchStats(
  query: string,
  userId: string,
  stats: HybridSearchStats,
  config: Required<HybridSearchConfig>
): Promise<void> {
  try {
    const supabase = await createClient()
    
    await supabase
      .from('rag_search_stats')
      .insert({
        user_id: userId,
        query: query.substring(0, 500), // Limit query length
        vector_results: stats.vectorResults,
        bm25_results: stats.bm25Results,
        merged_results: stats.mergedResults,
        vector_weight: config.vectorWeight,
        bm25_weight: config.bm25Weight,
        avg_vector_score: stats.vectorAvgScore,
        avg_bm25_score: stats.bm25AvgScore,
        search_time_ms: stats.searchTimeMs
      })
  } catch (error) {
    console.warn('Failed to log search stats:', error)
  }
}

/**
 * Perform hybrid search combining vector similarity and BM25 ranking
 */
export async function hybridSearch(
  query: string,
  userId: string,
  options: HybridSearchConfig = {}
): Promise<{
  results: HybridSearchResult[]
  stats: HybridSearchStats
  queryType: 'semantic' | 'keyword' | 'hybrid'
}> {
  const startTime = Date.now()
  const config = { ...DEFAULT_CONFIG, ...options }
  const queryType = analyzeQuery(query)

  console.log(`Hybrid search: "${query}" (${queryType} query)`)

  let vectorResults: VectorSearchResult[] = []
  let bm25Results: (RAGChunk & { bm25_score?: number })[] = []
  let vectorAvgScore = 0
  let bm25AvgScore = 0

  try {
    // Decide search strategy based on query type
    if (queryType === 'semantic' || queryType === 'hybrid') {
      // Always do vector search for semantic queries
      const vectorSearchResult = await vectorSearch(
        query,
        userId,
        { 
          limit: config.maxResults * 2, // Get more for merging
          threshold: config.minVectorSimilarity 
        }
      )
      vectorResults = vectorSearchResult.results
      vectorAvgScore = vectorResults.length > 0 
        ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) / vectorResults.length 
        : 0
    }

    if (queryType === 'keyword' || queryType === 'hybrid') {
      // Try BM25 search first
      try {
        const bm25SearchResult = await bm25Search(
          query,
          userId,
          config.maxResults * 2,
          config.minBM25Score
        )
        bm25Results = bm25SearchResult.results
        bm25AvgScore = bm25SearchResult.avgScore
      } catch (error) {
        console.warn('BM25 search failed, using fallback:', error)
        
        if (config.enableFallback) {
          const fallbackResult = await fallbackTextSearch(
            query,
            userId,
            config.maxResults
          )
          bm25Results = fallbackResult.results
          bm25AvgScore = fallbackResult.avgScore
        }
      }
    }

    // Merge results using Reciprocal Rank Fusion
    const rrfScores = calculateRRF(vectorResults, bm25Results, config.rrfK)
    const mergedResults = mergeResults(vectorResults, bm25Results, rrfScores, config)

    const searchTime = Date.now() - startTime
    const stats: HybridSearchStats = {
      vectorResults: vectorResults.length,
      bm25Results: bm25Results.length,
      mergedResults: mergedResults.length,
      vectorAvgScore,
      bm25AvgScore,
      searchTimeMs: searchTime,
      queryType
    }

    console.log(`Hybrid search completed: ${mergedResults.length} results in ${searchTime}ms`)
    console.log(`Vector: ${stats.vectorResults} (avg: ${stats.vectorAvgScore.toFixed(3)}), BM25: ${stats.bm25Results} (avg: ${stats.bm25AvgScore.toFixed(3)})`)

    // Log statistics for performance tuning
    await logSearchStats(query, userId, stats, config)

    return {
      results: mergedResults,
      stats,
      queryType
    }
  } catch (error) {
    console.error('Hybrid search error:', error)
    
    // Fallback to vector search only
    if (vectorResults.length > 0) {
      return {
        results: vectorResults.slice(0, config.maxResults).map(vr => ({
          ...vr,
          bm25Score: 0,
          rrfScore: vr.similarity,
          source: 'vector' as const
        })),
        stats: {
          vectorResults: vectorResults.length,
          bm25Results: 0,
          mergedResults: vectorResults.length,
          vectorAvgScore,
          bm25AvgScore: 0,
          searchTimeMs: Date.now() - startTime,
          queryType
        },
        queryType
      }
    }

    return {
      results: [],
      stats: {
        vectorResults: 0,
        bm25Results: 0,
        mergedResults: 0,
        vectorAvgScore: 0,
        bm25AvgScore: 0,
        searchTimeMs: Date.now() - startTime,
        queryType
      },
      queryType
    }
  }
}