// Citations & Metadata System
// Phase 8: Source attribution, streaming citations, and document date handling

import type { RAGChunk, RAGDocument } from './types'

export interface Citation {
  id: string
  sourceTitle: string
  sourceUrl?: string
  documentId: string
  chunkIndex: number
  chunkId: number
  relevanceScore: number
  datePublished?: string
  dateAccessed?: string
  contentSnippet: string
  citationNumber: number
}

export interface CitationGroup {
  sourceTitle: string
  documentId: string
  datePublished?: string
  chunks: Array<{
    chunkId: number
    chunkIndex: number
    contentSnippet: string
    relevanceScore: number
  }>
  citationNumber: number
  combinedRelevance: number
}

export interface CitedRAGContext {
  chunks: Array<{
    content: string
    citation: Citation
    similarity: number
    bm25Score?: number
    rrfScore?: number
    finalScore?: number
    metadata?: Record<string, unknown>
  }>
  citationGroups: CitationGroup[]
  citationMap: Map<string, Citation>
  totalSources: number
  dateRange?: {
    earliest: string
    latest: string
  }
  conflictingDates?: Array<{
    sourceTitle: string
    dates: string[]
    resolution: 'newest' | 'most_common' | 'user_specified'
  }>
}

export interface CitationOptions {
  maxSources?: number
  dedupeBySources?: boolean
  preferNewerSources?: boolean
  includeDateRange?: boolean
  includeContentSnippets?: boolean
  snippetLength?: number
  citationFormat?: 'numbered' | 'author-date' | 'footnotes'
  groupBySource?: boolean
}

const DEFAULT_CITATION_OPTIONS: Required<CitationOptions> = {
  maxSources: 8,
  dedupeBySources: true,
  preferNewerSources: true,
  includeDateRange: true,
  includeContentSnippets: true,
  snippetLength: 150,
  citationFormat: 'numbered',
  groupBySource: true
}

/**
 * Build citations from RAG chunks with source deduplication
 */
