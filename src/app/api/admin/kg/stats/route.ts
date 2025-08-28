import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getKGStats } from '@/lib/admin/kg-management'

export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const stats = await getKGStats()

      await logAdminAction(adminUser.id, 'view_kg_stats', 'knowledge_graph')

      return Response.json({
        stats,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Failed to fetch KG stats:', error)
      return Response.json({ 
        error: 'Failed to fetch knowledge graph statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}