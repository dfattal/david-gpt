#!/usr/bin/env tsx

/**
 * Fix Implicit Any Parameters (TS7006)
 *
 * Automatically adds 'any' type annotations to parameters that have implicit any types
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ImplicitAnyError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  fullMessage: string;
}

class ImplicitAnyFixer {
  private errors: ImplicitAnyError[] = [];
  private fixedCount = 0;

  async fixImplicitAnyErrors(): Promise<void> {
    console.log('🔧 Fixing implicit any parameter errors...');

    // Load the implicit any errors
    try {
      const errorsData = readFileSync('ts-implicit-any-errors.json', 'utf8');
      this.errors = JSON.parse(errorsData);
    } catch (error) {
      console.error('❌ Could not load ts-implicit-any-errors.json');
      return;
    }

    console.log(`📊 Found ${this.errors.length} implicit any errors to fix`);

    // Group errors by file for efficient processing
    const errorsByFile = this.groupErrorsByFile();

    for (const [fileName, fileErrors] of errorsByFile.entries()) {
      await this.fixFileErrors(fileName, fileErrors);
    }

    console.log(`✅ Fixed ${this.fixedCount} implicit any parameters`);
  }

  private groupErrorsByFile(): Map<string, ImplicitAnyError[]> {
    const grouped = new Map<string, ImplicitAnyError[]>();

    for (const error of this.errors) {
      if (!grouped.has(error.file)) {
        grouped.set(error.file, []);
      }
      grouped.get(error.file)!.push(error);
    }

    return grouped;
  }

  private async fixFileErrors(fileName: string, errors: ImplicitAnyError[]): Promise<void> {
    try {
      const filePath = fileName.startsWith('/') ? fileName : join(process.cwd(), fileName);
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Sort errors by line number in descending order so we can modify from bottom to top
      const sortedErrors = errors.sort((a, b) => b.line - a.line);

      let modified = false;

      for (const error of sortedErrors) {
        const lineIndex = error.line - 1; // Convert to 0-based index
        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex];
          const fixedLine = this.fixImplicitAnyInLine(line, error);

          if (fixedLine !== line) {
            lines[lineIndex] = fixedLine;
            modified = true;
            this.fixedCount++;
            console.log(`  ✓ Fixed line ${error.line} in ${fileName}`);
          }
        }
      }

      if (modified) {
        writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`📝 Updated ${fileName} with ${errors.length} fixes`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error);
    }
  }

  private fixImplicitAnyInLine(line: string, error: ImplicitAnyError): string {
    // Extract parameter name from error message
    const paramMatch = error.message.match(/Parameter '(\w+)' implicitly has an 'any' type/);
    if (!paramMatch) {
      return line;
    }

    const paramName = paramMatch[1];

    // Common patterns for implicit any parameters
    const patterns = [
      // Function parameters: (param) => or function(param)
      {
        regex: new RegExp(`\\b${paramName}\\b(?=\\s*[),:])`),
        replacement: `${paramName}: any`
      },
      // Arrow function parameters: param =>
      {
        regex: new RegExp(`\\b${paramName}\\b(?=\\s*=>)`),
        replacement: `${paramName}: any`
      },
      // Method parameters: method(param)
      {
        regex: new RegExp(`\\(([^)]*\\b${paramName}\\b[^)]*)\\)`),
        replacement: (match: string, params: string) => {
          return `(${params.replace(new RegExp(`\\b${paramName}\\b`), `${paramName}: any`)})`;
        }
      },
      // For-in/for-of parameters: for (param in/of)
      {
        regex: new RegExp(`for\\s*\\(\\s*${paramName}\\b`),
        replacement: `for (${paramName}: any`
      },
      // Catch parameters: catch (param)
      {
        regex: new RegExp(`catch\\s*\\(\\s*${paramName}\\b`),
        replacement: `catch (${paramName}: any`
      }
    ];

    for (const pattern of patterns) {
      if (typeof pattern.replacement === 'string') {
        if (pattern.regex.test(line)) {
          return line.replace(pattern.regex, pattern.replacement);
        }
      } else {
        const match = line.match(pattern.regex);
        if (match) {
          return line.replace(pattern.regex, pattern.replacement as any);
        }
      }
    }

    return line;
  }
}

// Execute the fixer
async function main() {
  const fixer = new ImplicitAnyFixer();
  await fixer.fixImplicitAnyErrors();
}

if (require.main === module) {
  main().catch(console.error);
}

export { ImplicitAnyFixer };