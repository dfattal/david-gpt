// Advanced Retrieval Techniques
// Phase 7: Query rewriting, HyDE, and cross-encoder reranking

import { openai } from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { hybridSearch, type HybridSearchResult } from './hybrid-search'
import { performKGEnhancedRetrieval } from './kg-enhanced-retrieval'
import { generateEmbedding } from './embeddings'
import type { RAGChunk } from './types'

// Schema for query rewriting
const QueryRewritingSchema = z.object({
  original_intent: z.string().describe('The main intent of the original query'),
  rewritten_queries: z.array(z.object({
    query: z.string().describe('Rewritten version of the query'),
    focus: z.string().describe('What specific aspect this query focuses on'),
    reasoning: z.string().describe('Why this rewrite might find better results')
  })).max(5).describe('Alternative ways to phrase the query for better retrieval'),
  semantic_expansions: z.array(z.string()).max(5).describe('Related terms and concepts to expand search'),
  question_types: z.array(z.enum(['factual', 'comparative', 'analytical', 'procedural', 'definitional']))
    .describe('Types of questions being asked')
})

// Schema for HyDE generation
const HyDESchema = z.object({
  hypothetical_documents: z.array(z.object({
    content: z.string().describe('Hypothetical document content that would answer the query'),
    document_type: z.enum(['technical_doc', 'tutorial', 'reference', 'analysis', 'news', 'discussion'])
      .describe('Type of document this represents'),
    confidence: z.number().min(0).max(1).describe('Confidence in this hypothetical document')
  })).max(3).describe('Hypothetical documents that would contain the answer'),
  key_concepts: z.array(z.string()).max(8).describe('Key concepts that should appear in relevant documents')
})

// Schema for cross-encoder reranking
const RerankingSchema = z.object({
  relevance_scores: z.array(z.object({
    chunk_index: z.number().describe('Index of the chunk in the original list'),
    relevance_score: z.number().min(0).max(1).describe('Relevance score 0-1'),
    reasoning: z.string().describe('Brief explanation of relevance assessment'),
    key_matches: z.array(z.string()).describe('Key terms or concepts that match')
  })).describe('Relevance scores for each chunk'),
  overall_assessment: z.string().describe('Overall assessment of result quality')
})

export type QueryRewriting = z.infer<typeof QueryRewritingSchema>
export type HyDEGeneration = z.infer<typeof HyDESchema>
export type RerankingResult = z.infer<typeof RerankingSchema>

export interface AdvancedRetrievalOptions {
  useQueryRewriting?: boolean
  useHyDE?: boolean
  useReranking?: boolean
  maxRewrittenQueries?: number
  hydeWeight?: number
  rerankingModel?: string
  maxCandidates?: number
  finalResultCount?: number
  enablePerformanceOptimization?: boolean
}

export interface AdvancedRetrievalResult {
  originalQuery: string
  rewrittenQueries?: string[]
  hydeDocuments?: string[]
  candidateResults: Array<{
    chunk: RAGChunk
    similarity: number
    source: string
    rerankScore?: number
  }>
  finalResults: Array<{
    chunk: RAGChunk
    similarity: number
    source: string
    rerankScore?: number
    finalScore: number
  }>
  retrievalStats: {
    queryRewritingTimeMs: number
    hydeGenerationTimeMs: number
    searchTimeMs: number
    rerankingTimeMs: number
    totalTimeMs: number
    candidatesFound: number
    finalResultsCount: number
  }
}

const DEFAULT_ADVANCED_OPTIONS: Required<AdvancedRetrievalOptions> = {
  useQueryRewriting: true,
  useHyDE: true,
  useReranking: true,
  maxRewrittenQueries: 3,
  hydeWeight: 0.3,
  rerankingModel: 'gpt-4o-mini',
  maxCandidates: 20,
  finalResultCount: 8,
  enablePerformanceOptimization: true
}

/**
 * Generate multiple query variations for better retrieval coverage
 */
