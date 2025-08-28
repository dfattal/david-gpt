import { createClient } from '@/lib/supabase/server'

export interface ConfidenceThreshold {
  id: string
  extraction_type: 'entity' | 'relation'
  context: string // 'global', specific domain, or document type
  threshold_value: number
  created_at: string
  updated_at: string
  created_by: string
  description?: string
  is_active: boolean
}

export interface ConfidenceImpactAnalysis {
  current_threshold: number
  proposed_threshold: number
  extraction_type: 'entity' | 'relation'
  context: string
  impact: {
    items_affected: number
    items_above_threshold: number
    items_below_threshold: number
    quality_score_change: number
    precision_estimate: number
    recall_estimate: number
  }
  examples: {
    would_include: Array<{
      id: string
      name: string
      confidence: number
      type?: string
    }>
    would_exclude: Array<{
      id: string
      name: string
      confidence: number
      type?: string
    }>
  }
}

export async function getConfidenceThresholds(): Promise<ConfidenceThreshold[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('rag_confidence_thresholds')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch confidence thresholds:', error)
      throw new Error('Failed to fetch confidence thresholds')
    }

    return data || []

  } catch (error) {
    console.error('Confidence threshold fetch error:', error)
    throw error
  }
}

export async function analyzeConfidenceImpact(
  extractionType: 'entity' | 'relation',
  context: string,
  proposedThreshold: number,
  currentThreshold?: number
): Promise<ConfidenceImpactAnalysis> {
  const supabase = await createClient()

  try {
    // Get current threshold if not provided
    let finalCurrentThreshold: number = currentThreshold || 0
    if (!currentThreshold) {
      const { data: thresholds } = await supabase
        .from('rag_confidence_thresholds')
        .select('threshold_value')
        .eq('extraction_type', extractionType)
        .eq('context', context)
        .eq('is_active', true)
        .single()

      finalCurrentThreshold = thresholds?.threshold_value || 0.5
    }

    // Get all items of the specified type
    const tableName = extractionType === 'entity' ? 'rag_entities' : 'rag_relations'
    const { data: allItems, error: itemsError } = await supabase
      .from(tableName)
      .select('id, name, confidence, type, status')
      .eq('status', extractionType === 'entity' ? 'active' : 'approved')

    if (itemsError) {
      throw itemsError
    }

    const items = allItems || []

    // Analyze impact
    const itemsAboveCurrent = items.filter(item => item.confidence >= finalCurrentThreshold)
    const itemsAboveProposed = items.filter(item => item.confidence >= proposedThreshold)
    const itemsBelowProposed = items.filter(item => item.confidence < proposedThreshold)

    // Estimate quality changes
    const avgConfidenceAboveProposed = itemsAboveProposed.length > 0 
      ? itemsAboveProposed.reduce((sum, item) => sum + item.confidence, 0) / itemsAboveProposed.length
      : 0

    const avgConfidenceBelowProposed = itemsBelowProposed.length > 0
      ? itemsBelowProposed.reduce((sum, item) => sum + item.confidence, 0) / itemsBelowProposed.length
      : 0

    const qualityScoreChange = avgConfidenceAboveProposed - 
      (itemsAboveCurrent.length > 0 
        ? itemsAboveCurrent.reduce((sum, item) => sum + item.confidence, 0) / itemsAboveCurrent.length
        : 0)

    // Precision and recall estimates based on confidence distribution
    const precisionEstimate = Math.min(1, avgConfidenceAboveProposed * 1.2)
    const recallEstimate = itemsAboveProposed.length / items.length

    // Get examples
    const wouldInclude = items
      .filter(item => item.confidence >= proposedThreshold && item.confidence < finalCurrentThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        name: item.name,
        confidence: item.confidence,
        type: item.type
      }))

    const wouldExclude = items
      .filter(item => item.confidence < proposedThreshold && item.confidence >= finalCurrentThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        name: item.name,
        confidence: item.confidence,
        type: item.type
      }))

    return {
      current_threshold: finalCurrentThreshold,
      proposed_threshold: proposedThreshold,
      extraction_type: extractionType,
      context,
      impact: {
        items_affected: Math.abs(itemsAboveProposed.length - itemsAboveCurrent.length),
        items_above_threshold: itemsAboveProposed.length,
        items_below_threshold: itemsBelowProposed.length,
        quality_score_change: Math.round(qualityScoreChange * 1000) / 1000,
        precision_estimate: Math.round(precisionEstimate * 1000) / 1000,
        recall_estimate: Math.round(recallEstimate * 1000) / 1000
      },
      examples: {
        would_include: wouldInclude,
        would_exclude: wouldExclude
      }
    }

  } catch (error) {
    console.error('Confidence impact analysis failed:', error)
    throw error
  }
}

