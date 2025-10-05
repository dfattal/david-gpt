/**
 * PDF Text Extraction using pdf-parse
 * Extracts text per page using a simpler, more reliable approach
 */

import pdf from 'pdf-parse';
import * as fs from 'fs/promises';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  items: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface PdfExtractionResult {
  pages: ExtractedPage[];
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  totalPages: number;
}

/**
 * Extract text and metadata from PDF using pdf-parse
 */
export async function extractPdfContent(pdfPath: string | Buffer): Promise<PdfExtractionResult> {
  // Read PDF data
  const dataBuffer = typeof pdfPath === 'string'
    ? await fs.readFile(pdfPath)
    : pdfPath;

  // Parse PDF
  const data = await pdf(dataBuffer, {
    // Extract page-by-page
    pagerender: async (pageData: any) => {
      const renderOptions = {
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      };
      return pageData.getTextContent(renderOptions).then((textContent: any) => {
        const text = textContent.items.map((item: any) => item.str).join(' ');
        return text;
      });
    },
  });

  // Extract metadata
  const info = data.info || {};
  const extractedMetadata = {
    title: info.Title,
    author: info.Author,
    subject: info.Subject,
    keywords: info.Keywords,
    creator: info.Creator,
    producer: info.Producer,
    creationDate: info.CreationDate ? parsePdfDate(info.CreationDate) : undefined,
    modificationDate: info.ModDate ? parsePdfDate(info.ModDate) : undefined,
  };

  // Split text into pages (pdf-parse gives us full text, we need to estimate page breaks)
  const totalPages = data.numpages;
  const fullText = data.text;

  // Estimate text per page (simple division)
  const charsPerPage = Math.ceil(fullText.length / totalPages);
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < totalPages; i++) {
    const startIdx = i * charsPerPage;
    const endIdx = Math.min((i + 1) * charsPerPage, fullText.length);
    const pageText = fullText.substring(startIdx, endIdx);

    pages.push({
      pageNumber: i + 1,
      text: pageText,
      items: [], // pdf-parse doesn't provide position info, so items array is empty
    });
  }

  return {
    pages,
    metadata: extractedMetadata,
    totalPages,
  };
}

/**
 * Parse PDF date format (D:YYYYMMDDHHmmSS)
 */
function parsePdfDate(dateString: string): Date | undefined {
  const match = dateString.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}