export async function generateQueryRewrites(
  query: string,
  options: { maxRewrites?: number } = {}
): Promise<QueryRewriting> {
  const { maxRewrites = 3 } = options
  
  console.log(`Generating query rewrites for: "${query}"`)

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: QueryRewritingSchema,
      prompt: `
You are an expert at rewriting search queries to improve retrieval results.

Given a user query, generate alternative phrasings that might find better or additional relevant information.

Consider these rewriting strategies:
1. **Synonyms**: Use alternative terms with similar meanings
2. **Specificity**: Make broad queries more specific or specific queries broader  
3. **Context**: Add context that might be implicit in the original query
4. **Perspective**: Rephrase from different angles or viewpoints
5. **Technical vs. Layman**: Convert between technical and everyday language
6. **Question vs. Statement**: Convert between question and statement forms

Original Query: "${query}"

Generate ${maxRewrites} high-quality query rewrites that explore different aspects or phrasings.
Focus on variations that would retrieve complementary information, not just synonyms.
      `,
      temperature: 0.3
    })

    console.log(`Generated ${result.object.rewritten_queries.length} query rewrites`)
    return result.object

  } catch (error) {
    console.error('Query rewriting failed:', error)
    return {
      original_intent: query,
      rewritten_queries: [],
      semantic_expansions: [],
      question_types: ['factual']
    }
  }
}

/**
 * Generate hypothetical documents that would answer the query (HyDE technique)
 */
export async function generateHyDEDocuments(
  query: string,
  options: { maxDocuments?: number } = {}
): Promise<HyDEGeneration> {
  const { maxDocuments = 3 } = options
  
  console.log(`Generating HyDE documents for: "${query}"`)

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: HyDESchema,
      prompt: `
You are an expert at generating hypothetical documents for the HyDE (Hypothetical Document Embeddings) retrieval technique.

Given a user query, create ${maxDocuments} hypothetical document passages that would contain the answer to this query.

These hypothetical documents should:
1. **Be realistic**: Sound like they could come from actual documents
2. **Be comprehensive**: Cover different aspects of the potential answer
3. **Use varied vocabulary**: Include synonyms and related terms
4. **Match document styles**: Reflect how the information might appear in different document types
5. **Be specific**: Include concrete details and examples when possible

The goal is to create text that has semantic similarity to real documents that would answer the query.

Query: "${query}"

Generate realistic hypothetical documents that would contain comprehensive answers to this query.
      `,
      temperature: 0.4
    })

    console.log(`Generated ${result.object.hypothetical_documents.length} HyDE documents`)
    return result.object

  } catch (error) {
    console.error('HyDE generation failed:', error)
    return {
      hypothetical_documents: [],
      key_concepts: []
    }
  }
}

/**
 * Rerank search results using cross-encoder approach with LLM
 */
export async function rerankResults(
  query: string,
  candidates: Array<{ chunk: RAGChunk; similarity: number }>,
  options: { model?: string; maxCandidates?: number } = {}
): Promise<RerankingResult> {
  const { model = 'gpt-4o-mini', maxCandidates = 10 } = options
  
  // Limit candidates for performance
  const limitedCandidates = candidates.slice(0, maxCandidates)
  
  console.log(`Reranking ${limitedCandidates.length} candidates for query: "${query}"`)

  try {
    // Prepare chunks for reranking
    const chunksForReranking = limitedCandidates.map((candidate, index) => ({
      index,
      content: candidate.chunk.content.substring(0, 800), // Limit content for token efficiency
      similarity: candidate.similarity
    }))

    const result = await generateObject({
      model: openai(model),
      schema: RerankingSchema,
      prompt: `
You are an expert at evaluating document relevance for search queries.

Evaluate how well each document chunk answers or relates to the user's query.

Query: "${query}"

Document Chunks:
${chunksForReranking.map(chunk => 
  `[${chunk.index}] (similarity: ${chunk.similarity.toFixed(3)})\n${chunk.content}\n---`
).join('\n')}

For each chunk, provide:
1. A relevance score (0-1) where 1 is perfectly relevant and 0 is completely irrelevant
2. Brief reasoning for the score
3. Key matching terms or concepts

Consider these factors:
- **Direct answer**: Does the chunk directly answer the query?
- **Contextual relevance**: Is the chunk about the same topic/domain?
- **Information completeness**: Does it provide useful information even if not a direct answer?
- **Specificity match**: Does the level of detail match what the query is asking for?
- **Recency and accuracy**: Does the information seem current and accurate?

Be calibrated in your scoring - use the full 0-1 range appropriately.
      `,
      temperature: 0.1 // Low temperature for consistent scoring
    })

    console.log(`Reranking complete: scored ${result.object.relevance_scores.length} chunks`)
    return result.object

  } catch (error) {
    console.error('Reranking failed:', error)
    
    // Fallback: return original similarity scores as rerank scores
    return {
      relevance_scores: limitedCandidates.map((candidate, index) => ({
        chunk_index: index,
        relevance_score: candidate.similarity,
        reasoning: 'Fallback scoring due to reranking failure',
        key_matches: []
      })),
      overall_assessment: 'Reranking failed, using original similarity scores'
    }
  }
}

