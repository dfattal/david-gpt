// Entity Extraction for Knowledge Graph
// Phase 5: OpenAI structured outputs for entity and relation extraction

import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { RAGChunk, RAGEntity, RAGRelation, RAGChunkEntity } from './types'

// Entity extraction configuration
export interface EntityExtractionConfig {
  model?: string
  maxEntitiesPerChunk?: number
  maxRelationsPerChunk?: number
  confidenceThreshold?: number
  enableBatching?: boolean
  batchSize?: number
}

const DEFAULT_CONFIG: Required<EntityExtractionConfig> = {
  model: 'gpt-4o',
  maxEntitiesPerChunk: 20,
  maxRelationsPerChunk: 15,
  confidenceThreshold: 0.7,
  enableBatching: false,
  batchSize: 5
}

// Zod schemas for structured extraction
const EntitySchema = z.object({
  name: z.string().describe('Canonical name of the entity'),
  type: z.enum(['company', 'product', 'tech', 'team', 'person', 'event', 'publication']).describe('Type of entity'),
  aliases: z.array(z.string()).default([]).describe('Alternative names or aliases'),
  description: z.string().optional().describe('Brief description of the entity'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  context: z.string().describe('Context where entity appears in the text')
})

const RelationSchema = z.object({
  head_entity: z.string().describe('Name of the head entity'),
  relation: z.enum([
    'partnered_with', 'developed_by', 'developed', 'launched_by', 'launched',
    'uses_technology', 'funded_by', 'led_by', 'competitor_of', 'acquired'
  ]).describe('Type of relationship'),
  tail_entity: z.string().describe('Name of the tail entity'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  evidence: z.string().describe('Text evidence supporting this relationship')
})

const ExtractionResultSchema = z.object({
  entities: z.array(EntitySchema).max(20).describe('Entities found in the text'),
  relations: z.array(RelationSchema).max(15).describe('Relationships between entities'),
  summary: z.string().describe('Brief summary of key information extracted')
})

export type ExtractedEntity = z.infer<typeof EntitySchema>
export type ExtractedRelation = z.infer<typeof RelationSchema>
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

/**
 * Extract entities and relations from text using OpenAI structured outputs
 */
export async function extractEntitiesFromText(
  text: string,
  context: { chunkId?: number, docId?: string, userId?: string } = {},
  config: EntityExtractionConfig = {}
): Promise<ExtractionResult> {
  const settings = { ...DEFAULT_CONFIG, ...config }
  
  console.log(`Extracting entities from text (${text.length} chars)`)
  
  try {
    const result = await generateObject({
      model: openai(settings.model),
      schema: ExtractionResultSchema,
      prompt: `
You are an expert at extracting structured information from business and technical documents.

Extract entities and relationships from the following text. Focus on:

ENTITIES to identify:
- Companies (startups, enterprises, organizations)
- Products (software, hardware, services)
- Technologies (programming languages, frameworks, platforms)
- People (founders, executives, developers, researchers)
- Teams (departments, groups, committees)
- Events (launches, conferences, announcements)
- Publications (reports, papers, articles)

RELATIONSHIPS to identify:
- partnered_with: Business partnerships
- developed_by/developed: Creator relationships
- launched_by/launched: Product/service launches
- uses_technology: Technology adoption
- funded_by: Investment relationships
- led_by: Leadership relationships  
- competitor_of: Competitive relationships
- acquired: Acquisition relationships

Guidelines:
- Use canonical names (e.g., "OpenAI" not "openai" or "Open AI")
- Include confidence scores based on text clarity
- Capture aliases and alternative names
- Focus on factual, verifiable relationships
- Prioritize business-relevant entities and relations

Text to analyze:
"""
${text}
"""

Context: Document ID: ${context.docId || 'unknown'}, Chunk ID: ${context.chunkId || 'unknown'}
      `,
      temperature: 0.1 // Low temperature for consistent extraction
    })

    // Filter by confidence threshold
    const filteredEntities = result.object.entities.filter(
      entity => entity.confidence >= settings.confidenceThreshold
    )
    
    const filteredRelations = result.object.relations.filter(
      relation => relation.confidence >= settings.confidenceThreshold
    )

    console.log(`Extracted ${filteredEntities.length}/${result.object.entities.length} entities and ${filteredRelations.length}/${result.object.relations.length} relations above threshold`)

    return {
      entities: filteredEntities,
      relations: filteredRelations,
      summary: result.object.summary
    }

  } catch (error) {
    console.error('Entity extraction failed:', error)
    return {
      entities: [],
      relations: [],
      summary: 'Entity extraction failed'
    }
  }
}

/**
 * Normalize and deduplicate entity names
 */
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[""'']/g, '"')
    .replace(/[–—]/g, '-')
    // Normalize common company suffixes
    .replace(/\b(Inc|LLC|Ltd|Corp|Corporation|Company)\b\.?$/i, (match) => match.toUpperCase())
    // Normalize technology names
    .replace(/\bJavaScript\b/gi, 'JavaScript')
    .replace(/\bTypeScript\b/gi, 'TypeScript')
    .replace(/\bNode\.?js\b/gi, 'Node.js')
    .replace(/\bReact\.?js\b/gi, 'React')
}

