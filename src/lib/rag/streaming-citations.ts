// Streaming Citations System
// Phase 8: Real-time citation injection during streaming responses

import type { Citation, CitationGroup } from './citations'

export interface StreamingCitationOptions {
  enableInlineCitations?: boolean
  citationStyle?: 'numbered' | 'superscript' | 'bracketed'
  citationTriggers?: 'sentence_end' | 'key_phrases' | 'semantic_match'
  maxCitationsPerResponse?: number
  includeFinalCitationList?: boolean
  citationValidation?: boolean
}

export interface StreamingCitationContext {
  citations: Citation[]
  citationGroups: CitationGroup[]
  usedCitations: Set<number>
  streamedContent: string
  pendingCitations: Map<string, number[]>
  citationQueue: Array<{
    position: number
    citationNumbers: number[]
    insertAfter: string
  }>
}

export interface CitationStreamChunk {
  type: 'content' | 'citation' | 'citation_list' | 'metadata'
  content: string
  citations?: number[]
  metadata?: {
    totalSources: number
    citationsUsed: number
    streamingComplete: boolean
  }
}

const DEFAULT_STREAMING_OPTIONS: Required<StreamingCitationOptions> = {
  enableInlineCitations: true,
  citationStyle: 'numbered',
  citationTriggers: 'sentence_end',
  maxCitationsPerResponse: 8,
  includeFinalCitationList: true,
  citationValidation: true
}

/**
 * Initialize streaming citation context
 */
export function initializeStreamingCitations(
  citations: Citation[],
  citationGroups: CitationGroup[],
  options: StreamingCitationOptions = {}
): StreamingCitationContext {
  const config = { ...DEFAULT_STREAMING_OPTIONS, ...options }
  
  return {
    citations: citations.slice(0, config.maxCitationsPerResponse),
    citationGroups: citationGroups.slice(0, config.maxCitationsPerResponse),
    usedCitations: new Set(),
    streamedContent: '',
    pendingCitations: new Map(),
    citationQueue: []
  }
}

/**
 * Process streaming content chunk and inject citations
 */
export function processStreamingChunk(
  contentChunk: string,
  context: StreamingCitationContext,
  options: StreamingCitationOptions = {}
): CitationStreamChunk[] {
  const config = { ...DEFAULT_STREAMING_OPTIONS, ...options }
  const results: CitationStreamChunk[] = []
  
  if (!config.enableInlineCitations) {
    return [{
      type: 'content',
      content: contentChunk
    }]
  }

  // Update streamed content
  context.streamedContent += contentChunk
  
  // Find citation opportunities in this chunk
  const citationOpportunities = findCitationOpportunities(
    contentChunk,
    context,
    config.citationTriggers
  )
  
  let processedContent = contentChunk
  let insertOffset = 0
  
  // Process each citation opportunity
  for (const opportunity of citationOpportunities) {
    const relevantCitations = findRelevantCitations(
      opportunity.phrase,
      opportunity.context,
      context.citations
    )
    
    if (relevantCitations.length > 0) {
      const citationNumbers = relevantCitations
        .slice(0, 3) // Max 3 citations per opportunity
        .map(c => c.citationNumber)
      
      // Mark citations as used
      citationNumbers.forEach(num => context.usedCitations.add(num))
      
      // Generate citation marker
      const citationMarker = formatCitationMarker(citationNumbers, config.citationStyle)
      
      // Insert citation marker
      const insertPosition = opportunity.insertPosition + insertOffset
      processedContent = processedContent.slice(0, insertPosition) + 
                       citationMarker + 
                       processedContent.slice(insertPosition)
      insertOffset += citationMarker.length
      
      // Add citation chunk
      results.push({
        type: 'content',
        content: processedContent.slice(0, insertPosition)
      })
      
      results.push({
        type: 'citation',
        content: citationMarker,
        citations: citationNumbers
      })
      
      // Update processed content
      processedContent = processedContent.slice(insertPosition + citationMarker.length)
      insertOffset = 0
    }
  }
  
  // Add remaining content
  if (processedContent.length > 0) {
    results.push({
      type: 'content',
      content: processedContent
    })
  }
  
  return results.length > 0 ? results : [{
    type: 'content',
    content: contentChunk
  }]
}

/**
 * Find opportunities to insert citations in content
 */
