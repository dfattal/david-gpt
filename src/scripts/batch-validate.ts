#!/usr/bin/env tsx

import { readFileSync, statSync, readdirSync } from 'fs';
import { join, extname, relative } from 'path';
import { validateDocument } from '../lib/validation/document-format-validator';
import { validatePersona } from '../lib/validation/persona-validator';
import { parsePersona } from '../lib/personas/persona-parser';
import { glob } from 'glob';

const HELP_TEXT = `
Usage: tsx src/scripts/batch-validate.ts [options] <directory-or-pattern>

Batch validate documents and personas for David-GPT RAG system.

Arguments:
  <directory-or-pattern>  Directory path or glob pattern to validate

Options:
  -h, --help              Show this help message
  -v, --verbose           Show detailed validation results
  -q, --quiet             Only show summary
  --json                  Output results as JSON
  --fail-on-warnings      Exit with error code if warnings are found
  --docs-only             Only validate documents (ignore personas)
  --personas-only         Only validate personas (ignore documents)
  --preview               Show what would be validated without running validation

Examples:
  tsx src/scripts/batch-validate.ts RAG-SAMPLES/
  tsx src/scripts/batch-validate.ts "content/**/*.md"
  tsx src/scripts/batch-validate.ts --docs-only --verbose RAG-SAMPLES/
  tsx src/scripts/batch-validate.ts --preview "**/*.md"
`;

interface CLIOptions {
  verbose: boolean;
  quiet: boolean;
  json: boolean;
  failOnWarnings: boolean;
  help: boolean;
  docsOnly: boolean;
  personasOnly: boolean;
  preview: boolean;
}

interface FileInfo {
  path: string;
  type: 'document' | 'persona';
  size: number;
}

interface BatchValidationSummary {
  totalFiles: number;
  documents: {
    count: number;
    valid: number;
    warnings: number;
    errors: number;
  };
  personas: {
    count: number;
    valid: number;
    warnings: number;
    errors: number;
  };
  results: Array<{
    file: string;
    type: 'document' | 'persona';
    valid: boolean;
    errors: number;
    warnings: number;
    details?: any;
  }>;
}

function parseArguments(): { options: CLIOptions; target: string } {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    verbose: false,
    quiet: false,
    json: false,
    failOnWarnings: false,
    help: false,
    docsOnly: false,
    personasOnly: false,
    preview: false,
  };

  let target = '';

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
      case '--docs-only':
        options.docsOnly = true;
        break;
      case '--personas-only':
        options.personasOnly = true;
        break;
      case '--preview':
        options.preview = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          target = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return { options, target };
}

async function findFiles(target: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  try {
    // Check if it's a directory
    const stat = statSync(target);
    if (stat.isDirectory()) {
      return findFilesInDirectory(target);
    } else if (stat.isFile() && target.endsWith('.md')) {
      const type = inferFileType(target);
      return [{
        path: target,
        type,
        size: stat.size,
      }];
    }
  } catch {
    // Not a directory or file, try as glob pattern
  }

  // Use glob to find matching files
  const globFiles = await glob(target, {
    ignore: ['**/node_modules/**', '**/.git/**'],
  });

  return globFiles
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const stat = statSync(file);
      return {
        path: file,
        type: inferFileType(file),
        size: stat.size,
      };
    });
}

