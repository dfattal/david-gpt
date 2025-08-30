import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Map AI-generated entity types to database-compatible types
function mapEntityType(aiType: string): string {
  const typeMap: Record<string, string> = {
    'PERSON': 'person',
    'ORGANIZATION': 'company',
    'CONCEPT': 'tech',
    'TECHNOLOGY': 'tech',
    'PRODUCT': 'product',
    'LOCATION': 'company', // Map to company as closest match
    'EVENT': 'event',
    'OTHER': 'tech' // Default to tech
  }
  
  return typeMap[aiType.toUpperCase()] || 'tech'
}

// Map AI-generated relation types to database-compatible types
function mapRelationType(aiRelationType: string): string {
  const relationMap: Record<string, string> = {
    'FOUNDED_BY': 'developed_by',
    'FOUNDED': 'developed',
    'CREATED_BY': 'developed_by',
    'CREATED': 'developed',
    'DEVELOPED_BY': 'developed_by',
    'DEVELOPED': 'developed',
    'LAUNCHED_BY': 'launched_by',
    'LAUNCHED': 'launched',
    'PARTNERED_WITH': 'partnered_with',
    'PARTNERS_WITH': 'partnered_with',
    'PARTNERSHIP': 'partnered_with',
    'COLLABORATED_WITH': 'partnered_with',
    'USES': 'uses_technology',
    'USES_TECHNOLOGY': 'uses_technology',
    'UTILIZES': 'uses_technology',
    'IMPLEMENTS': 'uses_technology',
    'FUNDED_BY': 'funded_by',
    'FUNDED': 'funded_by',
    'FINANCED_BY': 'funded_by',
    'LED_BY': 'led_by',
    'LEADS': 'led_by',
    'MANAGED_BY': 'led_by',
    'CEO_OF': 'led_by',
    'COMPETES_WITH': 'competitor_of',
    'COMPETITOR_OF': 'competitor_of',
    'RIVAL_OF': 'competitor_of',
    'ACQUIRED_BY': 'acquired',
    'ACQUIRED': 'acquired',
    'BOUGHT_BY': 'acquired',
    'RELATED_TO': 'partnered_with', // Generic relation mapped to partnership
    'INFLUENCES': 'partnered_with', // Influence mapped to partnership
    'PART_OF': 'developed_by', // Part of mapped to development
    'BELONGS_TO': 'developed_by',
    'OWNED_BY': 'developed_by',
    'WORKS_FOR': 'led_by',
    'EMPLOYED_BY': 'led_by',
    'INTERACTS_WITH': 'partnered_with', // Interaction mapped to partnership
    'CREATES': 'developed',
    'BUILDS': 'developed'
  }
  
  return relationMap[aiRelationType.toUpperCase()] || 'partnered_with'
}

export interface Entity {
  id: string
  name: string
  type: string
  description?: string
  aliases?: string[]
  properties?: Record<string, any>
  confidence_score?: number
}

export interface Relationship {
  id: string
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  description?: string
  confidence_score: number
  properties?: Record<string, any>
}

export interface KnowledgeGraphExtraction {
  entities: Entity[]
  relationships: Relationship[]
  source_chunk_id: string
  extraction_metadata: {
    model_used: string
    extraction_timestamp: string
    confidence_threshold: number
    total_entities: number
    total_relationships: number
  }
}

export class KnowledgeGraphExtractor {
  private readonly model: string
  private readonly confidenceThreshold: number

  constructor(
    model: string = 'gpt-4o-mini',
    confidenceThreshold: number = 0.7
  ) {
    this.model = model
    this.confidenceThreshold = confidenceThreshold
  }

