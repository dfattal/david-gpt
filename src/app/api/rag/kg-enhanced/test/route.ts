// API route for testing KG-enhanced retrieval
// GET /api/rag/kg-enhanced/test - Test KG-enhanced retrieval system

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { performKGEnhancedRetrieval, recognizeQueryEntities } from '@/lib/rag/kg-enhanced-retrieval'
import { buildRAGContext } from '@/lib/rag/context'

const TEST_QUERIES = [
  'What products has OpenAI developed?',
  'Tell me about Microsoft partnerships',
  'How does ChatGPT compare to other AI models?',
  'What technology does Anthropic use?',
  'Who leads the AI research at Google?'
]

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
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

    const { searchParams } = new URL(request.url)
    const testQuery = searchParams.get('q') || TEST_QUERIES[0]
    const mode = searchParams.get('mode') || 'enhanced'

    console.log(`Testing KG-enhanced retrieval with query: "${testQuery}"`)

    const results: Record<string, any> = {
      query: testQuery,
      mode,
      timestamp: new Date().toISOString()
    }

    // Test 1: Entity Recognition
    console.log('Test 1: Query Entity Recognition')
    const entityRecognitionStart = Date.now()
    
    try {
      const entityRecognition = await recognizeQueryEntities(testQuery, user.id)
      
      results.entity_recognition = {
        success: true,
        time_ms: Date.now() - entityRecognitionStart,
        entities_found: entityRecognition.entities.length,
        intent: entityRecognition.intent,
        expansion_keywords: entityRecognition.expansion_keywords,
        entities: entityRecognition.entities.map(e => ({
          name: e.name,
          type: e.type,
          confidence: e.confidence,
          context: e.context
        }))
      }
      
      console.log(`✓ Entity recognition: ${entityRecognition.entities.length} entities, intent: ${entityRecognition.intent}`)
      
    } catch (error) {
      results.entity_recognition = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - entityRecognitionStart
      }
      console.error('✗ Entity recognition failed:', error)
    }

    // Test 2: KG-Enhanced Retrieval (if mode is enhanced)
    if (mode === 'enhanced') {
      console.log('Test 2: KG-Enhanced Retrieval')
      const kgRetrievalStart = Date.now()
      
      try {
        const kgRetrieval = await performKGEnhancedRetrieval(testQuery, user.id, {
          maxChunks: 5,
          kgOptions: {
            maxEntityExpansions: 8,
            maxRelationDepth: 2,
            entityBoostFactor: 1.5,
            relationConfidenceThreshold: 0.6
          }
        })
        
        results.kg_enhanced_retrieval = {
          success: true,
          time_ms: Date.now() - kgRetrievalStart,
          recognized_entities: kgRetrieval.kgContext.recognizedEntities.length,
          related_entities: kgRetrieval.kgContext.relatedEntities.length,
          expansion_terms: kgRetrieval.kgContext.expansionTerms.length,
          graph_paths: kgRetrieval.kgContext.graphTraversalPaths.length,
          search_results: kgRetrieval.searchResults.results.length,
          combined_score: kgRetrieval.combinedScore,
          enhanced_query: kgRetrieval.enhancedQuery,
          kg_context: {
            recognized_entities: kgRetrieval.kgContext.recognizedEntities.map(e => ({
              name: e.entity.canonical_name,
              type: e.entity.type,
              confidence: e.confidence
            })),
            related_entities: kgRetrieval.kgContext.relatedEntities.slice(0, 5).map(e => ({
              name: e.entity.canonical_name,
              type: e.entity.type,
              relation: e.relation.relation,
              relevance_score: e.relevanceScore
            })),
            expansion_terms: kgRetrieval.kgContext.expansionTerms.slice(0, 10),
            top_results: kgRetrieval.searchResults.results.slice(0, 3).map((r: any) => ({
              similarity: r.similarity,
              bm25_score: r.bm25Score,
              rrfScore: r.rrfScore,
              content_preview: r.chunk.content.substring(0, 200) + '...'
            }))
          }
        }
        
        console.log(`✓ KG-enhanced retrieval: ${kgRetrieval.kgContext.recognizedEntities.length} entities, ${kgRetrieval.searchResults.results.length} results`)
        
      } catch (error) {
        results.kg_enhanced_retrieval = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          time_ms: Date.now() - kgRetrievalStart
        }
        console.error('✗ KG-enhanced retrieval failed:', error)
      }
    }

    // Test 3: Full RAG Context Building
    console.log('Test 3: Full RAG Context Building')
    const ragContextStart = Date.now()
    
    try {
      const ragContext = await buildRAGContext(testQuery, user.id, {
        maxChunks: 5,
        useKGEnhancedRetrieval: mode === 'enhanced',
        useKnowledgeGraph: true,
        useHybridSearch: true
      })
      
      results.rag_context = {
        success: true,
        time_ms: Date.now() - ragContextStart,
        has_relevant_content: ragContext.hasRelevantContent,
        chunks_found: ragContext.chunks.length,
        query_type: ragContext.stats.queryType,
        avg_similarity: ragContext.stats.averageSimilarity,
        entities_used: ragContext.stats.entitiesUsed || 0,
        kg_expansions: ragContext.stats.kgExpansions || 0,
        sources: ragContext.stats.sources,
        context_preview: ragContext.contextPrompt.substring(0, 500) + '...',
        kg_enhanced_context: ragContext.kgEnhancedContext ? {
          recognized_entities: ragContext.kgEnhancedContext.recognizedEntities,
          related_entities: ragContext.kgEnhancedContext.relatedEntities.slice(0, 3),
          expansion_terms: ragContext.kgEnhancedContext.expansionTerms.slice(0, 5),
          combined_score: ragContext.kgEnhancedContext.combinedRelevanceScore
        } : null
      }
      
      console.log(`✓ RAG context: ${ragContext.chunks.length} chunks, query type: ${ragContext.stats.queryType}`)
      
    } catch (error) {
      results.rag_context = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - ragContextStart
      }
      console.error('✗ RAG context building failed:', error)
    }

    // Test comparison between modes (if baseline mode)
    if (mode === 'baseline') {
      console.log('Test 4: Enhanced Mode Comparison')
      const comparisonStart = Date.now()
      
      try {
        const enhancedContext = await buildRAGContext(testQuery, user.id, {
          maxChunks: 5,
          useKGEnhancedRetrieval: true,
          useKnowledgeGraph: true,
          useHybridSearch: true
        })
        
        const baselineContext = await buildRAGContext(testQuery, user.id, {
          maxChunks: 5,
          useKGEnhancedRetrieval: false,
          useKnowledgeGraph: false,
          useHybridSearch: true
        })
        
        results.mode_comparison = {
          success: true,
          time_ms: Date.now() - comparisonStart,
          enhanced: {
            chunks: enhancedContext.chunks.length,
            avg_similarity: enhancedContext.stats.averageSimilarity,
            query_type: enhancedContext.stats.queryType,
            entities_used: enhancedContext.stats.entitiesUsed || 0,
            kg_expansions: enhancedContext.stats.kgExpansions || 0
          },
          baseline: {
            chunks: baselineContext.chunks.length,
            avg_similarity: baselineContext.stats.averageSimilarity,
            query_type: baselineContext.stats.queryType,
            entities_used: baselineContext.stats.entitiesUsed || 0,
            kg_expansions: baselineContext.stats.kgExpansions || 0
          },
          improvement: {
            similarity_boost: enhancedContext.stats.averageSimilarity - baselineContext.stats.averageSimilarity,
            entity_boost: (enhancedContext.stats.entitiesUsed || 0) - (baselineContext.stats.entitiesUsed || 0),
            expansion_benefit: enhancedContext.stats.kgExpansions || 0
          }
        }
        
        console.log(`✓ Mode comparison complete`)
        
      } catch (error) {
        results.mode_comparison = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          time_ms: Date.now() - comparisonStart
        }
        console.error('✗ Mode comparison failed:', error)
      }
    }

    // Generate test summary
    const successfulTests = Object.values(results)
      .filter(test => typeof test === 'object' && test?.success === true).length
    const totalTests = Object.keys(results).length - 3 // Exclude query, mode, timestamp
    
    const summary = {
      tests_passed: successfulTests,
      tests_total: totalTests,
      success_rate: totalTests > 0 ? (successfulTests / totalTests * 100).toFixed(1) + '%' : '0%',
      overall_time_ms: Date.now() - startTime,
      mode: mode,
      query: testQuery
    }

    console.log(`KG-enhanced retrieval test complete: ${successfulTests}/${totalTests} tests passed`)

    return Response.json({
      success: successfulTests === totalTests,
      summary,
      results,
      recommendations: generateTestRecommendations(results)
    })

  } catch (error) {
    console.error('KG-enhanced retrieval test failed:', error)
    
    return Response.json(
      {
        success: false,
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        summary: {
          tests_passed: 0,
          tests_total: 0,
          success_rate: '0%',
          overall_time_ms: Date.now() - startTime
        }
      },
      { status: 500 }
    )
  }
}

