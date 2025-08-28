// API route for knowledge graph statistics
// GET /api/rag/kg/stats - Get KG statistics for user

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getKnowledgeGraphStats } from '@/lib/rag/knowledge-graph'

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

    console.log(`Getting KG stats for user ${user.id}`)
    
    const stats = await getKnowledgeGraphStats(user.id)

    return Response.json({
      success: true,
      user_id: user.id,
      stats: {
        totalEntities: stats.totalEntities,
        totalRelations: stats.totalRelations,
        connectedComponents: stats.connectedComponents,
        entityTypes: stats.entityTypes,
        relationTypes: stats.relationTypes,
        topEntities: stats.topEntities
      }
    })

  } catch (error) {
    console.error('KG stats API error:', error)
    
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
    { error: 'Method not allowed. Use GET to retrieve stats.' },
    { status: 405 }
  )
}