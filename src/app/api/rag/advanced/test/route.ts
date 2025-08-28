// API route for testing advanced retrieval techniques
// GET /api/rag/advanced/test - Test advanced retrieval with query rewriting, HyDE, and reranking

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  performAdvancedRetrieval, 
  performFastAdvancedRetrieval,
  generateQueryRewrites,
  generateHyDEDocuments,
  rerankResults
} from '@/lib/rag/advanced-retrieval'
import { buildRAGContext } from '@/lib/rag/context'

const TEST_QUERIES = [
  'What are the latest AI developments from OpenAI?',
  'How does machine learning differ from deep learning?',
  'What partnerships has Microsoft formed with AI companies?',
  'Compare different natural language processing approaches',
  'What are the benefits and risks of artificial intelligence?'
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
    const mode = searchParams.get('mode') || 'comprehensive' // comprehensive | fast | components
    const testComponents = searchParams.get('components')?.split(',') || ['rewriting', 'hyde', 'reranking']

    console.log(`Testing advanced retrieval: "${testQuery}" (mode: ${mode})`)

    const results: Record<string, unknown> = {
      query: testQuery,
      mode,
      components_tested: testComponents,
      timestamp: new Date().toISOString()
    }

    // Test 1: Query Rewriting
    if (testComponents.includes('rewriting')) {
      console.log('Test 1: Query Rewriting')
      const rewritingStart = Date.now()
      
      try {
        const queryRewrites = await generateQueryRewrites(testQuery, {
          maxRewrites: 3
        })
        
        results.query_rewriting = {
          success: true,
          time_ms: Date.now() - rewritingStart,
          original_intent: queryRewrites.original_intent,
          rewrites_generated: queryRewrites.rewritten_queries.length,
          semantic_expansions: queryRewrites.semantic_expansions.length,
          question_types: queryRewrites.question_types,
          rewritten_queries: queryRewrites.rewritten_queries.map(rq => ({
            query: rq.query,
            focus: rq.focus,
            reasoning: rq.reasoning
          })),
          semantic_expansions_list: queryRewrites.semantic_expansions.slice(0, 5)
        }
        
        console.log(`✓ Query rewriting: ${queryRewrites.rewritten_queries.length} rewrites generated`)
        
      } catch (error) {
        results.query_rewriting = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          time_ms: Date.now() - rewritingStart
        }
        console.error('✗ Query rewriting failed:', error)
      }
    }

    // Test 2: HyDE Generation
    if (testComponents.includes('hyde')) {
      console.log('Test 2: HyDE Generation')
      const hydeStart = Date.now()
      
      try {
        const hydeGeneration = await generateHyDEDocuments(testQuery, {
          maxDocuments: 3
        })
        
        results.hyde_generation = {
          success: true,
          time_ms: Date.now() - hydeStart,
          documents_generated: hydeGeneration.hypothetical_documents.length,
          key_concepts: hydeGeneration.key_concepts.length,
          hypothetical_documents: hydeGeneration.hypothetical_documents.map(doc => ({
            type: doc.document_type,
            confidence: doc.confidence,
            content_preview: doc.content.substring(0, 200) + '...'
          })),
          key_concepts_list: hydeGeneration.key_concepts.slice(0, 8)
        }
        
        console.log(`✓ HyDE generation: ${hydeGeneration.hypothetical_documents.length} documents generated`)
        
      } catch (error) {
        results.hyde_generation = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          time_ms: Date.now() - hydeStart
        }
        console.error('✗ HyDE generation failed:', error)
      }
    }

    // Test 3: Full Advanced Retrieval (if mode is comprehensive or fast)
    if (mode === 'comprehensive' || mode === 'fast') {
      console.log(`Test 3: Full Advanced Retrieval (${mode})`)
      const fullRetrievalStart = Date.now()
      
      try {
        const advancedResult = mode === 'fast'
          ? await performFastAdvancedRetrieval(testQuery, user.id, {
              useQueryRewriting: testComponents.includes('rewriting'),
              useHyDE: testComponents.includes('hyde'),
              useReranking: testComponents.includes('reranking')
            })
          : await performAdvancedRetrieval(testQuery, user.id, {
              useQueryRewriting: testComponents.includes('rewriting'),
              useHyDE: testComponents.includes('hyde'),
              useReranking: testComponents.includes('reranking'),
              maxCandidates: 15,
              finalResultCount: 5
            })
        
        results.full_advanced_retrieval = {
          success: true,
          time_ms: Date.now() - fullRetrievalStart,
          candidates_found: advancedResult.retrievalStats.candidatesFound,
          final_results: advancedResult.retrievalStats.finalResultsCount,
          rewritten_queries_used: advancedResult.rewrittenQueries?.length || 0,
          hyde_documents_used: advancedResult.hydeDocuments?.length || 0,
          performance_breakdown: {
            query_rewriting: advancedResult.retrievalStats.queryRewritingTimeMs,
            hyde_generation: advancedResult.retrievalStats.hydeGenerationTimeMs,
            search: advancedResult.retrievalStats.searchTimeMs,
            reranking: advancedResult.retrievalStats.rerankingTimeMs,
            total: advancedResult.retrievalStats.totalTimeMs
          },
          top_results: advancedResult.finalResults.slice(0, 3).map(result => ({
            similarity: result.similarity,
            rerank_score: result.rerankScore,
            final_score: result.finalScore,
            source: result.source,
            content_preview: result.chunk.content.substring(0, 150) + '...'
          }))
        }
        
        console.log(`✓ Full advanced retrieval: ${advancedResult.finalResults.length} results in ${advancedResult.retrievalStats.totalTimeMs.toFixed(2)}ms`)
        
      } catch (error) {
        results.full_advanced_retrieval = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          time_ms: Date.now() - fullRetrievalStart
        }
        console.error('✗ Full advanced retrieval failed:', error)
      }
    }

    // Test 4: RAG Context Building with Advanced Retrieval
    console.log('Test 4: RAG Context with Advanced Retrieval')
    const ragContextStart = Date.now()
    
    try {
      // Test both regular and advanced retrieval modes
      const regularContext = await buildRAGContext(testQuery, user.id, {
        maxChunks: 5,
        useAdvancedRetrieval: false,
        useKGEnhancedRetrieval: false,
        useHybridSearch: true
      })

      const advancedContext = await buildRAGContext(testQuery, user.id, {
        maxChunks: 5,
        useAdvancedRetrieval: true,
        useQueryRewriting: testComponents.includes('rewriting'),
        useHyDE: testComponents.includes('hyde'),
        useReranking: testComponents.includes('reranking'),
        performanceMode: mode === 'fast' ? 'fast' : 'comprehensive'
      })
      
      results.rag_context_comparison = {
        success: true,
        time_ms: Date.now() - ragContextStart,
        regular_context: {
          chunks_found: regularContext.chunks.length,
          query_type: regularContext.stats.queryType,
          avg_similarity: regularContext.stats.averageSimilarity,
          retrieval_time: regularContext.stats.retrievalTimeMs,
          has_content: regularContext.hasRelevantContent
        },
        advanced_context: {
          chunks_found: advancedContext.chunks.length,
          query_type: advancedContext.stats.queryType,
          avg_similarity: advancedContext.stats.averageSimilarity,
          retrieval_time: advancedContext.stats.retrievalTimeMs,
          has_content: advancedContext.hasRelevantContent,
          advanced_info: advancedContext.advancedRetrievalContext ? {
            rewrites_used: advancedContext.advancedRetrievalContext.rewrittenQueries.length,
            hyde_docs: advancedContext.advancedRetrievalContext.hydeDocuments.length,
            candidates_evaluated: advancedContext.advancedRetrievalContext.candidatesFound,
            reranking_used: advancedContext.advancedRetrievalContext.rerankingUsed
          } : null
        },
        improvement_metrics: {
          similarity_improvement: advancedContext.stats.averageSimilarity - regularContext.stats.averageSimilarity,
          chunk_count_difference: advancedContext.chunks.length - regularContext.chunks.length,
          time_overhead: advancedContext.stats.retrievalTimeMs - regularContext.stats.retrievalTimeMs
        }
      }
      
      console.log(`✓ RAG context comparison: Advanced vs Regular retrieval`)
      
    } catch (error) {
      results.rag_context_comparison = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        time_ms: Date.now() - ragContextStart
      }
      console.error('✗ RAG context comparison failed:', error)
    }

    // Performance Analysis
    const performanceAnalysis = generatePerformanceAnalysis(results)
    results.performance_analysis = performanceAnalysis

    // Generate test summary
    const successfulTests = Object.values(results)
      .filter(test => typeof test === 'object' && test !== null && (test as any)?.success === true).length
    const totalTests = Object.keys(results).length - 4 // Exclude metadata fields
    
    const summary = {
      tests_passed: successfulTests,
      tests_total: totalTests,
      success_rate: totalTests > 0 ? (successfulTests / totalTests * 100).toFixed(1) + '%' : '0%',
      overall_time_ms: Date.now() - startTime,
      mode: mode,
      components_tested: testComponents,
      query: testQuery,
      performance_target_met: performanceAnalysis.sub_1s_target_met
    }

    console.log(`Advanced retrieval test complete: ${successfulTests}/${totalTests} tests passed`)

    return Response.json({
      success: successfulTests === totalTests,
      summary,
      results,
      recommendations: generateAdvancedRetrievalRecommendations(results)
    })

  } catch (error) {
    console.error('Advanced retrieval test failed:', error)
    
    return Response.json(
      {
        success: false,
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        summary: {
          tests_passed: 0,
          tests_total: 0,
          success_rate: '0%',
          overall_time_ms: Date.now() - startTime,
          performance_target_met: false
        }
      },
      { status: 500 }
    )
  }
}

