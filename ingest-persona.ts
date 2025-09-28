#!/usr/bin/env tsx

import { Command } from 'commander';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

// Load environment variables first
require('dotenv').config({ path: '.env.local' });

interface IngestOptions {
  persona: string;
  docs?: string;
  all?: boolean;
  overwrite?: boolean;
  skip?: boolean;
  dryRun?: boolean;
  validate?: boolean;
  verbose?: boolean;
}

interface ProcessingResult {
  filename: string;
  title: string;
  status: 'ingested' | 'skipped' | 'failed' | 'duplicate' | 'validated';
  reason?: string;
  documentId?: string;
  processingTime?: number;
  chunks?: number;
  entities?: number;
}

const program = new Command();

program
  .name('ingest-persona')
  .description('Ingest formatted documents for a specific persona into the RAG database')
  .version('1.0.0');

program
  .option('-p, --persona <persona>', 'Persona name (required)')
  .option('-d, --docs <documents>', 'Comma-separated list of specific documents to ingest')
  .option('-a, --all', 'Ingest all documents from the formatted directory')
  .option('-o, --overwrite', 'Overwrite existing documents in database')
  .option('-s, --skip', 'Skip existing documents (default behavior)')
  .option('--dry-run', 'Simulate ingestion without actual database changes')
  .option('--validate', 'Validate documents only without ingesting')
  .option('-v, --verbose', 'Enable verbose logging');

// Add help examples
program.addHelpText('after', `
Examples:
  # Ingest all documents for david persona, skip existing
  $ tsx ingest-persona.ts --persona=david --all

  # Ingest specific documents with overwrite
  $ tsx ingest-persona.ts --persona=david --docs="paper1.md,patent2.md" --overwrite

  # Dry run to see what would be processed
  $ tsx ingest-persona.ts --persona=david --all --dry-run

  # Validate all documents without ingesting
  $ tsx ingest-persona.ts --persona=david --all --validate

  # Verbose processing for debugging
  $ tsx ingest-persona.ts --persona=david --all --verbose

Persona Directory Structure:
  personas/{persona}/formatted/
  ├── papers/          # Academic papers
  ├── patents/         # Patent documents
  ├── press-articles/  # Press articles and news
  ├── notes/           # Personal notes
  └── books/           # Book content

The script will:
  ✅ Check for duplicate titles in database
  ✅ Validate document format and frontmatter
  ✅ Process documents through unified ingestion service
  ✅ Generate embeddings and chunks
  ✅ Extract entities and relationships
  ✅ Provide detailed progress reporting
`);

