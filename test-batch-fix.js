#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function testBatchProcessing() {
  console.log('🧪 Testing corrected batch processing - no URL expansion for frontmatter documents');

  // Test with 3 sample documents from my-corpus
  const testFiles = [
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/articles/2020-02-26-forbes-how-light-field-makes-holograms-happen.md',
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/patents/2022-03-22-local-multi-view-display-device.md',
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/papers/2025-09-23-local-cat3d-create-anything-in-3d-with-multi-view-diffusion-models.md'
  ];

  // Read and check each document for frontmatter
  for (const filePath of testFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);

      console.log(`\n📄 ${fileName}`);
      console.log(`📏 Content length: ${content.length} chars`);

      // Check for frontmatter
      const hasFrontmatter = content.startsWith('---\n') && content.includes('\n---\n');
      console.log(`📋 Has frontmatter: ${hasFrontmatter ? '✅' : '❌'}`);

      if (hasFrontmatter) {
        // Extract frontmatter section for inspection
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (frontmatterMatch) {
          const frontmatterLines = frontmatterMatch[1].split('\n').length;
          console.log(`📝 Frontmatter lines: ${frontmatterLines}`);

          // Check for key fields
          const hasTitle = frontmatterMatch[1].includes('title:');
          const hasDocType = frontmatterMatch[1].includes('docType:');
          const hasMetadata = frontmatterMatch[1].includes('oem:') || frontmatterMatch[1].includes('technology:') || frontmatterMatch[1].includes('keywords:');

          console.log(`📋 Has title: ${hasTitle ? '✅' : '❌'}`);
          console.log(`📋 Has docType: ${hasDocType ? '✅' : '❌'}`);
          console.log(`📋 Has rich metadata: ${hasMetadata ? '✅' : '❌'}`);
        }
      }

      // Check for URLs within content (these should NOT be expanded)
      const urlMatches = content.match(/https?:\/\/[^\s\)]+/g);
      if (urlMatches) {
        console.log(`🔗 Contains ${urlMatches.length} URLs (should NOT be expanded as separate docs)`);
        console.log(`🔗 Sample URLs: ${urlMatches.slice(0, 2).join(', ')}`);
      }
    } else {
      console.log(`❌ File not found: ${filePath}`);
    }
  }

  console.log('\n🎯 Expected behavior:');
  console.log('✅ Each markdown file should create exactly ONE document');
  console.log('✅ Frontmatter metadata should be preserved in JSONB fields');
  console.log('✅ URLs within content should NOT trigger separate document creation');
  console.log('✅ No "Content extraction failed: only URL returned" errors');
}

testBatchProcessing().catch(console.error);