#!/usr/bin/env tsx

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { validateDocument } from '../lib/validation/document-format-validator';
import { glob } from 'glob';

const HELP_TEXT = `
Usage: tsx src/scripts/validate-document.ts [options] <file-or-pattern>

Validate document formatting for David-GPT RAG ingestion.

Arguments:
  <file-or-pattern>    Path to markdown file or glob pattern (e.g., "docs/*.md")

Options:
  -h, --help          Show this help message
  -v, --verbose       Show detailed validation results
  -q, --quiet         Only show errors and summary
  --json              Output results as JSON
  --fail-on-warnings  Exit with error code if warnings are found

Examples:
  tsx src/scripts/validate-document.ts paper.md
  tsx src/scripts/validate-document.ts "RAG-SAMPLES/*.md"
  tsx src/scripts/validate-document.ts --verbose "docs/**/*.md"
  tsx src/scripts/validate-document.ts --json paper.md > validation-results.json
`;

interface CLIOptions {
  verbose: boolean;
  quiet: boolean;
  json: boolean;
  failOnWarnings: boolean;
  help: boolean;
}

interface ValidationSummary {
  totalFiles: number;
  validFiles: number;
  filesWithWarnings: number;
  filesWithErrors: number;
  results: Array<{
    file: string;
    valid: boolean;
    errors: number;
    warnings: number;
    details?: any;
  }>;
}

function parseArguments(): { options: CLIOptions; pattern: string } {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    verbose: false,
    quiet: false,
    json: false,
    failOnWarnings: false,
    help: false,
  };

  let pattern = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-q':
      case '--quiet':
        options.quiet = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--fail-on-warnings':
        options.failOnWarnings = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          pattern = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return { options, pattern };
}

async function findFiles(pattern: string): Promise<string[]> {
  try {
    // Check if it's a single file
    const stat = statSync(pattern);
    if (stat.isFile()) {
      return [pattern];
    }
  } catch {
    // Not a single file, try as glob pattern
  }

  // Use glob to find matching files
  const files = await glob(pattern, {
    ignore: ['**/node_modules/**', '**/.git/**'],
  });

  return files.filter(file => file.endsWith('.md'));
}

function formatValidationResult(result: any, filename: string, options: CLIOptions): string {
  if (options.json) {
    return '';  // JSON output handled separately
  }

  let output = '';

  if (!options.quiet) {
    output += `\n📄 ${filename}\n`;
    output += '─'.repeat(60) + '\n';
  }

  if (result.valid) {
    if (!options.quiet) {
      output += '✅ Document is valid\n';

      if (options.verbose && result.metadata) {
        output += `   Type: ${result.metadata.docType}\n`;
        output += `   Title: ${result.metadata.title}\n`;
        output += `   Quality Score: ${result.qualityScore}/100\n`;
      }
    }
  } else {
    // Show errors
    if (result.errors.length > 0) {
      output += `❌ ${result.errors.length} error(s) found:\n`;
      result.errors.forEach((error: any, i: number) => {
        const message = typeof error === 'object' && error.message ? `${error.field}: ${error.message}` : error;
        output += `   ${i + 1}. ${message}\n`;
      });
    }

    // Show warnings if verbose or if there are no errors
    if (result.warnings.length > 0 && (options.verbose || result.errors.length === 0)) {
      output += `⚠️  ${result.warnings.length} warning(s):\n`;
      result.warnings.forEach((warning: any, i: number) => {
        const message = typeof warning === 'object' && warning.message
          ? `[${warning.type}${warning.field ? `: ${warning.field}` : ''}] ${warning.message} (Suggestion: ${warning.suggestion})`
          : warning;
        output += `   ${i + 1}. ${message}\n`;
      });
    }

    // Show suggestions if verbose
    if (options.verbose && result.suggestions.length > 0) {
      output += `💡 ${result.suggestions.length} suggestion(s):\n`;
      result.suggestions.forEach((suggestion: string, i: number) => {
        output += `   ${i + 1}. ${suggestion}\n`;
      });
    }
  }

  return output;
}

function formatSummary(summary: ValidationSummary, options: CLIOptions): string {
  if (options.json) {
    return JSON.stringify(summary, null, 2);
  }

  let output = '\n' + '='.repeat(60) + '\n';
  output += '📊 VALIDATION SUMMARY\n';
  output += '='.repeat(60) + '\n';

  output += `Total files: ${summary.totalFiles}\n`;
  output += `✅ Valid: ${summary.validFiles}\n`;
  output += `⚠️  With warnings: ${summary.filesWithWarnings}\n`;
  output += `❌ With errors: ${summary.filesWithErrors}\n`;

  const successRate = summary.totalFiles > 0
    ? Math.round((summary.validFiles / summary.totalFiles) * 100)
    : 0;

  output += `\nSuccess rate: ${successRate}%\n`;

  if (summary.filesWithErrors > 0) {
    output += '\n🚨 Files requiring fixes:\n';
    summary.results
      .filter(r => !r.valid && r.errors > 0)
      .forEach(r => {
        output += `   ${r.file} (${r.errors} errors, ${r.warnings} warnings)\n`;
      });
  }

  return output;
}

async function main() {
  const { options, pattern } = parseArguments();

  if (options.help || !pattern) {
    console.log(HELP_TEXT);
    process.exit(options.help ? 0 : 1);
  }

  try {
    const files = await findFiles(pattern);

    if (files.length === 0) {
      console.error(`No markdown files found matching pattern: ${pattern}`);
      process.exit(1);
    }

    const summary: ValidationSummary = {
      totalFiles: files.length,
      validFiles: 0,
      filesWithWarnings: 0,
      filesWithErrors: 0,
      results: [],
    };

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const result = validateDocument(content, file);

        const fileResult = {
          file,
          valid: result.valid,
          errors: result.errors.length,
          warnings: result.warnings.length,
          details: options.json ? result : undefined,
        };

        summary.results.push(fileResult);

        if (result.valid) {
          summary.validFiles++;
        } else {
          if (result.errors.length > 0) {
            summary.filesWithErrors++;
          }
          if (result.warnings.length > 0) {
            summary.filesWithWarnings++;
          }
        }

        // Output individual file results (unless JSON mode)
        if (!options.json) {
          const output = formatValidationResult(result, file, options);
          if (output) {
            console.log(output);
          }
        }

      } catch (error) {
        console.error(`Error reading file ${file}:`, error instanceof Error ? error.message : error);
        summary.filesWithErrors++;
        summary.results.push({
          file,
          valid: false,
          errors: 1,
          warnings: 0,
          details: options.json ? { error: 'Failed to read file' } : undefined,
        });
      }
    }

    // Output summary
    console.log(formatSummary(summary, options));

    // Exit with appropriate code
    const hasErrors = summary.filesWithErrors > 0;
    const hasWarnings = summary.filesWithWarnings > 0;

    if (hasErrors || (options.failOnWarnings && hasWarnings)) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    console.error('Validation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}