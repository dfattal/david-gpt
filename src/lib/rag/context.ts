// RAG Context Builder for Chat Integration
// Phase 6: KG-Enhanced Retrieval Integration

import { hybridSearch, HybridSearchResult } from './hybrid-search'
import { vectorSearch, VectorSearchResult } from './search'
import { entityAwareSearch } from './knowledge-graph'
import { performKGEnhancedRetrieval, KGEnhancedContext } from './kg-enhanced-retrieval'
import { performAdvancedRetrieval, performFastAdvancedRetrieval, AdvancedRetrievalResult } from './advanced-retrieval'
import { buildCitations, CitedRAGContext, CitationOptions } from './citations'
import { initializeStreamingCitations, StreamingCitationOptions, StreamingCitationContext } from './streaming-citations'
import { buildDisplayMetadata, formatDisplayMetadata, generateCitationFooter, MetadataDisplayOptions, DisplayMetadata } from './metadata-display'
import { RAGChunk } from './types'

export interface RAGContextOptions {
  maxChunks?: number
  minSimilarity?: number
  includeDates?: boolean
  includeMetadata?: boolean
  deduplicate?: boolean
  vectorWeight?: number
  bm25Weight?: number
  useHybridSearch?: boolean
  useKnowledgeGraph?: boolean
  entityBoost?: number
  useKGEnhancedRetrieval?: boolean
  kgExpansionDepth?: number
  entityExpansionLimit?: number
  useAdvancedRetrieval?: boolean
  useQueryRewriting?: boolean
  useHyDE?: boolean
  useReranking?: boolean
  performanceMode?: 'fast' | 'comprehensive'
  enableCitations?: boolean
  citationOptions?: CitationOptions
  streamingCitationOptions?: StreamingCitationOptions
  metadataDisplayOptions?: MetadataDisplayOptions
}

export interface RAGContext {
  hasRelevantContent: boolean
  chunks: Array<{
    content: string
    source: string
    similarity: number
    bm25Score?: number
    rrfScore?: number
    searchSource?: 'vector' | 'bm25' | 'both'
    date?: string
    metadata?: Record<string, unknown>
  }>
  contextPrompt: string
  entityContext?: {
    detectedEntities: string[]
    relatedInfo: string
    entityBoost: boolean
  }
  kgEnhancedContext?: {
    recognizedEntities: string[]
    relatedEntities: string[]
    expansionTerms: string[]
    graphPaths: Array<{ startEntity: string, endEntity: string, relevance: number }>
    combinedRelevanceScore: number
    enhancedQuery: string
  }
  advancedRetrievalContext?: {
    originalQuery: string
    rewrittenQueries: string[]
    hydeDocuments: string[]
    candidatesFound: number
    rerankingUsed: boolean
    retrievalTimeBreakdown: {
      queryRewriting: number
      hydeGeneration: number
      search: number
      reranking: number
      total: number
    }
  }
  citedContext?: CitedRAGContext
  streamingCitationContext?: StreamingCitationContext
  displayMetadata?: DisplayMetadata
  stats: {
    totalChunks: number
    averageSimilarity: number
    averageBM25Score: number
    queryType: 'semantic' | 'keyword' | 'hybrid' | 'kg-enhanced' | 'advanced'
    retrievalTimeMs: number
    sources: string[]
    entitiesUsed?: number
    kgExpansions?: number
  }
}

