#!/usr/bin/env tsx

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Load environment variables
require('dotenv').config({ path: '/Users/david.fattal/Documents/GitHub/david-gpt/.env.local' });

interface ProcessingManifest {
  processing_session_metadata: {
    session_id: string;
    timestamp: string;
    agent_version: string;
    purpose: string;
  };
  document_count_summaries: {
    total_documents: number;
    by_type: Record<string, number>;
    by_status: Record<string, number>;
  };
  documents_to_process: DocumentEntry[];
}

interface DocumentEntry {
  source_uri: string;
  document_type: string;
  extraction_tool: string;
  extraction_strategy: string;
  status: string;
  metadata_enhancements: string[];
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
  private readonly corpusPath = '/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus';
  private readonly rateLimitDelay = 3000; // 3 seconds between requests
  private readonly retryAttempts = 3;
  private readonly batchSize = 3;

  private stats: ProcessingStats = {
    total: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date(),
    errors: []
  };

  async processManifest(manifestPath: string): Promise<void> {
    console.log('🚀 Starting document processing pipeline...\n');

    const manifest = await this.loadManifest(manifestPath);
    const documentsToProcess = await this.filterUnprocessedDocuments(manifest.documents_to_process);

    this.stats.total = documentsToProcess.length;
    console.log(`📊 Found ${this.stats.total} documents to process\n`);

    if (this.stats.total === 0) {
      console.log('✅ All documents already processed!');
      return;
    }

    // Process documents in batches
    for (let i = 0; i < documentsToProcess.length; i += this.batchSize) {
      const batch = documentsToProcess.slice(i, i + this.batchSize);
      await this.processBatch(batch, i + 1);
    }

    this.printFinalStats();
  }

  private async loadManifest(manifestPath: string): Promise<ProcessingManifest> {
    try {
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load manifest: ${error}`);
    }
  }

  private async filterUnprocessedDocuments(documents: DocumentEntry[]): Promise<DocumentEntry[]> {
    const unprocessed: DocumentEntry[] = [];

    for (const doc of documents) {
      // Check if document already exists by URL in existing files
      // Use manifest document_type since we don't have content at this filtering stage
      const docTypeToUse = doc.document_type;
      const subdirectory = this.getSubdirectory(docTypeToUse);
      const dirPath = join(this.corpusPath, subdirectory);

      if (existsSync(dirPath)) {
        const existingFiles = await readdir(dirPath);
        const urlExists = await this.checkIfUrlExists(doc.source_uri, dirPath, existingFiles);

        if (urlExists) {
          this.stats.skipped++;
          console.log(`⏭️  Skipping existing URL: ${doc.source_uri}`);
          continue;
        }
      }

      unprocessed.push(doc);
    }

    return unprocessed;
  }

  private async checkIfUrlExists(url: string, dirPath: string, files: string[]): Promise<boolean> {
    for (const file of files) {
      if (file.endsWith('.md')) {
        try {
          const content = await readFile(join(dirPath, file), 'utf-8');
          if (content.includes(`url: "${url}"`) || content.includes(`url: ${url}`)) {
            return true;
          }
        } catch {
          // Ignore file read errors
        }
      }
    }
    return false;
  }

  private async processBatch(batch: DocumentEntry[], batchStart: number): Promise<void> {
    console.log(`\n📦 Processing batch ${Math.ceil(batchStart / this.batchSize)} (documents ${batchStart}-${batchStart + batch.length - 1})`);

    for (const [index, document] of batch.entries()) {
      const docNumber = batchStart + index;
      console.log(`\n[${docNumber}/${this.stats.total}] Processing: ${this.getDocumentDisplayName(document)}`);

      const result = await this.processDocument(document);

      if (result.success) {
        this.stats.processed++;
        console.log(`✅ Success: ${result.extractionMethod} → ${result.wordCount} words`);
      } else {
        this.stats.failed++;
        this.stats.errors.push({ document: document.source_uri, error: result.error || 'Unknown error' });
        console.log(`❌ Failed: ${result.error}`);
      }

      // Rate limiting delay (except for last document in batch)
      if (index < batch.length - 1) {
        console.log(`⏳ Rate limiting delay: ${this.rateLimitDelay}ms`);
        await this.delay(this.rateLimitDelay);
      }
    }
  }

  private async processDocument(document: DocumentEntry): Promise<ProcessingResult> {
    const extractionMethods = this.getExtractionMethods(document);

    for (const method of extractionMethods) {
      try {
        console.log(`🔄 Trying ${method}...`);
        const result = await this.retryWithBackoff(() => this.extractContent(document, method));

        if (result.success) {
          const filename = await this.generateFilename(document, result.content);
          // Use document_type from manifest for directory placement
          const subdirectory = this.getSubdirectory(document.document_type);
          const dirPath = join(this.corpusPath, subdirectory);
          await this.ensureDirectoryExists(dirPath);
          const filePath = join(dirPath, filename);

          await this.writeDocument(filePath, result.content!, document);

          return {
            success: true,
            documentPath: filePath,
            extractionMethod: method,
            wordCount: result.wordCount
          };
        }
      } catch (error) {
        console.log(`⚠️  ${method} failed: ${error}`);
        continue;
      }
    }

    return {
      success: false,
      error: 'All extraction methods failed'
    };
  }

  private getExtractionMethods(document: DocumentEntry): string[] {
    const isURL = document.source_uri.startsWith('http');
    const isPDF = document.source_uri.toLowerCase().endsWith('.pdf');
    const isLocalFile = document.source_uri.startsWith('/');
    const isArxiv = this.isArxivUrl(document.source_uri);
    const isPaper = document.document_type === 'paper' || document.document_type === 'technical_paper';

    if (isArxiv) {
      // arXiv papers: Use EXA HTML extraction first (works better for large PDFs), then arXiv API, then Gemini
      return ['exa', 'arxiv', 'gemini'];
    } else if (isPaper && (isPDF || isURL)) {
      // Academic papers: Prioritize Gemini for PDF processing and content completeness
      return ['gemini', 'exa', 'webfetch'];
    } else if (isURL && !isPDF) {
      return ['exa', 'webfetch', 'gemini']; // URLs: EXA first, then WebFetch, then Gemini
    } else if (isPDF || isLocalFile) {
      return ['gemini', 'exa']; // Local files/PDFs: Gemini first
    } else {
      return ['gemini', 'exa', 'webfetch']; // Fallback order
    }
  }

  private isArxivUrl(url: string): boolean {
    return url.includes('arxiv.org/pdf/') || url.includes('arxiv.org/abs/');
  }

  private async extractContent(document: DocumentEntry, method: string): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    switch (method) {
      case 'arxiv':
        return this.extractWithArxivAPI(document);
      case 'gemini':
        return this.extractWithGemini(document);
      case 'exa':
        // For arXiv URLs, use HTML version for better content extraction
        if (this.isArxivUrl(document.source_uri)) {
          return this.extractArxivWithExa(document);
        }
        return this.extractWithExa(document);
      case 'webfetch':
        return this.extractWithWebFetch(document);
      default:
        throw new Error(`Unknown extraction method: ${method}`);
    }
  }

  private async extractWithArxivAPI(document: DocumentEntry): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    try {
      const arxivId = this.extractArxivId(document.source_uri);
      if (!arxivId) {
        throw new Error('Could not extract arXiv ID from URL');
      }

      console.log(`📄 Fetching arXiv paper metadata for ${arxivId}...`);

      // Fetch metadata from arXiv API
      const metadata = await this.fetchArxivMetadata(arxivId);
      metadata.arxivId = arxivId;

      console.log(`📥 Downloading PDF for ${arxivId}...`);

      // Download PDF and extract content with Gemini
      const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
      const pdfContent = await this.extractPdfWithGemini(pdfUrl, metadata, document);

      const wordCount = pdfContent.split(/\s+/).length;
      console.log(`✅ arXiv extraction complete: ${wordCount} words`);

      return { success: true, content: pdfContent, wordCount };
    } catch (error) {
      console.log(`❌ arXiv API extraction failed: ${error}`);
      throw new Error(`arXiv API extraction failed: ${error}`);
    }
  }

  private async extractArxivWithExa(document: DocumentEntry): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    try {
      const arxivId = this.extractArxivId(document.source_uri);
      if (!arxivId) {
        throw new Error('Could not extract arXiv ID from URL');
      }

      // Use arXiv HTML version for better content extraction
      const htmlUrl = `https://arxiv.org/html/${arxivId}v1`;
      console.log(`📄 Extracting arXiv paper from HTML: ${htmlUrl}`);

      // Call EXA to extract comprehensive content
      const exaResult = await this.callExaAPI(htmlUrl);
      if (!exaResult || !exaResult.content) {
        throw new Error('EXA extraction returned no content');
      }

      // Format the content with proper YAML frontmatter for papers
      const formattedContent = await this.formatArxivContent(exaResult, document, arxivId);
      const wordCount = formattedContent.split(/\s+/).length;

      console.log(`✅ arXiv EXA extraction complete: ${wordCount} words`);
      return { success: true, content: formattedContent, wordCount };
    } catch (error) {
      console.log(`❌ arXiv EXA extraction failed: ${error}`);
      throw new Error(`arXiv EXA extraction failed: ${error}`);
    }
  }

