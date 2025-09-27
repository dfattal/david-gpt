#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { execSync } = require('child_process');

// Configuration
const MANIFEST_PATH = process.argv[2];
const INGESTION_FORMAT_PATH = process.argv[3];
const FORCE_MODE = process.argv.includes('--force');
const VERBOSE_MODE = process.argv.includes('--verbose');
const PARALLEL_COUNT = parseInt(process.argv.find(arg => arg.startsWith('--parallel='))?.split('=')[1]) || 1;

if (!MANIFEST_PATH || !INGESTION_FORMAT_PATH) {
  console.error('Usage: node process-manifest.js <manifest.yaml> <ingestion-format.yaml> [--force] [--verbose] [--parallel=N]');
  console.error('Example: node process-manifest.js personas/david/manifests/manifest.yaml personas/david/ingestion-format.yaml');
  process.exit(1);
}

// Utility functions
function loadYamlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return yaml.parse(content);
  } catch (err) {
    throw new Error(`Invalid YAML in ${filePath}: ${err.message}`);
  }
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const levelEmoji = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    debug: '🔍'
  };

  console.log(`${levelEmoji[level]} ${message}`);

  if (VERBOSE_MODE || level === 'error') {
    console.log(`   [${timestamp}]`);
  }
}

class ManifestDocumentProcessor {
  constructor(manifestPath, ingestionFormatPath) {
    this.manifestPath = manifestPath;
    this.ingestionFormatPath = ingestionFormatPath;
    this.manifest = null;
    this.ingestionFormat = null;
    this.personaDir = path.dirname(path.dirname(manifestPath)); // Go up from manifests/manifest.yaml
    this.formattedDir = path.join(this.personaDir, 'formatted');
    this.logsDir = path.join(this.personaDir, 'logs');

    // Processing stats
    this.stats = {
      total: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      startTime: new Date(),
      errors: []
    };

    // Rate limiting
    this.exaDelay = 3000; // 3 seconds
    this.geminiDelay = 2000; // 2 seconds
  }

  async processManifest() {
    log('🚀 Starting manifest document processing...');

    try {
      // Load specifications
      await this.loadManifest();
      await this.loadIngestionFormat();

      // Setup directories
      await this.ensureDirectories();

      // Filter items that need processing
      const itemsToProcess = await this.filterItemsToProcess();
      this.stats.total = itemsToProcess.length;

      if (this.stats.total === 0) {
        log('✅ All documents already processed!', 'success');
        return;
      }

      log(`📊 Found ${this.stats.total} documents to process`);

      // Process documents
      if (PARALLEL_COUNT > 1) {
        await this.processInParallel(itemsToProcess);
      } else {
        await this.processSequentially(itemsToProcess);
      }

      // Report results
      this.printFinalStats();

    } catch (error) {
      log(`Failed to process manifest: ${error.message}`, 'error');
      throw error;
    }
  }

  async loadManifest() {
    log('📄 Loading manifest...');
    this.manifest = loadYamlFile(this.manifestPath);
    log(`✅ Loaded manifest with ${this.manifest.items?.length || 0} items`, 'success');
  }

  async loadIngestionFormat() {
    log('📝 Loading ingestion format...');
    this.ingestionFormat = loadYamlFile(this.ingestionFormatPath);
    const docTypes = Object.keys(this.ingestionFormat.doc_types || {});
    log(`✅ Loaded ingestion format with ${docTypes.length} document types: ${docTypes.join(', ')}`, 'success');
  }

  async ensureDirectories() {
    // Create formatted directory structure based on docTypes
    const docTypes = Object.keys(this.ingestionFormat.doc_types || {});

    if (!fs.existsSync(this.formattedDir)) {
      fs.mkdirSync(this.formattedDir, { recursive: true });
    }

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Create subdirectories for each docType using plural names
    const docTypeMapping = {
      'academic-paper': 'academic-papers',
      'preprint': 'preprints',
      'thesis': 'theses',
      'conference-paper': 'conference-papers',
      'patent': 'patents',
      'legal-document': 'legal-documents',
      'press-release': 'press-releases',
      'news-article': 'news-articles',
      'blog-post': 'blog-posts',
      'magazine-article': 'magazine-articles',
      'white-paper': 'white-papers',
      'datasheet': 'datasheets',
      'manual': 'manuals',
      'report': 'reports',
      'presentation': 'presentations',
      'internal-note': 'internal-notes',
      'book': 'books',
      // Legacy support (will be migrated)
      'press-article': 'press-articles',
      'paper': 'papers',
      'note': 'notes'
    };

    for (const docType of docTypes) {
      const directoryName = docTypeMapping[docType] || `${docType}s`;
      const docTypeDir = path.join(this.formattedDir, directoryName);
      if (!fs.existsSync(docTypeDir)) {
        fs.mkdirSync(docTypeDir, { recursive: true });
      }
    }
  }

