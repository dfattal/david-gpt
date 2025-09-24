#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ingestMarkdownFiles() {
  console.log('🚀 Starting markdown file ingestion...');

  // Get all markdown files from my-corpus that were created recently
  const corpusPath = '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus';
  const allFiles = [];

  // Recursively find all .md files
  function findMarkdownFiles(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        findMarkdownFiles(fullPath);
      } else if (item.endsWith('.md')) {
        // Check if file has frontmatter to determine if it should be ingested
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.startsWith('---\n')) {
            allFiles.push(fullPath);
          }
        } catch (error) {
          console.warn(`⚠️  Could not read ${fullPath}: ${error.message}`);
        }
      }
    }
  }

  findMarkdownFiles(corpusPath);
  console.log(`📄 Found ${allFiles.length} markdown files with frontmatter`);

  if (allFiles.length === 0) {
    console.log('❌ No markdown files with frontmatter found');
    return;
  }

  // Ingest each file
  let successCount = 0;
  let failureCount = 0;

  for (const filePath of allFiles) {
    try {
      console.log(`\n📝 Processing: ${path.basename(filePath)}`);

      const content = fs.readFileSync(filePath, 'utf8');

      // Check if it has frontmatter
      if (!content.startsWith('---\n')) {
        console.log(`⚠️  Skipping ${path.basename(filePath)} - no frontmatter`);
        continue;
      }

      // Create temporary file for curl
      const tempFile = `/tmp/markdown_${Date.now()}.json`;
      const payload = {
        content: content,
        fileName: path.basename(filePath),
        validateOnly: false,
        strictValidation: false
      };
      fs.writeFileSync(tempFile, JSON.stringify(payload));

      try {
        const curlCmd = `curl -s -X POST http://localhost:3000/api/documents/markdown-ingest \\
          -H "Content-Type: application/json" \\
          -H "Authorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}" \\
          --data @${tempFile}`;

        const response = execSync(curlCmd, { encoding: 'utf8' });
        const result = JSON.parse(response);

        if (result.documentId) {
          console.log(`✅ Success: ${result.documentId}`);
          successCount++;
        } else {
          console.log(`❌ Failed: ${result.error || 'Unknown error'}`);
          if (result.validation) {
            console.log(`   Validation errors: ${result.validation.errors?.length || 0}`);
          }
          failureCount++;
        }
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Rate limiting - simple delay
      execSync('sleep 1');

    } catch (error) {
      console.log(`💥 Error processing ${path.basename(filePath)}: ${error.message}`);
      failureCount++;
    }
  }

  console.log(`\n📊 Ingestion complete:`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`📄 Total: ${successCount + failureCount}`);
}

// Check if running as script
if (require.main === module) {
  // Load environment variables
  require('dotenv').config({ path: '/Users/david.fattal/Documents/GitHub/david-gpt/.env.local' });

  ingestMarkdownFiles();
}