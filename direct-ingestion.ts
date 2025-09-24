#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { unifiedIngestionService, type SingleIngestionRequest } from './src/lib/rag/ingestion-service';
import { createOptimizedAdminClient } from './src/lib/supabase/server';
import type { DocumentType } from './src/lib/rag/types';

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function ingestMarkdownFiles() {
  console.log('🚀 Starting direct markdown ingestion...');

  const corpusPath = './my-corpus';
  const supabase = createOptimizedAdminClient();
  const user = { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', email: 'dfattal@gmail.com' };

  // Get all markdown files recursively
  function getMarkdownFiles(dir: string): string[] {
    const files: string[] = [];
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...getMarkdownFiles(fullPath));
      } else if (item.endsWith('.md')) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          if (content.startsWith('---\n')) {
            files.push(fullPath);
          }
        } catch (error) {
          console.warn(`⚠️  Could not read ${fullPath}: ${error}`);
        }
      }
    }
    return files;
  }

  const markdownFiles = getMarkdownFiles(corpusPath);
  console.log(`📄 Found ${markdownFiles.length} markdown files with frontmatter`);

  let successCount = 0;
  let failureCount = 0;

  for (const filePath of markdownFiles) {
    try {
      console.log(`\n📝 Processing: ${filePath}`);

      const content = readFileSync(filePath, 'utf8');

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.log(`❌ No valid frontmatter found in ${filePath}`);
        failureCount++;
        continue;
      }

      const yaml = require('js-yaml');
      const frontmatter = yaml.load(frontmatterMatch[1]);

      if (!frontmatter.title || !frontmatter.docType) {
        console.log(`❌ Missing title or docType in ${filePath}`);
        failureCount++;
        continue;
      }

      const ingestionRequest: SingleIngestionRequest = {
        type: 'single',
        title: frontmatter.title,
        content: content,
        docType: frontmatter.docType as DocumentType,
        metadata: {
          sourceType: 'direct-markdown-ingestion',
          fileName: filePath.split('/').pop(),
          ...frontmatter
        },
        userId: user.id
      };

      console.log(`   📋 Title: ${frontmatter.title}`);
      console.log(`   📂 Type: ${frontmatter.docType}`);

      const result = await unifiedIngestionService.ingestDocuments(
        ingestionRequest,
        { supabase, user }
      );

      if (result.success) {
        console.log(`   ✅ Success: ${result.documentId}`);
        successCount++;
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
        failureCount++;
      }

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`   💥 Error: ${error instanceof Error ? error.message : error}`);
      failureCount++;
    }
  }

  console.log(`\n📊 Ingestion complete:`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`📄 Total: ${successCount + failureCount}`);

  process.exit(0);
}

ingestMarkdownFiles().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});