  async filterItemsToProcess() {
    const itemsToProcess = [];

    for (const item of this.manifest.items || []) {
      const outputPath = this.getOutputPath(item);

      // Skip if already processed and not in force mode
      if (fs.existsSync(outputPath) && !FORCE_MODE) {
        this.stats.skipped++;
        if (VERBOSE_MODE) {
          log(`⏭️ Skipping existing: ${item.id}`, 'debug');
        }
        continue;
      }

      itemsToProcess.push(item);
    }

    return itemsToProcess;
  }

  getOutputPath(item) {
    const docType = item.proposed_doctype || 'news-article';
    const filename = `${item.id}.md`;

    // Always use plural directory names for consistency
    const docTypeMapping = {
      'academic-paper': 'academic-papers',
      'preprint': 'preprints',
      'thesis': 'theses',
      'conference-paper': 'conference-papers',
      'patent': 'patents',
      'legal-document': 'legal-documents',
      'press-release': 'press-releases',
      'news-article': 'news-articles',
      'blog-post': 'blog-posts',
      'magazine-article': 'magazine-articles',
      'white-paper': 'white-papers',
      'datasheet': 'datasheets',
      'manual': 'manuals',
      'report': 'reports',
      'presentation': 'presentations',
      'internal-note': 'internal-notes',
      'book': 'books',
      // Legacy support (will be migrated)
      'press-article': 'press-articles',
      'paper': 'papers',
      'note': 'notes'
    };

    const directoryName = docTypeMapping[docType] || `${docType}s`;
    return path.join(this.formattedDir, directoryName, filename);
  }

