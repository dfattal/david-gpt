#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const crypto = require('crypto');

// Configuration
const PERSONA_DIR = process.argv[2] || '/Users/david.fattal/Documents/GitHub/david-gpt/personas/david';
const REVIEW_MODE = process.argv.includes('--review');
const RAW_DOCS_DIR = path.join(PERSONA_DIR, 'RAG-RAW-DOCS');
const MANIFEST_DIR = path.join(PERSONA_DIR, 'manifests');
const OUTPUT_FILE = path.join(MANIFEST_DIR, 'manifest.yaml');
const CONTRACT_FILE = path.join(PERSONA_DIR, 'contract.yaml');

// Global state for contract-based detection
let CONTRACT = null;
let DOC_TYPE_PATTERNS = null;

// Processor detection patterns
const PROCESSOR_PATTERNS = {
  'pdf': /\.pdf$/i,
  'html': /\.html?$/i,
  'exa': /^https?:\/\//i,
  'passthrough': /\.md$/i
};

function loadContract() {
  if (CONTRACT) return CONTRACT;

  if (!fs.existsSync(CONTRACT_FILE)) {
    console.warn(`⚠️ Contract not found: ${CONTRACT_FILE}`);
    console.warn('   Using fallback patterns. Run: node bin/generate-contract.js ${PERSONA_DIR}');
    return null;
  }

  try {
    CONTRACT = yaml.parse(fs.readFileSync(CONTRACT_FILE, 'utf8'));
    console.log(`✅ Loaded contract: ${Object.keys(CONTRACT.doc_types).length} doc types, ${CONTRACT.kg.entity_kinds.length} entities`);
    return CONTRACT;
  } catch (err) {
    console.warn(`⚠️ Failed to load contract: ${err.message}`);
    return null;
  }
}