/**
 * Calculate entity similarity for deduplication
 */
export function calculateEntitySimilarity(name1: string, name2: string, aliases1: string[] = [], aliases2: string[] = []): number {
  const normalized1 = normalizeEntityName(name1).toLowerCase()
  const normalized2 = normalizeEntityName(name2).toLowerCase()
  
  // Exact match
  if (normalized1 === normalized2) return 1.0
  
  // Check aliases
  const allNames1 = [normalized1, ...aliases1.map(a => normalizeEntityName(a).toLowerCase())]
  const allNames2 = [normalized2, ...aliases2.map(a => normalizeEntityName(a).toLowerCase())]
  
  for (const n1 of allNames1) {
    for (const n2 of allNames2) {
      if (n1 === n2) return 0.95
    }
  }
  
  // Substring similarity
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const longer = normalized1.length > normalized2.length ? normalized1 : normalized2
    const shorter = normalized1.length > normalized2.length ? normalized2 : normalized1
    return shorter.length / longer.length * 0.8
  }
  
  // Jaccard similarity
  const words1 = new Set(normalized1.split(/\s+/))
  const words2 = new Set(normalized2.split(/\s+/))
  const intersection = new Set([...words1].filter(word => words2.has(word)))
  const union = new Set([...words1, ...words2])
  
  return union.size > 0 ? intersection.size / union.size * 0.6 : 0
}

/**
 * Store entities in database with normalization
 */
export async function storeEntities(
  entities: ExtractedEntity[],
  chunkId: number,
  userId: string
): Promise<{ stored: number, merged: number }> {
  const supabase = await createClient()
  let stored = 0
  let merged = 0
  
  console.log(`Storing ${entities.length} entities for chunk ${chunkId}`)
  
  try {
    for (const entity of entities) {
      const normalizedName = normalizeEntityName(entity.name)
      
      // Check for existing entities with similar names
      const { data: existingEntities } = await supabase
        .from('rag_entities')
        .select('id, canonical_name, aliases, metadata')
        .ilike('canonical_name', `%${normalizedName.split(' ')[0]}%`)
        .limit(10)
      
      let entityId: number | null = null
      let shouldMerge = false
      
      // Find best match among existing entities
      if (existingEntities && existingEntities.length > 0) {
        let bestMatch = null
        let bestSimilarity = 0
        
        for (const existing of existingEntities) {
          const similarity = calculateEntitySimilarity(
            normalizedName,
            existing.canonical_name,
            entity.aliases,
            existing.aliases || []
          )
          
          if (similarity > bestSimilarity && similarity >= 0.85) {
            bestMatch = existing
            bestSimilarity = similarity
          }
        }
        
        if (bestMatch && bestSimilarity >= 0.85) {
          entityId = bestMatch.id
          shouldMerge = true
          
          // Merge aliases if needed
          const existingAliases = bestMatch.aliases || []
          const newAliases = [...new Set([
            ...existingAliases,
            ...entity.aliases.filter(alias => 
              !existingAliases.some((existing: string) => 
                normalizeEntityName(existing).toLowerCase() === normalizeEntityName(alias).toLowerCase()
              )
            )
          ])]
          
          if (newAliases.length > existingAliases.length) {
            await supabase
              .from('rag_entities')
              .update({ 
                aliases: newAliases,
                metadata: {
                  ...bestMatch.metadata,
                  last_seen: new Date().toISOString(),
                  mention_count: (bestMatch.metadata?.mention_count as number || 0) + 1
                }
              })
              .eq('id', entityId)
          }
          
          merged++
        }
      }
      
      // Create new entity if no match found
      if (!entityId) {
        const { data: newEntity, error } = await supabase
          .from('rag_entities')
          .insert({
            canonical_name: normalizedName,
            type: entity.type,
            aliases: entity.aliases,
            metadata: {
              description: entity.description,
              confidence: entity.confidence,
              first_seen: new Date().toISOString(),
              mention_count: 1,
              source_chunk_id: chunkId
            }
          })
          .select('id')
          .single()
        
        if (error) {
          console.error('Failed to create entity:', error)
          continue
        }
        
        entityId = newEntity.id
        stored++
      }
      
      // Link entity to chunk
      if (entityId) {
        await supabase
          .from('rag_chunk_entities')
          .upsert({
            chunk_id: chunkId,
            entity_id: entityId,
            mention: entity.context.substring(0, 500), // Truncate long contexts
            confidence: entity.confidence
          }, {
            onConflict: 'chunk_id,entity_id'
          })
      }
    }
    
    console.log(`Entity storage complete: ${stored} new, ${merged} merged`)
    return { stored, merged }
    
  } catch (error) {
    console.error('Entity storage failed:', error)
    return { stored, merged }
  }
}

