import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getEntity, updateEntity } from '@/lib/admin/kg-management'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const entity = await getEntity(id)

      if (!entity) {
        return Response.json({ error: 'Entity not found' }, { status: 404 })
      }

      await logAdminAction(adminUser.id, 'view_entity', 'knowledge_graph', id)

      return Response.json({
        entity,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Failed to fetch entity:', error)
      return Response.json({ 
        error: 'Failed to fetch entity',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'edit')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { name, type, description, aliases, status, confidence } = body

      const updates: any = {}
      if (name !== undefined) updates.name = name
      if (type !== undefined) updates.type = type
      if (description !== undefined) updates.description = description
      if (aliases !== undefined) updates.aliases = aliases
      if (status !== undefined) updates.status = status
      if (confidence !== undefined) updates.confidence = confidence

      const success = await updateEntity(id, updates)

      if (!success) {
        return Response.json({ error: 'Failed to update entity' }, { status: 500 })
      }

      await logAdminAction(adminUser.id, 'update_entity', 'knowledge_graph', id, {
        updated_fields: Object.keys(updates)
      })

      return Response.json({
        message: 'Entity updated successfully',
        entity_id: id,
        updated_fields: Object.keys(updates)
      })

    } catch (error) {
      console.error('Failed to update entity:', error)
      return Response.json({ 
        error: 'Failed to update entity',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}