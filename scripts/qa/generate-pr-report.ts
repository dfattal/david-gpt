#!/usr/bin/env tsx

/**
 * PR Quality Report Generator
 *
 * Generates comprehensive quality reports for pull requests
 * Analyzes changes, runs tests, and provides actionable feedback
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { QualityScoreCalculator } from './calculate-quality-score';

interface PRAnalysis {
  changedFiles: string[];
  linesAdded: number;
  linesRemoved: number;
  hasRAGChanges: boolean;
  hasUIChanges: boolean;
  hasAPIChanges: boolean;
  hasTestChanges: boolean;
}

interface PRQualityReport {
  analysis: PRAnalysis;
  qualityScore: any;
  recommendations: string[];
  risks: string[];
  testResults: any;
  impactAssessment: string;
}

class PRReportGenerator {
  private baseBranch: string = 'main';

  /**
   * Generate comprehensive PR quality report
   */
  async generateReport(): Promise<PRQualityReport> {
    console.log('📊 Generating PR quality report...');

    const analysis = this.analyzePRChanges();
    const qualityScore = this.calculateQualityScore();
    const testResults = await this.runQualityTests(analysis);
    const recommendations = this.generateRecommendations(analysis, qualityScore);
    const risks = this.assessRisks(analysis);
    const impactAssessment = this.generateImpactAssessment(analysis);

    return {
      analysis,
      qualityScore,
      recommendations,
      risks,
      testResults,
      impactAssessment
    };
  }

  /**
   * Analyze PR changes
   */
  private analyzePRChanges(): PRAnalysis {
    try {
      // Get changed files
      const changedFiles = execSync(`git diff --name-only ${this.baseBranch}..HEAD`, { encoding: 'utf8' })
        .split('\n')
        .filter(file => file.trim());

      // Get line changes
      const diffStats = execSync(`git diff --stat ${this.baseBranch}..HEAD`, { encoding: 'utf8' });
      const statsMatch = diffStats.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);

      const linesAdded = statsMatch ? parseInt(statsMatch[1]) : 0;
      const linesRemoved = statsMatch ? parseInt(statsMatch[2]) : 0;

      // Categorize changes
      const hasRAGChanges = changedFiles.some(file => file.includes('src/lib/rag/'));
      const hasUIChanges = changedFiles.some(file => file.includes('src/components/') || file.includes('src/app/'));
      const hasAPIChanges = changedFiles.some(file => file.includes('src/app/api/'));
      const hasTestChanges = changedFiles.some(file => file.includes('test') || file.includes('.test.') || file.includes('.spec.'));

      return {
        changedFiles,
        linesAdded,
        linesRemoved,
        hasRAGChanges,
        hasUIChanges,
        hasAPIChanges,
        hasTestChanges
      };
    } catch (error) {
      console.warn('Could not analyze PR changes:', error instanceof Error ? error.message : String(error));
      return {
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        hasRAGChanges: false,
        hasUIChanges: false,
        hasAPIChanges: false,
        hasTestChanges: false
      };
    }
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(): any {
    const calculator = new QualityScoreCalculator();
    const metrics = calculator.loadMetrics();
    return calculator.calculateScore(metrics);
  }

  /**
   * Run quality tests based on changes
   */
  private async runQualityTests(analysis: PRAnalysis): Promise<any> {
    const results: any = {
      lint: { passed: true, issues: 0 },
      typecheck: { passed: true, errors: 0 },
      build: { passed: true },
      rag: null,
      unit: null
    };

    try {
      // Always run lint and typecheck
      try {
        execSync('npm run lint', { stdio: 'pipe' });
      } catch (error) {
        results.lint.passed = false;
        results.lint.issues = ((error as any).stdout?.toString() || '').split('\n').length;
      }

      try {
        execSync('npm run typecheck', { stdio: 'pipe' });
      } catch (error) {
        results.typecheck.passed = false;
        results.typecheck.errors = ((error as any).stderr?.toString() || '').split('\n').length;
      }

      try {
        execSync('npm run build', { stdio: 'pipe' });
      } catch (error) {
        results.build.passed = false;
      }

      // Run RAG tests if RAG changes detected
      if (analysis.hasRAGChanges) {
        try {
          const ragOutput = execSync('npm run test:kg-smoke', { encoding: 'utf8', stdio: 'pipe' });
          results.rag = { passed: true, output: ragOutput };
        } catch (error) {
          results.rag = { passed: false, error: error instanceof Error ? error.message : String(error) };
        }
      }

      // Run unit tests if available
      try {
        const testOutput = execSync('npm run test', { encoding: 'utf8', stdio: 'pipe' });
        results.unit = { passed: true, output: testOutput };
      } catch (error) {
        results.unit = { passed: false, error: error instanceof Error ? error.message : String(error) };
      }

    } catch (error) {
      console.warn('Some quality tests failed to run:', error instanceof Error ? error.message : String(error));
    }

    return results;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(analysis: PRAnalysis, qualityScore: any): string[] {
    const recommendations: string[] = [];

    // Quality score recommendations
    if (qualityScore.overall < 80) {
      recommendations.push('📈 Consider improving code quality before merge (current score: ' + qualityScore.overall + '/100)');
    }

    // Change-based recommendations
    if (analysis.linesAdded > 500) {
      recommendations.push('📦 Large PR detected - consider breaking into smaller changes for easier review');
    }

    if (analysis.hasRAGChanges && !analysis.hasTestChanges) {
      recommendations.push('🧪 RAG changes detected but no test updates - consider adding/updating tests');
    }

    if (analysis.hasAPIChanges) {
      recommendations.push('🔌 API changes detected - ensure backward compatibility and update documentation');
    }

    if (analysis.hasUIChanges) {
      recommendations.push('🎨 UI changes detected - test across different screen sizes and browsers');
    }

    // Testing recommendations
    if (qualityScore.breakdown.testing < 70) {
      recommendations.push('🧪 Test coverage appears low - consider adding more comprehensive tests');
    }

    // Performance recommendations
    if (analysis.hasRAGChanges) {
      recommendations.push('⚡ Run performance tests to ensure RAG changes don\'t impact response times');
    }

    return recommendations;
  }

  /**
   * Assess risks
   */
  private assessRisks(analysis: PRAnalysis): string[] {
    const risks: string[] = [];

    if (analysis.hasRAGChanges) {
      risks.push('🧠 RAG system changes may affect search quality and citation accuracy');
    }

    if (analysis.hasAPIChanges) {
      risks.push('🔌 API changes may break client integrations');
    }

    if (analysis.linesAdded > 1000) {
      risks.push('📦 Large codebase changes increase regression risk');
    }

    if (analysis.changedFiles.some(file => file.includes('auth'))) {
      risks.push('🔐 Authentication changes may affect user access');
    }

    if (analysis.changedFiles.some(file => file.includes('database') || file.includes('migration'))) {
      risks.push('🗄️ Database changes may require careful deployment coordination');
    }

    return risks;
  }

  /**
   * Generate impact assessment
   */
  private generateImpactAssessment(analysis: PRAnalysis): string {
    const impacts: string[] = [];

    if (analysis.hasRAGChanges) {
      impacts.push('RAG/Search functionality');
    }

    if (analysis.hasUIChanges) {
      impacts.push('User interface');
    }

    if (analysis.hasAPIChanges) {
      impacts.push('API endpoints');
    }

    if (impacts.length === 0) {
      return 'Low impact - primarily internal code changes';
    }

    return `Medium-High impact affecting: ${impacts.join(', ')}`;
  }

  /**
   * Format report as markdown
   */
  formatAsMarkdown(report: PRQualityReport): string {
    const timestamp = new Date().toISOString().split('T')[0];

    return `# PR Quality Report - ${timestamp}

## 📊 Quality Score
**Overall Score:** ${report.qualityScore.overall}/100 (Grade: ${report.qualityScore.grade})
**Status:** ${report.qualityScore.passed ? '✅ PASSED' : '❌ FAILED'}

### Score Breakdown
- **Code Quality:** ${report.qualityScore.breakdown.codeQuality}/100
- **Testing:** ${report.qualityScore.breakdown.testing}/100
- **RAG Quality:** ${report.qualityScore.breakdown.ragQuality}/100
- **Performance:** ${report.qualityScore.breakdown.performance}/100

## 📋 Change Analysis
- **Files Changed:** ${report.analysis.changedFiles.length}
- **Lines Added:** ${report.analysis.linesAdded}
- **Lines Removed:** ${report.analysis.linesRemoved}
- **Impact Assessment:** ${report.impactAssessment}

### Change Categories
${report.analysis.hasRAGChanges ? '- ✅ RAG/Search changes' : ''}
${report.analysis.hasUIChanges ? '- ✅ UI changes' : ''}
${report.analysis.hasAPIChanges ? '- ✅ API changes' : ''}
${report.analysis.hasTestChanges ? '- ✅ Test changes' : ''}

## 🧪 Test Results
${Object.entries(report.testResults).map(([test, result]: [string, any]) => {
  if (!result) return '';
  return `- **${test.toUpperCase()}:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}`;
}).filter(Boolean).join('\n')}

## 💡 Recommendations
${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## ⚠️ Risk Assessment
${report.risks.length > 0 ?
  report.risks.map(risk => `- ${risk}`).join('\n') :
  '- ✅ No significant risks identified'
}

## 📁 Changed Files
${report.analysis.changedFiles.slice(0, 20).map(file => `- \`${file}\``).join('\n')}
${report.analysis.changedFiles.length > 20 ? `\n... and ${report.analysis.changedFiles.length - 20} more files` : ''}

---
*Report generated automatically by PR Quality Gate*`;
  }
}

/**
 * Main execution
 */
async function main() {
  const generator = new PRReportGenerator();

  try {
    const report = await generator.generateReport();
    const markdown = generator.formatAsMarkdown(report);

    // Output to stdout for GitHub Actions
    console.log(markdown);

    // Also save to file
    const outputPath = join(process.cwd(), 'pr-quality-report.md');
    writeFileSync(outputPath, markdown, 'utf8');

    console.error(`\n📊 PR quality report saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ PR report generation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PRReportGenerator };