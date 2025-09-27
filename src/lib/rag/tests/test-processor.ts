#!/usr/bin/env tsx

import { DocumentProcessor } from '@/lib/rag/document-processor.service';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

// Test script to check what documents would be processed
async function testProcessor() {
  const manifestPath = '/Users/david.fattal/Documents/GitHub/david-gpt/rag-processing-manifest-comprehensive.json';

  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest file not found: ${manifestPath}`);
    return;
  }

  console.log('🔍 Analyzing processing manifest...\n');

  try {
    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    console.log(`📊 Total documents in manifest: ${manifest.documents_to_process.length}`);
    console.log(`📋 Document types breakdown:`);

    const typeCount: Record<string, number> = {};
    const urlCount = { web: 0, local: 0, pdf: 0 };

    for (const doc of manifest.documents_to_process) {
      typeCount[doc.document_type] = (typeCount[doc.document_type] || 0) + 1;

      if (doc.source_uri.startsWith('http')) {
        if (doc.source_uri.toLowerCase().includes('.pdf')) {
          urlCount.pdf++;
        } else {
          urlCount.web++;
        }
      } else {
        urlCount.local++;
      }
    }

    Object.entries(typeCount).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count} documents`);
    });

    console.log(`\n🌐 Source breakdown:`);
    console.log(`  - Web URLs: ${urlCount.web}`);
    console.log(`  - PDF URLs: ${urlCount.pdf}`);
    console.log(`  - Local files: ${urlCount.local}`);

    console.log(`\n📁 Current corpus status:`);
    // Check how many files already exist in my-corpus
    const corpusPath = '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus';

    let totalExisting = 0;
    const subdirs = ['articles', 'papers', 'patents', 'notes', 'blog'];

    for (const subdir of subdirs) {
      const { readdir } = await import('fs/promises');
      try {
        const files = await readdir(`${corpusPath}/${subdir}`);
        const mdFiles = files.filter(f => f.endsWith('.md')).length;
        console.log(`  - ${subdir}: ${mdFiles} files`);
        totalExisting += mdFiles;
      } catch {
        console.log(`  - ${subdir}: 0 files (directory not found)`);
      }
    }

    console.log(`  📝 Total existing: ${totalExisting} documents`);
    console.log(`  🆕 Potential new: ${manifest.documents_to_process.length - totalExisting} documents`);

    console.log(`\n⏭️  Sample documents that would be processed:`);
    manifest.documents_to_process.slice(0, 5).forEach((doc: any, index: number) => {
      const source = doc.source_uri.startsWith('http')
        ? new URL(doc.source_uri).hostname
        : 'local file';
      console.log(`  ${index + 1}. [${doc.document_type}] ${source}`);
      console.log(`     ${doc.source_uri.substring(0, 80)}...`);
    });

  } catch (error) {
    console.error(`❌ Error analyzing manifest: ${error}`);
  }
}

testProcessor().catch(console.error);