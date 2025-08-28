// Production-ready query optimization for RAG operations
// Implements query analysis, optimization, and performance monitoring

import { createClient } from '@/lib/supabase/server'
import { CacheManager, CacheKeys } from './caching'

export interface QueryPerformanceMetrics {
  queryTime: number
  cacheHit: boolean
  resultCount: number
  optimizationApplied: string[]
  bottlenecks: string[]
}

export interface OptimizationStrategy {
  name: string
  condition: (query: any) => boolean
  optimize: (query: any) => any
  priority: number
}

export class QueryOptimizer {
  private strategies: OptimizationStrategy[] = []
  private metrics: Map<string, QueryPerformanceMetrics[]> = new Map()

  constructor() {
    this.registerDefaultStrategies()
  }

  private registerDefaultStrategies() {
    // Pagination optimization
    this.addStrategy({
      name: 'limit_pagination',
      condition: (query) => !query.limit || query.limit > 100,
      optimize: (query) => ({ ...query, limit: Math.min(query.limit || 20, 100) }),
      priority: 1
    })

    // Vector search optimization
    this.addStrategy({
      name: 'vector_search_limit',
      condition: (query) => query.type === 'vector' && (!query.vectorLimit || query.vectorLimit > 50),
      optimize: (query) => ({ ...query, vectorLimit: Math.min(query.vectorLimit || 20, 50) }),
      priority: 2
    })

    // Text search optimization
    this.addStrategy({
      name: 'text_search_optimization',
      condition: (query) => query.type === 'text' && query.query.length < 3,
      optimize: (query) => ({ ...query, useFulltext: false, useFuzzy: true }),
      priority: 1
    })

    // Hybrid search balance
    this.addStrategy({
      name: 'hybrid_balance',
      condition: (query) => query.type === 'hybrid' && !query.balance,
      optimize: (query) => ({ ...query, balance: 0.7 }), // Favor vector search slightly
      priority: 1
    })

    // Date range optimization
    this.addStrategy({
      name: 'date_range_index',
      condition: (query) => query.dateRange && !query.sortBy,
      optimize: (query) => ({ ...query, sortBy: 'doc_date' }),
      priority: 1
    })
  }

  addStrategy(strategy: OptimizationStrategy) {
    this.strategies.push(strategy)
    this.strategies.sort((a, b) => b.priority - a.priority)
  }

  async optimizeQuery(originalQuery: any): Promise<{
    optimizedQuery: any
    appliedOptimizations: string[]
    estimatedImprovement: number
  }> {
    let optimizedQuery = { ...originalQuery }
    const appliedOptimizations: string[] = []

    for (const strategy of this.strategies) {
      if (strategy.condition(optimizedQuery)) {
        optimizedQuery = strategy.optimize(optimizedQuery)
        appliedOptimizations.push(strategy.name)
      }
    }

    const estimatedImprovement = this.estimateImprovement(appliedOptimizations)

    return {
      optimizedQuery,
      appliedOptimizations,
      estimatedImprovement
    }
  }

  private estimateImprovement(optimizations: string[]): number {
    const improvements: Record<string, number> = {
      limit_pagination: 0.3,
      vector_search_limit: 0.4,
      text_search_optimization: 0.2,
      hybrid_balance: 0.15,
      date_range_index: 0.25
    }

    return optimizations.reduce((total, opt) => total + (improvements[opt] || 0), 0)
  }

  recordMetrics(queryType: string, metrics: QueryPerformanceMetrics) {
    if (!this.metrics.has(queryType)) {
      this.metrics.set(queryType, [])
    }

    const queryMetrics = this.metrics.get(queryType)!
    queryMetrics.push(metrics)

    // Keep only last 100 metrics per query type
    if (queryMetrics.length > 100) {
      queryMetrics.shift()
    }
  }

  getPerformanceStats(queryType?: string) {
    if (queryType) {
      const metrics = this.metrics.get(queryType) || []
      return this.calculateStats(metrics)
    }

    const allStats: Record<string, any> = {}
    for (const [type, metrics] of this.metrics) {
      allStats[type] = this.calculateStats(metrics)
    }
    return allStats
  }

