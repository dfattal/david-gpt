/**
 * Performance Monitoring & Analytics
 * Real-time performance tracking and bottleneck identification
 */

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percentage';
  timestamp: Date;
  context?: Record<string, any>;
}

interface PerformanceTimerOptions {
  category: 'api' | 'database' | 'rag' | 'citation' | 'streaming';
  operation: string;
  threshold?: number; // Log warning if exceeded
  context?: Record<string, any>;
}

class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private activeTimers = new Map<
    string,
    { startTime: number; options: PerformanceTimerOptions }
  >();
  private stats = {
    apiCalls: 0,
    averageResponseTime: 0,
    slowRequests: 0,
    errorCount: 0,
    totalProcessingTime: 0,
  };

  /**
   * Start timing an operation
   */
  startTimer(name: string, options: PerformanceTimerOptions): string {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    this.activeTimers.set(timerId, {
      startTime: performance.now(),
      options,
    });

    return timerId;
  }

  /**
   * End timing and record metric
   */
  endTimer(timerId: string): number | null {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      console.warn(`Timer ${timerId} not found`);
      return null;
    }

    const duration = performance.now() - timer.startTime;
    this.activeTimers.delete(timerId);

    // Record metric
    this.recordMetric({
      name: `${timer.options.category}.${timer.options.operation}`,
      value: duration,
      unit: 'ms',
      timestamp: new Date(),
      context: timer.options.context,
    });

    // Update stats
    this.updateStats(timer.options.category, duration);

    // Log warning if threshold exceeded
    if (timer.options.threshold && duration > timer.options.threshold) {
      console.warn(
        `⚠️ Performance threshold exceeded: ${timer.options.operation} took ${duration.toFixed(2)}ms (threshold: ${timer.options.threshold}ms)`
      );
    }

    // Log performance info
    const contextStr = timer.options.context
      ? ` (${JSON.stringify(timer.options.context)})`
      : '';
    console.log(
      `⏱️  ${timer.options.category}.${timer.options.operation}: ${duration.toFixed(2)}ms${contextStr}`
    );

    return duration;
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500); // Keep last 500
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeTimers: this.activeTimers.size,
      metricsRecorded: this.metrics.length,
    };
  }

  /**
   * Get metrics for a specific category
   */
  getMetricsByCategory(category: string, limit = 50): PerformanceMetric[] {
    return this.metrics
      .filter(m => m.name.startsWith(category))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get average performance for an operation
   */
  getAveragePerformance(operationName: string): {
    average: number;
    min: number;
    max: number;
    count: number;
  } | null {
    const relevantMetrics = this.metrics.filter(m =>
      m.name.includes(operationName)
    );

    if (relevantMetrics.length === 0) return null;

    const values = relevantMetrics.map(m => m.value);

    return {
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  /**
   * Get performance bottlenecks (slowest operations)
   */
  getBottlenecks(limit = 10): Array<{
    operation: string;
    averageTime: number;
    maxTime: number;
    count: number;
    impact: number; // average * count
  }> {
    const operationMap = new Map<string, number[]>();

    // Group metrics by operation
    this.metrics.forEach(metric => {
      if (metric.unit === 'ms') {
        const existing = operationMap.get(metric.name) || [];
        existing.push(metric.value);
        operationMap.set(metric.name, existing);
      }
    });

    // Calculate bottlenecks
    const bottlenecks = Array.from(operationMap.entries())
      .map(([operation, times]) => ({
        operation,
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        maxTime: Math.max(...times),
        count: times.length,
        impact:
          (times.reduce((sum, time) => sum + time, 0) / times.length) *
          times.length,
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, limit);

    return bottlenecks;
  }

  /**
   * Clear old metrics
   */
  clearMetrics(olderThanMinutes = 30): void {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    summary: any;
    bottlenecks: any[];
    recentMetrics: PerformanceMetric[];
    recommendations: string[];
  } {
    const bottlenecks = this.getBottlenecks(5);
    const recentMetrics = this.metrics
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 20);

    const recommendations: string[] = [];

    // Generate recommendations based on bottlenecks
    bottlenecks.forEach(bottleneck => {
      if (bottleneck.averageTime > 5000) {
        recommendations.push(
          `🚨 Critical: ${bottleneck.operation} averaging ${bottleneck.averageTime.toFixed(0)}ms`
        );
      } else if (bottleneck.averageTime > 3000) {
        recommendations.push(
          `⚠️ Slow: ${bottleneck.operation} averaging ${bottleneck.averageTime.toFixed(0)}ms`
        );
      }

      if (bottleneck.count > 100 && bottleneck.averageTime > 1000) {
        recommendations.push(
          `📊 High impact: ${bottleneck.operation} called ${bottleneck.count} times`
        );
      }
    });

    // API-specific recommendations
    const apiMetrics = this.getMetricsByCategory('api', 100);
    const slowApiCalls = apiMetrics.filter(m => m.value > 3000).length;
    if (slowApiCalls > 10) {
      recommendations.push(`🐌 ${slowApiCalls} API calls exceeded 3s target`);
    }

    return {
      summary: this.getStats(),
      bottlenecks,
      recentMetrics,
      recommendations:
        recommendations.length > 0
          ? recommendations
          : ['✅ Performance looks good!'],
    };
  }

  private updateStats(category: string, duration: number): void {
    if (category === 'api') {
      this.stats.apiCalls++;
      this.stats.totalProcessingTime += duration;
      this.stats.averageResponseTime =
        this.stats.totalProcessingTime / this.stats.apiCalls;

      if (duration > 3000) {
        // 3 second threshold
        this.stats.slowRequests++;
      }
    }
  }
}

// Global performance tracker
export const performanceTracker = new PerformanceTracker();

// Convenience functions
export function startPerformanceTimer(
  name: string,
  options: PerformanceTimerOptions
): string {
  return performanceTracker.startTimer(name, options);
}

export function endPerformanceTimer(timerId: string): number | null {
  return performanceTracker.endTimer(timerId);
}

export function recordCustomMetric(metric: PerformanceMetric): void {
  performanceTracker.recordMetric(metric);
}

export function getPerformanceStats() {
  return performanceTracker.getStats();
}

export function getPerformanceReport() {
  return performanceTracker.generateReport();
}

/**
 * Decorator function to automatically time async functions
 */
export function timed(
  category: PerformanceTimerOptions['category'],
  operation: string,
  threshold?: number
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const timerId = startPerformanceTimer(`${propertyKey}`, {
        category,
        operation,
        threshold,
        context: { args: args.length },
      });

      try {
        const result = await originalMethod.apply(this, args);
        endPerformanceTimer(timerId);
        return result;
      } catch (error) {
        endPerformanceTimer(timerId);
        performanceTracker.recordMetric({
          name: `error.${category}.${operation}`,
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          context: { error: String(error) },
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Simple timing utility for inline use
 */
export async function timeOperation<T>(
  operation: () => Promise<T>,
  name: string,
  options: PerformanceTimerOptions
): Promise<{ result: T; duration: number }> {
  const timerId = startPerformanceTimer(name, options);

  try {
    const result = await operation();
    const duration = endPerformanceTimer(timerId) || 0;
    return { result, duration };
  } catch (error) {
    endPerformanceTimer(timerId);
    throw error;
  }
}
