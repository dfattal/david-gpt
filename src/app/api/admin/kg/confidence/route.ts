import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { 
  getConfidenceThresholds, 
  analyzeConfidenceImpact,
  updateConfidenceThreshold,
  createConfidenceThreshold,
  applyConfidenceThresholds,
  getConfidenceDistribution
} from '@/lib/admin/confidence-tuning'

export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    try {
      switch (action) {
        case 'distribution':
          const extractionType = searchParams.get('extraction_type') as 'entity' | 'relation'
          if (!extractionType || !['entity', 'relation'].includes(extractionType)) {
            return Response.json({ 
              error: 'extraction_type parameter required (entity or relation)' 
            }, { status: 400 })
          }

          const distribution = await getConfidenceDistribution(extractionType)
          
          await logAdminAction(adminUser.id, 'view_confidence_distribution', 'knowledge_graph', undefined, {
            extraction_type: extractionType
          })

          return Response.json({
            distribution,
            extraction_type: extractionType,
            timestamp: new Date().toISOString()
          })

        case 'analyze':
          const analysisType = searchParams.get('extraction_type') as 'entity' | 'relation'
          const context = searchParams.get('context') || 'global'
          const proposedThreshold = parseFloat(searchParams.get('proposed_threshold') || '0.5')
          const currentThreshold = searchParams.get('current_threshold') 
            ? parseFloat(searchParams.get('current_threshold')!) 
            : undefined

          if (!analysisType || !['entity', 'relation'].includes(analysisType)) {
            return Response.json({ 
              error: 'extraction_type parameter required (entity or relation)' 
            }, { status: 400 })
          }

          if (isNaN(proposedThreshold) || proposedThreshold < 0 || proposedThreshold > 1) {
            return Response.json({ 
              error: 'proposed_threshold must be between 0 and 1' 
            }, { status: 400 })
          }

          const analysis = await analyzeConfidenceImpact(
            analysisType, 
            context, 
            proposedThreshold, 
            currentThreshold
          )

          await logAdminAction(adminUser.id, 'analyze_confidence_impact', 'knowledge_graph', undefined, {
            extraction_type: analysisType,
            context,
            proposed_threshold: proposedThreshold
          })

          return Response.json({
            analysis,
            timestamp: new Date().toISOString()
          })

        default:
          // Default: get all thresholds
          const thresholds = await getConfidenceThresholds()

          await logAdminAction(adminUser.id, 'view_confidence_thresholds', 'knowledge_graph')

          return Response.json({
            thresholds,
            timestamp: new Date().toISOString()
          })
      }

    } catch (error) {
      console.error('Failed to process confidence request:', error)
      return Response.json({ 
        error: 'Failed to process confidence request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'knowledge_graph', 'manage')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { action } = body

      switch (action) {
        case 'create_threshold':
          const { 
            extraction_type, 
            context, 
            threshold_value, 
            description 
          } = body

          if (!extraction_type || !['entity', 'relation'].includes(extraction_type)) {
            return Response.json({ 
              error: 'extraction_type required (entity or relation)' 
            }, { status: 400 })
          }

          if (!context) {
            return Response.json({ error: 'context required' }, { status: 400 })
          }

          if (typeof threshold_value !== 'number' || threshold_value < 0 || threshold_value > 1) {
            return Response.json({ 
              error: 'threshold_value must be between 0 and 1' 
            }, { status: 400 })
          }

          const thresholdId = await createConfidenceThreshold(
            extraction_type,
            context,
            threshold_value,
            adminUser.id,
            description
          )

          if (!thresholdId) {
            return Response.json({ error: 'Failed to create threshold' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'create_confidence_threshold', 'knowledge_graph', thresholdId, {
            extraction_type,
            context,
            threshold_value
          })

          return Response.json({
            message: 'Confidence threshold created successfully',
            threshold_id: thresholdId,
            extraction_type,
            context,
            threshold_value
          })

        case 'update_threshold':
          const { threshold_id, updates } = body

          if (!threshold_id) {
            return Response.json({ error: 'threshold_id required' }, { status: 400 })
          }

          if (!updates || Object.keys(updates).length === 0) {
            return Response.json({ error: 'updates required' }, { status: 400 })
          }

          // Validate updates
          if (updates.threshold_value !== undefined) {
            if (typeof updates.threshold_value !== 'number' || 
                updates.threshold_value < 0 || 
                updates.threshold_value > 1) {
              return Response.json({ 
                error: 'threshold_value must be between 0 and 1' 
              }, { status: 400 })
            }
          }

          const updateSuccess = await updateConfidenceThreshold(threshold_id, updates)

          if (!updateSuccess) {
            return Response.json({ error: 'Failed to update threshold' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'update_confidence_threshold', 'knowledge_graph', threshold_id, {
            updated_fields: Object.keys(updates)
          })

          return Response.json({
            message: 'Confidence threshold updated successfully',
            threshold_id,
            updates
          })

        case 'apply_thresholds':
          const results = await applyConfidenceThresholds()

          await logAdminAction(adminUser.id, 'apply_confidence_thresholds', 'knowledge_graph', undefined, {
            entities_updated: results.entities_updated,
            relations_updated: results.relations_updated
          })

          return Response.json({
            message: 'Confidence thresholds applied successfully',
            results
          })

        default:
          return Response.json({ error: 'Invalid action' }, { status: 400 })
      }

    } catch (error) {
      console.error('Confidence threshold action failed:', error)
      return Response.json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}