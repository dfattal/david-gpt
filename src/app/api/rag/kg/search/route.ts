// API route for knowledge graph entity search
// GET /api/rag/kg/search - Search entities and relations

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchEntities, findRelatedEntities, entityAwareSearch } from '@/lib/rag/knowledge-graph'

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
    const query = searchParams.get('q')
    const searchType = searchParams.get('type') || 'entity'
    const entityTypes = searchParams.get('entity_types')?.split(',')
    const includeRelated = searchParams.get('include_related') === 'true'
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!query) {
      return Response.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      )
    }

    console.log(`KG search: "${query}" (type: ${searchType})`)

    let results: Record<string, unknown> = {}

    switch (searchType) {
      case 'entity':
        const entitiesResult = await searchEntities(query, user.id, {
          entityType: entityTypes?.[0], // Use first entity type filter
          limit
        })
        
        results = {
          type: 'entity_search',
          query,
          entities: entitiesResult.entities.map(entity => ({
            id: entity.id,
            name: entity.canonical_name,
            type: entity.type,
            aliases: entity.aliases || [],
            mention_count: (entity.metadata as Record<string, unknown>)?.mention_count as number || 1,
            description: (entity.metadata as Record<string, unknown>)?.description as string
          }))
        }
        break

      case 'related':
        const related = await findRelatedEntities(query, user.id, {
          maxDepth: 2,
          limit
        })
        
        results = {
          type: 'related_search',
          query,
          related_entities: related.entities.map(entity => ({
            name: entity.canonical_name,
            type: entity.type,
            relation: entity.relation,
            confidence: entity.confidence,
            depth: entity.depth
          })),
          total: related.total
        }
        break

      case 'context':
        const contextSearch = await entityAwareSearch(query, user.id, {
          includeRelatedEntities: includeRelated,
          maxEntities: 5
        })
        
        results = {
          type: 'context_search',
          query,
          entities: contextSearch.entities.map(entity => ({
            name: entity.canonical_name,
            type: entity.type,
            aliases: entity.aliases || [],
            mention_count: (entity.metadata as Record<string, unknown>)?.mention_count as number || 1
          })),
          related_info: contextSearch.relatedInfo
        }
        break

      default:
        return Response.json(
          { error: 'Invalid search type. Use: entity, related, or context' },
          { status: 400 }
        )
    }

    return Response.json({
      success: true,
      ...results
    })

  } catch (error) {
    console.error('KG search API error:', error)
    
    return Response.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST() {
  return Response.json(
    { error: 'Method not allowed. Use GET for search queries.' },
    { status: 405 }
  )
}