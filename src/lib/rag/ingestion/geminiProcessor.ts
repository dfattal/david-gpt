/**
 * Gemini-first document processing for RAG ingestion
 * Uses Gemini CLI to directly process PDFs and DOCX with structure preservation
 */

import { execSync } from 'child_process';
import path from 'path';

export type DocumentType = 'patent' | 'release_notes' | 'spec' | 'blog' | 'press' | 'faq' | 'other';

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

  // Release notes detection
  if (lower.includes('release') && lower.includes('note')) return 'release_notes';
  if (lower.match(/\d+\.\d+\.\d+/) && lower.includes('note')) return 'release_notes';

  // Spec detection
  if (lower.includes('spec') || lower.includes('specification')) return 'spec';

  // Blog/press detection
  if (lower.includes('blog') || lower.includes('post')) return 'blog';
  if (lower.includes('press') || lower.includes('release')) return 'press';

  // FAQ detection
  if (lower.includes('faq')) return 'faq';

  return 'other';
}

/**
 * Generate document-type-specific Gemini prompt
 */
function generatePrompt(filePath: string, docType: DocumentType, personaSlug: string): string {
  const filename = path.basename(filePath);
  const baseInstructions = `Process this document at: ${filePath}

Output a complete, well-structured markdown file with:

1. **YAML Frontmatter** (between --- markers at the top):
   - id: (kebab-case from filename, e.g., "us11281020" or "leia-sr-release-notes")
   - title: (extract actual document title, max 100 chars, NO quotes inside the value)
   - date: (YYYY-MM-DD if found, otherwise omit)
   - source_url: (if found, otherwise omit)
   - type: ${docType}
   - personas: [${personaSlug}]
   - summary: (one-sentence abstract of the document)

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
   Preserve all technical details, figures references, and claim language.`,

    release_notes: `
   - ## Overview (release date, version, brief summary)
   - ## Features (group by major feature categories using ### subsections)
   - ## Bug Fixes (organized by component/area using ### subsections)
   - ## Known Issues (if present)
   - ## Breaking Changes (if present)

   Target: Each ### subsection should be 300-600 words.
   Preserve exact version numbers, dates, and technical identifiers.`,

    spec: `
   - Organize into logical sections with ## headings
   - Use ### subsections for detailed topics
   - Include technical specifications, parameters, and requirements
   - Target: Each ## section should be 500-800 words

   Preserve all technical specifications, tables, and parameter definitions.`,

    blog: `
   - ## Introduction (engaging hook, ~200 words)
   - ## Main content (split into 2-4 ## sections by topic, ~500 words each)
   - ## Conclusion (key takeaways, ~200 words)

   Maintain conversational tone while preserving technical accuracy.`,

    press: `
   - ## Headline Summary
   - ## Key Announcements (bulleted list)
   - ## Details (expand on announcements, ~400-600 words)
   - ## About [Company/Product] (if present)
   - ## Contact Information (if present)`,

    faq: `
   - Organize questions by topic using ## headings
   - Format as ### Question followed by answer paragraph
   - Target: 3-5 Q&A pairs per topic section

   Preserve exact question wording and comprehensive answers.`,

    other: `
   - Create logical section structure with ## headings
   - Use ### subsections for detailed topics
   - Target: Each ## section should be 500-800 words for optimal chunking

   Preserve all content and maintain document flow.`,
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
 * Process document with Gemini CLI
 * Returns the path to the generated file (Gemini creates it directly)
 */
export async function processWithGemini(
  filePath: string,
  personaSlug: string,
  outputDir: string,
  docType?: DocumentType
): Promise<GeminiProcessingResult> {
  console.log(`  Processing with Gemini CLI...`);

  // Auto-detect document type if not provided
  const detectedType = docType || detectDocumentType(path.basename(filePath));
  console.log(`  Detected type: ${detectedType}`);

  // Generate prompt with explicit output path instruction
  const basePrompt = generatePrompt(filePath, detectedType, personaSlug);
  const outputFileName = path.basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md';
  const outputPath = path.join(outputDir, outputFileName);

  const fullPrompt = `${basePrompt}\n\nSave the output to: ${outputPath}`;

  try {
    // Execute Gemini CLI with non-interactive mode
    // Gemini will write the file directly
    const escapedPrompt = fullPrompt.replace(/'/g, "'\\''");

    execSync(`gemini -y '${escapedPrompt}'`, {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large documents
      timeout: 120000, // 2 minutes timeout
      stdio: 'pipe', // Capture output but we won't use it
    });

    console.log(`  ✓ Gemini processing complete`);

    // Read the file Gemini created
    const fs = require('fs');
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Gemini did not create expected output file: ${outputPath}`);
    }

    const markdown = fs.readFileSync(outputPath, 'utf-8');

    return {
      markdown: markdown.trim(),
      success: true,
      outputPath, // Return the path so caller knows where file is
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