#!/usr/bin/env tsx

/**
 * Performance Monitor & Regression Detection
 *
 * Monitors system performance over time and detects regressions
 * Maintains baselines and alerts on significant performance degradation
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

// =======================
// Types & Interfaces
// =======================

interface PerformanceBaseline {
  timestamp: Date;
  version: string;
  commitSha?: string;
  metrics: PerformanceMetrics;
  testConfiguration: {
    testType: string;
    queryCount: number;
    testDuration: number;
  };
}

interface PerformanceMetrics {
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // queries per second
  successRate: number;
  errorRate: number;
  cacheHitRate: number;
  tierPerformance: {
    sqlTier: TierMetrics;
    vectorTier: TierMetrics;
    contentTier: TierMetrics;
  };
  resourceUtilization: {
    cpuUsage: number;
    memoryUsage: number;
    dbConnections: number;
  };
}

interface TierMetrics {
  averageResponseTime: number;
  p95ResponseTime: number;
  successRate: number;
  queryCount: number;
}

interface RegressionAnalysis {
  hasRegression: boolean;
  regressionSeverity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical';
  affectedMetrics: RegressionDetail[];
  overallRegressionScore: number;
  recommendation: string;
  alertLevel: 'info' | 'warning' | 'error' | 'critical';
}

interface RegressionDetail {
  metric: string;
  baselineValue: number;
  currentValue: number;
  percentageChange: number;
  threshold: number;
  exceeded: boolean;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

// =======================
// Performance Monitor Class
// =======================

class PerformanceMonitor {
  private baselinePath: string;
  private thresholds: RegressionThresholds;

  constructor(baselinePath: string = './baselines/performance-baseline.json') {
    this.baselinePath = baselinePath;
    this.thresholds = {
      responseTimeIncrease: 20, // 20% increase triggers alert
      throughputDecrease: 15,   // 15% decrease triggers alert
      successRateDecrease: 5,   // 5% decrease triggers alert
      errorRateIncrease: 100,   // 100% increase (doubling) triggers alert
      cacheHitRateDecrease: 10, // 10% decrease triggers alert
      severityThresholds: {
        minor: 10,
        moderate: 20,
        severe: 35,
        critical: 50
      }
    };
  }

  /**
   * Record new performance baseline
   */
  async recordBaseline(
    metrics: PerformanceMetrics,
    version: string,
    commitSha?: string
  ): Promise<void> {
    const baseline: PerformanceBaseline = {
      timestamp: new Date(),
      version,
      commitSha,
      metrics,
      testConfiguration: {
        testType: 'comprehensive',
        queryCount: 25,
        testDuration: 300 // 5 minutes
      }
    };

    writeFileSync(this.baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
    console.log(`📊 Performance baseline recorded: ${this.baselinePath}`);
    console.log(`Version: ${version}, Avg Response: ${metrics.averageResponseTime.toFixed(0)}ms`);
  }

  /**
   * Compare current performance against baseline
   */
  async detectRegression(currentMetrics: PerformanceMetrics): Promise<RegressionAnalysis> {
    if (!existsSync(this.baselinePath)) {
      console.log('⚠️ No baseline found - recording current metrics as baseline');
      await this.recordBaseline(currentMetrics, 'baseline-v1.0');

      return {
        hasRegression: false,
        regressionSeverity: 'none',
        affectedMetrics: [],
        overallRegressionScore: 0,
        recommendation: 'Baseline established. Future runs will compare against this baseline.',
        alertLevel: 'info'
      };
    }

    const baseline = this.loadBaseline();
    const regressionDetails = this.analyzeMetrics(baseline.metrics, currentMetrics);

    const hasRegression = regressionDetails.some(detail => detail.exceeded);
    const overallRegressionScore = this.calculateRegressionScore(regressionDetails);
    const severity = this.determineSeverity(overallRegressionScore);

    const analysis: RegressionAnalysis = {
      hasRegression,
      regressionSeverity: severity,
      affectedMetrics: regressionDetails.filter(detail => detail.exceeded),
      overallRegressionScore,
      recommendation: this.generateRecommendation(regressionDetails, severity),
      alertLevel: this.determineAlertLevel(severity)
    };

    this.printRegressionReport(analysis, baseline);

    return analysis;
  }

  /**
   * Load performance baseline
   */
  private loadBaseline(): PerformanceBaseline {
    try {
      const baselineData = readFileSync(this.baselinePath, 'utf8');
      return JSON.parse(baselineData);
    } catch (error) {
      throw new Error(`Failed to load baseline from ${this.baselinePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze metrics for regressions
   */
  private analyzeMetrics(
    baseline: PerformanceMetrics,
    current: PerformanceMetrics
  ): RegressionDetail[] {
    const details: RegressionDetail[] = [];

    // Response Time Analysis
    details.push(this.analyzeMetric(
      'Average Response Time',
      baseline.averageResponseTime,
      current.averageResponseTime,
      this.thresholds.responseTimeIncrease,
      'increase'
    ));

    details.push(this.analyzeMetric(
      'P95 Response Time',
      baseline.p95ResponseTime,
      current.p95ResponseTime,
      this.thresholds.responseTimeIncrease,
      'increase'
    ));

    // Throughput Analysis
    details.push(this.analyzeMetric(
      'Throughput',
      baseline.throughput,
      current.throughput,
      this.thresholds.throughputDecrease,
      'decrease'
    ));

    // Success Rate Analysis
    details.push(this.analyzeMetric(
      'Success Rate',
      baseline.successRate,
      current.successRate,
      this.thresholds.successRateDecrease,
      'decrease'
    ));

    // Error Rate Analysis
    details.push(this.analyzeMetric(
      'Error Rate',
      baseline.errorRate,
      current.errorRate,
      this.thresholds.errorRateIncrease,
      'increase'
    ));

    // Cache Hit Rate Analysis
    details.push(this.analyzeMetric(
      'Cache Hit Rate',
      baseline.cacheHitRate,
      current.cacheHitRate,
      this.thresholds.cacheHitRateDecrease,
      'decrease'
    ));

    // Tier-specific Analysis
    details.push(...this.analyzeTierMetrics(baseline.tierPerformance, current.tierPerformance));

    return details;
  }

  /**
   * Analyze individual metric
   */
  private analyzeMetric(
    metricName: string,
    baselineValue: number,
    currentValue: number,
    threshold: number,
    direction: 'increase' | 'decrease'
  ): RegressionDetail {
    const percentageChange = ((currentValue - baselineValue) / baselineValue) * 100;

    let exceeded = false;
    if (direction === 'increase') {
      exceeded = percentageChange > threshold;
    } else {
      exceeded = percentageChange < -threshold;
    }

    const impact = this.determineImpact(Math.abs(percentageChange));

    return {
      metric: metricName,
      baselineValue,
      currentValue,
      percentageChange,
      threshold,
      exceeded,
      impact
    };
  }

  /**
   * Analyze tier-specific metrics
   */
  private analyzeTierMetrics(
    baseline: PerformanceMetrics['tierPerformance'],
    current: PerformanceMetrics['tierPerformance']
  ): RegressionDetail[] {
    const details: RegressionDetail[] = [];

    // SQL Tier
    details.push(this.analyzeMetric(
      'SQL Tier Response Time',
      baseline.sqlTier.averageResponseTime,
      current.sqlTier.averageResponseTime,
      this.thresholds.responseTimeIncrease,
      'increase'
    ));

    // Vector Tier
    details.push(this.analyzeMetric(
      'Vector Tier Response Time',
      baseline.vectorTier.averageResponseTime,
      current.vectorTier.averageResponseTime,
      this.thresholds.responseTimeIncrease,
      'increase'
    ));

    // Content Tier
    details.push(this.analyzeMetric(
      'Content Tier Response Time',
      baseline.contentTier.averageResponseTime,
      current.contentTier.averageResponseTime,
      this.thresholds.responseTimeIncrease,
      'increase'
    ));

    return details;
  }

  /**
   * Calculate overall regression score
   */
  private calculateRegressionScore(details: RegressionDetail[]): number {
    if (details.length === 0) return 0;

    const exceededDetails = details.filter(d => d.exceeded);
    if (exceededDetails.length === 0) return 0;

    // Weight by impact and calculate average
    const weightedScores = exceededDetails.map(detail => {
      const weight = this.getImpactWeight(detail.impact);
      return Math.abs(detail.percentageChange) * weight;
    });

    return weightedScores.reduce((sum, score) => sum + score, 0) / weightedScores.length;
  }

  /**
   * Determine regression severity
   */
  private determineSeverity(score: number): RegressionAnalysis['regressionSeverity'] {
    if (score >= this.thresholds.severityThresholds.critical) return 'critical';
    if (score >= this.thresholds.severityThresholds.severe) return 'severe';
    if (score >= this.thresholds.severityThresholds.moderate) return 'moderate';
    if (score >= this.thresholds.severityThresholds.minor) return 'minor';
    return 'none';
  }

  /**
   * Determine impact level
   */
  private determineImpact(percentageChange: number): RegressionDetail['impact'] {
    if (percentageChange >= 50) return 'critical';
    if (percentageChange >= 30) return 'high';
    if (percentageChange >= 15) return 'medium';
    return 'low';
  }

  /**
   * Get impact weight for scoring
   */
  private getImpactWeight(impact: RegressionDetail['impact']): number {
    switch (impact) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
    }
  }

  /**
   * Determine alert level
   */
  private determineAlertLevel(severity: RegressionAnalysis['regressionSeverity']): RegressionAnalysis['alertLevel'] {
    switch (severity) {
      case 'critical': return 'critical';
      case 'severe': return 'error';
      case 'moderate': return 'warning';
      case 'minor': return 'warning';
      case 'none': return 'info';
    }
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    details: RegressionDetail[],
    severity: RegressionAnalysis['regressionSeverity']
  ): string {
    if (severity === 'none') {
      return 'No performance regression detected. System performance is within acceptable thresholds.';
    }

    const criticalIssues = details.filter(d => d.exceeded && d.impact === 'critical');
    const highImpactIssues = details.filter(d => d.exceeded && d.impact === 'high');

    if (criticalIssues.length > 0) {
      return `Critical performance regression detected in ${criticalIssues.map(d => d.metric).join(', ')}. Immediate investigation required.`;
    }

    if (highImpactIssues.length > 0) {
      return `High-impact performance regression in ${highImpactIssues.map(d => d.metric).join(', ')}. Review recent changes and optimize affected components.`;
    }

    return `Performance regression detected. Monitor affected metrics: ${details.filter(d => d.exceeded).map(d => d.metric).join(', ')}.`;
  }

  /**
   * Print regression report
   */
  private printRegressionReport(analysis: RegressionAnalysis, baseline: PerformanceBaseline): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 PERFORMANCE REGRESSION ANALYSIS');
    console.log('='.repeat(80));
    console.log(`Baseline: ${baseline.version} (${new Date(baseline.timestamp).toISOString()})`);
    console.log(`Regression Score: ${analysis.overallRegressionScore.toFixed(1)}`);
    console.log(`Severity: ${analysis.regressionSeverity.toUpperCase()}`);
    console.log(`Alert Level: ${analysis.alertLevel.toUpperCase()}`);
    console.log(`Has Regression: ${analysis.hasRegression ? '❌ YES' : '✅ NO'}`);

    if (analysis.affectedMetrics.length > 0) {
      console.log('\n🚨 AFFECTED METRICS:');
      analysis.affectedMetrics.forEach(metric => {
        const direction = metric.percentageChange > 0 ? '📈' : '📉';
        console.log(`  ${direction} ${metric.metric}: ${metric.baselineValue.toFixed(2)} → ${metric.currentValue.toFixed(2)} (${metric.percentageChange > 0 ? '+' : ''}${metric.percentageChange.toFixed(1)}%)`);
        console.log(`     Impact: ${metric.impact.toUpperCase()}, Threshold: ±${metric.threshold}%`);
      });
    }

    console.log(`\n💡 RECOMMENDATION:`);
    console.log(`   ${analysis.recommendation}`);
    console.log('='.repeat(80));
  }

  /**
   * Export regression analysis as JSON
   */
  exportAnalysis(analysis: RegressionAnalysis, outputPath: string): void {
    writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf8');
    console.log(`📄 Regression analysis exported to: ${outputPath}`);
  }

  /**
   * Get performance trend over time
   */
  async getPerformanceTrend(historyDays: number = 30): Promise<PerformanceTrend> {
    // This would integrate with a time-series database or log aggregation system
    // For now, return mock trend data
    return {
      period: historyDays,
      dataPoints: 12, // Mock: 12 data points over the period
      trend: {
        responseTime: { direction: 'improving', changePercent: -5.2 },
        throughput: { direction: 'stable', changePercent: 1.1 },
        successRate: { direction: 'stable', changePercent: 0.3 },
        errorRate: { direction: 'improving', changePercent: -12.4 }
      },
      recommendation: 'Overall performance trend is positive with stable throughput and improving response times.'
    };
  }
}

// =======================
// Types for Trend Analysis
// =======================

interface RegressionThresholds {
  responseTimeIncrease: number;
  throughputDecrease: number;
  successRateDecrease: number;
  errorRateIncrease: number;
  cacheHitRateDecrease: number;
  severityThresholds: {
    minor: number;
    moderate: number;
    severe: number;
    critical: number;
  };
}

interface PerformanceTrend {
  period: number;
  dataPoints: number;
  trend: {
    responseTime: TrendMetric;
    throughput: TrendMetric;
    successRate: TrendMetric;
    errorRate: TrendMetric;
  };
  recommendation: string;
}

interface TrendMetric {
  direction: 'improving' | 'degrading' | 'stable';
  changePercent: number;
}

// =======================
// CLI Interface
// =======================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  const monitor = new PerformanceMonitor();

  try {
    switch (command) {
      case 'check':
        // This would normally get current metrics from the system
        const mockCurrentMetrics: PerformanceMetrics = {
          averageResponseTime: 850,
          p50ResponseTime: 650,
          p95ResponseTime: 1200,
          p99ResponseTime: 1800,
          throughput: 42.5,
          successRate: 0.94,
          errorRate: 0.06,
          cacheHitRate: 0.72,
          tierPerformance: {
            sqlTier: { averageResponseTime: 120, p95ResponseTime: 180, successRate: 0.98, queryCount: 5 },
            vectorTier: { averageResponseTime: 600, p95ResponseTime: 900, successRate: 0.95, queryCount: 10 },
            contentTier: { averageResponseTime: 1400, p95ResponseTime: 2100, successRate: 0.92, queryCount: 8 }
          },
          resourceUtilization: {
            cpuUsage: 0.65,
            memoryUsage: 0.78,
            dbConnections: 12
          }
        };

        const analysis = await monitor.detectRegression(mockCurrentMetrics);

        if (analysis.hasRegression) {
          console.log('❌ Performance regression detected!');
          process.exit(1);
        } else {
          console.log('✅ No performance regression detected');
          process.exit(0);
        }
        break;

      case 'baseline':
        const version = args[1] || 'v1.0.0';
        const commitSha = args[2];

        // This would get actual metrics from a test run
        const baselineMetrics: PerformanceMetrics = {
          averageResponseTime: 750,
          p50ResponseTime: 580,
          p95ResponseTime: 1100,
          p99ResponseTime: 1650,
          throughput: 45.2,
          successRate: 0.96,
          errorRate: 0.04,
          cacheHitRate: 0.68,
          tierPerformance: {
            sqlTier: { averageResponseTime: 110, p95ResponseTime: 160, successRate: 0.99, queryCount: 5 },
            vectorTier: { averageResponseTime: 580, p95ResponseTime: 850, successRate: 0.97, queryCount: 10 },
            contentTier: { averageResponseTime: 1300, p95ResponseTime: 1950, successRate: 0.94, queryCount: 8 }
          },
          resourceUtilization: {
            cpuUsage: 0.58,
            memoryUsage: 0.72,
            dbConnections: 10
          }
        };

        await monitor.recordBaseline(baselineMetrics, version, commitSha);
        break;

      default:
        console.log('Usage: performance-monitor.ts [check|baseline] [version] [commit-sha]');
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Performance monitoring failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { PerformanceMonitor, type PerformanceMetrics, type RegressionAnalysis };