  private async formatArxivContent(exaResult: any, document: DocumentEntry, arxivId: string): Promise<string> {
    const prompt = `Format this arXiv paper content into a complete markdown document with proper YAML frontmatter following INGESTION-FORMAT.md specifications.

Paper Content: ${exaResult.content}
arXiv ID: ${arxivId}
URL: ${document.source_uri}

CRITICAL FORMAT REQUIREMENTS:
1. Use EXACT field names from INGESTION-FORMAT.md: "docType" (not "doc_type"), "authors" (not "author")
2. Use inline array format: ["item1", "item2"] NOT block format
3. Include ALL required fields: title, docType, authors, venue, publicationYear, abstract, keywords, technologies, url, scraped_at, word_count, extraction_quality
4. Use "${new Date().toISOString()}" for scraped_at timestamp
5. Use structured authors format:
   authors:
     - name: "Author Name"
       affiliation: "Institution"

Content Requirements:
1. Extract comprehensive paper content including methodology, results, technical details
2. docType must be "paper"
3. venue should be "arXiv"
4. Include complete abstract, introduction, methodology, results sections
5. Extract all technical terms for keywords and technologies arrays
6. Preserve mathematical notation and technical details

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      return this.cleanMarkdownCodeFences(output.trim());
    } catch (error) {
      // Fallback to structured YAML if Gemini fails
      return this.createArxivFallbackContent(exaResult, document, arxivId);
    }
  }

  private createArxivFallbackContent(exaResult: any, document: DocumentEntry, arxivId: string): string {
    const timestamp = new Date().toISOString();
    const yaml = [
      '---',
      `title: "${exaResult.title || 'arXiv Paper'}"`,
      `docType: "paper"`,
      `authors:`,
      `  - name: "Author Name"`,
      `    affiliation: "Institution"`,
      `venue: "arXiv"`,
      `publicationYear: ${new Date().getFullYear()}`,
      `arxivId: "${arxivId}"`,
      `abstract: "Paper abstract"`,
      `keywords: ["machine learning", "computer vision"]`,
      `technologies: ["neural networks", "deep learning"]`,
      `url: "${document.source_uri}"`,
      `scraped_at: "${timestamp}"`,
      `word_count: ${exaResult.content?.split(/\s+/).length || 0}`,
      `extraction_quality: "medium"`,
      '---'
    ].join('\n');

    return `${yaml}\n\n# ${exaResult.title || 'arXiv Paper'}\n\n${exaResult.content || ''}`;
  }