// Default configuration for RAG context
const DEFAULT_RAG_OPTIONS: Required<RAGContextOptions> = {
  maxChunks: 5,
  minSimilarity: 0.3,
  includeDates: true,
  includeMetadata: true,
  deduplicate: true,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  useHybridSearch: true,
  useKnowledgeGraph: true,
  entityBoost: 1.3,
  useKGEnhancedRetrieval: true,
  kgExpansionDepth: 2,
  entityExpansionLimit: 8,
  useAdvancedRetrieval: false, // Default to false for performance
  useQueryRewriting: true,
  useHyDE: true,
  useReranking: true,
  performanceMode: 'fast',
  enableCitations: true,
  citationOptions: {
    maxSources: 8,
    dedupeBySources: true,
    preferNewerSources: true,
    includeDateRange: true,
    includeContentSnippets: true,
    snippetLength: 150,
    citationFormat: 'numbered',
    groupBySource: true
  },
  streamingCitationOptions: {
    enableInlineCitations: true,
    citationStyle: 'numbered',
    citationTriggers: 'sentence_end',
    maxCitationsPerResponse: 8,
    includeFinalCitationList: true,
    citationValidation: true
  },
  metadataDisplayOptions: {
    showDates: true,
    showSources: true,
    showRelevanceScores: false,
    showCitationCounts: true,
    showDateConflicts: true,
    formatStyle: 'compact',
    maxSourcesShown: 10,
    includeSnippets: false,
    snippetLength: 100
  }
}