function buildDocTypePatternsFromContract(contract) {
  if (!contract) return getFallbackPatterns();

  const patterns = {};

  // Build patterns from contract doc_types and vocab_hints
  Object.keys(contract.doc_types).forEach(docType => {
    patterns[docType] = [];

    // Add directory-based patterns
    if (docType === 'patents') {
      patterns[docType].push(/^us\d+/i, /^wo\d+/i, /^ep\d+/i, /patent/i, /\/patents\//i);
    } else if (docType === 'papers') {
      patterns[docType].push(/\.pdf$/i, /arxiv/i, /doi:/i, /research/i, /journal/i, /\/papers\//i);
    } else if (docType === 'press-articles') {
      patterns[docType].push(/article/i, /news/i, /press/i, /blog/i, /\.html$/i, /announcement/i, /review/i);
    } else if (docType === 'notes') {
      patterns[docType].push(/notes?/i, /md$/i, /\.txt$/i, /\/notes\//i);
    } else if (docType === 'books') {
      patterns[docType].push(/book/i, /\.epub$/i, /\/books\//i);
    } else if (docType === 'urls') {
      patterns[docType].push(/^https?:\/\//i);
    }

    // Add patterns from vocab hints
    if (contract.vocab_hints) {
      // Add OEM-specific patterns for press articles
      if (docType === 'press-articles' && contract.vocab_hints.oems) {
        contract.vocab_hints.oems.forEach(oem => {
          patterns[docType].push(new RegExp(oem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        });
      }

      // Add technology patterns for papers
      if (docType === 'papers' && contract.vocab_hints.technologies) {
        contract.vocab_hints.technologies.forEach(tech => {
          patterns[docType].push(new RegExp(tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        });
      }
    }
  });

  return patterns;
}

function getFallbackPatterns() {
  return {
    'patents': [
      /^us\d+/i, /^wo\d+/i, /^ep\d+/i, /patent/i, /google\.com\/patents/i,
      /uspto/i, /epo\.org/i, /\/patents\//i
    ],
    'papers': [
      /\.pdf$/i, /arxiv/i, /doi:/i, /research/i, /journal/i, /paper/i, /proceedings/i
    ],
    'press-articles': [
      /article/i, /news/i, /press/i, /blog/i, /\.html$/i, /verge/i, /wired/i,
      /forbes/i, /techcrunch/i, /digitaltrends/i, /announcement/i, /review/i
    ],
    'notes': [/notes?/i, /md$/i, /\.txt$/i]
  };
}

function detectDocType(filePath, content = '') {
  // Load contract and build patterns if not already done
  if (!DOC_TYPE_PATTERNS) {
    const contract = loadContract();
    DOC_TYPE_PATTERNS = buildDocTypePatternsFromContract(contract);
  }

  const fileName = path.basename(filePath).toLowerCase();
  const dirName = path.dirname(filePath).toLowerCase();
  const fullPath = filePath.toLowerCase();

  // Check patterns in order (more specific first)
  const orderedTypes = ['patents', 'papers', 'press-articles', 'books', 'urls', 'notes'];

  for (const docType of orderedTypes) {
    const patterns = DOC_TYPE_PATTERNS[docType];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (pattern.test(fileName) || pattern.test(dirName) || pattern.test(fullPath) || pattern.test(content)) {
        return docType;
      }
    }
  }

  return 'notes'; // default fallback
}

function detectProcessor(filePath) {
  for (const [processor, pattern] of Object.entries(PROCESSOR_PATTERNS)) {
    if (pattern.test(filePath)) {
      return processor;
    }
  }
  return 'auto';
}

function generateId(filePath) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  const baseName = path.basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 20);

  return `${baseName}-${hash.substring(0, 8)}`;
}

function scanDirectory(dir, baseDir = dir) {
  const items = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return items;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      items.push(...scanDirectory(filePath, baseDir));
    } else if (stat.isFile() && !file.startsWith('.')) {
      const relativePath = path.relative(baseDir, filePath);

      // Skip certain file types and URL list files
      if (file.match(/\.(log|tmp|cache)$/i) ||
          file.match(/^(article-list|url-list|paper-list)\.md$/i)) {
        continue;
      }

      let content = '';
      try {
        // Read first 1000 chars for type detection
        if (file.match(/\.(md|txt|html)$/i)) {
          content = fs.readFileSync(filePath, 'utf8').substring(0, 1000);
        }
      } catch (err) {
        console.warn(`Could not read ${filePath}: ${err.message}`);
      }

      const docType = detectDocType(relativePath, content);
      const processor = detectProcessor(relativePath);
      const id = generateId(relativePath);

      items.push({
        id,
        source: {
          kind: 'file',
          path: `RAG-RAW-DOCS/${relativePath}`
        },
        proposed_doctype: docType,
        processor: processor === 'auto' ? undefined : processor,
        metadata_hints: extractMetadataHints(content, relativePath),
        output: {
          path: `formatted/${id}.md`
        },
        status: 'draft',
        retries: 0
      });
    }
  }

  return items;
}

function extractMetadataHints(content, filePath) {
  const hints = {};

  // Get patterns from contract if available
  const contract = loadContract();

  if (contract && contract.vocab_hints) {
    // Use contract-defined vocab hints for pattern matching
    const vocabCategories = ['technologies', 'oems', 'products', 'concepts'];

    vocabCategories.forEach(category => {
      if (contract.vocab_hints[category] && contract.vocab_hints[category].length > 0) {
        const found = new Set();

        contract.vocab_hints[category].forEach(term => {
          // Create case-insensitive regex, escaping special characters
          const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => found.add(match.toLowerCase()));
          }
        });

        if (found.size > 0) {
          hints[category] = Array.from(found);
        }
      }
    });
  } else {
    // Fallback to hardcoded patterns if no contract
    const techPatterns = [
      /lightfield/gi, /lenticular/gi, /eye.?tracking/gi, /holographic/gi,
      /3d.?display/gi, /switchable.?lens/gi
    ];

    const technologies = new Set();
    techPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => technologies.add(match.toLowerCase()));
      }
    });

    if (technologies.size > 0) {
      hints.technologies = Array.from(technologies);
    }

    // Extract OEMs
    const oemPatterns = [
      /samsung/gi, /apple/gi, /google/gi, /microsoft/gi, /meta/gi,
      /leia.?inc/gi, /sony/gi, /lg/gi
    ];

    const oems = new Set();
    oemPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => oems.add(match.toLowerCase()));
      }
    });

    if (oems.size > 0) {
      hints.oems = Array.from(oems);
    }
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}

