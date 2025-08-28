import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAccess } from '@/lib/admin/access-control'
import { createClient } from '@/lib/supabase/server'
import { jobQueue } from '@/lib/queue/job-queue'
import { CacheManager } from '@/lib/performance/caching'
import { errorHandler } from '@/lib/error-handling/error-system'

// GET /api/admin/system/metrics - Get comprehensive system metrics
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminAccess()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get system metrics in parallel
    const [
      systemMetrics,
      databaseMetrics,
      performanceMetrics,
      jobMetrics,
      usageMetrics,
      healthMetrics
    ] = await Promise.all([
      getSystemMetrics(),
      getDatabaseMetrics(supabase),
      getPerformanceMetrics(),
      getJobMetrics(supabase),
      getUsageMetrics(supabase),
      getHealthMetrics(supabase)
    ])

    return NextResponse.json({
      system: systemMetrics,
      database: databaseMetrics,
      performance: performanceMetrics,
      jobs: jobMetrics,
      usage: usageMetrics,
      health: healthMetrics,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('[Admin System Metrics] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch system metrics', details: error.message },
      { status: 500 }
    )
  }
}

async function getSystemMetrics() {
  const memoryUsage = process.memoryUsage()
  const uptime = process.uptime()

  return {
    uptime: Math.floor(uptime),
    memoryUsage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    cpuUsage: Math.round(Math.random() * 30 + 10), // Mock CPU usage
    diskUsage: Math.round(Math.random() * 40 + 20), // Mock disk usage
    activeConnections: Math.floor(Math.random() * 50 + 10), // Mock connections
    requestsPerMinute: Math.floor(Math.random() * 200 + 50) // Mock requests
  }
}

async function getDatabaseMetrics(supabase: any) {
  try {
    const [documentsResult, chunksResult, entitiesResult, relationsResult] = await Promise.all([
      supabase.from('rag_documents').select('id', { count: 'exact', head: true }),
      supabase.from('rag_chunks').select('id', { count: 'exact', head: true }),
      supabase.from('rag_entities').select('id', { count: 'exact', head: true }),
      supabase.from('rag_relations').select('id', { count: 'exact', head: true })
    ])

    // Mock query latency test
    const queryStartTime = performance.now()
    await supabase.from('rag_documents').select('id').limit(1)
    const queryLatency = Math.round(performance.now() - queryStartTime)

    return {
      totalDocuments: documentsResult.count || 0,
      totalChunks: chunksResult.count || 0,
      totalEntities: entitiesResult.count || 0,
      totalRelations: relationsResult.count || 0,
      indexSize: Math.floor(Math.random() * 500000000 + 100000000), // Mock index size in bytes
      queryLatency
    }
  } catch (error) {
    console.error('Database metrics error:', error)
    return {
      totalDocuments: 0,
      totalChunks: 0,
      totalEntities: 0,
      totalRelations: 0,
      indexSize: 0,
      queryLatency: 0
    }
  }
}

async function getPerformanceMetrics() {
  const cacheStats = CacheManager.getStats()
  
  // Calculate overall cache hit rate
  const totalHits = Object.values(cacheStats).reduce((sum, stat) => sum + stat.hits, 0)
  const totalMisses = Object.values(cacheStats).reduce((sum, stat) => sum + stat.misses, 0)
  const overallHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0

  return {
    avgResponseTime: Math.floor(Math.random() * 200 + 50), // Mock response time
    cacheHitRate: overallHitRate,
    errorRate: Math.random() * 0.05, // Mock error rate (0-5%)
    throughput: Math.floor(Math.random() * 100 + 20), // Mock throughput
    p95ResponseTime: Math.floor(Math.random() * 500 + 100),
    p99ResponseTime: Math.floor(Math.random() * 1000 + 200)
  }
}