async function runIngestion(options: IngestOptions): Promise<void> {
  try {
    // Import heavy modules only when needed (after dotenv is loaded)
    const { createOptimizedAdminClient } = await import('./src/lib/supabase/server');
    const { unifiedIngestionService } = await import('./src/lib/rag/ingestion-service');
    const { DocumentFormatValidator } = await import('./src/lib/validation/document-format-validator');

    // Validate required options
    if (!options.persona) {
      console.error('❌ Error: --persona option is required');
      console.log('   Use: tsx ingest-persona.ts --persona=david --all');
      process.exit(1);
    }

    if (!options.all && !options.docs) {
      console.error('❌ Error: Either --all or --docs must be specified');
      console.log('   Use: --all for all documents or --docs="doc1.md,doc2.md" for specific documents');
      process.exit(1);
    }

    if (options.overwrite && options.skip) {
      console.error('❌ Error: Cannot use both --overwrite and --skip');
      process.exit(1);
    }

    // Set default behavior (skip existing)
    const skipExisting = !options.overwrite;

    // Log configuration
    console.log('🚀 Starting persona document ingestion');
    console.log(`📋 Configuration:`);
    console.log(`   Persona: ${options.persona}`);
    console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : options.validate ? 'VALIDATION ONLY' : 'INGESTION'}`);
    console.log(`   Documents: ${options.all ? 'ALL' : options.docs}`);
    console.log(`   Duplicates: ${skipExisting ? 'SKIP' : 'OVERWRITE'}`);
    console.log(`   Verbose: ${options.verbose ? 'YES' : 'NO'}`);
    console.log('');

    // Verify persona directory
    const formattedDir = join(process.cwd(), 'personas', options.persona, 'formatted');

    try {
      statSync(formattedDir);
    } catch {
      console.error(`❌ Error: Formatted directory not found for persona: ${options.persona}`);
      console.log(`   Expected path: ${formattedDir}`);
      console.log(`   💡 Run document processing first: make process-manifest-${options.persona}`);
      process.exit(1);
    }

    // Get available documents
    const availableDocuments = getFormattedDocuments(formattedDir);

    if (availableDocuments.length === 0) {
      console.error('❌ Error: No formatted documents found');
      console.log(`   Directory: ${formattedDir}`);
      console.log(`   💡 Process raw documents first: make process-manifest-${options.persona}`);
      process.exit(1);
    }

    if (options.verbose) {
      console.log(`📄 Found ${availableDocuments.length} formatted documents:`);
      availableDocuments.forEach(doc => console.log(`   - ${doc}`));
      console.log('');
    }

    // Determine documents to process
    let documentsToProcess: string[];

    if (options.all) {
      documentsToProcess = availableDocuments;
    } else {
      const requestedDocs = options.docs!.split(',').map(d => d.trim());
      const missingDocs = requestedDocs.filter(doc => !availableDocuments.includes(doc));

      if (missingDocs.length > 0) {
        console.error('❌ Error: Some requested documents not found:');
        missingDocs.forEach(doc => console.log(`   - ${doc}`));
        console.log('\n📄 Available documents:');
        availableDocuments.forEach(doc => console.log(`   - ${doc}`));
        process.exit(1);
      }

      documentsToProcess = requestedDocs;
    }

    console.log(`📊 Processing ${documentsToProcess.length} documents`);
    console.log('');

    // Initialize database connection
    const supabase = createOptimizedAdminClient();
    const user = { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', email: 'dfattal@gmail.com' };

    // Get persona UUID from persona name
    const personaUuid = await getPersonaUuid(supabase, options.persona);
    if (!personaUuid) {
      console.error(`❌ Error: Persona '${options.persona}' not found in database`);
      console.log(`   Available personas: check the personas table`);
      process.exit(1);
    }

    console.log(`👤 Persona UUID: ${personaUuid}`);

    // Process documents
    const results: ProcessingResult[] = [];
    const summary = {
      total: documentsToProcess.length,
      ingested: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
      validated: 0
    };

    for (let i = 0; i < documentsToProcess.length; i++) {
      const filename = documentsToProcess[i];
      const progress = `[${i + 1}/${documentsToProcess.length}]`;

      try {
        console.log(`${progress} Processing: ${filename}`);

        // Find document path
        const filePath = findDocumentPath(formattedDir, filename);
        if (!filePath) {
          console.log(`   ❌ File not found in formatted directory`);
          results.push({
            filename,
            title: filename,
            status: 'failed',
            reason: 'File not found'
          });
          summary.failed++;
          continue;
        }

        // Read and parse document
        const content = readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        if (!frontmatter.title || !frontmatter.docType) {
          console.log(`   ❌ Missing required frontmatter (title or docType)`);
          results.push({
            filename,
            title: frontmatter.title || filename,
            status: 'failed',
            reason: 'Invalid frontmatter'
          });
          summary.failed++;
          continue;
        }

        // Validate document
        const validation = DocumentFormatValidator.validateDocument(content, filename);

        if (options.verbose) {
          console.log(`   📋 Title: ${frontmatter.title}`);
          console.log(`   📂 Type: ${frontmatter.docType}`);
          console.log(`   ✅ Valid: ${validation.isValid}`);
          if (validation.warnings.length > 0) {
            console.log(`   ⚠️  Warnings: ${validation.warnings.length}`);
          }
        }

        if (options.validate) {
          results.push({
            filename,
            title: frontmatter.title,
            status: 'validated',
            reason: validation.isValid ? 'Valid document' : 'Validation failed'
          });
          summary.validated++;
          continue;
        }

        // Check for duplicates
        const duplicateCheck = await checkForDuplicate(supabase, frontmatter.title, personaUuid);

        if (duplicateCheck.exists && skipExisting) {
          console.log(`   ⏭️  Skipped: Document already exists (${duplicateCheck.created_at})`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'duplicate',
            reason: `Already exists in database`,
            documentId: duplicateCheck.document_id
          });
          summary.duplicates++;
          continue;
        }

        if (options.dryRun) {
          const action = duplicateCheck.exists ? 'overwrite' : 'ingest';
          console.log(`   🔍 Dry run: Would ${action} document`);
          results.push({
            filename,
            title: frontmatter.title,
            status: duplicateCheck.exists ? 'duplicate' : 'ingested',
            reason: `Dry run - would be ${action}ed`
          });
          if (!duplicateCheck.exists) summary.ingested++;
          else summary.duplicates++;
          continue;
        }

        // Delete existing if overwriting
        if (duplicateCheck.exists && !skipExisting) {
          console.log(`   🔄 Overwriting existing document...`);
          await deleteExistingDocument(supabase, duplicateCheck.document_id!);
        }

        // Perform ingestion
        const startTime = Date.now();

        const ingestionResult = await unifiedIngestionService.ingestDocuments({
          type: 'single',
          title: frontmatter.title,
          content: content,
          docType: frontmatter.docType as any, // DocumentType import would cause early API client loading
          userId: user.id,
          persona: { persona_id: personaUuid } as any,
          metadata: {
            sourceType: 'cli-ingestion',
            originalFilename: filename,
            filePath,
            persona_id: personaUuid,
            ...frontmatter
          }
        }, { supabase, user });

        const processingTime = Date.now() - startTime;

        if (ingestionResult.success) {
          console.log(`   ✅ Success: ${ingestionResult.documentId} (${processingTime}ms)`);
          if (options.verbose && (ingestionResult as any).chunks_created) {
            console.log(`      📝 Chunks: ${(ingestionResult as any).chunks_created}`);
            console.log(`      🏷️  Entities: ${(ingestionResult as any).entities_extracted || 0}`);
          }

          results.push({
            filename,
            title: frontmatter.title,
            status: 'ingested',
            documentId: ingestionResult.documentId,
            processingTime,
            chunks: (ingestionResult as any).chunks_created,
            entities: (ingestionResult as any).entities_extracted
          });
          summary.ingested++;
        } else {
          console.log(`   ❌ Failed: ${ingestionResult.error}`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'failed',
            reason: ingestionResult.error || 'Unknown error'
          });
          summary.failed++;
        }

        // Small delay to prevent overwhelming the system
        if (i < documentsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        console.log(`   💥 Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.push({
          filename,
          title: filename,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
        summary.failed++;
      }

      console.log('');
    }

    // Print summary
    console.log('='.repeat(60));
    console.log(`📊 INGESTION SUMMARY FOR PERSONA: ${options.persona.toUpperCase()}`);
    console.log('='.repeat(60));
    console.log(`📄 Total documents: ${summary.total}`);
    if (options.validate) {
      console.log(`✅ Validated: ${summary.validated}`);
    } else {
      console.log(`✅ Successfully ingested: ${summary.ingested}`);
      console.log(`⏭️  Skipped (duplicates): ${summary.duplicates}`);
      console.log(`❌ Failed: ${summary.failed}`);
    }

    const successRate = summary.total > 0 ?
      ((summary.ingested + summary.validated + summary.duplicates) / summary.total * 100).toFixed(1) : 0;
    console.log(`🎯 Success rate: ${successRate}%`);

    if (options.dryRun) {
      console.log('');
      console.log('💡 This was a dry run - no actual changes were made to the database');
      console.log('   Remove --dry-run to perform actual ingestion');
    }

    if (options.validate) {
      console.log('');
      console.log('💡 This was validation only - no documents were ingested');
      console.log('   Remove --validate to perform actual ingestion');
    }

    // Print detailed results if verbose or if there were failures
    if (options.verbose || summary.failed > 0) {
      console.log('');
      console.log('📋 DETAILED RESULTS:');
      results.forEach(result => {
        const statusIcon = {
          'ingested': '✅',
          'skipped': '⏭️',
          'failed': '❌',
          'duplicate': '📋',
          'validated': '✅'
        }[result.status];

        console.log(`   ${statusIcon} ${result.filename}`);
        console.log(`      Title: ${result.title}`);
        console.log(`      Status: ${result.status}`);
        if (result.reason) console.log(`      Reason: ${result.reason}`);
        if (result.documentId) console.log(`      Document ID: ${result.documentId}`);
        if (result.processingTime) console.log(`      Processing Time: ${result.processingTime}ms`);
        if (result.chunks) console.log(`      Chunks Created: ${result.chunks}`);
        if (result.entities) console.log(`      Entities Extracted: ${result.entities}`);
        console.log('');
      });
    }

    // Exit with appropriate code
    const exitCode = summary.failed > 0 ? 1 : 0;
    process.exit(exitCode);

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Helper functions
async function getPersonaUuid(supabase: any, personaId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('personas')
      .select('id')
      .eq('persona_id', personaId)
      .single();

    if (error) {
      console.error('Error fetching persona:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('Persona lookup error:', error);
    return null;
  }
}

function getFormattedDocuments(formattedDir: string): string[] {
  try {
    const documents: string[] = [];
    const subdirs = readdirSync(formattedDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const subdirPath = join(formattedDir, subdir);
      const files = readdirSync(subdirPath)
        .filter(file => file.endsWith('.md'));
      documents.push(...files);
    }

    return documents.sort();
  } catch {
    return [];
  }
}

function findDocumentPath(formattedDir: string, filename: string): string | null {
  try {
    const subdirs = readdirSync(formattedDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const filePath = join(formattedDir, subdir, filename);
      try {
        statSync(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseFrontmatter(content: string): { frontmatter: any; markdownContent: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, markdownContent: content };
  }

  try {
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(match[1]) as any;
    return {
      frontmatter: frontmatter || {},
      markdownContent: match[2]
    };
  } catch {
    return { frontmatter: {}, markdownContent: content };
  }
}

async function checkForDuplicate(supabase: any, title: string, persona_id: string) {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('title', title)
      .eq('persona_id', persona_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking for duplicate:', error);
      return { exists: false };
    }

    if (data) {
      return {
        exists: true,
        document_id: data.id,
        title: data.title,
        created_at: new Date(data.created_at).toLocaleDateString()
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { exists: false };
  }
}

async function deleteExistingDocument(supabase: any, documentId: string): Promise<void> {
  try {
    // Delete related data first
    await Promise.all([
      supabase.from('document_chunks').delete().eq('document_id', documentId),
      supabase.from('document_entities').delete().eq('document_id', documentId),
      supabase.from('document_citations').delete().eq('document_id', documentId)
    ]);

    await supabase.from('documents').delete().eq('id', documentId);
  } catch (error) {
    console.error('Error deleting existing document:', error);
    throw error;
  }
}

// Parse command line arguments and run ingestion
program.parse(process.argv);

const options = program.opts() as IngestOptions;

// Run the ingestion
runIngestion(options).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});