function parseURLList(filePath) {
  const items = [];

  if (!fs.existsSync(filePath)) {
    return items;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(line => line.trim());

  for (const line of lines) {
    // Skip empty lines and headers
    if (!line || line.startsWith('#') || line.startsWith('==')) {
      continue;
    }

    // Parse markdown links: - Title: https://example.com
    const markdownMatch = line.match(/^-\s*(.+?):\s*(https?:\/\/.+)$/);
    if (markdownMatch) {
      const [, title, url] = markdownMatch;
      const id = generateId(`${title}-${url}`);
      const docType = detectDocType(url, title);

      items.push({
        id,
        source: {
          kind: 'url',
          path: url
        },
        proposed_doctype: docType,
        processor: 'exa',
        metadata_hints: {
          title: title.trim(),
          ...extractMetadataHints(title + ' ' + url, url)
        },
        output: {
          path: `formatted/${id}.md`
        },
        status: 'draft',
        retries: 0
      });
      continue;
    }

    // Parse plain URLs
    const urlMatch = line.match(/https?:\/\/.+/);
    if (urlMatch) {
      const url = urlMatch[0];
      const id = generateId(url);
      const docType = detectDocType(url);

      items.push({
        id,
        source: {
          kind: 'url',
          path: url
        },
        proposed_doctype: docType,
        processor: 'exa',
        metadata_hints: extractMetadataHints('', url),
        output: {
          path: `formatted/${id}.md`
        },
        status: 'draft',
        retries: 0
      });
    }
  }

  return items;
}

async function reviewManifestWithGemini(items, contract, folderStructure) {
  console.log('🤖 Reviewing manifest with Gemini CLI...');

  const { spawn } = require('child_process');

  // Prepare folder structure info
  const folders = folderStructure.map(f => path.basename(f)).join(', ');

  // Sample some items for review to avoid overwhelming Gemini
  const sampleItems = items.slice(0, 15).map(item => ({
    id: item.id,
    source: item.source,
    proposed_doctype: item.proposed_doctype,
    processor: item.processor,
    metadata_hints: item.metadata_hints
  }));

  const systemPrompt = `You are a document classification expert. Review and correct document types and enhance metadata for a RAG ingestion manifest.

FOLDER STRUCTURE in RAG-RAW-DOCS: ${folders}
EXPECTED DOC TYPES: ${Object.keys(contract.doc_types).join(', ')}

Rules:
1. Match docTypes to folder structure when possible:
   - Patents/ folder → patents doctype
   - Papers/ folder → papers doctype
   - blogs/ folder → press-articles doctype
   - Notes/ folder → notes doctype
   - URLs from article-list.md → press-articles doctype

2. Enhance metadata_hints with domain-specific terms
3. Return ONLY corrected items in same JSON structure
4. Keep all original fields, just correct proposed_doctype and enhance metadata_hints`;

  const userPrompt = `Review these manifest items and correct docTypes + enhance metadata:

${JSON.stringify(sampleItems, null, 2)}

Return corrected items with:
- Fixed proposed_doctype based on folder structure and content analysis
- Enhanced metadata_hints with more relevant terms
- All other fields unchanged`;

  return new Promise((resolve, reject) => {
    const gemini = spawn('gemini', ['-y', `${systemPrompt}\n\n${userPrompt}`]);
    let output = '';
    let error = '';

    gemini.stdout.on('data', (data) => {
      output += data.toString();
    });

    gemini.stderr.on('data', (data) => {
      error += data.toString();
    });

    gemini.on('close', (code) => {
      if (code !== 0) {
        console.warn(`⚠️ Gemini CLI failed (code ${code}): ${error}`);
        resolve(items); // Return original items on failure
        return;
      }

      try {
        // Clean up the output to extract JSON
        let cleanOutput = output.trim();

        // Remove markdown code fences if present
        cleanOutput = cleanOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Try to find JSON array in the output
        const jsonMatch = cleanOutput.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          cleanOutput = jsonMatch[0];
        }

        const reviewedItems = JSON.parse(cleanOutput);

        if (!Array.isArray(reviewedItems)) {
          throw new Error('Expected array of items');
        }

        console.log(`✅ Gemini reviewed ${reviewedItems.length} items`);

        // Merge reviewed items back into full manifest
        const updatedItems = items.map(item => {
          const reviewed = reviewedItems.find(r => r.id === item.id);
          if (reviewed) {
            return {
              ...item,
              proposed_doctype: reviewed.proposed_doctype,
              metadata_hints: {
                ...item.metadata_hints,
                ...reviewed.metadata_hints
              }
            };
          }
          return item;
        });

        resolve(updatedItems);

      } catch (parseError) {
        console.warn(`⚠️ Failed to parse Gemini output: ${parseError.message}`);
        console.warn(`Raw output: ${output.substring(0, 500)}...`);
        resolve(items); // Return original on parse error
      }
    });
  });
}

