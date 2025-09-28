/**
 * Performance Test Suite for Three-Tier RAG Architecture
 *
 * Comprehensive benchmarking and validation of the enhanced metadata search system.
 * Tests SQL, Vector, and Content tier performance and validates search quality improvements.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { classifySearchQuery } from './three-tier-search';
import { searchCorpus } from './search-tools';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// =======================
// Test Query Definitions
// =======================

interface TestQuery {
  query: string;
  expectedTier: 'sql' | 'vector' | 'content';
  expectedPerformance: number; // milliseconds
  category: string;
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  // SQL Tier Tests (should be <200ms)
  {
    query: 'Patent US11234567',
    expectedTier: 'sql',
    expectedPerformance: 200,
    category: 'exact_lookup',
    description: 'Patent number lookup',
  },
  {
    query: 'DOI 10.1038/s41566-023-01234',
    expectedTier: 'sql',
    expectedPerformance: 200,
    category: 'exact_lookup',
    description: 'DOI lookup',
  },
  {
    query: 'arxiv:2301.12345',
    expectedTier: 'sql',
    expectedPerformance: 200,
    category: 'exact_lookup',
    description: 'ArXiv ID lookup',
  },
  {
    query: 'filed 2023',
    expectedTier: 'sql',
    expectedPerformance: 200,
    category: 'date_query',
    description: 'Date-based search',
  },
  {
    query: 'granted after 2020',
    expectedTier: 'sql',
    expectedPerformance: 200,
    category: 'date_query',
    description: 'Date range search',
  },

  // Vector Tier Tests (should be ~500ms)
  {
    query: 'Who invented lightfield displays?',
    expectedTier: 'vector',
    expectedPerformance: 500,
    category: 'entity_query',
    description: 'Inventor identification',
  },
  {
    query: 'David Fattal patents',
    expectedTier: 'vector',
    expectedPerformance: 500,
    category: 'entity_query',
    description: 'Author/inventor search',
  },
  {
    query: 'inventors of this patent',
    expectedTier: 'vector',
    expectedPerformance: 500,
    category: 'metadata_query',
    description: 'Metadata extraction',
  },
  {
    query: 'find papers by Stanford University',
    expectedTier: 'vector',
    expectedPerformance: 500,
    category: 'affiliation_query',
    description: 'Institution-based search',
  },
  {
    query: 'documents related to 3D displays',
    expectedTier: 'vector',
    expectedPerformance: 500,
    category: 'semantic_query',
    description: 'Semantic topic search',
  },

  // Content Tier Tests (should be ~1000ms)
  {
    query: 'How do lightfield displays work?',
    expectedTier: 'content',
    expectedPerformance: 1000,
    category: 'explanation',
    description: 'Technical explanation',
  },
  {
    query: 'Explain 3D visualization technology',
    expectedTier: 'content',
    expectedPerformance: 1000,
    category: 'explanation',
    description: 'Concept explanation',
  },
  {
    query: 'What is the difference between OLED and lightfield?',
    expectedTier: 'content',
    expectedPerformance: 1000,
    category: 'comparison',
    description: 'Technology comparison',
  },
  {
    query: 'implementation of holographic displays',
    expectedTier: 'content',
    expectedPerformance: 1000,
    category: 'technical_detail',
    description: 'Implementation details',
  },
  {
    query: 'compare 3D display technologies',
    expectedTier: 'content',
    expectedPerformance: 1000,
    category: 'comparison',
    description: 'Comparative analysis',
  },
];

// =======================
// Performance Testing
// =======================

interface PerformanceResult {
  query: string;
  expectedTier: string;
  actualTier: string;
  executionTime: number;
  success: boolean;
  resultCount: number;
  tierClassificationCorrect: boolean;
  performanceTarget: number;
  performanceMet: boolean;
  error?: string;
}

interface TestSuiteResults {
  totalQueries: number;
  successfulQueries: number;
  tierClassificationAccuracy: number;
  performanceTargetsMet: number;
  averageExecutionTime: number;
  results: PerformanceResult[];
  tierBreakdown: {
    sql: { count: number; avgTime: number; successRate: number };
    vector: { count: number; avgTime: number; successRate: number };
    content: { count: number; avgTime: number; successRate: number };
  };
}

export class PerformanceTestSuite {
  private results: PerformanceResult[] = [];

  /**
   * Run comprehensive performance test suite
   */
  async runFullTestSuite(): Promise<TestSuiteResults> {
    console.log(
      '🚀 Starting Performance Test Suite for Three-Tier RAG Architecture\n'
    );
    console.log(`Testing ${TEST_QUERIES.length} queries across all tiers...\n`);

    this.results = [];

    // Test each query
    for (let i = 0; i < TEST_QUERIES.length; i++) {
      const testQuery = TEST_QUERIES[i];
      console.log(
        `\n[${i + 1}/${TEST_QUERIES.length}] Testing: "${testQuery.query}"`
      );
      console.log(
        `Expected: ${testQuery.expectedTier.toUpperCase()} tier, <${testQuery.expectedPerformance}ms`
      );

      const result = await this.testSingleQuery(testQuery);
      this.results.push(result);

      // Log result
      const status = result.success ? '✅' : '❌';
      const tierStatus = result.tierClassificationCorrect ? '✅' : '❌';
      const perfStatus = result.performanceMet ? '✅' : '❌';

      console.log(
        `${status} Result: ${result.actualTier.toUpperCase()} tier, ${result.executionTime}ms, ${result.resultCount} results`
      );
      console.log(
        `${tierStatus} Tier Classification | ${perfStatus} Performance Target`
      );

      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      }
    }

    return this.generateTestSummary();
  }

  /**
   * Test a single query and measure performance
   */
  private async testSingleQuery(
    testQuery: TestQuery
  ): Promise<PerformanceResult> {
    const startTime = Date.now();

    try {
      // Step 1: Test query classification
      const classification = classifySearchQuery(testQuery.query);
      const tierClassificationCorrect =
        classification.tier === testQuery.expectedTier;

      // Step 2: Execute actual search
      const searchResult = await searchCorpus({
        query: testQuery.query,
        limit: 10,
        supabaseClient: supabase,
      });

      const executionTime = Date.now() - startTime;
      const performanceMet = executionTime <= testQuery.expectedPerformance;

      return {
        query: testQuery.query,
        expectedTier: testQuery.expectedTier,
        actualTier: classification.tier,
        executionTime,
        success: searchResult.success,
        resultCount: searchResult.results?.length || 0,
        tierClassificationCorrect,
        performanceTarget: testQuery.expectedPerformance,
        performanceMet,
        error: searchResult.success ? undefined : searchResult.error,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        query: testQuery.query,
        expectedTier: testQuery.expectedTier,
        actualTier: 'unknown',
        executionTime,
        success: false,
        resultCount: 0,
        tierClassificationCorrect: false,
        performanceTarget: testQuery.expectedPerformance,
        performanceMet: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate comprehensive test summary
   */
  private generateTestSummary(): TestSuiteResults {
    const totalQueries = this.results.length;
    const successfulQueries = this.results.filter(r => r.success).length;
    const correctClassifications = this.results.filter(
      r => r.tierClassificationCorrect
    ).length;
    const performanceTargetsMet = this.results.filter(
      r => r.performanceMet
    ).length;

    const totalExecutionTime = this.results.reduce(
      (sum, r) => sum + r.executionTime,
      0
    );
    const averageExecutionTime = totalExecutionTime / totalQueries;

    // Calculate tier-specific metrics
    const tierBreakdown = {
      sql: this.calculateTierMetrics('sql'),
      vector: this.calculateTierMetrics('vector'),
      content: this.calculateTierMetrics('content'),
    };

    return {
      totalQueries,
      successfulQueries,
      tierClassificationAccuracy: (correctClassifications / totalQueries) * 100,
      performanceTargetsMet,
      averageExecutionTime,
      results: this.results,
      tierBreakdown,
    };
  }

  /**
   * Calculate metrics for a specific tier
   */
  private calculateTierMetrics(tier: string) {
    const tierResults = this.results.filter(r => r.expectedTier === tier);
    const successfulTierResults = tierResults.filter(r => r.success);

    return {
      count: tierResults.length,
      avgTime:
        tierResults.length > 0
          ? tierResults.reduce((sum, r) => sum + r.executionTime, 0) /
            tierResults.length
          : 0,
      successRate:
        tierResults.length > 0
          ? (successfulTierResults.length / tierResults.length) * 100
          : 0,
    };
  }

  /**
   * Print detailed test results
   */
  printResults(results: TestSuiteResults): void {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 PERFORMANCE TEST SUITE RESULTS');
    console.log('='.repeat(80));

    // Overall Statistics
    console.log('\n📊 Overall Performance:');
    console.log(
      `✅ Successful Queries: ${results.successfulQueries}/${results.totalQueries} (${((results.successfulQueries / results.totalQueries) * 100).toFixed(1)}%)`
    );
    console.log(
      `🎯 Tier Classification Accuracy: ${results.tierClassificationAccuracy.toFixed(1)}%`
    );
    console.log(
      `⚡ Performance Targets Met: ${results.performanceTargetsMet}/${results.totalQueries} (${((results.performanceTargetsMet / results.totalQueries) * 100).toFixed(1)}%)`
    );
    console.log(
      `⏱️  Average Execution Time: ${results.averageExecutionTime.toFixed(0)}ms`
    );

    // Tier-specific Performance
    console.log('\n🔍 Tier-Specific Performance:');
    Object.entries(results.tierBreakdown).forEach(([tier, metrics]) => {
      console.log(`\n${tier.toUpperCase()} Tier:`);
      console.log(`  Queries: ${metrics.count}`);
      console.log(`  Average Time: ${metrics.avgTime.toFixed(0)}ms`);
      console.log(`  Success Rate: ${metrics.successRate.toFixed(1)}%`);
    });

    // Performance Analysis
    console.log('\n📈 Performance Analysis:');
    const sqlQueries = results.results.filter(
      r => r.expectedTier === 'sql' && r.success
    );
    const fastSqlQueries = sqlQueries.filter(r => r.executionTime < 200);
    console.log(
      `⚡ SQL Tier Speed: ${fastSqlQueries.length}/${sqlQueries.length} queries <200ms (${((fastSqlQueries.length / sqlQueries.length) * 100).toFixed(1)}%)`
    );

    const vectorQueries = results.results.filter(
      r => r.expectedTier === 'vector' && r.success
    );
    const reasonableVectorQueries = vectorQueries.filter(
      r => r.executionTime < 1000
    );
    console.log(
      `🎯 Vector Tier Speed: ${reasonableVectorQueries.length}/${vectorQueries.length} queries <1000ms (${((reasonableVectorQueries.length / vectorQueries.length) * 100).toFixed(1)}%)`
    );

    // Failed Queries
    const failedQueries = results.results.filter(r => !r.success);
    if (failedQueries.length > 0) {
      console.log('\n❌ Failed Queries:');
      failedQueries.forEach(result => {
        console.log(`  "${result.query}": ${result.error}`);
      });
    }

    // Misclassified Queries
    const misclassified = results.results.filter(
      r => !r.tierClassificationCorrect
    );
    if (misclassified.length > 0) {
      console.log('\n🔄 Misclassified Queries:');
      misclassified.forEach(result => {
        console.log(
          `  "${result.query}": Expected ${result.expectedTier.toUpperCase()}, got ${result.actualTier.toUpperCase()}`
        );
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

// =======================
// CLI Interface
// =======================

/**
 * Run the performance test suite from command line
 */
export async function runPerformanceTests(): Promise<void> {
  const testSuite = new PerformanceTestSuite();

  try {
    const results = await testSuite.runFullTestSuite();
    testSuite.printResults(results);

    // Success criteria evaluation
    console.log('\n🎯 Success Criteria Evaluation:');
    console.log(
      `✅ Search Success Rate: ${results.successfulQueries >= results.totalQueries * 0.95 ? 'PASS' : 'FAIL'} (${((results.successfulQueries / results.totalQueries) * 100).toFixed(1)}% >= 95%)`
    );
    console.log(
      `✅ Tier Classification: ${results.tierClassificationAccuracy >= 90 ? 'PASS' : 'FAIL'} (${results.tierClassificationAccuracy.toFixed(1)}% >= 90%)`
    );
    console.log(
      `✅ Performance Targets: ${results.performanceTargetsMet >= results.totalQueries * 0.8 ? 'PASS' : 'FAIL'} (${((results.performanceTargetsMet / results.totalQueries) * 100).toFixed(1)}% >= 80%)`
    );

    const sqlAvgTime = results.tierBreakdown.sql.avgTime;
    console.log(
      `✅ SQL Tier Speed: ${sqlAvgTime < 200 ? 'PASS' : 'FAIL'} (${sqlAvgTime.toFixed(0)}ms < 200ms)`
    );
  } catch (error) {
    console.error('❌ Performance test suite failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}
