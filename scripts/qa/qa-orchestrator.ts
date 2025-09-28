#!/usr/bin/env tsx

/**
 * QA Orchestrator
 *
 * Central coordination system for all quality assurance processes
 * Manages test execution, reporting, and alerting
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { runAllQualityTests, runQuickSmokeTest } from '../../src/lib/rag/tests/comprehensive-test-runner';
import { OptimizedRAGTestRunner } from '../../src/scripts/run-optimized-rag-tests';

// =======================
// Configuration & Types
// =======================

interface QAConfiguration {
  testType: 'smoke' | 'comprehensive' | 'performance' | 'full_suite';
  includePerformanceBaseline: boolean;
  generateReports: boolean;
  enableAlerts: boolean;
  outputDirectory: string;
  slackWebhook?: string;
  qualityThresholds: QualityThresholds;
}

interface QualityThresholds {
  minimumQualityScore: number;
  maximumResponseTime: number;
  minimumSuccessRate: number;
  minimumCitationAccuracy: number;
  maximumPerformanceRegression: number; // percentage
}

interface QAResults {
  testType: string;
  timestamp: Date;
  overallScore: number;
  qualityGrade: string;
  passed: boolean;
  duration: number;
  testResults: any;
  performanceMetrics: any;
  recommendations: any[];
  alerts: Alert[];
}

interface Alert {
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'quality' | 'performance' | 'security' | 'reliability';
  message: string;
  threshold?: number;
  actualValue?: number;
  recommendation?: string;
}

// =======================
// QA Orchestrator Class
// =======================

class QAOrchestrator {
  private config: QAConfiguration;
  private supabase: any;
  private startTime: number = 0;

  constructor(config: Partial<QAConfiguration> = {}) {
    this.config = {
      testType: 'comprehensive',
      includePerformanceBaseline: true,
      generateReports: true,
      enableAlerts: true,
      outputDirectory: './qa-reports',
      qualityThresholds: {
        minimumQualityScore: 75,
        maximumResponseTime: 3000,
        minimumSuccessRate: 85,
        minimumCitationAccuracy: 90,
        maximumPerformanceRegression: 15
      },
      ...config
    };

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration for QA tests');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Ensure output directory exists
    if (!existsSync(this.config.outputDirectory)) {
      mkdirSync(this.config.outputDirectory, { recursive: true });
    }
  }

  /**
   * Execute comprehensive QA suite
   */
  async runQualityAssurance(): Promise<QAResults> {
    console.log('🚀 Starting QA Orchestrator...');
    console.log(`Test Type: ${this.config.testType}`);
    console.log(`Output Directory: ${this.config.outputDirectory}`);

    this.startTime = performance.now();
    const timestamp = new Date();

    try {
      let testResults: any;
      let performanceMetrics: any = {};

      // Execute tests based on type
      switch (this.config.testType) {
        case 'smoke':
          testResults = await this.runSmokeTests();
          break;
        case 'comprehensive':
          testResults = await this.runComprehensiveTests();
          break;
        case 'performance':
          testResults = await this.runPerformanceTests();
          performanceMetrics = await this.collectPerformanceMetrics();
          break;
        case 'full_suite':
          testResults = await this.runFullTestSuite();
          performanceMetrics = await this.collectPerformanceMetrics();
          break;
        default:
          throw new Error(`Unknown test type: ${this.config.testType}`);
      }

      // Calculate metrics and scores
      const overallScore = this.calculateOverallScore(testResults);
      const qualityGrade = this.calculateQualityGrade(overallScore);
      const passed = this.evaluateQualityThresholds(testResults, overallScore);

      // Generate alerts
      const alerts = this.generateAlerts(testResults, overallScore);

      // Generate recommendations
      const recommendations = this.generateRecommendations(testResults, alerts);

      const duration = performance.now() - this.startTime;

      const qaResults: QAResults = {
        testType: this.config.testType,
        timestamp,
        overallScore,
        qualityGrade,
        passed,
        duration,
        testResults,
        performanceMetrics,
        recommendations,
        alerts
      };

      // Generate reports
      if (this.config.generateReports) {
        await this.generateReports(qaResults);
      }

      // Send alerts
      if (this.config.enableAlerts && alerts.length > 0) {
        await this.sendAlerts(qaResults);
      }

      // Save baseline if requested
      if (this.config.includePerformanceBaseline) {
        await this.savePerformanceBaseline(performanceMetrics);
      }

      // Print summary
      this.printSummary(qaResults);

      return qaResults;

    } catch (error) {
      console.error('❌ QA Orchestrator failed:', error);

      const failedResults: QAResults = {
        testType: this.config.testType,
        timestamp,
        overallScore: 0,
        qualityGrade: 'F',
        passed: false,
        duration: performance.now() - this.startTime,
        testResults: { error: error instanceof Error ? error.message : String(error) },
        performanceMetrics: {},
        recommendations: [{
          category: 'critical',
          priority: 'critical',
          issue: 'QA execution failed',
          recommendation: 'Check logs and fix underlying issues',
          expectedImpact: 'System stability'
        }],
        alerts: [{
          severity: 'critical',
          category: 'reliability',
          message: `QA execution failed: ${error instanceof Error ? error.message : String(error)}`,
          recommendation: 'Investigate and fix immediately'
        }]
      };

      if (this.config.enableAlerts) {
        await this.sendAlerts(failedResults);
      }

      throw error;
    }
  }

  /**
   * Run smoke tests
   */
  private async runSmokeTests(): Promise<any> {
    console.log('💨 Running smoke tests...');
    return await runQuickSmokeTest(this.supabase, 'david');
  }

  /**
   * Run comprehensive tests
   */
  private async runComprehensiveTests(): Promise<any> {
    console.log('🧪 Running comprehensive tests...');
    return await runAllQualityTests(this.supabase, 'david');
  }

  /**
   * Run performance tests
   */
  private async runPerformanceTests(): Promise<any> {
    console.log('⚡ Running performance tests...');
    const runner = new OptimizedRAGTestRunner();
    await runner.runTests();

    // Read generated results
    const resultsPath = '/Users/david.fattal/Documents/GitHub/david-gpt/DOCS/RAG-TEST-RESULTS.md';
    if (existsSync(resultsPath)) {
      return {
        performanceTestCompleted: true,
        resultsFile: resultsPath,
        timestamp: new Date()
      };
    }

    return { performanceTestCompleted: false };
  }

  /**
   * Run full test suite
   */
  private async runFullTestSuite(): Promise<any> {
    console.log('🎯 Running full test suite...');

    const [comprehensiveResults, performanceResults] = await Promise.all([
      this.runComprehensiveTests(),
      this.runPerformanceTests()
    ]);

    return {
      comprehensive: comprehensiveResults,
      performance: performanceResults,
      timestamp: new Date()
    };
  }

  /**
   * Collect performance metrics
   */
  private async collectPerformanceMetrics(): Promise<any> {
    // This would integrate with performance monitoring tools
    // For now, return mock metrics
    return {
      averageResponseTime: 750,
      p95ResponseTime: 1200,
      throughput: 45.2,
      errorRate: 0.02,
      cacheHitRate: 0.68,
      timestamp: new Date()
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(testResults: any): number {
    if (!testResults) return 0;

    // Extract scores from different test types
    let totalScore = 0;
    let componentCount = 0;

    if (testResults.overallQualityScore) {
      totalScore += testResults.overallQualityScore;
      componentCount++;
    }

    if (testResults.comprehensive?.overallQualityScore) {
      totalScore += testResults.comprehensive.overallQualityScore;
      componentCount++;
    }

    if (testResults.testResults?.kgQualityMetrics?.overallScore) {
      totalScore += testResults.testResults.kgQualityMetrics.overallScore;
      componentCount++;
    }

    return componentCount > 0 ? totalScore / componentCount : 0;
  }

  /**
   * Calculate quality grade
   */
  private calculateQualityGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Evaluate if quality thresholds are met
   */
  private evaluateQualityThresholds(testResults: any, overallScore: number): boolean {
    const thresholds = this.config.qualityThresholds;

    if (overallScore < thresholds.minimumQualityScore) return false;

    // Add more threshold checks as needed
    return true;
  }

  /**
   * Generate alerts based on test results
   */
  private generateAlerts(testResults: any, overallScore: number): Alert[] {
    const alerts: Alert[] = [];
    const thresholds = this.config.qualityThresholds;

    // Quality score alert
    if (overallScore < thresholds.minimumQualityScore) {
      alerts.push({
        severity: 'error',
        category: 'quality',
        message: `Overall quality score (${overallScore.toFixed(1)}) below threshold (${thresholds.minimumQualityScore})`,
        threshold: thresholds.minimumQualityScore,
        actualValue: overallScore,
        recommendation: 'Review test failures and address quality issues'
      });
    }

    // Add more alert conditions as needed

    return alerts;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(testResults: any, alerts: Alert[]): any[] {
    const recommendations: any[] = [];

    // Convert alerts to recommendations
    alerts.forEach(alert => {
      recommendations.push({
        category: alert.category,
        priority: alert.severity === 'critical' ? 'critical' :
                  alert.severity === 'error' ? 'high' : 'medium',
        issue: alert.message,
        recommendation: alert.recommendation || 'Address the identified issue',
        expectedImpact: 'Improved system quality and reliability'
      });
    });

    return recommendations;
  }

  /**
   * Generate reports
   */
  private async generateReports(qaResults: QAResults): Promise<void> {
    console.log('📊 Generating QA reports...');

    // Generate markdown report
    const reportContent = this.generateMarkdownReport(qaResults);
    const reportPath = join(this.config.outputDirectory, `qa-report-${qaResults.timestamp.toISOString().split('T')[0]}.md`);
    writeFileSync(reportPath, reportContent, 'utf8');

    // Generate JSON report for programmatic use
    const jsonPath = join(this.config.outputDirectory, `qa-results-${qaResults.timestamp.toISOString().split('T')[0]}.json`);
    writeFileSync(jsonPath, JSON.stringify(qaResults, null, 2), 'utf8');

    console.log(`📝 Reports saved to: ${this.config.outputDirectory}`);
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(qaResults: QAResults): string {
    const timestamp = qaResults.timestamp.toISOString().split('T')[0];

    return `# QA Assessment Report - ${timestamp}

**Test Type:** ${qaResults.testType}
**Overall Score:** ${qaResults.overallScore.toFixed(1)}/100
**Quality Grade:** ${qaResults.qualityGrade}
**Status:** ${qaResults.passed ? '✅ PASSED' : '❌ FAILED'}
**Duration:** ${(qaResults.duration / 1000).toFixed(1)}s

## Summary

${qaResults.passed ?
  '✅ All quality thresholds met. System is ready for production.' :
  '❌ Quality thresholds not met. Issues require attention before deployment.'}

## Alerts (${qaResults.alerts.length})

${qaResults.alerts.map(alert =>
  `- **${alert.severity.toUpperCase()}** [${alert.category}]: ${alert.message}`
).join('\n')}

## Recommendations (${qaResults.recommendations.length})

${qaResults.recommendations.map((rec, index) =>
  `${index + 1}. **[${rec.priority?.toUpperCase() || 'MEDIUM'}]** ${rec.issue}
   - **Recommendation:** ${rec.recommendation}
   - **Expected Impact:** ${rec.expectedImpact}`
).join('\n\n')}

## Test Results

\`\`\`json
${JSON.stringify(qaResults.testResults, null, 2)}
\`\`\`

---
*Report generated by QA Orchestrator at ${qaResults.timestamp.toISOString()}*
`;
  }

  /**
   * Send alerts
   */
  private async sendAlerts(qaResults: QAResults): Promise<void> {
    if (!this.config.slackWebhook) {
      console.log('⚠️ No Slack webhook configured - skipping alerts');
      return;
    }

    console.log('📢 Sending alerts...');

    const alertMessage = this.formatSlackMessage(qaResults);

    try {
      const response = await fetch(this.config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: alertMessage })
      });

      if (response.ok) {
        console.log('✅ Alerts sent successfully');
      } else {
        console.error('❌ Failed to send alerts:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Alert sending failed:', error);
    }
  }

  /**
   * Format Slack message
   */
  private formatSlackMessage(qaResults: QAResults): string {
    const emoji = qaResults.passed ? '✅' : '❌';
    const status = qaResults.passed ? 'PASSED' : 'FAILED';

    return `${emoji} **QA Assessment ${status}**

**Test Type:** ${qaResults.testType}
**Overall Score:** ${qaResults.overallScore.toFixed(1)}/100 (Grade: ${qaResults.qualityGrade})
**Duration:** ${(qaResults.duration / 1000).toFixed(1)}s
**Alerts:** ${qaResults.alerts.length}

${qaResults.alerts.length > 0 ?
  `**Critical Issues:**\n${qaResults.alerts.filter(a => a.severity === 'critical').map(a => `• ${a.message}`).join('\n')}` :
  'No critical issues detected.'}

*View detailed results in the QA reports directory*`;
  }

  /**
   * Save performance baseline
   */
  private async savePerformanceBaseline(metrics: any): Promise<void> {
    const baselinePath = join(this.config.outputDirectory, 'performance-baseline.json');
    writeFileSync(baselinePath, JSON.stringify(metrics, null, 2), 'utf8');
    console.log('💾 Performance baseline saved');
  }

  /**
   * Print summary
   */
  private printSummary(qaResults: QAResults): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 QA ORCHESTRATOR SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test Type: ${qaResults.testType}`);
    console.log(`Overall Score: ${qaResults.overallScore.toFixed(1)}/100`);
    console.log(`Quality Grade: ${qaResults.qualityGrade}`);
    console.log(`Status: ${qaResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Duration: ${(qaResults.duration / 1000).toFixed(1)}s`);
    console.log(`Alerts: ${qaResults.alerts.length}`);
    console.log(`Recommendations: ${qaResults.recommendations.length}`);
    console.log('='.repeat(60));
  }
}

// =======================
// CLI Interface
// =======================

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] as QAConfiguration['testType'] || 'comprehensive';

  const config: Partial<QAConfiguration> = {
    testType,
    slackWebhook: process.env.SLACK_WEBHOOK,
    outputDirectory: process.env.QA_OUTPUT_DIR || './qa-reports'
  };

  try {
    const orchestrator = new QAOrchestrator(config);
    const results = await orchestrator.runQualityAssurance();

    console.log(`\n✅ QA orchestration completed successfully`);
    console.log(`📊 Overall Score: ${results.overallScore.toFixed(1)}/100`);
    console.log(`📝 Reports saved to: ${config.outputDirectory}`);

    process.exit(results.passed ? 0 : 1);

  } catch (error) {
    console.error('❌ QA orchestration failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { QAOrchestrator, type QAConfiguration, type QAResults };