// Main execution
async function main() {
  console.log(`Generating manifest for persona: ${path.basename(PERSONA_DIR)}`);
  console.log(`Scanning: ${RAW_DOCS_DIR}`);

  // Ensure manifests directory exists
  if (!fs.existsSync(MANIFEST_DIR)) {
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  }

  let items = [];

  // Scan files in RAG-RAW-DOCS
  if (fs.existsSync(RAW_DOCS_DIR)) {
    items.push(...scanDirectory(RAW_DOCS_DIR));
  }

  // Parse URL lists
  const urlListFiles = [
    path.join(RAW_DOCS_DIR, 'article-list.md'),
    path.join(RAW_DOCS_DIR, 'url-list.md'),
    path.join(RAW_DOCS_DIR, 'paper-list.md')
  ];

  urlListFiles.forEach(urlFile => {
    if (fs.existsSync(urlFile)) {
      items.push(...parseURLList(urlFile));
    }
  });

  // Get folder structure for review
  const folderStructure = [];
  if (fs.existsSync(RAW_DOCS_DIR)) {
    const subdirs = fs.readdirSync(RAW_DOCS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(RAW_DOCS_DIR, dirent.name));
    folderStructure.push(...subdirs);
  }

  // Gemini review if requested
  if (REVIEW_MODE && items.length > 0) {
    const contract = loadContract();
    if (contract) {
      items = await reviewManifestWithGemini(items, contract, folderStructure);
    } else {
      console.warn('⚠️ Gemini review skipped - no contract found');
    }
  }

  // Create manifest
  const manifest = {
    schema_version: 1,
    persona: path.basename(PERSONA_DIR),
    defaults: {
      processor: 'auto',
      priority: 'normal'
    },
    items: items,
    generated_at: new Date().toISOString(),
    total_documents: items.length,
    documents_by_type: items.reduce((acc, item) => {
      acc[item.proposed_doctype] = (acc[item.proposed_doctype] || 0) + 1;
      return acc;
    }, {}),
    documents_by_processor: items.reduce((acc, item) => {
      const proc = item.processor || 'auto';
      acc[proc] = (acc[proc] || 0) + 1;
      return acc;
    }, {})
  };

  // Write manifest
  fs.writeFileSync(OUTPUT_FILE, yaml.stringify(manifest, {
    indent: 2,
    lineWidth: 0
  }));

  console.log(`\n✅ Manifest generated: ${OUTPUT_FILE}`);
  console.log(`📊 Documents: ${items.length} total`);
  console.log(`📄 By type:`, manifest.documents_by_type);
  console.log(`🔧 By processor:`, manifest.documents_by_processor);

  // Report folder structure alignment
  if (folderStructure.length > 0) {
    console.log(`\n📁 Folder Structure Analysis:`);
    console.log(`   Raw folders: ${folderStructure.map(f => path.basename(f)).join(', ')}`);

    // Check alignment between folders and docTypes
    const folderToDocType = {
      'Patents': 'patents',
      'Papers': 'papers',
      'blogs': 'press-articles',
      'Notes': 'notes'
    };

    const misalignments = [];
    folderStructure.forEach(folder => {
      const folderName = path.basename(folder);
      const expectedDocType = folderToDocType[folderName];

      if (expectedDocType) {
        const folderItems = items.filter(item =>
          item.source.path.includes(`/${folderName}/`)
        );

        const wrongType = folderItems.filter(item =>
          item.proposed_doctype !== expectedDocType
        );

        if (wrongType.length > 0) {
          misalignments.push({
            folder: folderName,
            expected: expectedDocType,
            wrongItems: wrongType.length,
            total: folderItems.length
          });
        }
      }
    });

    if (misalignments.length > 0) {
      console.log(`\n⚠️  DocType Misalignments Detected:`);
      misalignments.forEach(m => {
        console.log(`   ${m.folder}/ folder: ${m.wrongItems}/${m.total} items not classified as '${m.expected}'`);
      });
      console.log(`\n💡 Run with --review flag to use Gemini CLI for corrections`);
    } else {
      console.log(`   ✅ All docTypes align with folder structure`);
    }
  }

  return manifest;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, scanDirectory, detectDocType, detectProcessor };