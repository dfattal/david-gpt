// Document Date Handling and Conflict Resolution
// Phase 8: Mandatory doc_date handling with conflict resolution

import { createClient } from '@/lib/supabase/server'
import type { RAGDocument, RAGChunk } from './types'

export interface DateConflict {
  documentId: string
  documentTitle: string
  conflictingDates: Array<{
    date: string
    source: 'document_metadata' | 'chunk_content' | 'filename' | 'user_specified'
    confidence: number
    evidence?: string
  }>
  resolvedDate?: string
  resolutionStrategy: 'newest' | 'most_common' | 'highest_confidence' | 'user_specified'
  resolutionReason?: string
}

export interface DateValidationResult {
  isValid: boolean
  parsedDate?: Date
  confidence: number
  issues: string[]
  suggestedFormat?: string
}

export interface DocumentDateOptions {
  requireMandatoryDate?: boolean
  autoResolveConflicts?: boolean
  preferNewerDates?: boolean
  dateExtractionSources?: Array<'metadata' | 'content' | 'filename'>
  fallbackToCreationDate?: boolean
  conflictResolutionStrategy?: 'newest' | 'most_common' | 'highest_confidence' | 'user_specified'
}

const DEFAULT_DATE_OPTIONS: Required<DocumentDateOptions> = {
  requireMandatoryDate: true,
  autoResolveConflicts: true,
  preferNewerDates: true,
  dateExtractionSources: ['metadata', 'content', 'filename'],
  fallbackToCreationDate: false,
  conflictResolutionStrategy: 'newest'
}

/**
 * Validate and parse document date from various formats
 */
export function validateDocumentDate(
  dateString: string,
  context?: string
): DateValidationResult {
  const issues: string[] = []
  let confidence = 0
  let parsedDate: Date | undefined

  // Clean the date string
  const cleanDate = dateString.trim().replace(/[^\d\-\/\.\s:]/g, '')
  
  // Try various date formats
  const datePatterns = [
    // ISO formats
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T\d{2}:\d{2}:\d{2})?/,     // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})/,                            // YYYY/MM/DD
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,                           // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})/,                             // MM-DD-YYYY or DD-MM-YYYY
    /^(\d{4})(\d{2})(\d{2})/,                                   // YYYYMMDD
    /^(\d{4})-(\d{1,2})/,                                       // YYYY-MM (month only)
    /^(\d{4})/,                                                 // YYYY (year only)
  ]

  let matchedPattern = false

  for (const pattern of datePatterns) {
    const match = cleanDate.match(pattern)
    if (match) {
      matchedPattern = true
      
      if (match.length === 4) {
        // Full date: YYYY-MM-DD format
        const [, year, month, day] = match
        parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        confidence = 0.9
        
        // Validate the date components
        if (parsedDate.getFullYear() !== parseInt(year) ||
            parsedDate.getMonth() !== parseInt(month) - 1 ||
            parsedDate.getDate() !== parseInt(day)) {
          issues.push('Invalid date components')
          confidence -= 0.3
        }
        
      } else if (match.length === 3) {
        // Year and month only
        const [, year, month] = match
        parsedDate = new Date(parseInt(year), parseInt(month) - 1, 1)
        confidence = 0.7
        issues.push('Day component missing, defaulted to 1st')
        
      } else if (match.length === 2) {
        // Year only
        const [, year] = match
        parsedDate = new Date(parseInt(year), 0, 1)
        confidence = 0.5
        issues.push('Month and day components missing, defaulted to January 1st')
      }
      
      break
    }
  }

  if (!matchedPattern) {
    // Try natural language parsing for common patterns
    const naturalPatterns = [
      { pattern: /(\d{4})\s*年/, type: 'year' },
      { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2}),?\s*(\d{4})/i, type: 'month-day-year' },
      { pattern: /(\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})/i, type: 'day-month-year' },
    ]

    for (const { pattern, type } of naturalPatterns) {
      const match = cleanDate.match(pattern)
      if (match) {
        if (type === 'year') {
          parsedDate = new Date(parseInt(match[1]), 0, 1)
          confidence = 0.4
          issues.push('Only year extracted from natural language')
        } else if (type === 'month-day-year') {
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                             'july', 'august', 'september', 'october', 'november', 'december']
          const monthIndex = monthNames.indexOf(match[1].toLowerCase())
          parsedDate = new Date(parseInt(match[3]), monthIndex, parseInt(match[2]))
          confidence = 0.8
        }
        matchedPattern = true
        break
      }
    }
  }

  if (!parsedDate) {
    issues.push('Unable to parse date format')
    return {
      isValid: false,
      confidence: 0,
      issues,
      suggestedFormat: 'YYYY-MM-DD (ISO 8601 format recommended)'
    }
  }

  // Additional validation
  const currentYear = new Date().getFullYear()
  
  if (parsedDate.getFullYear() < 1900) {
    issues.push('Date appears to be before 1900')
    confidence -= 0.2
  }
  
  if (parsedDate.getFullYear() > currentYear + 1) {
    issues.push('Date appears to be in the future')
    confidence -= 0.3
  }
  
  if (parsedDate > new Date()) {
    issues.push('Date is in the future')
    confidence -= 0.1
  }

  // Context-based validation
  if (context) {
    if (context.toLowerCase().includes('draft') && parsedDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) {
      issues.push('Draft document with old date - may be outdated')
      confidence -= 0.1
    }
  }

  return {
    isValid: confidence > 0.3 && issues.filter(i => !i.includes('defaulted')).length === 0,
    parsedDate,
    confidence: Math.max(0, Math.min(1, confidence)),
    issues,
    suggestedFormat: confidence < 0.6 ? 'YYYY-MM-DD (ISO 8601 format recommended)' : undefined
  }
}

