/**
 * Complete PDF extraction pipeline orchestrator
 * Coordinates: extraction → normalization → chunking → formatting → assembly
 *
 * For patents: supports direct HTML extraction from Google Patents
 */

import { extractPdfContent } from './pdfExtractor';
import { normalizeText } from './textNormalizer';
import { chunkPages, smartChunk } from './chunker';
import { formatChunks } from './geminiFormatter';
import { assembleDocument, validateAssembledDocument, WebMetadata } from './documentAssembler';
import { detectDocumentType, DocumentType } from '../ingestion/geminiProcessor';
import { fetchArxivMetadata, fetchPatentMetadata } from './webMetadataFetcher';
import { generateDocumentSummary, DocumentSummary } from './summaryGenerator';
import { extractPatentFromHtml } from './patentHtmlExtractor';
import { formatPatentDocument } from './patentHtmlFormatter';
import { extractPatentWithGemini } from './patentGeminiExtractor';
import { formatPatentMarkdown } from './patentGeminiFormatter';
import path from 'path';

/**
 * Normalize patent number to Google Patents format
 * Handles: US/WO/EP/CN/JP patents, applications, URLs, with/without suffixes
 */
function normalizePatentNumber(input: string): string | null {
  // Extract from URL if provided
  const urlMatch = input.match(/patents\.google\.com\/patent\/([A-Z]{2}[0-9A-Z]+)/i);
  if (urlMatch) {
    input = urlMatch[1];
  }

  // Remove common suffixes (B1, B2, A1, A2, etc.) - Google Patents works without them
  input = input.replace(/[AB][12]$/i, '');

  // Match country code + number pattern
  // Supports: US, WO, EP, CN, JP, KR, TW, etc.
  const patentMatch = input.match(/^([A-Z]{2})(\d+)$/i);
  if (!patentMatch) {
    return null;
  }

  const countryCode = patentMatch[1].toUpperCase();
  let number = patentMatch[2];

  // Special handling for US applications (format: US2013052774 → US20130052774)
  if (countryCode === 'US' && number.length === 10 && number.startsWith('20')) {
    // Already in correct application format (US20130052774)
    return `${countryCode}${number}`;
  } else if (countryCode === 'US' && number.length === 10 && /^[12]\d{9}$/.test(number)) {
    // Application format without leading zero (US2013052774 → US20130052774)
    const year = number.substring(0, 4);
    const appNum = number.substring(4);
    return `${countryCode}${year}0${appNum}`;
  } else {
    // Standard granted patent or other formats
    return `${countryCode}${number}`;
  }
}

export interface PipelineResult {
  success: boolean;
  markdown?: string;
  stats?: {
    totalChunks: number;
    totalPages: number;
    originalChars: number;
    formattedChars: number;
    retentionRatio: number;
  };
  validation?: {
    valid: boolean;
    warnings: string[];
    errors: string[];
  };
  error?: string;
}

/**
 * Main pipeline orchestrator
 * Supports both PDF paths and patent numbers (e.g., "US11281020")
 */
