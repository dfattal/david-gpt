#!/usr/bin/env tsx
/**
 * CLI tool for ingesting processed RAG documents into database
 * Usage: pnpm ingest:db <persona-slug> [options]
 */

import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { createIngestor, type DocumentToIngest } from '../src/lib/rag/ingestion/databaseIngestor';

// Load .env.local
config({ path: path.join(process.cwd(), '.env.local') });

interface IngestionOptions {
  personaSlug: string;
  ragDir?: string;
  overwrite?: boolean;
  files?: string[]; // Specific files to ingest
}

/**
 * Scan RAG directory for markdown files
 */
async function scanRagDirectory(ragDir: string, specificFiles?: string[]): Promise<string[]> {
  try {
    const entries = await fs.readdir(ragDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(ragDir, entry.name);

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
    console.error(`Failed to scan RAG directory ${ragDir}:`, error);
    return [];
  }
}

/**
 * Load documents from file paths
 */
async function loadDocuments(filePaths: string[]): Promise<DocumentToIngest[]> {
  const documents: DocumentToIngest[] = [];

  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      documents.push({ filePath, content });
      console.log(`  ✓ Loaded: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`  ✗ Failed to read ${filePath}:`, error);
    }
  }

  return documents;
}

/**
 * Main ingestion function
 */
async function ingestToDatabase(options: IngestionOptions): Promise<void> {
  const personasDir = path.join(process.cwd(), 'personas');
  const personaDir = path.join(personasDir, options.personaSlug);
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

  // Check if RAG directory exists
  try {
    await fs.access(ragDir);
  } catch {
    console.error(`Error: RAG directory not found: ${ragDir}`);
    console.error(`Please run document processing first: pnpm process:docs ${options.personaSlug}`);
    process.exit(1);
  }

  console.log(`\n=== Ingesting documents to database ===`);
  console.log(`Persona: ${options.personaSlug}`);
  console.log(`Source: ${ragDir}`);
  console.log(`Overwrite: ${options.overwrite ? 'Yes' : 'No'}\n`);

  // Scan for markdown files
  const filePaths = await scanRagDirectory(ragDir, options.files);

  if (filePaths.length === 0) {
    console.log(`No markdown files found in ${ragDir}`);
    return;
  }

  console.log(`Found ${filePaths.length} document(s) to ingest\n`);

  // Load documents
  const documents = await loadDocuments(filePaths);

  if (documents.length === 0) {
    console.log(`No documents loaded successfully`);
    return;
  }

  // Create ingestor and ingest documents
  const ingestor = createIngestor();
  const stats = await ingestor.ingestDocuments(documents, options.overwrite);

  // Print summary
  console.log(`\n=== Ingestion Summary ===`);
  console.log(`Total documents: ${stats.documentsProcessed}`);
  console.log(`Successfully ingested: ${stats.documentsIngested}`);
  console.log(`Failed: ${stats.documentsFailed}`);
  console.log(`Skipped (already exist): ${stats.documentsSkipped || 0}`);
  console.log(`Total chunks created: ${stats.chunksCreated}`);
  console.log(`Total embeddings generated: ${stats.embeddingsGenerated}`);

  if (stats.documentsFailed > 0) {
    console.log(`\n=== Failed Documents ===`);
    stats.results
      .filter((r) => r.error)
      .forEach((r) => {
        console.log(`  - ${r.title}: ${r.error}`);
      });
  }

  if (stats.documentsSkipped && stats.documentsSkipped > 0) {
    console.log(`\n=== Skipped Documents (already in DB) ===`);
    stats.results
      .filter((r) => r.skipped)
      .forEach((r) => {
        console.log(`  - ${r.title}`);
      });
    console.log(`\nUse --overwrite flag to re-ingest existing documents`);
  }

  process.exit(stats.documentsFailed > 0 ? 1 : 0);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm ingest:db <persona-slug> [options]

Arguments:
  <persona-slug>         Persona slug (e.g., "david", "legal")

Options:
  --overwrite            Re-ingest documents that already exist in database
  --file <file>          Ingest specific file(s) only (can be used multiple times)
  --rag <path>           Custom RAG directory path
  --help, -h             Show this help message

Examples:
  # Ingest all documents from persona RAG directory
  pnpm ingest:db david

  # Re-ingest all documents (overwrite existing)
  pnpm ingest:db david --overwrite

  # Ingest specific files only
  pnpm ingest:db david --file us11281020.md --file lif.md

  # Custom RAG directory
  pnpm ingest:db david --rag /path/to/rag
    `);
    process.exit(0);
  }

  const personaSlug = args[0];
  const options: IngestionOptions = {
    personaSlug,
    overwrite: args.includes('--overwrite'),
    files: [],
  };

  // Parse --file arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.files!.push(args[i + 1]);
      i++; // Skip next arg
    }
  }

  // Parse custom RAG path
  const ragIndex = args.indexOf('--rag');
  if (ragIndex !== -1 && args[ragIndex + 1]) {
    options.ragDir = args[ragIndex + 1];
  }

  try {
    await ingestToDatabase(options);
  } catch (error) {
    console.error(`\nFatal error during ingestion:`, error);
    process.exit(1);
  }
}

main();