function findCitationOpportunities(
  content: string,
  context: StreamingCitationContext,
  trigger: 'sentence_end' | 'key_phrases' | 'semantic_match'
): Array<{
  phrase: string
  context: string
  insertPosition: number
  confidence: number
}> {
  const opportunities = []
  
  switch (trigger) {
    case 'sentence_end':
      // Find sentence endings
      const sentenceEndings = /[.!?]+/g
      let match
      while ((match = sentenceEndings.exec(content)) !== null) {
        const sentenceStart = Math.max(0, match.index - 100)
        const sentence = content.slice(sentenceStart, match.index + match[0].length)
        
        opportunities.push({
          phrase: sentence.trim(),
          context: sentence,
          insertPosition: match.index + match[0].length,
          confidence: 0.8
        })
      }
      break
      
    case 'key_phrases':
      // Look for key phrases that often indicate citable content
      const keyPhrases = [
        /according to/gi,
        /research shows/gi,
        /studies indicate/gi,
        /data suggests/gi,
        /analysis reveals/gi,
        /findings show/gi,
        /reports indicate/gi,
        /evidence suggests/gi
      ]
      
      for (const phrase of keyPhrases) {
        let match
        while ((match = phrase.exec(content)) !== null) {
          const contextStart = Math.max(0, match.index - 50)
          const contextEnd = Math.min(content.length, match.index + 100)
          const phraseContext = content.slice(contextStart, contextEnd)
          
          opportunities.push({
            phrase: match[0],
            context: phraseContext,
            insertPosition: match.index + match[0].length,
            confidence: 0.9
          })
        }
      }
      break
      
    case 'semantic_match':
      // Simple semantic matching based on keyword overlap
      const words = content.toLowerCase().split(/\s+/)
      const uniqueWords = [...new Set(words)].filter(w => w.length > 3)
      
      for (let i = 0; i < uniqueWords.length; i++) {
        const word = uniqueWords[i]
        const wordIndex = content.toLowerCase().indexOf(word)
        
        if (wordIndex !== -1) {
          const contextStart = Math.max(0, wordIndex - 50)
          const contextEnd = Math.min(content.length, wordIndex + 50)
          const wordContext = content.slice(contextStart, contextEnd)
          
          opportunities.push({
            phrase: word,
            context: wordContext,
            insertPosition: wordIndex + word.length,
            confidence: 0.6
          })
        }
      }
      break
  }
  
  return opportunities
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5) // Limit opportunities per chunk
}

/**
 * Find citations relevant to a given phrase/context
 */
function findRelevantCitations(
  phrase: string,
  context: string,
  citations: Citation[]
): Citation[] {
  const relevant = []
  const lowerPhrase = phrase.toLowerCase()
  const lowerContext = context.toLowerCase()
  
  for (const citation of citations) {
    let relevanceScore = 0
    const snippet = citation.contentSnippet.toLowerCase()
    const title = citation.sourceTitle.toLowerCase()
    
    // Check for word overlap between context and citation
    const contextWords = new Set(lowerContext.split(/\s+/).filter(w => w.length > 3))
    const snippetWords = new Set(snippet.split(/\s+/).filter(w => w.length > 3))
    const titleWords = new Set(title.split(/\s+/).filter(w => w.length > 3))
    
    // Calculate overlap scores
    const snippetOverlap = [...contextWords].filter(w => snippetWords.has(w)).length
    const titleOverlap = [...contextWords].filter(w => titleWords.has(w)).length
    
    relevanceScore = (snippetOverlap * 2 + titleOverlap) / Math.max(contextWords.size, 1)
    
    // Boost for exact phrase matches
    if (snippet.includes(lowerPhrase) || lowerPhrase.includes(snippet.slice(0, 20))) {
      relevanceScore += 0.3
    }
    
    // Boost based on citation's original relevance
    relevanceScore += citation.relevanceScore * 0.2
    
    if (relevanceScore > 0.1) {
      relevant.push({
        ...citation,
        relevanceScore
      })
    }
  }
  
  return relevant
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3) // Max 3 citations per phrase
}

/**
 * Format citation marker based on style
 */
function formatCitationMarker(
  citationNumbers: number[],
  style: 'numbered' | 'superscript' | 'bracketed'
): string {
  const numbers = citationNumbers.sort((a, b) => a - b)
  
  switch (style) {
    case 'numbered':
      return ` [${numbers.join(', ')}]`
    case 'superscript':
      return numbers.map(n => `^${n}`).join('')
    case 'bracketed':
      return ` (${numbers.join(', ')})`
    default:
      return ` [${numbers.join(', ')}]`
  }
}

/**
 * Generate final citation list for end of response
 */