/**
 * Store relationships in database
 */
export async function storeRelations(
  relations: ExtractedRelation[],
  chunkId: number,
  userId: string
): Promise<number> {
  const supabase = await createClient()
  let stored = 0
  
  console.log(`Storing ${relations.length} relations for chunk ${chunkId}`)
  
  try {
    for (const relation of relations) {
      // Find entity IDs by name
      const headName = normalizeEntityName(relation.head_entity)
      const tailName = normalizeEntityName(relation.tail_entity)
      
      const { data: headEntities } = await supabase
        .from('rag_entities')
        .select('id')
        .or(`canonical_name.ilike.%${headName}%,aliases.cs.{${headName}}`)
        .limit(1)
      
      const { data: tailEntities } = await supabase
        .from('rag_entities')  
        .select('id')
        .or(`canonical_name.ilike.%${tailName}%,aliases.cs.{${tailName}}`)
        .limit(1)
      
      if (!headEntities?.[0] || !tailEntities?.[0]) {
        console.warn(`Entities not found for relation: ${headName} -> ${tailName}`)
        continue
      }
      
      // Store relation with deduplication
      const { error } = await supabase
        .from('rag_relations')
        .upsert({
          head_id: headEntities[0].id,
          relation: relation.relation,
          tail_id: tailEntities[0].id,
          evidence_chunk_id: chunkId,
          confidence: relation.confidence
        }, {
          onConflict: 'head_id,relation,tail_id'
        })
      
      if (error) {
        console.error('Failed to store relation:', error)
        continue
      }
      
      stored++
    }
    
    console.log(`Relations storage complete: ${stored} stored`)
    return stored
    
  } catch (error) {
    console.error('Relations storage failed:', error)
    return 0
  }
}

/**
 * Process a chunk for entity and relation extraction
 */
export async function processChunkForKG(
  chunk: RAGChunk,
  userId: string,
  config: EntityExtractionConfig = {}
): Promise<{
  entities: number,
  relations: number,
  success: boolean
}> {
  try {
    console.log(`Processing chunk ${chunk.id} for knowledge graph extraction`)
    
    // Extract entities and relations
    const extraction = await extractEntitiesFromText(
      chunk.content,
      {
        chunkId: chunk.id,
        docId: chunk.doc_id,
        userId
      },
      config
    )
    
    // Store entities
    const entityResult = await storeEntities(extraction.entities, chunk.id, userId)
    
    // Store relations  
    const relationCount = await storeRelations(extraction.relations, chunk.id, userId)
    
    return {
      entities: entityResult.stored + entityResult.merged,
      relations: relationCount,
      success: true
    }
    
  } catch (error) {
    console.error(`Knowledge graph processing failed for chunk ${chunk.id}:`, error)
    return {
      entities: 0,
      relations: 0,
      success: false
    }
  }
}

/**
 * Batch process multiple chunks for entity extraction
 */
export async function batchProcessChunksForKG(
  chunks: RAGChunk[],
  userId: string,
  config: EntityExtractionConfig = {}
): Promise<{
  totalEntities: number,
  totalRelations: number,
  processedChunks: number,
  failedChunks: number
}> {
  const settings = { ...DEFAULT_CONFIG, ...config }
  let totalEntities = 0
  let totalRelations = 0
  let processedChunks = 0
  let failedChunks = 0
  
  console.log(`Batch processing ${chunks.length} chunks for knowledge graph`)
  
  const batchSize = settings.enableBatching ? settings.batchSize : 1
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    const promises = batch.map(chunk => 
      processChunkForKG(chunk, userId, config)
    )
    
    const results = await Promise.allSettled(promises)
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        totalEntities += result.value.entities
        totalRelations += result.value.relations
        processedChunks++
      } else {
        failedChunks++
        console.error('Batch processing failed:', result.status === 'rejected' ? result.reason : 'Unknown error')
      }
    }
    
    // Add delay between batches to respect rate limits
    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  console.log(`Batch processing complete: ${processedChunks} processed, ${failedChunks} failed`)
  console.log(`Total extracted: ${totalEntities} entities, ${totalRelations} relations`)
  
  return {
    totalEntities,
    totalRelations,
    processedChunks,
    failedChunks
  }
}