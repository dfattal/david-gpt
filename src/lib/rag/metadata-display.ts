// Metadata Display System
// Phase 8: Display system for dates, sources, and citation metadata

import type { CitedRAGContext, Citation, CitationGroup } from './citations'
import type { RAGContext } from './context'

export interface MetadataDisplayOptions {
  showDates?: boolean
  showSources?: boolean
  showRelevanceScores?: boolean
  showCitationCounts?: boolean
  showDateConflicts?: boolean
  formatStyle?: 'compact' | 'detailed' | 'json'
  maxSourcesShown?: number
  includeSnippets?: boolean
  snippetLength?: number
}

export interface SourceMetadata {
  sourceId: string
  title: string
  url?: string
  datePublished?: string
  dateAccessed?: string
  chunkCount: number
  averageRelevance: number
  citationNumber: number
  hasDateConflicts: boolean
  contentPreview?: string
}

export interface DisplayMetadata {
  totalSources: number
  totalChunks: number
  dateRange?: {
    earliest: string
    latest: string
  }
  averageRelevance: number
  sourceBreakdown: SourceMetadata[]
  dateConflicts: Array<{
    sourceTitle: string
    conflictingDates: string[]
    resolution: string
  }>
  queryContext: {
    queryType: string
    retrievalMethod: string
    performanceStats?: {
      totalTime: number
      searchTime: number
      citationBuildTime: number
    }
  }
}

