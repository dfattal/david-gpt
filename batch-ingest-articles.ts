/**
 * Batch Ingest Scraped Articles
 *
 * Reads all markdown files from scraped-articles folder and ingests them
 * using the batch ingestion API endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

interface ArticleMetadata {
  title: string;
  url?: string;
  domain?: string;
  extraction_method?: string;
  scraped_at?: string;
  published_date?: string;
  author?: string;
  word_count?: number;
  image?: string;
  extraction_quality?: string;
  cost_dollars?: number;
}

interface BatchDocument {
  title: string;
  content: string;
  detectedType: string;
  confidence: number;
  metadata: {
    sourceUrl?: string;
    description?: string;
    batch: boolean;
    fileName: string;
    fileSize: number;
    author?: string;
    publishedDate?: string;
    domain?: string;
    extractionMethod?: string;
    wordCount?: number;
  };
}

function parseMarkdownWithFrontmatter(content: string): {
  metadata: ArticleMetadata;
  content: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: { title: 'Unknown Article' },
      content: content
    };
  }

  const [, frontmatter, articleContent] = match;
  const metadata: any = {};

  // Parse YAML-like frontmatter
  frontmatter.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Convert numbers
      if (!isNaN(Number(value)) && value !== '') {
        metadata[key] = Number(value);
      } else {
        metadata[key] = value;
      }
    }
  });

  return {
    metadata: metadata as ArticleMetadata,
    content: articleContent.trim()
  };
}

async function batchIngestArticles(): Promise<void> {
  const articlesDir = '/Users/david.fattal/Documents/GitHub/david-gpt/scraped-articles';

  console.log('📚 Starting batch ingestion of scraped articles...\n');

  try {
    // Read all markdown files
    const files = fs.readdirSync(articlesDir)
      .filter(file => file.endsWith('.md'))
      .sort();

    console.log(`Found ${files.length} markdown files to ingest:`);
    files.forEach(file => console.log(`  - ${file}`));
    console.log('');

    // Process files into batch documents
    const batchDocuments: BatchDocument[] = [];

    for (const fileName of files) {
      const filePath = path.join(articlesDir, fileName);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const fileStats = fs.statSync(filePath);

      const { metadata, content } = parseMarkdownWithFrontmatter(fileContent);

      console.log(`📄 Processing: ${fileName}`);
      console.log(`   Title: ${metadata.title}`);
      console.log(`   Author: ${metadata.author || 'Unknown'}`);
      console.log(`   Domain: ${metadata.domain || 'Unknown'}`);
      console.log(`   Word Count: ${metadata.word_count || 'Unknown'}`);
      console.log(`   Content Length: ${content.length} characters`);

      const batchDoc: BatchDocument = {
        title: metadata.title || fileName.replace('.md', ''),
        content: content,
        detectedType: 'press-article', // Press article type
        confidence: 0.95, // High confidence for pre-processed articles
        metadata: {
          sourceUrl: metadata.url,
          description: `Press article from ${metadata.domain || 'unknown source'}`,
          batch: true,
          fileName: fileName,
          fileSize: fileStats.size,
          author: metadata.author,
          publishedDate: metadata.published_date,
          domain: metadata.domain,
          extractionMethod: metadata.extraction_method,
          wordCount: metadata.word_count
        }
      };

      batchDocuments.push(batchDoc);
      console.log('   ✅ Processed\n');
    }

    // Prepare batch request
    const batchRequest = {
      documents: batchDocuments,
      batchDescription: `Press articles about Leia Inc. and 3D display technology (${batchDocuments.length} articles)`
    };

    console.log(`🚀 Sending batch ingestion request for ${batchDocuments.length} documents...\n`);

    // Get server URL and service role key
    const serverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?
      'http://localhost:3000' : 'http://localhost:3000'; // Adjust if different
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
    }

    // Make API request with timeout and logging
    console.log('🔗 Making API request to:', `${serverUrl}/api/documents/batch-ingest`);
    console.log('📦 Request payload size:', JSON.stringify(batchRequest).length, 'bytes');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    const response = await fetch(`${serverUrl}/api/documents/batch-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify(batchRequest),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log('✅ Batch ingestion initiated successfully!');
    console.log(`📊 Results:`);
    console.log(`   Batch ID: ${result.batchId}`);
    console.log(`   Batch Job ID: ${result.batchJobId}`);
    console.log(`   Total Documents: ${result.totalDocuments}`);
    console.log(`   Message: ${result.message}`);

    console.log('\n🔄 The documents are now being processed in the background.');
    console.log('💡 You can monitor progress in the admin interface or check the processing_jobs table.');
    console.log('\n🎯 Once processing is complete, you can run the performance tests:');
    console.log('   npm run test:comprehensive');

  } catch (error) {
    console.error('❌ Batch ingestion failed:', error);

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Make sure the development server is running:');
      console.log('   npm run dev');
    }

    process.exit(1);
  }
}

// Run the batch ingestion
if (require.main === module) {
  batchIngestArticles().catch(console.error);
}

export { batchIngestArticles };