  async extractFromChunk(
    chunkContent: string,
    chunkId: string,
    context?: string
  ): Promise<KnowledgeGraphExtraction> {
    if (!chunkContent.trim()) {
      throw new Error('Cannot extract knowledge graph from empty content')
    }

    const systemPrompt = `You are an AI expert at extracting structured knowledge graphs from text. Your task is to identify entities and relationships that would be valuable for a RAG (Retrieval-Augmented Generation) system.

Instructions:
1. Extract meaningful entities (people, organizations, concepts, technologies, products, locations, etc.)
2. Identify relationships between these entities
3. Focus on factual, verifiable information
4. Assign confidence scores (0.0-1.0) based on how explicit the information is in the text
5. Use clear, consistent entity and relationship types
6. Avoid extracting trivial or overly generic information

Return a JSON object with this exact structure:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "PERSON|ORGANIZATION|CONCEPT|TECHNOLOGY|PRODUCT|LOCATION|EVENT|OTHER",
      "description": "Brief description",
      "aliases": ["alternative names"],
      "properties": {"key": "value"}
    }
  ],
  "relationships": [
    {
      "source_entity": "Source Entity Name",
      "target_entity": "Target Entity Name", 
      "relationship_type": "WORKS_FOR|CREATED|LOCATED_IN|PART_OF|RELATED_TO|INFLUENCES|OTHER",
      "description": "Brief description of the relationship",
      "confidence_score": 0.9
    }
  ]
}

Focus on extracting knowledge that would help answer questions about the content.`

    const userPrompt = `Extract a knowledge graph from the following text:

${context ? `Context: ${context}\n\n` : ''}Text: ${chunkContent}

Return the knowledge graph as JSON:`

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI API')
      }

      const extractedData = JSON.parse(content)
      