  async processSequentially(items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      log(`\n[${i + 1}/${items.length}] Processing: ${item.id}`);

      const result = await this.processItem(item);
      this.updateStats(result, item);

      // Rate limiting delay (except for last item)
      if (i < items.length - 1) {
        await this.delay(1000); // 1 second between items
      }
    }
  }

  async processInParallel(items) {
    log(`🔄 Processing ${items.length} items in parallel (batch size: ${PARALLEL_COUNT})`);

    for (let i = 0; i < items.length; i += PARALLEL_COUNT) {
      const batch = items.slice(i, i + PARALLEL_COUNT);
      log(`\n📦 Processing batch ${Math.ceil((i + 1) / PARALLEL_COUNT)} (items ${i + 1}-${Math.min(i + PARALLEL_COUNT, items.length)})`);

      const promises = batch.map(async (item, index) => {
        const itemNumber = i + index + 1;
        log(`[${itemNumber}/${items.length}] Processing: ${item.id}`);

        const result = await this.processItem(item);
        this.updateStats(result, item);
        return result;
      });

      await Promise.all(promises);

      // Rate limiting delay between batches
      if (i + PARALLEL_COUNT < items.length) {
        await this.delay(2000);
      }
    }
  }

  async processItem(item) {
    try {
      // Extract content using appropriate processor
      const extractionResult = await this.extractContent(item);

      // Apply ingestion format
      const formattedContent = await this.formatContent(extractionResult.content, item);

      // Write to formatted directory first (always save for troubleshooting)
      const outputPath = this.getOutputPath(item);
      await this.writeFormattedDocument(formattedContent, outputPath);

      // Validate output (non-blocking - log warnings only)
      const validationResult = await this.validateOutput(formattedContent, item);

      return {
        success: true,
        outputPath,
        extractionMethod: extractionResult.method,
        wordCount: extractionResult.wordCount,
        validationPassed: validationResult.isValid,
        validationWarnings: validationResult.warnings
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async extractContent(item) {
    const processor = item.processor || 'auto';
    const isUrl = item.source.kind === 'url' || item.source.path?.startsWith('http');

    // Determine extraction method based on source and processor
    let extractionMethod;
    if (processor === 'passthrough') {
      extractionMethod = 'passthrough';
    } else if (isUrl) {
      extractionMethod = 'exa'; // EXA for URLs with Gemini fallback
    } else {
      extractionMethod = 'gemini'; // Gemini CLI for all local files
    }

    if (VERBOSE_MODE) {
      log(`🔄 Using ${extractionMethod} extraction for ${item.source.path}`, 'debug');
    }

    try {
      const result = await this.extractWithMethod(item, extractionMethod);
      return { ...result, method: extractionMethod };
    } catch (error) {
      // Fallback to Gemini CLI if EXA fails
      if (extractionMethod === 'exa') {
        log(`⚠️ EXA failed, falling back to Gemini CLI`, 'warning');
        await this.delay(this.geminiDelay);
        const result = await this.extractWithMethod(item, 'gemini');
        return { ...result, method: 'gemini-fallback' };
      }
      throw error;
    }
  }

  async extractWithMethod(item, method) {
    switch (method) {
      case 'passthrough':
        return await this.extractPassthrough(item);
      case 'gemini':
        return await this.extractGemini(item);
      case 'exa':
        return await this.extractExa(item);
      default:
        throw new Error(`Unknown extraction method: ${method}`);
    }
  }

  async extractPassthrough(item) {
    const filePath = path.resolve(this.personaDir, item.source.path);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Source file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const wordCount = content.split(/\s+/).length;

    // For passthrough, we still need to standardize the frontmatter
    return {
      content: this.standardizeMarkdown(content, item),
      wordCount
    };
  }

  async extractGemini(item) {
    const isUrl = item.source.kind === 'url' || item.source.path?.startsWith('http');
    const sourcePath = isUrl ? item.source.path : path.resolve(this.personaDir, item.source.path);

    // Build Gemini prompt based on ingestion format
    const prompt = this.buildGeminiPrompt(item, sourcePath);

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;

      if (VERBOSE_MODE) {
        log(`🤖 Executing Gemini CLI...`, 'debug');
      }

      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 20, // 20MB buffer
        timeout: 300000 // 5 minute timeout for complex PDFs
      });

      const cleanedOutput = this.cleanGeminiOutput(output.trim());
      const wordCount = cleanedOutput.split(/\s+/).length;

      await this.delay(this.geminiDelay); // Rate limiting

      return {
        content: cleanedOutput,
        wordCount
      };

    } catch (error) {
      throw new Error(`Gemini CLI extraction failed: ${error.message}`);
    }
  }

  async extractExa(item) {
    const url = item.source.path;

    if (!url.startsWith('http')) {
      throw new Error('EXA can only process URLs');
    }

    try {
      const exaApiKey = process.env.EXA_API_KEY || '4cee82ba-f0e2-4d53-bb16-f6920696c862';

      const response = await fetch('https://api.exa.ai/contents', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-api-key': exaApiKey
        },
        body: JSON.stringify({
          ids: [url],
          text: {
            maxCharacters: 50000,
            includeHtmlTags: false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`EXA API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        throw new Error('EXA API returned no results');
      }

      const result = data.results[0];
      const rawContent = result.text || '';

      // Format EXA result using Gemini CLI (mandatory step)
      const formattedContent = await this.formatExaResult(result, item);
      const wordCount = formattedContent.split(/\s+/).length;

      await this.delay(this.exaDelay); // Rate limiting

      return {
        content: formattedContent,
        wordCount
      };

    } catch (error) {
      throw new Error(`EXA extraction failed: ${error.message}`);
    }
  }

  async formatExaResult(exaResult, item) {
    const docType = item.proposed_doctype || 'press-article';
    const formatSpec = this.ingestionFormat.doc_types[docType];

    const prompt = `Please format this web content extracted by EXA API according to our ingestion format specification.

EXA API has provided the following content (use as-is, don't modify the content structure):

Title: ${exaResult.title || 'Web Content'}
URL: ${item.source.path}
Author: ${exaResult.author || ''}
Published Date: ${exaResult.publishedDate || ''}
Content: ${exaResult.text || ''}

Target Document Type: ${docType}
Processing Hints: ${JSON.stringify(item.metadata_hints || {})}

FORMAT REQUIREMENTS:
1. Use EXACT field names from specification: ${Object.keys(formatSpec?.yaml_frontmatter?.required_fields || {}).join(', ')}
2. Apply proper docType: "${docType}" (MUST be EXACTLY "${docType}" - always use singular form)
3. Include ALL required fields with correct types
4. Use "${new Date().toISOString()}" for scraped_at timestamp
5. Calculate accurate word_count from extracted content
6. IMPORTANT: Use proper array formats:
   - authors: Block format with name/affiliation objects
   - keywords/technologies: Inline format ["item1", "item2"]
7. For press-article: MUST include outlet and published_date fields
8. ALWAYS use singular docType forms (e.g., "press-article", "paper", "patent", "note")

Content Requirements:
${this.buildContentRequirements(docType, formatSpec)}

IMPORTANT: Return ONLY raw markdown starting with YAML frontmatter (---). No code blocks or formatting markers.`;

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10,
        timeout: 120000
      });

      const cleanedOutput = this.cleanGeminiOutput(output.trim());
      if (VERBOSE_MODE) {
        log(`🤖 Gemini CLI formatting successful`, 'debug');
      }
      return cleanedOutput;
    } catch (error) {
      // Gemini CLI failed - create basic formatting for troubleshooting
      log(`⚠️  Gemini CLI formatting failed: ${error.message}, using basic formatting`, 'warning');
      return this.createBasicFormatting(exaResult, item);
    }
  }

  buildGeminiPrompt(item, sourcePath) {
    const docType = item.proposed_doctype || 'note';
    const formatSpec = this.ingestionFormat.doc_types[docType];
    const isUrl = item.source.kind === 'url' || item.source.path?.startsWith('http');

    const basePrompt = `Extract and format this document according to the ingestion format specification:

Source: ${sourcePath}
Document Type: ${docType}
Processing Instructions: ${JSON.stringify(item.metadata_hints || {})}

CRITICAL FORMAT REQUIREMENTS:
1. Use EXACT field names from specification: ${Object.keys(formatSpec?.yaml_frontmatter?.required_fields || {}).join(', ')}
2. Apply proper docType: "${docType}"
3. Include ALL required fields with correct types
4. Use "${new Date().toISOString()}" for scraped_at timestamp
5. Calculate accurate word_count from extracted content
6. IMPORTANT: Use proper array formats:
   - authors: Block format with name/affiliation objects
   - keywords/technologies: Inline format ["item1", "item2"]
7. For PDF processing: Focus on text content only, ignore images, charts, and diagrams

Content Requirements:
${this.buildContentRequirements(docType, formatSpec)}

IMPORTANT: Return ONLY raw markdown starting with YAML frontmatter (---). No code blocks or formatting markers.`;

    // Add source-specific instructions
    if (isUrl) {
      return basePrompt + `\n\nExtract complete content from this URL: ${sourcePath}`;
    } else {
      return basePrompt + `\n\nAnalyze and extract complete content from this file: ${sourcePath}`;
    }
  }

  buildContentRequirements(docType, formatSpec) {
    const requirements = [];

    if (formatSpec?.content_structure) {
      const struct = formatSpec.content_structure;

      if (struct.required_sections) {
        requirements.push(`Required sections: ${struct.required_sections.join(', ')}`);
      }

      if (struct.minimum_word_count) {
        requirements.push(`Minimum word count: ${struct.minimum_word_count}`);
      }

      if (struct.special_requirements) {
        requirements.push('Special requirements:');
        struct.special_requirements.forEach(req => {
          requirements.push(`- ${req}`);
        });
      }
    }

    return requirements.join('\n');
  }

  standardizeMarkdown(content, item) {
    // For passthrough, ensure proper frontmatter exists
    const lines = content.split('\n');

    if (lines[0]?.trim() === '---') {
      // Has frontmatter, validate and enhance it
      const yamlEnd = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
      if (yamlEnd > 0) {
        const frontmatterLines = lines.slice(1, yamlEnd);
        const contentLines = lines.slice(yamlEnd + 1);

        // Parse existing frontmatter and enhance
        const frontmatter = yaml.parse(frontmatterLines.join('\n'));
        const enhancedFrontmatter = this.enhanceFrontmatter(frontmatter, item);

        return `---\n${yaml.stringify(enhancedFrontmatter)}---\n${contentLines.join('\n')}`;
      }
    }

    // No frontmatter, create it
    const frontmatter = this.generateFrontmatter(content, item);
    return `---\n${yaml.stringify(frontmatter)}---\n\n${content}`;
  }

  enhanceFrontmatter(existingFrontmatter, item) {
    const enhanced = { ...existingFrontmatter };

    // Ensure required fields
    enhanced.docType = item.proposed_doctype;
    enhanced.scraped_at = enhanced.scraped_at || new Date().toISOString();
    enhanced.extraction_quality = enhanced.extraction_quality || 'high';

    // Add docType-specific required fields
    const docType = item.proposed_doctype || 'note';
    if (docType === 'note') {
      enhanced.updated_at = enhanced.updated_at || new Date().toISOString();
    }

    // Add metadata hints
    if (item.metadata_hints) {
      Object.entries(item.metadata_hints).forEach(([key, value]) => {
        if (!enhanced[key]) {
          enhanced[key] = Array.isArray(value) ? value : [value];
        }
      });
    }

    return enhanced;
  }

  generateFrontmatter(content, item) {
    const docType = item.proposed_doctype || 'note';
    const formatSpec = this.ingestionFormat.doc_types[docType];

    const frontmatter = {
      title: this.extractTitle(content) || 'Document Title',
      docType: docType,
      url: item.source.path,
      scraped_at: new Date().toISOString(),
      word_count: content.split(/\s+/).length,
      extraction_quality: 'high'
    };

    // Add docType-specific required fields
    if (docType === 'note') {
      frontmatter.updated_at = new Date().toISOString();
    }

    // Add metadata hints - but only those that are defined in ingestion format
    if (item.metadata_hints) {
      const formatSpec = this.ingestionFormat.doc_types[docType];
      const allowedOptionalFields = Object.keys(formatSpec?.yaml_frontmatter?.optional_fields || {});

      Object.entries(item.metadata_hints).forEach(([key, value]) => {
        // Only add metadata hints that are defined in the schema
        if (allowedOptionalFields.includes(key)) {
          frontmatter[key] = Array.isArray(value) ? value : [value];
        }
      });
    }

    return frontmatter;
  }

  extractTitle(content) {
    // Try to find title in various ways
    const lines = content.split('\n');

    // Look for H1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Look for first non-empty line
    const firstLine = lines.find(line => line.trim().length > 0);
    if (firstLine && firstLine.length < 100) {
      return firstLine.trim().replace(/^#+\s*/, '');
    }

    return null;
  }

  cleanGeminiOutput(output) {
    let cleaned = output.trim();

    // Remove markdown code fences
    cleaned = cleaned
      .replace(/^```markdown\s*/i, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```\s*$/m, '');

    // Handle conversation traces
    const conversationPatterns = [
      /^(I'll|Let me|I will|I have|I need to|Sure)/i,
      /\bformat the document\b/i,
      /\bFirst, I need to\b/i
    ];

    const firstLines = cleaned.split('\n').slice(0, 3).join(' ');
    const isConversation = conversationPatterns.some(pattern => pattern.test(firstLines));

    if (isConversation) {
      // Try to extract actual content after conversation traces
      const yamlStartMatch = cleaned.match(/^---[\s\S]*?^---/m);
      if (yamlStartMatch) {
        const yamlStart = cleaned.indexOf(yamlStartMatch[0]);
        cleaned = cleaned.substring(yamlStart);
      } else {
        throw new Error('Output appears to be conversation trace without extractable content');
      }
    }

    // Validate that output starts with YAML frontmatter
    if (!cleaned.startsWith('---')) {
      throw new Error('Output does not start with YAML frontmatter (---)');
    }

    return cleaned;
  }

  createBasicFormatting(exaResult, item) {
    const frontmatter = this.generateFrontmatter(exaResult.text || '', item);
    const docType = item.proposed_doctype || 'press-article';

    // Essential fields for all document types
    frontmatter.title = exaResult.title || 'Web Content';
    frontmatter.docType = docType;
    frontmatter.url = item.source.path;
    frontmatter.scraped_at = new Date().toISOString();
    frontmatter.extraction_quality = 'medium';
    frontmatter.word_count = (exaResult.text || '').split(/\s+/).length;

    // Type-specific required fields
    if (docType === 'press-article') {
      // Extract outlet from URL domain - better mapping
      const urlObj = new URL(item.source.path);
      const hostname = urlObj.hostname.toLowerCase();

      if (hostname.includes('wired')) {
        frontmatter.outlet = 'WIRED';
      } else if (hostname.includes('theverge')) {
        frontmatter.outlet = 'The Verge';
      } else if (hostname.includes('samsung')) {
        frontmatter.outlet = 'Samsung Newsroom';
      } else if (hostname.includes('forbes')) {
        frontmatter.outlet = 'Forbes';
      } else if (hostname.includes('zte')) {
        frontmatter.outlet = 'ZTE';
      } else if (hostname.includes('digitaltrends')) {
        frontmatter.outlet = 'Digital Trends';
      } else {
        // Generic fallback
        frontmatter.outlet = hostname.replace('www.', '').replace('.com', '').replace('.org', '').replace('.net', '').toUpperCase();
      }

      frontmatter.published_date = exaResult.publishedDate || new Date().toISOString();
    }

    if (exaResult.author) {
      frontmatter.authors = [{ name: exaResult.author }];
    }

    return `---\n${yaml.stringify(frontmatter)}---\n\n# ${frontmatter.title}\n\n${exaResult.text || ''}`;
  }

  async formatContent(content, item) {
    // Content should already be formatted by extraction methods
    return content;
  }

  async validateOutput(content, item) {
    const docType = item.proposed_doctype || 'note';
    const formatSpec = this.ingestionFormat.doc_types[docType];
    const warnings = [];
    let isValid = true;

    // Basic YAML frontmatter validation
    const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      warnings.push('⚠️  No valid YAML frontmatter found');
      isValid = false;
    } else {
      try {
        const frontmatter = yaml.parse(yamlMatch[1]);

        // Validate required fields
        const requiredFields = Object.keys(formatSpec?.yaml_frontmatter?.required_fields || {});
        const missingFields = requiredFields.filter(field => !frontmatter[field]);

        if (missingFields.length > 0) {
          warnings.push(`⚠️  Missing required fields: ${missingFields.join(', ')}`);
          isValid = false;
        }

        // Validate docType
        if (frontmatter.docType !== docType) {
          warnings.push(`⚠️  DocType mismatch: expected ${docType}, got ${frontmatter.docType}`);
          isValid = false;
        }

        // Check for plural docType forms (should be singular)
        const pluralForms = ['papers', 'patents', 'press-articles', 'notes', 'urls'];
        if (pluralForms.includes(frontmatter.docType)) {
          warnings.push(`⚠️  Plural docType detected: ${frontmatter.docType}. Should use singular form.`);
          isValid = false;
        }

        // Log validation results
        if (isValid) {
          if (VERBOSE_MODE) {
            log(`✅ Validation passed`, 'debug');
          }
        } else {
          warnings.forEach(warning => log(warning, 'warning'));
        }

      } catch (error) {
        warnings.push(`⚠️  YAML parsing error: ${error.message}`);
        log(`⚠️  YAML parsing error: ${error.message}`, 'warning');
        isValid = false;
      }
    }

    return { isValid, warnings };
  }

  async writeFormattedDocument(content, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
  }

  updateStats(result, item) {
    if (result.success) {
      this.stats.processed++;
      const validationStatus = result.validationPassed ? '✅' : '⚠️';
      const warningCount = result.validationWarnings?.length || 0;
      const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
      log(`${validationStatus} Success: ${result.extractionMethod} → ${result.wordCount} words${warningText}`, 'success');
    } else {
      this.stats.failed++;
      this.stats.errors.push({ document: item.id, error: result.error });
      log(`❌ Failed: ${result.error}`, 'error');
    }
  }

  printFinalStats() {
    const duration = Date.now() - this.stats.startTime.getTime();
    const durationMinutes = Math.round(duration / 60000);

    console.log('\n' + '='.repeat(50));
    log('📊 PROCESSING COMPLETE', 'success');
    console.log('='.repeat(50));
    console.log(`⏱️  Duration: ${durationMinutes} minutes`);
    console.log(`📁 Total documents: ${this.stats.total}`);
    console.log(`✅ Successfully processed: ${this.stats.processed}`);
    console.log(`⏭️  Skipped (existing): ${this.stats.skipped}`);
    console.log(`❌ Failed: ${this.stats.failed}`);

    if (this.stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.document}`);
        console.log(`   Error: ${error.error}\n`);
      });
    }

    const successRate = this.stats.total > 0 ? Math.round((this.stats.processed / this.stats.total) * 100) : 0;
    console.log(`\n🎯 Success rate: ${successRate}%`);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  try {
    const processor = new ManifestDocumentProcessor(MANIFEST_PATH, INGESTION_FORMAT_PATH);
    await processor.processManifest();
    console.log('\n🎉 Document processing completed successfully!');
  } catch (error) {
    console.error('\n💥 Critical error occurred during processing:');
    console.error(`Error: ${error.message}`);

    if (error.stack && VERBOSE_MODE) {
      console.error(`Stack trace: ${error.stack}`);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ManifestDocumentProcessor };