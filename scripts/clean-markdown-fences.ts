#!/usr/bin/env tsx

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

// Clean up markdown files that have ```markdown code fences at the beginning
async function cleanMarkdownFiles() {
  const corpusPath = '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus';
  const subdirs = ['articles', 'papers', 'patents', 'notes', 'blog'];

  let filesProcessed = 0;
  let filesCleaned = 0;

  for (const subdir of subdirs) {
    const dirPath = join(corpusPath, subdir);

    try {
      const files = await readdir(dirPath);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = join(dirPath, file);

          try {
            const content = await readFile(filePath, 'utf-8');
            filesProcessed++;

            // Check if file starts with ```markdown
            if (content.startsWith('```markdown')) {
              console.log(`🔧 Cleaning: ${subdir}/${file}`);

              // Remove ```markdown at the beginning and ``` at the end
              const cleanedContent = content
                .replace(/^```markdown\s*/i, '')
                .replace(/^```\s*/m, '')
                .replace(/\s*```\s*$/m, '')
                .trim();

              await writeFile(filePath, cleanedContent, 'utf-8');
              filesCleaned++;
              console.log(`✅ Cleaned: ${subdir}/${file}`);
            }
          } catch (error) {
            console.error(`❌ Error processing ${filePath}: ${error}`);
          }
        }
      }
    } catch (error) {
      console.log(`⚠️  Directory ${dirPath} not accessible: ${error}`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Files cleaned: ${filesCleaned}`);
  console.log(`Files without issues: ${filesProcessed - filesCleaned}`);
}

cleanMarkdownFiles().catch(console.error);