// Build RAG context for a user query
export async function buildRAGContext(
  userQuery: string,
  userId: string,
  options: RAGContextOptions = {}
): Promise<RAGContext> {
  const startTime = performance.now()
  const config = { ...DEFAULT_RAG_OPTIONS, ...options }
  
  try {
    let entityContext: RAGContext['entityContext'] | undefined
    let kgEnhancedContext: RAGContext['kgEnhancedContext'] | undefined
    let advancedRetrievalContext: RAGContext['advancedRetrievalContext'] | undefined
    let searchResults: { results: Array<Record<string, unknown>>, queryType?: string } | undefined = undefined

    // Priority order: Advanced Retrieval > KG-Enhanced > Hybrid/Vector Search
    if (config.useAdvancedRetrieval) {
      try {
        console.log('Using advanced retrieval with query rewriting, HyDE, and reranking')
        
        const advancedResult = config.performanceMode === 'fast'
          ? await performFastAdvancedRetrieval(userQuery, userId, {
              useQueryRewriting: config.useQueryRewriting,
              useHyDE: config.useHyDE,
              useReranking: config.useReranking,
              finalResultCount: config.maxChunks
            })
          : await performAdvancedRetrieval(userQuery, userId, {
              useQueryRewriting: config.useQueryRewriting,
              useHyDE: config.useHyDE,
              useReranking: config.useReranking,
              finalResultCount: config.maxChunks
            })

        // Convert advanced retrieval results to standard format
        searchResults = {
          results: advancedResult.finalResults.map(result => ({
            chunk: result.chunk,
            similarity: result.finalScore || result.similarity,
            bm25Score: 0, // Not applicable for advanced retrieval
            rrfScore: result.rerankScore || result.similarity,
            source: result.source
          })),
          queryType: 'advanced'
        }

        // Build advanced retrieval context
        advancedRetrievalContext = {
          originalQuery: advancedResult.originalQuery,
          rewrittenQueries: advancedResult.rewrittenQueries || [],
          hydeDocuments: advancedResult.hydeDocuments || [],
          candidatesFound: advancedResult.retrievalStats.candidatesFound,
          rerankingUsed: config.useReranking,
          retrievalTimeBreakdown: {
            queryRewriting: advancedResult.retrievalStats.queryRewritingTimeMs,
            hydeGeneration: advancedResult.retrievalStats.hydeGenerationTimeMs,
            search: advancedResult.retrievalStats.searchTimeMs,
            reranking: advancedResult.retrievalStats.rerankingTimeMs,
            total: advancedResult.retrievalStats.totalTimeMs
          }
        }

        console.log(`Advanced retrieval: ${searchResults.results.length} results in ${advancedResult.retrievalStats.totalTimeMs.toFixed(2)}ms`)
        
      } catch (advancedError) {
        console.warn('Advanced retrieval failed, falling back to KG-enhanced retrieval:', advancedError)
        // Fall through to KG-enhanced retrieval
      }
    }

    // Use KG-enhanced retrieval if advanced retrieval wasn't used or failed
    if (!searchResults && config.useKGEnhancedRetrieval && config.useKnowledgeGraph) {
      try {
        console.log('Using KG-enhanced retrieval')
        
        const kgRetrievalResult = await performKGEnhancedRetrieval(userQuery, userId, {
          maxChunks: config.maxChunks * 2,
          kgOptions: {
            maxEntityExpansions: config.entityExpansionLimit,
            maxRelationDepth: config.kgExpansionDepth,
            entityBoostFactor: config.entityBoost,
            relationConfidenceThreshold: 0.6
          },
          hybridSearchOptions: {
            vectorWeight: config.vectorWeight,
            bm25Weight: config.bm25Weight,
            minVectorSimilarity: config.minSimilarity
          }
        })

        searchResults = kgRetrievalResult.searchResults
        
        // Build KG enhanced context
        kgEnhancedContext = {
          recognizedEntities: kgRetrievalResult.kgContext.recognizedEntities.map(e => e.entity.canonical_name),
          relatedEntities: kgRetrievalResult.kgContext.relatedEntities.map(e => e.entity.canonical_name),
          expansionTerms: kgRetrievalResult.kgContext.expansionTerms,
          graphPaths: kgRetrievalResult.kgContext.graphTraversalPaths.map(p => ({
            startEntity: p.startEntity,
            endEntity: p.endEntity,
            relevance: p.relevance
          })),
          combinedRelevanceScore: kgRetrievalResult.combinedScore,
          enhancedQuery: kgRetrievalResult.enhancedQuery
        }

        console.log(`KG-enhanced retrieval: ${kgEnhancedContext.recognizedEntities.length} entities, ${kgEnhancedContext.expansionTerms.length} expansions`)
        
      } catch (kgError) {
        console.warn('KG-enhanced retrieval failed, falling back to hybrid search:', kgError)
        // Fallback to hybrid search
        searchResults = await performFallbackSearch(userQuery, userId, config)
      }
    } else {
      // Get basic entity-aware context if knowledge graph is enabled (legacy mode)
      if (config.useKnowledgeGraph) {
        try {
          const kgContext = await entityAwareSearch(userQuery, userId, {
            includeRelatedEntities: true,
            entityBoost: config.entityBoost,
            maxEntities: 3
          })
          
          if (kgContext.entities.length > 0) {
            entityContext = {
              detectedEntities: kgContext.entities.map(e => e.canonical_name),
              relatedInfo: kgContext.relatedInfo,
              entityBoost: true
            }
            
            console.log(`Basic KG context: Found ${kgContext.entities.length} entities: ${entityContext.detectedEntities.join(', ')}`)
          }
        } catch (kgError) {
          console.warn('Knowledge graph context failed, continuing without KG:', kgError)
        }
      }

      // Perform hybrid search or fallback to vector search
      searchResults = await performFallbackSearch(userQuery, userId, config)
    }

    // Filter and process results
    const relevantChunks = searchResults.results
      .filter(result => {
        if (config.useHybridSearch && 'bm25Score' in result) {
          // Hybrid search result
          const similarity = (result as any).similarity || 0
          const bm25Score = (result as any).bm25Score || 0
          return similarity >= config.minSimilarity || bm25Score > 0.01
        } else {
          // Vector search result
          const similarity = (result as any).similarity || 0
          return similarity >= config.minSimilarity
        }
      })
      .slice(0, config.maxChunks)

    // Deduplicate if requested
    const processedChunks = config.deduplicate 
      ? (config.useHybridSearch 
          ? deduplicateHybridChunks(relevantChunks as unknown as HybridSearchResult[])
          : deduplicateHybridChunks(relevantChunks.map(r => ({ 
              ...r, 
              bm25Score: 0, 
              rrfScore: (r as any).similarity,
              source: 'vector' as const,
              chunk: (r as any).chunk,
              similarity: (r as any).similarity,
              rank: (r as any).rank || 0
            })) as unknown as HybridSearchResult[])
        )
      : relevantChunks

    // Build context chunks for prompt
    const contextChunks = processedChunks.map(result => ({
      content: (result as any).chunk?.content || '',
      source: getChunkSource((result as any).chunk),
      similarity: (result as any).similarity || 0,
      bm25Score: ('bm25Score' in result) ? (result.bm25Score as number) : undefined,
      rrfScore: ('rrfScore' in result) ? (result.rrfScore as number) : undefined,
      searchSource: ('source' in result) ? (result.source as 'vector' | 'bm25' | 'both') : undefined,
      date: config.includeDates 
        ? getChunkDate((result as any).chunk)
        : undefined,
      metadata: config.includeMetadata 
        ? getChunkMetadata((result as any).chunk)
        : undefined
    }))

    // Build citations if enabled
    let citedContext: CitedRAGContext | undefined
    let streamingCitationContext: StreamingCitationContext | undefined
    
    if (config.enableCitations && contextChunks.length > 0) {
      try {
        // Build citations with source deduplication
        citedContext = buildCitations(
          processedChunks.map(result => ({
            content: (result as any).chunk?.content || '',
            source: getChunkSource((result as any).chunk),
            similarity: (result as any).similarity || 0,
            bm25Score: ('bm25Score' in result) ? (result.bm25Score as number) : undefined,
            rrfScore: ('rrfScore' in result) ? (result.rrfScore as number) : undefined,
            finalScore: (result as any).similarity || 0, // Use similarity as final score for now
            date: getChunkDate((result as any).chunk),
            metadata: getChunkMetadata((result as any).chunk),
            chunk: (result as any).chunk
          })),
          config.citationOptions
        )

        // Initialize streaming citation context
        streamingCitationContext = initializeStreamingCitations(
          citedContext.citationMap ? Array.from(citedContext.citationMap.values()) : [],
          citedContext.citationGroups,
          config.streamingCitationOptions
        )

        console.log(`Citations built: ${citedContext.citationGroups.length} sources, ${citedContext.chunks.length} cited chunks`)
      } catch (citationError) {
        console.warn('Citation building failed:', citationError)
      }
    }

    // Generate context prompt
    const contextPrompt = generateContextPrompt(contextChunks, userQuery)

    // Build stats first (needed for display metadata)
    const stats = {
      totalChunks: contextChunks.length,
      averageSimilarity: contextChunks.length > 0 
        ? contextChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / contextChunks.length
        : 0,
      averageBM25Score: contextChunks.length > 0
        ? contextChunks.reduce((sum, chunk) => sum + (chunk.bm25Score || 0), 0) / contextChunks.length
        : 0,
      queryType: advancedRetrievalContext 
        ? ('advanced' as const)
        : (kgEnhancedContext 
          ? ('kg-enhanced' as const)
          : (config.useHybridSearch && 'queryType' in searchResults && searchResults.queryType ? 
             (searchResults.queryType as 'hybrid' | 'semantic' | 'keyword') : 
             'semantic' as const)),
      retrievalTimeMs: performance.now() - startTime,
      sources: [...new Set(contextChunks.map(chunk => chunk.source))],
      entitiesUsed: (entityContext?.detectedEntities.length || 0) + (kgEnhancedContext?.recognizedEntities.length || 0),
      kgExpansions: kgEnhancedContext?.expansionTerms.length || 0
    }

    // Build temporary context for display metadata generation
    const tempContext: RAGContext = {
      hasRelevantContent: contextChunks.length > 0,
      chunks: contextChunks,
      contextPrompt,
      entityContext,
      kgEnhancedContext,
      advancedRetrievalContext,
      citedContext,
      streamingCitationContext,
      stats
    }

    // Build display metadata
    const displayMetadata = buildDisplayMetadata(tempContext, config.metadataDisplayOptions)

    return {
      hasRelevantContent: contextChunks.length > 0,
      chunks: contextChunks,
      contextPrompt,
      entityContext,
      kgEnhancedContext,
      advancedRetrievalContext,
      citedContext,
      streamingCitationContext,
      displayMetadata,
      stats
    }

  } catch (error) {
    console.error('Error building RAG context:', error)
    
    // Return empty context on error
    return {
      hasRelevantContent: false,
      chunks: [],
      contextPrompt: '',
      entityContext: undefined,
      stats: {
        totalChunks: 0,
        averageSimilarity: 0,
        averageBM25Score: 0,
        queryType: 'semantic',
        retrievalTimeMs: performance.now() - startTime,
        sources: [],
        entitiesUsed: 0,
        kgExpansions: 0
      }
    }
  }
}