/**
 * Extract dates from document content using pattern matching
 */
export function extractDatesFromContent(content: string): Array<{
  date: string
  confidence: number
  context: string
  position: number
}> {
  const extractedDates = []
  
  // Date patterns with context keywords
  const contextPatterns = [
    { pattern: /(?:published|created|updated|modified|dated|written)[\s:]*(\d{4}-\d{1,2}-\d{1,2})/gi, boost: 0.3 },
    { pattern: /(?:published|created|updated|modified|dated|written)[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/gi, boost: 0.3 },
    { pattern: /(?:published|created|updated|modified|dated|written)[\s:]*([a-z]+ \d{1,2},? \d{4})/gi, boost: 0.2 },
    { pattern: /(\d{4}-\d{1,2}-\d{1,2})/g, boost: 0 },
    { pattern: /(\d{1,2}\/\d{1,2}\/\d{4})/g, boost: 0 },
    { pattern: /([a-z]+ \d{1,2},? \d{4})/gi, boost: 0 },
  ]

  for (const { pattern, boost } of contextPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const dateString = match[1]
      const position = match.index
      const contextStart = Math.max(0, position - 50)
      const contextEnd = Math.min(content.length, position + 50)
      const context = content.substring(contextStart, contextEnd)
      
      const validation = validateDocumentDate(dateString, context)
      
      if (validation.isValid && validation.parsedDate) {
        extractedDates.push({
          date: validation.parsedDate.toISOString().split('T')[0],
          confidence: validation.confidence + boost,
          context,
          position
        })
      }
    }
  }

  // Deduplicate and sort by confidence
  const uniqueDates = new Map<string, typeof extractedDates[0]>()
  
  for (const extracted of extractedDates) {
    const existing = uniqueDates.get(extracted.date)
    if (!existing || extracted.confidence > existing.confidence) {
      uniqueDates.set(extracted.date, extracted)
    }
  }

  return Array.from(uniqueDates.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5) // Top 5 candidates
}

/**
 * Resolve date conflicts using specified strategy
 */
export function resolveDateConflicts(
  conflicts: DateConflict[],
  strategy: 'newest' | 'most_common' | 'highest_confidence' | 'user_specified' = 'newest'
): DateConflict[] {
  return conflicts.map(conflict => {
    const resolved = { ...conflict }
    
    switch (strategy) {
      case 'newest':
        resolved.resolvedDate = conflict.conflictingDates
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
        resolved.resolutionReason = 'Selected newest date'
        break
        
      case 'most_common':
        const dateCounts = new Map<string, number>()
        conflict.conflictingDates.forEach(d => {
          dateCounts.set(d.date, (dateCounts.get(d.date) || 0) + 1)
        })
        const mostCommon = Array.from(dateCounts.entries())
          .sort(([,a], [,b]) => b - a)[0]
        resolved.resolvedDate = mostCommon[0]
        resolved.resolutionReason = `Selected most common date (appeared ${mostCommon[1]} times)`
        break
        
      case 'highest_confidence':
        resolved.resolvedDate = conflict.conflictingDates
          .sort((a, b) => b.confidence - a.confidence)[0].date
        resolved.resolutionReason = 'Selected highest confidence date'
        break
        
      case 'user_specified':
        // Keep unresolved for user intervention
        resolved.resolutionReason = 'Awaiting user resolution'
        break
    }
    
    resolved.resolutionStrategy = strategy
    return resolved
  })
}