function generatePerformanceAnalysis(results: Record<string, unknown>): {
  sub_1s_target_met: boolean
  bottleneck_analysis: string[]
  optimization_suggestions: string[]
  performance_breakdown: Record<string, number>
} {
  const analysis = {
    sub_1s_target_met: false,
    bottleneck_analysis: [] as string[],
    optimization_suggestions: [] as string[],
    performance_breakdown: {} as Record<string, number>
  }

  // Analyze advanced retrieval performance
  if ((results.full_advanced_retrieval as any)?.success) {
    const perf = (results.full_advanced_retrieval as any).performance_breakdown
    analysis.performance_breakdown = perf
    
    const totalTime = perf.total
    analysis.sub_1s_target_met = totalTime < 1000

    // Identify bottlenecks
    if (perf.query_rewriting > 300) {
      analysis.bottleneck_analysis.push('Query rewriting taking >300ms')
      analysis.optimization_suggestions.push('Consider reducing number of query rewrites or using faster model')
    }

    if (perf.hyde_generation > 500) {
      analysis.bottleneck_analysis.push('HyDE generation taking >500ms')
      analysis.optimization_suggestions.push('Reduce number of hypothetical documents or optimize prompts')
    }

    if (perf.reranking > 400) {
      analysis.bottleneck_analysis.push('Reranking taking >400ms')
      analysis.optimization_suggestions.push('Use gpt-4o-mini for reranking or reduce candidate count')
    }

    if (perf.search > 200) {
      analysis.bottleneck_analysis.push('Search phase taking >200ms')
      analysis.optimization_suggestions.push('Optimize vector search or reduce search scope')
    }
  }

  // RAG context performance analysis
  if ((results.rag_context_comparison as any)?.success) {
    const timeOverhead = (results.rag_context_comparison as any).improvement_metrics.time_overhead
    if (timeOverhead > 800) {
      analysis.bottleneck_analysis.push(`High time overhead: +${timeOverhead.toFixed(0)}ms`)
      analysis.optimization_suggestions.push('Consider using fast mode for real-time applications')
    }
  }

  return analysis
}

