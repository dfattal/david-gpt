import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getPerformanceReport,
  getPerformanceStats,
} from '@/lib/performance/monitoring';
import { getBatchStats } from '@/lib/performance/batch-citations';
import { asyncTaskQueue } from '@/lib/performance/async-operations';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'summary';
    const supabase = await createClient();

    // Get authenticated user (admin only)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Generate performance data
    const performanceStats = getPerformanceStats();
    const batchStats = getBatchStats();
    const asyncStats = asyncTaskQueue.getStats();

    // System health metrics
    const systemHealth = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
    };

    // Database connection health
    let dbHealth = { connected: false, latency: null };
    try {
      const dbStart = performance.now();
      const { data } = await supabase
        .from('documents')
        .select('count')
        .limit(1);
      const dbLatency = performance.now() - dbStart;
      dbHealth = { connected: true, latency: Math.round(dbLatency) };
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    if (format === 'full') {
      const fullReport = getPerformanceReport();
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        performance: fullReport,
        batch: batchStats,
        async: asyncStats,
        system: systemHealth,
        database: dbHealth,
      });
    }

    // Summary format (default)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: determineOverallStatus(performanceStats, batchStats, dbHealth),
      performance: {
        apiCalls: performanceStats.apiCalls,
        averageResponseTime: Math.round(performanceStats.averageResponseTime),
        slowRequests: performanceStats.slowRequests,
        activeTimers: performanceStats.activeTimers,
      },
      batch: {
        citationsPending: batchStats.citationsPending,
        sourcesPending: batchStats.sourcesPending,
        processing: batchStats.processing,
      },
      async: {
        queueLength: asyncStats.queueLength,
        processing: asyncStats.processing,
        processed: asyncStats.processed,
        avgProcessingTime: Math.round(asyncStats.avgProcessingTime),
      },
      database: dbHealth,
      system: {
        uptime: Math.round(systemHealth.uptime),
        memoryMB: Math.round(systemHealth.memoryUsage.heapUsed / 1024 / 1024),
      },
    });
  } catch (error) {
    console.error('Performance API error:', error);
    return NextResponse.json(
      { error: 'Performance monitoring failed' },
      { status: 500 }
    );
  }
}

function determineOverallStatus(
  performanceStats: any,
  batchStats: any,
  dbHealth: any
): 'healthy' | 'warning' | 'critical' {
  // Critical conditions
  if (!dbHealth.connected) return 'critical';
  if (performanceStats.averageResponseTime > 10000) return 'critical';

  // Warning conditions
  if (performanceStats.averageResponseTime > 3000) return 'warning';
  if (performanceStats.slowRequests > 10) return 'warning';
  if (batchStats.citationsPending > 100) return 'warning';
  if (dbHealth.latency > 1000) return 'warning';

  return 'healthy';
}
