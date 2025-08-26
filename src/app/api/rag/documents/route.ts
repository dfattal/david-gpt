import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { trackDatabaseQuery } from '@/lib/performance'

interface DocumentUploadRequest {
  title: string
  content: string
  source_type: 'text' | 'url' | 'pdf' | 'docx'
  source_uri?: string
  doc_date?: string // ISO date string, falls back to current date
  tags?: string[]
  labels?: Record<string, unknown>
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
    const { title, content, source_type, source_uri, doc_date, tags = [], labels = {} } = body

    // Validate required fields
    if (!title || !content || !source_type) {
      return Response.json({ 
        error: 'Missing required fields: title, content, source_type' 
      }, { status: 400 })
    }

    if (!['text', 'url', 'pdf', 'docx'].includes(source_type)) {
      return Response.json({ 
        error: 'Invalid source_type. Must be one of: text, url, pdf, docx' 
      }, { status: 400 })
    }

    // Parse and validate doc_date, fallback to current date
    let documentDate: Date
    if (doc_date) {
      documentDate = new Date(doc_date)
      if (isNaN(documentDate.getTime())) {
        return Response.json({ 
          error: 'Invalid doc_date format. Use ISO date string (YYYY-MM-DD)' 
        }, { status: 400 })
      }
    } else {
      documentDate = new Date()
    }

    // Insert document into database
    const startTime = performance.now()
    const { data: document, error: insertError } = await supabase
      .from('rag_documents')
      .insert({
        owner: user.id,
        title,
        source_type,
        source_uri,
        doc_date: documentDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        tags,
        labels
      })
      .select('id, title, source_type, source_uri, doc_date, tags, labels, created_at')
      .single()
    
    trackDatabaseQuery('rag_documents_insert', startTime)

    if (insertError) {
      console.error('Error inserting document:', insertError)
      return Response.json({ 
        error: 'Failed to create document' 
      }, { status: 500 })
    }

    // TODO: In Phase 2, trigger async chunking and embedding job
    // For now, just return the document
    
    return Response.json({
      document,
      message: 'Document uploaded successfully. Chunking and embedding will be implemented in Phase 2.'
    })

  } catch (error) {
    console.error('Unexpected error in document upload:', error)
    return Response.json({ 
      error: 'Internal server error' 
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