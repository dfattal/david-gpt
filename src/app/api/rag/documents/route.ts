import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { trackDatabaseQuery } from '@/lib/performance'
import { documentProcessingFactory, ProcessedDocument } from '@/lib/rag/document-processors'
import { ensureDocumentDates } from '@/lib/rag/document-dates'
import { tagCategorizationService } from '@/lib/rag/tag-categorization'

interface DocumentUploadRequest {
  title?: string // Optional - can be inferred from content
  content?: string // Optional for file uploads
  source_type?: 'text' | 'url' | 'pdf' | 'docx' | 'auto' // Auto-detect format
  source_uri?: string
  doc_date?: string // ISO date string, falls back to current date or extracted date
  tags?: string[]
  labels?: Record<string, unknown>
  // New fields for multi-format support
  file_data?: string // Base64 encoded file data
  url?: string // URL to scrape
  auto_extract_metadata?: boolean // Whether to auto-extract metadata
  processing_options?: {
    preserve_formatting?: boolean
    extract_images?: boolean
    max_pages?: number
  }
}

interface DocumentResponse {
  id: string
  title: string
  source_type: string
  source_uri?: string
  doc_date: string
  tags: string[]
  labels: Record<string, unknown>
  created_at: string
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as DocumentUploadRequest
    const { 
      title, 
      content, 
      source_type = 'auto', 
      source_uri, 
      doc_date, 
      tags = [], 
      labels = {},
      file_data,
      url,
      auto_extract_metadata = true,
      processing_options = {}
    } = body

    let processedDocument: ProcessedDocument | null = null
    let finalContent: string = ''
    let finalTitle: string = ''
    let finalSourceType: string = 'text'
    let finalSourceUri: string | undefined = source_uri

    // Determine input source and process document
    if (url) {
      // URL processing
      console.log(`Processing URL: ${url}`)
      processedDocument = await documentProcessingFactory.processDocument(url, undefined, {
        extractMetadata: auto_extract_metadata,
        preserveFormatting: processing_options.preserve_formatting || false,
        includeImages: processing_options.extract_images || false,
        timeout: 30000
      })
      finalSourceType = 'url'
      finalSourceUri = url
      
    } else if (file_data) {
      // File upload processing
      console.log(`Processing uploaded file with auto-detection`)
      
      try {
        // Parse data URL to get content type and buffer
        const [header, base64Data] = file_data.split(',')
        const contentTypeMatch = header.match(/data:([^;]+)/)
        const contentType = contentTypeMatch ? contentTypeMatch[1] : undefined
        
        const buffer = Buffer.from(base64Data, 'base64')
        
        processedDocument = await documentProcessingFactory.processDocument(buffer, contentType, {
          extractMetadata: auto_extract_metadata,
          preserveFormatting: processing_options.preserve_formatting || false,
          includeImages: processing_options.extract_images || false,
          maxPages: processing_options.max_pages || 1000
        })
        
        finalSourceType = processedDocument.metadata.format
        finalSourceUri = `${processedDocument.metadata.format}-upload`
        
      } catch (processingError) {
        console.error('File processing failed:', processingError)
        return Response.json({ 
          error: 'Failed to process uploaded file',
          details: processingError instanceof Error ? processingError.message : 'Unknown processing error'
        }, { status: 400 })
      }
      
    } else if (content) {
      // Plain text processing
      console.log(`Processing plain text content`)
      processedDocument = await documentProcessingFactory.processDocument(content, 'text/plain', {
        extractMetadata: auto_extract_metadata
      })
      finalSourceType = 'text'
      
    } else {
      return Response.json({ 
        error: 'Must provide either content, file_data, or url' 
      }, { status: 400 })
    }

    // Extract processed content and metadata
    finalContent = processedDocument.content
    
    // Use title from request, or fall back to extracted title, or generate default
    finalTitle = title || 
                processedDocument.metadata.title || 
                `Document uploaded ${new Date().toLocaleDateString()}`

    // Handle document date - prefer extracted date over provided date
    let documentDate: Date
    const extractedDate = processedDocument.metadata.creationDate || processedDocument.metadata.modificationDate
    
    if (doc_date) {
      documentDate = new Date(doc_date)
      if (isNaN(documentDate.getTime())) {
        return Response.json({ 
          error: 'Invalid doc_date format. Use ISO date string (YYYY-MM-DD)' 
        }, { status: 400 })
      }
    } else if (extractedDate) {
      documentDate = new Date(extractedDate)
    } else {
      documentDate = new Date()
    }