/**
 * Perform advanced retrieval with query rewriting, HyDE, and reranking
 */
export async function performAdvancedRetrieval(
  query: string,
  userId: string,
  options: AdvancedRetrievalOptions = {}
): Promise<AdvancedRetrievalResult> {
  const startTime = performance.now()
  const config = { ...DEFAULT_ADVANCED_OPTIONS, ...options }
  
  console.log(`Starting advanced retrieval for: "${query}"`)
  
  const result: AdvancedRetrievalResult = {
    originalQuery: query,
    candidateResults: [],
    finalResults: [],
    retrievalStats: {
      queryRewritingTimeMs: 0,
      hydeGenerationTimeMs: 0,
      searchTimeMs: 0,
      rerankingTimeMs: 0,
      totalTimeMs: 0,
      candidatesFound: 0,
      finalResultsCount: 0
    }
  }

  try {
    const allCandidates = new Set<string>() // For deduplication
    const candidateResults: Array<{ chunk: RAGChunk; similarity: number; source: string }> = []

    // Step 1: Query Rewriting
    let queryRewrites: QueryRewriting | undefined
    if (config.useQueryRewriting) {
      const queryRewritingStart = performance.now()
      queryRewrites = await generateQueryRewrites(query, {
        maxRewrites: config.maxRewrittenQueries
      })
      result.retrievalStats.queryRewritingTimeMs = performance.now() - queryRewritingStart
      result.rewrittenQueries = queryRewrites.rewritten_queries.map(rq => rq.query)
    }

    // Step 2: HyDE Generation
    let hydeGeneration: HyDEGeneration | undefined
    if (config.useHyDE) {
      const hydeStart = performance.now()
      hydeGeneration = await generateHyDEDocuments(query)
      result.retrievalStats.hydeGenerationTimeMs = performance.now() - hydeStart
      result.hydeDocuments = hydeGeneration.hypothetical_documents.map(doc => doc.content)
    }

    // Step 3: Multi-Query Search
    const searchStart = performance.now()
    
    // Original query search
    const originalResults = await performSingleSearch(query, userId, config, 'original')
    addUniqueResults(originalResults, candidateResults, allCandidates)

    // Rewritten queries search
    if (queryRewrites && config.useQueryRewriting) {
      for (const rewrite of queryRewrites.rewritten_queries) {
        const rewriteResults = await performSingleSearch(rewrite.query, userId, config, 'rewritten')
        addUniqueResults(rewriteResults, candidateResults, allCandidates)
      }
    }

    // HyDE document search
    if (hydeGeneration && config.useHyDE) {
      for (const hydeDoc of hydeGeneration.hypothetical_documents) {
        const hydeResults = await performSingleSearch(hydeDoc.content, userId, config, 'hyde')
        // Apply HyDE weight to similarity scores
        const weightedResults = hydeResults.map(r => ({
          ...r,
          similarity: r.similarity * config.hydeWeight
        }))
        addUniqueResults(weightedResults, candidateResults, allCandidates)
      }
    }

    result.retrievalStats.searchTimeMs = performance.now() - searchStart
    result.candidateResults = candidateResults.slice(0, config.maxCandidates)
    result.retrievalStats.candidatesFound = result.candidateResults.length

    // Step 4: Reranking
    if (config.useReranking && result.candidateResults.length > 0) {
      const rerankingStart = performance.now()
      
      const rerankingResult = await rerankResults(
        query, 
        result.candidateResults.map(r => ({ chunk: r.chunk, similarity: r.similarity })),
        { model: config.rerankingModel, maxCandidates: config.maxCandidates }
      )
      
      // Apply reranking scores
      const rerankedResults = result.candidateResults.map((candidate, index) => {
        const rerankScore = rerankingResult.relevance_scores.find(score => score.chunk_index === index)
        const finalScore = rerankScore ? 
          (candidate.similarity * 0.3 + rerankScore.relevance_score * 0.7) : // Weighted combination
          candidate.similarity
        
        return {
          ...candidate,
          rerankScore: rerankScore?.relevance_score,
          finalScore
        }
      })

      // Sort by final score and take top results
      result.finalResults = rerankedResults
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, config.finalResultCount)

      result.retrievalStats.rerankingTimeMs = performance.now() - rerankingStart
    } else {
      // No reranking - use original similarity scores
      result.finalResults = result.candidateResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, config.finalResultCount)
        .map(r => ({ ...r, finalScore: r.similarity }))
    }

    result.retrievalStats.finalResultsCount = result.finalResults.length
    result.retrievalStats.totalTimeMs = performance.now() - startTime

    console.log(`Advanced retrieval complete: ${result.retrievalStats.finalResultsCount} results in ${result.retrievalStats.totalTimeMs.toFixed(2)}ms`)

    return result

  } catch (error) {
    console.error('Advanced retrieval failed:', error)
    
    result.retrievalStats.totalTimeMs = performance.now() - startTime
    return result
  }
}