      return this.processExtraction(extractedData, chunkId)
    } catch (error) {
      console.error('Knowledge graph extraction failed:', error)
      
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON response from AI model')
      }
      
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error('OpenAI rate limit exceeded. Please wait before retrying.')
        } else if (error.message.includes('quota')) {
          throw new Error('OpenAI quota exceeded. Please check your billing.')
        }
      }
      
      throw new Error(`Failed to extract knowledge graph: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private processExtraction(
    rawData: any,
    chunkId: string
  ): KnowledgeGraphExtraction {
    const entities: Entity[] = []
    const relationships: Relationship[] = []
    const entityMap = new Map<string, string>()

    if (rawData.entities && Array.isArray(rawData.entities)) {
      for (let i = 0; i < rawData.entities.length; i++) {
        const rawEntity = rawData.entities[i]
        
        if (!rawEntity.name || !rawEntity.type) {
          continue
        }

        const entityId = this.generateEntityId(rawEntity.name, rawEntity.type)
        entityMap.set(rawEntity.name.toLowerCase(), entityId)

        entities.push({
          id: entityId,
          name: rawEntity.name,
          type: rawEntity.type.toUpperCase(),
          description: rawEntity.description || undefined,
          aliases: rawEntity.aliases || undefined,
          properties: rawEntity.properties || undefined,
          confidence_score: rawEntity.confidence_score || 0.8
        })
      }
    }

    if (rawData.relationships && Array.isArray(rawData.relationships)) {
      for (let i = 0; i < rawData.relationships.length; i++) {
        const rawRel = rawData.relationships[i]
        
        if (!rawRel.source_entity || !rawRel.target_entity || !rawRel.relationship_type) {
          continue
        }

        const sourceId = entityMap.get(rawRel.source_entity.toLowerCase())
        const targetId = entityMap.get(rawRel.target_entity.toLowerCase())
        
        if (!sourceId || !targetId) {
          continue
        }

        const confidence = typeof rawRel.confidence_score === 'number' 
          ? Math.max(0, Math.min(1, rawRel.confidence_score))
          : 0.5

        if (confidence < this.confidenceThreshold) {
          continue
        }

        relationships.push({
          id: this.generateRelationshipId(sourceId, targetId, rawRel.relationship_type),
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relationship_type: rawRel.relationship_type.toUpperCase(),
          description: rawRel.description || undefined,
          confidence_score: confidence,
          properties: rawRel.properties || undefined
        })
      }
    }

    return {
      entities,
      relationships,
      source_chunk_id: chunkId,
      extraction_metadata: {
        model_used: this.model,
        extraction_timestamp: new Date().toISOString(),
        confidence_threshold: this.confidenceThreshold,
        total_entities: entities.length,
        total_relationships: relationships.length
      }
    }
  }

  private generateEntityId(name: string, type: string): string {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const normalizedType = type.toLowerCase()
    return `entity_${normalizedType}_${normalizedName}_${Date.now()}`
  }

  private generateRelationshipId(sourceId: string, targetId: string, type: string): string {
    const normalizedType = type.toLowerCase().replace(/[^a-z0-9]/g, '_')
    return `rel_${sourceId}_${normalizedType}_${targetId}`
  }

  async extractFromMultipleChunks(
    chunks: Array<{ id: string; content: string }>,
    documentContext?: string
  ): Promise<KnowledgeGraphExtraction[]> {
    const extractions: KnowledgeGraphExtraction[] = []
    
    console.log(`Extracting knowledge graph from ${chunks.length} chunks`)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      try {
        const extraction = await this.extractFromChunk(
          chunk.content,
          chunk.id,
          documentContext
        )
        extractions.push(extraction)
        
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      } catch (error) {
        console.error(`Failed to extract knowledge graph from chunk ${chunk.id}:`, error)
        
        extractions.push({
          entities: [],
          relationships: [],
          source_chunk_id: chunk.id,
          extraction_metadata: {
            model_used: this.model,
            extraction_timestamp: new Date().toISOString(),
            confidence_threshold: this.confidenceThreshold,
            total_entities: 0,
            total_relationships: 0
          }
        })
      }
    }

    console.log(`Completed knowledge graph extraction: ${extractions.length} chunks processed`)
    return extractions
  }
}

export function mergeKnowledgeGraphExtractions(
  extractions: KnowledgeGraphExtraction[]
): KnowledgeGraphExtraction {
  const mergedEntities: Entity[] = []
  const mergedRelationships: Relationship[] = []
  const entityDeduplicationMap = new Map<string, Entity>()
  const relationshipDeduplicationMap = new Map<string, Relationship>()

  for (const extraction of extractions) {
    for (const entity of extraction.entities) {
      const key = `${entity.name.toLowerCase()}_${entity.type}`
      
      if (entityDeduplicationMap.has(key)) {
        const existing = entityDeduplicationMap.get(key)!
        if (entity.description && !existing.description) {
          existing.description = entity.description
        }
        if (entity.aliases) {
          existing.aliases = [...(existing.aliases || []), ...entity.aliases]
        }
        if (entity.properties) {
          existing.properties = { ...(existing.properties || {}), ...entity.properties }
        }
      } else {
        entityDeduplicationMap.set(key, { ...entity })
        mergedEntities.push(entity)
      }
    }

    for (const relationship of extraction.relationships) {
      const key = `${relationship.source_entity_id}_${relationship.relationship_type}_${relationship.target_entity_id}`
      
      if (!relationshipDeduplicationMap.has(key)) {
        relationshipDeduplicationMap.set(key, relationship)
        mergedRelationships.push(relationship)
      } else {
        const existing = relationshipDeduplicationMap.get(key)!
        existing.confidence_score = Math.max(existing.confidence_score, relationship.confidence_score)
      }
    }
  }

  return {
    entities: mergedEntities,
    relationships: mergedRelationships,
    source_chunk_id: 'merged',
    extraction_metadata: {
      model_used: extractions[0]?.extraction_metadata.model_used || 'unknown',
      extraction_timestamp: new Date().toISOString(),
      confidence_threshold: extractions[0]?.extraction_metadata.confidence_threshold || 0.7,
      total_entities: mergedEntities.length,
      total_relationships: mergedRelationships.length
    }
  }
}

export function validateKnowledgeGraph(extraction: KnowledgeGraphExtraction): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  if (!extraction.entities || !Array.isArray(extraction.entities)) {
    issues.push('Missing or invalid entities array')
  }

  if (!extraction.relationships || !Array.isArray(extraction.relationships)) {
    issues.push('Missing or invalid relationships array')
  }

  const entityIds = new Set<string>()
  for (const entity of extraction.entities) {
    if (!entity.id || !entity.name || !entity.type) {
      issues.push(`Invalid entity: ${JSON.stringify(entity)}`)
    }
    if (entityIds.has(entity.id)) {
      issues.push(`Duplicate entity ID: ${entity.id}`)
    }
    entityIds.add(entity.id)
  }

  for (const relationship of extraction.relationships) {
    if (!relationship.id || !relationship.source_entity_id || !relationship.target_entity_id) {
      issues.push(`Invalid relationship: ${JSON.stringify(relationship)}`)
    }
    if (!entityIds.has(relationship.source_entity_id)) {
      issues.push(`Relationship references non-existent source entity: ${relationship.source_entity_id}`)
    }
    if (!entityIds.has(relationship.target_entity_id)) {
      issues.push(`Relationship references non-existent target entity: ${relationship.target_entity_id}`)
    }
    if (relationship.confidence_score < 0 || relationship.confidence_score > 1) {
      issues.push(`Invalid confidence score: ${relationship.confidence_score}`)
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}

// Main function to build knowledge graph for a document
export async function buildKnowledgeGraphForDocument(
  documentId: string,
  userId: string
): Promise<{
  success: boolean
  entitiesExtracted: number
  relationsExtracted: number
  chunksProcessed: number
  error?: string
}> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  try {
    // Get document chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('rag_chunks')
      .select('*')
      .eq('doc_id', documentId)
      .order('chunk_index', { ascending: true })

    if (chunksError || !chunks || chunks.length === 0) {
      return {
        success: false,
        entitiesExtracted: 0,
        relationsExtracted: 0,
        chunksProcessed: 0,
        error: 'No chunks found for document'
      }
    }

    const extractor = new KnowledgeGraphExtractor()
    const allExtractions: KnowledgeGraphExtraction[] = []
    let totalEntities = 0
    let totalRelationships = 0

    // Process each chunk
    for (const chunk of chunks) {
      try {
        const extraction = await extractor.extractFromChunk(
          chunk.content,
          chunk.id.toString()
        )

        if (extraction.entities.length > 0 || extraction.relationships.length > 0) {
          allExtractions.push(extraction)
          totalEntities += extraction.entities.length
          totalRelationships += extraction.relationships.length

          // Store entities in database
          for (const entity of extraction.entities) {
            // Check if entity already exists
            const { data: existingEntity } = await supabase
              .from('rag_entities')
              .select('id')
              .eq('canonical_name', entity.name)
              .single()

            if (!existingEntity) {
              const { error: entityError } = await supabase
                .from('rag_entities')
                .insert({
                  canonical_name: entity.name,
                  type: mapEntityType(entity.type),
                  aliases: entity.aliases || [entity.name],
                  metadata: {
                    chunk_id: chunk.id,
                    confidence: entity.confidence_score || 0.8,
                    description: entity.description,
                    properties: entity.properties
                  }
                })
                
              if (entityError) {
                console.error(`Error inserting entity ${entity.name}:`, entityError)
              }
            }
          }

          // Store relationships in database
          for (const relationship of extraction.relationships) {
            // Find source entity by ID (since our extraction uses entity IDs)
            const sourceEntityName = extraction.entities.find(e => e.id === relationship.source_entity_id)?.name
            const targetEntityName = extraction.entities.find(e => e.id === relationship.target_entity_id)?.name
            
            if (!sourceEntityName || !targetEntityName) {
              console.warn(`Could not find entity names for relation: ${relationship.source_entity_id} -> ${relationship.target_entity_id}`)
              continue
            }

            // Find entity database IDs
            const { data: headEntity, error: headError } = await supabase
              .from('rag_entities')
              .select('id')
              .eq('canonical_name', sourceEntityName)
              .single()

            const { data: tailEntity, error: tailError } = await supabase
              .from('rag_entities')
              .select('id')
              .eq('canonical_name', targetEntityName)
              .single()

            if (headEntity && tailEntity && !headError && !tailError) {
              // Check if relation already exists
              const mappedRelationType = mapRelationType(relationship.relationship_type)
              const { data: existingRelation } = await supabase
                .from('rag_relations')
                .select('id')
                .eq('head_id', headEntity.id)
                .eq('tail_id', tailEntity.id)
                .eq('relation', mappedRelationType)
                .single()

              if (!existingRelation) {
                const { error: relationError } = await supabase
                  .from('rag_relations')
                  .insert({
                    head_id: headEntity.id,
                    relation: mapRelationType(relationship.relationship_type),
                    tail_id: tailEntity.id,
                    evidence_chunk_id: chunk.id,
                    confidence: relationship.confidence_score
                  })
                  
                if (relationError) {
                  console.error(`Error inserting relation ${relationship.relationship_type}:`, relationError)
                }
              }
            } else {
              console.warn(`Could not find database entities for relation: ${sourceEntityName} -> ${targetEntityName}`)
            }
          }

          // Store chunk-entity associations
          for (const entity of extraction.entities) {
            const { data: entityRecord, error: entitySelectError } = await supabase
              .from('rag_entities')
              .select('id')
              .eq('canonical_name', entity.name)
              .single()

            if (entityRecord && !entitySelectError) {
              // Check if chunk-entity association already exists
              const { data: existingAssoc } = await supabase
                .from('rag_chunk_entities')
                .select('id')
                .eq('chunk_id', chunk.id)
                .eq('entity_id', entityRecord.id)
                .single()

              if (!existingAssoc) {
                const { error: chunkEntityError } = await supabase
                  .from('rag_chunk_entities')
                  .insert({
                    chunk_id: chunk.id,
                    entity_id: entityRecord.id,
                    mention: entity.name,
                    confidence: entity.confidence_score || 0.8
                  })
                  
                if (chunkEntityError) {
                  console.error(`Error inserting chunk-entity association:`, chunkEntityError)
                }
              }
            }
          }
        }
      } catch (chunkError) {
        console.error(`Error processing chunk ${chunk.id}:`, chunkError)
        // Continue processing other chunks
      }
    }

    return {
      success: true,
      entitiesExtracted: totalEntities,
      relationsExtracted: totalRelationships,
      chunksProcessed: chunks.length,
      error: allExtractions.length === 0 ? 'No entities or relationships extracted' : undefined
    }

  } catch (error) {
    console.error('KG extraction failed:', error)
    return {
      success: false,
      entitiesExtracted: 0,
      relationsExtracted: 0,
      chunksProcessed: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Get comprehensive knowledge graph statistics
export async function getKnowledgeGraphStats(userId: string): Promise<{
  totalEntities: number
  totalRelations: number
  connectedComponents: number
  entityTypes: Array<{ type: string; count: number }>
  relationTypes: Array<{ type: string; count: number }>
  topEntities: Array<{ name: string; type: string; connections: number }>
}> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  try {
    // Get user's documents to filter entities
    const { data: userDocs } = await supabase
      .from('rag_documents')
      .select('id')
      .eq('owner', userId)

    const docIds = userDocs?.map(doc => doc.id) || []

    if (docIds.length === 0) {
      return {
        totalEntities: 0,
        totalRelations: 0,
        connectedComponents: 0,
        entityTypes: [],
        relationTypes: [],
        topEntities: []
      }
    }

    // Get entities from user's document chunks
    const { data: userChunks } = await supabase
      .from('rag_chunks')
      .select('id')
      .in('doc_id', docIds)

    const chunkIds = userChunks?.map(chunk => chunk.id) || []

    // Get entities associated with user's chunks through the chunk_entities table
    const { data: chunkEntities } = await supabase
      .from('rag_chunk_entities')
      .select('entity_id')
      .in('chunk_id', chunkIds)
      
    const entityIds = chunkEntities?.map(ce => ce.entity_id) || []
    
    // Get the actual entities
    let entities: any[] = []
    if (entityIds.length > 0) {
      const { data: entitiesData } = await supabase
        .from('rag_entities')
        .select('*')
        .in('id', entityIds)
      entities = entitiesData || []
    }

    // Get relations involving user's entities  
    let relations: any[] = []
    
    if (entities.length > 0) {
      const relEntityIds = entities.map(e => e.id)
      const { data: relationsData } = await supabase
        .from('rag_relations')
        .select('*')
        .or(`head_id.in.(${relEntityIds.join(',')}),tail_id.in.(${relEntityIds.join(',')})`)
      
      relations = relationsData || []
    }

    // Calculate entity type distribution
    const entityTypes = new Map<string, number>()
    entities?.forEach(entity => {
      const type = entity.type || 'unknown'
      entityTypes.set(type, (entityTypes.get(type) || 0) + 1)
    })

    // Calculate relation type distribution
    const relationTypes = new Map<string, number>()
    relations.forEach(relation => {
      const type = relation.relation || 'unknown'
      relationTypes.set(type, (relationTypes.get(type) || 0) + 1)
    })

    // Calculate entity connection counts (degree centrality)
    const entityConnections = new Map<number, number>()
    relations.forEach(relation => {
      const headId = relation.head_id
      const tailId = relation.tail_id
      
      entityConnections.set(headId, (entityConnections.get(headId) || 0) + 1)
      entityConnections.set(tailId, (entityConnections.get(tailId) || 0) + 1)
    })

    // Get top connected entities
    const topEntities = entities
      ?.map(entity => ({
        name: entity.canonical_name,
        type: entity.type,
        connections: entityConnections.get(entity.id) || 0
      }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 10) || []

    // Estimate connected components (simplified calculation)
    // This is a rough estimate - proper calculation would need graph traversal
    const totalEntities = entities?.length || 0
    const totalRelations = relations.length
    const connectedComponents = Math.max(1, totalEntities - totalRelations)

    return {
      totalEntities,
      totalRelations,
      connectedComponents,
      entityTypes: Array.from(entityTypes.entries()).map(([type, count]) => ({ type, count })),
      relationTypes: Array.from(relationTypes.entries()).map(([type, count]) => ({ type, count })),
      topEntities
    }

  } catch (error) {
    console.error('Error getting KG stats:', error)
    return {
      totalEntities: 0,
      totalRelations: 0,
      connectedComponents: 0,
      entityTypes: [],
      relationTypes: [],
      topEntities: []
    }
  }
}

// Search for entities by name or alias
export async function searchEntities(
  searchQuery: string,
  userId: string,
  options: {
    limit?: number
    exactMatch?: boolean
    entityType?: string
  } = {}
): Promise<{
  entities: Array<{
    id: number
    canonical_name: string
    type: string
    aliases: string[]
    metadata: any
  }>
  total: number
}> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()
  const { limit = 20, exactMatch = false, entityType } = options

  try {
    // Get user's entities through chunk-entity relationships
    const { data: userDocs } = await supabase
      .from('rag_documents')
      .select('id')
      .eq('owner', userId)

    const docIds = userDocs?.map(doc => doc.id) || []

    if (docIds.length === 0) {
      return { entities: [], total: 0 }
    }

    // Get user's chunk IDs
    const { data: userChunks } = await supabase
      .from('rag_chunks')
      .select('id')
      .in('doc_id', docIds)

    const chunkIds = userChunks?.map(chunk => chunk.id) || []

    if (chunkIds.length === 0) {
      return { entities: [], total: 0 }
    }

    // Get entity IDs that are linked to user's chunks
    const { data: userEntityLinks } = await supabase
      .from('rag_chunk_entities')
      .select('entity_id')
      .in('chunk_id', chunkIds)

    const entityIds = [...new Set(userEntityLinks?.map(link => link.entity_id) || [])]

    if (entityIds.length === 0) {
      return { entities: [], total: 0 }
    }

    // Build entity search query using proper entity IDs
    let query = supabase
      .from('rag_entities')
      .select('*', { count: 'exact' })
      .in('id', entityIds)

    // Apply search filtering
    if (exactMatch) {
      query = query.or(`canonical_name.eq.${searchQuery},aliases.cs.{${searchQuery}}`)
    } else {
      query = query.or(`canonical_name.ilike.%${searchQuery}%,aliases.cs.{${searchQuery}}`)
    }

    // Apply entity type filtering
    if (entityType) {
      query = query.eq('type', entityType)
    }

    const { data: entities, error, count } = await query
      .order('canonical_name', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Error searching entities:', error)
      return { entities: [], total: 0 }
    }

    return {
      entities: entities || [],
      total: count || 0
    }
  } catch (error) {
    console.error('Entity search failed:', error)
    return { entities: [], total: 0 }
  }
}

// Find related entities for a given entity
export async function findRelatedEntities(
  entityName: string,
  userId: string,
  options: {
    maxDepth?: number
    limit?: number
    relationTypes?: string[]
  } = {}
): Promise<{
  entities: Array<{
    canonical_name: string
    type: string
    relation: string
    confidence: number
    depth: number
  }>
  total: number
}> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()
  const { maxDepth = 1, limit = 20, relationTypes } = options

  try {
    // Find the base entity first
    const baseEntityResult = await searchEntities(entityName, userId, {
      exactMatch: true,
      limit: 1
    })

    if (baseEntityResult.entities.length === 0) {
      return { entities: [], total: 0 }
    }

    const baseEntity = baseEntityResult.entities[0]

    // Get relations involving this entity
    let query = supabase
      .from('rag_relations')
      .select(`
        *,
        head_entity:rag_entities!head_id(canonical_name, type),
        tail_entity:rag_entities!tail_id(canonical_name, type)
      `)
      .or(`head_id.eq.${baseEntity.id},tail_id.eq.${baseEntity.id}`)

    if (relationTypes && relationTypes.length > 0) {
      query = query.in('relation', relationTypes)
    }

    const { data: relations, error } = await query
      .order('confidence', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error finding related entities:', error)
      return { entities: [], total: 0 }
    }

    const relatedEntities = (relations || []).map(relation => {
      const isHead = relation.head_id === baseEntity.id
      const relatedEntity = isHead ? relation.tail_entity : relation.head_entity
      
      return {
        canonical_name: relatedEntity.canonical_name,
        type: relatedEntity.type,
        relation: relation.relation,
        confidence: relation.confidence,
        depth: 1
      }
    })

    return {
      entities: relatedEntities,
      total: relatedEntities.length
    }
  } catch (error) {
    console.error('Find related entities failed:', error)
    return { entities: [], total: 0 }
  }
}

// Entity-aware search for enhanced RAG retrieval
export async function entityAwareSearch(
  query: string,
  userId: string,
  options: {
    includeRelatedEntities?: boolean
    entityBoost?: number
    maxEntities?: number
  } = {}
): Promise<{
  entities: Array<{
    canonical_name: string
    type: string
    aliases: string[]
    metadata: any
  }>
  relatedInfo: string
}> {
  const { includeRelatedEntities = true, maxEntities = 5 } = options

  try {
    // Search for entities mentioned in the query
    const entitySearchResult = await searchEntities(query, userId, {
      limit: maxEntities,
      exactMatch: false
    })

    let relatedInfo = ''
    const foundEntities = entitySearchResult.entities

    if (foundEntities.length > 0 && includeRelatedEntities) {
      // Get related entities for context
      const relatedResults = await Promise.all(
        foundEntities.slice(0, 2).map(entity => 
          findRelatedEntities(entity.canonical_name, userId, {
            limit: 3
          })
        )
      )

      const allRelated = relatedResults.flatMap(result => result.entities)
      if (allRelated.length > 0) {
        relatedInfo = `Related entities: ${allRelated
          .slice(0, 5)
          .map(e => `${e.canonical_name} (${e.relation})`)
          .join(', ')}`
      }
    }

    return {
      entities: foundEntities,
      relatedInfo
    }
  } catch (error) {
    console.error('Entity-aware search failed:', error)
    return { entities: [], relatedInfo: '' }
  }
}