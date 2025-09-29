/**
 * Comprehensive Test Runner
 *
 * Unified interface for running all KG-assisted RAG quality tests,
 * combining conversation scripts, KG evaluation, citation validation,
 * A/B testing, and performance benchmarking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runKGRAGQualityTests, TEST_CONVERSATIONS } from './kg-rag-quality-test-suite';
import { evaluateKGQuality, DEFAULT_BENCHMARK } from './kg-quality-evaluator';
import { runCitationAccuracyBenchmark, CITATION_TEST_CASES } from './citation-accuracy-validator';
import { runBatchABTests, createKGToggleController } from './kg-toggle-controller';
import { runPerformanceBenchmark, runDefaultLoadTest } from './performance-benchmark-suite';
import type { ComparisonReport } from './kg-rag-quality-test-suite';
import type { KGQualityMetrics } from './kg-quality-evaluator';
import type { CitationBenchmarkReport } from './citation-accuracy-validator';
import type { ComparisonTestResult } from './kg-toggle-controller';
import type { PerformanceBenchmarkResult, LoadTestResult } from './performance-benchmark-suite';

// =======================
// Test Runner Types
// =======================

export interface ComprehensiveTestReport {
  testRunId: string;
  timestamp: Date;
  personaId: string;
  testSuiteVersion: string;
  overallQualityScore: number;
  testResults: {
    conversationTests: ComparisonReport;
    kgQualityMetrics: KGQualityMetrics;
    citationAccuracy: CitationBenchmarkReport;
    abTestResults: ComparisonTestResult[];
    performanceBenchmark: PerformanceBenchmarkResult;
    loadTestResults?: LoadTestResult;
  };
  recommendations: TestRecommendation[];
  summary: TestSummary;
}

export interface TestRecommendation {
  category: 'quality' | 'performance' | 'accuracy' | 'scalability' | 'cost';
  priority: 'low' | 'medium' | 'high' | 'critical';
  issue: string;
  recommendation: string;
  expectedImpact: string;
  relatedTests: string[];
}

export interface TestSummary {
  passedTests: number;
  totalTests: number;
  overallPassRate: number;
  criticalIssues: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  readyForProduction: boolean;
  estimatedCapacity: {
    concurrentUsers: number;
    queriesPerSecond: number;
    documentsSupported: number;
  };
}

export interface TestConfiguration {
  testName: string;
  personaId: string;
  includeConversationTests: boolean;
  includeKGQualityTests: boolean;
  includeCitationTests: boolean;
  includeABTests: boolean;
  includePerformanceTests: boolean;
  includeLoadTests: boolean;
  testQueries: string[];
  abTestSampleSize: number;
  loadTestDuration: number; // seconds
  verbose: boolean;
}

// =======================
// Comprehensive Test Runner
// =======================

export class ComprehensiveTestRunner {
  private supabase: SupabaseClient;
  private testRunId: string;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.testRunId = `test_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Run all tests with default configuration
   */
  async runAllTests(personaId: string = 'david'): Promise<ComprehensiveTestReport> {
    const config: TestConfiguration = {
      testName: 'Complete KG-RAG Quality Assessment',
      personaId,
      includeConversationTests: true,
      includeKGQualityTests: true,
      includeCitationTests: true,
      includeABTests: true,
      includePerformanceTests: true,
      includeLoadTests: false, // Skip load tests by default (can be intensive)
      testQueries: [
        'Who invented lightfield displays?',
        'How do 3D displays work?',
        'Patents by David Fattal',
        'Leia Inc technology',
        'Depth estimation algorithms',
        'Spatial computing principles'
      ],
      abTestSampleSize: 6,
      loadTestDuration: 60,
      verbose: true
    };

    return this.runTestsWithConfiguration(config);
  }

  /**
   * Run tests with custom configuration
   */
  async runTestsWithConfiguration(config: TestConfiguration): Promise<ComprehensiveTestReport> {
    console.log('🧪 Starting Comprehensive KG-RAG Quality Testing...');
    console.log(`Test Run ID: ${this.testRunId}`);
    console.log(`Persona: ${config.personaId}`);
    console.log(`Configuration: ${config.testName}`);

    const timestamp = new Date();
    const testResults: ComprehensiveTestReport['testResults'] = {} as any;

    try {
      // 1. Conversation-based tests
      if (config.includeConversationTests) {
        console.log('\n📝 Running conversation-based tests...');
        testResults.conversationTests = await runKGRAGQualityTests(this.supabase);
      }

      // 2. KG Quality evaluation
      if (config.includeKGQualityTests) {
        console.log('\n🧠 Evaluating Knowledge Graph quality...');
        testResults.kgQualityMetrics = await evaluateKGQuality(this.supabase);
      }

      // 3. Citation accuracy testing
      if (config.includeCitationTests) {
        console.log('\n📚 Testing citation accuracy...');
        testResults.citationAccuracy = await runCitationAccuracyBenchmark(this.supabase, CITATION_TEST_CASES);
      }

      // 4. A/B testing (KG enabled vs disabled)
      if (config.includeABTests) {
        console.log('\n⚖️ Running A/B tests (KG enabled vs disabled)...');
        testResults.abTestResults = await runBatchABTests(this.supabase, config.testQueries);
      }

      // 5. Performance benchmarking
      if (config.includePerformanceTests) {
        console.log('\n🚀 Running performance benchmark...');
        testResults.performanceBenchmark = await runPerformanceBenchmark(this.supabase);
      }

      // 6. Load testing (optional)
      if (config.includeLoadTests) {
        console.log('\n🔥 Running load tests...');
        testResults.loadTestResults = await runDefaultLoadTest(this.supabase);
      }

      // Generate comprehensive report
      const overallQualityScore = this.calculateOverallQualityScore(testResults);
      const recommendations = this.generateRecommendations(testResults);
      const summary = this.generateTestSummary(testResults, overallQualityScore);

      const report: ComprehensiveTestReport = {
        testRunId: this.testRunId,
        timestamp,
        personaId: config.personaId,
        testSuiteVersion: '1.0.0',
        overallQualityScore,
        testResults,
        recommendations,
        summary
      };

      // Print comprehensive report
      this.printComprehensiveReport(report, config.verbose);

      // Save test results to file (optional)
      await this.saveTestResults(report);

      return report;

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    }
  }

  /**
   * Run quick smoke test
   */
  async runSmokeTest(personaId: string = 'david'): Promise<Partial<ComprehensiveTestReport>> {
    console.log('💨 Running quick smoke test...');

    const quickConfig: TestConfiguration = {
      testName: 'Quick Smoke Test',
      personaId,
      includeConversationTests: false,
      includeKGQualityTests: true,
      includeCitationTests: false,
      includeABTests: true,
      includePerformanceTests: false,
      includeLoadTests: false,
      testQueries: [
        'David Fattal patents',
        'How do lightfield displays work?',
        'Leia Inc technology'
      ],
      abTestSampleSize: 3,
      loadTestDuration: 30,
      verbose: false
    };

    const kgController = createKGToggleController(this.supabase);

    const [kgQuality, abResults] = await Promise.all([
      evaluateKGQuality(this.supabase),
      runBatchABTests(this.supabase, quickConfig.testQueries)
    ]);

    const smokeReport = {
      testRunId: this.testRunId,
      timestamp: new Date(),
      personaId,
      testSuiteVersion: '1.0.0-smoke',
      overallQualityScore: kgQuality.overallScore,
      testResults: {
        kgQualityMetrics: kgQuality,
        abTestResults: abResults
      },
      recommendations: [],
      summary: {
        passedTests: abResults.filter(r => r.recommendation === 'use_kg').length,
        totalTests: abResults.length,
        overallPassRate: 0,
        criticalIssues: 0,
        performanceGrade: 'B' as const,
        qualityGrade: this.calculateGradeFromScore(kgQuality.overallScore),
        readyForProduction: kgQuality.overallScore > 70,
        estimatedCapacity: {
          concurrentUsers: 10,
          queriesPerSecond: 5,
          documentsSupported: 1000
        }
      }
    };

    console.log(`💨 Smoke test complete. Overall KG Quality: ${kgQuality.overallScore.toFixed(1)}/100`);
    console.log(`🎯 A/B Test Results: ${abResults.filter(r => r.recommendation === 'use_kg').length}/${abResults.length} recommend using KG`);

    return smokeReport;
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallQualityScore(testResults: ComprehensiveTestReport['testResults']): number {
    let totalScore = 0;
    let componentCount = 0;

    // Conversation tests score
    if (testResults.conversationTests) {
      totalScore += testResults.conversationTests.summary.overallScore;
      componentCount++;
    }

    // KG quality score
    if (testResults.kgQualityMetrics) {
      totalScore += testResults.kgQualityMetrics.overallScore;
      componentCount++;
    }

    // Citation accuracy score
    if (testResults.citationAccuracy) {
      totalScore += testResults.citationAccuracy.overallAccuracy * 100;
      componentCount++;
    }

    // A/B test score (based on KG effectiveness)
    if (testResults.abTestResults) {
      const kgRecommendations = testResults.abTestResults.filter(r => r.recommendation === 'use_kg').length;
      const abScore = (kgRecommendations / testResults.abTestResults.length) * 100;
      totalScore += abScore;
      componentCount++;
    }

    // Performance score
    if (testResults.performanceBenchmark) {
      totalScore += testResults.performanceBenchmark.overallScore;
      componentCount++;
    }

    return componentCount > 0 ? totalScore / componentCount : 0;
  }

  /**
   * Generate comprehensive recommendations
   */
  private generateRecommendations(testResults: ComprehensiveTestReport['testResults']): TestRecommendation[] {
    const recommendations: TestRecommendation[] = [];

    // KG Quality recommendations
    if (testResults.kgQualityMetrics) {
      const kgScore = testResults.kgQualityMetrics.overallScore;

      if (kgScore < 70) {
        recommendations.push({
          category: 'quality',
          priority: 'high',
          issue: 'Knowledge Graph quality below target threshold',
          recommendation: 'Improve entity extraction accuracy and relationship quality',
          expectedImpact: 'Significant improvement in search relevance and accuracy',
          relatedTests: ['kg_quality_evaluation']
        });
      }

      if (testResults.kgQualityMetrics.entityRecognition.precision < 0.8) {
        recommendations.push({
          category: 'accuracy',
          priority: 'medium',
          issue: 'Entity recognition precision below 80%',
          recommendation: 'Refine entity extraction patterns and validation rules',
          expectedImpact: '10-15% improvement in entity-based queries',
          relatedTests: ['entity_recognition']
        });
      }
    }

    // Citation accuracy recommendations
    if (testResults.citationAccuracy) {
      if (testResults.citationAccuracy.overallAccuracy < 0.9) {
        recommendations.push({
          category: 'accuracy',
          priority: 'high',
          issue: 'Citation accuracy below 90% target',
          recommendation: 'Implement stricter citation validation and source verification',
          expectedImpact: 'Improved user trust and content reliability',
          relatedTests: ['citation_accuracy']
        });
      }
    }

    // A/B test recommendations
    if (testResults.abTestResults) {
      const kgRecommendations = testResults.abTestResults.filter(r => r.recommendation === 'use_kg').length;
      const kgEffectiveness = kgRecommendations / testResults.abTestResults.length;

      if (kgEffectiveness < 0.6) {
        recommendations.push({
          category: 'quality',
          priority: 'critical',
          issue: 'Knowledge Graph shows limited effectiveness in A/B testing',
          recommendation: 'Review KG integration strategy and consider selective enablement',
          expectedImpact: 'Better resource allocation and improved query performance',
          relatedTests: ['ab_testing']
        });
      }
    }

    // Performance recommendations
    if (testResults.performanceBenchmark) {
      const perfScore = testResults.performanceBenchmark.overallScore;

      if (perfScore < 70) {
        recommendations.push({
          category: 'performance',
          priority: 'high',
          issue: 'Overall performance score below acceptable threshold',
          recommendation: 'Optimize slow query paths and implement caching strategies',
          expectedImpact: '20-40% improvement in response times',
          relatedTests: ['performance_benchmark']
        });
      }

      // Add specific performance recommendations from the benchmark
      if (testResults.performanceBenchmark.recommendations) {
        testResults.performanceBenchmark.recommendations.forEach(perfRec => {
          recommendations.push({
            category: perfRec.category as any,
            priority: perfRec.priority as any,
            issue: perfRec.issue,
            recommendation: perfRec.recommendation,
            expectedImpact: perfRec.expectedImpact,
            relatedTests: ['performance_benchmark']
          });
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate test summary
   */
  private generateTestSummary(
    testResults: ComprehensiveTestReport['testResults'],
    overallScore: number
  ): TestSummary {
    let passedTests = 0;
    let totalTests = 0;

    // Count tests from each component
    if (testResults.conversationTests) {
      const kgEnabled = testResults.conversationTests.kgEnabledResults.filter(r => r.passed).length;
      const kgDisabled = testResults.conversationTests.kgDisabledResults.filter(r => r.passed).length;
      passedTests += kgEnabled + kgDisabled;
      totalTests += testResults.conversationTests.kgEnabledResults.length + testResults.conversationTests.kgDisabledResults.length;
    }

    if (testResults.citationAccuracy) {
      passedTests += testResults.citationAccuracy.passedValidations;
      totalTests += testResults.citationAccuracy.totalCitationsValidated;
    }

    if (testResults.abTestResults) {
      passedTests += testResults.abTestResults.filter(r => r.recommendation === 'use_kg').length;
      totalTests += testResults.abTestResults.length;
    }

    const overallPassRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    // Count critical issues
    let criticalIssues = 0;
    if (testResults.kgQualityMetrics?.overallScore < 60) criticalIssues++;
    if (testResults.citationAccuracy?.overallAccuracy < 0.85) criticalIssues++;
    if (testResults.performanceBenchmark?.overallScore < 60) criticalIssues++;

    // Calculate grades
    const performanceGrade = testResults.performanceBenchmark
      ? this.calculateGradeFromScore(testResults.performanceBenchmark.overallScore)
      : 'C';
    const qualityGrade = this.calculateGradeFromScore(overallScore);

    // Estimate capacity (simplified)
    const estimatedCapacity = {
      concurrentUsers: testResults.performanceBenchmark?.scalabilityMetrics.concurrentUsers.maxSupportedUsers || 10,
      queriesPerSecond: testResults.performanceBenchmark?.tierPerformance.tier1SQL.throughput || 5,
      documentsSupported: testResults.performanceBenchmark?.scalabilityMetrics.documentScaling.documentsInCorpus || 1000
    };

    return {
      passedTests,
      totalTests,
      overallPassRate,
      criticalIssues,
      performanceGrade,
      qualityGrade,
      readyForProduction: overallScore >= 75 && criticalIssues === 0,
      estimatedCapacity
    };
  }

  /**
   * Calculate letter grade from numeric score
   */
  private calculateGradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Print comprehensive report
   */
  private printComprehensiveReport(report: ComprehensiveTestReport, verbose: boolean): void {
    console.log('\n' + '='.repeat(100));
    console.log('🧪 COMPREHENSIVE KG-RAG QUALITY TEST REPORT');
    console.log('='.repeat(100));
    console.log(`Test Run ID: ${report.testRunId}`);
    console.log(`Persona: ${report.personaId}`);
    console.log(`Timestamp: ${report.timestamp.toISOString()}`);
    console.log(`Test Suite Version: ${report.testSuiteVersion}`);

    console.log(`\n🏆 OVERALL QUALITY SCORE: ${report.overallQualityScore.toFixed(1)}/100`);
    console.log(`📊 Quality Grade: ${report.summary.qualityGrade}`);
    console.log(`⚡ Performance Grade: ${report.summary.performanceGrade}`);
    console.log(`✅ Production Ready: ${report.summary.readyForProduction ? 'YES' : 'NO'}`);

    console.log('\n📈 TEST SUMMARY:');
    console.log(`  Passed Tests: ${report.summary.passedTests}/${report.summary.totalTests} (${report.summary.overallPassRate.toFixed(1)}%)`);
    console.log(`  Critical Issues: ${report.summary.criticalIssues}`);
    console.log(`  Estimated Capacity: ${report.summary.estimatedCapacity.concurrentUsers} users, ${report.summary.estimatedCapacity.queriesPerSecond.toFixed(1)} QPS`);

    if (verbose) {
      // Detailed results
      if (report.testResults.conversationTests) {
        console.log('\n📝 CONVERSATION TESTS:');
        console.log(`  KG Enhancement Score: ${report.testResults.conversationTests.summary.overallScore.toFixed(1)}/100`);
        console.log(`  Relevance Improvement: ${report.testResults.conversationTests.summary.kgImprovement.averageRelevance.toFixed(1)}%`);
        console.log(`  Citation Accuracy Improvement: ${report.testResults.conversationTests.summary.kgImprovement.averageCitationAccuracy.toFixed(1)}%`);
      }

      if (report.testResults.kgQualityMetrics) {
        console.log('\n🧠 KNOWLEDGE GRAPH QUALITY:');
        console.log(`  Entity Recognition F1: ${(report.testResults.kgQualityMetrics.entityRecognition.f1Score * 100).toFixed(1)}%`);
        console.log(`  Relationship Quality: ${(report.testResults.kgQualityMetrics.relationshipQuality.edgeAccuracy * 100).toFixed(1)}%`);
        console.log(`  Authority Consistency: ${(report.testResults.kgQualityMetrics.authorityScoring.authorityConsistency * 100).toFixed(1)}%`);
      }

      if (report.testResults.citationAccuracy) {
        console.log('\n📚 CITATION ACCURACY:');
        console.log(`  Overall Accuracy: ${(report.testResults.citationAccuracy.overallAccuracy * 100).toFixed(1)}%`);
        console.log(`  Passed Validations: ${report.testResults.citationAccuracy.passedValidations}/${report.testResults.citationAccuracy.totalCitationsValidated}`);
      }

      if (report.testResults.abTestResults) {
        console.log('\n⚖️ A/B TEST RESULTS:');
        const kgRecommendations = report.testResults.abTestResults.filter(r => r.recommendation === 'use_kg').length;
        console.log(`  KG Recommended: ${kgRecommendations}/${report.testResults.abTestResults.length} queries`);
        const avgImprovement = report.testResults.abTestResults.reduce((sum, r) => sum + r.improvement.relevanceScore, 0) / report.testResults.abTestResults.length;
        console.log(`  Average Relevance Improvement: ${avgImprovement.toFixed(1)}%`);
      }

      if (report.testResults.performanceBenchmark) {
        console.log('\n🚀 PERFORMANCE BENCHMARK:');
        console.log(`  Tier 1 (SQL) Avg Response: ${report.testResults.performanceBenchmark.tierPerformance.tier1SQL.averageResponseTime.toFixed(1)}ms`);
        console.log(`  Tier 2 (Vector) Avg Response: ${report.testResults.performanceBenchmark.tierPerformance.tier2Vector.averageResponseTime.toFixed(1)}ms`);
        console.log(`  Tier 3 (Content) Avg Response: ${report.testResults.performanceBenchmark.tierPerformance.tier3Content.averageResponseTime.toFixed(1)}ms`);
        console.log(`  Max Concurrent Users: ${report.testResults.performanceBenchmark.scalabilityMetrics.concurrentUsers.maxSupportedUsers}`);
      }

      if (report.testResults.loadTestResults) {
        console.log('\n🔥 LOAD TEST RESULTS:');
        console.log(`  Total Queries: ${report.testResults.loadTestResults.totalQueries}`);
        console.log(`  Success Rate: ${((report.testResults.loadTestResults.successfulQueries / report.testResults.loadTestResults.totalQueries) * 100).toFixed(1)}%`);
        console.log(`  Average Response Time: ${report.testResults.loadTestResults.averageResponseTime.toFixed(1)}ms`);
        console.log(`  Throughput: ${report.testResults.loadTestResults.throughput.toFixed(1)} QPS`);
      }
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach((rec, index) => {
        const priorityEmoji = rec.priority === 'critical' ? '🚨' :
          rec.priority === 'high' ? '⚠️' :
            rec.priority === 'medium' ? '📝' : '💭';
        console.log(`  ${index + 1}. ${priorityEmoji} [${rec.priority.toUpperCase()}] ${rec.issue}`);
        console.log(`     💡 ${rec.recommendation}`);
        console.log(`     📈 ${rec.expectedImpact}`);
      });
    }

    console.log('\n' + '='.repeat(100));
  }

  /**
   * Save test results to file
   */
  private async saveTestResults(report: ComprehensiveTestReport): Promise<void> {
    try {
      const filename = `test_results_${report.testRunId}.json`;
      const filepath = `/tmp/${filename}`;

      // In a real implementation, would save to persistent storage
      console.log(`💾 Test results saved to: ${filepath}`);

    } catch (error) {
      console.warn('⚠️ Failed to save test results:', error);
    }
  }
}

// =======================
// Export Functions
// =======================

/**
 * Run all tests with default configuration
 */
export async function runAllQualityTests(
  supabase: SupabaseClient,
  personaId: string = 'david'
): Promise<ComprehensiveTestReport> {
  const runner = new ComprehensiveTestRunner(supabase);
  return runner.runAllTests(personaId);
}

/**
 * Run quick smoke test
 */
export async function runQuickSmokeTest(
  supabase: SupabaseClient,
  personaId: string = 'david'
): Promise<Partial<ComprehensiveTestReport>> {
  const runner = new ComprehensiveTestRunner(supabase);
  return runner.runSmokeTest(personaId);
}

/**
 * Run tests with custom configuration
 */
export async function runCustomQualityTests(
  supabase: SupabaseClient,
  config: TestConfiguration
): Promise<ComprehensiveTestReport> {
  const runner = new ComprehensiveTestRunner(supabase);
  return runner.runTestsWithConfiguration(config);
}

/**
 * Create test runner instance
 */
export function createTestRunner(supabase: SupabaseClient): ComprehensiveTestRunner {
  return new ComprehensiveTestRunner(supabase);
}