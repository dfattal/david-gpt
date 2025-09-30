#!/usr/bin/env tsx
/**
 * CLI tool for processing RAW documents into RAG markdown
 * Usage: pnpm process:docs <persona-slug> [options]
 */

import fs from 'fs/promises';
import path from 'path';
import { extractText, detectFileType } from '../src/lib/rag/ingestion/textExtraction';
import { generateDocument } from '../src/lib/rag/ingestion/frontmatterGenerator';
import { processMarkdown } from '../src/lib/rag/ingestion/markdownProcessor';
import { processWithGemini, processWithFallback, validateGeminiOutput } from '../src/lib/rag/ingestion/geminiProcessor';

interface ProcessingOptions {
  personaSlug: string;
  rawDocsDir?: string;
  ragDir?: string;
  useGemini?: boolean; // Use Gemini-first processing (default: true)
  overwrite?: boolean; // Overwrite existing files in RAG directory
  files?: string[]; // Specific files to process
}

/**
 * Scan directory for files
 */
async function scanDirectory(dir: string, specificFiles?: string[]): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await scanDirectory(fullPath, specificFiles);
        files.push(...subFiles);
      } else {
        // If specific files provided, only include those
        if (specificFiles && specificFiles.length > 0) {
          if (specificFiles.includes(entry.name) || specificFiles.includes(fullPath)) {
            files.push(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    }

    return files;
  } catch (error) {
    console.error(`Failed to scan directory ${dir}:`, error);
    return [];
  }
}

/**
 * Process RAW documents into RAG markdown
 */
async function processRawDocuments(
  rawDocsDir: string,
  ragDir: string,
  personaSlug: string,
  useGemini: boolean = true,
  overwrite: boolean = false,
  specificFiles?: string[]
): Promise<string[]> {
  console.log(`\n=== Processing RAW documents ===`);
  console.log(`Source: ${rawDocsDir}`);
  console.log(`Output: ${ragDir}`);
  console.log(`Strategy: ${useGemini ? 'Gemini-first' : 'Basic extraction'}`);
  console.log(`Overwrite: ${overwrite ? 'Yes' : 'No'}`);

  // Scan for files
  const files = await scanDirectory(rawDocsDir, specificFiles);
  console.log(`Found ${files.length} files to process\n`);

  const processedFiles: string[] = [];

  for (const filePath of files) {
    try {
      console.log(`Processing: ${path.basename(filePath)}`);

      const fileType = detectFileType(filePath);
      const outputPath = path.join(
        ragDir,
        path.basename(filePath, path.extname(filePath)) + '.md'
      );

      // Check if output file already exists
      if (!overwrite) {
        try {
          await fs.access(outputPath);
          console.log(`  Skipped: Output file already exists (use --overwrite to replace)\n`);
          continue;
        } catch {
          // File doesn't exist, proceed with processing
        }
      }

      let finalDocument: string;

      // Route processing based on options
      if (useGemini) {
        // Gemini processing for all file types
        console.log(`  Using Gemini CLI for direct processing...`);

        const geminiResult = await processWithFallback(
          filePath,
          personaSlug,
          ragDir, // Pass output directory
          async (path) => {
            // Fallback to basic extraction
            const rawText = await extractText(path);
            const processedMarkdown = processMarkdown(rawText);
            return generateDocument(outputPath, processedMarkdown);
          }
        );

        if (!geminiResult.success) {
          throw new Error(geminiResult.error);
        }

        // Validate Gemini output
        const validation = validateGeminiOutput(geminiResult.markdown);
        if (!validation.valid) {
          console.warn(`  ⚠ Validation warnings:`);
          validation.errors.forEach((err) => console.warn(`    - ${err}`));
        }

        // Gemini already wrote the file, just track it
        console.log(`  ✓ Saved to: ${path.basename(geminiResult.outputPath || outputPath)}\n`);
        processedFiles.push(geminiResult.outputPath || outputPath);
        continue; // Skip the file writing below
      } else {
        // Basic extraction for other file types or when Gemini not requested
        console.log(`  Using basic extraction...`);

        const rawText = await extractText(filePath);
        console.log(`  Extracted ${rawText.length} characters`);

        const processedMarkdown = processMarkdown(rawText);
        finalDocument = generateDocument(outputPath, processedMarkdown);
      }

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Write processed file
      await fs.writeFile(outputPath, finalDocument, 'utf-8');
      console.log(`  ✓ Saved to: ${path.basename(outputPath)}\n`);

      processedFiles.push(outputPath);
    } catch (error) {
      console.error(`  ✗ Failed to process ${filePath}:`, error);
    }
  }

  console.log(`\nProcessed ${processedFiles.length}/${files.length} files\n`);
  return processedFiles;
}

/**
 * Main processing function
 */
async function processDocuments(options: ProcessingOptions): Promise<void> {
  const personasDir = path.join(process.cwd(), 'personas');
  const personaDir = path.join(personasDir, options.personaSlug);

  const rawDocsDir = options.rawDocsDir || path.join(personaDir, 'RAW-DOCS');
  const ragDir = options.ragDir || path.join(personaDir, 'RAG');

  // Check if persona directory exists
  try {
    await fs.access(personaDir);
  } catch {
    console.error(`Error: Persona directory not found: ${personaDir}`);
    console.error(`Available personas:`);

    const personas = await fs.readdir(personasDir);
    for (const p of personas) {
      const stat = await fs.stat(path.join(personasDir, p));
      if (stat.isDirectory()) {
        console.error(`  - ${p}`);
      }
    }

    process.exit(1);
  }

  // Check if RAW-DOCS directory exists
  try {
    await fs.access(rawDocsDir);
  } catch {
    console.error(`Error: RAW-DOCS directory not found: ${rawDocsDir}`);
    console.error(`Please create it and add documents to process`);
    process.exit(1);
  }

  // Process RAW documents
  const processedFiles = await processRawDocuments(
    rawDocsDir,
    ragDir,
    options.personaSlug,
    options.useGemini !== false, // Default to true
    options.overwrite || false,
    options.files
  );

  console.log(`\n=== Processing Complete ===`);
  console.log(`Processed ${processedFiles.length} documents`);
  console.log(`\nNext step: Ingest to database with:`);
  console.log(`  pnpm ingest:db ${options.personaSlug}`);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm process:docs <persona-slug> [options]

Process RAW documents into structured RAG markdown files

Arguments:
  <persona-slug>         Persona slug (e.g., "david", "legal")

Options:
  --overwrite            Overwrite existing files in RAG directory
  --file <file>          Process specific file(s) only (can be used multiple times)
  --no-gemini            Disable Gemini-first processing (use basic extraction)
  --raw-docs <path>      Custom RAW-DOCS directory path
  --rag <path>           Custom RAG directory path
  --help, -h             Show this help message

Examples:
  # Process all RAW documents with Gemini (default)
  pnpm process:docs david

  # Overwrite existing RAG files
  pnpm process:docs david --overwrite

  # Process specific files only
  pnpm process:docs david --file US11281020.pdf --file LIF.md

  # Use basic extraction instead of Gemini
  pnpm process:docs david --no-gemini

  # Custom directories
  pnpm process:docs legal --raw-docs /path/to/docs --rag /path/to/rag
    `);
    process.exit(0);
  }

  const personaSlug = args[0];
  const options: ProcessingOptions = {
    personaSlug,
    overwrite: args.includes('--overwrite'),
    useGemini: !args.includes('--no-gemini'), // Default to true
    files: [],
  };

  // Parse --file arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.files!.push(args[i + 1]);
      i++; // Skip next arg
    }
  }

  // Parse custom paths
  const rawDocsIndex = args.indexOf('--raw-docs');
  if (rawDocsIndex !== -1 && args[rawDocsIndex + 1]) {
    options.rawDocsDir = args[rawDocsIndex + 1];
  }

  const ragIndex = args.indexOf('--rag');
  if (ragIndex !== -1 && args[ragIndex + 1]) {
    options.ragDir = args[ragIndex + 1];
  }

  try {
    await processDocuments(options);
  } catch (error) {
    console.error(`\nFatal error during processing:`, error);
    process.exit(1);
  }
}

main();