// Perform fallback search (hybrid or vector)
async function performFallbackSearch(
  userQuery: string,
  userId: string,
  config: Required<RAGContextOptions>
): Promise<{ results: Array<Record<string, unknown>>, queryType?: string }> {
  const result = config.useHybridSearch 
    ? await hybridSearch(userQuery, userId, {
        maxResults: config.maxChunks * 2,
        vectorWeight: config.vectorWeight,
        bm25Weight: config.bm25Weight,
        minVectorSimilarity: config.minSimilarity
      })
    : await legacyVectorSearch(userQuery, userId, config)
  
  return {
    results: result.results as unknown as Array<Record<string, unknown>>,
    queryType: result.queryType
  }
}

// Legacy vector search fallback
async function legacyVectorSearch(
  query: string, 
  userId: string, 
  config: Required<RAGContextOptions>
): Promise<{ results: VectorSearchResult[], queryType: 'semantic' }> {
  const vectorResults = await vectorSearch(query, userId, {
    limit: config.maxChunks * 2,
    threshold: config.minSimilarity
  })
  
  return {
    results: vectorResults.results,
    queryType: 'semantic' as const
  }
}

// Helper functions for chunk data extraction
function getChunkSource(chunk: RAGChunk): string {
  return chunk.labels?.title as string || `Document ${chunk.doc_id}`
}

