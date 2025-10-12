/**
 * Frontmatter generation utility for RAG documents
 * Auto-generates YAML frontmatter from file metadata and content
 */

import path from 'path';
import matter from 'gray-matter';

export interface DocumentMetadata {
  id: string;
  title: string;
  date?: string; // Deprecated: use dates.created instead (kept for backward compatibility)
  source_url?: string; // Deprecated: use identifiers.source_url instead (kept for backward compatibility)
  type?: 'blog' | 'press' | 'spec' | 'tech_memo' | 'faq' | 'slide' | 'email' | 'other';
  personas: string[];
  tags?: string[]; // Deprecated: tags are now auto-extracted from **Key Terms** and **Also Known As** in document body during ingestion
  summary?: string;
  license?: 'public' | 'cc-by' | 'proprietary' | 'unknown';
  // Structured metadata (new format)
  dates?: {
    created?: string;
    published?: string;
    updated?: string;
  };
  identifiers?: {
    source_url?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Generate kebab-case ID from filename
 */
export function generateIdFromFilename(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract persona slug from file path
 * Expected: /personas/<slug>/RAG/document.md
 */
export function extractPersonaFromPath(filePath: string): string | null {
  const match = filePath.match(/\/personas\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Extract first H1 heading from markdown content
 */
export function extractTitleFromMarkdown(content: string): string | null {
  // Try to find first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Try to find title in first few lines (short lines only)
  const lines = content.split('\n').slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    // Only consider short lines (< 100 chars) as potential titles
    if (trimmed && !trimmed.startsWith('#') && trimmed.length < 100) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Detect document type from filename or content
 */
export function detectDocumentType(
  filename: string,
  content: string
): DocumentMetadata['type'] {
  const lower = filename.toLowerCase();

  if (lower.includes('press') || lower.includes('release')) return 'press';
  if (lower.includes('blog') || lower.includes('post')) return 'blog';
  if (lower.includes('spec') || lower.includes('specification')) return 'spec';
  if (lower.includes('faq')) return 'faq';
  if (lower.includes('slide') || lower.includes('deck')) return 'slide';
  if (lower.includes('email') || lower.includes('mail')) return 'email';
  if (lower.includes('memo') || lower.includes('note')) return 'tech_memo';

  // Check content for hints
  if (content.includes('FOR IMMEDIATE RELEASE')) return 'press';
  if (content.includes('Q: ') && content.includes('A: ')) return 'faq';

  return 'other';
}

/**
 * Extract date from filename or content
 * Looks for patterns like: YYYY-MM-DD, YYYY_MM_DD, YYYYMMDD
 */
export function extractDate(filename: string, content: string): string | null {
  // Check filename first
  const datePatterns = [
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{4})_(\d{2})_(\d{2})/,
    /(\d{4})(\d{2})(\d{2})/,
  ];

  for (const pattern of datePatterns) {
    const match = filename.match(pattern);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  // Check content for date metadata
  const contentDateMatch = content.match(/date:\s*(\d{4}-\d{2}-\d{2})/i);
  if (contentDateMatch) {
    return contentDateMatch[1];
  }

  return null;
}

/**
 * Extract source URL from content
 */
export function extractSourceUrl(content: string): string | null {
  // Look for URL in first few lines or metadata
  const urlPattern = /https?:\/\/[^\s]+/;
  const lines = content.split('\n').slice(0, 20);

  for (const line of lines) {
    if (line.toLowerCase().includes('source:') || line.toLowerCase().includes('url:')) {
      const match = line.match(urlPattern);
      if (match) return match[0];
    }
  }

  return null;
}

/**
 * Generate complete frontmatter for a document
 */
export function generateFrontmatter(
  filePath: string,
  content: string
): DocumentMetadata {
  const filename = path.basename(filePath);
  const personaSlug = extractPersonaFromPath(filePath);

  if (!personaSlug) {
    throw new Error(
      `Could not extract persona slug from path: ${filePath}. Expected format: /personas/<slug>/RAG/`
    );
  }

  const metadata: DocumentMetadata = {
    id: generateIdFromFilename(filename),
    title: extractTitleFromMarkdown(content) || filename,
    personas: [personaSlug],
    type: detectDocumentType(filename, content),
  };

  // Optional fields - use structured format
  const date = extractDate(filename, content);
  if (date) {
    metadata.dates = { created: date };
    metadata.date = date; // Keep for backward compatibility
  }

  const sourceUrl = extractSourceUrl(content);
  if (sourceUrl) {
    metadata.identifiers = { source_url: sourceUrl };
    metadata.source_url = sourceUrl; // Keep for backward compatibility
  }

  return metadata;
}

/**
 * Parse existing frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  metadata: Partial<DocumentMetadata>;
  body: string;
} {
  try {
    const parsed = matter(content);
    return {
      metadata: parsed.data as Partial<DocumentMetadata>,
      body: parsed.content,
    };
  } catch (error) {
    // No frontmatter found, return empty metadata
    return {
      metadata: {},
      body: content,
    };
  }
}

/**
 * Merge auto-generated frontmatter with existing manual frontmatter
 * Manual values take precedence
 */
export function mergeFrontmatter(
  autoGenerated: DocumentMetadata,
  manual: Partial<DocumentMetadata>
): DocumentMetadata {
  return {
    ...autoGenerated,
    ...manual,
    // Special handling for arrays - merge instead of replace
    personas: manual.personas || autoGenerated.personas,
    tags: manual.tags || autoGenerated.tags,
  };
}

/**
 * Format metadata as YAML frontmatter string
 */
export function formatFrontmatter(metadata: DocumentMetadata): string {
  const lines: string[] = ['---'];

  // Required fields
  lines.push(`id: ${metadata.id}`);

  // Escape and truncate title if it's too long (safety check)
  let title = metadata.title.replace(/"/g, '\\"').replace(/\n/g, ' ');
  if (title.length > 200) {
    title = title.substring(0, 197) + '...';
  }
  lines.push(`title: "${title}"`);

  // Optional fields
  if (metadata.type) lines.push(`type: ${metadata.type}`);

  // Structured dates (preferred format)
  if (metadata.dates && Object.keys(metadata.dates).length > 0) {
    lines.push('dates:');
    if (metadata.dates.created) lines.push(`  created: "${metadata.dates.created}"`);
    if (metadata.dates.published) lines.push(`  published: "${metadata.dates.published}"`);
    if (metadata.dates.updated) lines.push(`  updated: "${metadata.dates.updated}"`);
  } else if (metadata.date) {
    // Fallback to old format for backward compatibility
    lines.push(`date: ${metadata.date}`);
  }

  // Structured identifiers (preferred format)
  if (metadata.identifiers && Object.keys(metadata.identifiers).length > 0) {
    lines.push('identifiers:');
    for (const [key, value] of Object.entries(metadata.identifiers)) {
      if (value) lines.push(`  ${key}: "${value}"`);
    }
  } else if (metadata.source_url) {
    // Fallback to old format for backward compatibility
    lines.push(`source_url: ${metadata.source_url}`);
  }

  // Arrays
  lines.push(`personas: [${metadata.personas.join(', ')}]`);

  // Summary and license
  if (metadata.summary) {
    const summary = metadata.summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
    lines.push(`summary: "${summary}"`);
  }
  if (metadata.license) lines.push(`license: ${metadata.license}`);

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate complete markdown document with frontmatter
 */
export function generateDocument(
  filePath: string,
  rawContent: string
): string {
  // Parse existing frontmatter if present
  const { metadata: existingMetadata, body } = parseFrontmatter(rawContent);

  // Generate auto-metadata
  const autoMetadata = generateFrontmatter(filePath, body);

  // Merge manual and auto-generated
  const finalMetadata = mergeFrontmatter(autoMetadata, existingMetadata);

  // Format and combine
  const frontmatter = formatFrontmatter(finalMetadata);
  return frontmatter + body;
}