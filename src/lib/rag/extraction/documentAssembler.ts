/**
 * Document assembler: merges formatted chunks and creates final markdown
 */

import { FormattedChunk } from './geminiFormatter';
import { DocumentType } from '../ingestion/geminiProcessor';
import { extractMetadataFromContent } from './metadataExtractor';
import { DocumentSummary } from './summaryGenerator';

export interface WebMetadata {
  identifiers?: Record<string, string>;
  dates?: Record<string, string>;
  actors?: Array<{ name: string; role: string; affiliation?: string }>;
}

export interface AssembledDocument {
  markdown: string;
  stats: {
    totalChunks: number;
    totalPages: number;
    originalChars: number;
    formattedChars: number;
    retentionRatio: number;
  };
}

/**
 * Assemble formatted chunks into final markdown document
 */
export function assembleDocument(
  chunks: FormattedChunk[],
  docType: DocumentType,
  filename: string,
  personaSlug: string,
  webMetadata?: WebMetadata | null,
  pdfMetadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: Date;
  },
  globalSummary?: DocumentSummary
): AssembledDocument {
  // Calculate stats
  const totalChunks = chunks.length;
  const totalPages = chunks[chunks.length - 1]?.pageRange.end || 0;
  const originalChars = chunks.reduce((sum, c) => sum + c.originalCharCount, 0);
  const formattedChars = chunks.reduce((sum, c) => sum + c.formattedCharCount, 0);
  const retentionRatio = originalChars > 0 ? formattedChars / originalChars : 0;

  // Extract metadata from first chunk if web metadata not available
  let finalMetadata = webMetadata;
  if (!webMetadata && chunks.length > 0) {
    const contentMetadata = extractMetadataFromContent(chunks[0].markdown, docType, filename);
    if (contentMetadata) {
      finalMetadata = contentMetadata;
    }
  }

  // Generate frontmatter (with global summary if available)
  const frontmatter = generateFrontmatter(
    filename,
    docType,
    personaSlug,
    finalMetadata,
    pdfMetadata,
    globalSummary
  );

  // Use global key terms if available, otherwise extract from first chunk
  const keyTermsSection = globalSummary
    ? formatGlobalKeyTerms(globalSummary)
    : extractKeyTerms(chunks[0]?.markdown || '', docType);

  // Merge chunk content
  const mergedContent = mergeChunks(chunks);

  // Assemble final document with Key Terms after frontmatter
  const markdown = keyTermsSection
    ? `${frontmatter}\n\n${keyTermsSection}\n\n${mergedContent}`
    : `${frontmatter}\n\n${mergedContent}`;

  return {
    markdown,
    stats: {
      totalChunks,
      totalPages,
      originalChars,
      formattedChars,
      retentionRatio,
    },
  };
}

/**
 * Format global key terms from summary generator
 */
function formatGlobalKeyTerms(globalSummary: DocumentSummary): string | null {
  if (globalSummary.keyTerms.length === 0) {
    return null;
  }

  const keyTermsLine = `**Key Terms**: ${globalSummary.keyTerms.join(', ')}`;

  // Always include Also Known As for consistent format (admin UI metadata editing)
  const alsoKnownAsLine = globalSummary.alsoKnownAs.length > 0
    ? `**Also Known As**: ${globalSummary.alsoKnownAs.join(', ')}`
    : '**Also Known As**: ';

  return `${keyTermsLine}\n${alsoKnownAsLine}`;
}

/**
 * Extract Key Terms section from content (fallback)
 */
function extractKeyTerms(firstChunk: string, docType: DocumentType): string | null {
  // Try to extract key terms from Abstract or Introduction
  const abstractMatch = firstChunk.match(/##?\s*Abstract\s*\n([\s\S]{100,1000}?)(?=\n##|\n\n##|$)/i);
  const introMatch = firstChunk.match(/##?\s*(?:Introduction|Overview)\s*\n([\s\S]{100,1000}?)(?=\n##|\n\n##|$)/i);

  const contentForTerms = abstractMatch?.[1] || introMatch?.[1] || firstChunk.substring(0, 500);

  // Extract technical terms, acronyms, and key concepts
  const terms = new Set<string>();

  // Pattern 1: Acronyms in parentheses "Monocular Depth Estimation (MDE)"
  const acronymMatches = contentForTerms.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\(([A-Z]{2,})\)/g);
  for (const match of acronymMatches) {
    terms.add(`${match[1]} (${match[2]})`);
    terms.add(match[2]);
  }

  // Pattern 2: Technical terms with capitals
  const techTermMatches = contentForTerms.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g);
  for (const match of techTermMatches) {
    const term = match[1];
    // Filter out common non-technical phrases
    if (!term.match(/^(The|This|These|Those|Figure|Table|Section|Chapter)\b/)) {
      terms.add(term);
    }
  }

  // Pattern 3: Standalone acronyms
  const acronymOnlyMatches = contentForTerms.matchAll(/\b([A-Z]{2,})\b/g);
  for (const match of acronymOnlyMatches) {
    if (match[1].length <= 6) { // Limit to reasonable acronym length
      terms.add(match[1]);
    }
  }

  if (terms.size === 0) {
    return null;
  }

  // Format as comma-separated list (limit to first 15 terms)
  const termsList = Array.from(terms).slice(0, 15).join(', ');

  // Always include Also Known As for consistent format (admin UI metadata editing)
  const alsoKnownAs = docType === 'arxiv' ? 'research paper, academic paper' : docType.replace(/_/g, ' ');
  return `**Key Terms**: ${termsList}\n**Also Known As**: ${alsoKnownAs}`;
}