function getChunkDate(chunk: RAGChunk): string | undefined {
  return chunk.chunk_date || chunk.created_at?.split('T')[0]
}

function getChunkMetadata(chunk: RAGChunk): Record<string, unknown> {
  return {
    doc_id: chunk.doc_id,
    chunk_index: chunk.chunk_index,
    tags: chunk.tags,
    labels: chunk.labels
  }
}

// Deduplicate hybrid search results
function deduplicateHybridChunks(chunks: HybridSearchResult[]): HybridSearchResult[] {
  const deduplicated: HybridSearchResult[] = []
  const SIMILARITY_THRESHOLD = 0.8
  
  for (const chunk of chunks) {
    const isDuplicate = deduplicated.some(existing => {
      const similarity = calculateTextSimilarity(chunk.chunk.content, existing.chunk.content)
      return similarity > SIMILARITY_THRESHOLD
    })
    
    if (!isDuplicate) {
      deduplicated.push(chunk)
    }
  }
  
  return deduplicated
}

// Legacy deduplicate function (unused)
/*
function deduplicateChunks(chunks: any[]): any[] {
  const deduplicated: any[] = []
  const SIMILARITY_THRESHOLD = 0.8
  
  for (const chunk of chunks) {
    const isDuplicate = deduplicated.some(existing => {
      const similarity = calculateTextSimilarity(chunk.chunk.content, existing.chunk.content)
      return similarity > SIMILARITY_THRESHOLD
    })
    
    if (!isDuplicate) {
      deduplicated.push(chunk)
    }
  }
  
  return deduplicated
}
*/

