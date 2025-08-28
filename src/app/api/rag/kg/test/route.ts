// API route for testing knowledge graph functionality
// GET /api/rag/kg/test - Comprehensive KG system test

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractEntitiesFromText, normalizeEntityName, calculateEntitySimilarity } from '@/lib/rag/entity-extraction'
import { buildKnowledgeGraphForDocument, getKnowledgeGraphStats, searchEntities } from '@/lib/rag/knowledge-graph'

// Test data for entity extraction
const TEST_TEXT = `
OpenAI has developed ChatGPT, a revolutionary AI chatbot powered by GPT-4. The company was founded by Sam Altman and Elon Musk in 2015. 
ChatGPT was launched in November 2022 and quickly became popular among developers and businesses.

Microsoft partnered with OpenAI and invested $10 billion in the company. The partnership allows Microsoft to integrate OpenAI's technology 
into Azure cloud services and Office 365 products. Google, a competitor of Microsoft, developed Bard AI as a response to ChatGPT's success.

The AI industry has seen rapid growth, with companies like Anthropic developing Claude AI and Meta releasing LLaMA models.
These developments have led to increased interest in generative AI and large language models.
`

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const results: any = {}
  
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

    console.log('Starting comprehensive KG system test')

    // Test 1: Entity Extraction
    console.log('Test 1: Entity Extraction')
    const extractionStart = Date.now()
    
    try {
      const extraction = await extractEntitiesFromText(TEST_TEXT, {
        userId: user.id,
        docId: 'test-doc',
        chunkId: 999999
      })
      
      results.entity_extraction = {
        success: true,
        time_ms: Date.now() - extractionStart,
        entities_found: extraction.entities.length,
        relations_found: extraction.relations.length,
        summary: extraction.summary,
        sample_entities: extraction.entities.slice(0, 5).map(e => ({
          name: e.name,
          type: e.type,
          confidence: e.confidence,
          aliases: e.aliases
        })),
        sample_relations: extraction.relations.slice(0, 3).map(r => ({
          head: r.head_entity,
          relation: r.relation,
          tail: r.tail_entity,
          confidence: r.confidence
        }))
      }
      
      console.log(`✓ Entity extraction: ${extraction.entities.length} entities, ${extraction.relations.length} relations`)
      
    } catch (error) {
      results.entity_extraction = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - extractionStart
      }
      console.error('✗ Entity extraction failed:', error)
    }

    // Test 2: Entity Normalization
    console.log('Test 2: Entity Normalization')
    const normalizationStart = Date.now()
    
    try {
      const testNames = [
        'OpenAI Inc.',
        'openai',
        'Open AI',
        'ChatGPT',
        'chat-gpt',
        'Microsoft Corporation',
        'MSFT'
      ]
      
      const normalized = testNames.map(name => ({
        original: name,
        normalized: normalizeEntityName(name)
      }))
      
      const similarities = [
        { 
          pair: ['OpenAI Inc.', 'openai'],
          similarity: calculateEntitySimilarity('OpenAI Inc.', 'openai')
        },
        {
          pair: ['ChatGPT', 'chat-gpt'], 
          similarity: calculateEntitySimilarity('ChatGPT', 'chat-gpt')
        },
        {
          pair: ['Microsoft Corporation', 'MSFT'],
          similarity: calculateEntitySimilarity('Microsoft Corporation', 'MSFT', [], ['Microsoft Corp', 'MSFT'])
        }
      ]
      
      results.entity_normalization = {
        success: true,
        time_ms: Date.now() - normalizationStart,
        normalized_names: normalized,
        similarity_tests: similarities
      }
      
      console.log('✓ Entity normalization working')
      
    } catch (error) {
      results.entity_normalization = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - normalizationStart
      }
      console.error('✗ Entity normalization failed:', error)
    }

    // Test 3: Knowledge Graph Stats
    console.log('Test 3: Knowledge Graph Stats')
    const statsStart = Date.now()
    
    try {
      const stats = await getKnowledgeGraphStats(user.id)
      
      results.kg_stats = {
        success: true,
        time_ms: Date.now() - statsStart,
        stats: {
          total_entities: stats.totalEntities,
          total_relations: stats.totalRelations,
          entity_types: stats.entityTypes,
          relation_types: stats.relationTypes,
          top_entities: stats.topEntities.slice(0, 5)
        }
      }
      
      console.log(`✓ KG stats: ${stats.totalEntities} entities, ${stats.totalRelations} relations`)
      
    } catch (error) {
      results.kg_stats = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - statsStart
      }
      console.error('✗ KG stats failed:', error)
    }

    // Test 4: Entity Search
    console.log('Test 4: Entity Search')
    const searchStart = Date.now()
    
    try {
      const searchQueries = ['OpenAI', 'AI', 'technology']
      const searchResults: any = {}
      
      for (const query of searchQueries) {
        const entitiesResult = await searchEntities(query, user.id, {
          limit: 5
        })
        
        searchResults[query] = {
          found: entitiesResult.entities.length,
          entities: entitiesResult.entities.map(e => ({
            name: e.canonical_name,
            type: e.type,
            mentions: (e.metadata as any)?.mention_count || 1
          }))
        }
      }
      
      results.entity_search = {
        success: true,
        time_ms: Date.now() - searchStart,
        search_results: searchResults
      }
      
      console.log('✓ Entity search working')
      
    } catch (error) {
      results.entity_search = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - searchStart
      }
      console.error('✗ Entity search failed:', error)
    }

    // Test 5: Database Schema Validation
    console.log('Test 5: Database Schema Validation')
    const schemaStart = Date.now()
    
    try {
      // Check if KG tables exist and have correct structure
      const { data: entitiesTable, error: entitiesError } = await supabase
        .from('rag_entities')
        .select('id')
        .limit(1)
      
      const { data: relationsTable, error: relationsError } = await supabase
        .from('rag_relations')
        .select('id')
        .limit(1)
      
      const { data: chunkEntitiesTable, error: chunkEntitiesError } = await supabase
        .from('rag_chunk_entities')
        .select('chunk_id')
        .limit(1)
      
      results.database_schema = {
        success: !entitiesError && !relationsError && !chunkEntitiesError,
        time_ms: Date.now() - schemaStart,
        tables: {
          rag_entities: !entitiesError,
          rag_relations: !relationsError,
          rag_chunk_entities: !chunkEntitiesError
        },
        errors: [entitiesError, relationsError, chunkEntitiesError]
          .filter(Boolean)
          .map(e => e?.message || 'Unknown error')
      }
      
      if (results.database_schema.success) {
        console.log('✓ Database schema valid')
      } else {
        console.log('✗ Database schema issues found')
      }
      
    } catch (error) {
      results.database_schema = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - schemaStart
      }
      console.error('✗ Database schema validation failed:', error)
    }

    // Overall test summary
    const successfulTests = Object.values(results).filter((test: any) => test.success).length
    const totalTests = Object.keys(results).length
    const totalTime = Date.now() - startTime
    
    console.log(`KG system test complete: ${successfulTests}/${totalTests} tests passed in ${totalTime}ms`)

    return Response.json({
      success: successfulTests === totalTests,
      summary: {
        tests_passed: successfulTests,
        tests_total: totalTests,
        overall_time_ms: totalTime,
        user_id: user.id
      },
      test_results: results,
      recommendations: generateRecommendations(results)
    })

  } catch (error) {
    console.error('KG system test failed:', error)
    
    return Response.json(
      { 
        success: false,
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        test_results: results,
        summary: {
          tests_passed: 0,
          tests_total: 0,
          overall_time_ms: Date.now() - startTime
        }
      },
      { status: 500 }
    )
  }
}