const DEFAULT_DISPLAY_OPTIONS: Required<MetadataDisplayOptions> = {
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

/**
 * Build comprehensive metadata for display from RAG context
 */
export function buildDisplayMetadata(
  ragContext: RAGContext,
  options: MetadataDisplayOptions = {}
): DisplayMetadata {
  const config = { ...DEFAULT_DISPLAY_OPTIONS, ...options }
  
  if (!ragContext.citedContext) {
    // Fallback for legacy context without citations
    return buildLegacyDisplayMetadata(ragContext, config)
  }

  const citedContext = ragContext.citedContext
  
  // Build source metadata from citation groups
  const sourceBreakdown: SourceMetadata[] = citedContext.citationGroups.map(group => ({
    sourceId: group.documentId,
    title: group.sourceTitle,
    url: undefined, // Citations don't currently store URLs
    datePublished: group.datePublished,
    dateAccessed: new Date().toISOString().split('T')[0],
    chunkCount: group.chunks.length,
    averageRelevance: group.combinedRelevance,
    citationNumber: group.citationNumber,
    hasDateConflicts: citedContext.conflictingDates?.some(c => c.sourceTitle === group.sourceTitle) || false,
    contentPreview: config.includeSnippets 
      ? group.chunks[0]?.contentSnippet.substring(0, config.snippetLength) + '...'
      : undefined
  })).slice(0, config.maxSourcesShown)

  // Build date conflicts information
  const dateConflicts = citedContext.conflictingDates?.map(conflict => ({
    sourceTitle: conflict.sourceTitle,
    conflictingDates: conflict.dates,
    resolution: `Used ${conflict.resolution} strategy`
  })) || []

  // Calculate overall statistics
  const totalRelevance = sourceBreakdown.reduce((sum, source) => sum + source.averageRelevance, 0)
  const averageRelevance = sourceBreakdown.length > 0 ? totalRelevance / sourceBreakdown.length : 0

  return {
    totalSources: citedContext.totalSources,
    totalChunks: citedContext.chunks.length,
    dateRange: citedContext.dateRange,
    averageRelevance,
    sourceBreakdown,
    dateConflicts,
    queryContext: {
      queryType: ragContext.stats.queryType,
      retrievalMethod: getRetrievalMethodName(ragContext),
      performanceStats: {
        totalTime: ragContext.stats.retrievalTimeMs,
        searchTime: ragContext.stats.retrievalTimeMs, // Simplified for now
        citationBuildTime: 0 // Would need to be tracked separately
      }
    }
  }
}

/**
 * Build legacy display metadata for contexts without citations
 */
function buildLegacyDisplayMetadata(
  ragContext: RAGContext,
  config: Required<MetadataDisplayOptions>
): DisplayMetadata {
  const sourceBreakdown: SourceMetadata[] = ragContext.chunks.map((chunk, index) => ({
    sourceId: `chunk-${index}`,
    title: chunk.source,
    url: undefined,
    datePublished: chunk.date,
    dateAccessed: new Date().toISOString().split('T')[0],
    chunkCount: 1,
    averageRelevance: chunk.similarity,
    citationNumber: index + 1,
    hasDateConflicts: false,
    contentPreview: config.includeSnippets 
      ? chunk.content.substring(0, config.snippetLength) + '...'
      : undefined
  })).slice(0, config.maxSourcesShown)

  const dates = ragContext.chunks.map(c => c.date).filter(Boolean) as string[]
  const dateRange = dates.length > 0 ? {
    earliest: dates.reduce((earliest, date) => date < earliest ? date : earliest),
    latest: dates.reduce((latest, date) => date > latest ? date : latest)
  } : undefined

  return {
    totalSources: ragContext.stats.sources.length,
    totalChunks: ragContext.chunks.length,
    dateRange,
    averageRelevance: ragContext.stats.averageSimilarity,
    sourceBreakdown,
    dateConflicts: [],
    queryContext: {
      queryType: ragContext.stats.queryType,
      retrievalMethod: getRetrievalMethodName(ragContext),
      performanceStats: {
        totalTime: ragContext.stats.retrievalTimeMs,
        searchTime: ragContext.stats.retrievalTimeMs,
        citationBuildTime: 0
      }
    }
  }
}

/**
 * Format display metadata for different output styles
 */
export function formatDisplayMetadata(
  metadata: DisplayMetadata,
  options: MetadataDisplayOptions = {}
): string {
  const config = { ...DEFAULT_DISPLAY_OPTIONS, ...options }
  
  switch (config.formatStyle) {
    case 'json':
      return JSON.stringify(metadata, null, 2)
    case 'detailed':
      return formatDetailedMetadata(metadata, config)
    case 'compact':
    default:
      return formatCompactMetadata(metadata, config)
  }
}

/**
 * Format compact metadata display
 */
function formatCompactMetadata(
  metadata: DisplayMetadata,
  config: Required<MetadataDisplayOptions>
): string {
  const lines: string[] = []

  // Header
  lines.push(`## Response Metadata`)
  lines.push(`**Sources**: ${metadata.totalSources} | **Chunks**: ${metadata.totalChunks} | **Method**: ${metadata.queryContext.retrievalMethod}`)
  
  if (config.showDates && metadata.dateRange) {
    lines.push(`**Date Range**: ${metadata.dateRange.earliest} to ${metadata.dateRange.latest}`)
  }

  if (config.showRelevanceScores) {
    lines.push(`**Average Relevance**: ${(metadata.averageRelevance * 100).toFixed(1)}%`)
  }

  // Performance info
  if (metadata.queryContext.performanceStats) {
    lines.push(`**Retrieval Time**: ${metadata.queryContext.performanceStats.totalTime.toFixed(0)}ms`)
  }

  // Sources
  if (config.showSources && metadata.sourceBreakdown.length > 0) {
    lines.push('')
    lines.push('**Sources Used**:')
    
    metadata.sourceBreakdown.forEach(source => {
      const dateInfo = config.showDates && source.datePublished ? ` (${source.datePublished})` : ''
      const chunkInfo = config.showCitationCounts ? ` [${source.chunkCount} chunk${source.chunkCount > 1 ? 's' : ''}]` : ''
      const conflictWarning = source.hasDateConflicts ? ' ⚠️' : ''
      
      lines.push(`[${source.citationNumber}] ${source.title}${dateInfo}${chunkInfo}${conflictWarning}`)
    })
  }

  // Date conflicts
  if (config.showDateConflicts && metadata.dateConflicts.length > 0) {
    lines.push('')
    lines.push('**Date Conflicts Resolved**:')
    metadata.dateConflicts.forEach(conflict => {
      lines.push(`• ${conflict.sourceTitle}: ${conflict.conflictingDates.join(', ')} → ${conflict.resolution}`)
    })
  }

  return lines.join('\n')
}

/**
 * Format detailed metadata display
 */
function formatDetailedMetadata(
  metadata: DisplayMetadata,
  config: Required<MetadataDisplayOptions>
): string {
  const lines: string[] = []

  // Detailed header
  lines.push(`## Detailed Response Metadata`)
  lines.push('')
  lines.push(`**Query Context**:`)
  lines.push(`- Query Type: ${metadata.queryContext.queryType}`)
  lines.push(`- Retrieval Method: ${metadata.queryContext.retrievalMethod}`)
  lines.push(`- Total Sources: ${metadata.totalSources}`)
  lines.push(`- Total Chunks: ${metadata.totalChunks}`)
  
  if (config.showRelevanceScores) {
    lines.push(`- Average Relevance: ${(metadata.averageRelevance * 100).toFixed(2)}%`)
  }

  // Performance breakdown
  if (metadata.queryContext.performanceStats) {
    const perf = metadata.queryContext.performanceStats
    lines.push('')
    lines.push(`**Performance**:`)
    lines.push(`- Total Time: ${perf.totalTime.toFixed(2)}ms`)
    lines.push(`- Search Time: ${perf.searchTime.toFixed(2)}ms`)
    if (perf.citationBuildTime > 0) {
      lines.push(`- Citation Build Time: ${perf.citationBuildTime.toFixed(2)}ms`)
    }
  }

  // Date range
  if (config.showDates && metadata.dateRange) {
    lines.push('')
    lines.push(`**Date Range**: ${metadata.dateRange.earliest} to ${metadata.dateRange.latest}`)
  }

  // Detailed sources
  if (config.showSources && metadata.sourceBreakdown.length > 0) {
    lines.push('')
    lines.push(`**Source Details**:`)
    
    metadata.sourceBreakdown.forEach(source => {
      lines.push(``)
      lines.push(`**[${source.citationNumber}] ${source.title}**`)
      
      if (config.showDates && source.datePublished) {
        lines.push(`- Date: ${source.datePublished}`)
      }
      
      lines.push(`- Chunks: ${source.chunkCount}`)
      
      if (config.showRelevanceScores) {
        lines.push(`- Relevance: ${(source.averageRelevance * 100).toFixed(1)}%`)
      }
      
      if (source.hasDateConflicts) {
        lines.push(`- ⚠️ Date conflicts resolved`)
      }
      
      if (config.includeSnippets && source.contentPreview) {
        lines.push(`- Preview: "${source.contentPreview}"`)
      }
    })
  }

  // Date conflict details
  if (config.showDateConflicts && metadata.dateConflicts.length > 0) {
    lines.push('')
    lines.push(`**Date Conflict Resolution**:`)
    metadata.dateConflicts.forEach(conflict => {
      lines.push(``)
      lines.push(`**${conflict.sourceTitle}**`)
      lines.push(`- Conflicting Dates: ${conflict.conflictingDates.join(', ')}`)
      lines.push(`- Resolution: ${conflict.resolution}`)
    })
  }

  return lines.join('\n')
}

/**
 * Get human-readable retrieval method name
 */
function getRetrievalMethodName(ragContext: RAGContext): string {
  if (ragContext.advancedRetrievalContext) {
    const methods = []
    if (ragContext.advancedRetrievalContext.rewrittenQueries.length > 0) methods.push('Query Rewriting')
    if (ragContext.advancedRetrievalContext.hydeDocuments.length > 0) methods.push('HyDE')
    if (ragContext.advancedRetrievalContext.rerankingUsed) methods.push('Reranking')
    return `Advanced Retrieval (${methods.join(', ')})`
  }
  
  if (ragContext.kgEnhancedContext) {
    return 'Knowledge Graph Enhanced'
  }
  
  if (ragContext.entityContext) {
    return 'Entity-Aware Search'
  }
  
  return ragContext.stats.queryType === 'hybrid' ? 'Hybrid Search (Vector + BM25)' : 'Vector Search'
}

/**
 * Extract key statistics for monitoring and analytics
 */
export function extractMetadataStats(metadata: DisplayMetadata): {
  sourcesUsed: number
  chunksProcessed: number
  averageRelevance: number
  retrievalTime: number
  dateConflicts: number
  hasDateRange: boolean
  retrievalMethod: string
} {
  return {
    sourcesUsed: metadata.totalSources,
    chunksProcessed: metadata.totalChunks,
    averageRelevance: metadata.averageRelevance,
    retrievalTime: metadata.queryContext.performanceStats?.totalTime || 0,
    dateConflicts: metadata.dateConflicts.length,
    hasDateRange: Boolean(metadata.dateRange),
    retrievalMethod: metadata.queryContext.retrievalMethod
  }
}

/**
 * Generate user-friendly citation footer for responses
 */
export function generateCitationFooter(
  metadata: DisplayMetadata,
  options: MetadataDisplayOptions = {}
): string {
  const config = { ...DEFAULT_DISPLAY_OPTIONS, ...options }
  
  if (metadata.sourceBreakdown.length === 0) {
    return ''
  }

  const lines: string[] = []
  lines.push('')
  lines.push('**Sources:**')
  
  metadata.sourceBreakdown.forEach(source => {
    const dateInfo = config.showDates && source.datePublished ? ` (${source.datePublished})` : ''
    const conflictWarning = source.hasDateConflicts && config.showDateConflicts ? ' *' : ''
    
    lines.push(`[${source.citationNumber}] ${source.title}${dateInfo}${conflictWarning}`)
  })

  if (config.showDateConflicts && metadata.dateConflicts.length > 0) {
    lines.push('')
    lines.push('\\* Date conflicts were resolved using newest available date')
  }

  return lines.join('\n')
}