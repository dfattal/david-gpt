/**
 * Knowledge Graph Toggle Controller
 *
 * System for enabling/disabling KG features for A/B testing and comparison
 * studies to measure the effectiveness of knowledge graph enhancements.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ThreeTierSearchEngine } from '../three-tier-search';
import { KGEnhancedSearchEngine } from '../kg-enhanced-search';
import type { SearchQuery, SearchResult, HybridSearchResult } from '../types';
import type {
  TieredSearchQuery,
  TieredSearchResult,
} from '../three-tier-search';
import type { KGSearchQuery } from '../kg-enhanced-search';

// =======================
// Toggle Configuration Types
// =======================

export interface KGToggleConfig {
  entityRecognitionEnabled: boolean;
  queryExpansionEnabled: boolean;
  authorityBoostingEnabled: boolean;
  relationshipTraversalEnabled: boolean;
  disambiguationEnabled: boolean;
  entityAliasExpansionEnabled: boolean;
  semanticClusteringEnabled: boolean;
  contextualReRankingEnabled: boolean;
}

export interface KGTestMode {
  mode: 'kg_enabled' | 'kg_disabled' | 'kg_selective';
  config?: Partial<KGToggleConfig>;
  description: string;
}

export interface ComparisonTestResult {
  testId: string;
  query: string;
  kgEnabledResult: SearchExecutionResult;
  kgDisabledResult: SearchExecutionResult;
  improvement: {
    relevanceScore: number; // % improvement
    responseTime: number; // % change (negative = faster)
    resultCount: number; // % change
    entityCoverage: number; // % improvement
    diversityScore: number; // % improvement
  };
  significanceLevel: number; // Statistical significance
  recommendation: 'use_kg' | 'skip_kg' | 'inconclusive';
}

export interface SearchExecutionResult {
  results: SearchResult[];
  executionTimeMs: number;
  tier: 'sql' | 'vector' | 'content';
  resultCount: number;
  averageScore: number;
  entitiesRecognized: string[];
  kgFeaturesUsed: string[];
  debugInfo: {
    queryClassification?: any;
    entityExpansions?: string[];
    authorityBoosts?: Array<{ documentId: string; boost: number }>;
    relationshipPaths?: string[];
  };
}

export interface ABTestConfiguration {
  testName: string;
  description: string;
  testQueries: string[];
  kgModes: KGTestMode[];
  metrics: {
    trackRelevance: boolean;
    trackSpeed: boolean;
    trackEntityCoverage: boolean;
    trackDiversity: boolean;
    trackUserSatisfaction: boolean;
  };
  sampleSize: number;
  confidenceLevel: number; // e.g., 0.95 for 95% confidence
}

// =======================
// KG Toggle Controller
// =======================

export class KGToggleController {
  private supabase: SupabaseClient;
  private threeTierEngine: ThreeTierSearchEngine;
  private kgEngine: KGEnhancedSearchEngine;
  private currentConfig: KGToggleConfig;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.threeTierEngine = new ThreeTierSearchEngine(supabase);
    this.kgEngine = new KGEnhancedSearchEngine();
    this.currentConfig = this.getDefaultKGConfig();
  }

  /**
   * Get default KG configuration (all features enabled)
   */
  getDefaultKGConfig(): KGToggleConfig {
    return {
      entityRecognitionEnabled: true,
      queryExpansionEnabled: true,
      authorityBoostingEnabled: true,
      relationshipTraversalEnabled: true,
      disambiguationEnabled: true,
      entityAliasExpansionEnabled: true,
      semanticClusteringEnabled: true,
      contextualReRankingEnabled: true,
    };
  }

  /**
   * Get disabled KG configuration (all features off)
   */
  getDisabledKGConfig(): KGToggleConfig {
    return {
      entityRecognitionEnabled: false,
      queryExpansionEnabled: false,
      authorityBoostingEnabled: false,
      relationshipTraversalEnabled: false,
      disambiguationEnabled: false,
      entityAliasExpansionEnabled: false,
      semanticClusteringEnabled: false,
      contextualReRankingEnabled: false,
    };
  }

  /**
   * Set KG configuration
   */
  setKGConfig(config: Partial<KGToggleConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
    console.log('🔧 KG Configuration updated:', this.currentConfig);
  }

  /**
   * Execute search with current KG configuration
   */
  async executeSearchWithConfig(
    query: string,
    config: KGToggleConfig,
    options: Partial<SearchQuery> = {}
  ): Promise<SearchExecutionResult> {
    const startTime = Date.now();
    const searchQuery: TieredSearchQuery = {
      query,
      tier: 'auto',
      ...options,
    };

    let searchResult: TieredSearchResult;
    const kgFeaturesUsed: string[] = [];
    const debugInfo: any = {};

    try {
      if (this.isAnyKGFeatureEnabled(config)) {
        // Use KG-enhanced search with selective feature enabling
        const kgQuery: KGSearchQuery = {
          ...searchQuery,
          expandEntities: config.queryExpansionEnabled,
          authorityBoost: config.authorityBoostingEnabled,
          disambiguate: config.disambiguationEnabled,
        };

        // Track which features are being used
        if (config.entityRecognitionEnabled)
          kgFeaturesUsed.push('entity_recognition');
        if (config.queryExpansionEnabled)
          kgFeaturesUsed.push('query_expansion');
        if (config.authorityBoostingEnabled)
          kgFeaturesUsed.push('authority_boosting');
        if (config.relationshipTraversalEnabled)
          kgFeaturesUsed.push('relationship_traversal');
        if (config.disambiguationEnabled) kgFeaturesUsed.push('disambiguation');

        searchResult = await this.executeKGSearchWithFeatures(kgQuery, config);
      } else {
        // Use basic three-tier search
        searchResult = await this.threeTierEngine.search(searchQuery);
      }

      const executionTime = Date.now() - startTime;

      // Extract entities from results
      const entitiesRecognized = this.extractEntitiesFromResults(
        searchResult.results,
        config
      );

      // Calculate average score
      const averageScore =
        searchResult.results.length > 0
          ? searchResult.results.reduce((sum, r) => sum + (r.score || 0), 0) /
            searchResult.results.length
          : 0;

      return {
        results: searchResult.results,
        executionTimeMs: executionTime,
        tier: searchResult.tier,
        resultCount: searchResult.results.length,
        averageScore,
        entitiesRecognized,
        kgFeaturesUsed,
        debugInfo: {
          queryClassification: searchResult.queryClassification,
          ...debugInfo,
        },
      };
    } catch (error) {
      console.error('Search execution failed:', error);

      return {
        results: [],
        executionTimeMs: Date.now() - startTime,
        tier: 'content',
        resultCount: 0,
        averageScore: 0,
        entitiesRecognized: [],
        kgFeaturesUsed,
        debugInfo: { error: error.toString() },
      };
    }
  }

  /**
   * Execute KG search with selective feature enabling
   */
  private async executeKGSearchWithFeatures(
    kgQuery: KGSearchQuery,
    config: KGToggleConfig
  ): Promise<TieredSearchResult> {
    // This is a simplified implementation
    // In practice, would modify the KG search engine to selectively enable features

    if (!config.entityRecognitionEnabled) {
      // Disable entity recognition by modifying the query
      kgQuery.expandEntities = false;
      kgQuery.disambiguate = false;
    }

    const result = await this.kgEngine.kgSearch(kgQuery);

    // Cast to TieredSearchResult format (simplified)
    return {
      ...result,
      tier: 'vector', // Default tier for KG searches
      fallbackTier: undefined,
      executionStrategy: 'kg_enhanced',
      queryClassification: {
        intent: 'kg_search',
        confidence: 0.8,
        documentTypes: [],
      },
    } as TieredSearchResult;
  }

  /**
   * Run A/B comparison test between KG enabled and disabled
   */
  async runABComparisonTest(
    query: string,
    testOptions: Partial<SearchQuery> = {}
  ): Promise<ComparisonTestResult> {
    console.log(`🧪 Running A/B test for query: "${query}"`);

    const testId = `ab_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Test with KG enabled
    console.log('  🧠 Testing with KG enabled...');
    const kgEnabledResult = await this.executeSearchWithConfig(
      query,
      this.getDefaultKGConfig(),
      testOptions
    );

    // Test with KG disabled
    console.log('  🔍 Testing with KG disabled...');
    const kgDisabledResult = await this.executeSearchWithConfig(
      query,
      this.getDisabledKGConfig(),
      testOptions
    );

    // Calculate improvements
    const improvement = this.calculateImprovement(
      kgEnabledResult,
      kgDisabledResult
    );

    // Determine statistical significance (simplified)
    const significanceLevel = this.calculateSignificance(
      kgEnabledResult,
      kgDisabledResult
    );

    // Make recommendation
    const recommendation = this.makeRecommendation(
      improvement,
      significanceLevel
    );

    const comparisonResult: ComparisonTestResult = {
      testId,
      query,
      kgEnabledResult,
      kgDisabledResult,
      improvement,
      significanceLevel,
      recommendation,
    };

    this.logComparisonResult(comparisonResult);

    return comparisonResult;
  }

  /**
   * Run batch A/B testing with multiple queries
   */
  async runBatchABTesting(
    queries: string[],
    testOptions: Partial<SearchQuery> = {}
  ): Promise<ComparisonTestResult[]> {
    console.log(
      `🔬 Running batch A/B testing with ${queries.length} queries...`
    );

    const results: ComparisonTestResult[] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`\n📝 Test ${i + 1}/${queries.length}: "${query}"`);

      try {
        const result = await this.runABComparisonTest(query, testOptions);
        results.push(result);

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Test failed for query "${query}":`, error);
      }
    }

    // Generate batch summary
    this.generateBatchSummary(results);

    return results;
  }

  /**
   * Run comprehensive A/B test configuration
   */
  async runABTestConfiguration(config: ABTestConfiguration): Promise<{
    results: ComparisonTestResult[];
    summary: ABTestSummary;
  }> {
    console.log(`🎯 Running A/B test configuration: ${config.testName}`);
    console.log(`📝 Description: ${config.description}`);

    const allResults: ComparisonTestResult[] = [];

    for (const mode of config.kgModes) {
      console.log(`\n🔧 Testing mode: ${mode.mode} - ${mode.description}`);

      // Set configuration for this mode
      let testConfig: KGToggleConfig;
      switch (mode.mode) {
        case 'kg_enabled':
          testConfig = this.getDefaultKGConfig();
          break;
        case 'kg_disabled':
          testConfig = this.getDisabledKGConfig();
          break;
        case 'kg_selective':
          testConfig = { ...this.getDefaultKGConfig(), ...mode.config };
          break;
      }

      // Run tests for this mode
      for (const query of config.testQueries) {
        const modeResult = await this.executeSearchWithConfig(
          query,
          testConfig
        );

        // Convert to comparison result format (simplified)
        const comparisonResult: ComparisonTestResult = {
          testId: `${config.testName}_${mode.mode}_${Date.now()}`,
          query,
          kgEnabledResult:
            mode.mode !== 'kg_disabled'
              ? modeResult
              : {
                  results: [],
                  executionTimeMs: 0,
                  tier: 'content',
                  resultCount: 0,
                  averageScore: 0,
                  entitiesRecognized: [],
                  kgFeaturesUsed: [],
                  debugInfo: {},
                },
          kgDisabledResult:
            mode.mode === 'kg_disabled'
              ? modeResult
              : {
                  results: [],
                  executionTimeMs: 0,
                  tier: 'content',
                  resultCount: 0,
                  averageScore: 0,
                  entitiesRecognized: [],
                  kgFeaturesUsed: [],
                  debugInfo: {},
                },
          improvement: {
            relevanceScore: 0,
            responseTime: 0,
            resultCount: 0,
            entityCoverage: 0,
            diversityScore: 0,
          },
          significanceLevel: 0,
          recommendation: 'inconclusive',
        };

        allResults.push(comparisonResult);
      }
    }

    // Generate comprehensive summary
    const summary = this.generateABTestSummary(allResults, config);

    return { results: allResults, summary };
  }

  /**
   * Check if any KG feature is enabled
   */
  private isAnyKGFeatureEnabled(config: KGToggleConfig): boolean {
    return Object.values(config).some(enabled => enabled === true);
  }

  /**
   * Extract entities from search results
   */
  private extractEntitiesFromResults(
    results: SearchResult[],
    config: KGToggleConfig
  ): string[] {
    if (!config.entityRecognitionEnabled) {
      return [];
    }

    const entities = new Set<string>();

    results.forEach(result => {
      // Simple entity extraction from titles and content
      const text = `${result.title || ''} ${result.content || ''}`;
      const capitalizedWords =
        text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

      capitalizedWords.forEach(word => {
        if (word.length > 2 && !this.isCommonWord(word)) {
          entities.add(word);
        }
      });
    });

    return Array.from(entities).slice(0, 10); // Limit to top 10
  }

  /**
   * Check if word is a common word (should not be treated as entity)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The',
      'This',
      'That',
      'These',
      'Those',
      'And',
      'But',
      'Or',
      'For',
      'With',
      'From',
      'About',
      'Into',
      'Through',
      'During',
      'Before',
      'After',
      'Above',
      'Below',
      'Between',
      'Among',
      'Since',
      'Until',
      'While',
    ]);
    return commonWords.has(word);
  }

  /**
   * Calculate improvement metrics
   */
  private calculateImprovement(
    kgEnabled: SearchExecutionResult,
    kgDisabled: SearchExecutionResult
  ): ComparisonTestResult['improvement'] {
    const relevanceScore =
      kgDisabled.averageScore > 0
        ? ((kgEnabled.averageScore - kgDisabled.averageScore) /
            kgDisabled.averageScore) *
          100
        : 0;

    const responseTime =
      kgDisabled.executionTimeMs > 0
        ? ((kgEnabled.executionTimeMs - kgDisabled.executionTimeMs) /
            kgDisabled.executionTimeMs) *
          100
        : 0;

    const resultCount =
      kgDisabled.resultCount > 0
        ? ((kgEnabled.resultCount - kgDisabled.resultCount) /
            kgDisabled.resultCount) *
          100
        : 0;

    const entityCoverage =
      kgDisabled.entitiesRecognized.length > 0
        ? ((kgEnabled.entitiesRecognized.length -
            kgDisabled.entitiesRecognized.length) /
            kgDisabled.entitiesRecognized.length) *
          100
        : kgEnabled.entitiesRecognized.length > 0
          ? 100
          : 0;

    // Simplified diversity calculation
    const kgEnabledUniqueTitles = new Set(kgEnabled.results.map(r => r.title))
      .size;
    const kgDisabledUniqueTitles = new Set(kgDisabled.results.map(r => r.title))
      .size;
    const diversityScore =
      kgDisabledUniqueTitles > 0
        ? ((kgEnabledUniqueTitles - kgDisabledUniqueTitles) /
            kgDisabledUniqueTitles) *
          100
        : 0;

    return {
      relevanceScore,
      responseTime,
      resultCount,
      entityCoverage,
      diversityScore,
    };
  }

  /**
   * Calculate statistical significance (simplified)
   */
  private calculateSignificance(
    kgEnabled: SearchExecutionResult,
    kgDisabled: SearchExecutionResult
  ): number {
    // Simplified significance calculation
    // In practice, would use proper statistical tests

    const scoreDifference = Math.abs(
      kgEnabled.averageScore - kgDisabled.averageScore
    );
    const timeDifference = Math.abs(
      kgEnabled.executionTimeMs - kgDisabled.executionTimeMs
    );
    const resultDifference = Math.abs(
      kgEnabled.resultCount - kgDisabled.resultCount
    );

    // Normalize differences and calculate combined significance
    const normalizedScoreDiff =
      scoreDifference /
      Math.max(kgEnabled.averageScore, kgDisabled.averageScore, 1);
    const normalizedTimeDiff =
      timeDifference /
      Math.max(kgEnabled.executionTimeMs, kgDisabled.executionTimeMs, 1);
    const normalizedResultDiff =
      resultDifference /
      Math.max(kgEnabled.resultCount, kgDisabled.resultCount, 1);

    const combinedSignificance =
      (normalizedScoreDiff + normalizedTimeDiff + normalizedResultDiff) / 3;

    // Convert to confidence level (0-1)
    return Math.min(0.99, combinedSignificance * 2);
  }

  /**
   * Make recommendation based on improvement and significance
   */
  private makeRecommendation(
    improvement: ComparisonTestResult['improvement'],
    significanceLevel: number
  ): 'use_kg' | 'skip_kg' | 'inconclusive' {
    if (significanceLevel < 0.5) {
      return 'inconclusive';
    }

    const positiveMetrics = [
      improvement.relevanceScore > 5,
      improvement.entityCoverage > 10,
      improvement.diversityScore > 5,
      improvement.responseTime > -20, // Not too much slower
    ].filter(Boolean).length;

    const negativeMetrics = [
      improvement.relevanceScore < -5,
      improvement.responseTime > 50, // Much slower
      improvement.resultCount < -20, // Significantly fewer results
    ].filter(Boolean).length;

    if (positiveMetrics >= 2 && negativeMetrics === 0) {
      return 'use_kg';
    } else if (negativeMetrics >= 2) {
      return 'skip_kg';
    } else {
      return 'inconclusive';
    }
  }

  /**
   * Log comparison result
   */
  private logComparisonResult(result: ComparisonTestResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 A/B TEST COMPARISON RESULT');
    console.log('='.repeat(60));
    console.log(`Query: "${result.query}"`);
    console.log(`Test ID: ${result.testId}`);

    console.log('\n🧠 KG Enabled Results:');
    console.log(`  Results: ${result.kgEnabledResult.resultCount}`);
    console.log(
      `  Avg Score: ${result.kgEnabledResult.averageScore.toFixed(3)}`
    );
    console.log(`  Time: ${result.kgEnabledResult.executionTimeMs}ms`);
    console.log(
      `  Entities: ${result.kgEnabledResult.entitiesRecognized.length}`
    );
    console.log(
      `  Features: ${result.kgEnabledResult.kgFeaturesUsed.join(', ')}`
    );

    console.log('\n🔍 KG Disabled Results:');
    console.log(`  Results: ${result.kgDisabledResult.resultCount}`);
    console.log(
      `  Avg Score: ${result.kgDisabledResult.averageScore.toFixed(3)}`
    );
    console.log(`  Time: ${result.kgDisabledResult.executionTimeMs}ms`);
    console.log(
      `  Entities: ${result.kgDisabledResult.entitiesRecognized.length}`
    );

    console.log('\n📈 Improvements:');
    console.log(
      `  Relevance: ${result.improvement.relevanceScore > 0 ? '+' : ''}${result.improvement.relevanceScore.toFixed(1)}%`
    );
    console.log(
      `  Response Time: ${result.improvement.responseTime > 0 ? '+' : ''}${result.improvement.responseTime.toFixed(1)}%`
    );
    console.log(
      `  Result Count: ${result.improvement.resultCount > 0 ? '+' : ''}${result.improvement.resultCount.toFixed(1)}%`
    );
    console.log(
      `  Entity Coverage: ${result.improvement.entityCoverage > 0 ? '+' : ''}${result.improvement.entityCoverage.toFixed(1)}%`
    );
    console.log(
      `  Diversity: ${result.improvement.diversityScore > 0 ? '+' : ''}${result.improvement.diversityScore.toFixed(1)}%`
    );

    console.log(
      `\n🎯 Significance Level: ${(result.significanceLevel * 100).toFixed(1)}%`
    );
    console.log(`💡 Recommendation: ${result.recommendation.toUpperCase()}`);
    console.log('='.repeat(60));
  }

  /**
   * Generate batch summary
   */
  private generateBatchSummary(results: ComparisonTestResult[]): void {
    if (results.length === 0) return;

    const avgRelevanceImprovement =
      results.reduce((sum, r) => sum + r.improvement.relevanceScore, 0) /
      results.length;
    const avgResponseTimeChange =
      results.reduce((sum, r) => sum + r.improvement.responseTime, 0) /
      results.length;
    const avgEntityCoverageImprovement =
      results.reduce((sum, r) => sum + r.improvement.entityCoverage, 0) /
      results.length;

    const useKGCount = results.filter(
      r => r.recommendation === 'use_kg'
    ).length;
    const skipKGCount = results.filter(
      r => r.recommendation === 'skip_kg'
    ).length;
    const inconclusiveCount = results.filter(
      r => r.recommendation === 'inconclusive'
    ).length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 BATCH A/B TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${results.length}`);

    console.log('\n📈 Average Improvements:');
    console.log(
      `  Relevance: ${avgRelevanceImprovement > 0 ? '+' : ''}${avgRelevanceImprovement.toFixed(1)}%`
    );
    console.log(
      `  Response Time: ${avgResponseTimeChange > 0 ? '+' : ''}${avgResponseTimeChange.toFixed(1)}%`
    );
    console.log(
      `  Entity Coverage: ${avgEntityCoverageImprovement > 0 ? '+' : ''}${avgEntityCoverageImprovement.toFixed(1)}%`
    );

    console.log('\n🎯 Recommendations:');
    console.log(
      `  Use KG: ${useKGCount} (${((useKGCount / results.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Skip KG: ${skipKGCount} (${((skipKGCount / results.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Inconclusive: ${inconclusiveCount} (${((inconclusiveCount / results.length) * 100).toFixed(1)}%)`
    );

    const overallRecommendation =
      useKGCount > skipKGCount
        ? 'ENABLE_KG'
        : skipKGCount > useKGCount
          ? 'DISABLE_KG'
          : 'MIXED_RESULTS';

    console.log(`\n🏆 Overall Recommendation: ${overallRecommendation}`);
    console.log('='.repeat(60));
  }

  /**
   * Generate A/B test summary
   */
  private generateABTestSummary(
    results: ComparisonTestResult[],
    config: ABTestConfiguration
  ): ABTestSummary {
    return {
      testName: config.testName,
      description: config.description,
      totalTests: results.length,
      averageImprovements: {
        relevance:
          results.reduce((sum, r) => sum + r.improvement.relevanceScore, 0) /
          results.length,
        responseTime:
          results.reduce((sum, r) => sum + r.improvement.responseTime, 0) /
          results.length,
        entityCoverage:
          results.reduce((sum, r) => sum + r.improvement.entityCoverage, 0) /
          results.length,
        diversity:
          results.reduce((sum, r) => sum + r.improvement.diversityScore, 0) /
          results.length,
      },
      recommendations: {
        useKG: results.filter(r => r.recommendation === 'use_kg').length,
        skipKG: results.filter(r => r.recommendation === 'skip_kg').length,
        inconclusive: results.filter(r => r.recommendation === 'inconclusive')
          .length,
      },
      overallRecommendation: this.determineOverallRecommendation(results),
      confidenceLevel: config.confidenceLevel,
      timestamp: new Date(),
    };
  }

  /**
   * Determine overall recommendation from batch results
   */
  private determineOverallRecommendation(
    results: ComparisonTestResult[]
  ): 'enable_kg' | 'disable_kg' | 'mixed' {
    const useKGCount = results.filter(
      r => r.recommendation === 'use_kg'
    ).length;
    const skipKGCount = results.filter(
      r => r.recommendation === 'skip_kg'
    ).length;

    if (useKGCount > skipKGCount * 1.5) return 'enable_kg';
    if (skipKGCount > useKGCount * 1.5) return 'disable_kg';
    return 'mixed';
  }
}

// =======================
// Supporting Types
// =======================

export interface ABTestSummary {
  testName: string;
  description: string;
  totalTests: number;
  averageImprovements: {
    relevance: number;
    responseTime: number;
    entityCoverage: number;
    diversity: number;
  };
  recommendations: {
    useKG: number;
    skipKG: number;
    inconclusive: number;
  };
  overallRecommendation: 'enable_kg' | 'disable_kg' | 'mixed';
  confidenceLevel: number;
  timestamp: Date;
}

// =======================
// Export Functions
// =======================

/**
 * Create KG toggle controller instance
 */
export function createKGToggleController(
  supabase: SupabaseClient
): KGToggleController {
  return new KGToggleController(supabase);
}

/**
 * Run single A/B comparison test
 */
export async function runSingleABTest(
  supabase: SupabaseClient,
  query: string,
  options?: Partial<SearchQuery>
): Promise<ComparisonTestResult> {
  const controller = new KGToggleController(supabase);
  return controller.runABComparisonTest(query, options);
}

/**
 * Run batch A/B testing
 */
export async function runBatchABTests(
  supabase: SupabaseClient,
  queries: string[],
  options?: Partial<SearchQuery>
): Promise<ComparisonTestResult[]> {
  const controller = new KGToggleController(supabase);
  return controller.runBatchABTesting(queries, options);
}