export function generateStreamingCitationList(
  context: StreamingCitationContext,
  options: StreamingCitationOptions = {}
): CitationStreamChunk | null {
  const config = { ...DEFAULT_STREAMING_OPTIONS, ...options }
  
  if (!config.includeFinalCitationList || context.usedCitations.size === 0) {
    return null
  }
  
  const usedCitationGroups = context.citationGroups.filter(group =>
    context.usedCitations.has(group.citationNumber)
  )
  
  if (usedCitationGroups.length === 0) {
    return null
  }
  
  // Sort by citation number
  usedCitationGroups.sort((a, b) => a.citationNumber - b.citationNumber)
  
  const citationList = usedCitationGroups.map(group => {
    const dateStr = group.datePublished ? ` (${group.datePublished})` : ''
    return `[${group.citationNumber}] ${group.sourceTitle}${dateStr}`
  }).join('\n')
  
  return {
    type: 'citation_list',
    content: `\n\n**Sources:**\n${citationList}`,
    citations: Array.from(context.usedCitations).sort((a, b) => a - b),
    metadata: {
      totalSources: context.citationGroups.length,
      citationsUsed: context.usedCitations.size,
      streamingComplete: true
    }
  }
}

/**
 * Validate streaming citations for accuracy
 */
export function validateStreamingCitations(
  context: StreamingCitationContext,
  finalContent: string
): {
  isValid: boolean
  issues: string[]
  citationCoverage: number
  duplicateReferences: number
} {
  const issues: string[] = []
  let duplicateReferences = 0
  
  // Check for duplicate citation numbers
  const citationMatches = finalContent.match(/\[(\d+(?:,\s*\d+)*)\]/g) || []
  const allCitationNumbers = []
  
  for (const match of citationMatches) {
    const numbers = match.slice(1, -1).split(',').map(n => parseInt(n.trim()))
    allCitationNumbers.push(...numbers)
  }
  
  const uniqueCitations = new Set(allCitationNumbers)
  duplicateReferences = allCitationNumbers.length - uniqueCitations.size
  
  // Check for orphaned citations (cited but not in citation list)
  for (const citNum of uniqueCitations) {
    const citationExists = context.citationGroups.some(g => g.citationNumber === citNum)
    if (!citationExists) {
      issues.push(`Citation [${citNum}] referenced but not found in citation list`)
    }
  }
  
  // Check for unused citations (in list but not referenced)
  const referencedCitations = new Set(allCitationNumbers)
  const unusedCitations = context.citationGroups.filter(g => 
    !referencedCitations.has(g.citationNumber)
  )
  
  if (unusedCitations.length > 0) {
    issues.push(`${unusedCitations.length} citations in list but not referenced in text`)
  }
  
  // Calculate citation coverage (how much of the content has citations)
  const sentences = finalContent.split(/[.!?]+/).length
  const citedSentences = citationMatches.length
  const citationCoverage = sentences > 0 ? citedSentences / sentences : 0
  
  // Check for over-citation
  if (citationCoverage > 0.5) {
    issues.push('Response may be over-cited (>50% of sentences have citations)')
  } else if (citationCoverage < 0.1 && context.citations.length > 0) {
    issues.push('Response may be under-cited (<10% of sentences have citations)')
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    citationCoverage,
    duplicateReferences
  }
}

/**
 * Extract citation metadata for response tracking
 */
export function extractCitationMetadata(
  context: StreamingCitationContext
): {
  totalSourcesAvailable: number
  sourcesUsed: number
  citationDensity: number
  sourceTypes: Record<string, number>
  dateRange?: { earliest: string, latest: string }
  averageRelevance: number
} {
  const usedGroups = context.citationGroups.filter(g => 
    context.usedCitations.has(g.citationNumber)
  )
  
  const dates = usedGroups
    .map(g => g.datePublished)
    .filter(Boolean) as string[]
  
  const dateRange = dates.length > 0 ? {
    earliest: dates.reduce((earliest, date) => date < earliest ? date : earliest),
    latest: dates.reduce((latest, date) => date > latest ? date : latest)
  } : undefined
  
  const sourceTypes: Record<string, number> = {}
  let totalRelevance = 0
  
  for (const group of usedGroups) {
    // Infer source type from title
    const title = group.sourceTitle.toLowerCase()
    let sourceType = 'document'
    
    if (title.includes('blog') || title.includes('post')) {
      sourceType = 'blog'
    } else if (title.includes('paper') || title.includes('journal')) {
      sourceType = 'academic'
    } else if (title.includes('news') || title.includes('article')) {
      sourceType = 'news'
    } else if (title.includes('documentation') || title.includes('guide')) {
      sourceType = 'documentation'
    }
    
    sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1
    totalRelevance += group.combinedRelevance
  }
  
  return {
    totalSourcesAvailable: context.citationGroups.length,
    sourcesUsed: usedGroups.length,
    citationDensity: context.streamedContent.length > 0 ? 
      context.usedCitations.size / (context.streamedContent.length / 1000) : 0,
    sourceTypes,
    dateRange,
    averageRelevance: usedGroups.length > 0 ? totalRelevance / usedGroups.length : 0
  }
}