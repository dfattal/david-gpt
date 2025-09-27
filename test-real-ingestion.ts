#!/usr/bin/env tsx

// Real ingestion test script with proper UUID handling
// Load environment variables first
require('dotenv').config({ path: '.env.local' });

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface ProcessingResult {
  filename: string;
  title: string;
  status: 'ingested' | 'skipped' | 'failed' | 'duplicate' | 'validated';
  reason?: string;
  documentId?: string;
  processingTime?: number;
}

async function testRealIngestion(): Promise<void> {
  try {
    console.log('🚀 Testing REAL persona document ingestion for David...');

    // Import heavy modules only when needed (after dotenv is loaded)
    const { createOptimizedAdminClient } = await import('./src/lib/supabase/server');
    const { unifiedIngestionService } = await import('./src/lib/rag/ingestion-service');
    const { DocumentFormatValidator } = await import('./src/lib/validation/document-format-validator');

    const personaDir = 'david'; // Directory name (lowercase)
    const personaId = 'David'; // Database persona_id (case-sensitive)
    const dryRun = false; // REAL INGESTION!

    // Verify formatted directory
    const formattedDir = join(process.cwd(), 'personas', personaDir, 'formatted');

    try {
      statSync(formattedDir);
    } catch {
      console.error(`❌ Error: Formatted directory not found for persona: ${persona}`);
      process.exit(1);
    }

    // Get available documents
    const availableDocuments = getFormattedDocuments(formattedDir);

    if (availableDocuments.length === 0) {
      console.error('❌ Error: No formatted documents found');
      process.exit(1);
    }

    console.log(`📄 Found ${availableDocuments.length} formatted documents`);

    // Initialize database connection
    const supabase = createOptimizedAdminClient();
    const user = { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', email: 'dfattal@gmail.com' };

    // Get persona UUID
    const personaUuid = await getPersonaUuid(supabase, personaId);
    if (!personaUuid) {
      console.error(`❌ Error: Persona '${personaId}' not found in database`);
      process.exit(1);
    }

    console.log(`👤 Persona UUID: ${personaUuid}`);
    console.log('');

    // Process a few documents as test - try different documents
    const testDocuments = availableDocuments.slice(2, 3); // Start with a different document
    const results: ProcessingResult[] = [];

    for (let i = 0; i < testDocuments.length; i++) {
      const filename = testDocuments[i];
      const progress = `[${i + 1}/${testDocuments.length}]`;

      try {
        console.log(`${progress} Processing: ${filename}`);

        // Find document path
        const filePath = findDocumentPath(formattedDir, filename);
        if (!filePath) {
          console.log(`   ❌ File not found`);
          results.push({
            filename,
            title: filename,
            status: 'failed',
            reason: 'File not found'
          });
          continue;
        }

        // Read and parse document
        const content = readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        if (!frontmatter.title || !frontmatter.docType) {
          console.log(`   ❌ Missing required frontmatter`);
          results.push({
            filename,
            title: frontmatter.title || filename,
            status: 'failed',
            reason: 'Invalid frontmatter'
          });
          continue;
        }

        console.log(`   📋 Title: ${frontmatter.title}`);
        console.log(`   📂 Type: ${frontmatter.docType}`);

        // Check for duplicates using proper UUID
        const duplicateCheck = await checkForDuplicate(supabase, frontmatter.title, personaUuid);

        if (duplicateCheck.exists) {
          console.log(`   📋 Duplicate: Already exists in database`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'duplicate',
            reason: 'Already exists'
          });
          continue;
        }

        if (dryRun) {
          console.log(`   🔍 Dry run: Would ingest document`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'ingested',
            reason: 'Dry run - would be processed'
          });
          continue;
        }

        // Perform REAL ingestion
        console.log(`   🚀 Starting real ingestion...`);
        const startTime = Date.now();

        const ingestionResult = await unifiedIngestionService.ingestDocuments({
          type: 'single',
          title: frontmatter.title,
          content: content,
          docType: frontmatter.docType as any,
          userId: user.id,
          persona: { persona_id: personaUuid }, // Use UUID here
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
          console.log(`      📝 Chunks: ${ingestionResult.chunks_created || 0}`);
          console.log(`      🏷️  Entities: ${ingestionResult.entities_extracted || 0}`);

          results.push({
            filename,
            title: frontmatter.title,
            status: 'ingested',
            documentId: ingestionResult.documentId,
            processingTime
          });
        } else {
          console.log(`   ❌ Failed: ${ingestionResult.error}`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'failed',
            reason: ingestionResult.error || 'Unknown error'
          });
        }

      } catch (error) {
        console.log(`   💥 Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.push({
          filename,
          title: filename,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      console.log('');
    }

    // Print summary
    console.log('='.repeat(60));
    console.log(`📊 REAL INGESTION SUMMARY FOR PERSONA: ${personaId.toUpperCase()}`);
    console.log('='.repeat(60));
    console.log(`📄 Total available documents: ${availableDocuments.length}`);
    console.log(`🧪 Documents processed: ${testDocuments.length}`);

    const summary = {
      ingested: results.filter(r => r.status === 'ingested').length,
      duplicates: results.filter(r => r.status === 'duplicate').length,
      failed: results.filter(r => r.status === 'failed').length
    };

    console.log(`✅ Successfully ingested: ${summary.ingested}`);
    console.log(`📋 Duplicates found: ${summary.duplicates}`);
    console.log(`❌ Failed: ${summary.failed}`);

    const successRate = testDocuments.length > 0 ?
      ((summary.ingested + summary.duplicates) / testDocuments.length * 100).toFixed(1) : 0;
    console.log(`🎯 Success rate: ${successRate}%`);

    console.log('');
    console.log('📋 DETAILED RESULTS:');
    results.forEach(result => {
      const statusIcon = {
        'ingested': '✅',
        'duplicate': '📋',
        'failed': '❌'
      }[result.status];

      console.log(`   ${statusIcon} ${result.filename}`);
      console.log(`      Title: ${result.title}`);
      console.log(`      Status: ${result.status}`);
      if (result.reason) console.log(`      Reason: ${result.reason}`);
      if (result.documentId) console.log(`      Document ID: ${result.documentId}`);
      if (result.processingTime) console.log(`      Processing Time: ${result.processingTime}ms`);
      console.log('');
    });

    if (summary.ingested > 0) {
      console.log('🎉 Real ingestion test completed successfully!');
      console.log('💡 Documents are now available in the RAG system for search and chat');

      // Verify documents in database
      const { data: dbDocs } = await supabase
        .from('documents')
        .select('id, title, processing_status')
        .eq('persona_id', personaUuid)
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('');
      console.log('📊 Recent documents in database:');
      (dbDocs || []).forEach(doc => {
        console.log(`   📄 ${doc.title} (${doc.processing_status})`);
      });
    }

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

async function checkForDuplicate(supabase: any, title: string, personaUuid: string) {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('title', title)
      .eq('persona_id', personaUuid) // Use UUID here
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

// Run the real ingestion test
testRealIngestion();