export async function updateConfidenceThreshold(
  id: string,
  updates: {
    threshold_value?: number
    description?: string
    is_active?: boolean
  }
): Promise<boolean> {
  const supabase = await createClient()

  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (updates.threshold_value !== undefined) {
      updateData.threshold_value = updates.threshold_value
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description
    }
    if (updates.is_active !== undefined) {
      updateData.is_active = updates.is_active
    }

    const { error } = await supabase
      .from('rag_confidence_thresholds')
      .update(updateData)
      .eq('id', id)

    if (error) {
      console.error('Failed to update confidence threshold:', error)
      return false
    }

    return true

  } catch (error) {
    console.error('Confidence threshold update error:', error)
    return false
  }
}

export async function createConfidenceThreshold(
  extractionType: 'entity' | 'relation',
  context: string,
  thresholdValue: number,
  createdBy: string,
  description?: string
): Promise<string | null> {
  const supabase = await createClient()

  try {
    // Deactivate existing threshold for this context if it exists
    await supabase
      .from('rag_confidence_thresholds')
      .update({ is_active: false })
      .eq('extraction_type', extractionType)
      .eq('context', context)

    // Create new threshold
    const { data, error } = await supabase
      .from('rag_confidence_thresholds')
      .insert({
        extraction_type: extractionType,
        context,
        threshold_value: thresholdValue,
        created_by: createdBy,
        description,
        is_active: true
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create confidence threshold:', error)
      return null
    }

    return data.id

  } catch (error) {
    console.error('Confidence threshold creation error:', error)
    return null
  }
}

export async function applyConfidenceThresholds(): Promise<{
  entities_updated: number
  relations_updated: number
}> {
  const supabase = await createClient()

  try {
    let entitiesUpdated = 0
    let relationsUpdated = 0

    // Get active thresholds
    const { data: thresholds, error: thresholdError } = await supabase
      .from('rag_confidence_thresholds')
      .select('*')
      .eq('is_active', true)

    if (thresholdError) {
      throw thresholdError
    }

    // Apply entity thresholds
    const entityThresholds = (thresholds || []).filter(t => t.extraction_type === 'entity')
    for (const threshold of entityThresholds) {
      // Count entities that will be rejected
      let countQuery = supabase
        .from('rag_entities')
        .select('id', { count: 'exact', head: true })
        .lt('confidence', threshold.threshold_value)
        .eq('status', 'active')

      if (threshold.context !== 'global') {
        countQuery = countQuery.eq('type', threshold.context)
      }

      const { count } = await countQuery
      entitiesUpdated += count || 0

      // Reject entities below threshold
      let updateQuery = supabase
        .from('rag_entities')
        .update({ 
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .lt('confidence', threshold.threshold_value)
        .eq('status', 'active')

      if (threshold.context !== 'global') {
        updateQuery = updateQuery.eq('type', threshold.context)
      }

      await updateQuery

      // Count entities that will be reactivated
      let reactivateCountQuery = supabase
        .from('rag_entities')
        .select('id', { count: 'exact', head: true })
        .gte('confidence', threshold.threshold_value)
        .eq('status', 'rejected')

      if (threshold.context !== 'global') {
        reactivateCountQuery = reactivateCountQuery.eq('type', threshold.context)
      }

      const { count: reactivatedCount } = await reactivateCountQuery
      entitiesUpdated += reactivatedCount || 0

      // Reactivate entities that meet threshold
      let reactivateQuery = supabase
        .from('rag_entities')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .gte('confidence', threshold.threshold_value)
        .eq('status', 'rejected')

      if (threshold.context !== 'global') {
        reactivateQuery = reactivateQuery.eq('type', threshold.context)
      }

      await reactivateQuery
    }

    // Apply relation thresholds
    const relationThresholds = (thresholds || []).filter(t => t.extraction_type === 'relation')
    for (const threshold of relationThresholds) {
      // Count relations that will be rejected
      let countQuery = supabase
        .from('rag_relations')
        .select('id', { count: 'exact', head: true })
        .lt('confidence', threshold.threshold_value)
        .eq('status', 'approved')

      if (threshold.context !== 'global') {
        countQuery = countQuery.eq('relation_type', threshold.context)
      }

      const { count } = await countQuery
      relationsUpdated += count || 0

      // Reject relations below threshold
      let updateQuery = supabase
        .from('rag_relations')
        .update({ 
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .lt('confidence', threshold.threshold_value)
        .eq('status', 'approved')

      if (threshold.context !== 'global') {
        updateQuery = updateQuery.eq('relation_type', threshold.context)
      }

      await updateQuery

      // Count relations that will be marked as pending
      let pendingCountQuery = supabase
        .from('rag_relations')
        .select('id', { count: 'exact', head: true })
        .gte('confidence', threshold.threshold_value)
        .eq('status', 'rejected')

      if (threshold.context !== 'global') {
        pendingCountQuery = pendingCountQuery.eq('relation_type', threshold.context)
      }

      const { count: pendingCount } = await pendingCountQuery
      relationsUpdated += pendingCount || 0

      // Mark high-confidence relations as pending for re-review
      let pendingUpdateQuery = supabase
        .from('rag_relations')
        .update({ 
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .gte('confidence', threshold.threshold_value)
        .eq('status', 'rejected')

      if (threshold.context !== 'global') {
        pendingUpdateQuery = pendingUpdateQuery.eq('relation_type', threshold.context)
      }

      await pendingUpdateQuery
    }

    return {
      entities_updated: entitiesUpdated,
      relations_updated: relationsUpdated
    }

  } catch (error) {
    console.error('Failed to apply confidence thresholds:', error)
    throw error
  }
}

export async function getConfidenceDistribution(
  extractionType: 'entity' | 'relation'
): Promise<{
  bins: Array<{
    range: string
    count: number
    percentage: number
  }>
  total: number
  average: number
  median: number
}> {
  const supabase = await createClient()

  try {
    const tableName = extractionType === 'entity' ? 'rag_entities' : 'rag_relations'
    const statusFilter = extractionType === 'entity' ? 'active' : 'approved'

    const { data: items, error } = await supabase
      .from(tableName)
      .select('confidence')
      .eq('status', statusFilter)

    if (error) {
      throw error
    }

    const confidences = (items || []).map(item => item.confidence).sort((a, b) => a - b)
    const total = confidences.length

    if (total === 0) {
      return {
        bins: [],
        total: 0,
        average: 0,
        median: 0
      }
    }

    // Calculate statistics
    const average = confidences.reduce((sum, conf) => sum + conf, 0) / total
    const median = total % 2 === 0 
      ? (confidences[total / 2 - 1] + confidences[total / 2]) / 2
      : confidences[Math.floor(total / 2)]

    // Create bins
    const binSize = 0.1
    const bins = []

    for (let i = 0; i < 10; i++) {
      const minRange = i * binSize
      const maxRange = (i + 1) * binSize
      const count = confidences.filter(conf => 
        conf >= minRange && (i === 9 ? conf <= maxRange : conf < maxRange)
      ).length

      bins.push({
        range: `${(minRange * 100).toFixed(0)}-${(maxRange * 100).toFixed(0)}%`,
        count,
        percentage: Math.round((count / total) * 100 * 10) / 10
      })
    }

    return {
      bins,
      total,
      average: Math.round(average * 1000) / 1000,
      median: Math.round(median * 1000) / 1000
    }

  } catch (error) {
    console.error('Failed to get confidence distribution:', error)
    throw error
  }
}