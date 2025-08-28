import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getEntities, mergeEntities } from '@/lib/admin/kg-management'

export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit

    const filters = {
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      confidence_min: searchParams.get('confidence_min') 
        ? parseFloat(searchParams.get('confidence_min')!) 
        : undefined,
      needs_review: searchParams.get('needs_review') === 'true'
    }

    try {
      const { entities, total } = await getEntities(limit, offset, filters)

      await logAdminAction(adminUser.id, 'list_entities', 'knowledge_graph', undefined, {
        filters,
        results_count: entities.length
      })

      return Response.json({
        entities,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        },
        filters
      })

    } catch (error) {
      console.error('Failed to fetch entities:', error)
      return Response.json({ 
        error: 'Failed to fetch entities',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'edit')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { action, primary_entity_id, secondary_entity_ids } = body

      switch (action) {
        case 'merge':
          if (!validateAdminPermission(permissions, 'knowledge_graph', 'manage')) {
            return Response.json({ error: 'Insufficient permissions for merge operation' }, { status: 403 })
          }

          if (!primary_entity_id || !secondary_entity_ids || !Array.isArray(secondary_entity_ids)) {
            return Response.json({ 
              error: 'primary_entity_id and secondary_entity_ids array required for merge' 
            }, { status: 400 })
          }

          const mergeSuccess = await mergeEntities(primary_entity_id, secondary_entity_ids)

          if (!mergeSuccess) {
            return Response.json({ error: 'Failed to merge entities' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'merge_entities', 'knowledge_graph', primary_entity_id, {
            secondary_entity_ids,
            merged_count: secondary_entity_ids.length
          })

          return Response.json({
            message: `Successfully merged ${secondary_entity_ids.length} entities`,
            primary_entity_id,
            merged_entity_ids: secondary_entity_ids
          })

        default:
          return Response.json({ error: 'Invalid action' }, { status: 400 })
      }

    } catch (error) {
      console.error('Entity action failed:', error)
      return Response.json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}