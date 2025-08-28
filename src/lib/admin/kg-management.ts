import { createClient } from '@/lib/supabase/server'

export interface Entity {
  id: string
  name: string
  type: string
  description?: string
  aliases: string[]
  confidence: number
  created_at: string
  updated_at: string
  merged_from?: string[]
  status: 'active' | 'merged' | 'rejected'
  metadata?: {
    source_count?: number
    relation_count?: number
    last_mentioned?: string
    canonical_name?: string
  }
}

export interface Relation {
  id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  description?: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
  source_chunks: string[]
  metadata?: {
    evidence_count?: number
    strength?: number
    bidirectional?: boolean
  }
  source_entity?: Entity
  target_entity?: Entity
}

export interface EntityStats {
  total_entities: number
  active_entities: number
  merged_entities: number
  rejected_entities: number
  entities_by_type: Record<string, number>
  total_relations: number
  pending_relations: number
  approved_relations: number
  rejected_relations: number
  avg_confidence: number
  entities_needing_review: number
}

export async function getEntities(
  limit = 50,
  offset = 0,
  filters?: {
    type?: string
    status?: string
    search?: string
    confidence_min?: number
    needs_review?: boolean
  }
): Promise<{ entities: Entity[], total: number }> {
  const supabase = await createClient()

  try {
    let query = supabase
      .from('rag_entities')
      .select(`
        id,
        name,
        type,
        description,
        aliases,
        confidence,
        created_at,
        updated_at,
        merged_from,
        status,
        metadata
      `)

    // Apply filters
    if (filters?.type) {
      query = query.eq('type', filters.type)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    } else {
      // Default to active entities
      query = query.eq('status', 'active')
    }

    if (filters?.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,aliases.cs.{${filters.search}},description.ilike.%${filters.search}%`
      )
    }

    if (filters?.confidence_min) {
      query = query.gte('confidence', filters.confidence_min)
    }

    if (filters?.needs_review) {
      // Entities with low confidence or potential duplicates
      query = query.or('confidence.lt.0.7,aliases.neq.{}')
    }

    // Get total count
    const { count: totalCount, error: countError } = await supabase
      .from('rag_entities')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Failed to get entity count:', countError)
    }

    // Apply pagination and ordering
    const { data: entities, error } = await query
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch entities:', error)
      throw new Error('Failed to fetch entities')
    }

    // Enhance entities with additional metadata
    const enhancedEntities: Entity[] = await Promise.all(
      (entities || []).map(async (entity) => {
        // Get relation count
        const { count: relationCount } = await supabase
          .from('rag_relations')
          .select('*', { count: 'exact', head: true })
          .or(`source_entity_id.eq.${entity.id},target_entity_id.eq.${entity.id}`)

        // Get source count (how many chunks mention this entity)
        const { count: sourceCount } = await supabase
          .from('rag_chunk_entities')
          .select('*', { count: 'exact', head: true })
          .eq('entity_id', entity.id)

        return {
          ...entity,
          metadata: {
            ...entity.metadata,
            source_count: sourceCount || 0,
            relation_count: relationCount || 0
          }
        }
      })
    )

    return {
      entities: enhancedEntities,
      total: totalCount || 0
    }

  } catch (error) {
    console.error('Entity fetch error:', error)
    throw error
  }
}

export async function getEntity(entityId: string): Promise<Entity | null> {
  const supabase = await createClient()

  try {
    const { data: entity, error } = await supabase
      .from('rag_entities')
      .select(`
        id,
        name,
        type,
        description,
        aliases,
        confidence,
        created_at,
        updated_at,
        merged_from,
        status,
        metadata
      `)
      .eq('id', entityId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    // Get related entities and relations
    const { data: relations, error: relError } = await supabase
      .from('rag_relations')
      .select(`
        id,
        source_entity_id,
        target_entity_id,
        relation_type,
        description,
        confidence,
        status,
        created_at,
        source_entity:rag_entities!source_entity_id(id, name, type),
        target_entity:rag_entities!target_entity_id(id, name, type)
      `)
      .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)

    // Get chunks that mention this entity
    const { data: chunks, error: chunkError } = await supabase
      .from('rag_chunk_entities')
      .select(`
        chunk_id,
        rag_chunks!inner(
          id,
          content,
          doc_id,
          rag_documents!inner(title, source_type)
        )
      `)
      .eq('entity_id', entityId)

    return {
      ...entity,
      metadata: {
        ...entity.metadata,
        source_count: chunks?.length || 0,
        relation_count: relations?.length || 0,
        last_mentioned: (chunks as any)?.[0]?.rag_chunks?.created_at
      }
    }

  } catch (error) {
    console.error('Failed to fetch entity details:', error)
    return null
  }
}

export async function updateEntity(
  entityId: string,
  updates: {
    name?: string
    type?: string
    description?: string
    aliases?: string[]
    status?: 'active' | 'merged' | 'rejected'
    confidence?: number
  }
): Promise<boolean> {
  const supabase = await createClient()

  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.aliases !== undefined) updateData.aliases = updates.aliases
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence

    const { error } = await supabase
      .from('rag_entities')
      .update(updateData)
      .eq('id', entityId)

    if (error) {
      console.error('Failed to update entity:', error)
      return false
    }

    return true

  } catch (error) {
    console.error('Entity update error:', error)
    return false
  }
}

export async function mergeEntities(
  primaryEntityId: string,
  secondaryEntityIds: string[]
): Promise<boolean> {
  const supabase = await createClient()

  try {
    // Start transaction
    const { data: primaryEntity, error: primaryError } = await supabase
      .from('rag_entities')
      .select('*')
      .eq('id', primaryEntityId)
      .single()

    if (primaryError || !primaryEntity) {
      throw new Error('Primary entity not found')
    }

    // Get secondary entities
    const { data: secondaryEntities, error: secondaryError } = await supabase
      .from('rag_entities')
      .select('*')
      .in('id', secondaryEntityIds)

    if (secondaryError || !secondaryEntities?.length) {
      throw new Error('Secondary entities not found')
    }

    // Merge aliases
    const allAliases = new Set([
      ...(primaryEntity.aliases || []),
      ...secondaryEntities.flatMap(e => [e.name, ...(e.aliases || [])])
    ])

    // Update primary entity with merged data
    const { error: updateError } = await supabase
      .from('rag_entities')
      .update({
        aliases: Array.from(allAliases),
        confidence: Math.max(primaryEntity.confidence, ...secondaryEntities.map(e => e.confidence)),
        merged_from: [...(primaryEntity.merged_from || []), ...secondaryEntityIds],
        updated_at: new Date().toISOString()
      })
      .eq('id', primaryEntityId)

    if (updateError) {
      throw updateError
    }

    // Update all relations that reference secondary entities
    for (const secondaryId of secondaryEntityIds) {
      // Update source references
      await supabase
        .from('rag_relations')
        .update({ source_entity_id: primaryEntityId })
        .eq('source_entity_id', secondaryId)

      // Update target references
      await supabase
        .from('rag_relations')
        .update({ target_entity_id: primaryEntityId })
        .eq('target_entity_id', secondaryId)

      // Update chunk entity references
      await supabase
        .from('rag_chunk_entities')
        .update({ entity_id: primaryEntityId })
        .eq('entity_id', secondaryId)
    }

    // Mark secondary entities as merged
    const { error: mergeError } = await supabase
      .from('rag_entities')
      .update({
        status: 'merged',
        updated_at: new Date().toISOString()
      })
      .in('id', secondaryEntityIds)

    if (mergeError) {
      throw mergeError
    }

    return true

  } catch (error) {
    console.error('Entity merge failed:', error)
    return false
  }
}

export async function getRelations(
  limit = 50,
  offset = 0,
  filters?: {
    status?: string
    entity_id?: string
    relation_type?: string
    confidence_min?: number
  }
): Promise<{ relations: Relation[], total: number }> {
  const supabase = await createClient()

  try {
    let query = supabase
      .from('rag_relations')
      .select(`
        id,
        source_entity_id,
        target_entity_id,
        relation_type,
        description,
        confidence,
        status,
        created_at,
        updated_at,
        source_chunks,
        metadata,
        source_entity:rag_entities!source_entity_id(id, name, type),
        target_entity:rag_entities!target_entity_id(id, name, type)
      `)

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.entity_id) {
      query = query.or(`source_entity_id.eq.${filters.entity_id},target_entity_id.eq.${filters.entity_id}`)
    }

    if (filters?.relation_type) {
      query = query.eq('relation_type', filters.relation_type)
    }

    if (filters?.confidence_min) {
      query = query.gte('confidence', filters.confidence_min)
    }

    // Get total count
    const { count: totalCount, error: countError } = await supabase
      .from('rag_relations')
      .select('*', { count: 'exact', head: true })

    // Apply pagination and ordering
    const { data: relations, error } = await query
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch relations:', error)
      throw new Error('Failed to fetch relations')
    }

    // Transform the relations data to match the interface
    const transformedRelations = (relations || []).map((relation: any) => ({
      ...relation,
      source_entity: Array.isArray(relation.source_entity) ? relation.source_entity[0] : relation.source_entity,
      target_entity: Array.isArray(relation.target_entity) ? relation.target_entity[0] : relation.target_entity
    }))

    return {
      relations: transformedRelations,
      total: totalCount || 0
    }

  } catch (error) {
    console.error('Relation fetch error:', error)
    throw error
  }
}

export async function updateRelationStatus(
  relationId: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('rag_relations')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', relationId)

    if (error) {
      console.error('Failed to update relation status:', error)
      return false
    }

    return true

  } catch (error) {
    console.error('Relation status update error:', error)
    return false
  }
}

export async function getKGStats(): Promise<EntityStats> {
  const supabase = await createClient()

  try {
    // Get entity stats
    const { data: entities, error: entityError } = await supabase
      .from('rag_entities')
      .select('type, status, confidence')

    // Get relation stats
    const { data: relations, error: relationError } = await supabase
      .from('rag_relations')
      .select('status, confidence')

    if (entityError || relationError) {
      throw new Error('Failed to fetch KG statistics')
    }

    const entityStats = entities || []
    const relationStats = relations || []

    const entitiesByType = entityStats.reduce((acc, entity) => {
      acc[entity.type] = (acc[entity.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const avgConfidence = entityStats.length > 0
      ? entityStats.reduce((sum, e) => sum + e.confidence, 0) / entityStats.length
      : 0

    const entitiesNeedingReview = entityStats.filter(e =>
      e.confidence < 0.7 || e.status === 'active'
    ).length

    return {
      total_entities: entityStats.length,
      active_entities: entityStats.filter(e => e.status === 'active').length,
      merged_entities: entityStats.filter(e => e.status === 'merged').length,
      rejected_entities: entityStats.filter(e => e.status === 'rejected').length,
      entities_by_type: entitiesByType,
      total_relations: relationStats.length,
      pending_relations: relationStats.filter(r => r.status === 'pending').length,
      approved_relations: relationStats.filter(r => r.status === 'approved').length,
      rejected_relations: relationStats.filter(r => r.status === 'rejected').length,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      entities_needing_review: entitiesNeedingReview
    }

  } catch (error) {
    console.error('Failed to get KG stats:', error)
    throw error
  }
}