function generateRecommendations(results: any): string[] {
  const recommendations: string[] = []
  
  // Entity extraction recommendations
  if (results.entity_extraction?.success) {
    const entityCount = results.entity_extraction.entities_found
    if (entityCount < 5) {
      recommendations.push('Consider lowering confidence threshold to extract more entities')
    } else if (entityCount > 15) {
      recommendations.push('Consider raising confidence threshold to reduce noise in entity extraction')
    }
  }
  
  // Performance recommendations
  const slowTests = Object.entries(results).filter(([_, test]: [string, any]) => 
    test.success && test.time_ms > 5000
  )
  
  if (slowTests.length > 0) {
    recommendations.push(`Performance: ${slowTests.map(([name]) => name).join(', ')} taking >5s`)
  }
  
  // Data recommendations
  if (results.kg_stats?.success) {
    const entityCount = results.kg_stats.stats.total_entities
    if (entityCount === 0) {
      recommendations.push('No entities found - upload and process documents to build knowledge graph')
    } else if (entityCount < 10) {
      recommendations.push('Low entity count - process more documents to improve knowledge graph coverage')
    }
  }
  
  return recommendations
}

export async function POST() {
  return Response.json(
    { error: 'Method not allowed. Use GET to run tests.' },
    { status: 405 }
  )
}