// API route for knowledge graph entity extraction
// POST /api/rag/kg/extract - Extract entities from a document

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildKnowledgeGraphForDocument } from '@/lib/rag/knowledge-graph'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { doc_id } = body

    if (!doc_id) {
      return Response.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Verify document ownership
    const { data: document, error: docError } = await supabase
      .from('rag_documents')
      .select('id, title')
      .eq('id', doc_id)
      .eq('owner', user.id)
      .single()

    if (docError || !document) {
      return Response.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    // Extract knowledge graph
    console.log(`Starting KG extraction for document: ${document.title}`)
    
    const result = await buildKnowledgeGraphForDocument(doc_id, user.id)

    if (!result.success) {
      return Response.json(
        { 
          error: 'Knowledge graph extraction failed',
          details: result.error 
        },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      document: {
        id: document.id,
        title: document.title
      },
      extraction: {
        entities_extracted: result.entitiesExtracted,
        relations_extracted: result.relationsExtracted,
        chunks_processed: result.chunksProcessed
      },
      warning: result.error || null
    })

  } catch (error) {
    console.error('KG extraction API error:', error)
    
    return Response.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return Response.json(
    { error: 'Method not allowed. Use POST to extract entities.' },
    { status: 405 }
  )
}