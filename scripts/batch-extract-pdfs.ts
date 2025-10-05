/**
 * Batch PDF extraction script
 * Extracts all PDFs from RAW-DOCS folder
 */

import { processPdfDocument } from '../src/lib/rag/extraction/pdfPipeline';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface ExtractionResult {
  file: string;
  success: boolean;
  outputPath?: string;
  stats?: any;
  error?: string;
}

async function batchExtract() {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  const exaApiKey = process.env.EXA_API_KEY;
  if (!exaApiKey) {
    console.warn('⚠️  EXA_API_KEY not found - will skip web metadata fetch');
  }

  const rawDocsDir = path.resolve(process.cwd(), 'personas/david/RAW-DOCS');
  const ragDir = path.resolve(process.cwd(), 'personas/david/RAG');

  console.log(`\n📦 Batch PDF Extraction`);
  console.log(`📂 Input: ${rawDocsDir}`);
  console.log(`📝 Output: ${ragDir}\n`);

  // Get all PDF files
  const files = await fs.readdir(rawDocsDir);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    console.log('No PDF files found');
    return;
  }

  console.log(`Found ${pdfFiles.length} PDF files:\n`);
  pdfFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log('');

  const results: ExtractionResult[] = [];

  // Process each PDF
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const inputPath = path.join(rawDocsDir, file);
    const outputFilename = file.replace('.pdf', '.md');
    const outputPath = path.join(ragDir, outputFilename);

    console.log(`\n[${ i + 1}/${pdfFiles.length}] Processing: ${file}`);
    console.log('─'.repeat(60));

    try {
      // For patents, the pipeline will auto-detect and use HTML extraction
      const result = await processPdfDocument(
        inputPath,
        'david',
        geminiApiKey,
        undefined, // auto-detect (will use HTML for patents)
        exaApiKey
      );

      if (!result.success) {
        throw new Error(result.error || 'Extraction failed');
      }

      // Write output
      if (result.markdown) {
        await fs.writeFile(outputPath, result.markdown);

        results.push({
          file,
          success: true,
          outputPath,
          stats: result.stats,
        });

        console.log(`✅ Success!`);
        console.log(`   Pages: ${result.stats?.totalPages}`);
        console.log(`   Chunks: ${result.stats?.totalChunks}`);
        console.log(`   Retention: ${(result.stats!.retentionRatio * 100).toFixed(1)}%`);
        console.log(`   Output: ${outputFilename}`);
      }
    } catch (error) {
      results.push({
        file,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Add delay between files to avoid rate limits
    if (i < pdfFiles.length - 1) {
      console.log('\n⏳ Waiting 5 seconds before next file...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Extraction Summary\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   - ${r.file} → ${path.basename(r.outputPath!)}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   - ${r.file}: ${r.error}`);
    });
  }

  console.log('');
}

batchExtract().catch(error => {
  console.error('Batch extraction failed:', error);
  process.exit(1);
});
