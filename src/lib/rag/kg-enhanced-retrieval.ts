// KG-Enhanced Retrieval System
// Phase 6: Query expansion and knowledge graph traversal

import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { searchEntities, findRelatedEntities, entityAwareSearch } from './knowledge-graph'
import { hybridSearch } from './hybrid-search'
import type { RAGEntity, RAGRelation } from './types'

// Schema for entity recognition in queries
const QueryEntitySchema = z.object({
  entities: z.array(z.object({
    name: z.string().describe('Entity name as it appears in the query'),
    type: z.enum(['company', 'product', 'tech', 'team', 'person', 'event', 'publication']).describe('Predicted entity type'),
    confidence: z.number().min(0).max(1).describe('Confidence in entity recognition'),
    context: z.string().describe('Context where entity appears in query')
  })).describe('Entities recognized in the user query'),
  intent: z.enum(['factual', 'comparison', 'explanation', 'analysis', 'general']).describe('Query intent type'),
  expansion_keywords: z.array(z.string()).describe('Additional keywords to expand search with')
})

export type QueryEntityRecognition = z.infer<typeof QueryEntitySchema>

export interface KGExpansionOptions {
  maxEntityExpansions?: number
  maxRelationDepth?: number
  includeEntityDescriptions?: boolean
  entityBoostFactor?: number
  relationConfidenceThreshold?: number
  expandQueryTerms?: boolean
}

export interface KGEnhancedContext {
  recognizedEntities: Array<{
    entity: RAGEntity
    queryMention: string
    confidence: number
  }>
  relatedEntities: Array<{
    entity: RAGEntity
    relation: RAGRelation
    path: string[]
    relevanceScore: number
  }>
  expandedQuery: string
  expansionTerms: string[]
  entityContext: string
  graphTraversalPaths: Array<{
    startEntity: string
    endEntity: string
    path: string[]
    relevance: number
  }>
}

const DEFAULT_KG_OPTIONS: Required<KGExpansionOptions> = {
  maxEntityExpansions: 10,
  maxRelationDepth: 2,
  includeEntityDescriptions: true,
  entityBoostFactor: 1.5,
  relationConfidenceThreshold: 0.6,
  expandQueryTerms: true
}

/**
 * Recognize entities mentioned in user queries using LLM
 */
export async function recognizeQueryEntities(
  query: string,
  userId: string
): Promise<QueryEntityRecognition> {
  console.log(`Recognizing entities in query: "${query}"`)

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: QueryEntitySchema,
      prompt: `
You are an expert at recognizing entities and intent in user queries.

Analyze the following user query and identify:

1. ENTITIES mentioned or implied:
   - Companies (OpenAI, Microsoft, Google, etc.)
   - Products (ChatGPT, iPhone, Windows, etc.)  
   - Technologies (AI, machine learning, React, etc.)
   - People (executives, founders, developers)
   - Teams (departments, groups)
   - Events (launches, conferences, releases)
   - Publications (reports, papers, articles)

2. QUERY INTENT:
   - factual: Seeking specific facts or information
   - comparison: Comparing multiple entities or options
   - explanation: Requesting explanations or how-to information
   - analysis: Requesting deep analysis or insights
   - general: General conversation or unclear intent

3. EXPANSION KEYWORDS:
   - Related terms that could help find relevant content
   - Synonyms and alternative phrasings
   - Technical terms and industry jargon

Guidelines:
- Be conservative with entity recognition - only identify clear entities
- Consider context and domain knowledge
- Provide confidence scores based on clarity of mention
- Include both explicit mentions and strong implications

User Query: "${query}"
      `,
      temperature: 0.1
    })

    console.log(`Entity recognition complete: ${result.object.entities.length} entities, intent: ${result.object.intent}`)
    return result.object

  } catch (error) {
    console.error('Entity recognition failed:', error)
    return {
      entities: [],
      intent: 'general',
      expansion_keywords: []
    }
  }
}

/**
 * Expand query using knowledge graph relationships
 */
