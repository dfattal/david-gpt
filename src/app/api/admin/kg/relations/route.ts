import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getRelations, updateRelationStatus } from '@/lib/admin/kg-management'

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
      status: searchParams.get('status') || undefined,
      entity_id: searchParams.get('entity_id') || undefined,
      relation_type: searchParams.get('relation_type') || undefined,
      confidence_min: searchParams.get('confidence_min') 
        ? parseFloat(searchParams.get('confidence_min')!) 
        : undefined
    }

    try {
      const { relations, total } = await getRelations(limit, offset, filters)

      await logAdminAction(adminUser.id, 'list_relations', 'knowledge_graph', undefined, {
        filters,
        results_count: relations.length
      })

      return Response.json({
        relations,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        },
        filters
      })

    } catch (error) {
      console.error('Failed to fetch relations:', error)
      return Response.json({ 
        error: 'Failed to fetch relations',
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
      const { action, relation_ids, status } = body

      switch (action) {
        case 'bulk_update_status':
          if (!relation_ids || !Array.isArray(relation_ids) || !status) {
            return Response.json({ 
              error: 'relation_ids array and status required for bulk status update' 
            }, { status: 400 })
          }

          if (!['pending', 'approved', 'rejected'].includes(status)) {
            return Response.json({ error: 'Invalid status' }, { status: 400 })
          }

          let successCount = 0
          const results = []

          for (const relationId of relation_ids) {
            const success = await updateRelationStatus(relationId, status)
            if (success) {
              successCount++
              results.push({ relation_id: relationId, success: true })
            } else {
              results.push({ relation_id: relationId, success: false })
            }
          }

          await logAdminAction(adminUser.id, 'bulk_update_relation_status', 'knowledge_graph', undefined, {
            relation_ids,
            status,
            success_count: successCount
          })

          return Response.json({
            message: `Successfully updated ${successCount}/${relation_ids.length} relations`,
            results,
            success_count: successCount,
            total_count: relation_ids.length
          })

        case 'update_status':
          const { relation_id, new_status } = body

          if (!relation_id || !new_status) {
            return Response.json({ 
              error: 'relation_id and new_status required' 
            }, { status: 400 })
          }

          if (!['pending', 'approved', 'rejected'].includes(new_status)) {
            return Response.json({ error: 'Invalid status' }, { status: 400 })
          }

          const success = await updateRelationStatus(relation_id, new_status)

          if (!success) {
            return Response.json({ error: 'Failed to update relation status' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'update_relation_status', 'knowledge_graph', relation_id, {
            old_status: 'unknown', // Would need to fetch to know old status
            new_status
          })

          return Response.json({
            message: 'Relation status updated successfully',
            relation_id,
            new_status
          })

        default:
          return Response.json({ error: 'Invalid action' }, { status: 400 })
      }

    } catch (error) {
      console.error('Relation action failed:', error)
      return Response.json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}