async function getJobMetrics(supabase: any) {
  try {
    const queueStats = jobQueue.getStats()
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get job counts from database
    const [pendingJobs, runningJobs, completedJobs, failedJobs] = await Promise.all([
      supabase.from('rag_ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('rag_ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'RUNNING'),
      supabase.from('rag_ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED').gte('created_at', last24h.toISOString()),
      supabase.from('rag_ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'FAILED').gte('created_at', last24h.toISOString())
    ])

    // Get average processing time
    const { data: completedJobsWithTiming } = await supabase
      .from('rag_ingest_jobs')
      .select('processing_time_ms')
      .eq('status', 'COMPLETED')
      .not('processing_time_ms', 'is', null)
      .gte('created_at', last24h.toISOString())
      .limit(100)

    const avgProcessingTime = completedJobsWithTiming?.length > 0
      ? Math.round(completedJobsWithTiming.reduce((sum: number, job: any) => sum + (job.processing_time_ms || 0), 0) / completedJobsWithTiming.length)
      : 0

    const completed = completedJobs.count || 0
    const failed = failedJobs.count || 0
    const successRate = completed + failed > 0 ? completed / (completed + failed) : 1

    return {
      pending: pendingJobs.count || 0,
      running: runningJobs.count || 0,
      completed,
      failed,
      avgProcessingTime,
      successRate,
      queueDepth: queueStats.pending + queueStats.running
    }
  } catch (error) {
    console.error('Job metrics error:', error)
    return {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
      successRate: 1,
      queueDepth: 0
    }
  }
}

async function getUsageMetrics(supabase: any) {
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Mock active users (would come from session tracking in production)
    const activeUsers = Math.floor(Math.random() * 20 + 5)

    // Get 24h statistics
    const [documentsProcessed, entitiesExtracted, totalQueries] = await Promise.all([
      supabase
        .from('rag_documents')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', last24h.toISOString()),
      supabase
        .from('rag_entities')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', last24h.toISOString()),
      // Mock total queries (would come from analytics in production)
      Promise.resolve({ count: Math.floor(Math.random() * 1000 + 200) })
    ])

    // Mock storage usage and embedding calls
    const storageUsed = Math.floor(Math.random() * 10000000000 + 1000000000) // 1-10GB
    const embeddingCalls24h = Math.floor(Math.random() * 5000 + 500)

    return {
      activeUsers,
      totalQueries24h: totalQueries.count,
      documentsProcessed24h: documentsProcessed.count || 0,
      entitiesExtracted24h: entitiesExtracted.count || 0,
      storageUsed,
      embeddingCalls24h
    }
  } catch (error) {
    console.error('Usage metrics error:', error)
    return {
      activeUsers: 0,
      totalQueries24h: 0,
      documentsProcessed24h: 0,
      entitiesExtracted24h: 0,
      storageUsed: 0,
      embeddingCalls24h: 0
    }
  }
}

async function getHealthMetrics(supabase: any) {
  try {
    const issues: Array<{
      type: 'warning' | 'error'
      message: string
      timestamp: Date
      component: string
    }> = []

    // Check error handler stats for recent critical errors
    const errorStats = errorHandler.getErrorStats()
    if (errorStats.lastHour > 10) {
      issues.push({
        type: 'warning',
        message: `High error rate detected: ${errorStats.lastHour} errors in the last hour`,
        timestamp: new Date(),
        component: 'error_handler'
      })
    }

    // Check cache memory usage
    const cacheStats = CacheManager.getStats()
    const totalCacheMemory = Object.values(cacheStats).reduce((sum, stat) => sum + stat.memoryUsage, 0)
    if (totalCacheMemory > 200 * 1024 * 1024) { // 200MB
      issues.push({
        type: 'warning',
        message: `High cache memory usage: ${Math.round(totalCacheMemory / (1024 * 1024))}MB`,
        timestamp: new Date(),
        component: 'cache_system'
      })
    }

    // Check job queue depth
    const queueStats = jobQueue.getStats()
    if (queueStats.pending > 50) {
      issues.push({
        type: 'warning',
        message: `Job queue backlog: ${queueStats.pending} pending jobs`,
        timestamp: new Date(),
        component: 'job_queue'
      })
    }

    // Mock additional health checks
    if (Math.random() < 0.1) { // 10% chance of database warning
      issues.push({
        type: 'warning',
        message: 'Database connection pool utilization high',
        timestamp: new Date(Date.now() - Math.random() * 60000), // Random time in last minute
        component: 'database'
      })
    }

    // Determine overall health
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (issues.length > 0) {
      overall = issues.some(issue => issue.type === 'error') ? 'critical' : 'warning'
    }

    return {
      overall,
      issues,
      lastHealthCheck: new Date()
    }
  } catch (error) {
    console.error('Health metrics error:', error)
    return {
      overall: 'warning' as const,
      issues: [{
        type: 'error' as const,
        message: 'Failed to perform health check',
        timestamp: new Date(),
        component: 'health_monitor'
      }],
      lastHealthCheck: new Date()
    }
  }
}