function generateAdvancedRetrievalRecommendations(results: Record<string, unknown>): string[] {
  const recommendations: string[] = []

  // Query rewriting recommendations
  if ((results.query_rewriting as any)?.success) {
    if ((results.query_rewriting as any).rewrites_generated === 0) {
      recommendations.push('No query rewrites generated - check prompt effectiveness')
    } else if ((results.query_rewriting as any).time_ms > 300) {
      recommendations.push('Query rewriting slow - consider using faster model or fewer rewrites')
    }
  }

  // HyDE recommendations
  if ((results.hyde_generation as any)?.success) {
    if ((results.hyde_generation as any).documents_generated === 0) {
      recommendations.push('No HyDE documents generated - check generation prompts')
    } else if ((results.hyde_generation as any).time_ms > 500) {
      recommendations.push('HyDE generation slow - reduce document count or optimize prompts')
    }
  }

  // Performance recommendations
  if ((results.full_advanced_retrieval as any)?.success) {
    const totalTime = (results.full_advanced_retrieval as any).performance_breakdown.total
    if (totalTime > 1000) {
      recommendations.push(`Performance target missed: ${totalTime.toFixed(0)}ms > 1000ms - use fast mode`)
    } else if (totalTime < 500) {
      recommendations.push('Excellent performance - consider enabling more advanced features')
    }

    const finalResults = (results.full_advanced_retrieval as any).final_results
    if (finalResults < 3) {
      recommendations.push('Few results returned - consider lowering similarity thresholds')
    }
  }

  // Quality recommendations
  if ((results.rag_context_comparison as any)?.success) {
    const improvement = (results.rag_context_comparison as any).improvement_metrics.similarity_improvement
    if (improvement < 0.05) {
      recommendations.push('Low quality improvement - verify advanced techniques are adding value')
    } else if (improvement > 0.15) {
      recommendations.push('Significant quality improvement detected - advanced retrieval is effective')
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