export async function expandQueryWithKG(
  query: string,
  userId: string,
  options: KGExpansionOptions = {}
): Promise<KGEnhancedContext> {
  const config = { ...DEFAULT_KG_OPTIONS, ...options }
  
  console.log(`Expanding query with KG: "${query}"`)

  try {
    // Step 1: Recognize entities in the query
    const entityRecognition = await recognizeQueryEntities(query, userId)
    
    const recognizedEntities: KGEnhancedContext['recognizedEntities'] = []
    const relatedEntities: KGEnhancedContext['relatedEntities'] = []
    const expansionTerms = new Set(entityRecognition.expansion_keywords)
    const graphTraversalPaths: KGEnhancedContext['graphTraversalPaths'] = []

    // Step 2: For each recognized entity, find it in our knowledge graph
    for (const recognizedEntity of entityRecognition.entities) {
      if (recognizedEntity.confidence < 0.5) continue

      // Search for this entity in our KG
      const kgResult = await searchEntities(recognizedEntity.name, userId, {
        limit: 3
      })

      if (kgResult.entities.length > 0) {
        const bestMatch = kgResult.entities[0] // Best similarity match
        recognizedEntities.push({
          entity: { ...bestMatch, created_at: new Date().toISOString() } as RAGEntity,
          queryMention: recognizedEntity.name,
          confidence: recognizedEntity.confidence
        })

        // Step 3: Find related entities through graph traversal
        const relatedResult = await findRelatedEntities(bestMatch.canonical_name, userId, {
          maxDepth: config.maxRelationDepth,
          limit: 10
        })

        // Add related entities with relevance scoring - simplified for now
        for (const related of (relatedResult.entities || [])) {
          // Add to expansion terms
          expansionTerms.add(related.canonical_name)
        }
      }
    }

    // Step 4: Build expanded query
    const expandedQuery = config.expandQueryTerms 
      ? buildExpandedQuery(query, Array.from(expansionTerms))
      : query

    // Step 5: Generate entity context summary
    const entityContext = buildEntityContext(recognizedEntities, relatedEntities)

    console.log(`KG expansion complete: ${recognizedEntities.length} recognized, ${relatedEntities.length} related, ${expansionTerms.size} expansion terms`)

    return {
      recognizedEntities,
      relatedEntities,
      expandedQuery,
      expansionTerms: Array.from(expansionTerms),
      entityContext,
      graphTraversalPaths
    }

  } catch (error) {
    console.error('KG query expansion failed:', error)
    return {
      recognizedEntities: [],
      relatedEntities: [],
      expandedQuery: query,
      expansionTerms: [],
      entityContext: '',
      graphTraversalPaths: []
    }
  }
}

/**
 * Calculate relevance score for related entities
 */
function calculateRelevanceScore(
  entity: RAGEntity,
  relation: RAGRelation,
  queryEntity: QueryEntityRecognition['entities'][0],
  intent: QueryEntityRecognition['intent']
): number {
  let score = relation.confidence

  // Boost score based on relation type relevance
  const relationBoosts: Record<string, number> = {
    'partnered_with': 0.8,
    'developed_by': 0.9,
    'developed': 0.9,
    'launched_by': 0.7,
    'launched': 0.7,
    'uses_technology': 0.6,
    'funded_by': 0.5,
    'led_by': 0.6,
    'competitor_of': 0.8,
    'acquired': 0.7
  }

  score *= (relationBoosts[relation.relation] || 0.5)

  // Boost score based on query intent
  if (intent === 'comparison' && relation.relation === 'competitor_of') {
    score *= 1.3
  } else if (intent === 'factual' && ['developed_by', 'launched_by', 'led_by'].includes(relation.relation)) {
    score *= 1.2
  } else if (intent === 'analysis' && ['partnered_with', 'uses_technology'].includes(relation.relation)) {
    score *= 1.1
  }

  // Boost score based on entity type alignment
  if (entity.type === queryEntity.type) {
    score *= 1.1
  }

  return Math.min(score, 1.0)
}

/**
 * Build expanded query with entity terms
 */