// Simple text similarity calculation (Jaccard similarity)
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/))
  const words2 = new Set(text2.toLowerCase().split(/\s+/))
  
  const intersection = new Set([...words1].filter(word => words2.has(word)))
  const union = new Set([...words1, ...words2])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

// Generate the context prompt for the AI model
function generateContextPrompt(
  chunks: Array<{ content: string; source: string; similarity: number; date?: string }>,
  userQuery: string
): string {
  if (chunks.length === 0) {
    return ''
  }

  const contextHeader = `## Relevant Context

The following information from your knowledge base may be relevant to the user's query: "${userQuery}"

`

  const contextSections = chunks.map((chunk, index) => {
    const dateInfo = chunk.date ? ` (${chunk.date})` : ''
    return `### Source ${index + 1}: ${chunk.source}${dateInfo}
${chunk.content}
`
  }).join('\n')

  const contextFooter = `
## Instructions

Use the above context to provide accurate, helpful responses. If the context contains relevant information, reference it in your answer. If the context doesn't contain relevant information for the user's query, rely on your general knowledge but mention that you don't have specific information in the knowledge base about their question.

Always prioritize accuracy and cite your sources when using information from the context.

---

`

  return contextHeader + contextSections + contextFooter
}

// Enhanced system prompt that includes RAG context and entity information
export function buildEnhancedSystemPrompt(
  baseSystemPrompt: string,
  ragContext: RAGContext
): string {
  if (!ragContext.hasRelevantContent) {
    return baseSystemPrompt
  }

  let enhancedPrompt = ragContext.contextPrompt
  
  // Add advanced retrieval context if available (highest priority)
  if (ragContext.advancedRetrievalContext && ragContext.advancedRetrievalContext.rewrittenQueries.length > 0) {
    const advancedInfo = `

## Advanced Retrieval Context
**Original Query**: "${ragContext.advancedRetrievalContext.originalQuery}"
**Query Rewrites Used**: ${ragContext.advancedRetrievalContext.rewrittenQueries.join(' | ')}
${ragContext.advancedRetrievalContext.hydeDocuments.length > 0 ? `**HyDE Documents Generated**: ${ragContext.advancedRetrievalContext.hydeDocuments.length} hypothetical documents` : ''}
**Candidates Evaluated**: ${ragContext.advancedRetrievalContext.candidatesFound}
**Reranking Applied**: ${ragContext.advancedRetrievalContext.rerankingUsed ? 'Yes' : 'No'}

**Performance Breakdown**:
- Query Rewriting: ${ragContext.advancedRetrievalContext.retrievalTimeBreakdown.queryRewriting.toFixed(1)}ms
- HyDE Generation: ${ragContext.advancedRetrievalContext.retrievalTimeBreakdown.hydeGeneration.toFixed(1)}ms
- Search: ${ragContext.advancedRetrievalContext.retrievalTimeBreakdown.search.toFixed(1)}ms
- Reranking: ${ragContext.advancedRetrievalContext.retrievalTimeBreakdown.reranking.toFixed(1)}ms
- **Total**: ${ragContext.advancedRetrievalContext.retrievalTimeBreakdown.total.toFixed(1)}ms

This response uses advanced retrieval techniques including query rewriting, HyDE (Hypothetical Document Embeddings), and cross-encoder reranking for optimal result quality.
`
    enhancedPrompt += advancedInfo
  }
  // Add KG enhanced context if available (second priority)
  else if (ragContext.kgEnhancedContext && ragContext.kgEnhancedContext.recognizedEntities.length > 0) {
    const kgInfo = `

## Knowledge Graph Context
**Recognized Entities**: ${ragContext.kgEnhancedContext.recognizedEntities.join(', ')}
${ragContext.kgEnhancedContext.relatedEntities.length > 0 ? `**Related Entities**: ${ragContext.kgEnhancedContext.relatedEntities.join(', ')}` : ''}
${ragContext.kgEnhancedContext.expansionTerms.length > 0 ? `**Expansion Terms**: ${ragContext.kgEnhancedContext.expansionTerms.join(', ')}` : ''}

**Enhanced Query Used**: "${ragContext.kgEnhancedContext.enhancedQuery}"
**Knowledge Graph Relevance Score**: ${(ragContext.kgEnhancedContext.combinedRelevanceScore * 100).toFixed(1)}%

${ragContext.kgEnhancedContext.graphPaths.length > 0 ? `**Entity Relationships**:
${ragContext.kgEnhancedContext.graphPaths.slice(0, 3).map(p => `• ${p.startEntity} → ${p.endEntity} (relevance: ${(p.relevance * 100).toFixed(1)}%)`).join('\n')}` : ''}

Use this knowledge graph context to provide more connected and comprehensive responses that leverage entity relationships and expansions.
`
    enhancedPrompt += kgInfo
  }
  // Add basic entity context if KG enhanced context is not available
  else if (ragContext.entityContext && ragContext.entityContext.detectedEntities.length > 0) {
    const entityInfo = `

## Entity Context
The following entities were detected in the user's query: ${ragContext.entityContext.detectedEntities.join(', ')}.

${ragContext.entityContext.relatedInfo ? `Related information: ${ragContext.entityContext.relatedInfo}` : ''}

Consider these entities when formulating your response and reference them appropriately.
`
    enhancedPrompt += entityInfo
  }

  // Add citation guidance if citations are available
  if (ragContext.citedContext && ragContext.citedContext.citationGroups.length > 0) {
    const citationInfo = `

## Citation Guidelines
${ragContext.citedContext.citationGroups.length} sources are available for citation. When referencing information from the context:
- Include numbered citations like [1], [2], etc. directly in your response text when making claims or referencing facts
- Multiple sources can be cited together like [1,2] when they support the same point
- Each source has been deduplicated - different chunks from the same source share the same citation number
- ${ragContext.citedContext.dateRange ? `Date range: ${ragContext.citedContext.dateRange.earliest} to ${ragContext.citedContext.dateRange.latest}` : 'Some sources may not have dates available'}
${ragContext.citedContext.conflictingDates?.length ? `- Note: ${ragContext.citedContext.conflictingDates.length} sources have conflicting dates that have been resolved` : ''}

**Available Sources:**
${ragContext.citedContext.citationGroups.map(group => 
  `[${group.citationNumber}] ${group.sourceTitle}${group.datePublished ? ` (${group.datePublished})` : ''}`
).join('\n')}

IMPORTANT: Include citation numbers [1,2] within your response text when referencing information. The sources list will be automatically appended at the end.
`
    enhancedPrompt += citationInfo
  }

  return enhancedPrompt + '\n\n' + baseSystemPrompt
}

