#!/usr/bin/env tsx

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import * as yaml from 'js-yaml';

interface YamlFrontmatter {
  [key: string]: any;
}

// Fields that should be inline arrays (simple strings)
const INLINE_ARRAY_FIELDS = [
  'keywords',
  'technologies',
  'leiaFeature',
  'productCategory',
  'marketRegion',
  'patentFamily'
];

// Fields that should remain as block arrays (complex objects)
const BLOCK_ARRAY_FIELDS = [
  'authors',
  'inventors',
  'assignees'
];

async function standardizeYamlFile(filePath: string): Promise<void> {
  console.log(`📝 Processing: ${filePath}`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const [, frontmatterStr, markdownContent] = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) || [];

    if (!frontmatterStr) {
      console.log(`   ⚠️  No frontmatter found, skipping`);
      return;
    }

    // Parse YAML frontmatter
    const frontmatter = yaml.load(frontmatterStr) as YamlFrontmatter;

    // Add missing required fields
    if (!frontmatter.persona) {
      frontmatter.persona = "david";
    }

    // Standardize docType naming
    if (frontmatter.docType === "press_article") {
      frontmatter.docType = "press-article";
    }

    // Convert simple arrays to inline format and complex arrays to proper block format
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        if (INLINE_ARRAY_FIELDS.includes(key)) {
          // Keep as inline array (will be serialized correctly by js-yaml)
          frontmatter[key] = value;
        } else if (BLOCK_ARRAY_FIELDS.includes(key)) {
          // Ensure proper structure for complex objects
          frontmatter[key] = value.map(item => {
            if (typeof item === 'string') {
              return { name: item };
            }
            return item;
          });
        }
      }
    }

    // Configure YAML serialization options
    const yamlOptions = {
      flowLevel: -1, // Never use flow style for complex objects
      lineWidth: -1, // No line wrapping
      noArrayIndent: false, // Use proper array indentation
      quotingType: '"' as const,
      forceQuotes: true
    };

    // Custom YAML serialization to handle inline vs block arrays
    let yamlStr = yaml.dump(frontmatter, yamlOptions);

    // Fix inline arrays - convert block format to inline for simple arrays
    INLINE_ARRAY_FIELDS.forEach(field => {
      if (frontmatter[field] && Array.isArray(frontmatter[field])) {
        const blockPattern = new RegExp(`${field}:\\s*\\n(?:\\s+-\\s+"[^"]*"\\s*\\n)+`, 'g');
        yamlStr = yamlStr.replace(blockPattern, () => {
          const arrayStr = JSON.stringify(frontmatter[field]);
          return `${field}: ${arrayStr}\n`;
        });
      }
    });

    // Reconstruct the file
    const newContent = `---\n${yamlStr.trim()}\n---\n${markdownContent}`;

    await writeFile(filePath, newContent, 'utf-8');
    console.log(`   ✅ Standardized YAML format`);

  } catch (error) {
    console.error(`   ❌ Error processing ${filePath}:`, error);
  }
}

async function main() {
  console.log('🚀 Starting YAML format standardization...\n');

  // Find all markdown files in my-corpus
  const patterns = [
    'my-corpus/**/*.md',
    'RAG-RAW-DOCS/**/*.md'
  ];

  const allFiles: string[] = [];
  for (const pattern of patterns) {
    const files = await glob(pattern);
    allFiles.push(...files);
  }

  console.log(`📊 Found ${allFiles.length} markdown files to process\n`);

  // Process each file
  for (const file of allFiles) {
    await standardizeYamlFile(file);
  }

  console.log(`\n✅ YAML standardization complete!`);
  console.log(`📁 Processed ${allFiles.length} files`);
}

if (require.main === module) {
  main().catch(console.error);
}