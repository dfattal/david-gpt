#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testIngestion() {
  console.log('🧪 Testing corrected frontmatter ingestion logic...');

  // Get a few sample files from my-corpus
  const testFiles = [
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/articles/2020-02-28-forbes-leia-the-display-of-the-future.md',
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/patents/2022-03-22-local-multi-view-display-device.md',
    '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/papers/2025-09-23-local-cat3d-create-anything-in-3d-with-multi-view-diffusion-models.md'
  ];

  const form = new FormData();

  // Add description
  form.append('batchDescription', 'Testing corrected frontmatter processing - small batch');
  form.append('skipInvalidFiles', 'false');
  form.append('strictValidation', 'false');

  // Add files
  let fileIndex = 0;
  for (const filePath of testFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      const relativePath = `my-corpus/${path.relative('/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus', filePath)}`;

      // Create a mock File object with webkitRelativePath
      form.append(`file_${fileIndex}`, content, {
        filename: fileName,
        contentType: 'text/markdown',
        knownLength: content.length
      });

      console.log(`📄 Adding: ${relativePath} (${content.length} bytes)`);
      fileIndex++;
    } else {
      console.warn(`⚠️  File not found: ${filePath}`);
    }
  }

  try {
    console.log('🚀 Sending test batch to folder-ingest API...');

    const response = await fetch('http://localhost:3000/api/documents/folder-ingest', {
      method: 'POST',
      body: form,
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Ingestion initiated successfully!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));

      if (result.batchId) {
        console.log(`🎯 Batch ID: ${result.batchId}`);
        console.log(`📝 Total documents: ${result.totalDocuments}`);

        // Wait a moment and check processing status
        console.log('⏳ Waiting 10 seconds for processing...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('🔍 Check the admin interface for results!');
      }
    } else {
      console.error('❌ Ingestion failed:', result);
    }

  } catch (error) {
    console.error('💥 Error during ingestion test:', error);
  }
}

// Run the test
testIngestion().catch(console.error);