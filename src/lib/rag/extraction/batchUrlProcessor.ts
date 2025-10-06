/**
 * Batch URL Processing Pipeline
 * Processes multiple URLs with metadata injection and progress tracking
 */

import { analyzeUrl } from './urlRouter';
import { extractPatentWithGemini } from './patentGeminiExtractor';
import { formatPatentMarkdown } from './patentGeminiFormatter';
import { extractArxivFromHtml } from './arxivHtmlExtractor';
import { formatArxivAsMarkdown } from './arxivMarkdownFormatter';
import type { ParsedUrlItem } from './urlListParser';

export interface ProcessingProgress {
  currentIndex: number;
  totalCount: number;
  currentUrl: string;
  status: 'processing' | 'completed' | 'failed';
}

export interface ProcessingResult {
  url: string;
  success: boolean;
  filename?: string;
  markdown?: string;
  error?: string;
  stats?: {
    documentType: string;
    identifier?: string;
    contentChars?: number;
    sections?: number;
    claims?: number;
    authors?: number;
  };
}

export interface BatchProcessingResult {
  results: ProcessingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface BatchProcessingOptions {
  personaSlugs: string[];
  geminiApiKey: string;
  onProgress?: (progress: ProcessingProgress) => void;
  delayMs?: number; // Delay between requests (default: 2000ms)
}

/**
 * Process a batch of URLs with optional metadata injection
 */
export async function processBatchUrls(
  items: ParsedUrlItem[],
  options: BatchProcessingOptions
): Promise<BatchProcessingResult> {
  const { personaSlugs, geminiApiKey, onProgress, delayMs = 2000 } = options;
  const results: ProcessingResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Notify progress
    onProgress?.({
      currentIndex: i,
      totalCount: items.length,
      currentUrl: item.url,
      status: 'processing',
    });

    // Process single URL
    const result = await processSingleUrl(item, personaSlugs, geminiApiKey);
    results.push(result);

    // Notify completion/failure
    onProgress?.({
      currentIndex: i,
      totalCount: items.length,
      currentUrl: item.url,
      status: result.success ? 'completed' : 'failed',
    });

    // Add delay between requests (except for last item)
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Calculate summary
  const summary = {
    total: items.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  };

  return { results, summary };
}

/**
 * Process a single URL with metadata injection
 */
async function processSingleUrl(
  item: ParsedUrlItem,
  personaSlugs: string[],
  geminiApiKey: string
): Promise<ProcessingResult> {
  try {
    // Analyze URL
    const analysis = analyzeUrl(item.url);

    let markdown: string;
    let filename: string;
    const stats: ProcessingResult['stats'] = {
      documentType: analysis.type,
      identifier: analysis.identifier,
    };

    // Route to appropriate extractor
    if (analysis.type === 'patent') {
      if (!analysis.identifier) {
        throw new Error('Could not extract patent number from URL');
      }

      // Extract patent
      const patentData = await extractPatentWithGemini(analysis.identifier, geminiApiKey);

      // Format as markdown with metadata injection
      const sourceUrl = `https://patents.google.com/patent/${analysis.identifier}`;
      markdown = await formatPatentMarkdown(
        patentData,
        personaSlugs,
        geminiApiKey,
        item.keyTerms,
        item.alsoKnownAs,
        sourceUrl
      );

      filename = `${analysis.identifier.toLowerCase()}.md`;
      stats.contentChars = markdown.length;
      stats.claims = patentData.claims.length;

    } else if (analysis.type === 'arxiv') {
      if (!analysis.identifier) {
        throw new Error('Could not extract ArXiv ID from URL');
      }

      // Extract ArXiv paper
      const paperData = await extractArxivFromHtml(analysis.identifier, geminiApiKey);

      // Format as markdown with metadata injection
      const formatted = formatArxivAsMarkdown(
        paperData,
        personaSlugs,
        item.keyTerms,
        item.alsoKnownAs
      );
      markdown = formatted.markdown;

      filename = `${analysis.identifier.replace(/\./g, '-')}.md`;
      stats.contentChars = formatted.stats.contentChars;
      stats.sections = formatted.stats.sections;
      stats.authors = formatted.stats.authors;

    } else {
      throw new Error(`Document type "${analysis.type}" not yet supported`);
    }

    return {
      url: item.url,
      success: true,
      filename,
      markdown,
      stats,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      url: item.url,
      success: false,
      error: errorMsg,
    };
  }
}
