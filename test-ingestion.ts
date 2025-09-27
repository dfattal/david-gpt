#!/usr/bin/env tsx

// Simple test script for ingestion without commander.js
// Load environment variables first
require('dotenv').config({ path: '.env.local' });

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface ProcessingResult {
  filename: string;
  title: string;
  status: 'ingested' | 'skipped' | 'failed' | 'duplicate' | 'validated';
  reason?: string;
}

async function testIngestion(): Promise<void> {
  try {
    console.log('🚀 Testing persona document ingestion for David...');

    // Import heavy modules only when needed (after dotenv is loaded)
    const { createOptimizedAdminClient } = await import('./src/lib/supabase/server');
    const { DocumentFormatValidator } = await import('./src/lib/validation/document-format-validator');

    const persona = 'david';
    const dryRun = true;

    // Verify formatted directory
    const formattedDir = join(process.cwd(), 'personas', persona, 'formatted');

    try {
      statSync(formattedDir);
    } catch {
      console.error(`❌ Error: Formatted directory not found for persona: ${persona}`);
      console.log(`   Expected path: ${formattedDir}`);
      process.exit(1);
    }

    // Get available documents
    const availableDocuments = getFormattedDocuments(formattedDir);

    if (availableDocuments.length === 0) {
      console.error('❌ Error: No formatted documents found');
      process.exit(1);
    }

    console.log(`📄 Found ${availableDocuments.length} formatted documents:`);
    availableDocuments.slice(0, 5).forEach(doc => console.log(`   - ${doc}`));
    if (availableDocuments.length > 5) {
      console.log(`   ... and ${availableDocuments.length - 5} more`);
    }
    console.log('');

    // Initialize database connection
    const supabase = createOptimizedAdminClient();

    // Process a few documents as test
    const testDocuments = availableDocuments.slice(0, 3);
    const results: ProcessingResult[] = [];

    for (let i = 0; i < testDocuments.length; i++) {
      const filename = testDocuments[i];
      const progress = `[${i + 1}/${testDocuments.length}]`;

      try {
        console.log(`${progress} Testing: ${filename}`);

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

        // Validate document
        const validation = DocumentFormatValidator.validateDocument(content, filename);

        console.log(`   📋 Title: ${frontmatter.title}`);
        console.log(`   📂 Type: ${frontmatter.docType}`);
        console.log(`   ✅ Valid: ${validation.isValid}`);

        // Check for duplicates
        const duplicateCheck = await checkForDuplicate(supabase, frontmatter.title, persona);

        if (duplicateCheck.exists) {
          console.log(`   📋 Duplicate: Already exists in database`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'duplicate',
            reason: 'Already exists'
          });
        } else {
          console.log(`   🆕 New: Would be ingested`);
          results.push({
            filename,
            title: frontmatter.title,
            status: 'ingested',
            reason: dryRun ? 'Dry run - would be processed' : 'Ready for ingestion'
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
    console.log(`📊 INGESTION TEST SUMMARY FOR PERSONA: ${persona.toUpperCase()}`);
    console.log('='.repeat(60));
    console.log(`📄 Total available documents: ${availableDocuments.length}`);
    console.log(`🧪 Documents tested: ${testDocuments.length}`);

    const summary = {
      ingested: results.filter(r => r.status === 'ingested').length,
      duplicates: results.filter(r => r.status === 'duplicate').length,
      failed: results.filter(r => r.status === 'failed').length
    };

    console.log(`🆕 New documents: ${summary.ingested}`);
    console.log(`📋 Duplicates found: ${summary.duplicates}`);
    console.log(`❌ Failed: ${summary.failed}`);

    console.log('');
    console.log('📋 DETAILED RESULTS:');
    results.forEach(result => {
      const statusIcon = {
        'ingested': '🆕',
        'duplicate': '📋',
        'failed': '❌'
      }[result.status];

      console.log(`   ${statusIcon} ${result.filename}`);
      console.log(`      Title: ${result.title}`);
      console.log(`      Status: ${result.status}`);
      if (result.reason) console.log(`      Reason: ${result.reason}`);
      console.log('');
    });

    console.log('✅ Ingestion system test completed successfully!');
    console.log('💡 To run actual ingestion: make ingest-david');

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Helper functions
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

// Run the test
testIngestion();