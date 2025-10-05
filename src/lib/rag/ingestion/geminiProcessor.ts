/**
 * Gemini-first document processing for RAG ingestion
 * Uses Gemini CLI to directly process PDFs and DOCX with structure preservation
 */

import { execSync } from 'child_process';
import path from 'path';

export type DocumentType = 'patent' | 'release_notes' | 'spec' | 'blog' | 'press' | 'faq' | 'arxiv' | 'technical_note' | 'article' | 'other';

interface WebMetadata {
  identifiers?: Record<string, string>;
  dates?: Record<string, string>;
  actors?: Array<{ name: string; role: string }>;
}

export interface GeminiProcessingResult {
  markdown: string;
  success: boolean;
  error?: string;
  outputPath?: string; // Path where Gemini wrote the file
}

/**
 * Detect document type from filename
 */
export function detectDocumentType(filename: string): DocumentType {
  const lower = filename.toLowerCase();

  // Patent detection
  if (lower.match(/^us\d+/) || lower.includes('patent')) return 'patent';

  // Arxiv detection
  if (lower.match(/\d{4}\.\d{4,5}/) || lower.includes('arxiv')) return 'arxiv';

  // Release notes detection
  if (lower.includes('release') && lower.includes('note')) return 'release_notes';
  if (lower.match(/\d+\.\d+\.\d+/) && lower.includes('note')) return 'release_notes';

  // Spec detection
  if (lower.includes('spec') || lower.includes('specification')) return 'spec';

  // Technical note detection (including LIF and similar format specs)
  if (lower.includes('lif') || lower.includes('lvf') || lower.includes('technical')) return 'technical_note';

  // Blog/press detection
  if (lower.includes('blog') || lower.includes('post')) return 'blog';
  if (lower.includes('press') || lower.includes('release')) return 'press';

  // FAQ detection
  if (lower.includes('faq')) return 'faq';

  return 'other';
}

/**
 * Extract patent number from filename
 */
function extractPatentNumber(filename: string): string | null {
  const match = filename.match(/US(\d+)/i);
  return match ? `US${match[1]}` : null;
}

/**
 * Extract arxiv ID from filename
 */
function extractArxivId(filename: string): string | null {
  const match = filename.match(/(\d{4}\.\d{4,5})/);
  return match ? match[1] : null;
}

/**
 * Fetch metadata from Google Patents using Gemini CLI web search
 */
