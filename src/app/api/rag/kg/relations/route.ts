// API route for knowledge graph relations
// GET /api/rag/kg/relations - List relations with pagination and filtering

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const relationType = searchParams.get('relation_type')
    const entityId = searchParams.get('entity_id')

    // Get user's documents to filter relations
    const { data: userDocs } = await supabase
      .from('rag_documents')
      .select('id')
      .eq('owner', user.id)

    const docIds = userDocs?.map(doc => doc.id) || []

    if (docIds.length === 0) {
      return Response.json({
        success: true,
        relations: [],
        pagination: {
          limit,
          offset,
          total: 0
        }
      })
    }

    // Get entities from user's document chunks to filter relations
    const { data: userChunks } = await supabase
      .from('rag_chunks')
      .select('id')
      .in('doc_id', docIds)

    const chunkIds = userChunks?.map(chunk => chunk.id) || []

    // Get entities associated with user's chunks
    const { data: entities } = await supabase
      .from('rag_entities')
      .select('id')
      .or(chunkIds.map(id => `metadata->>chunk_id.eq.${id}`).join(','))

    const entityIds = entities?.map(e => e.id) || []

    if (entityIds.length === 0) {
      return Response.json({
        success: true,
        relations: [],
        pagination: {
          limit,
          offset,
          total: 0
        }
      })
    }

    // Build query for relations
    let query = supabase
      .from('rag_relations')
      .select(`
        *,
        head_entity:rag_entities!head_id(canonical_name, type),
        tail_entity:rag_entities!tail_id(canonical_name, type)
      `, { count: 'exact' })
      .or(`head_id.in.(${entityIds.join(',')}),tail_id.in.(${entityIds.join(',')})`)

    // Apply filters
    if (relationType) {
      query = query.eq('relation', relationType)
    }

    if (entityId) {
      const id = parseInt(entityId)
      query = query.or(`head_id.eq.${id},tail_id.eq.${id}`)
    }

    // Apply pagination and execute
    const { data: relations, error, count } = await query
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching relations:', error)
      return Response.json(
        { error: 'Failed to fetch relations' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      relations: relations || [],
      pagination: {
        limit,
        offset,
        total: count || 0
      }
    })

  } catch (error) {
    console.error('KG relations API error:', error)
    
    return Response.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}