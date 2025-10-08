/**
 * Generic Article Formatter
 * Converts extracted article data to markdown with YAML frontmatter
 */

import { GenericArticle } from './genericArticleExtractor';

export interface GenericArticleFormattedDocument {
  markdown: string;
  stats: {
    sections: number;
    contentChars: number;
    authors: number;
  };
}

/**
 * Format generic article as markdown with YAML frontmatter
 * @param userKeyTerms - Optional user-provided key terms to merge with extracted terms
 * @param userAlsoKnownAs - Optional user-provided "also known as" name
 */
export async function formatGenericArticleMarkdown(
  article: GenericArticle,
  personaSlugs: string[],
  geminiApiKey: string,
  userKeyTerms?: string[],
  userAlsoKnownAs?: string
): Promise<string> {
  console.log(`\n📝 Formatting article markdown...`);

  const frontmatter = buildFrontmatter(article, personaSlugs);
  const content = buildContent(article, userKeyTerms, userAlsoKnownAs);

  const markdown = `${frontmatter}\n\n${content}`;

  console.log(`  ✓ Formatted markdown (${markdown.length.toLocaleString()} chars)`);

  return markdown;
}

/**
 * Build YAML frontmatter
 */
function buildFrontmatter(article: GenericArticle, personaSlugs: string[]): string {
  const lines: string[] = ['---'];

  // Document ID (generated from URL)
  const urlId = generateIdFromUrl(article.metadata.source_url);
  lines.push(`id: "${urlId}"`);

  lines.push('type: article');

  // Personas
  lines.push(`personas:`);
  personaSlugs.forEach(slug => lines.push(`  - ${slug}`));

  // Title
  if (article.title) {
    lines.push(`title: "${escapeYaml(article.title)}"`);
  }

  // Summary
  if (article.metadata.summary) {
    lines.push(`summary: "${escapeYaml(article.metadata.summary)}"`);
  }

  // Identifiers (structured) - includes source_url and domain
  lines.push(`identifiers:`);
  lines.push(`  article_id: "${urlId}"`);
  if (article.metadata.source_url) {
    lines.push(`  source_url: "${article.metadata.source_url}"`);
  }
  if (article.metadata.domain) {
    lines.push(`  domain: "${article.metadata.domain}"`);
  }

  // Dates (structured)
  if (article.metadata.dates?.published || article.metadata.dates?.updated) {
    lines.push(`dates:`);
    if (article.metadata.dates?.published) {
      lines.push(`  published: "${article.metadata.dates.published}"`);
    }
    if (article.metadata.dates?.updated) {
      lines.push(`  updated: "${article.metadata.dates.updated}"`);
    }
  }

  // Actors (converting authors to actors format)
  if (article.authors.length > 0) {
    const normalizedAuthors = normalizeAuthors(article.authors);
    lines.push(`actors:`);
    for (const author of normalizedAuthors) {
      lines.push(`  - name: "${escapeYaml(author.name)}"`);
      lines.push(`    role: "author"`);
      if (author.affiliation) {
        lines.push(`    affiliation: "${escapeYaml(author.affiliation)}"`);
      }
    }
  }

  lines.push('---');

  return lines.join('\n');
}

/**
 * Build markdown content (matching patent/arxiv format with Key Terms and AKA in body)
 */
function buildContent(
  article: GenericArticle,
  userKeyTerms?: string[],
  userAlsoKnownAs?: string
): string {
  const sections: string[] = [];

  // Merge extracted key terms with user-provided ones
  const extractedKeyTerms = article.metadata.key_terms || '';
  let finalKeyTerms = extractedKeyTerms;

  if (userKeyTerms && userKeyTerms.length > 0) {
    const userTermsStr = userKeyTerms.join(',');
    finalKeyTerms = extractedKeyTerms
      ? `${extractedKeyTerms},${userTermsStr}`
      : userTermsStr;
  }

  sections.push(`**Key Terms**: ${finalKeyTerms}`);

  // Also Known As
  const alsoKnownAs = userAlsoKnownAs || '';
  sections.push(`**Also Known As**: ${alsoKnownAs}\n`);

  // Title
  sections.push(`# ${article.title}\n`);

  // Metadata table
  const metadataLines: string[] = [];

  if (article.authors.length > 0) {
    const authorsList = article.authors.map(a =>
      a.affiliation ? `${a.name} (${a.affiliation})` : a.name
    ).join(', ');
    metadataLines.push(`**Authors**: ${authorsList}  `);
  }

  if (article.metadata.dates?.published) {
    metadataLines.push(`**Published**: ${article.metadata.dates.published}  `);
  }

  if (article.metadata.domain) {
    metadataLines.push(`**Source**: ${article.metadata.domain}  `);
  }

  metadataLines.push(`**URL**: ${article.metadata.source_url}\n`);

  sections.push(metadataLines.join('\n'));

  // Abstract (if available)
  if (article.abstract) {
    sections.push('## Abstract\n\n' + article.abstract.trim());
  }

  // Main content (already has section headers from extraction)
  if (article.content) {
    // Check if content already has the title as first line
    let content = article.content.trim();
    const lines = content.split('\n');

    // Remove duplicate title if it appears at the start
    if (lines[0]?.startsWith('# ') && lines[0].includes(article.title)) {
      content = lines.slice(1).join('\n').trim();
    }

    // Also check if "Also Known As" accidentally contains the title
    // This happens when Gemini includes the title in the extracted content
    if (content.startsWith('# ') && content.includes(article.title)) {
      const contentLines = content.split('\n');
      if (contentLines[0].startsWith('# ')) {
        content = contentLines.slice(1).join('\n').trim();
      }
    }

    sections.push(content);
  }

  return sections.join('\n\n');
}

/**
 * Normalize authors - split comma/and-separated author strings into individual authors
 * This fixes cases where Gemini returns "Author1, Author2 and Author3" as a single name
 */
function normalizeAuthors(authors: Array<{ name: string; affiliation?: string }>): Array<{ name: string; affiliation?: string }> {
  const normalized: Array<{ name: string; affiliation?: string }> = [];

  // Date patterns to filter out (Gemini sometimes mistakes dates for author names)
  const datePatterns = [
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i, // "March 17"
    /^\d{1,2}$/i, // Just a number like "2022"
    /^\d{4}$/i, // Just a year
  ];

  for (const author of authors) {
    // Skip if author name looks like a date
    if (datePatterns.some(pattern => pattern.test(author.name.trim()))) {
      continue;
    }

    // Check if the author name contains multiple authors (commas or "and")
    if (author.name.includes(',') || author.name.includes(' and ')) {
      // Split by comma and "and"
      const names = author.name
        .split(/,|\s+and\s+/)
        .map(n => n.trim())
        .filter(n => n.length > 0)
        .filter(n => !datePatterns.some(pattern => pattern.test(n))); // Filter out dates

      // Add each author separately (without affiliation since we can't split that)
      for (const name of names) {
        normalized.push({ name });
      }
    } else {
      // Single author, keep as-is
      normalized.push(author);
    }
  }

  return normalized;
}

/**
 * Generate ID from URL
 */
function generateIdFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '').replace(/\./g, '-');
    const path = urlObj.pathname
      .replace(/^\//, '')
      .replace(/\/$/, '')
      .replace(/\//g, '-')
      .replace(/[^a-z0-9-]/gi, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);

    return `${domain}-${path}`.toLowerCase();
  } catch (error) {
    // Fallback: use hash of URL
    return `article-${Buffer.from(url).toString('base64').substring(0, 20)}`.toLowerCase();
  }
}

/**
 * Escape special characters for YAML
 */
function escapeYaml(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}