function buildExpandedQuery(originalQuery: string, expansionTerms: string[]): string {
  if (expansionTerms.length === 0) {
    return originalQuery
  }

  // Sort expansion terms by length (longer terms first for better matching)
  const sortedTerms = expansionTerms
    .filter(term => term.length > 2) // Filter out very short terms
    .sort((a, b) => b.length - a.length)
    .slice(0, 5) // Limit to prevent query explosion

  return `${originalQuery} ${sortedTerms.join(' ')}`
}

/**
 * Build entity context description
 */
function buildEntityContext(
  recognizedEntities: KGEnhancedContext['recognizedEntities'],
  relatedEntities: KGEnhancedContext['relatedEntities']
): string {
  if (recognizedEntities.length === 0) {
    return ''
  }

  let context = `Query mentions: ${recognizedEntities.map(e => e.entity.canonical_name).join(', ')}.`

  const highRelevanceRelated = relatedEntities
    .filter(r => r.relevanceScore > 0.7)
    .slice(0, 3)

  if (highRelevanceRelated.length > 0) {
    const relationDescriptions = highRelevanceRelated.map(r => 
      `${r.entity.canonical_name} (${r.relation.relation})`
    ).join(', ')
    
    context += ` Related entities: ${relationDescriptions}.`
  }

  return context
}

/**
 * Perform KG-enhanced retrieval by combining entity expansion with hybrid search
 */
export async function performKGEnhancedRetrieval(
  query: string,
  userId: string,
  options: {
    maxChunks?: number
    kgOptions?: KGExpansionOptions
    hybridSearchOptions?: Record<string, unknown>
  } = {}
): Promise<{
  kgContext: KGEnhancedContext
  searchResults: { results: any[], queryType?: string }
  combinedScore: number
  enhancedQuery: string
}> {
  const { maxChunks = 8, kgOptions = {}, hybridSearchOptions = {} } = options

  console.log(`Performing KG-enhanced retrieval for: "${query}"`)

  try {
    // Step 1: Expand query using knowledge graph
    const kgContext = await expandQueryWithKG(query, userId, kgOptions)

    // Step 2: Use expanded query for hybrid search
    const enhancedQuery = kgContext.expandedQuery
    const searchResults = await hybridSearch(enhancedQuery, userId, {
      maxResults: maxChunks,
      vectorWeight: 0.6, // Slightly lower vector weight to balance with entity expansion
      bm25Weight: 0.4,   // Higher BM25 weight for term matching
      ...hybridSearchOptions
    })

    // Step 3: Calculate combined score based on KG relevance + search quality
    const combinedScore = calculateCombinedRelevanceScore(kgContext, searchResults)

    console.log(`KG-enhanced retrieval complete: ${searchResults.results.length} results, combined score: ${combinedScore.toFixed(2)}`)

    return {
      kgContext,
      searchResults,
      combinedScore,
      enhancedQuery
    }

  } catch (error) {
    console.error('KG-enhanced retrieval failed:', error)
    
    // Fallback to regular hybrid search
    const fallbackResults = await hybridSearch(query, userId, {
      maxResults: maxChunks,
      ...hybridSearchOptions
    })

    return {
      kgContext: {
        recognizedEntities: [],
        relatedEntities: [],
        expandedQuery: query,
        expansionTerms: [],
        entityContext: '',
        graphTraversalPaths: []
      },
      searchResults: fallbackResults,
      combinedScore: 0.5,
      enhancedQuery: query
    }
  }
}

/**
 * Calculate combined relevance score
 */
function calculateCombinedRelevanceScore(
  kgContext: KGEnhancedContext,
  searchResults: { results: any[] }
): number {
  // Base score from search quality
  const avgSearchScore = searchResults.results.length > 0
    ? searchResults.results.reduce((sum: number, r: any) => sum + r.similarity, 0) / searchResults.results.length
    : 0

  // KG enhancement bonus
  const entityBonus = kgContext.recognizedEntities.length * 0.1
  const relationBonus = kgContext.relatedEntities.filter(r => r.relevanceScore > 0.7).length * 0.05
  const expansionBonus = Math.min(kgContext.expansionTerms.length * 0.02, 0.2)

  return Math.min(avgSearchScore + entityBonus + relationBonus + expansionBonus, 1.0)
}