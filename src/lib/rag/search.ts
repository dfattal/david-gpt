// Vector similarity search utilities for RAG system
// Phase 2: pgvector integration for semantic search

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from './embeddings'
import { trackDatabaseQuery } from '@/lib/performance'
import { RAGChunk, RAGDocument, RetrievalQuery, RetrievalResult } from './types'

export interface VectorSearchOptions {
  limit?: number
  threshold?: number // Minimum similarity threshold (0.0 to 1.0)
  includeMetadata?: boolean
}

export interface VectorSearchResult {
  chunk: RAGChunk & { document?: RAGDocument }
  similarity: number
  rank: number
}

export interface SearchStats {
  totalResults: number
  searchTimeMs: number
  embeddingTimeMs: number
  queryTokens: number
}

// Perform vector similarity search using pgvector
export async function vectorSearch(
  queryText: string,
  userId: string,
  options: VectorSearchOptions = {}
): Promise<{
  results: VectorSearchResult[]
  stats: SearchStats
}> {
  const startTime = performance.now()
  const {
    limit = 20,
    threshold = 0.1,
    includeMetadata = true
  } = options

  const supabase = await createClient()

  // Step 1: Generate embedding for query
  const embeddingStartTime = performance.now()
  const queryEmbedding = await generateEmbedding(queryText)
  const embeddingTimeMs = performance.now() - embeddingStartTime

  // Step 2: Perform vector similarity search
  const searchStartTime = performance.now()
  
  // For Phase 2, we'll use a simpler approach without complex pgvector queries
  // Get all chunks for user and do similarity calculation in-memory
  const { data: allChunks, error } = await supabase
    .from('rag_chunks')
    .select(`
      *,
      ${includeMetadata ? 'rag_documents!inner(*)' : ''}
    `)
    .eq('rag_documents.owner', userId)
  
  trackDatabaseQuery('rag_vector_search', searchStartTime)
  const searchTimeMs = performance.now() - searchStartTime

  if (error) {
    console.error('Vector search error:', error)
    throw new Error(`Vector search failed: ${error.message}`)
  }

  if (!allChunks || allChunks.length === 0) {
    return {
      results: [],
      stats: {
        totalResults: 0,
        searchTimeMs: performance.now() - startTime,
        embeddingTimeMs,
        queryTokens: queryEmbedding.tokens
      }
    }
  }

  // Calculate similarities in-memory using cosine similarity
  const { cosineSimilarity } = await import('./embeddings')
  const chunkSimilarities = allChunks.map((rawChunk: unknown, index) => {
    let similarity = 0
    
    try {
      const chunk = rawChunk as Record<string, unknown>
      if (chunk.embedding && Array.isArray(chunk.embedding)) {
        similarity = cosineSimilarity(queryEmbedding.embedding, chunk.embedding)
      }
    } catch (error) {
      console.warn(`Failed to calculate similarity for chunk ${(rawChunk as Record<string, unknown>)?.id}:`, error)
      similarity = 0
    }
    
    return { chunk: rawChunk, similarity, originalIndex: index }
  })

  // Filter by threshold and sort by similarity (descending)
  const filteredResults = chunkSimilarities
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  // Transform to expected format
  const searchResults: VectorSearchResult[] = filteredResults.map((item, index) => {
    const rawChunk = item.chunk as Record<string, unknown>
    const chunk: RAGChunk = {
      id: rawChunk.id as number,
      doc_id: rawChunk.doc_id as string,
      chunk_index: rawChunk.chunk_index as number,
      content: rawChunk.content as string,
      embedding: rawChunk.embedding as number[],
      fts: rawChunk.fts as string,
      chunk_date: rawChunk.chunk_date as string,
      tags: (rawChunk.tags as string[]) || [],
      labels: (rawChunk.labels as Record<string, unknown>) || {},
      created_at: rawChunk.created_at as string
    }

    const result: VectorSearchResult = {
      chunk: includeMetadata && rawChunk.rag_documents 
        ? { ...chunk, document: rawChunk.rag_documents as RAGDocument }
        : chunk,
      similarity: item.similarity,
      rank: index + 1
    }

    return result
  })

  const totalTimeMs = performance.now() - startTime

  return {
    results: searchResults,
    stats: {
      totalResults: searchResults.length,
      searchTimeMs: totalTimeMs,
      embeddingTimeMs,
      queryTokens: queryEmbedding.tokens
    }
  }
}

// Enhanced search that combines multiple strategies (Phase 3+ will expand this)
export async function hybridSearch(
  query: RetrievalQuery,
  userId: string
): Promise<{
  results: RetrievalResult[]
  stats: SearchStats
}> {
  // For Phase 2, we'll just do vector search
  // Phase 4 will add BM25 and hybrid ranking
  
  const vectorResults = await vectorSearch(query.text, userId, {
    limit: query.limit,
    threshold: 0.1,
    includeMetadata: true
  })

  // Transform to RetrievalResult format
  const results: RetrievalResult[] = vectorResults.results.map(result => ({
    chunk: result.chunk,
    document: result.chunk.document!,
    score: result.similarity,
    rank: result.rank,
    source: 'vector' as const
  }))

  return {
    results,
    stats: vectorResults.stats
  }
}