export async function processPdfDocument(
  pdfPath: string | Buffer,
  personaSlugs: string[],
  geminiApiKey: string,
  docType?: DocumentType,
  exaApiKey?: string
): Promise<PipelineResult> {
  const filename = typeof pdfPath === 'string' ? path.basename(pdfPath) : 'document.pdf';

  try {
    // Check if input is a patent number or URL
    if (typeof pdfPath === 'string') {
      const normalizedPatent = normalizePatentNumber(pdfPath);
      if (normalizedPatent) {
        console.log(`\n🔍 Detected patent: ${normalizedPatent}, using HTML extraction`);
        return await processPatentFromHtml(normalizedPatent, personaSlugs, geminiApiKey);
      }

      // Check if PDF filename indicates patent - try HTML extraction first
      const pdfPatentMatch = filename.match(/US(\d{7,})/i);
      if (pdfPatentMatch && (docType === 'patent' || !docType)) {
        const patentNumber = `US${pdfPatentMatch[1]}`;
        console.log(`\n🔍 Patent PDF detected, attempting HTML extraction for: ${patentNumber}`);
        try {
          return await processPatentFromHtml(patentNumber, personaSlugs, geminiApiKey);
        } catch (error) {
          console.log(`  ⚠️ HTML extraction failed, falling back to PDF: ${error}`);
          // Continue with PDF extraction below
        }
      }
    }

    console.log(`\n📄 Starting PDF extraction pipeline for: ${filename}`);

    // Step 1: Extract raw text with pdfjs-dist
    console.log('  [1/7] Extracting PDF text...');
    const extracted = await extractPdfContent(pdfPath);
    console.log(`  ✓ Extracted ${extracted.totalPages} pages, ${extracted.pages.reduce((sum, p) => sum + p.text.length, 0)} chars`);

    // Step 2: Normalize text (heuristics pass)
    console.log('  [2/7] Normalizing text (join hyphenations, rebuild paragraphs)...');
    const normalized = normalizeText(extracted.pages);
    const normalizedChars = normalized.reduce((sum, p) => sum + p.normalizedText.length, 0);
    console.log(`  ✓ Normalized to ${normalizedChars} chars`);

    // Step 3: Detect document type
    const detectedType = docType || detectDocumentType(filename);
    console.log(`  [3/7] Detected type: ${detectedType}`);

    // Step 3.5: Generate global document summary and key terms
    console.log('  [3.5/7] Generating document summary and key terms...');
    const globalSummary = await generateDocumentSummary(normalized, detectedType, geminiApiKey);
    console.log(`  ✓ Generated summary and ${globalSummary.keyTerms.length} key terms`);

    // Step 4: Fetch web metadata (using Gemini API for smart extraction)
    console.log('  [4/7] Fetching web metadata...');
    const webMetadata = await fetchWebMetadata(filename, detectedType, exaApiKey, geminiApiKey);
    if (webMetadata) {
      console.log(`  ✓ Fetched metadata from web`);
    } else {
      console.log(`  ℹ No web metadata available`);
    }

    // Step 5: Chunk into manageable segments
    console.log('  [5/7] Chunking text (~2-3k chars per chunk)...');
    // Use smart chunking for patents to avoid breaking claims
    const chunks = detectedType === 'patent' ? smartChunk(normalized) : chunkPages(normalized);
    console.log(`  ✓ Created ${chunks.length} chunks (avg ${Math.round(chunks.reduce((sum, c) => sum + c.charCount, 0) / chunks.length)} chars/chunk)`);

    // Step 6: Format chunks with Gemini API
    console.log('  [6/7] Formatting chunks with Gemini API...');
    const formatted = await formatChunks(chunks, detectedType, geminiApiKey);
    console.log(`  ✓ Formatted ${formatted.length} chunks`);

    // Step 7: Assemble final document
    console.log('  [7/7] Assembling final markdown...');
    const assembled = assembleDocument(
      formatted,
      detectedType,
      filename,
      personaSlugs,
      webMetadata,
      extracted.metadata,
      globalSummary
    );
    console.log(`  ✓ Assembled document: ${assembled.stats.formattedChars} chars (${(assembled.stats.retentionRatio * 100).toFixed(1)}% retention)`);

    // Validate
    const validation = validateAssembledDocument(assembled);
    if (!validation.valid) {
      console.error('  ⚠ Validation errors:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('  ⚠ Validation warnings:', validation.warnings);
    }

    console.log('✅ Pipeline complete\n');

    return {
      success: true,
      markdown: assembled.markdown,
      stats: assembled.stats,
      validation,
    };
  } catch (error) {
    console.error('❌ Pipeline failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch web metadata for patents and arxiv papers using Gemini (primary) and regex (fallback)
 */
async function fetchWebMetadata(
  filename: string,
  docType: DocumentType,
  exaApiKey?: string,
  geminiApiKey?: string
): Promise<WebMetadata | null> {
  // We need either EXA or Gemini API key
  if (!exaApiKey && !geminiApiKey) {
    console.log(`  ℹ No API keys provided, skipping web metadata fetch`);
    return null;
  }

  if (docType === 'patent') {
    const patentNumber = extractPatentNumber(filename);
    if (patentNumber) {
      return await fetchPatentMetadata(patentNumber, exaApiKey || '', geminiApiKey);
    }
  } else if (docType === 'arxiv') {
    const arxivId = extractArxivId(filename);
    if (arxivId) {
      return await fetchArxivMetadata(arxivId, exaApiKey || '', geminiApiKey);
    }
  }

  return null;
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
 * Process patent from Google Patents HTML using Gemini-based extraction
 */
async function processPatentFromHtml(
  patentNumber: string,
  personaSlugs: string[],
  geminiApiKey: string
): Promise<PipelineResult> {
  try {
    // Step 1: Extract structured data from HTML with Gemini
    console.log('  [1/2] Extracting structured data with Gemini...');
    const patentData = await extractPatentWithGemini(patentNumber, geminiApiKey);
    console.log(`  ✓ Extracted: ${patentData.claims.length} claims, ${patentData.figures.length} figures`);

    // Step 2: Format to clean markdown with Gemini
    console.log('  [2/2] Formatting markdown with Gemini...');
    const sourceUrl = `https://patents.google.com/patent/${patentNumber}`;
    const markdown = await formatPatentMarkdown(patentData, personaSlugs, geminiApiKey, undefined, undefined, sourceUrl);
    console.log(`  ✓ Formatted document: ${markdown.length.toLocaleString()} chars`);

    console.log('✅ Gemini-based HTML extraction complete\n');

    return {
      success: true,
      markdown,
      stats: {
        totalChunks: 1, // No chunking for HTML extraction
        totalPages: 1,
        originalChars: markdown.length,
        formattedChars: markdown.length,
        retentionRatio: 1.0,
      },
    };
  } catch (error) {
    throw new Error(`Patent HTML extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