async function fetchPatentMetadata(patentNumber: string): Promise<WebMetadata | null> {
  console.log(`  Fetching metadata for patent ${patentNumber} from Google Patents...`);

  const url = `https://patents.google.com/patent/${patentNumber}`;
  const prompt = `Visit ${url} and extract ALL available metadata. Pay special attention to:

1. ALL ASSIGNEES including reassignments (look for "Assignee" and "Current Assignee" sections)
2. EXPIRATION DATE (usually calculated as filing date + 20 years for utility patents)
3. All date fields available on the page

Format as JSON:
{
  "identifiers": {
    "patent_number": "US...",
    "application_number": "US.../...",
    "publication_number": "US.../..."
  },
  "dates": {
    "filing": "YYYY-MM-DD",
    "publication": "YYYY-MM-DD",
    "granted": "YYYY-MM-DD",
    "priority": "YYYY-MM-DD",
    "expiration": "YYYY-MM-DD"
  },
  "actors": [
    {"name": "Inventor 1", "role": "inventor"},
    {"name": "Inventor 2", "role": "inventor"},
    {"name": "Original Assignee", "role": "assignee"},
    {"name": "Current Assignee", "role": "current_assignee"}
  ]
}

IMPORTANT:
- Include ALL inventors as separate entries
- Include BOTH original assignee AND current assignee if they differ
- Calculate expiration date if not shown (filing date + 20 years for US utility patents)
- Use null for truly missing fields

Output ONLY valid JSON, no other text.`;

  try {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const result = execSync(`gemini -y '${escapedPrompt}'`, {
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 90000, // Increased to 90 seconds
      stdio: 'pipe',
    });

    // Try to extract JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);
      console.log(`  ✓ Patent metadata fetched successfully`);
      return metadata;
    }

    console.warn(`  ⚠ Could not parse patent metadata response`);
    return null;
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch patent metadata: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fetch metadata from arxiv.org using Gemini CLI web search
 */
async function fetchArxivMetadata(arxivId: string): Promise<WebMetadata | null> {
  console.log(`  Fetching metadata for arxiv paper ${arxivId}...`);

  const url = `https://arxiv.org/abs/${arxivId}`;
  const prompt = `Visit ${url} and extract the following metadata in JSON format:

{
  "identifiers": {
    "arxiv_id": "....",
    "doi": "10.../..." (if available)
  },
  "dates": {
    "submitted": "YYYY-MM-DD",
    "updated": "YYYY-MM-DD (latest version)",
    "published": "YYYY-MM-DD (if published in journal)"
  },
  "actors": [
    {"name": "Author Name", "role": "author"},
    {"name": "Another Author", "role": "author"}
  ]
}

Extract all available information. Use null for missing fields. Output ONLY valid JSON.`;

  try {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const result = execSync(`gemini -y '${escapedPrompt}'`, {
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60000,
      stdio: 'pipe',
    });

    // Try to extract JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);
      console.log(`  ✓ Arxiv metadata fetched successfully`);
      return metadata;
    }

    console.warn(`  ⚠ Could not parse arxiv metadata response`);
    return null;
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch arxiv metadata: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Generate document-type-specific Gemini prompt
 */
function generatePrompt(filePath: string, docType: DocumentType, personaSlug: string, webMetadata?: WebMetadata | null): string {
  const filename = path.basename(filePath);

  // Format web metadata if available
  let metadataSection = '';
  if (webMetadata) {
    metadataSection = `\n\n**IMPORTANT: Use this verified metadata from web sources:**\n`;
    if (webMetadata.identifiers) {
      metadataSection += `\nIdentifiers:\n${JSON.stringify(webMetadata.identifiers, null, 2)}`;
    }
    if (webMetadata.dates) {
      metadataSection += `\nDates:\n${JSON.stringify(webMetadata.dates, null, 2)}`;
    }
    if (webMetadata.actors) {
      metadataSection += `\nActors:\n${JSON.stringify(webMetadata.actors, null, 2)}`;
    }
    metadataSection += `\n\nIncorporate this metadata into the YAML frontmatter.\n`;
  }

  const baseInstructions = `Process this document at: ${filePath}${metadataSection}

Output a complete, well-structured markdown file with:

1. **YAML Frontmatter** (between --- markers at the top):
   - id: (kebab-case from filename, e.g., "us11281020" or "leia-sr-release-notes")
   - title: (extract actual document title, max 100 chars, NO quotes inside the value)
   - date: (YYYY-MM-DD if found, otherwise omit)
   - source_url: (if found, otherwise omit)
   - type: ${docType}
   - personas: [${personaSlug}]
   - summary: (one-sentence abstract of the document)
   - identifiers: (YAML object with document IDs: patent_number, application_number, doi, arxiv_id, etc.)
   - dates: (YAML object with typed dates: filing, publication, priority, expiration, submitted, accepted, etc.)
   - actors: (YAML array of objects with name and role: inventors, authors, assignees, publishers, etc.)

2. **Key Terms Section** (after frontmatter):
   **Key Terms**: List technical terms, acronyms, and important concepts (comma-separated)
   **Also Known As**: Alternative names, synonyms, related terminology

3. **Document Body** with optimal structure for chunking:`;

  // Document-type-specific instructions
  const typeInstructions: Record<DocumentType, string> = {
    patent: `
   - ## Abstract (concise summary, ~200 words)
   - ## Background (prior art and problem statement, ~300-500 words)
   - ## Summary (main innovations, ~300-500 words)
   - ## Detailed Description (technical implementation, split into ### subsections if long)
   - ## Claims (numbered list of patent claims, group related claims)

   Target: Each ## section should be 500-800 words for optimal chunking.
   Preserve all technical details, figures references, and claim language.

   **Structured Metadata Example**:
   identifiers:
     patent_number: US11281020B2
     application_number: US16/234567
     publication_number: US2020/0234567A1

   dates:
     filing: 2020-02-15
     publication: 2022-03-22
     priority: 2019-02-20
     expiration: 2040-02-15

   actors:
     - name: John H. Smith
       role: inventor
     - name: Emily R. Johnson
       role: inventor
     - name: Display Technologies Inc.
       role: assignee`,

    release_notes: `
   - ## Overview (release date, version, brief summary)
   - ## Features (group by major feature categories using ### subsections)
   - ## Bug Fixes (organized by component/area using ### subsections)
   - ## Known Issues (if present)
   - ## Breaking Changes (if present)

   Target: Each ### subsection should be 300-600 words.
   Preserve exact version numbers, dates, and technical identifiers.

   **Structured Metadata Example**:
   identifiers:
     version: 2.5.0
     release_id: v2.5.0-stable
     build_number: "20240315"

   dates:
     released: 2024-03-15
     code_freeze: 2024-03-01
     testing_started: 2024-02-15

   actors:
     - name: Development Team
       role: developer
     - name: Acme Software Inc.
       role: publisher`,

    spec: `
   - Organize into logical sections with ## headings
   - Use ### subsections for detailed topics
   - Include technical specifications, parameters, and requirements
   - Target: Each ## section should be 500-800 words

   Preserve all technical specifications, tables, and parameter definitions.

   **Structured Metadata Example**:
   identifiers:
     spec_id: RFC-9999
     standard_number: ISO/IEC 12345
     version: 3.1

   dates:
     published: 2023-06-15
     approved: 2023-05-20
     submitted: 2022-12-10
     effective: 2024-01-01

   actors:
     - name: Technical Committee
       role: author
     - name: Standards Organization
       role: publisher`,

    blog: `
   - ## Introduction (engaging hook, ~200 words)
   - ## Main content (split into 2-4 ## sections by topic, ~500 words each)
   - ## Conclusion (key takeaways, ~200 words)

   Maintain conversational tone while preserving technical accuracy.

   **Structured Metadata Example**:
   identifiers:
     post_id: blog-2024-03-15
     slug: understanding-quantum-computing

   dates:
     published: 2024-03-15
     updated: 2024-03-20

   actors:
     - name: Jane Doe
       role: author
     - name: Tech Blog
       role: publisher`,

    press: `
   - ## Headline Summary
   - ## Key Announcements (bulleted list)
   - ## Details (expand on announcements, ~400-600 words)
   - ## About [Company/Product] (if present)
   - ## Contact Information (if present)

   **Structured Metadata Example**:
   identifiers:
     press_release_id: PR-2024-03-15
     media_id: "12345"

   dates:
     released: 2024-03-15
     embargo_lifted: 2024-03-15

   actors:
     - name: Acme Corporation
       role: publisher
     - name: John Smith
       role: contact`,

    faq: `
   - Organize questions by topic using ## headings
   - Format as ### Question followed by answer paragraph
   - Target: 3-5 Q&A pairs per topic section

   Preserve exact question wording and comprehensive answers.

   **Structured Metadata Example**:
   identifiers:
     faq_id: product-faq-v2
     document_id: FAQ-2024-001

   dates:
     published: 2024-03-01
     updated: 2024-03-15

   actors:
     - name: Support Team
       role: author
     - name: Product Division
       role: publisher`,

    arxiv: `
   - ## Abstract (concise summary from paper, ~200 words)
   - ## Introduction (problem context, motivation, related work, ~500-800 words)
   - ## Methodology (approach and methods, split into ### subsections, ~800-1200 words)
   - ## Results (findings and evaluation, use ### subsections, ~600-1000 words)
   - ## Discussion (interpretation and implications, ~400-600 words)
   - ## Conclusion (summary and future work, ~300-400 words)

   Target: Each ## section should be 500-1000 words for optimal chunking.
   Preserve all mathematical formulas, equations, algorithms, and technical notation.
   Include figure references and table descriptions.

   **Structured Metadata Example**:
   identifiers:
     arxiv_id: 2403.12345
     doi: 10.1234/example.2024
     publication_id: "Conference 2024"

   dates:
     submitted: 2024-03-15
     updated: 2024-04-10
     published: 2024-06-01
     accepted: 2024-05-15

   actors:
     - name: Alice Smith
       role: author
     - name: Bob Johnson
       role: author
     - name: University Research Lab
       role: affiliation`,

    technical_note: `
   - ## Overview (brief introduction to the format/technology, ~200-300 words)
   - ## Technical Specifications (organized by feature/component using ### subsections)
   - ## Format Details (data structures, layouts, encodings, ~500-800 words per major component)
   - ## Implementation Guidelines (if present)
   - ## Examples (if present)
   - ## References (related standards, external links)

   Target: Each ## section should be 500-800 words for optimal chunking.
   Preserve all technical details, data structures, field definitions, and code examples.

   **Structured Metadata Example**:
   identifiers:
     format_id: LIF-1.0
     standard_number: "ISO/IEC 12345"
     version: 1.0

   dates:
     published: 2023-03-15
     updated: 2024-01-10
     effective: 2023-06-01

   actors:
     - name: Technical Working Group
       role: author
     - name: Standards Organization
       role: publisher`,

    other: `
   - Create logical section structure with ## headings
   - Use ### subsections for detailed topics
   - Target: Each ## section should be 500-800 words for optimal chunking

   Preserve all content and maintain document flow.

   **Structured Metadata Example** (adapt to document type):
   identifiers:
     document_id: DOC-2024-001
     reference_number: "12345"

   dates:
     created: 2024-03-01
     updated: 2024-03-15

   actors:
     - name: Author Name
       role: author
     - name: Organization Name
       role: publisher`,
  };

  const guidelines = `
4. **Formatting Guidelines**:
   - Use proper markdown: ## for major sections, ### for subsections
   - Break dense paragraphs into readable chunks (3-5 sentences max)
   - Preserve code blocks with language tags: \`\`\`language
   - Maintain tables in markdown table format
   - Keep lists properly formatted (-, 1., etc.)
   - Preserve mathematical formulas and technical notation

5. **Content Preservation**:
   - DO NOT summarize or omit information
   - Preserve all technical terms, acronyms, and specialized vocabulary
   - Keep exact numbers, dates, and references
   - Maintain document flow and logical connections

6. **Chunking Optimization**:
   - Sections should be self-contained semantic units
   - Avoid splitting mid-concept or mid-explanation
   - Each section should provide context for its content
   - Section sizes: aim for 500-800 words per ## section

CRITICAL: Output ONLY the markdown document starting with --- and ending with the last line of content.
DO NOT include:
- Any conversational text or explanations
- Phrases like "Here is the complete markdown" or "Done"
- Any text before the opening --- or after the final content
- Code fences like \`\`\`markdown

Your output must start immediately with the opening --- of the YAML frontmatter.`;

  return baseInstructions + typeInstructions[docType] + guidelines;
}

/**
 * Extract raw text from PDF using pdftotext (fast, deterministic)
 */
function extractPdfText(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (ext !== '.pdf') {
    throw new Error(`Not a PDF file: ${filePath}`);
  }

  try {
    // Use pdftotext for reliable, fast extraction
    const result = execSync(`pdftotext "${filePath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30000, // 30s should be plenty for text extraction
    });

    return result.trim();
  } catch (error) {
    throw new Error(`Failed to extract PDF text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate simplified prompt for pre-extracted text
 * This avoids circular dependency by working with plain text instead of file paths
 */
function generateTextFormattingPrompt(
  rawText: string,
  filename: string,
  docType: DocumentType,
  personaSlug: string,
  webMetadata?: WebMetadata | null
): string {
  // Format web metadata if available
  let metadataSection = '';
  if (webMetadata) {
    metadataSection = `\n\n**IMPORTANT: Use this verified metadata from web sources:**\n`;
    if (webMetadata.identifiers) {
      metadataSection += `\nIdentifiers:\n${JSON.stringify(webMetadata.identifiers, null, 2)}`;
    }
    if (webMetadata.dates) {
      metadataSection += `\nDates:\n${JSON.stringify(webMetadata.dates, null, 2)}`;
    }
    if (webMetadata.actors) {
      metadataSection += `\nActors:\n${JSON.stringify(webMetadata.actors, null, 2)}`;
    }
    metadataSection += `\n\nIncorporate this metadata into the YAML frontmatter.\n`;
  }

  return `Convert the following RAW TEXT into a well-structured markdown document.

SOURCE: ${filename}
TYPE: ${docType}${metadataSection}

RAW TEXT:
---
${rawText}
---

Output a complete, well-structured markdown file with:

1. **YAML Frontmatter** (between --- markers at the top):
   - id: (kebab-case from filename)
   - title: (extract from content, max 100 chars, NO quotes inside)
   - date: (YYYY-MM-DD if found)
   - type: ${docType}
   - personas: [${personaSlug}]
   - summary: (one-sentence abstract)
   - identifiers: (version numbers, IDs, etc.)
   - dates: (release dates, etc.)
   - actors: (developers, publishers, etc.)

2. **Key Terms Section**: Technical terms, acronyms (comma-separated)

3. **Structured Content**: Use ## and ### for hierarchical organization (500-800 words per section)

4. **Preserve ALL content** - do not summarize or omit information

CRITICAL: Output ONLY the markdown starting with --- and ending with the last content line.
NO conversational text, NO code fences, NO explanations.`;
}

/**
 * Process document with Gemini CLI using two-stage approach:
 * 1. Extract text deterministically (pdftotext, docx extraction, etc.)
 * 2. Use Gemini to structure the pre-extracted text
 *
 * This avoids circular dependencies and makes processing faster/more reliable.
 */
export async function processWithGemini(
  filePath: string,
  personaSlug: string,
  outputDir: string,
  docType?: DocumentType
): Promise<GeminiProcessingResult> {
  console.log(`  Processing with Gemini CLI (two-stage approach)...`);

  // Auto-detect document type if not provided
  const detectedType = docType || detectDocumentType(path.basename(filePath));
  console.log(`  Detected type: ${detectedType}`);

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // STAGE 1: Extract raw text deterministically
  console.log(`  Stage 1: Extracting raw text...`);
  let rawText: string;

  try {
    if (ext === '.pdf') {
      rawText = extractPdfText(filePath);
    } else {
      // For non-PDFs, let Gemini handle it directly (fallback to old behavior)
      console.log(`  Non-PDF file, using direct Gemini processing...`);
      return await processWithGeminiDirect(filePath, personaSlug, outputDir, detectedType);
    }

    console.log(`  ✓ Extracted ${rawText.length} characters`);
  } catch (error) {
    console.error(`  ✗ Text extraction failed: ${error}`);
    return {
      markdown: '',
      success: false,
      error: `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Fetch web metadata if applicable
  let webMetadata: WebMetadata | null = null;
  if (detectedType === 'patent') {
    const patentNumber = extractPatentNumber(filename);
    if (patentNumber) {
      webMetadata = await fetchPatentMetadata(patentNumber);
    }
  } else if (detectedType === 'arxiv') {
    const arxivId = extractArxivId(filename);
    if (arxivId) {
      webMetadata = await fetchArxivMetadata(arxivId);
    }
  }

  // STAGE 2: Use Gemini to structure the text
  console.log(`  Stage 2: Formatting with Gemini...`);

  const outputFileName = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md';
  const outputPath = path.join(outputDir, outputFileName);

  const prompt = generateTextFormattingPrompt(rawText, filename, detectedType, personaSlug, webMetadata);
  const fullPrompt = `${prompt}\n\nSave the output to: ${outputPath}`;

  try {
    const escapedPrompt = fullPrompt.replace(/'/g, "'\\''");

    // Increase timeout - large documents can take time to format
    // For 50KB+ documents, Gemini may need 3-5 minutes
    const timeout = 300000; // 5 minutes for large document formatting

    execSync(`gemini -y '${escapedPrompt}'`, {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeout,
      stdio: 'pipe',
    });

    console.log(`  ✓ Gemini formatting complete`);

    // Read the file Gemini created
    const fs = require('fs');
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Gemini did not create expected output file: ${outputPath}`);
    }

    const markdown = fs.readFileSync(outputPath, 'utf-8');

    return {
      markdown: markdown.trim(),
      success: true,
      outputPath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Gemini formatting failed: ${errorMsg}`);

    return {
      markdown: '',
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Direct Gemini processing (original approach for non-PDFs)
 * Kept for backward compatibility with DOCX and other formats
 */
async function processWithGeminiDirect(
  filePath: string,
  personaSlug: string,
  outputDir: string,
  docType: DocumentType
): Promise<GeminiProcessingResult> {
  const filename = path.basename(filePath);

  // Fetch web metadata if applicable
  let webMetadata: WebMetadata | null = null;
  if (docType === 'patent') {
    const patentNumber = extractPatentNumber(filename);
    if (patentNumber) {
      webMetadata = await fetchPatentMetadata(patentNumber);
    }
  } else if (docType === 'arxiv') {
    const arxivId = extractArxivId(filename);
    if (arxivId) {
      webMetadata = await fetchArxivMetadata(arxivId);
    }
  }

  const basePrompt = generatePrompt(filePath, docType, personaSlug, webMetadata);
  const outputFileName = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md';
  const outputPath = path.join(outputDir, outputFileName);

  const fullPrompt = `${basePrompt}\n\nSave the output to: ${outputPath}`;

  try {
    const escapedPrompt = fullPrompt.replace(/'/g, "'\\''");
    const timeout = webMetadata ? 240000 : 180000;

    execSync(`gemini -y '${escapedPrompt}'`, {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeout,
      stdio: 'pipe',
    });

    console.log(`  ✓ Gemini processing complete`);

    const fs = require('fs');
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Gemini did not create expected output file: ${outputPath}`);
    }

    const markdown = fs.readFileSync(outputPath, 'utf-8');

    return {
      markdown: markdown.trim(),
      success: true,
      outputPath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Gemini processing failed: ${errorMsg}`);

    return {
      markdown: '',
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Process document with fallback strategy
 * Tries Gemini first, falls back to basic extraction if Gemini fails
 */
export async function processWithFallback(
  filePath: string,
  personaSlug: string,
  outputDir: string,
  basicExtractor: (path: string) => Promise<string>,
  docType?: DocumentType
): Promise<GeminiProcessingResult> {
  // Try Gemini first
  const geminiResult = await processWithGemini(filePath, personaSlug, outputDir, docType);

  if (geminiResult.success) {
    return geminiResult;
  }

  // Fallback to basic extraction
  console.log(`  Falling back to basic extraction...`);

  try {
    const basicContent = await basicExtractor(filePath);

    return {
      markdown: basicContent,
      success: true,
      error: `Gemini processing failed, used basic extraction: ${geminiResult.error}`,
    };
  } catch (fallbackError) {
    return {
      markdown: '',
      success: false,
      error: `Both Gemini and basic extraction failed. Gemini: ${geminiResult.error}, Basic: ${fallbackError}`,
    };
  }
}

/**
 * Validate Gemini output has proper frontmatter
 */
export function validateGeminiOutput(markdown: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for frontmatter
  if (!markdown.startsWith('---')) {
    errors.push('Missing YAML frontmatter (should start with ---)');
  }

  // Check for frontmatter end
  const secondDelimiter = markdown.indexOf('---', 3);
  if (secondDelimiter === -1) {
    errors.push('Incomplete YAML frontmatter (missing closing ---)');
  }

  // Check for required fields in frontmatter
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    if (!frontmatter.includes('id:')) errors.push('Missing id field in frontmatter');
    if (!frontmatter.includes('title:')) errors.push('Missing title field in frontmatter');
    if (!frontmatter.includes('type:')) errors.push('Missing type field in frontmatter');
    if (!frontmatter.includes('personas:')) errors.push('Missing personas field in frontmatter');
  }

  // Check for content after frontmatter
  if (secondDelimiter !== -1) {
    const content = markdown.substring(secondDelimiter + 3).trim();
    if (content.length < 100) {
      errors.push('Document body is suspiciously short (< 100 chars)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}