// Test vector search functionality
export async function testVectorSearch(userId: string): Promise<{
  success: boolean
  error?: string
  stats?: SearchStats
  sampleResults?: number
}> {
  try {
    console.log('Testing vector search functionality...')
    
    // Perform a simple test search
    const testQuery = "test document content"
    const searchResult = await vectorSearch(testQuery, userId, {
      limit: 5,
      threshold: 0.0, // Very low threshold to get any results
      includeMetadata: true
    })
    
    console.log(`Vector search test completed: ${searchResult.results.length} results`)
    
    return {
      success: true,
      stats: searchResult.stats,
      sampleResults: searchResult.results.length
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Vector search test failed:', errorMessage)
    
    return {
      success: false,
      error: errorMessage
    }
  }
}

// Get search performance metrics
export async function getSearchMetrics(userId: string, timeRangeHours = 24): Promise<{
  totalSearches: number
  averageLatency: number
  averageResults: number
  popularQueries: Array<{ query: string; count: number }>
}> {
  // This would be implemented with search logging in a real system
  // For now, return mock data for Phase 2
  
  return {
    totalSearches: 0,
    averageLatency: 0,
    averageResults: 0,
    popularQueries: []
  }
}

// Utility function to validate search results
export function validateSearchResults(results: VectorSearchResult[]): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  // Check result ordering (similarity should be descending)
  for (let i = 1; i < results.length; i++) {
    if (results[i].similarity > results[i - 1].similarity) {
      issues.push(`Results not properly ordered by similarity at index ${i}`)
    }
  }
  
  // Check similarity values are in valid range
  results.forEach((result, index) => {
    if (result.similarity < 0 || result.similarity > 1) {
      issues.push(`Invalid similarity at index ${index}: ${result.similarity}`)
    }
    
    if (!result.chunk.content || result.chunk.content.trim().length === 0) {
      issues.push(`Empty chunk content at index ${index}`)
    }
    
    if (result.rank !== index + 1) {
      issues.push(`Incorrect rank at index ${index}: expected ${index + 1}, got ${result.rank}`)
    }
  })
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

// Advanced similarity search with filtering (for future phases)
export async function advancedVectorSearch(
  queryText: string,
  userId: string,
  filters: {
    documentIds?: string[]
    tags?: string[]
    dateRange?: { from: string; to: string }
    sourceTypes?: string[]
  } = {},
  options: VectorSearchOptions = {}
): Promise<{
  results: VectorSearchResult[]
  stats: SearchStats
}> {
  // For Phase 2, we'll implement basic filtering
  // Phase 4+ will add more sophisticated filtering
  
  const supabase = await createClient()
  const startTime = performance.now()
  
  // Generate query embedding
  const embeddingStartTime = performance.now()
  const queryEmbedding = await generateEmbedding(queryText)
  const embeddingTimeMs = performance.now() - embeddingStartTime
  
  // Build filtered query
  let query = supabase
    .from('rag_chunks')
    .select(`
      *,
      rag_documents!inner(*)
    `)
    .eq('rag_documents.owner', userId)
    .order('embedding <-> $1', { ascending: true })
    .limit(options.limit || 20)
  
  // Apply filters
  if (filters.documentIds && filters.documentIds.length > 0) {
    query = query.in('doc_id', filters.documentIds)
  }
  
  if (filters.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags)
  }
  
  if (filters.sourceTypes && filters.sourceTypes.length > 0) {
    query = query.in('rag_documents.source_type', filters.sourceTypes)
  }
  
  if (filters.dateRange) {
    query = query
      .gte('rag_documents.doc_date', filters.dateRange.from)
      .lte('rag_documents.doc_date', filters.dateRange.to)
  }
  
  // Execute search
  const searchStartTime = performance.now()
  const { data: results, error } = await query
  
  trackDatabaseQuery('rag_vector_search_filtered', searchStartTime)
  const searchTimeMs = performance.now() - searchStartTime
  
  if (error) {
    throw new Error(`Filtered vector search failed: ${error.message}`)
  }

  if (!results || results.length === 0) {
    return {
      results: [],
      stats: {
        totalResults: 0,
        searchTimeMs: performance.now() - startTime,
        embeddingTimeMs,
        queryTokens: queryEmbedding.tokens
      }
    }
  }

  // Calculate similarities in-memory for filtered results
  const { cosineSimilarity } = await import('./embeddings')
  const chunkSimilarities = results.map((rawChunk: unknown, index) => {
    let similarity = 0
    
    try {
      const chunk = rawChunk as Record<string, unknown>
      if (chunk.embedding && Array.isArray(chunk.embedding)) {
        similarity = cosineSimilarity(queryEmbedding.embedding, chunk.embedding)
      }
    } catch (error) {
      console.warn(`Failed to calculate similarity for chunk ${(rawChunk as Record<string, unknown>)?.id}:`, error)
      similarity = 0
    }
    
    return { chunk: rawChunk, similarity, originalIndex: index }
  })

  // Filter by threshold and sort by similarity (descending)
  const filteredResults = chunkSimilarities
    .filter(item => item.similarity >= (options.threshold || 0.1))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit || 20)
  
  // Transform results
  const searchResults: VectorSearchResult[] = filteredResults.map((item, index) => {
    const rawChunk = item.chunk as Record<string, unknown>
    return {
      chunk: {
        id: rawChunk.id as number,
        doc_id: rawChunk.doc_id as string,
        chunk_index: rawChunk.chunk_index as number,
        content: rawChunk.content as string,
        embedding: rawChunk.embedding as number[],
        fts: rawChunk.fts as string,
        chunk_date: rawChunk.chunk_date as string,
        tags: (rawChunk.tags as string[]) || [],
        labels: (rawChunk.labels as Record<string, unknown>) || {},
        created_at: rawChunk.created_at as string,
        document: rawChunk.rag_documents as RAGDocument
      },
      similarity: item.similarity,
      rank: index + 1
    }
  })
  
  const totalTimeMs = performance.now() - startTime
  
  return {
    results: searchResults,
    stats: {
      totalResults: searchResults.length,
      searchTimeMs: totalTimeMs,
      embeddingTimeMs,
      queryTokens: queryEmbedding.tokens
    }
  }
}