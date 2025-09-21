/**
 * Search Analytics API Endpoint
 *
 * Provides real-time performance monitoring and analytics for the three-tier search system.
 * Accessible through /api/admin/search-analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import {
  searchAnalytics,
  getCurrentTierDistribution,
  getCurrentPerformanceMetrics
} from '@/lib/rag/search-analytics';

export async function GET(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Simple admin check (you might want to implement proper role-based access)
    const isAdmin = user.email === 'dfattal@gmail.com'; // Adjust this as needed
    if (!isAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || '24h';
    const format = searchParams.get('format') || 'json';

    // Calculate time range
    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get analytics data
    const tierDistribution = getCurrentTierDistribution();
    const performanceMetrics = getCurrentPerformanceMetrics();
    const queryPatterns = searchAnalytics.getQueryPatterns(20);
    const rawEvents = searchAnalytics.getRawEvents();

    // Filter events by timeframe
    const filteredEvents = rawEvents.filter(
      event => event.timestamp >= startTime && event.timestamp <= now
    );

    // Calculate additional metrics
    const totalQueries = filteredEvents.length;
    const averageLatency = totalQueries > 0
      ? filteredEvents.reduce((sum, event) => sum + event.executionTime, 0) / totalQueries
      : 0;

    const successRate = totalQueries > 0
      ? (filteredEvents.filter(event => event.success).length / totalQueries) * 100
      : 0;

    // Performance benchmarks
    const sqlQueries = filteredEvents.filter(e => e.tier === 'sql');
    const sqlUnder200ms = sqlQueries.filter(e => e.executionTime < 200).length;
    const sqlPerformanceMet = sqlQueries.length > 0 ? (sqlUnder200ms / sqlQueries.length) * 100 : 0;

    const vectorQueries = filteredEvents.filter(e => e.tier === 'vector');
    const vectorUnder1000ms = vectorQueries.filter(e => e.executionTime < 1000).length;
    const vectorPerformanceMet = vectorQueries.length > 0 ? (vectorUnder1000ms / vectorQueries.length) * 100 : 0;

    // Recent query activity (last hour)
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const recentQueries = filteredEvents.filter(event => event.timestamp >= lastHour);

    const analytics = {
      summary: {
        timeframe,
        totalQueries,
        averageLatency: Math.round(averageLatency),
        successRate: Math.round(successRate * 100) / 100,
        generatedAt: now.toISOString()
      },
      tierDistribution: {
        sql: {
          count: tierDistribution.sql.count,
          percentage: Math.round(tierDistribution.sql.percentage * 100) / 100,
          averageTime: Math.round(tierDistribution.sql.avgTime)
        },
        vector: {
          count: tierDistribution.vector.count,
          percentage: Math.round(tierDistribution.vector.percentage * 100) / 100,
          averageTime: Math.round(tierDistribution.vector.avgTime)
        },
        content: {
          count: tierDistribution.content.count,
          percentage: Math.round(tierDistribution.content.percentage * 100) / 100,
          averageTime: Math.round(tierDistribution.content.avgTime)
        }
      },
      performanceBenchmarks: {
        sqlTier: {
          totalQueries: sqlQueries.length,
          under200ms: sqlUnder200ms,
          performanceMet: Math.round(sqlPerformanceMet * 100) / 100,
          target: 80
        },
        vectorTier: {
          totalQueries: vectorQueries.length,
          under1000ms: vectorUnder1000ms,
          performanceMet: Math.round(vectorPerformanceMet * 100) / 100,
          target: 80
        },
        overallSuccess: {
          rate: Math.round(successRate * 100) / 100,
          target: 95
        }
      },
      queryPatterns: queryPatterns.slice(0, 10).map(pattern => ({
        query: pattern.query,
        tier: pattern.tier,
        frequency: pattern.frequency,
        avgTime: Math.round(pattern.avgTime),
        lastUsed: pattern.lastUsed.toISOString()
      })),
      recentActivity: {
        queriesLastHour: recentQueries.length,
        tierBreakdown: {
          sql: recentQueries.filter(q => q.tier === 'sql').length,
          vector: recentQueries.filter(q => q.tier === 'vector').length,
          content: recentQueries.filter(q => q.tier === 'content').length
        },
        averageLatencyLastHour: recentQueries.length > 0
          ? Math.round(recentQueries.reduce((sum, q) => sum + q.executionTime, 0) / recentQueries.length)
          : 0
      },
      systemHealth: {
        status: successRate >= 95 ? 'healthy' : successRate >= 80 ? 'warning' : 'critical',
        issues: [
          ...(sqlPerformanceMet < 80 ? ['SQL tier performance below target'] : []),
          ...(vectorPerformanceMet < 80 ? ['Vector tier performance below target'] : []),
          ...(successRate < 95 ? ['Success rate below target'] : [])
        ]
      }
    };

    // Return data in requested format
    if (format === 'csv') {
      // Generate CSV format for exports
      const csvData = filteredEvents.map(event => ({
        timestamp: event.timestamp.toISOString(),
        query: event.query,
        tier: event.tier,
        executionTime: event.executionTime,
        resultCount: event.resultCount,
        success: event.success,
        confidence: event.classification.confidence
      }));

      const csvHeaders = Object.keys(csvData[0] || {}).join(',');
      const csvRows = csvData.map(row => Object.values(row).join(','));
      const csvContent = [csvHeaders, ...csvRows].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="search-analytics-${timeframe}.csv"`
        }
      });
    }

    return NextResponse.json(analytics, { status: 200 });

  } catch (error) {
    return handleApiError(error);
  }
}

// Clear analytics data (for testing/development)
export async function DELETE(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Admin check
    const isAdmin = user.email === 'dfattal@gmail.com';
    if (!isAdmin) {
      throw new AppError('Admin access required', 403);
    }

    // Clear analytics data
    searchAnalytics.clearData();

    return NextResponse.json({
      success: true,
      message: 'Analytics data cleared',
      clearedAt: new Date().toISOString()
    }, { status: 200 });

  } catch (error) {
    return handleApiError(error);
  }
}

// Generate analytics report
export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Admin check
    const isAdmin = user.email === 'dfattal@gmail.com';
    if (!isAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const body = await req.json();
    const { reportType = 'summary', timeframe = '24h' } = body;

    let report: any;

    switch (reportType) {
      case 'summary':
        report = {
          type: 'summary',
          timeframe,
          metrics: getCurrentPerformanceMetrics(),
          distribution: getCurrentTierDistribution(),
          generatedAt: new Date().toISOString()
        };
        break;

      case 'performance':
        const perfMetrics = getCurrentPerformanceMetrics();
        report = {
          type: 'performance',
          timeframe,
          sqlTierPerformance: perfMetrics.sqlTierPerformance,
          vectorTierPerformance: perfMetrics.vectorTierPerformance,
          contentTierPerformance: perfMetrics.contentTierPerformance,
          benchmarks: {
            sqlUnder200ms: (perfMetrics.sqlTierPerformance.under200ms / perfMetrics.sqlTierPerformance.total) * 100,
            vectorUnder1000ms: (perfMetrics.vectorTierPerformance.under1000ms / perfMetrics.vectorTierPerformance.total) * 100,
            overallSuccess: perfMetrics.overallSuccessRate
          },
          generatedAt: new Date().toISOString()
        };
        break;

      case 'patterns':
        report = {
          type: 'patterns',
          timeframe,
          topQueries: searchAnalytics.getQueryPatterns(50),
          tierUsage: getCurrentTierDistribution(),
          generatedAt: new Date().toISOString()
        };
        break;

      default:
        throw new AppError('Invalid report type', 400);
    }

    return NextResponse.json(report, { status: 200 });

  } catch (error) {
    return handleApiError(error);
  }
}