function findFilesInDirectory(dirPath: string): FileInfo[] {
  const files: FileInfo[] = [];

  function traverse(currentPath: string) {
    try {
      const items = readdirSync(currentPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = join(currentPath, item.name);

        if (item.isDirectory()) {
          // Skip common non-content directories
          if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(item.name)) {
            traverse(fullPath);
          }
        } else if (item.isFile() && item.name.endsWith('.md')) {
          const stat = statSync(fullPath);
          files.push({
            path: fullPath,
            type: inferFileType(fullPath),
            size: stat.size,
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentPath}:`, error instanceof Error ? error.message : error);
    }
  }

  traverse(dirPath);
  return files;
}

function inferFileType(filePath: string): 'document' | 'persona' {
  const filename = filePath.toLowerCase();

  // Common persona patterns
  if (filename.includes('persona') ||
      filename.includes('expert') ||
      filename.includes('character') ||
      filename.includes('/personas/') ||
      filename.includes('/people/')) {
    return 'persona';
  }

  // Default to document
  return 'document';
}

function extractPersonaId(filename: string): string {
  const parts = filename.split('/');
  const basename = parts[parts.length - 1];
  return basename.replace('.md', '');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPreview(files: FileInfo[], options: CLIOptions): string {
  if (options.json) {
    return JSON.stringify({
      preview: true,
      files: files.map(f => ({
        path: f.path,
        type: f.type,
        size: f.size,
        sizeFormatted: formatFileSize(f.size),
      })),
    }, null, 2);
  }

  let output = '📋 BATCH VALIDATION PREVIEW\n';
  output += '='.repeat(60) + '\n';

  const documents = files.filter(f => f.type === 'document');
  const personas = files.filter(f => f.type === 'persona');

  output += `Total files found: ${files.length}\n`;
  output += `📄 Documents: ${documents.length}\n`;
  output += `🎭 Personas: ${personas.length}\n\n`;

  if (documents.length > 0 && !options.personasOnly) {
    output += '📄 DOCUMENTS TO VALIDATE:\n';
    documents.forEach(file => {
      output += `   ${relative(process.cwd(), file.path)} (${formatFileSize(file.size)})\n`;
    });
    output += '\n';
  }

  if (personas.length > 0 && !options.docsOnly) {
    output += '🎭 PERSONAS TO VALIDATE:\n';
    personas.forEach(file => {
      output += `   ${relative(process.cwd(), file.path)} (${formatFileSize(file.size)})\n`;
    });
    output += '\n';
  }

  output += 'Run without --preview to execute validation.\n';

  return output;
}

function formatSummary(summary: BatchValidationSummary, options: CLIOptions): string {
  if (options.json) {
    return JSON.stringify(summary, null, 2);
  }

  let output = '\n' + '='.repeat(60) + '\n';
  output += '📊 BATCH VALIDATION SUMMARY\n';
  output += '='.repeat(60) + '\n';

  output += `Total files processed: ${summary.totalFiles}\n\n`;

  if (summary.documents.count > 0) {
    output += '📄 DOCUMENTS:\n';
    output += `   Total: ${summary.documents.count}\n`;
    output += `   ✅ Valid: ${summary.documents.valid}\n`;
    output += `   ⚠️  With warnings: ${summary.documents.warnings}\n`;
    output += `   ❌ With errors: ${summary.documents.errors}\n`;

    const docSuccessRate = summary.documents.count > 0
      ? Math.round((summary.documents.valid / summary.documents.count) * 100)
      : 0;
    output += `   Success rate: ${docSuccessRate}%\n\n`;
  }

  if (summary.personas.count > 0) {
    output += '🎭 PERSONAS:\n';
    output += `   Total: ${summary.personas.count}\n`;
    output += `   ✅ Valid: ${summary.personas.valid}\n`;
    output += `   ⚠️  With warnings: ${summary.personas.warnings}\n`;
    output += `   ❌ With errors: ${summary.personas.errors}\n`;

    const personaSuccessRate = summary.personas.count > 0
      ? Math.round((summary.personas.valid / summary.personas.count) * 100)
      : 0;
    output += `   Success rate: ${personaSuccessRate}%\n\n`;
  }

  const totalErrors = summary.documents.errors + summary.personas.errors;
  const totalWarnings = summary.documents.warnings + summary.personas.warnings;

  if (totalErrors > 0) {
    output += '🚨 FILES REQUIRING FIXES:\n';
    summary.results
      .filter(r => !r.valid && r.errors > 0)
      .forEach(r => {
        const icon = r.type === 'document' ? '📄' : '🎭';
        output += `   ${icon} ${relative(process.cwd(), r.file)} (${r.errors} errors, ${r.warnings} warnings)\n`;
      });
    output += '\n';
  }

  const overallValid = summary.documents.valid + summary.personas.valid;
  const overallRate = summary.totalFiles > 0
    ? Math.round((overallValid / summary.totalFiles) * 100)
    : 0;

  output += `🎯 Overall success rate: ${overallRate}%\n`;

  return output;
}

async function main() {
  const { options, target } = parseArguments();

  if (options.help || !target) {
    console.log(HELP_TEXT);
    process.exit(options.help ? 0 : 1);
  }

  // Validate conflicting options
  if (options.docsOnly && options.personasOnly) {
    console.error('Error: Cannot use both --docs-only and --personas-only');
    process.exit(1);
  }

  try {
    const files = await findFiles(target);

    if (files.length === 0) {
      console.error(`No markdown files found in: ${target}`);
      process.exit(1);
    }

    // Filter files based on options
    let filesToProcess = files;
    if (options.docsOnly) {
      filesToProcess = files.filter(f => f.type === 'document');
    } else if (options.personasOnly) {
      filesToProcess = files.filter(f => f.type === 'persona');
    }

    if (filesToProcess.length === 0) {
      console.error('No files to validate after applying filters');
      process.exit(1);
    }

    // Preview mode
    if (options.preview) {
      console.log(formatPreview(filesToProcess, options));
      process.exit(0);
    }

    const summary: BatchValidationSummary = {
      totalFiles: filesToProcess.length,
      documents: { count: 0, valid: 0, warnings: 0, errors: 0 },
      personas: { count: 0, valid: 0, warnings: 0, errors: 0 },
      results: [],
    };

    for (const file of filesToProcess) {
      try {
        const content = readFileSync(file.path, 'utf-8');
        let result: any;

        if (file.type === 'document') {
          summary.documents.count++;
          result = validateDocument(content, file.path);
        } else {
          summary.personas.count++;
          const personaId = extractPersonaId(file.path);
          result = validatePersona(content, personaId, file.path);
        }

        const fileResult = {
          file: file.path,
          type: file.type,
          valid: result.valid,
          errors: result.errors.length,
          warnings: result.warnings.length,
          details: options.json ? result : undefined,
        };

        summary.results.push(fileResult);

        // Update type-specific counters
        const typeCounter = file.type === 'document' ? summary.documents : summary.personas;

        if (result.valid) {
          typeCounter.valid++;
        } else {
          if (result.errors.length > 0) {
            typeCounter.errors++;
          }
          if (result.warnings.length > 0) {
            typeCounter.warnings++;
          }
        }

        // Output individual results if verbose
        if (options.verbose && !options.json && !options.quiet) {
          const icon = file.type === 'document' ? '📄' : '🎭';
          const status = result.valid ? '✅' : '❌';
          console.log(`${icon} ${status} ${relative(process.cwd(), file.path)}`);

          if (!result.valid) {
            if (result.errors.length > 0) {
              console.log(`   Errors: ${result.errors.length}`);
            }
            if (result.warnings.length > 0) {
              console.log(`   Warnings: ${result.warnings.length}`);
            }
          }
        }

      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error instanceof Error ? error.message : error);

        const typeCounter = file.type === 'document' ? summary.documents : summary.personas;
        typeCounter.count++;
        typeCounter.errors++;

        summary.results.push({
          file: file.path,
          type: file.type,
          valid: false,
          errors: 1,
          warnings: 0,
          details: options.json ? { error: 'Failed to process file' } : undefined,
        });
      }
    }

    // Output summary
    console.log(formatSummary(summary, options));

    // Exit with appropriate code
    const hasErrors = summary.documents.errors > 0 || summary.personas.errors > 0;
    const hasWarnings = summary.documents.warnings > 0 || summary.personas.warnings > 0;

    if (hasErrors || (options.failOnWarnings && hasWarnings)) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    console.error('Batch validation failed:', error instanceof Error ? error.message : error);
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