export function buildCitations(
  chunks: Array<{
    content: string
    source?: string
    similarity: number
    bm25Score?: number
    rrfScore?: number
    finalScore?: number
    date?: string
    metadata?: Record<string, unknown>
    chunk?: RAGChunk
  }>,
  options: CitationOptions = {}
): CitedRAGContext {
  const config = { ...DEFAULT_CITATION_OPTIONS, ...options }
  
  console.log(`Building citations for ${chunks.length} chunks with source deduplication`)

  // Group chunks by source document to avoid multiple citations from same document
  const sourceGroups = new Map<string, Array<typeof chunks[0]>>()
  const documentMetadata = new Map<string, { title: string, date?: string, url?: string }>()
  
  for (const chunk of chunks) {
    const docId = chunk.chunk?.doc_id || chunk.metadata?.doc_id as string || 'unknown'
    const sourceTitle = chunk.source || chunk.metadata?.title as string || `Document ${docId}`
    
    if (!sourceGroups.has(docId)) {
      sourceGroups.set(docId, [])
      documentMetadata.set(docId, {
        title: sourceTitle,
        date: chunk.date || chunk.metadata?.date as string,
        url: chunk.metadata?.url as string
      })
    }
    
    sourceGroups.get(docId)!.push(chunk)
  }

  console.log(`Grouped chunks into ${sourceGroups.size} unique sources`)

  // Process each source group and select best representative chunk(s)
  const citationGroups: CitationGroup[] = []
  const citations: Citation[] = []
  const citationMap = new Map<string, Citation>()
  const allDates: string[] = []
  
  let citationNumber = 1

  for (const [docId, docChunks] of sourceGroups.entries()) {
    const metadata = documentMetadata.get(docId)!
    
    // Sort chunks by relevance (final score > similarity > bm25)
    const sortedChunks = docChunks.sort((a, b) => {
      const scoreA = a.finalScore || a.similarity || a.bm25Score || 0
      const scoreB = b.finalScore || b.similarity || b.bm25Score || 0
      return scoreB - scoreA
    })

    // For source deduplication, take only the best chunk(s) from each source
    const selectedChunks = config.groupBySource 
      ? [sortedChunks[0]] // Single best chunk per source
      : sortedChunks.slice(0, Math.min(3, sortedChunks.length)) // Up to 3 chunks per source

    // Calculate combined relevance for the source
    const combinedRelevance = selectedChunks.reduce((sum, chunk) => {
      const score = chunk.finalScore || chunk.similarity || chunk.bm25Score || 0
      return sum + score
    }, 0) / selectedChunks.length

    // Create citation group
    const citationGroup: CitationGroup = {
      sourceTitle: metadata.title,
      documentId: docId,
      datePublished: metadata.date,
      chunks: selectedChunks.map(chunk => ({
        chunkId: chunk.chunk?.id || 0,
        chunkIndex: chunk.chunk?.chunk_index || 0,
        contentSnippet: extractSnippet(chunk.content, config.snippetLength),
        relevanceScore: chunk.finalScore || chunk.similarity || 0
      })),
      citationNumber,
      combinedRelevance
    }

    citationGroups.push(citationGroup)

    // Create individual citations for each chunk in the group
    for (const chunk of selectedChunks) {
      const citation: Citation = {
        id: `cite-${docId}-${chunk.chunk?.id || citationNumber}`,
        sourceTitle: metadata.title,
        sourceUrl: metadata.url,
        documentId: docId,
        chunkIndex: chunk.chunk?.chunk_index || 0,
        chunkId: chunk.chunk?.id || 0,
        relevanceScore: chunk.finalScore || chunk.similarity || 0,
        datePublished: metadata.date,
        dateAccessed: new Date().toISOString().split('T')[0],
        contentSnippet: extractSnippet(chunk.content, config.snippetLength),
        citationNumber
      }

      citations.push(citation)
      citationMap.set(citation.id, citation)
      
      if (citation.datePublished) {
        allDates.push(citation.datePublished)
      }
    }

    citationNumber++
    
    // Respect max sources limit
    if (citationGroups.length >= config.maxSources) {
      break
    }
  }

  // Sort citation groups by relevance if preferring newer sources
  if (config.preferNewerSources) {
    citationGroups.sort((a, b) => {
      // First sort by date (newer first), then by relevance
      if (a.datePublished && b.datePublished) {
        const dateComparison = new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
        if (Math.abs(dateComparison) > 86400000) { // More than 1 day difference
          return dateComparison
        }
      }
      return b.combinedRelevance - a.combinedRelevance
    })
    
    // Reassign citation numbers after sorting
    citationGroups.forEach((group, index) => {
      group.citationNumber = index + 1
      group.chunks.forEach(chunk => {
        const citation = citations.find(c => c.chunkId === chunk.chunkId)
        if (citation) {
          citation.citationNumber = index + 1
        }
      })
    })
  }

  // Build cited chunks array
  const citedChunks = []
  for (const group of citationGroups) {
    for (const groupChunk of group.chunks) {
      const citation = citations.find(c => c.chunkId === groupChunk.chunkId)!
      const originalChunk = chunks.find(c => c.chunk?.id === groupChunk.chunkId)!
      
      citedChunks.push({
        content: originalChunk.content,
        citation,
        similarity: originalChunk.similarity,
        bm25Score: originalChunk.bm25Score,
        rrfScore: originalChunk.rrfScore,
        finalScore: originalChunk.finalScore,
        metadata: originalChunk.metadata
      })
    }
  }

  // Calculate date range
  const dateRange = config.includeDateRange && allDates.length > 0 ? {
    earliest: allDates.reduce((earliest, date) => date < earliest ? date : earliest),
    latest: allDates.reduce((latest, date) => date > latest ? date : latest)
  } : undefined

  // Detect conflicting dates (same source with different dates)
  const conflictingDates = detectDateConflicts(citationGroups)

  console.log(`Citations built: ${citationGroups.length} sources, ${citations.length} total chunks`)

  return {
    chunks: citedChunks,
    citationGroups,
    citationMap,
    totalSources: citationGroups.length,
    dateRange,
    conflictingDates: conflictingDates.length > 0 ? conflictingDates : undefined
  }
}

/**
 * Extract content snippet for citation
 */
function extractSnippet(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content.trim()
  }
  
  // Try to break at sentence boundary
  const truncated = content.substring(0, maxLength)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  )
  
  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1).trim()
  }
  
  // Break at word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace).trim() + '...'
  }
  
  return truncated.trim() + '...'
}

/**
 * Detect conflicting dates for the same source
 */
