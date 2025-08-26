import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { trackDatabaseQuery } from '@/lib/performance'

interface JobCreateRequest {
  document_id: string
  operation: 'chunk_and_embed' | 'extract_entities' | 'reprocess'
  payload?: Record<string, unknown>
}

interface JobResponse {
  id: string
  owner: string
  payload: Record<string, unknown>
  status: 'queued' | 'processing' | 'completed' | 'error'
  error?: string
  created_at: string
  updated_at: string
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as JobCreateRequest
    const { document_id, operation, payload = {} } = body

    // Validate required fields
    if (!document_id || !operation) {
      return Response.json({ 
        error: 'Missing required fields: document_id, operation' 
      }, { status: 400 })
    }

    // Validate operation type
    const validOperations = ['chunk_and_embed', 'extract_entities', 'reprocess']
    if (!validOperations.includes(operation)) {
      return Response.json({ 
        error: `Invalid operation. Must be one of: ${validOperations.join(', ')}` 
      }, { status: 400 })
    }

    // Verify user owns the document
    const { data: document, error: docError } = await supabase
      .from('rag_documents')
      .select('id')
      .eq('id', document_id)
      .eq('owner', user.id)
      .single()

    if (docError || !document) {
      return Response.json({ 
        error: 'Document not found or access denied' 
      }, { status: 404 })
    }

    // Create ingestion job
    const jobPayload = {
      document_id,
      operation,
      user_id: user.id,
      ...payload
    }

    const startTime = performance.now()
    const { data: job, error: insertError } = await supabase
      .from('rag_ingest_jobs')
      .insert({
        owner: user.id,
        payload: jobPayload,
        status: 'queued'
      })
      .select('id, owner, payload, status, error, created_at, updated_at')
      .single()
    
    trackDatabaseQuery('rag_jobs_insert', startTime)

    if (insertError) {
      console.error('Error creating ingestion job:', insertError)
      return Response.json({ 
        error: 'Failed to create ingestion job' 
      }, { status: 500 })
    }

    // TODO: In Phase 2, trigger actual background processing
    // For now, just return the job record
    
    return Response.json({
      job,
      message: 'Job queued successfully. Background processing will be implemented in Phase 2.'
    })

  } catch (error) {
    console.error('Unexpected error in job creation:', error)
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
    const status = searchParams.get('status') // Optional status filter

    let query = supabase
      .from('rag_ingest_jobs')
      .select('id, owner, payload, status, error, created_at, updated_at')
      .eq('owner', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply status filter if provided
    if (status && ['queued', 'processing', 'completed', 'error'].includes(status)) {
      query = query.eq('status', status)
    }

    const startTime = performance.now()
    const { data: jobs, error: selectError } = await query
    
    trackDatabaseQuery('rag_jobs_select', startTime)

    if (selectError) {
      console.error('Error fetching jobs:', selectError)
      return Response.json({ 
        error: 'Failed to fetch jobs' 
      }, { status: 500 })
    }

    return Response.json({
      jobs: jobs || [],
      pagination: {
        limit,
        offset,
        count: jobs?.length || 0
      }
    })

  } catch (error) {
    console.error('Unexpected error in jobs fetch:', error)
    return Response.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}