/**
 * Gemini API-based chunk formatting
 * Clean, normalize, and format chunks to markdown
 */

import { ContentChunk } from './chunker';
import { DocumentType } from '../ingestion/geminiProcessor';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

export interface FormattedChunk {
  markdown: string;
  pageRange: {
    start: number;
    end: number;
  };
  originalCharCount: number;
  formattedCharCount: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Format a single chunk using Gemini API
 */
export async function formatChunk(
  chunk: ContentChunk,
  docType: DocumentType,
  apiKey: string
): Promise<FormattedChunk> {
  const prompt = generateChunkPrompt(chunk, docType);

  try {
    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt,
          }],
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistency
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GeminiResponse;
    let formattedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!formattedText) {
      throw new Error('Empty response from Gemini API');
    }

    // Clean up markdown fence artifacts (Gemini sometimes wraps output in ```markdown)
    formattedText = formattedText.replace(/^```markdown\s*\n?/i, '').replace(/\n?```\s*$/i, '');

    return {
      markdown: formattedText.trim(),
      pageRange: chunk.pageRange,
      originalCharCount: chunk.charCount,
      formattedCharCount: formattedText.length,
    };
  } catch (error) {
    throw new Error(`Failed to format chunk (pages ${chunk.pageRange.start}-${chunk.pageRange.end}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Format all chunks sequentially with rate limiting and retries
 */
export async function formatChunks(
  chunks: ContentChunk[],
  docType: DocumentType,
  apiKey: string,
  maxConcurrent = 1 // Process one at a time to avoid rate limits
): Promise<FormattedChunk[]> {
  const results: FormattedChunk[] = [];

  // Process sequentially with delays and retries
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Retry logic for rate limits
    let attempt = 0;
    const maxAttempts = 3;
    let formatted: FormattedChunk | null = null;

    while (attempt < maxAttempts && !formatted) {
      try {
        formatted = await formatChunk(chunk, docType, apiKey);
        results.push(formatted);
      } catch (error) {
        attempt++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('429') && attempt < maxAttempts) {
          // Rate limited, wait longer and retry
          const waitTime = 2000 * attempt; // Exponential backoff: 2s, 4s, 6s
          console.log(`  ⚠ Rate limit hit, retrying in ${waitTime}ms (attempt ${attempt}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          throw error; // Re-throw if not rate limit or max attempts reached
        }
      }
    }

    // Add delay between chunks (even successful ones) to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s between chunks
    }
  }

  return results;
}

/**
 * Generate prompt for chunk formatting
 */
function generateChunkPrompt(chunk: ContentChunk, docType: DocumentType): string {
  const typeInstructions = getDocTypeInstructions(docType);

  return `You are a technical document formatter. Your task is to clean, normalize, and format the following text chunk into well-structured markdown.

**INPUT TEXT (Pages ${chunk.pageRange.start}-${chunk.pageRange.end}):**
${chunk.content}

**INSTRUCTIONS:**
1. Clean and normalize the text:
   - Fix OCR errors and obvious typos
   - Normalize whitespace and line breaks
   - Remove redundant headers/footers
   - Preserve ALL meaningful content

2. Structure with markdown:
   ${typeInstructions}
   - Use ## for major sections, ### for subsections
   - **CRITICAL: DO NOT create headings from page numbers (e.g., "Page 7", "Page 11") - remove these entirely**
   - Format lists properly (-, 1., etc.)
   - Use **bold** for emphasis, *italic* for terms
   - **TABLES: Preserve tables EXACTLY as they appear - do NOT reformat, do NOT add commentary like "Here's a table...", do NOT change column structure. If a table is incomplete or continues across pages, preserve it as-is with a note [Table continues]**
   - Preserve code blocks with \`\`\`language
   - Keep mathematical formulas and equations

3. Content preservation:
   - DO NOT summarize or omit information
   - DO NOT truncate content mid-sentence or mid-section
   - Preserve technical terms, numbers, references
   - Keep exact quotes and citations
   - Maintain logical flow
   - If content continues to next chunk, end with [continues] note

4. Quality guidelines:
   - Break dense paragraphs (3-5 sentences max)
   - Ensure readability while preserving completeness
   - Use appropriate heading levels

**OUTPUT REQUIREMENTS:**
- Output ONLY the formatted markdown
- NO conversational text, NO explanations
- Start directly with content (no preamble)
- If the content has little informational value, summarize it briefly but note that it's a summary

Begin your formatted markdown output now:`;
}

/**
 * Get document-type-specific formatting instructions
 */
function getDocTypeInstructions(docType: DocumentType): string {
  const instructions: Record<DocumentType, string> = {
    patent: `
   - **CRITICAL: Preserve claim structure EXACTLY - claims MUST remain as numbered lists (1., 2., etc.)**
   - **DO NOT break or reformat claims - preserve the complete numbered sequence**
   - **DO NOT truncate claims mid-sentence - if a claim continues beyond this chunk, preserve ALL text up to the continuation point and note [continues]**
   - **If this chunk starts mid-claim (continuation from previous chunk), start with the continuation text WITHOUT adding a new claim number**
   - **DO NOT create a "## Claims" heading unless this chunk contains "The invention claimed is:" or "What is claimed is:"**
   - Keep figure references (Fig. 1, Figure 2A, etc.)
   - Maintain technical terminology exactly
   - Preserve claim dependencies and references`,

    arxiv: `
   - Preserve section hierarchy (Abstract, Introduction, etc.)
   - Keep mathematical notation and equations
   - Maintain figure/table references
   - Preserve citations [1], [2], etc.`,

    release_notes: `
   - Organize by category (Features, Bug Fixes, etc.)
   - Preserve version numbers and IDs
   - Keep bullet lists for changes
   - Maintain chronological order`,

    technical_note: `
   - Preserve specifications and parameters
   - Keep data structures and field definitions
   - Maintain code examples with syntax highlighting
   - Preserve technical diagrams descriptions`,

    spec: `
   - Preserve technical specifications exactly
   - Keep parameter tables and definitions
   - Maintain requirement numbering
   - Preserve conformance criteria`,

    blog: `
   - Maintain conversational tone
   - Preserve examples and analogies
   - Keep section flow
   - Maintain code snippets`,

    press: `
   - Preserve quotes exactly
   - Keep key announcements prominent
   - Maintain company names and titles
   - Preserve contact information`,

    faq: `
   - Format as Q&A pairs
   - Use ### for questions
   - Keep answers complete
   - Maintain categorization`,

    other: `
   - Create logical section structure
   - Preserve document flow
   - Maintain all content`,
  };

  return instructions[docType] || instructions.other;
}
