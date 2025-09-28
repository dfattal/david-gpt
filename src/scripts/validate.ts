#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { resolve } from 'path';

const HELP_TEXT = `
🔍 David-GPT Validation Tools

Usage: tsx src/scripts/validate.ts <command> [options] [target]

Commands:
  document <file-or-pattern>    Validate document formatting
  persona <file-or-pattern>     Validate persona files
  batch <directory-or-pattern>  Batch validate directory or pattern
  help                          Show this help message

Global Options:
  -v, --verbose                 Show detailed validation results
  -q, --quiet                   Only show errors and summary
  --json                        Output results as JSON
  --fail-on-warnings            Exit with error code if warnings are found

Document Validation Options:
  (none additional)

Persona Validation Options:
  --test-parser                 Test persona parsing compatibility

Batch Validation Options:
  --docs-only                   Only validate documents
  --personas-only               Only validate personas
  --preview                     Show what would be validated

Examples:
  # Validate a single document
  tsx src/scripts/validate.ts document paper.md
  tsx src/scripts/validate.ts document --verbose "RAG-SAMPLES/*.md"

  # Validate a persona
  tsx src/scripts/validate.ts persona financial-expert.md
  tsx src/scripts/validate.ts persona --test-parser expert.md

  # Batch validate a directory
  tsx src/scripts/validate.ts batch RAG-SAMPLES/
  tsx src/scripts/validate.ts batch --preview --docs-only "content/**"
  tsx src/scripts/validate.ts batch --verbose "**/*.md"

  # Get JSON output for integration
  tsx src/scripts/validate.ts document --json paper.md > results.json
  tsx src/scripts/validate.ts batch --json RAG-SAMPLES/ > batch-results.json

Quick validation commands:
  # Check all documents in RAG-SAMPLES
  tsx src/scripts/validate.ts batch --docs-only RAG-SAMPLES/

  # Validate all personas
  tsx src/scripts/validate.ts batch --personas-only --test-parser "**/*.md"

  # Preview what files would be validated
  tsx src/scripts/validate.ts batch --preview .
`;

function getScriptPath(command: string): string {
  const scriptMap: Record<string, string> = {
    document: 'validate-document.ts',
    persona: 'validate-persona.ts',
    batch: 'batch-validate.ts',
  };

  const scriptName = scriptMap[command];
  if (!scriptName) {
    throw new Error(`Unknown command: ${command}`);
  }

  return resolve(__dirname, scriptName);
}

function main() {
  const args = process.argv.slice(2);

  if (
    args.length === 0 ||
    args[0] === 'help' ||
    args[0] === '--help' ||
    args[0] === '-h'
  ) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  // Validate command
  if (!['document', 'persona', 'batch'].includes(command)) {
    console.error(`❌ Unknown command: ${command}`);
    console.error('Available commands: document, persona, batch, help');
    process.exit(1);
  }

  try {
    const scriptPath = getScriptPath(command);
    const cmd = `tsx "${scriptPath}" ${restArgs.map(arg => `"${arg}"`).join(' ')}`;

    // Execute the appropriate validation script
    execSync(cmd, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error: any) {
    // execSync throws on non-zero exit codes, which is expected for validation failures
    process.exit(error.status || 1);
  }
}

// Run the wrapper
if (require.main === module) {
  main();
}
