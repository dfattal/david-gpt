/**
 * Search Quality Validator
 *
 * Tests search quality improvements with the enhanced metadata architecture,
 * specifically validating that metadata queries now work correctly.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { searchCorpus } from './search-tools';
import { detectMetadataQuery, processMetadataQuery } from './metadata-search';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// =======================
// Test Query Definitions
// =======================

interface QualityTestQuery {
  query: string;
  expectedBehavior: 'metadata' | 'content' | 'hybrid';
  successCriteria: {
    shouldFindResults: boolean;
    shouldContainMetadata: boolean;
    shouldHaveEntities: boolean;
    shouldHaveCitations: boolean;
    minimumResults?: number;
  };
  description: string;
  category:
    | 'inventor_query'
    | 'author_query'
    | 'assignee_query'
    | 'date_query'
    | 'technical_query';
  testType:
    | 'metadata_chunk'
    | 'entity_extraction'
    | 'citation_accuracy'
    | 'content_quality';
}

const QUALITY_TEST_QUERIES: QualityTestQuery[] = [
  // Inventor Queries (Previously Failed)
  {
    query: 'Who are the inventors of this patent?',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should identify patent inventors from metadata chunks',
    category: 'inventor_query',
    testType: 'metadata_chunk',
  },
  {
    query: 'Who invented lightfield displays?',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should identify lightfield display inventors',
    category: 'inventor_query',
    testType: 'entity_extraction',
  },
  {
    query: 'David Fattal patents',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should find patents by David Fattal',
    category: 'inventor_query',
    testType: 'entity_extraction',
  },

  // Author Queries
  {
    query: 'Who are the authors of this paper?',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should identify paper authors from metadata chunks',
    category: 'author_query',
    testType: 'metadata_chunk',
  },
  {
    query: 'papers by Stanford University authors',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
    },
    description: 'Should find papers by institutional affiliation',
    category: 'author_query',
    testType: 'entity_extraction',
  },

  // Assignee/Company Queries
  {
    query: 'What patents are assigned to Leia Inc?',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should find patents by assignee',
    category: 'assignee_query',
    testType: 'entity_extraction',
  },
  {
    query: 'HP patents related to displays',
    expectedBehavior: 'hybrid',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: true,
      shouldHaveCitations: true,
    },
    description:
      'Should find HP display patents using both metadata and content',
    category: 'assignee_query',
    testType: 'citation_accuracy',
  },

  // Date Queries
  {
    query: 'patents filed in 2020',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: false, // Date queries may not have entities
      shouldHaveCitations: true,
    },
    description: 'Should find patents by filing date',
    category: 'date_query',
    testType: 'metadata_chunk',
  },
  {
    query: 'recent papers published after 2022',
    expectedBehavior: 'metadata',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: true,
      shouldHaveEntities: false,
      shouldHaveCitations: true,
    },
    description: 'Should find recent publications by date',
    category: 'date_query',
    testType: 'metadata_chunk',
  },

  // Technical Queries (Should work as before)
  {
    query: 'How do lightfield displays work?',
    expectedBehavior: 'content',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: false, // Primarily content-based
      shouldHaveEntities: false,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should provide technical explanations from content',
    category: 'technical_query',
    testType: 'content_quality',
  },
  {
    query: '3D display technology principles',
    expectedBehavior: 'content',
    successCriteria: {
      shouldFindResults: true,
      shouldContainMetadata: false,
      shouldHaveEntities: false,
      shouldHaveCitations: true,
      minimumResults: 1,
    },
    description: 'Should explain technical principles',
    category: 'technical_query',
    testType: 'content_quality',
  },
];

// =======================
// Quality Validation Results
// =======================

interface QualityTestResult {
  query: string;
  category: string;
  testType: string;
  passed: boolean;
  details: {
    foundResults: boolean;
    resultCount: number;
    hasMetadata: boolean;
    hasEntities: boolean;
    hasCitations: boolean;
    executionTime: number;
    tier: string;
  };
  issues: string[];
  score: number; // 0-100
}

interface QualityValidationSummary {
  totalTests: number;
  passedTests: number;
  overallScore: number;
  categoryScores: Record<string, number>;
  testTypeScores: Record<string, number>;
  results: QualityTestResult[];
  recommendations: string[];
}

// =======================
// Search Quality Validator
// =======================

export class SearchQualityValidator {
  private results: QualityTestResult[] = [];

  /**
   * Run comprehensive search quality validation
   */
  async runQualityValidation(): Promise<QualityValidationSummary> {
    console.log('🔍 Starting Search Quality Validation...\n');
    console.log(
      `Testing ${QUALITY_TEST_QUERIES.length} queries for metadata search improvements...\n`
    );

    this.results = [];

    for (let i = 0; i < QUALITY_TEST_QUERIES.length; i++) {
      const testQuery = QUALITY_TEST_QUERIES[i];
      console.log(
        `\n[${i + 1}/${QUALITY_TEST_QUERIES.length}] Testing: "${testQuery.query}"`
      );
      console.log(
        `Expected: ${testQuery.expectedBehavior} behavior | Category: ${testQuery.category}`
      );

      const result = await this.testSearchQuality(testQuery);
      this.results.push(result);

      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(
        `${status} (Score: ${result.score}/100) | ${result.details.tier.toUpperCase()} tier | ${result.details.resultCount} results | ${result.details.executionTime}ms`
      );

      if (result.issues.length > 0) {
        console.log(`  Issues: ${result.issues.join(', ')}`);
      }
    }

    return this.generateQualitySummary();
  }

  /**
   * Test search quality for a single query
   */
  private async testSearchQuality(
    testQuery: QualityTestQuery
  ): Promise<QualityTestResult> {
    const issues: string[] = [];
    let score = 0;
    const startTime = Date.now();

    try {
      // First check metadata query detection
      const metadataDetection = detectMetadataQuery(testQuery.query);

      if (
        testQuery.expectedBehavior === 'metadata' &&
        !metadataDetection.isMetadata
      ) {
        issues.push('Expected metadata query but not detected as such');
      }

      // Execute search
      const searchResult = await searchCorpus({
        query: testQuery.query,
        limit: 10,
        supabaseClient: supabase,
      });

      const executionTime = Date.now() - startTime;

      // Analyze results
      const foundResults =
        searchResult.success && (searchResult.results?.length || 0) > 0;
      const resultCount = searchResult.results?.length || 0;
      const tier = searchResult.searchMetadata?.tier || 'unknown';

      // Check if results contain metadata information
      const hasMetadata = this.checkForMetadataContent(
        searchResult.results || []
      );

      // Check for entity information
      const hasEntities = this.checkForEntityContent(
        searchResult.results || []
      );

      // Check for proper citations
      const hasCitations = this.checkForCitations(searchResult.citations || []);

      // Score the results
      score = this.calculateQualityScore(testQuery, {
        foundResults,
        resultCount,
        hasMetadata,
        hasEntities,
        hasCitations,
        executionTime,
        tier,
      });

      // Validate against success criteria
      const passed = this.validateSuccessCriteria(
        testQuery.successCriteria,
        {
          foundResults,
          resultCount,
          hasMetadata,
          hasEntities,
          hasCitations,
        },
        issues
      );

      return {
        query: testQuery.query,
        category: testQuery.category,
        testType: testQuery.testType,
        passed,
        details: {
          foundResults,
          resultCount,
          hasMetadata,
          hasEntities,
          hasCitations,
          executionTime,
          tier,
        },
        issues,
        score,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        query: testQuery.query,
        category: testQuery.category,
        testType: testQuery.testType,
        passed: false,
        details: {
          foundResults: false,
          resultCount: 0,
          hasMetadata: false,
          hasEntities: false,
          hasCitations: false,
          executionTime,
          tier: 'error',
        },
        issues: [
          `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        score: 0,
      };
    }
  }

  /**
   * Check if results contain metadata information
   */
  private checkForMetadataContent(results: any[]): boolean {
    return results.some(result => {
      const content = result.content?.toLowerCase() || '';
      return (
        content.includes('inventor') ||
        content.includes('author') ||
        content.includes('assignee') ||
        content.includes('filed') ||
        content.includes('granted') ||
        content.includes('published')
      );
    });
  }

  /**
   * Check if results contain entity information
   */
  private checkForEntityContent(results: any[]): boolean {
    return results.some(result => {
      const content = result.content?.toLowerCase() || '';
      return (
        content.includes('david fattal') ||
        content.includes('leia inc') ||
        content.includes('hp inc') ||
        content.includes('stanford')
      );
    });
  }

  /**
   * Check if citations are properly formatted
   */
  private checkForCitations(citations: any[]): boolean {
    return (
      citations.length > 0 &&
      citations.every(
        citation => citation.marker && citation.title && citation.factSummary
      )
    );
  }

  /**
   * Calculate quality score (0-100)
   */
  private calculateQualityScore(
    testQuery: QualityTestQuery,
    details: any
  ): number {
    let score = 0;

    // Base score for finding results
    if (details.foundResults) score += 30;

    // Score for result count
    if (details.resultCount >= (testQuery.successCriteria.minimumResults || 1))
      score += 20;

    // Score for metadata content (if expected)
    if (testQuery.successCriteria.shouldContainMetadata && details.hasMetadata)
      score += 20;
    if (
      !testQuery.successCriteria.shouldContainMetadata &&
      !details.hasMetadata
    )
      score += 10;

    // Score for entity content (if expected)
    if (testQuery.successCriteria.shouldHaveEntities && details.hasEntities)
      score += 15;
    if (!testQuery.successCriteria.shouldHaveEntities && !details.hasEntities)
      score += 5;

    // Score for citations
    if (details.hasCitations) score += 15;

    return Math.min(score, 100);
  }

  /**
   * Validate against success criteria
   */
  private validateSuccessCriteria(
    criteria: any,
    details: any,
    issues: string[]
  ): boolean {
    let valid = true;

    if (criteria.shouldFindResults && !details.foundResults) {
      issues.push('Expected to find results but none found');
      valid = false;
    }

    if (
      criteria.minimumResults &&
      details.resultCount < criteria.minimumResults
    ) {
      issues.push(
        `Expected at least ${criteria.minimumResults} results, got ${details.resultCount}`
      );
      valid = false;
    }

    if (criteria.shouldContainMetadata && !details.hasMetadata) {
      issues.push('Expected metadata content but none found');
      valid = false;
    }

    if (criteria.shouldHaveEntities && !details.hasEntities) {
      issues.push('Expected entity content but none found');
      valid = false;
    }

    if (criteria.shouldHaveCitations && !details.hasCitations) {
      issues.push('Expected proper citations but none found');
      valid = false;
    }

    return valid;
  }

  /**
   * Generate comprehensive quality summary
   */
  private generateQualitySummary(): QualityValidationSummary {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const overallScore =
      this.results.reduce((sum, r) => sum + r.score, 0) / totalTests;

    // Calculate category scores
    const categories = [...new Set(this.results.map(r => r.category))];
    const categoryScores: Record<string, number> = {};
    categories.forEach(category => {
      const categoryResults = this.results.filter(r => r.category === category);
      categoryScores[category] =
        categoryResults.reduce((sum, r) => sum + r.score, 0) /
        categoryResults.length;
    });

    // Calculate test type scores
    const testTypes = [...new Set(this.results.map(r => r.testType))];
    const testTypeScores: Record<string, number> = {};
    testTypes.forEach(testType => {
      const testTypeResults = this.results.filter(r => r.testType === testType);
      testTypeScores[testType] =
        testTypeResults.reduce((sum, r) => sum + r.score, 0) /
        testTypeResults.length;
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations();

    return {
      totalTests,
      passedTests,
      overallScore,
      categoryScores,
      testTypeScores,
      results: this.results,
      recommendations,
    };
  }

  /**
   * Generate improvement recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const failedResults = this.results.filter(r => !r.passed);

    if (failedResults.length > 0) {
      const commonIssues = this.getCommonIssues(failedResults);

      if (commonIssues.includes('metadata content')) {
        recommendations.push(
          'Consider improving metadata chunk generation for better entity extraction'
        );
      }

      if (commonIssues.includes('entity content')) {
        recommendations.push(
          'Enhance entity extraction and consolidation processes'
        );
      }

      if (commonIssues.includes('citations')) {
        recommendations.push('Review citation formatting and accuracy');
      }

      if (commonIssues.includes('results')) {
        recommendations.push(
          'Investigate query classification and search routing'
        );
      }
    }

    return recommendations;
  }

  /**
   * Get common issues across failed tests
   */
  private getCommonIssues(failedResults: QualityTestResult[]): string[] {
    const allIssues = failedResults.flatMap(r => r.issues);
    const issueCounts: Record<string, number> = {};

    allIssues.forEach(issue => {
      const key = issue.toLowerCase();
      if (key.includes('metadata'))
        issueCounts['metadata content'] =
          (issueCounts['metadata content'] || 0) + 1;
      if (key.includes('entity'))
        issueCounts['entity content'] =
          (issueCounts['entity content'] || 0) + 1;
      if (key.includes('citation'))
        issueCounts['citations'] = (issueCounts['citations'] || 0) + 1;
      if (key.includes('results'))
        issueCounts['results'] = (issueCounts['results'] || 0) + 1;
    });

    return Object.keys(issueCounts).filter(issue => issueCounts[issue] >= 2);
  }

  /**
   * Print detailed quality validation results
   */
  printResults(summary: QualityValidationSummary): void {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 SEARCH QUALITY VALIDATION RESULTS');
    console.log('='.repeat(80));

    // Overall Results
    console.log('\n📊 Overall Quality:');
    console.log(
      `✅ Passed Tests: ${summary.passedTests}/${summary.totalTests} (${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%)`
    );
    console.log(`🎯 Overall Score: ${summary.overallScore.toFixed(1)}/100`);

    // Category Breakdown
    console.log('\n📂 Category Performance:');
    Object.entries(summary.categoryScores).forEach(([category, score]) => {
      const categoryResults = summary.results.filter(
        r => r.category === category
      );
      const passed = categoryResults.filter(r => r.passed).length;
      console.log(
        `  ${category}: ${score.toFixed(1)}/100 (${passed}/${categoryResults.length} passed)`
      );
    });

    // Test Type Breakdown
    console.log('\n🧪 Test Type Performance:');
    Object.entries(summary.testTypeScores).forEach(([testType, score]) => {
      const testTypeResults = summary.results.filter(
        r => r.testType === testType
      );
      const passed = testTypeResults.filter(r => r.passed).length;
      console.log(
        `  ${testType}: ${score.toFixed(1)}/100 (${passed}/${testTypeResults.length} passed)`
      );
    });

    // Failed Tests
    const failedTests = summary.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('\n❌ Failed Tests:');
      failedTests.forEach(result => {
        console.log(`  "${result.query}": ${result.issues.join(', ')}`);
      });
    }

    // Recommendations
    if (summary.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      summary.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

// =======================
// CLI Interface
// =======================

export async function runQualityValidation(): Promise<void> {
  const validator = new SearchQualityValidator();

  try {
    const summary = await validator.runQualityValidation();
    validator.printResults(summary);

    // Success criteria evaluation
    console.log('\n🎯 Quality Validation Success Criteria:');
    console.log(
      `✅ Pass Rate: ${summary.passedTests >= summary.totalTests * 0.8 ? 'PASS' : 'FAIL'} (${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}% >= 80%)`
    );
    console.log(
      `✅ Overall Score: ${summary.overallScore >= 70 ? 'PASS' : 'FAIL'} (${summary.overallScore.toFixed(1)} >= 70)`
    );
    console.log(
      `✅ Metadata Queries: ${summary.categoryScores.inventor_query >= 70 ? 'PASS' : 'FAIL'} (Inventor queries: ${summary.categoryScores.inventor_query?.toFixed(1) || 0}/100)`
    );
  } catch (error) {
    console.error('❌ Quality validation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runQualityValidation().catch(console.error);
}
