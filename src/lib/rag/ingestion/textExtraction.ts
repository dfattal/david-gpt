/**
 * Text extraction utilities for RAG document processing
 * Supports PDF, HTML, and plain text/markdown formats
 */

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export type FileType = 'pdf' | 'html' | 'markdown' | 'text' | 'docx' | 'unknown';

/**
 * Detect file type from extension
 */
export function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') return 'pdf';
  if (['.html', '.htm'].includes(ext)) return 'html';
  if (['.md', '.markdown'].includes(ext)) return 'markdown';
  if (['.txt', '.text'].includes(ext)) return 'text';
  if (['.docx', '.doc'].includes(ext)) return 'docx';

  return 'unknown';
}

/**
 * Extract text from PDF file
 */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract PDF text from ${filePath}: ${error}`);
  }
}

/**
 * Extract text from HTML file
 * Simple approach: strip HTML tags and decode entities
 * For production, consider using a proper HTML parser like cheerio or jsdom
 */
export async function extractHtmlText(filePath: string): Promise<string> {
  try {
    const html = await fs.readFile(filePath, 'utf-8');

    // Remove script and style elements
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Replace common HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Normalize whitespace
    text = text
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  } catch (error) {
    throw new Error(`Failed to extract HTML text from ${filePath}: ${error}`);
  }
}

/**
 * Read plain text or markdown file
 */
export async function extractPlainText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read text file ${filePath}: ${error}`);
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to extract DOCX text from ${filePath}: ${error}`);
  }
}

/**
 * Main extraction function - routes to appropriate extractor
 */
export async function extractText(filePath: string): Promise<string> {
  const fileType = detectFileType(filePath);

  switch (fileType) {
    case 'pdf':
      return extractPdfText(filePath);
    case 'html':
      return extractHtmlText(filePath);
    case 'docx':
      return extractDocxText(filePath);
    case 'markdown':
    case 'text':
      return extractPlainText(filePath);
    default:
      // Try plain text as fallback
      return extractPlainText(filePath);
  }
}

/**
 * Batch extract text from multiple files
 */
export async function extractTextBatch(
  filePaths: string[]
): Promise<Array<{ filePath: string; text: string; error?: string }>> {
  const results = await Promise.allSettled(
    filePaths.map(async (filePath) => ({
      filePath,
      text: await extractText(filePath),
    }))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        filePath: filePaths[index],
        text: '',
        error: result.reason.message,
      };
    }
  });
}