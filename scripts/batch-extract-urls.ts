/**
 * Batch URL extraction from markdown list files
 * Supports patents, ArXiv papers, and other URL formats
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { analyzeUrl, normalizeIdentifier } from '../src/lib/rag/extraction/urlRouter';
import { extractPatentWithGemini } from '../src/lib/rag/extraction/patentGeminiExtractor';
import { formatPatentMarkdown } from '../src/lib/rag/extraction/patentGeminiFormatter';
import { extractArxivFromHtml } from '../src/lib/rag/extraction/arxivHtmlExtractor';
import { formatArxivAsMarkdown } from '../src/lib/rag/extraction/arxivMarkdownFormatter';

dotenv.config({ path: '.env.local' });

interface ProcessingResult {
  url: string;
  success: boolean;
  filename?: string;
  error?: string;
}

/**
 * Parse URLs from markdown file
 * Supports formats: "- arxiv:2405.10314", "- US10838134B2", "- https://..."
 */
async function parseUrlsFromMarkdown(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const urls: string[] = [];

  // Match list items with various URL formats
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, headers, and non-list items
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith('-')) {
      continue;
    }

    // Extract URL/identifier after the list marker
    const match = trimmed.match(/^-\s+(.+)$/);
    if (match) {
      urls.push(match[1].trim());
    }
  }

  return urls;
}

/**
 * Process a single URL
 */
async function processUrl(
  url: string,
  personaSlug: string,
  geminiApiKey: string,
  outputDir: string
): Promise<ProcessingResult> {
  try {
    console.log(`\n▶ Processing: ${url}`);

    // Analyze URL
    const analysis = analyzeUrl(url);
    console.log(`  Type: ${analysis.type}`);
    console.log(`  ID: ${analysis.identifier || 'N/A'}`);

    let markdown: string;
    let filename: string;

    if (analysis.type === 'patent') {
      if (!analysis.identifier) {
        throw new Error('Could not extract patent number');
      }

      // Extract patent
      const patentData = await extractPatentWithGemini(analysis.identifier, geminiApiKey);

      // Format as markdown
      markdown = await formatPatentMarkdown(patentData, personaSlug, geminiApiKey);

      filename = `${analysis.identifier.toLowerCase()}.md`;

      console.log(`  ✅ Extracted patent`);
      console.log(`     Claims: ${patentData.claims.length}`);

    } else if (analysis.type === 'arxiv') {
      if (!analysis.identifier) {
        throw new Error('Could not extract ArXiv ID');
      }

      // Extract ArXiv paper
      const paperData = await extractArxivFromHtml(analysis.identifier, geminiApiKey);

      // Format as markdown
      const formatted = formatArxivAsMarkdown(paperData);
      markdown = formatted.markdown;

      filename = `${analysis.identifier.replace(/\./g, '-')}.md`;

      console.log(`  ✅ Extracted paper`);
      console.log(`     Authors: ${formatted.stats.authors}`);
      console.log(`     Sections: ${formatted.stats.sections}`);

    } else {
      throw new Error(`Unsupported document type: ${analysis.type}`);
    }

    // Save markdown
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, markdown);

    console.log(`  💾 Saved: ${filename}`);
    console.log(`     Size: ${markdown.length.toLocaleString()} chars`);

    return { url, success: true, filename };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Error: ${errorMsg}`);
    return { url, success: false, error: errorMsg };
  }
}

/**
 * Main batch processing function
 */
async function batchExtract() {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  // Get input file from command line or use default
  const inputFile = process.argv[2] || 'paper-list.md';
  const personaSlug = process.argv[3] || 'david';

  const inputPath = path.resolve(process.cwd(), inputFile);
  const outputDir = path.resolve(process.cwd(), `personas/${personaSlug}/RAG`);

  console.log(`\n📦 Batch URL Extraction`);
  console.log(`📄 Input: ${inputPath}`);
  console.log(`📂 Output: ${outputDir}`);
  console.log(`👤 Persona: ${personaSlug}\n`);

  // Parse URLs from markdown file
  const urls = await parseUrlsFromMarkdown(inputPath);
  console.log(`📋 Found ${urls.length} URLs to process\n`);

  if (urls.length === 0) {
    console.log('⚠️  No URLs found in input file');
    process.exit(0);
  }

  // Process each URL
  const results: ProcessingResult[] = [];
  for (const url of urls) {
    const result = await processUrl(url, personaSlug, geminiApiKey, outputDir);
    results.push(result);

    // Add delay between requests to avoid rate limiting
    if (url !== urls[urls.length - 1]) {
      console.log('  ⏳ Waiting 2s before next request...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log(`\n\n📊 Processing Summary`);
  console.log(`─────────────────────────────────────`);
  console.log(`Total URLs: ${urls.length}`);
  console.log(`✅ Successful: ${results.filter(r => r.success).length}`);
  console.log(`❌ Failed: ${results.filter(r => !r.success).length}`);

  if (results.some(r => !r.success)) {
    console.log(`\n❌ Failed URLs:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.url}: ${r.error}`);
    });
  }

  console.log(`\n✨ Batch processing complete!\n`);
}

batchExtract();
