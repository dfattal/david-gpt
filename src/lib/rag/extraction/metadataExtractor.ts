/**
 * Extract metadata from document content
 * For arxiv papers, patents, etc. when web sources aren't available
 */

import { DocumentType } from '../ingestion/geminiProcessor';
import { WebMetadata } from './documentAssembler';

/**
 * Extract metadata from the first chunk of content
 */
export function extractMetadataFromContent(
  firstChunkText: string,
  docType: DocumentType,
  filename: string
): WebMetadata | null {
  if (docType === 'arxiv') {
    return extractArxivMetadata(firstChunkText, filename);
  } else if (docType === 'patent') {
    return extractPatentMetadata(firstChunkText, filename);
  }

  return null;
}

/**
 * Extract arxiv paper metadata from content
 */
function extractArxivMetadata(text: string, filename: string): WebMetadata | null {
  const metadata: WebMetadata = {
    identifiers: {},
    dates: {},
    actors: [],
  };

  // Extract arxiv ID from filename or content
  const arxivIdMatch = filename.match(/(\d{4}\.\d{4,5})/) || text.match(/arXiv:(\d{4}\.\d{4,5})/i);
  if (arxivIdMatch) {
    metadata.identifiers!.arxiv_id = arxivIdMatch[1];
  }

  // Extract DOI
  const doiMatch = text.match(/DOI:\s*(10\.\d+\/[^\s]+)/i) || text.match(/(10\.\d+\/arXiv\.\d+\.\d+)/);
  if (doiMatch) {
    metadata.identifiers!.doi = doiMatch[1];
  }

  // Extract dates from arxiv format (e.g., "v1 [21 Jan 2025]")
  const dateMatch = text.match(/v\d+\s*\[(\d+\s+\w+\s+\d{4})\]/i);
  if (dateMatch) {
    const submittedDate = parseArxivDate(dateMatch[1]);
    if (submittedDate) {
      metadata.dates!.submitted = submittedDate;
    }
  }

  // Extract authors (look for author list patterns)
  const authorSection = extractAuthorSection(text);
  if (authorSection) {
    const authors = parseAuthors(authorSection);
    metadata.actors = authors.map(name => ({ name, role: 'author' }));
  }

  // If we found any metadata, return it
  if (Object.keys(metadata.identifiers!).length > 0 ||
      Object.keys(metadata.dates!).length > 0 ||
      metadata.actors!.length > 0) {
    return metadata;
  }

  return null;
}

/**
 * Extract patent metadata from content
 */
function extractPatentMetadata(text: string, filename: string): WebMetadata | null {
  const metadata: WebMetadata = {
    identifiers: {},
    dates: {},
    actors: [],
  };

  // Extract patent number
  const patentMatch = filename.match(/US(\d+)/i) || text.match(/US\s*(\d+)\s*B[12]/i);
  if (patentMatch) {
    metadata.identifiers!.patent_number = `US${patentMatch[1]}`;
  }

  // Extract application number
  const appMatch = text.match(/Application No[.:]?\s*([\d,\/]+)/i);
  if (appMatch) {
    metadata.identifiers!.application_number = appMatch[1].replace(/,/g, '');
  }

  // Extract filing date
  const filingMatch = text.match(/Filed:\s*(\w+\.?\s+\d+,\s+\d{4})/i);
  if (filingMatch) {
    metadata.dates!.filing = parsePatentDate(filingMatch[1]);
  }

  // Extract grant date
  const grantMatch = text.match(/Date of Patent:\s*(\w+\.?\s+\d+,\s+\d{4})/i);
  if (grantMatch) {
    metadata.dates!.granted = parsePatentDate(grantMatch[1]);
  }

  // Extract inventors
  const inventorSection = text.match(/Inventors?:\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\nAssignee|\nAppl)/i);
  if (inventorSection) {
    const inventors = parseInventors(inventorSection[1]);
    metadata.actors!.push(...inventors.map(name => ({ name, role: 'inventor' })));
  }

  // Extract assignee
  const assigneeMatch = text.match(/Assignee:\s*([^,\n]+)/i);
  if (assigneeMatch) {
    metadata.actors!.push({ name: assigneeMatch[1].trim(), role: 'assignee' });
  }

  if (Object.keys(metadata.identifiers!).length > 0 ||
      Object.keys(metadata.dates!).length > 0 ||
      metadata.actors!.length > 0) {
    return metadata;
  }

  return null;
}

/**
 * Parse arxiv date format "21 Jan 2025" to "2025-01-21"
 */
function parseArxivDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (!match) return null;

  const [, day, month, year] = match;
  const monthNum = months[month.toLowerCase().substring(0, 3)];
  if (!monthNum) return null;

  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Parse patent date format "Mar. 22, 2022" to "2022-03-22"
 */
function parsePatentDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = dateStr.match(/(\w+)\.?\s+(\d+),\s+(\d{4})/i);
  if (!match) return null;

  const [, month, day, year] = match;
  const monthNum = months[month.toLowerCase().substring(0, 3)];
  if (!monthNum) return null;

  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Extract author section from arxiv paper
 */
function extractAuthorSection(text: string): string | null {
  // Look for author section after title and before abstract
  const match = text.match(/(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\n\s*([^\n]*?(?:University|Institute|Lab|Inc|Corp)[^\n]*?)\s*\n/m);
  if (match) {
    return match[1];
  }

  // Alternative: look for multiple capitalized names
  const lines = text.split('\n').slice(0, 20); // Check first 20 lines
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    // Name pattern: capitalized words
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(line)) {
      const nextLine = lines[i + 1].trim();
      // Next line should be affiliation
      if (/University|Institute|Lab|Inc|Corp|College|School/.test(nextLine)) {
        return line;
      }
    }
  }

  return null;
}

/**
 * Parse author names from author section
 */
function parseAuthors(authorSection: string): string[] {
  // Split by common separators
  const authors = authorSection.split(/,|\sand\s|\n/).map(s => s.trim()).filter(Boolean);

  // Filter out non-name patterns
  return authors.filter(name => {
    // Must start with capital letter and contain at least 2 words
    return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(name);
  });
}

/**
 * Parse inventors from patent text
 */
function parseInventors(inventorText: string): string[] {
  // Split by semicolons or "and"
  const inventors = inventorText.split(/;|\sand\s/).map(s => s.trim());

  // Extract just the names (before location)
  return inventors.map(inv => {
    const match = inv.match(/^([^,]+)/);
    return match ? match[1].trim() : inv.trim();
  }).filter(Boolean);
}