/**
 * Ensure all documents have mandatory dates
 */
export async function ensureDocumentDates(
  userId: string,
  options: DocumentDateOptions = {}
): Promise<{
  success: boolean
  documentsProcessed: number
  datesAdded: number
  conflictsResolved: number
  conflicts: DateConflict[]
  errors: string[]
}> {
  const config = { ...DEFAULT_DATE_OPTIONS, ...options }
  const supabase = await createClient()
  const errors: string[] = []
  const conflicts: DateConflict[] = []
  
  let documentsProcessed = 0
  let datesAdded = 0
  let conflictsResolved = 0

  try {
    console.log(`Ensuring mandatory dates for user ${userId}`)

    // Get all documents without doc_date or with conflicting dates
    const { data: documents, error: docsError } = await supabase
      .from('rag_documents')
      .select(`
        id,
        title,
        doc_date,
        metadata,
        created_at,
        rag_chunks(id, content, chunk_date, created_at)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (docsError) {
      errors.push(`Failed to fetch documents: ${docsError.message}`)
      return { success: false, documentsProcessed: 0, datesAdded: 0, conflictsResolved: 0, conflicts: [], errors }
    }

    for (const doc of documents || []) {
      documentsProcessed++
      
      try {
        console.log(`Processing document: ${doc.title}`)
        
        const candidateDates: Array<{
          date: string
          source: 'document_metadata' | 'chunk_content' | 'filename' | 'user_specified'
          confidence: number
          evidence?: string
        }> = []

        // 1. Check existing doc_date
        if (doc.doc_date) {
          const validation = validateDocumentDate(doc.doc_date)
          if (validation.isValid) {
            candidateDates.push({
              date: validation.parsedDate!.toISOString().split('T')[0],
              source: 'document_metadata',
              confidence: validation.confidence,
              evidence: 'Existing document date'
            })
          }
        }

        // 2. Extract from document metadata
        if (config.dateExtractionSources.includes('metadata') && doc.metadata) {
          const metadata = doc.metadata as Record<string, unknown>
          const metadataDateFields = ['publishedDate', 'createdDate', 'modifiedDate', 'date']
          
          for (const field of metadataDateFields) {
            if (metadata[field] && typeof metadata[field] === 'string') {
              const validation = validateDocumentDate(metadata[field] as string)
              if (validation.isValid) {
                candidateDates.push({
                  date: validation.parsedDate!.toISOString().split('T')[0],
                  source: 'document_metadata',
                  confidence: validation.confidence * 0.8,
                  evidence: `Metadata field: ${field}`
                })
              }
            }
          }
        }

        // 3. Extract from filename patterns
        if (config.dateExtractionSources.includes('filename')) {
          const dateFromTitle = extractDatesFromContent(doc.title)
          for (const extracted of dateFromTitle) {
            candidateDates.push({
              date: extracted.date,
              source: 'filename',
              confidence: extracted.confidence * 0.6,
              evidence: `Filename pattern: "${extracted.context.trim()}"`
            })
          }
        }

        // 4. Extract from chunk content
        if (config.dateExtractionSources.includes('content') && doc.rag_chunks) {
          for (const chunk of doc.rag_chunks.slice(0, 3)) { // Check first 3 chunks
            const datesFromContent = extractDatesFromContent(chunk.content)
            for (const extracted of datesFromContent.slice(0, 2)) { // Top 2 per chunk
              candidateDates.push({
                date: extracted.date,
                source: 'chunk_content',
                confidence: extracted.confidence * 0.7,
                evidence: `Content: "${extracted.context.trim()}"`
              })
            }
          }
        }

        // 5. Fallback to creation date if allowed
        if (config.fallbackToCreationDate && candidateDates.length === 0) {
          const creationDate = new Date(doc.created_at).toISOString().split('T')[0]
          candidateDates.push({
            date: creationDate,
            source: 'document_metadata',
            confidence: 0.3,
            evidence: 'Document creation timestamp (fallback)'
          })
        }

        // Process candidate dates
        if (candidateDates.length === 0) {
          if (config.requireMandatoryDate) {
            errors.push(`Document "${doc.title}": No valid date found`)
          }
          continue
        }

        // Check for conflicts (multiple dates with similar confidence)
        const uniqueDates = new Set(candidateDates.map(d => d.date))
        
        if (uniqueDates.size > 1) {
          // Conflict detected
          const conflict: DateConflict = {
            documentId: doc.id,
            documentTitle: doc.title,
            conflictingDates: candidateDates,
            resolutionStrategy: config.conflictResolutionStrategy
          }
          
          if (config.autoResolveConflicts) {
            const [resolved] = resolveDateConflicts([conflict], config.conflictResolutionStrategy)
            conflict.resolvedDate = resolved.resolvedDate
            conflict.resolutionReason = resolved.resolutionReason
            conflictsResolved++
          }
          
          conflicts.push(conflict)
        }

        // Determine final date
        const finalDate = uniqueDates.size > 1 
          ? (conflicts.find(c => c.documentId === doc.id)?.resolvedDate || 
             candidateDates.sort((a, b) => b.confidence - a.confidence)[0].date)
          : candidateDates[0].date

        // Update document with resolved date
        if (finalDate && (!doc.doc_date || doc.doc_date !== finalDate)) {
          const { error: updateError } = await supabase
            .from('rag_documents')
            .update({ 
              doc_date: finalDate,
              metadata: {
                ...(doc.metadata as Record<string, unknown> || {}),
                date_resolution: {
                  resolved_date: finalDate,
                  candidate_dates: candidateDates.length,
                  resolution_strategy: config.conflictResolutionStrategy,
                  resolved_at: new Date().toISOString()
                }
              }
            })
            .eq('id', doc.id)

          if (updateError) {
            errors.push(`Failed to update date for "${doc.title}": ${updateError.message}`)
          } else {
            datesAdded++
            console.log(`✓ Updated date for "${doc.title}": ${finalDate}`)
          }
        }

      } catch (docError) {
        const message = docError instanceof Error ? docError.message : 'Unknown error'
        errors.push(`Error processing "${doc.title}": ${message}`)
      }
    }

    console.log(`Document date processing complete: ${documentsProcessed} processed, ${datesAdded} dates added, ${conflictsResolved} conflicts resolved`)

    return {
      success: errors.length === 0,
      documentsProcessed,
      datesAdded,
      conflictsResolved,
      conflicts,
      errors
    }

  } catch (error) {
    console.error('Document date processing failed:', error)
    errors.push(error instanceof Error ? error.message : 'Unknown error')
    
    return {
      success: false,
      documentsProcessed,
      datesAdded,
      conflictsResolved,
      conflicts,
      errors
    }
  }
}

/**
 * Get documents sorted by date with conflict information
 */
export async function getDocumentsByDate(
  userId: string,
  options: {
    sortOrder?: 'newest' | 'oldest'
    includeUndated?: boolean
    dateRange?: { start: string, end: string }
  } = {}
): Promise<Array<RAGDocument & { 
  dateInfo: {
    hasDate: boolean
    dateSource?: string
    confidence?: number
    hasConflicts: boolean
    conflictCount?: number
  }
}>> {
  const supabase = await createClient()
  const { sortOrder = 'newest', includeUndated = true, dateRange } = options

  let query = supabase
    .from('rag_documents')
    .select('*')
    .eq('user_id', userId)

  if (dateRange) {
    query = query
      .gte('doc_date', dateRange.start)
      .lte('doc_date', dateRange.end)
  }

  if (!includeUndated) {
    query = query.not('doc_date', 'is', null)
  }

  const { data: documents, error } = await query
    .order('doc_date', { ascending: sortOrder === 'oldest', nullsFirst: false })

  if (error || !documents) {
    console.error('Failed to fetch documents by date:', error)
    return []
  }

  return documents.map(doc => ({
    ...doc,
    dateInfo: {
      hasDate: !!doc.doc_date,
      dateSource: doc.metadata?.date_resolution?.resolution_strategy || undefined,
      confidence: doc.metadata?.date_resolution?.candidate_dates || undefined,
      hasConflicts: (doc.metadata?.date_resolution?.candidate_dates || 0) > 1,
      conflictCount: doc.metadata?.date_resolution?.candidate_dates || 0
    }
  }))
}