  private extractArxivId(url: string): string | null {
    // Extract arXiv ID from URLs like:
    // https://arxiv.org/pdf/2401.10891.pdf
    // https://arxiv.org/abs/2401.10891
    const match = url.match(/arxiv\.org\/(?:pdf|abs)\/([^\/]+?)(?:\.pdf)?$/);
    return match ? match[1] : null;
  }

  private async fetchArxivMetadata(arxivId: string): Promise<any> {
    const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`arXiv API request failed: ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseArxivXML(xmlText);
    } catch (error) {
      throw new Error(`Failed to fetch arXiv metadata: ${error}`);
    }
  }

  private parseArxivXML(xmlText: string): any {
    // Enhanced XML parsing for arXiv API response
    // Handle multiple entries and extract paper-specific data (skip feed title)
    const entryMatch = xmlText.match(/<entry[^>]*>([\s\S]*?)<\/entry>/);
    const entryContent = entryMatch ? entryMatch[1] : xmlText;

    const titleMatch = entryContent.match(/<title[^>]*>([^<]+)<\/title>/);
    const summaryMatch = entryContent.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const publishedMatch = entryContent.match(/<published[^>]*>([^<]+)<\/published>/);
    const updatedMatch = entryContent.match(/<updated[^>]*>([^<]+)<\/updated>/);

    // Extract authors (skip feed-level authors)
    const authorMatches = [...entryContent.matchAll(/<author[^>]*>[\s\S]*?<name[^>]*>([^<]+)<\/name>[\s\S]*?<\/author>/g)];
    const authors = authorMatches.map(match => match[1].trim()).filter(author => author && !author.includes('ArXiv'));

    // Extract categories
    const categoryMatches = [...entryContent.matchAll(/<category[^>]*term="([^"]*)"[^>]*>/g)];
    const categories = categoryMatches.map(match => match[1]);

    // Extract DOI and journal reference if available
    const doiMatch = entryContent.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
    const journalMatch = entryContent.match(/<arxiv:journal_ref[^>]*>([^<]+)<\/arxiv:journal_ref>/);
    const commentMatch = entryContent.match(/<arxiv:comment[^>]*>([^<]+)<\/arxiv:comment>/);

    return {
      title: titleMatch ? titleMatch[1].trim() : 'Unknown Title',
      summary: summaryMatch ? summaryMatch[1].trim().replace(/\s+/g, ' ') : '',
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      published: publishedMatch ? publishedMatch[1].trim() : '',
      updated: updatedMatch ? updatedMatch[1].trim() : '',
      categories: categories,
      doi: doiMatch ? doiMatch[1].trim() : null,
      journal_ref: journalMatch ? journalMatch[1].trim() : null,
      comment: commentMatch ? commentMatch[1].trim() : null,
      arxivId: null // Will be set by caller
    };
  }

  private async extractPdfWithGemini(pdfUrl: string, metadata: any, document: DocumentEntry): Promise<string> {
    const prompt = `Extract and format this arXiv paper into a complete markdown document with proper YAML frontmatter.

Known metadata from arXiv API:
- Title: ${metadata.title}
- Authors: ${metadata.authors.join(', ')}
- Published: ${metadata.published}
- Categories: ${metadata.categories.join(', ')}
- Abstract: ${metadata.summary}
- arXiv ID: ${metadata.arxivId}
- PDF URL: ${pdfUrl}

Please download and analyze the PDF at: ${pdfUrl}

Requirements:
1. Create complete YAML frontmatter following INGESTION-FORMAT.md with:
   - title: "${metadata.title}"
   - docType: "paper"
   - authors: (structured format with name and affiliation for each author)
   - venue: "arXiv"
   - publicationYear: ${new Date(metadata.published).getFullYear()}
   - doi: null
   - arxivId: "${metadata.arxivId}"
   - abstract: (use the abstract from metadata)
   - keywords: ["keyword1", "keyword2"] (inline array format)
   - technologies: ["tech1", "tech2"] (inline array format)
   - url: "${pdfUrl}"
   - scraped_at: "${new Date().toISOString()}"
   - word_count: (calculate from content)
   - extraction_quality: "high"

2. Extract and include the complete paper content:
   - Full abstract (from metadata)
   - Introduction section
   - All methodology/technical sections
   - Results and conclusions
   - References section

3. Maintain academic formatting and mathematical notation
4. Preserve all figures, tables, and equations as described in text
5. Include author affiliations if available in the PDF

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add markdown formatting markers.`;

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 20 // 20MB buffer for full papers
      });

      return this.cleanMarkdownCodeFences(output.trim());
    } catch (error) {
      throw new Error(`Gemini PDF extraction failed: ${error}`);
    }
  }

  private cleanMarkdownCodeFences(content: string): string {
    // Enhanced cleaning to handle Gemini CLI conversation traces and various output formats
    let cleaned = content.trim();

    // Remove markdown code fences
    cleaned = cleaned
      .replace(/^```markdown\s*/i, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```\s*$/m, '');

    // Handle conversation traces - look for patterns that indicate Gemini CLI conversation output
    const conversationPatterns = [
      /^(Okay|Got it|I'll|Let me|I will|I have|I need to|Sure)/i,
      /\bformat the document\b/i,
      /\bFirst, I need to read\b/i,
      /\bI'll now\b/i,
      /\bcreate.*markdown.*file\b/i
    ];

    // Check if content starts with conversation-like patterns
    const firstLines = cleaned.split('\n').slice(0, 3).join(' ');
    const isConversation = conversationPatterns.some(pattern => pattern.test(firstLines));

    if (isConversation) {
      // Try to extract actual content after conversation traces
      const yamlStartMatch = cleaned.match(/^---[\s\S]*?^---/m);
      if (yamlStartMatch) {
        // Found YAML frontmatter - extract from there
        const yamlStart = cleaned.indexOf(yamlStartMatch[0]);
        cleaned = cleaned.substring(yamlStart);
      } else {
        // Look for markdown heading that might indicate actual content
        const headingMatch = cleaned.match(/^#{1,6}\s+.+$/m);
        if (headingMatch) {
          const headingStart = cleaned.indexOf(headingMatch[0]);
          // Create minimal YAML frontmatter and append the content
          const title = headingMatch[0].replace(/^#+\s*/, '').trim();
          cleaned = `---\ntitle: "${title}"\ndocType: "note"\nurl: ""\nscraped_at: "${new Date().toISOString()}"\nword_count: 0\nextraction_quality: "low"\n---\n\n` + cleaned.substring(headingStart);
        } else {
          // Fallback: create minimal structure if no clear content found
          throw new Error('Output appears to be conversation trace without extractable content');
        }
      }
    }

    // Final validation and cleanup
    cleaned = cleaned.trim();

    // Validate that output starts with YAML frontmatter
    if (!cleaned.startsWith('---')) {
      throw new Error('Output does not start with YAML frontmatter (---). Possible conversation trace or malformed output.');
    }

    // Basic YAML validation - ensure we have closing frontmatter
    const yamlMatch = cleaned.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      throw new Error('Invalid or incomplete YAML frontmatter found in output');
    }

    return cleaned;
  }

  private extractDocTypeFromContent(content: string): string | null {
    // Extract docType from YAML frontmatter if available
    const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yamlContent = yamlMatch[1];
      const docTypeMatch = yamlContent.match(/docType:\s*["']?([^"'\n]+)["']?/);
      if (docTypeMatch) {
        return docTypeMatch[1].trim();
      }
    }
    return null;
  }

  private async extractWithGemini(document: DocumentEntry): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildGeminiPrompt(document);
        const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;

        const output = execSync(command, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });

        const cleanedOutput = this.cleanMarkdownCodeFences(output.trim());
        const wordCount = cleanedOutput.split(/\s+/).length;

        // Validate output quality - reject if too short or appears malformed
        if (wordCount < 50 && !cleanedOutput.includes('docType:')) {
          throw new Error(`Output too short (${wordCount} words) and appears malformed`);
        }

        // Special validation for patents - ensure claims are present
        if (document.document_type === 'patent' || document.source_uri.includes('patents.google.com')) {
          const claimsValidation = this.validatePatentClaims(cleanedOutput);
          if (!claimsValidation.isValid) {
            throw new Error(`Patent claims validation failed: ${claimsValidation.reason}`);
          }
        }

        // Special validation for academic papers - ensure required fields are present
        if (document.document_type === 'paper' || document.document_type === 'technical_paper') {
          const paperValidation = this.validatePaperFormat(cleanedOutput);
          if (!paperValidation.isValid) {
            throw new Error(`Paper format validation failed: ${paperValidation.reason}`);
          }
        }

        return { success: true, content: cleanedOutput, wordCount };
      } catch (error) {
        lastError = error;
        console.log(`❌ Gemini attempt ${attempt}/${maxRetries} failed: ${error}`);

        if (attempt < maxRetries) {
          // Add delay between retries
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          console.log(`🔄 Retrying Gemini extraction (attempt ${attempt + 1}/${maxRetries})...`);
        }
      }
    }

    throw new Error(`Gemini extraction failed after ${maxRetries} attempts: ${lastError}`);
  }

  private async extractWithExa(document: DocumentEntry): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    try {
      const isURL = document.source_uri.startsWith('http');

      if (!isURL) {
        throw new Error('EXA can only process URLs');
      }

      // Use EXA API for web content extraction
      const result = await this.callExaAPI(document.source_uri);

      if (result && result.content) {
        const formattedContent = await this.formatExaContent(result, document);
        const wordCount = formattedContent.split(/\s+/).length;

        return {
          success: true,
          content: formattedContent,
          wordCount
        };
      }

      throw new Error('EXA returned no content');
    } catch (error) {
      throw new Error(`EXA extraction failed: ${error}`);
    }
  }

  private async callExaAPI(url: string): Promise<any> {
    const exaApiKey = process.env.EXA_API_KEY || '4cee82ba-f0e2-4d53-bb16-f6920696c862';

    try {
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
      return {
        content: result.text || '',
        title: result.title || '',
        url: result.url || url,
        author: result.author || '',
        publishedDate: result.publishedDate || ''
      };
    } catch (error) {
      throw new Error(`EXA API call failed: ${error}`);
    }
  }

  private async formatExaContent(exaResult: any, document: DocumentEntry): Promise<string> {
    // Use Gemini to format EXA extraction result into proper markdown
    const prompt = `Format this extracted web content into a complete markdown document with proper YAML frontmatter according to INGESTION-FORMAT.md specifications:

Title: ${exaResult.title || 'Document Title'}
URL: ${document.source_uri}
Author: ${exaResult.author || ''}
Published Date: ${exaResult.publishedDate || ''}
Document Type: ${document.document_type}
Content: ${exaResult.content || ''}

Requirements:
1. Use appropriate docType based on document type: "${document.document_type}"
2. Create complete YAML frontmatter with all relevant fields
3. For press articles: extract OEM, model, technology, and product information
4. For patents: include patent number, inventors, assignees, and CRITICAL: Extract and preserve ALL patent claims in their complete, verbatim form. Do not summarize or abbreviate claims - they must be word-for-word exactly as written in the patent document
5. Include proper metadata enhancements: ${document.metadata_enhancements?.join(', ') || 'none'}
6. Format content as clean markdown with proper heading hierarchy
7. Extract and populate keywords, technologies, and other relevant fields
8. Ensure all URLs and citations are preserved

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      return this.cleanMarkdownCodeFences(output.trim());
    } catch (error) {
      // Fallback to simple formatting if Gemini fails
      const yaml = this.generateYAMLFrontmatter(document, exaResult);
      const content = exaResult.content || '';
      return `${yaml}\n\n# ${exaResult.title || 'Document Title'}\n\n${content}`;
    }
  }

  private async extractWithWebFetch(document: DocumentEntry): Promise<{ success: boolean; content?: string; wordCount?: number }> {
    try {
      const isURL = document.source_uri.startsWith('http');

      if (!isURL) {
        throw new Error('WebFetch can only process URLs');
      }

      // Use WebFetch tool for content extraction
      const result = await this.callWebFetch(document.source_uri);

      if (result && result.content) {
        const formattedContent = this.formatWebFetchContent(result, document);
        const wordCount = formattedContent.split(/\s+/).length;

        return {
          success: true,
          content: formattedContent,
          wordCount
        };
      }

      throw new Error('WebFetch returned no content');
    } catch (error) {
      throw new Error(`WebFetch extraction failed: ${error}`);
    }
  }

  private async callWebFetch(url: string): Promise<any> {
    // This would integrate with WebFetch tool
    // For now, throw error to fall back to Gemini
    throw new Error('WebFetch tool not configured - falling back to Gemini');
  }

  private formatWebFetchContent(webFetchResult: any, document: DocumentEntry): string {
    // Format WebFetch result into proper markdown with YAML frontmatter
    const yaml = this.generateYAMLFrontmatter(document, webFetchResult);
    const content = webFetchResult.content || '';

    return `${yaml}\n\n${content}`;
  }

  private generateYAMLFrontmatter(document: DocumentEntry, extractionResult?: any): string {
    const docType = this.mapDocumentType(document.document_type);
    const timestamp = new Date().toISOString();

    // Core required fields for all documents (INGESTION-FORMAT.md compliant)
    const frontmatter = [
      '---',
      `title: "${extractionResult?.title || 'Document Title'}"`,
      `docType: "${docType}"`,
      `url: "${document.source_uri}"`,
      `scraped_at: "${timestamp}"`,
      `word_count: ${extractionResult?.wordCount || extractionResult?.content?.split(/\s+/).length || 0}`,
      `extraction_quality: "high"`
    ];

    // Document-type specific fields following INGESTION-FORMAT.md specifications
    if (docType === 'press-article') {
      const authors = extractionResult?.author ? [{ name: extractionResult.author }] : [];
      frontmatter.push(
        `authors: ${JSON.stringify(authors)}`,
        `outlet: "${extractionResult?.outlet || this.extractDomain(document.source_uri)}"`,
        `published_date: "${extractionResult?.publishedDate || extractionResult?.date || new Date().toISOString()}"`,
        `keywords: ${JSON.stringify(extractionResult?.keywords || [])}`,
        `technologies: ${JSON.stringify(extractionResult?.technologies || [])}`,
        `oem: "${extractionResult?.oem || extractionResult?.oems?.[0] || ''}"`,
        `model: "${extractionResult?.model || extractionResult?.products?.[0] || ''}"`
      );
    } else if (docType === 'paper') {
      // Use structured authors format as required by INGESTION-FORMAT.md
      const authors = (extractionResult?.authors || extractionResult?.author?.split(', ') || ['Unknown Author']).map((author: string) => ({ name: author.trim(), affiliation: "Institution" }));
      frontmatter.push(
        `authors:`,
      );
      authors.forEach((author: {name: string, affiliation: string}) => {
        frontmatter.push(
          `  - name: "${author.name}"`,
          `    affiliation: "${author.affiliation}"`
        );
      });
      frontmatter.push(
        `venue: "${extractionResult?.venue || 'Unknown Venue'}"`,
        `publicationYear: ${extractionResult?.publicationYear || new Date().getFullYear()}`,
        `abstract: "${extractionResult?.abstract || extractionResult?.summary || 'Abstract not available'}"`,
        `keywords: ${JSON.stringify(extractionResult?.keywords || [])}`,
        `technologies: ${JSON.stringify(extractionResult?.technologies || [])}`
      );

      // Optional fields
      if (extractionResult?.doi) {
        frontmatter.push(`doi: "${extractionResult.doi}"`);
      }
      if (extractionResult?.arxivId) {
        frontmatter.push(`arxivId: "${extractionResult.arxivId}"`);
      }
    } else if (docType === 'patent') {
      frontmatter.push(
        `patentNo: "${extractionResult?.patentNo || 'Unknown'}"`,
        `inventors: ${JSON.stringify(extractionResult?.inventors || [])}`,
        `assignees: ${JSON.stringify(extractionResult?.assignees || [])}`,
        `filedDate: "${extractionResult?.filedDate || ''}"`,
        `grantedDate: "${extractionResult?.grantedDate || ''}"`
      );
    } else if (docType === 'note') {
      const authors = [{ name: extractionResult?.author || 'David Fattal' }];
      frontmatter.push(
        `authors: ${JSON.stringify(authors)}`,
        `date: "${extractionResult?.date || new Date().toISOString().split('T')[0]}"`,
        `keywords: ${JSON.stringify(extractionResult?.keywords || [])}`,
        `technologies: ${JSON.stringify(extractionResult?.technologies || [])}`
      );
    }

    frontmatter.push('---');
    return frontmatter.join('\n');
  }

  private mapDocumentType(manifestType: string): string {
    const typeMap: Record<string, string> = {
      'press_article': 'press-article',
      'technical_paper': 'paper',
      'direct_markdown': 'note',
      'pdf': 'paper'
    };

    return typeMap[manifestType] || manifestType;
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  private buildGeminiPrompt(document: DocumentEntry): string {
    const isURL = document.source_uri.startsWith('http');
    const isPDF = document.source_uri.toLowerCase().endsWith('.pdf');

    if (isURL && !isPDF) {
      const isPatent = document.source_uri.includes('patents.google.com') || document.document_type === 'patent';

      if (isPatent) {
        return `Extract complete patent content from this Google Patents URL and format as markdown with proper YAML frontmatter:

URL: ${document.source_uri}
Document Type: patent

CRITICAL PATENT REQUIREMENTS:
1. Extract complete YAML frontmatter with: title, docType: "patent", patentNo, inventors[], assignees[], filedDate, grantedDate
2. Extract FULL patent content including:
   - Abstract section
   - Background/Description sections
   - Detailed Description
   - Claims section - CRITICAL: Extract ALL claims in complete verbatim form
3. Claims section must include the exact text "## Claims" followed by numbered claims
4. DO NOT summarize, abbreviate, or paraphrase any claims text
5. Include all claim dependencies and references exactly as written
6. Preserve all technical terminology and legal language in claims

STRUCTURE REQUIREMENTS:
- YAML frontmatter with patent-specific fields
- ## Abstract
- ## Description (background and detailed description)
- ## Claims (complete verbatim claims)
- ## Definitions (key terms)
- ## Classifications (IPC/CPC codes if available)
- ## Links (patent office URLs)

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks.`;
      } else {
        return `Extract the complete content from this URL and format it as markdown with proper YAML frontmatter following INGESTION-FORMAT.md specifications:

URL: ${document.source_uri}
Document Type: ${document.document_type}

CRITICAL FORMAT REQUIREMENTS:
1. Use EXACT field names: "docType" (not "doc_type"), "authors" (not "author")
2. Use inline array format: ["item1", "item2"] NOT block format
3. Include ALL required fields: title, docType, url, scraped_at, word_count, extraction_quality
4. Use "${new Date().toISOString()}" for scraped_at timestamp

Content Requirements:
1. Extract FULL content (not summary) from the webpage
2. Apply proper YAML frontmatter with all relevant fields for docType "${document.document_type}"
3. Include metadata enhancements: ${document.metadata_enhancements.join(', ')}
4. Format content as clean markdown with proper heading hierarchy
5. Ensure title matches content
6. Include proper date extraction from the webpage
7. Auto-populate OEM, model, technology fields where applicable

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;
      }
    } else if (isPDF || document.source_uri.startsWith('/')) {
      const isPaper = document.document_type === 'paper' || document.document_type === 'technical_paper';
      const isPatent = document.document_type === 'patent';

      if (isPaper) {
        return `Extract complete academic paper content from this PDF/document and format as comprehensive markdown:

File: ${document.source_uri}
Document Type: academic paper

CRITICAL PAPER EXTRACTION REQUIREMENTS:
1. YAML frontmatter MUST follow INGESTION-FORMAT.md EXACTLY:
   - title: "Complete paper title"
   - docType: "paper"
   - authors:
     - name: "Author Name"
       affiliation: "Institution"
   - venue: "Journal/Conference name"
   - publicationYear: YYYY (integer, not string)
   - doi: "DOI if available" (or null)
   - arxivId: null (unless arXiv paper)
   - citationCount: null (unless known)
   - abstract: "Complete abstract text"
   - keywords: ["keyword1", "keyword2"] (inline array format)
   - technologies: ["tech1", "tech2"] (inline array format)
   - url: "${document.source_uri.startsWith('/') ? 'file://' + document.source_uri : document.source_uri}"
   - scraped_at: "${new Date().toISOString()}"
   - word_count: (calculate from extracted content)
   - extraction_quality: "high"

2. Extract COMPLETE paper content including:
   - Full abstract, introduction, methodology, results, conclusions
   - All technical details, preserve mathematical notation
   - Complete references section

3. Content structure:
   - ## Abstract (complete text)
   - ## Introduction (full section)
   - ## Methodology/Methods (complete with technical details)
   - ## Results (all findings, figures, tables descriptions)
   - ## Discussion (complete analysis)
   - ## Conclusions (full conclusions)
   - ## References (complete bibliography)

4. Extract ALL technical content - aim for 3000+ words for typical research papers
5. Preserve mathematical notation, equations, and technical terms
6. Include descriptions of figures, tables, and charts

IMPORTANT: Return ONLY raw markdown starting with YAML frontmatter (---). Use EXACT field names from INGESTION-FORMAT.md.`;
      } else if (isPatent) {
        return `Analyze this patent document file and convert to markdown with proper YAML frontmatter:

File: ${document.source_uri}
Document Type: patent

Requirements:
1. Extract complete content from the document
2. Apply proper YAML frontmatter with all relevant fields for docType "patent"
3. Include metadata enhancements: ${document.metadata_enhancements.join(', ')}
4. Format as clean markdown with proper heading hierarchy
5. CRITICAL: preserve ALL patent claims in complete verbatim form - do not summarize or abbreviate any claims text
6. Extract patent numbers, inventors, assignees, dates

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;
      } else {
        return `Analyze this document file and convert to markdown with proper YAML frontmatter:

File: ${document.source_uri}
Document Type: ${document.document_type}

Requirements:
1. Extract complete content from the document
2. Apply proper YAML frontmatter with all relevant fields for docType "${document.document_type}"
3. Include metadata enhancements: ${document.metadata_enhancements.join(', ')}
4. Format as clean markdown with proper heading hierarchy
5. For local markdown: preserve content but standardize frontmatter

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;
      }
    } else {
      return `Process this document and format as markdown with YAML frontmatter:

Source: ${document.source_uri}
Type: ${document.document_type}

Extract complete content and format according to INGESTION-FORMAT.md specifications with proper metadata.

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add any markdown formatting markers.`;
    }
  }


  private getSubdirectory(docType: string): string {
    // Map both manifest document_type and YAML docType to correct directories
    switch (docType) {
      // Press articles - INGESTION-FORMAT.md docType: "press-article"
      case 'press_article':    // From manifest
      case 'press-article':    // From YAML frontmatter
        return 'articles';

      // Academic papers - INGESTION-FORMAT.md docType: "paper"
      case 'technical_paper':  // From manifest
      case 'paper':           // From YAML frontmatter
        return 'papers';

      // Patents - INGESTION-FORMAT.md docType: "patent"
      case 'patent':
        return 'patents';

      // Notes and markdown files - INGESTION-FORMAT.md docType: "note"
      case 'direct_markdown':  // From manifest
      case 'note':            // From YAML frontmatter
      case 'blog':            // Blog posts
        return 'notes';

      // Local PDFs - assume papers unless specified otherwise
      case 'pdf':
        return 'papers';

      // Books - INGESTION-FORMAT.md docType: "book"
      case 'book':
        return 'books';

      // URLs - INGESTION-FORMAT.md docType: "url"
      case 'url':
        return 'articles';

      default:
        console.warn(`Unknown docType: ${docType}, defaulting to 'articles'`);
        return 'articles'; // Default fallback
    }
  }

  private async generateFilename(document: DocumentEntry, content?: string): Promise<string> {
    // Try to extract date and title from content if available
    if (content) {
      const extractedInfo = this.extractTitleAndDate(content);
      if (extractedInfo.date && extractedInfo.title) {
        const slug = this.createSlugFromTitle(extractedInfo.title);
        const source = this.getSourceFromUrl(document.source_uri);
        return `${extractedInfo.date}-${source}-${slug}.md`;
      }
    }

    // Fallback to URL-based generation
    const url = new URL(document.source_uri.startsWith('http') ? document.source_uri : 'file://' + document.source_uri);
    const domain = url.hostname || 'local';
    const path = url.pathname;

    let slug = path
      .split('/')
      .pop()
      ?.replace(/\.[^/.]+$/, '') // Remove extension
      ?.replace(/[^a-zA-Z0-9-]/g, '-') // Replace non-alphanumeric with dashes
      ?.replace(/-+/g, '-') // Replace multiple dashes with single
      ?.replace(/^-|-$/g, '') // Remove leading/trailing dashes
      || 'document';

    // Add timestamp to ensure uniqueness
    const timestamp = new Date().toISOString().split('T')[0];

    return `${timestamp}-${domain}-${slug}.md`;
  }

  private extractTitleAndDate(content: string): { title?: string; date?: string } {
    const lines = content.split('\n');
    let title: string | undefined;
    let date: string | undefined;

    // Look for YAML frontmatter
    if (lines[0]?.trim() === '---') {
      const yamlEnd = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
      if (yamlEnd > 0) {
        const yamlLines = lines.slice(1, yamlEnd);

        for (const line of yamlLines) {
          const titleMatch = line.match(/^title:\s*["']?([^"']+)["']?/);
          if (titleMatch) {
            title = titleMatch[1].trim();
          }

          const dateMatch = line.match(/^(?:date|published_date|publicationDate):\s*["']?([^"']+)["']?/);
          if (dateMatch) {
            const parsedDate = this.parseDate(dateMatch[1]);
            if (parsedDate) {
              date = parsedDate;
            }
          }
        }
      }
    }

    // If no frontmatter title, look for first H1
    if (!title) {
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) {
        title = h1Match[1].trim();
      }
    }

    // If no date found, try to extract from URL or content
    if (!date) {
      date = this.extractDateFromContent(content);
    }

    return { title, date };
  }

  private parseDate(dateStr: string): string | undefined {
    try {
      // Handle various date formats
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    } catch {
      // Try manual parsing for common formats
      const formats = [
        /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
        /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
        /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
        /(\d{4})-(\d{2})/, // YYYY-MM
      ];

      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          if (format === formats[1]) { // MM/DD/YYYY
            return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          } else if (format === formats[3]) { // YYYY-MM
            return `${match[1]}-${match[2].padStart(2, '0')}-01`;
          } else {
            return `${match[1]}-${match[2].padStart(2, '0')}-${match[3]?.padStart(2, '0') || '01'}`;
          }
        }
      }
    }

    return undefined;
  }

  private extractDateFromContent(content: string): string | undefined {
    // Try to find dates in content (publish dates, article dates, etc.)
    const datePatterns = [
      /published[:\s]+([^,\n]+)/i,
      /date[:\s]+([^,\n]+)/i,
      /(\d{4}-\d{2}-\d{2})/,
      /(\w+\s+\d{1,2},?\s+\d{4})/,
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        const parsed = this.parseDate(match[1]);
        if (parsed) return parsed;
      }
    }

    // Default to current date
    return new Date().toISOString().split('T')[0];
  }

  private createSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and dashes
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Replace multiple dashes with single
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .substring(0, 60); // Limit length
  }

  private getSourceFromUrl(url: string): string {
    try {
      if (url.startsWith('http')) {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace('www.', '');

        // Map common domains to shorter names
        const domainMap: Record<string, string> = {
          'theverge.com': 'the-verge',
          'forbes.com': 'forbes',
          'wired.com': 'wired',
          'techcrunch.com': 'techcrunch',
          'digitaltrends.com': 'digitaltrends',
          'samsung.com': 'samsung',
          'zte.com.cn': 'zte',
          'news.samsung.com': 'samsung',
          'arxiv.org': 'arxiv',
          'patents.google.com': 'google-patents'
        };

        return domainMap[hostname] || hostname.split('.')[0];
      } else {
        // Local file
        return 'local';
      }
    } catch {
      return 'unknown';
    }
  }

  private async writeDocument(filePath: string, content: string, document: DocumentEntry): Promise<void> {
    await this.ensureDirectoryExists(dirname(filePath));
    await writeFile(filePath, content, 'utf-8');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryAttempts) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Retry ${attempt}/${this.retryAttempts} in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getDocumentDisplayName(document: DocumentEntry): string {
    if (document.source_uri.startsWith('http')) {
      try {
        const url = new URL(document.source_uri);
        return `${url.hostname}${url.pathname}`;
      } catch {
        return document.source_uri;
      }
    } else {
      return basename(document.source_uri);
    }
  }

  private printFinalStats(): void {
    const duration = Date.now() - this.stats.startTime.getTime();
    const durationMinutes = Math.round(duration / 60000);

    console.log('\n' + '='.repeat(50));
    console.log('📊 PROCESSING COMPLETE');
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

    console.log(`\n🎯 Success rate: ${Math.round((this.stats.processed / this.stats.total) * 100)}%`);
  }

  private validatePatentClaims(content: string): { isValid: boolean; reason?: string } {
    // Check if content has Claims section
    if (!content.includes('## Claims')) {
      return { isValid: false, reason: 'Missing Claims section header' };
    }

    // Check for placeholder text indicating missing claims
    const claimsPlaceholders = [
      'The user did not provide the claims',
      'claims must be extracted',
      'full, verbatim claims must be',
      'Claims section is missing',
      'No claims found'
    ];

    const hasPlaceholder = claimsPlaceholders.some(placeholder =>
      content.toLowerCase().includes(placeholder.toLowerCase())
    );

    if (hasPlaceholder) {
      return { isValid: false, reason: 'Claims section contains placeholder text instead of actual claims' };
    }

    // Look for numbered claims structure
    const claimsSection = content.split('## Claims')[1];
    if (!claimsSection) {
      return { isValid: false, reason: 'Claims section is empty' };
    }

    // Check for numbered claims (1., 2., etc.)
    const numberedClaimsPattern = /^\s*\d+\.\s+/m;
    if (!numberedClaimsPattern.test(claimsSection)) {
      return { isValid: false, reason: 'No numbered claims found in Claims section' };
    }

    // Count claims - should have at least 1 substantial claim
    const claimMatches = claimsSection.match(/^\s*\d+\.\s+.{20,}/gm);
    if (!claimMatches || claimMatches.length === 0) {
      return { isValid: false, reason: 'No substantial claims found (claims too short)' };
    }

    return { isValid: true };
  }

  private validatePaperFormat(content: string): { isValid: boolean; reason?: string } {
    const requiredFields = [
      'title:', 'docType:', 'authors:', 'venue:',
      'publicationYear:', 'abstract:', 'keywords:', 'technologies:',
      'url:', 'scraped_at:', 'word_count:', 'extraction_quality:'
    ];

    for (const field of requiredFields) {
      if (!content.includes(field)) {
        return { isValid: false, reason: `Missing required field: ${field}` };
      }
    }

    // Check for incorrect field names
    if (content.includes('authorsAffiliations:')) {
      return { isValid: false, reason: 'Found "authorsAffiliations:" instead of required "authors:"' };
    }

    if (content.includes('publication:') && !content.includes('venue:')) {
      return { isValid: false, reason: 'Found "publication:" instead of required "venue:"' };
    }

    if (content.includes('publicationDate:') && !content.includes('publicationYear:')) {
      return { isValid: false, reason: 'Found "publicationDate:" instead of required "publicationYear:"' };
    }

    return { isValid: true };
  }
}

// Main execution
async function main() {
  const manifestPath = process.argv[2] || '/Users/david.fattal/Documents/GitHub/david-gpt/rag-processing-manifest-comprehensive.json';

  // Validate command line arguments
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Document Processing Script

Usage: ${process.argv[1]} [manifest-path]

Arguments:
  manifest-path    Path to processing manifest JSON file
                   (default: rag-processing-manifest-comprehensive.json)

Options:
  --help, -h       Show this help message

Examples:
  ${process.argv[1]}
  ${process.argv[1]} /path/to/custom-manifest.json
`);
    process.exit(0);
  }

  // Validate manifest file exists
  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest file not found: ${manifestPath}`);
    console.error(`💡 Make sure the file exists or provide a valid path.`);
    process.exit(1);
  }

  // Validate gemini CLI is available
  try {
    execSync('which gemini', { stdio: 'ignore' });
  } catch {
    console.error(`❌ Gemini CLI not found in PATH`);
    console.error(`💡 Please install gemini CLI: brew install gemini-cli`);
    process.exit(1);
  }

  const processor = new DocumentProcessor();

  try {
    await processor.processManifest(manifestPath);
    console.log(`\n🎉 Processing pipeline completed successfully!`);
    process.exit(0);
  } catch (error) {
    console.error(`\n💥 Critical error occurred during processing:`);
    console.error(`Error: ${error}`);

    if (error instanceof Error && error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }

    console.error(`\n💡 Check the logs above for specific failures and retry with individual documents if needed.`);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(`❌ Unhandled Promise Rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`❌ Uncaught Exception:`, error);
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ Unexpected error:`, error);
    process.exit(1);
  });
}

export { DocumentProcessor };