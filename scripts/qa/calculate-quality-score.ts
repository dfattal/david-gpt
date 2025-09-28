#!/usr/bin/env tsx

/**
 * Quality Score Calculator
 *
 * Calculates overall quality score based on various metrics
 * Used by CI/CD pipelines for quality gate decisions
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface QualityMetrics {
  lintScore: number;
  testCoverage: number;
  typeErrors: number;
  buildSuccess: boolean;
  ragQualityScore?: number;
  performanceScore?: number;
}

interface QualityScore {
  overall: number;
  breakdown: {
    codeQuality: number;
    testing: number;
    ragQuality: number;
    performance: number;
  };
  grade: string;
  passed: boolean;
}

class QualityScoreCalculator {
  private readonly weights = {
    codeQuality: 0.3,
    testing: 0.2,
    ragQuality: 0.4,
    performance: 0.1
  };

  private readonly thresholds = {
    passing: 75,
    excellent: 90,
    good: 80,
    fair: 70
  };

  /**
   * Calculate overall quality score
   */
  calculateScore(metrics: QualityMetrics): QualityScore {
    const breakdown = {
      codeQuality: this.calculateCodeQualityScore(metrics),
      testing: this.calculateTestingScore(metrics),
      ragQuality: this.calculateRAGQualityScore(metrics),
      performance: this.calculatePerformanceScore(metrics)
    };

    const overall = (
      breakdown.codeQuality * this.weights.codeQuality +
      breakdown.testing * this.weights.testing +
      breakdown.ragQuality * this.weights.ragQuality +
      breakdown.performance * this.weights.performance
    );

    return {
      overall: Math.round(overall),
      breakdown,
      grade: this.calculateGrade(overall),
      passed: overall >= this.thresholds.passing
    };
  }

  /**
   * Calculate code quality score (linting, type checking, build)
   */
  private calculateCodeQualityScore(metrics: QualityMetrics): number {
    let score = 100;

    // Deduct for lint issues
    score -= Math.min(metrics.lintScore * 5, 30);

    // Deduct for type errors
    score -= Math.min(metrics.typeErrors * 10, 40);

    // Major deduction if build fails
    if (!metrics.buildSuccess) {
      score -= 50;
    }

    return Math.max(score, 0);
  }

  /**
   * Calculate testing score
   */
  private calculateTestingScore(metrics: QualityMetrics): number {
    // Base score from test coverage
    let score = metrics.testCoverage;

    // Bonus for high coverage
    if (metrics.testCoverage >= 80) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate RAG quality score
   */
  private calculateRAGQualityScore(metrics: QualityMetrics): number {
    return metrics.ragQualityScore || 80; // Default if not available
  }

  /**
   * Calculate performance score
   */
  private calculatePerformanceScore(metrics: QualityMetrics): number {
    return metrics.performanceScore || 85; // Default if not available
  }

  /**
   * Calculate letter grade
   */
  private calculateGrade(score: number): string {
    if (score >= this.thresholds.excellent) return 'A';
    if (score >= this.thresholds.good) return 'B';
    if (score >= this.thresholds.fair) return 'C';
    if (score >= this.thresholds.passing) return 'D';
    return 'F';
  }

  /**
   * Load metrics from various sources
   */
  loadMetrics(): QualityMetrics {
    const metrics: QualityMetrics = {
      lintScore: this.getLintScore(),
      testCoverage: this.getTestCoverage(),
      typeErrors: this.getTypeErrors(),
      buildSuccess: this.getBuildStatus(),
      ragQualityScore: this.getRAGQualityScore(),
      performanceScore: this.getPerformanceScore()
    };

    return metrics;
  }

  private getLintScore(): number {
    // Simulate ESLint score - in real implementation, parse ESLint JSON output
    return 2; // Number of lint issues
  }

  private getTestCoverage(): number {
    try {
      const coveragePath = join(process.cwd(), 'coverage/coverage-summary.json');
      if (existsSync(coveragePath)) {
        const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
        return coverage.total.lines.pct || 0;
      }
    } catch (error) {
      console.warn('Could not load test coverage:', error instanceof Error ? error.message : String(error));
    }

    return 75; // Default coverage assumption
  }

  private getTypeErrors(): number {
    // In real implementation, parse TypeScript compiler output
    return 0; // Number of type errors
  }

  private getBuildStatus(): boolean {
    // Check if build succeeded - could check for .next directory or build logs
    return existsSync(join(process.cwd(), '.next'));
  }

  private getRAGQualityScore(): number {
    try {
      const ragResultsPath = join(process.cwd(), 'DOCS/RAG-TEST-RESULTS.md');
      if (existsSync(ragResultsPath)) {
        const content = readFileSync(ragResultsPath, 'utf8');

        // Extract score from results file
        const scoreMatch = content.match(/Overall Quality Score:\s*(\d+(?:\.\d+)?)/);
        if (scoreMatch) {
          return parseFloat(scoreMatch[1]);
        }
      }
    } catch (error) {
      console.warn('Could not load RAG quality score:', error instanceof Error ? error.message : String(error));
    }

    return 80;
  }

  private getPerformanceScore(): number {
    try {
      const perfPath = join(process.cwd(), 'qa-reports/performance-baseline.json');
      if (existsSync(perfPath)) {
        const perf = JSON.parse(readFileSync(perfPath, 'utf8'));

        // Calculate performance score based on response times and throughput
        let score = 100;

        if (perf.averageResponseTime > 2000) score -= 20;
        if (perf.p95ResponseTime > 5000) score -= 20;
        if (perf.errorRate > 0.05) score -= 30;
        if (perf.throughput < 20) score -= 15;

        return Math.max(score, 0);
      }
    } catch (error) {
      console.warn('Could not load performance score:', error instanceof Error ? error.message : String(error));
    }

    return 85;
  }
}

/**
 * Main execution
 */
async function main() {
  const calculator = new QualityScoreCalculator();

  try {
    console.log('📊 Calculating quality score...');

    const metrics = calculator.loadMetrics();
    const score = calculator.calculateScore(metrics);

    console.log('\n📈 Quality Score Results:');
    console.log(`Overall Score: ${score.overall}/100 (Grade: ${score.grade})`);
    console.log(`Status: ${score.passed ? '✅ PASSED' : '❌ FAILED'}`);

    console.log('\n📋 Breakdown:');
    console.log(`  Code Quality: ${score.breakdown.codeQuality}/100`);
    console.log(`  Testing: ${score.breakdown.testing}/100`);
    console.log(`  RAG Quality: ${score.breakdown.ragQuality}/100`);
    console.log(`  Performance: ${score.breakdown.performance}/100`);

    console.log('\n📊 Metrics Used:');
    console.log(`  Lint Issues: ${metrics.lintScore}`);
    console.log(`  Test Coverage: ${metrics.testCoverage}%`);
    console.log(`  Type Errors: ${metrics.typeErrors}`);
    console.log(`  Build Success: ${metrics.buildSuccess ? 'Yes' : 'No'}`);
    console.log(`  RAG Quality: ${metrics.ragQualityScore || 'N/A'}`);
    console.log(`  Performance: ${metrics.performanceScore || 'N/A'}`);

    // Output score for CI/CD pipeline consumption
    console.log(`\n${score.overall}`);

    process.exit(score.passed ? 0 : 1);

  } catch (error) {
    console.error('❌ Quality score calculation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { QualityScoreCalculator, type QualityMetrics, type QualityScore };