#!/usr/bin/env tsx

/**
 * TypeScript Error Analyzer
 *
 * Analyzes TypeScript compilation errors and groups them by patterns
 * to enable targeted bulk fixes
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

interface TSError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  fullMessage: string;
}

interface ErrorPattern {
  code: string;
  count: number;
  examples: TSError[];
  suggestedFix?: string;
}

class TypeScriptErrorAnalyzer {
  private errors: TSError[] = [];
  private patterns: Map<string, ErrorPattern> = new Map();

  async analyzeErrors(): Promise<void> {
    console.log('🔍 Analyzing TypeScript errors...');

    // Get TypeScript errors
    try {
      execSync('npx tsc --noEmit --skipLibCheck', { encoding: 'utf8' });
    } catch (error: any) {
      this.parseErrors(error.stdout);
    }

    this.categorizeErrors();
    this.generateReport();
  }

  private parseErrors(output: string): void {
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
      if (match) {
        const [, file, lineNum, col, code, message] = match;

        this.errors.push({
          file: file.trim(),
          line: parseInt(lineNum),
          column: parseInt(col),
          code,
          message: message.trim(),
          fullMessage: line
        });
      }
    }

    console.log(`📊 Found ${this.errors.length} TypeScript errors`);
  }

  private categorizeErrors(): void {
    for (const error of this.errors) {
      if (!this.patterns.has(error.code)) {
        this.patterns.set(error.code, {
          code: error.code,
          count: 0,
          examples: [],
          suggestedFix: this.getSuggestedFix(error.code)
        });
      }

      const pattern = this.patterns.get(error.code)!;
      pattern.count++;

      // Keep up to 5 examples per pattern
      if (pattern.examples.length < 5) {
        pattern.examples.push(error);
      }
    }
  }

  private getSuggestedFix(code: string): string {
    const fixes: { [key: string]: string } = {
      'TS2339': 'Missing property - check interface definitions or property names',
      'TS2551': 'Property name typo - check for renamed/misspelled properties',
      'TS7006': 'Implicit any parameter - add type annotation',
      'TS2345': 'Type mismatch - check parameter types',
      'TS2322': 'Assignment type mismatch - check variable types',
      'TS7053': 'Index signature missing - add [key: string] to interface',
      'TS2769': 'Object property mismatch - check required properties',
      'TS2353': 'Object literal excess property - remove extra properties',
      'TS1501': 'Constructor implementation missing',
      'TS2352': 'Conversion may be mistake - use type assertion',
      'TS2678': 'Return type mismatch - check function return type',
      'TS2561': 'Object never used - check initialization',
      'TS2554': 'Expected arguments don\'t match - check function signature',
      'TS18046': 'Unknown type in catch - cast error to Error type',
      'TS2305': 'Module not found - check import paths'
    };

    return fixes[code] || 'Manual fix required';
  }

  private generateReport(): void {
    const sortedPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.count - a.count);

    console.log('\n📊 TypeScript Error Analysis Report');
    console.log('=' .repeat(50));

    console.log('\n🔥 Top Error Types:');
    sortedPatterns.slice(0, 10).forEach((pattern, index) => {
      console.log(`${index + 1}. ${pattern.code}: ${pattern.count} errors`);
      console.log(`   Fix: ${pattern.suggestedFix}`);
      if (pattern.examples.length > 0) {
        console.log(`   Example: ${pattern.examples[0].file}:${pattern.examples[0].line}`);
        console.log(`   Message: ${pattern.examples[0].message.substring(0, 80)}...`);
      }
      console.log('');
    });

    // Generate files for automated fixing
    this.generateFixablePatterns(sortedPatterns);
  }

  private generateFixablePatterns(patterns: ErrorPattern[]): void {
    // Generate pattern files for automated fixes
    const fixablePatterns = patterns.filter(p =>
      ['TS7006', 'TS2551', 'TS18046'].includes(p.code)
    );

    const report = {
      totalErrors: this.errors.length,
      patterns: patterns.map(p => ({
        code: p.code,
        count: p.count,
        suggestedFix: p.suggestedFix,
        examples: p.examples.map(e => ({
          file: e.file,
          line: e.line,
          message: e.message
        }))
      })),
      fixablePatterns: fixablePatterns.map(p => ({
        code: p.code,
        count: p.count,
        files: p.examples.map(e => e.file)
      }))
    };

    writeFileSync('ts-error-analysis.json', JSON.stringify(report, null, 2));
    console.log('💾 Detailed analysis saved to ts-error-analysis.json');

    // Generate specific fixable error lists
    this.generateSpecificErrorLists();
  }

  private generateSpecificErrorLists(): void {
    // TS7006: Implicit any parameters
    const implicitAnyErrors = this.errors.filter(e => e.code === 'TS7006');
    writeFileSync('ts-implicit-any-errors.json', JSON.stringify(implicitAnyErrors, null, 2));

    // TS2551: Property typos with suggestions
    const typoErrors = this.errors.filter(e =>
      e.code === 'TS2551' && e.message.includes('Did you mean')
    );
    writeFileSync('ts-typo-errors.json', JSON.stringify(typoErrors, null, 2));

    // TS18046: Unknown error types
    const unknownErrorTypes = this.errors.filter(e => e.code === 'TS18046');
    writeFileSync('ts-unknown-errors.json', JSON.stringify(unknownErrorTypes, null, 2));

    console.log('📋 Generated specific error lists for automated fixing');
  }

  // Generate files with highest error counts
  getProblematicFiles(): void {
    const fileErrorCounts = new Map<string, number>();

    for (const error of this.errors) {
      fileErrorCounts.set(error.file, (fileErrorCounts.get(error.file) || 0) + 1);
    }

    const sortedFiles = Array.from(fileErrorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    console.log('\n🎯 Files with Most Errors:');
    sortedFiles.forEach(([file, count], index) => {
      console.log(`${index + 1}. ${file}: ${count} errors`);
    });

    const problematicFiles = {
      files: sortedFiles.map(([file, count]) => ({ file, errorCount: count }))
    };

    writeFileSync('ts-problematic-files.json', JSON.stringify(problematicFiles, null, 2));
  }
}

// Execute analysis
async function main() {
  const analyzer = new TypeScriptErrorAnalyzer();
  await analyzer.analyzeErrors();
  analyzer.getProblematicFiles();
}

if (require.main === module) {
  main().catch(console.error);
}

export { TypeScriptErrorAnalyzer };