#!/usr/bin/env tsx

/**
 * Fix Property Typos (TS2551)
 *
 * Automatically fixes property typos when TypeScript suggests the correct name
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface PropertyTypoError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  fullMessage: string;
}

class PropertyTypoFixer {
  private errors: PropertyTypoError[] = [];
  private fixedCount = 0;

  async fixPropertyTypos(): Promise<void> {
    console.log('🔧 Fixing property typo errors...');

    // Load the typo errors
    try {
      const errorsData = readFileSync('ts-typo-errors.json', 'utf8');
      this.errors = JSON.parse(errorsData);
    } catch (error) {
      console.error('❌ Could not load ts-typo-errors.json');
      return;
    }

    console.log(`📊 Found ${this.errors.length} property typo errors to fix`);

    // Group errors by file for efficient processing
    const errorsByFile = this.groupErrorsByFile();

    for (const [fileName, fileErrors] of errorsByFile.entries()) {
      await this.fixFileErrors(fileName, fileErrors);
    }

    console.log(`✅ Fixed ${this.fixedCount} property typos`);
  }

  private groupErrorsByFile(): Map<string, PropertyTypoError[]> {
    const grouped = new Map<string, PropertyTypoError[]>();

    for (const error of this.errors) {
      if (!grouped.has(error.file)) {
        grouped.set(error.file, []);
      }
      grouped.get(error.file)!.push(error);
    }

    return grouped;
  }

  private async fixFileErrors(fileName: string, errors: PropertyTypoError[]): Promise<void> {
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
          const fixedLine = this.fixPropertyTypoInLine(line, error);

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

  private fixPropertyTypoInLine(line: string, error: PropertyTypoError): string {
    // Extract the incorrect and suggested property names from the error message
    const match = error.message.match(/Property '(\w+)' does not exist on type '.*?'\. Did you mean '(\w+)'\?/);
    if (!match) {
      return line;
    }

    const [, incorrectProperty, suggestedProperty] = match;

    // Find and replace the incorrect property with the suggested one
    // We need to be careful to only replace the specific property access, not all occurrences
    const patterns = [
      // Object property access: obj.property
      new RegExp(`\\b${incorrectProperty}\\b(?=\\s*[\\[\\(\\.]|$)`, 'g'),
      // Property in object literal: { property: value }
      new RegExp(`\\b${incorrectProperty}\\b(?=\\s*:)`, 'g'),
      // Destructuring: { property }
      new RegExp(`\\{([^}]*\\b)${incorrectProperty}\\b([^}]*\\})`, 'g'),
    ];

    let fixedLine = line;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        fixedLine = fixedLine.replace(pattern, (match, ...groups) => {
          if (groups.length >= 2) {
            // Destructuring case
            return `{${groups[0]}${suggestedProperty}${groups[1]}`;
          } else {
            // Simple property access case
            return match.replace(incorrectProperty, suggestedProperty);
          }
        });

        // Only apply the first matching pattern
        break;
      }
    }

    return fixedLine;
  }
}

// Execute the fixer
async function main() {
  const fixer = new PropertyTypoFixer();
  await fixer.fixPropertyTypos();
}

if (require.main === module) {
  main().catch(console.error);
}

export { PropertyTypoFixer };