// Utility to determine if a query should trigger RAG retrieval
export function shouldUseRAG(userMessage: string): boolean {
  // Simple heuristics for when to use RAG
  const ragTriggers = [
    // Question words
    /\b(what|when|where|who|why|how)\b/i,
    // Information seeking
    /\b(tell me|explain|describe|information|details)\b/i,
    // Specific topics that might be in documents
    /\b(document|report|specification|requirements|guidelines)\b/i,
    // Comparison and analysis
    /\b(compare|difference|similar|analysis|overview)\b/i
  ]

  // Don't use RAG for very short messages or greetings
  if (userMessage.trim().length < 10) {
    return false
  }

  // Don't use RAG for obvious greetings
  const greetings = /^(hi|hello|hey|good\s+(morning|afternoon|evening))/i
  if (greetings.test(userMessage.trim())) {
    return false
  }

  // Use RAG if any trigger patterns match
  return ragTriggers.some(pattern => pattern.test(userMessage))
}

// Format citation information for streaming responses
export function formatCitations(chunks: RAGContext['chunks'], ragContext?: RAGContext): string {
  // Use new citation system if available
  if (ragContext?.citedContext && ragContext.citedContext.citationGroups.length > 0) {
    const citations = ragContext.citedContext.citationGroups.map(group => {
      const dateInfo = group.datePublished ? ` (${group.datePublished})` : ''
      return `[${group.citationNumber}] ${group.sourceTitle}${dateInfo}`
    }).join('\n')

    return `\n\n<div style="font-size: 0.85em; color: #666; margin-top: 1rem;">\n\n${citations}\n\n</div>`
  }

  // Fallback to legacy formatting with small font
  if (chunks.length === 0) {
    return ''
  }

  const citations = chunks.map((chunk, index) => {
    const dateInfo = chunk.date ? ` (${chunk.date})` : ''
    return `[${index + 1}] ${chunk.source}${dateInfo}`
  }).join('\n')

  return `\n\n<div style="font-size: 0.85em; color: #666; margin-top: 1rem;">\n\n${citations}\n\n</div>`
}