  private calculateStats(metrics: QueryPerformanceMetrics[]) {
    if (metrics.length === 0) {
      return { count: 0, avgTime: 0, cacheHitRate: 0, commonBottlenecks: [] }
    }

    const totalTime = metrics.reduce((sum, m) => sum + m.queryTime, 0)
    const cacheHits = metrics.filter(m => m.cacheHit).length
    const bottlenecks = metrics.flatMap(m => m.bottlenecks)
    const bottleneckCounts = bottlenecks.reduce((acc, b) => {
      acc[b] = (acc[b] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const commonBottlenecks = Object.entries(bottleneckCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([bottleneck, count]) => ({ bottleneck, count }))

    return {
      count: metrics.length,
      avgTime: Math.round(totalTime / metrics.length),
      cacheHitRate: Math.round((cacheHits / metrics.length) * 100) / 100,
      commonBottlenecks,
      p95Time: this.calculatePercentile(metrics.map(m => m.queryTime), 0.95),
      p99Time: this.calculatePercentile(metrics.map(m => m.queryTime), 0.99)
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * percentile) - 1
    return sorted[index] || 0
  }
}

// Optimized database query builder
export class OptimizedQueryBuilder {
  private supabase: any
  private optimizer: QueryOptimizer

  constructor() {
    this.optimizer = new QueryOptimizer()
  }

  async init() {
    this.supabase = await createClient()
  }

  async optimizedSearch(params: {
    query: string
    type: 'vector' | 'text' | 'hybrid'
    filters?: any
    limit?: number
    offset?: number
    useCache?: boolean
  }) {
    const startTime = performance.now()
    const cacheKey = CacheKeys.search(params.query, params.filters)
    
    // Check cache first
    if (params.useCache !== false) {
      const cached = CacheManager.getSearchResults(cacheKey)
      if (cached) {
        this.optimizer.recordMetrics('search', {
          queryTime: performance.now() - startTime,
          cacheHit: true,
          resultCount: cached.results?.length || 0,
          optimizationApplied: [],
          bottlenecks: []
        })
        return cached
      }
    }

    const { optimizedQuery, appliedOptimizations } = await this.optimizer.optimizeQuery(params)
    const bottlenecks: string[] = []

    try {
      let results: any

      switch (optimizedQuery.type) {
        case 'vector':
          results = await this.executeVectorSearch(optimizedQuery, bottlenecks)
          break
        case 'text':
          results = await this.executeTextSearch(optimizedQuery, bottlenecks)
          break
        case 'hybrid':
          results = await this.executeHybridSearch(optimizedQuery, bottlenecks)
          break
        default:
          throw new Error(`Unknown search type: ${optimizedQuery.type}`)
      }

      const queryTime = performance.now() - startTime

      // Cache results
      if (params.useCache !== false && queryTime < 2000) { // Only cache fast queries
        CacheManager.setSearchResults(cacheKey, results, queryTime < 500 ? 5 * 60 * 1000 : 2 * 60 * 1000)
      }

      this.optimizer.recordMetrics('search', {
        queryTime,
        cacheHit: false,
        resultCount: results.results?.length || 0,
        optimizationApplied: appliedOptimizations,
        bottlenecks
      })

      return results

    } catch (error) {
      const queryTime = performance.now() - startTime
      this.optimizer.recordMetrics('search', {
        queryTime,
        cacheHit: false,
        resultCount: 0,
        optimizationApplied: appliedOptimizations,
        bottlenecks: [...bottlenecks, 'query_error']
      })
      throw error
    }
  }

  private async executeVectorSearch(params: any, bottlenecks: string[]) {
    const searchStart = performance.now()

    // Optimized vector similarity search with proper indexing
    const { data: chunks, error } = await this.supabase.rpc('match_chunks_optimized', {
      query_embedding: params.embedding,
      match_threshold: params.threshold || 0.7,
      match_count: params.vectorLimit || 20
    })

    if (performance.now() - searchStart > 1000) {
      bottlenecks.push('slow_vector_search')
    }

    if (error) throw error

    return { results: chunks, type: 'vector', optimized: true }
  }

  private async executeTextSearch(params: any, bottlenecks: string[]) {
    const searchStart = performance.now()

    let query = this.supabase
      .from('rag_chunks')
      .select('id, content, doc_id, chunk_index, rag_documents!inner(title, source_type)')

    if (params.useFuzzy) {
      // Use trigram similarity for short queries
      query = query.textSearch('content', params.query, { config: 'english' })
    } else {
      // Use full-text search for longer queries
      query = query.textSearch('content', params.query, { type: 'websearch', config: 'english' })
    }

    query = query.limit(params.limit || 20)

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 20) - 1)
    }

    const { data: chunks, error } = await query

    if (performance.now() - searchStart > 800) {
      bottlenecks.push('slow_text_search')
    }

    if (error) throw error

    return { results: chunks, type: 'text', optimized: true }
  }

  private async executeHybridSearch(params: any, bottlenecks: string[]) {
    const hybridStart = performance.now()

    // Execute vector and text searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      this.executeVectorSearch({
        ...params,
        vectorLimit: Math.floor(params.limit * (params.balance || 0.7))
      }, bottlenecks),
      this.executeTextSearch({
        ...params,
        limit: Math.floor(params.limit * (1 - (params.balance || 0.7)))
      }, bottlenecks)
    ])

    // Use RRF (Reciprocal Rank Fusion) to combine results
    const combinedResults = this.combineResultsWithRRF(
      vectorResults.results,
      textResults.results,
      params.balance || 0.7
    )

    if (performance.now() - hybridStart > 1500) {
      bottlenecks.push('slow_hybrid_search')
    }

    return { results: combinedResults, type: 'hybrid', optimized: true }
  }

  private combineResultsWithRRF(vectorResults: any[], textResults: any[], vectorWeight: number) {
    const scores = new Map<string, number>()
    const items = new Map<string, any>()

    // Add vector results with weighted RRF scoring
    vectorResults.forEach((item, index) => {
      const score = vectorWeight * (1 / (index + 1))
      scores.set(item.id, (scores.get(item.id) || 0) + score)
      items.set(item.id, item)
    })

    // Add text results with weighted RRF scoring
    textResults.forEach((item, index) => {
      const score = (1 - vectorWeight) * (1 / (index + 1))
      scores.set(item.id, (scores.get(item.id) || 0) + score)
      items.set(item.id, item)
    })

    // Sort by combined score
    return Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => items.get(id))
      .filter(Boolean)
  }

  getOptimizer() {
    return this.optimizer
  }
}

// Global optimizer instance
export const queryOptimizer = new OptimizedQueryBuilder()