/**
 * Perform search for a single query
 */
async function performSingleSearch(
  query: string,
  userId: string,
  config: Required<AdvancedRetrievalOptions>,
  source: string
): Promise<Array<{ chunk: RAGChunk; similarity: number; source: string }>> {
  try {
    // Use KG-enhanced retrieval if available, otherwise fallback to hybrid search
    const searchResults = await hybridSearch(query, userId, {
      maxResults: Math.ceil(config.maxCandidates / 3), // Distribute candidates across queries
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      minVectorSimilarity: 0.1
    })

    return searchResults.results.map((result: HybridSearchResult) => ({
      chunk: result.chunk as RAGChunk,
      similarity: result.similarity as number,
      source: source
    }))

  } catch (error) {
    console.error(`Search failed for query "${query}":`, error)
    return []
  }
}

/**
 * Add unique results to candidate list (deduplicate by chunk ID)
 */
function addUniqueResults(
  newResults: Array<{ chunk: RAGChunk; similarity: number; source: string }>,
  candidateResults: Array<{ chunk: RAGChunk; similarity: number; source: string }>,
  seenChunks: Set<string>
): void {
  for (const result of newResults) {
    const chunkId = result.chunk.id.toString()
    if (!seenChunks.has(chunkId)) {
      seenChunks.add(chunkId)
      candidateResults.push(result)
    }
  }
}

/**
 * Performance-optimized version for sub-1s retrieval
 */
export async function performFastAdvancedRetrieval(
  query: string,
  userId: string,
  options: AdvancedRetrievalOptions = {}
): Promise<AdvancedRetrievalResult> {
  // Performance-optimized configuration
  const fastConfig = {
    ...DEFAULT_ADVANCED_OPTIONS,
    ...options,
    maxRewrittenQueries: 2, // Reduce query variations
    hydeWeight: 0.2, // Lower HyDE weight for speed
    rerankingModel: 'gpt-4o-mini', // Faster model
    maxCandidates: 12, // Fewer candidates to process
    enablePerformanceOptimization: true
  }

  console.log('Using performance-optimized advanced retrieval')
  
  return performAdvancedRetrieval(query, userId, fastConfig)
}