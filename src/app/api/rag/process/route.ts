import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { triggerDocumentProcessing } from '@/lib/rag/processing-queue'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { document_id } = body

    if (!document_id) {
      return NextResponse.json(
        { error: 'document_id is required' },
        { status: 400 }
      )
    }

    const { data: document, error: docError } = await supabase
      .from('rag_documents')
      .select('id, title, labels, owner')
      .eq('id', document_id)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    if (document.owner !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const processing_status = document.labels?.processing_status

    if (processing_status === 'processing') {
      return NextResponse.json(
        { error: 'Document is already being processed' },
        { status: 409 }
      )
    }

    if (processing_status === 'completed') {
      return NextResponse.json(
        { 
          message: 'Document has already been processed successfully',
          document_id,
          status: 'completed'
        }
      )
    }

    await supabase
      .from('rag_documents')
      .update({ 
        labels: {
          ...document.labels,
          processing_status: 'queued'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id)

    const jobId = await triggerDocumentProcessing(document_id)

    return NextResponse.json({
      success: true,
      message: 'Document processing initiated',
      document_id,
      job_id: jobId,
      status: 'queued'
    })

  } catch (error) {
    console.error('Document processing trigger failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to trigger document processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('document_id')

    if (!documentId) {
      return NextResponse.json(
        { error: 'document_id parameter is required' },
        { status: 400 }
      )
    }

    const { data: document, error: docError } = await supabase
      .from('rag_documents')
      .select('id, title, labels, owner, updated_at')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    if (document.owner !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('Failed to fetch processing jobs:', jobsError)
    }

    let chunks = null
    let entities = null
    let relationships = null

    const processing_status = document.labels?.processing_status

    if (processing_status === 'completed') {
      const [chunksResult, entitiesResult, relationshipsResult] = await Promise.all([
        supabase
          .from('rag_chunks')
          .select('id, chunk_index, labels')
          .eq('doc_id', documentId)
          .order('chunk_index'),
        
        supabase
          .from('rag_entities')
          .select('id, canonical_name, entity_type, description')
          .limit(50), // Global entities, not document-specific
        
        supabase
          .from('rag_relations')
          .select('id, relation_type, confidence')
          .limit(50) // Global relations, not document-specific
      ])

      chunks = chunksResult.data
      entities = entitiesResult.data
      relationships = relationshipsResult.data
    }

    return NextResponse.json({
      document: {
        id: document.id,
        title: document.title,
        processing_status: processing_status,
        processed_at: document.labels?.processed_at,
        chunk_count: document.labels?.chunk_count
      },
      jobs: jobs || [],
      processing_results: processing_status === 'completed' ? {
        chunks: chunks || [],
        entities: entities || [],
        relationships: relationships || [],
        stats: {
          total_chunks: chunks?.length || 0,
          total_entities: entities?.length || 0,
          total_relationships: relationships?.length || 0
        }
      } : null
    })

  } catch (error) {
    console.error('Failed to get processing status:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to get processing status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}