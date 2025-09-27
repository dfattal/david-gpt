#!/usr/bin/env tsx

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Load environment variables
require('dotenv').config({ path: '/Users/david.fattal/Documents/GitHub/david-gpt/.env.local' });

interface DocumentEntry {
  file_path: string;
  docType: string;
  persona: string;
  extraction_tool: string;
  extraction_strategy: string;
  estimated_length: string;
  expected_quality: string;
  batch_group: number;
}

interface ProcessingResult {
  success: boolean;
  documentPath?: string;
  error?: string;
  extractionMethod?: string;
  wordCount?: number;
}

interface ProcessingStats {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  startTime: Date;
  errors: Array<{ document: string; error: string }>;
}

class DocumentProcessor {
  private stats: ProcessingStats;
  private corpusPath = '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus';

  constructor() {
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      startTime: new Date(),
      errors: []
    };
  }

  private async callExaApi(url: string): Promise<string> {
    const EXA_API_KEY = process.env.EXA_API_KEY;
    if (!EXA_API_KEY) {
      throw new Error('EXA_API_KEY not found in environment variables');
    }

    console.log(`🔍 Calling EXA API for: ${url}`);

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY
      },
      body: JSON.stringify({
        query: url,
        type: 'neural',
        useAutoprompt: false,
        numResults: 1,
        contents: {
          text: {
            maxCharacters: 50000,
            includeHtmlTags: false
          }
        },
        includeUrlsInSearch: [url]
      })
    });

    if (!response.ok) {
      throw new Error(`EXA API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      throw new Error('EXA API returned no results');
    }

    const content = data.results[0].text;
    if (!content) {
      throw new Error('EXA API returned no content');
    }

    console.log(`✅ EXA API success: ${content.length} characters extracted`);
    return content;
  }

  private async callGeminiCli(input: string, isFilePath: boolean = false): Promise<string> {
    console.log(`🤖 Calling Gemini CLI for ${isFilePath ? 'file' : 'content'} processing`);

    const prompt = isFilePath
      ? `Extract and format the complete content from this file following the INGESTION-FORMAT.md specification. Include full text, proper YAML frontmatter, and structured markdown.`
      : `Convert this content to properly formatted markdown following the INGESTION-FORMAT.md specification. Extract complete content, create appropriate YAML frontmatter based on content analysis, and format as structured markdown.`;

    try {
      let command: string;
      if (isFilePath) {
        // For file processing
        command = `gemini -y "${prompt}" -f "${input}"`;
      } else {
        // For content processing - write to temp file first to avoid command line length limits
        const tempFile = `/tmp/gemini-input-${Date.now()}.txt`;
        await writeFile(tempFile, input, 'utf-8');
        command = `gemini -y "${prompt}" -f "${tempFile}"`;
      }

      const result = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        timeout: 300000 // 5 minute timeout
      });

      console.log(`✅ Gemini CLI success: ${result.length} characters generated`);
      return result.trim();
    } catch (error: any) {
      console.error(`❌ Gemini CLI error:`, error.message);
      throw new Error(`Gemini CLI processing failed: ${error.message}`);
    }
  }

  private getOutputPath(document: DocumentEntry): string {
    const docType = document.docType;
    let subfolder: string;
    let filename: string;

    // Determine subfolder based on document type
    switch (docType) {
      case 'press-article':
      case 'press_article':
        subfolder = 'articles';
        break;
      case 'paper':
        subfolder = 'papers';
        break;
      case 'patent':
        subfolder = 'patents';
        break;
      case 'note':
        subfolder = 'notes';
        break;
      case 'url':
        subfolder = 'urls';
        break;
      case 'book':
        subfolder = 'books';
        break;
      default:
        subfolder = 'other';
    }

    // Generate filename from file path
    const baseName = basename(document.file_path, '.pdf').replace(/[^a-z0-9-]/gi, '-');
    filename = `${new Date().toISOString().split('T')[0]}-${baseName}.md`;

    return join(this.corpusPath, subfolder, filename);
  }

  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  }

  private async processDocument(document: DocumentEntry): Promise<ProcessingResult> {
    try {
      console.log(`\n[${this.stats.processed + 1}/${this.stats.total}] Processing: ${document.file_path}`);
      console.log(`🔧 Tool: ${document.extraction_tool}, Strategy: ${document.extraction_strategy}`);

      let content: string;

      // Step 1: Extract content based on extraction tool
      if (document.extraction_tool === 'exa_mcp') {
        // Use EXA API for URLs (this manifest appears to be all local files)
        throw new Error(`EXA extraction not supported for local files: ${document.file_path}`);
      } else if (document.extraction_tool === 'gemini_direct') {
        // Use Gemini CLI directly for local files
        if (!existsSync(document.file_path)) {
          throw new Error(`File not found: ${document.file_path}`);
        }
        content = await this.callGeminiCli(document.file_path, true);
      } else {
        throw new Error(`Unknown extraction tool: ${document.extraction_tool}`);
      }

      // Step 2: Format with Gemini CLI if content was extracted via EXA
      let formattedContent: string;
      if (document.extraction_tool === 'exa_mcp') {
        // Need to format EXA content with Gemini
        formattedContent = await this.callGeminiCli(content, false);
      } else {
        // Gemini CLI already formatted the content
        formattedContent = content;
      }

      // Step 3: Determine output path and ensure directory exists
      const outputPath = this.getOutputPath(document);
      await this.ensureDirectoryExists(outputPath);

      // Step 4: Save formatted content
      await writeFile(outputPath, formattedContent, 'utf-8');

      const wordCount = formattedContent.split(/\s+/).length;
      console.log(`✅ Success: ${outputPath} (${wordCount} words)`);

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      return {
        success: true,
        documentPath: outputPath,
        extractionMethod: document.extraction_tool,
        wordCount
      };

    } catch (error: any) {
      console.error(`❌ Error processing ${document.file_path}:`, error.message);
      this.stats.errors.push({
        document: document.file_path,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  private async processManifest(manifestPath: string): Promise<void> {
    console.log('🚀 Starting document processing from manifest...\n');

    // Load manifest
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const documents: DocumentEntry[] = JSON.parse(manifestContent);

    this.stats.total = documents.length;
    console.log(`📊 Found ${this.stats.total} documents to process\n`);

    // Process documents in batches of 3
    const batchSize = 3;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (documents ${i + 1}-${Math.min(i + batchSize, documents.length)})\n`);

      for (const document of batch) {
        const result = await this.processDocument(document);

        if (result.success) {
          this.stats.processed++;
        } else {
          this.stats.failed++;
        }
      }
    }
  }

  private printFinalReport(): void {
    const duration = Math.round((Date.now() - this.stats.startTime.getTime()) / 1000 / 60);
    const successRate = Math.round((this.stats.processed / this.stats.total) * 100);

    console.log('\n==================================================');
    console.log('📊 PROCESSING COMPLETE');
    console.log('==================================================');
    console.log(`⏱️  Duration: ${duration} minutes`);
    console.log(`📁 Total documents: ${this.stats.total}`);
    console.log(`✅ Successfully processed: ${this.stats.processed}`);
    console.log(`⏭️  Skipped (existing): ${this.stats.skipped}`);
    console.log(`❌ Failed: ${this.stats.failed}`);
    console.log(`\n🎯 Success rate: ${successRate}%`);

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.document}: ${error.error}`);
      });
    }

    console.log('\n🎉 Processing pipeline completed successfully!');
  }

  async run(manifestPath: string): Promise<void> {
    try {
      await this.processManifest(manifestPath);
      this.printFinalReport();
    } catch (error: any) {
      console.error('\n💥 Critical error occurred during processing:');
      console.error(error.message);
      console.error('\nStack trace:', error.stack);
      process.exit(1);
    }
  }
}

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error('Usage: npx tsx process-manifest.ts <manifest-path>');
    process.exit(1);
  }

  if (!existsSync(manifestPath)) {
    console.error(`Manifest file not found: ${manifestPath}`);
    process.exit(1);
  }

  const processor = new DocumentProcessor();
  await processor.run(manifestPath);
}

if (require.main === module) {
  main().catch(console.error);
}