function detectDateConflicts(citationGroups: CitationGroup[]): Array<{
  sourceTitle: string
  dates: string[]
  resolution: 'newest' | 'most_common' | 'user_specified'
}> {
  const sourceToDate = new Map<string, string[]>()
  
  for (const group of citationGroups) {
    if (group.datePublished) {
      const dates = sourceToDate.get(group.sourceTitle) || []
      if (!dates.includes(group.datePublished)) {
        dates.push(group.datePublished)
      }
      sourceToDate.set(group.sourceTitle, dates)
    }
  }
  
  const conflicts = []
  for (const [sourceTitle, dates] of sourceToDate.entries()) {
    if (dates.length > 1) {
      conflicts.push({
        sourceTitle,
        dates: dates.sort(),
        resolution: 'newest' as const // Default to newest date
      })
    }
  }
  
  return conflicts
}

/**
 * Format citations for different citation styles
 */
export function formatCitations(
  citationGroups: CitationGroup[],
  format: 'numbered' | 'author-date' | 'footnotes' = 'numbered'
): string {
  if (citationGroups.length === 0) {
    return ''
  }

  switch (format) {
    case 'numbered':
      return formatNumberedCitations(citationGroups)
    case 'author-date':
      return formatAuthorDateCitations(citationGroups)
    case 'footnotes':
      return formatFootnoteCitations(citationGroups)
    default:
      return formatNumberedCitations(citationGroups)
  }
}

function formatNumberedCitations(citationGroups: CitationGroup[]): string {
  const citations = citationGroups.map(group => {
    const dateStr = group.datePublished ? ` (${group.datePublished})` : ''
    return `[${group.citationNumber}] ${group.sourceTitle}${dateStr}`
  })
  
  return `\n\n**Sources:**\n${citations.join('\n')}`
}

function formatAuthorDateCitations(citationGroups: CitationGroup[]): string {
  const citations = citationGroups.map(group => {
    const dateStr = group.datePublished || 'n.d.'
    return `${group.sourceTitle} (${dateStr})`
  })
  
  return `\n\n**References:**\n${citations.join(', ')}`
}

function formatFootnoteCitations(citationGroups: CitationGroup[]): string {
  const citations = citationGroups.map(group => {
    const dateStr = group.datePublished ? `, ${group.datePublished}` : ''
    return `${group.citationNumber}. ${group.sourceTitle}${dateStr}`
  })
  
  return `\n\n**Footnotes:**\n${citations.join('\n')}`
}

/**
 * Generate inline citation markers for streaming responses
 */
export function generateInlineCitations(
  content: string,
  citations: Citation[]
): string {
  // Simple approach: add citations at the end of sentences that likely reference the sources
  // This is a basic implementation - more sophisticated approaches would use NLP to determine
  // which sentences reference which sources
  
  let citedContent = content
  
  // Add citation numbers after relevant sentences
  citations.forEach(citation => {
    const snippet = citation.contentSnippet.replace(/\.\.\.$/, '')
    const words = snippet.split(' ').slice(0, 3) // First 3 words as potential matches
    
    for (const word of words) {
      if (word.length > 3 && citedContent.toLowerCase().includes(word.toLowerCase())) {
        const regex = new RegExp(`(${escapeRegExp(word)}[^.!?]*[.!?])`, 'gi')
        citedContent = citedContent.replace(regex, `$1 [${citation.citationNumber}]`)
        break // Only cite once per citation
      }
    }
  })
  
  return citedContent
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Validate citations for completeness and accuracy
 */
export function validateCitations(citations: Citation[]): {
  isValid: boolean
  issues: string[]
  completeness: number
} {
  const issues: string[] = []
  let validCitations = 0

  for (const citation of citations) {
    let citationIssues = 0

    if (!citation.sourceTitle || citation.sourceTitle.trim().length === 0) {
      issues.push(`Citation ${citation.citationNumber}: Missing source title`)
      citationIssues++
    }

    if (!citation.contentSnippet || citation.contentSnippet.trim().length === 0) {
      issues.push(`Citation ${citation.citationNumber}: Missing content snippet`)
      citationIssues++
    }

    if (!citation.dateAccessed) {
      issues.push(`Citation ${citation.citationNumber}: Missing access date`)
      citationIssues++
    }

    if (citation.relevanceScore < 0.1) {
      issues.push(`Citation ${citation.citationNumber}: Very low relevance score (${citation.relevanceScore.toFixed(3)})`)
      citationIssues++
    }

    if (citationIssues === 0) {
      validCitations++
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    completeness: citations.length > 0 ? validCitations / citations.length : 0
  }
}