// Validate RAG context for quality assurance
export function validateRAGContext(context: RAGContext): {
  isValid: boolean
  issues: string[]
  recommendations: string[]
} {
  const issues: string[] = []
  const recommendations: string[] = []

  // Check if context has reasonable content
  if (context.hasRelevantContent && context.chunks.length === 0) {
    issues.push('Context claims to have relevant content but no chunks provided')
  }

  // Check similarity quality
  if (context.hasRelevantContent && context.stats.averageSimilarity < 0.3) {
    issues.push(`Low average similarity: ${context.stats.averageSimilarity.toFixed(2)}`)
    recommendations.push('Consider raising minimum similarity threshold')
  }

  // Check for diversity in sources
  if (context.chunks.length > 2 && context.stats.sources.length === 1) {
    recommendations.push('All chunks from single source - consider diversifying retrieval')
  }

  // Check retrieval performance
  if (context.stats.retrievalTimeMs > 2000) {
    issues.push(`Slow retrieval time: ${context.stats.retrievalTimeMs.toFixed(2)}ms`)
    recommendations.push('Consider optimizing search performance')
  }

  // Check chunk content quality
  const emptyChunks = context.chunks.filter(chunk => chunk.content.trim().length < 50)
  if (emptyChunks.length > 0) {
    issues.push(`${emptyChunks.length} chunks have very little content`)
  }

  return {
    isValid: issues.length === 0,
    issues,
    recommendations
  }
}

/**
 * Generate formatted metadata display for a RAG response
 */
export function generateMetadataDisplay(
  ragContext: RAGContext,
  format: 'compact' | 'detailed' | 'json' = 'compact'
): string {
  if (!ragContext.displayMetadata) {
    return ''
  }
  
  return formatDisplayMetadata(ragContext.displayMetadata, {
    formatStyle: format,
    showDates: true,
    showSources: true,
    showRelevanceScores: format === 'detailed',
    showCitationCounts: true,
    showDateConflicts: true
  })
}

/**
 * Generate citation footer for streaming responses
 */
export function generateResponseCitations(ragContext: RAGContext): string {
  if (ragContext.displayMetadata) {
    return generateCitationFooter(ragContext.displayMetadata)
  }
  
  // Fallback to legacy formatting
  return formatCitations(ragContext.chunks, ragContext)
}

/**
 * Check if RAG context has citations available
 */
export function hasCitations(ragContext: RAGContext): boolean {
  return Boolean(ragContext.citedContext?.citationGroups.length)
}

/**
 * Get citation count for a RAG context
 */
export function getCitationCount(ragContext: RAGContext): number {
  return ragContext.citedContext?.totalSources || ragContext.chunks.length
}

/**
 * Get date range for cited sources
 */
export function getSourceDateRange(ragContext: RAGContext): { earliest: string, latest: string } | null {
  return ragContext.citedContext?.dateRange || null
}

// Export for testing and configuration
export { DEFAULT_RAG_OPTIONS }