function generateTestRecommendations(results: Record<string, any>): string[] {
  const recommendations: string[] = []

  // Entity recognition recommendations
  if (results.entity_recognition?.success) {
    if (results.entity_recognition.entities_found === 0) {
      recommendations.push('No entities recognized - consider adding more domain-specific entities to knowledge graph')
    } else if (results.entity_recognition.entities_found > 10) {
      recommendations.push('Many entities recognized - consider raising confidence threshold')
    }
  }

  // Performance recommendations
  const performanceTests = ['entity_recognition', 'kg_enhanced_retrieval', 'rag_context']
  const slowTests = performanceTests.filter(testName => 
    results[testName]?.success && results[testName]?.time_ms > 3000
  )
  
  if (slowTests.length > 0) {
    recommendations.push(`Performance concern: ${slowTests.join(', ')} taking >3s`)
  }

  // Retrieval quality recommendations
  if (results.kg_enhanced_retrieval?.success) {
    const combinedScore = results.kg_enhanced_retrieval.combined_score
    if (combinedScore < 0.5) {
      recommendations.push('Low combined relevance score - consider tuning entity expansion or search weights')
    }
    
    if (results.kg_enhanced_retrieval.expansion_terms === 0) {
      recommendations.push('No query expansion occurring - check knowledge graph coverage')
    }
  }

  // Context building recommendations
  if (results.rag_context?.success) {
    if (!results.rag_context.has_relevant_content) {
      recommendations.push('No relevant content found - consider expanding document coverage')
    } else if (results.rag_context.chunks_found < 3) {
      recommendations.push('Few chunks found - consider lowering similarity threshold or expanding search')
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