    // Merge extracted metadata with provided labels
    const finalLabels = {
      ...labels,
      // Store content temporarily for processing
      raw_content: finalContent,
      ...(auto_extract_metadata ? {
        extracted_metadata: {
          author: processedDocument.metadata.author,
          creator: processedDocument.metadata.creator,
          subject: processedDocument.metadata.subject,
          keywords: processedDocument.metadata.keywords,
          language: processedDocument.metadata.language,
          page_count: processedDocument.metadata.pageCount,
          word_count: processedDocument.metadata.wordCount,
          file_size: processedDocument.metadata.fileSize,
          content_type: processedDocument.metadata.contentType,
          processing_stats: processedDocument.processingStats,
          format: processedDocument.metadata.format
        }
      } : {})
    }

    // Enhance tags with AI categorization and normalization
    let finalTags = [
      ...tags,
      ...(processedDocument.metadata.keywords || [])
    ].filter((tag, index, arr) => arr.indexOf(tag) === index) // Deduplicate

    // Apply AI-powered tag enhancement if content is sufficient
    if (auto_extract_metadata && finalContent.length > 200) {
      try {
        const tagEnhancement = await tagCategorizationService.categorizeAndSuggestTags(
          finalContent,
          finalTags,
          {
            maxSuggestions: 4,
            confidenceThreshold: 0.7,
            includePredefined: true
          }
        )

        // Add high-confidence AI suggestions
        const aiTags = tagEnhancement.suggestedTags
          .filter(suggestion => suggestion.confidence >= 0.75)
          .map(suggestion => suggestion.tag)

        // Use normalized existing tags
        const normalizedTags = tagEnhancement.normalizedExistingTags.map(tag => 
          tagCategorizationService.normalizeTag(tag)
        )

        finalTags = [
          ...normalizedTags,
          ...aiTags
        ].filter((tag, index, arr) => arr.indexOf(tag) === index) // Deduplicate

        console.log(`Enhanced tags for "${finalTitle}": added ${aiTags.length} AI suggestions, normalized ${normalizedTags.length} existing tags`)

      } catch (error) {
        console.warn('Tag enhancement failed, using basic tags:', error)
        // Fall back to basic normalization
        finalTags = finalTags.map(tag => tagCategorizationService.normalizeTag(tag))
      }
    } else {
      // Basic normalization for short content
      finalTags = finalTags.map(tag => tagCategorizationService.normalizeTag(tag))
    }

    // Validate minimum content
    if (!finalContent || finalContent.trim().length < 10) {
      return Response.json({ 
        error: 'Document content is too short or empty after processing',
        processing_stats: processedDocument.processingStats
      }, { status: 400 })
    }

    // Insert document into database
    const startTime = performance.now()
    const { data: document, error: insertError } = await supabase
      .from('rag_documents')
      .insert({
        owner: user.id,
        title: finalTitle,
        source_type: finalSourceType,
        source_uri: finalSourceUri,
        doc_date: documentDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        tags: finalTags,
        labels: finalLabels
      })
      .select('id, title, source_type, source_uri, doc_date, tags, labels, created_at')
      .single()
    
    trackDatabaseQuery('rag_documents_insert', startTime)

    if (insertError) {
      console.error('Error inserting document:', insertError)
      return Response.json({ 
        error: 'Failed to create document',
        details: insertError.message
      }, { status: 500 })
    }

    // Apply document date handling for consistency
    try {
      await ensureDocumentDates(user.id, {
        dateExtractionSources: ['metadata', 'content', 'filename'],
        conflictResolutionStrategy: 'newest',
        preferNewerDates: true
      })
    } catch (dateError) {
      console.warn('Document date handling failed:', dateError)
      // Don't fail the request for date handling issues
    }

    // Return success response with processing stats
    return Response.json({
      document,
      processing_stats: processedDocument.processingStats,
      extracted_metadata: auto_extract_metadata ? {
        title: processedDocument.metadata.title,
        author: processedDocument.metadata.author,
        creation_date: processedDocument.metadata.creationDate,
        word_count: processedDocument.metadata.wordCount,
        page_count: processedDocument.metadata.pageCount,
        language: processedDocument.metadata.language,
        format: processedDocument.metadata.format
      } : undefined,
      message: `${processedDocument.metadata.format.toUpperCase()} document processed successfully. Content extracted: ${processedDocument.processingStats.extractedCharacters} characters, ${processedDocument.processingStats.sectionsFound} sections.`
    })

  } catch (error) {
    console.error('Unexpected error in document upload:', error)
    return Response.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Get user's documents with pagination
    const startTime = performance.now()
    const { data: documents, error: selectError } = await supabase
      .from('rag_documents')
      .select('id, title, source_type, source_uri, doc_date, tags, labels, created_at, updated_at')
      .eq('owner', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    trackDatabaseQuery('rag_documents_select', startTime)

    if (selectError) {
      console.error('Error fetching documents:', selectError)
      return Response.json({ 
        error: 'Failed to fetch documents' 
      }, { status: 500 })
    }

    return Response.json({
      documents: documents || [],
      pagination: {
        limit,
        offset,
        count: documents?.length || 0
      }
    })

  } catch (error) {
    console.error('Unexpected error in document fetch:', error)
    return Response.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}