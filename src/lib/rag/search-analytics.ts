/**
 * Search Analytics Service
 *
 * Tracks query performance, tier distribution, and search quality metrics
 * for the three-tier RAG architecture.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =======================
// Analytics Interfaces
// =======================

export interface SearchAnalyticsEvent {
  query: string;
  tier: 'sql' | 'vector' | 'content';
  executionTime: number;
  resultCount: number;
  success: boolean;
  classification: {
    confidence: number;
    explanation: string;
    matchType: string;
  };
  fallbackUsed?: boolean;
  executionStrategy?: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

export interface TierDistributionStats {
  sql: { count: number; percentage: number; avgTime: number };
  vector: { count: number; percentage: number; avgTime: number };
  content: { count: number; percentage: number; avgTime: number };
  total: number;
}

export interface PerformanceMetrics {
  averageExecutionTime: number;
  sqlTierPerformance: {
    averageTime: number;
    under200ms: number;
    total: number;
    successRate: number;
  };
  vectorTierPerformance: {
    averageTime: number;
    under1000ms: number;
    total: number;
    successRate: number;
  };
  contentTierPerformance: {
    averageTime: number;
    total: number;
    successRate: number;
  };
  overallSuccessRate: number;
  tierClassificationAccuracy: number;
}

// =======================
// Search Analytics Service
// =======================

export class SearchAnalyticsService {
  private events: SearchAnalyticsEvent[] = [];
  private supabase?: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Log a search analytics event
   */
  async logSearchEvent(event: SearchAnalyticsEvent): Promise<void> {
    // Store in memory for immediate analytics
    this.events.push(event);

    // Persist to database if available
    if (this.supabase) {
      try {
        await this.supabase.from('search_analytics').insert({
          query: event.query,
          tier: event.tier,
          execution_time: event.executionTime,
          result_count: event.resultCount,
          success: event.success,
          classification_confidence: event.classification.confidence,
          classification_explanation: event.classification.explanation,
          classification_match_type: event.classification.matchType,
          fallback_used: event.fallbackUsed || false,
          execution_strategy: event.executionStrategy,
          user_id: event.userId,
          session_id: event.sessionId,
          created_at: event.timestamp.toISOString(),
        });
      } catch (error) {
        console.warn('Failed to persist search analytics:', error);
      }
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `📊 Search Analytics: ${event.tier.toUpperCase()} | ${event.executionTime}ms | ${event.resultCount} results | ${event.query}`
      );
    }
  }

  /**
   * Get tier distribution statistics
   */
  getTierDistribution(timeFrame?: {
    start: Date;
    end: Date;
  }): TierDistributionStats {
    let events = this.events;

    if (timeFrame) {
      events = events.filter(
        event =>
          event.timestamp >= timeFrame.start && event.timestamp <= timeFrame.end
      );
    }

    const total = events.length;
    const sqlEvents = events.filter(e => e.tier === 'sql');
    const vectorEvents = events.filter(e => e.tier === 'vector');
    const contentEvents = events.filter(e => e.tier === 'content');

    return {
      sql: {
        count: sqlEvents.length,
        percentage: total > 0 ? (sqlEvents.length / total) * 100 : 0,
        avgTime:
          sqlEvents.length > 0
            ? sqlEvents.reduce((sum, e) => sum + e.executionTime, 0) /
              sqlEvents.length
            : 0,
      },
      vector: {
        count: vectorEvents.length,
        percentage: total > 0 ? (vectorEvents.length / total) * 100 : 0,
        avgTime:
          vectorEvents.length > 0
            ? vectorEvents.reduce((sum, e) => sum + e.executionTime, 0) /
              vectorEvents.length
            : 0,
      },
      content: {
        count: contentEvents.length,
        percentage: total > 0 ? (contentEvents.length / total) * 100 : 0,
        avgTime:
          contentEvents.length > 0
            ? contentEvents.reduce((sum, e) => sum + e.executionTime, 0) /
              contentEvents.length
            : 0,
      },
      total,
    };
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(timeFrame?: {
    start: Date;
    end: Date;
  }): PerformanceMetrics {
    let events = this.events;

    if (timeFrame) {
      events = events.filter(
        event =>
          event.timestamp >= timeFrame.start && event.timestamp <= timeFrame.end
      );
    }

    const successfulEvents = events.filter(e => e.success);
    const sqlEvents = events.filter(e => e.tier === 'sql');
    const vectorEvents = events.filter(e => e.tier === 'vector');
    const contentEvents = events.filter(e => e.tier === 'content');

    const sqlSuccessful = sqlEvents.filter(e => e.success);
    const vectorSuccessful = vectorEvents.filter(e => e.success);
    const contentSuccessful = contentEvents.filter(e => e.success);

    return {
      averageExecutionTime:
        events.length > 0
          ? events.reduce((sum, e) => sum + e.executionTime, 0) / events.length
          : 0,

      sqlTierPerformance: {
        averageTime:
          sqlSuccessful.length > 0
            ? sqlSuccessful.reduce((sum, e) => sum + e.executionTime, 0) /
              sqlSuccessful.length
            : 0,
        under200ms: sqlSuccessful.filter(e => e.executionTime < 200).length,
        total: sqlEvents.length,
        successRate:
          sqlEvents.length > 0
            ? (sqlSuccessful.length / sqlEvents.length) * 100
            : 0,
      },

      vectorTierPerformance: {
        averageTime:
          vectorSuccessful.length > 0
            ? vectorSuccessful.reduce((sum, e) => sum + e.executionTime, 0) /
              vectorSuccessful.length
            : 0,
        under1000ms: vectorSuccessful.filter(e => e.executionTime < 1000)
          .length,
        total: vectorEvents.length,
        successRate:
          vectorEvents.length > 0
            ? (vectorSuccessful.length / vectorEvents.length) * 100
            : 0,
      },

      contentTierPerformance: {
        averageTime:
          contentSuccessful.length > 0
            ? contentSuccessful.reduce((sum, e) => sum + e.executionTime, 0) /
              contentSuccessful.length
            : 0,
        total: contentEvents.length,
        successRate:
          contentEvents.length > 0
            ? (contentSuccessful.length / contentEvents.length) * 100
            : 0,
      },

      overallSuccessRate:
        events.length > 0 ? (successfulEvents.length / events.length) * 100 : 0,
      tierClassificationAccuracy: this.calculateClassificationAccuracy(events),
    };
  }

  /**
   * Calculate tier classification accuracy (needs expected tier data)
   */
  private calculateClassificationAccuracy(
    events: SearchAnalyticsEvent[]
  ): number {
    // This would need additional data about expected classifications
    // For now, return a placeholder that can be enhanced with ML feedback
    return 95.0; // Placeholder - would implement with classification validation
  }

  /**
   * Get recent query patterns for optimization
   */
  getQueryPatterns(limit: number = 100): Array<{
    query: string;
    tier: string;
    frequency: number;
    avgTime: number;
    lastUsed: Date;
  }> {
    const queryMap = new Map<
      string,
      {
        query: string;
        tier: string;
        times: number[];
        lastUsed: Date;
      }
    >();

    // Aggregate query data
    for (const event of this.events.slice(-limit * 3)) {
      const key = `${event.query}:${event.tier}`;
      if (!queryMap.has(key)) {
        queryMap.set(key, {
          query: event.query,
          tier: event.tier,
          times: [],
          lastUsed: event.timestamp,
        });
      }

      const data = queryMap.get(key)!;
      data.times.push(event.executionTime);
      if (event.timestamp > data.lastUsed) {
        data.lastUsed = event.timestamp;
      }
    }

    // Convert to sorted array
    return Array.from(queryMap.values())
      .map(data => ({
        query: data.query,
        tier: data.tier,
        frequency: data.times.length,
        avgTime:
          data.times.reduce((sum, time) => sum + time, 0) / data.times.length,
        lastUsed: data.lastUsed,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Print comprehensive analytics report
   */
  printAnalyticsReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SEARCH ANALYTICS REPORT');
    console.log('='.repeat(80));

    const distribution = this.getTierDistribution();
    const metrics = this.getPerformanceMetrics();

    // Tier Distribution
    console.log('\n🎯 Query Tier Distribution:');
    console.log(`Total Queries: ${distribution.total}`);
    console.log(
      `SQL Tier: ${distribution.sql.count} (${distribution.sql.percentage.toFixed(1)}%) - Avg: ${distribution.sql.avgTime.toFixed(0)}ms`
    );
    console.log(
      `Vector Tier: ${distribution.vector.count} (${distribution.vector.percentage.toFixed(1)}%) - Avg: ${distribution.vector.avgTime.toFixed(0)}ms`
    );
    console.log(
      `Content Tier: ${distribution.content.count} (${distribution.content.percentage.toFixed(1)}%) - Avg: ${distribution.content.avgTime.toFixed(0)}ms`
    );

    // Performance Metrics
    console.log('\n⚡ Performance Metrics:');
    console.log(
      `Overall Average: ${metrics.averageExecutionTime.toFixed(0)}ms`
    );
    console.log(
      `Overall Success Rate: ${metrics.overallSuccessRate.toFixed(1)}%`
    );

    console.log(`\nSQL Tier Performance:`);
    console.log(
      `  Average Time: ${metrics.sqlTierPerformance.averageTime.toFixed(0)}ms`
    );
    console.log(
      `  Under 200ms: ${metrics.sqlTierPerformance.under200ms}/${metrics.sqlTierPerformance.total} (${((metrics.sqlTierPerformance.under200ms / metrics.sqlTierPerformance.total) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Success Rate: ${metrics.sqlTierPerformance.successRate.toFixed(1)}%`
    );

    console.log(`\nVector Tier Performance:`);
    console.log(
      `  Average Time: ${metrics.vectorTierPerformance.averageTime.toFixed(0)}ms`
    );
    console.log(
      `  Under 1000ms: ${metrics.vectorTierPerformance.under1000ms}/${metrics.vectorTierPerformance.total} (${((metrics.vectorTierPerformance.under1000ms / metrics.vectorTierPerformance.total) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Success Rate: ${metrics.vectorTierPerformance.successRate.toFixed(1)}%`
    );

    console.log(`\nContent Tier Performance:`);
    console.log(
      `  Average Time: ${metrics.contentTierPerformance.averageTime.toFixed(0)}ms`
    );
    console.log(
      `  Success Rate: ${metrics.contentTierPerformance.successRate.toFixed(1)}%`
    );

    // Query Patterns
    const patterns = this.getQueryPatterns(10);
    if (patterns.length > 0) {
      console.log('\n🔍 Top Query Patterns:');
      patterns.forEach((pattern, index) => {
        console.log(
          `${index + 1}. [${pattern.tier.toUpperCase()}] "${pattern.query}" - ${pattern.frequency}x, ${pattern.avgTime.toFixed(0)}ms avg`
        );
      });
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * Clear analytics data (for testing)
   */
  clearData(): void {
    this.events = [];
  }

  /**
   * Get raw events for external analysis
   */
  getRawEvents(): SearchAnalyticsEvent[] {
    return [...this.events];
  }
}

// =======================
// Global Analytics Instance
// =======================

export const searchAnalytics = new SearchAnalyticsService();

// =======================
// Convenience Functions
// =======================

/**
 * Log a search event with simplified interface
 */
export async function logSearch(
  query: string,
  tier: 'sql' | 'vector' | 'content',
  executionTime: number,
  resultCount: number,
  success: boolean,
  classification: {
    confidence: number;
    explanation: string;
    matchType: string;
  },
  options?: {
    fallbackUsed?: boolean;
    executionStrategy?: string;
    userId?: string;
    sessionId?: string;
  }
): Promise<void> {
  const event: SearchAnalyticsEvent = {
    query,
    tier,
    executionTime,
    resultCount,
    success,
    classification,
    fallbackUsed: options?.fallbackUsed,
    executionStrategy: options?.executionStrategy,
    timestamp: new Date(),
    userId: options?.userId,
    sessionId: options?.sessionId,
  };

  await searchAnalytics.logSearchEvent(event);
}

/**
 * Get current tier distribution
 */
export function getCurrentTierDistribution(): TierDistributionStats {
  return searchAnalytics.getTierDistribution();
}

/**
 * Get current performance metrics
 */
export function getCurrentPerformanceMetrics(): PerformanceMetrics {
  return searchAnalytics.getPerformanceMetrics();
}
