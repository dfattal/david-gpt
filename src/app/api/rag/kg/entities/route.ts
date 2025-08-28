// API route for knowledge graph entities
// GET /api/rag/kg/entities - List entities with pagination and filtering

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
    const type = searchParams.get('type')
    const search = searchParams.get('search')

    // Build query for entities - they are globally visible per RLS policies
    let query = supabase
      .from('rag_entities')
      .select('*', { count: 'exact' })

    // Apply filters
    if (type) {
      query = query.eq('type', type)
    }

    if (search) {
      query = query.or(`canonical_name.ilike.%${search}%,aliases.cs.{${search}}`)
    }

    // Apply pagination and execute
    const { data: entities, error, count } = await query
      .order('canonical_name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching entities:', error)
      return Response.json(
        { error: 'Failed to fetch entities' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      entities: entities || [],
      pagination: {
        limit,
        offset,
        total: count || 0
      }
    })

  } catch (error) {
    console.error('KG entities API error:', error)
    
    return Response.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}