/**
 * Generate YAML frontmatter
 */
function generateFrontmatter(
  filename: string,
  docType: DocumentType,
  personaSlug: string,
  webMetadata?: WebMetadata | null,
  pdfMetadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: Date;
  },
  globalSummary?: DocumentSummary
): string {
  // Generate ID from filename
  const id = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Extract title (prefer PDF metadata, fallback to filename)
  const title = pdfMetadata?.title || filename.replace(/\.[^.]+$/, '').replace(/-/g, ' ');

  // Build frontmatter
  const lines = ['---', `id: ${id}`, `title: ${title}`, `type: ${docType}`, `personas: [${personaSlug}]`];

  // Add summary (prefer global summary, then PDF subject, fallback to generic)
  if (globalSummary?.summary && globalSummary.summary !== 'Document summary not available') {
    lines.push(`summary: ${globalSummary.summary}`);
  } else if (pdfMetadata?.subject) {
    lines.push(`summary: "${pdfMetadata.subject}"`);
  } else {
    lines.push(`summary: "Document extracted from ${filename}"`);
  }

  // Add identifiers from web metadata
  const identifiers = { ...(webMetadata?.identifiers || {}) };

  // Ensure source_url is in identifiers for arxiv
  if (docType === 'arxiv' && identifiers.arxiv_id && !identifiers.source_url) {
    identifiers.source_url = `https://arxiv.org/abs/${identifiers.arxiv_id}`;
  }

  if (Object.keys(identifiers).length > 0) {
    lines.push('identifiers:');
    for (const [key, value] of Object.entries(identifiers)) {
      if (value) {
        lines.push(`  ${key}: "${value}"`);
      }
    }
  }

  // Add dates from web metadata
  if (webMetadata?.dates && Object.keys(webMetadata.dates).length > 0) {
    lines.push('dates:');
    for (const [key, value] of Object.entries(webMetadata.dates)) {
      if (value) {
        lines.push(`  ${key}: "${value}"`);
      }
    }
  } else if (pdfMetadata?.creationDate) {
    lines.push('dates:');
    lines.push(`  created: "${pdfMetadata.creationDate.toISOString().split('T')[0]}"`);
  }

  // Add actors from web metadata
  if (webMetadata?.actors && webMetadata.actors.length > 0) {
    lines.push('actors:');
    for (const actor of webMetadata.actors) {
      lines.push(`  - name: "${actor.name}"`);
      lines.push(`    role: "${actor.role}"`);
      if ('affiliation' in actor && actor.affiliation) {
        lines.push(`    affiliation: "${actor.affiliation}"`);
      }
    }
  } else if (pdfMetadata?.author) {
    lines.push('actors:');
    lines.push(`  - name: "${pdfMetadata.author}"`);
    lines.push(`    role: "author"`);
  }

  lines.push('---');

  return lines.join('\n');
}

/**
 * Merge formatted chunks with smart deduplication
 */
function mergeChunks(chunks: FormattedChunk[]): string {
  const sections: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let content = chunk.markdown;

    // Remove page markers (they were added for context during formatting)
    content = content.replace(/\[Page \d+\]/g, '').trim();

    // Handle [continues] markers - stitch content across chunks
    if (i > 0) {
      const prevSection = sections[sections.length - 1];

      // Check if previous section ends with [continues]
      if (prevSection && prevSection.endsWith('[continues]')) {
        // Remove [continues] marker from previous section
        sections[sections.length - 1] = prevSection.replace(/\n?\[continues\]\s*$/, '').trimEnd();

        // If current content doesn't start with a heading, append directly to previous section
        if (content && !content.match(/^#{1,3}\s/)) {
          sections[sections.length - 1] += '\n' + content;
          continue; // Skip adding as separate section
        }
      }

      // If not a continuation, try to deduplicate heading
      content = deduplicateHeading(prevSection, content);
    }

    // Add to sections
    if (content.trim()) {
      sections.push(content);
    }
  }

  return sections.join('\n\n');
}

/**
 * Remove duplicate headings between consecutive chunks
 */
function deduplicateHeading(prevContent: string, currentContent: string): string {
  // Extract last heading from previous content
  const prevHeadingMatch = prevContent.match(/#{1,3}\s+([^\n]+)$/m);
  if (!prevHeadingMatch) return currentContent;

  const prevHeading = prevHeadingMatch[0];

  // Check if current content starts with the same heading
  const currentHeadingMatch = currentContent.match(/^#{1,3}\s+([^\n]+)/);
  if (!currentHeadingMatch) return currentContent;

  const currentHeading = currentHeadingMatch[0];

  // If headings match, remove from current content
  if (prevHeading.trim() === currentHeading.trim()) {
    return currentContent.replace(currentHeading, '').trim();
  }

  return currentContent;
}

/**
 * Validate assembled document
 */
export function validateAssembledDocument(assembled: AssembledDocument): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check frontmatter
  if (!assembled.markdown.startsWith('---')) {
    errors.push('Missing YAML frontmatter');
  }

  // Check retention ratio
  if (assembled.stats.retentionRatio < 0.3) {
    warnings.push(`Low content retention: ${(assembled.stats.retentionRatio * 100).toFixed(1)}% (expected >30%)`);
  }

  // Check minimum content
  if (assembled.stats.formattedChars < 500) {
    warnings.push(`Very short document: ${assembled.stats.formattedChars} chars`);
  }

  // Check page count
  if (assembled.stats.totalPages < 1) {
    errors.push('No pages processed');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
