/**
 * ArXiv Markdown Formatter
 * Converts extracted ArXiv paper data to markdown with frontmatter
 */

import { ArxivPaper } from './arxivHtmlExtractor';

export interface ArxivFormattedDocument {
  markdown: string;
  stats: {
    sections: number;
    contentChars: number;
    authors: number;
  };
}

/**
 * Format ArXiv paper as markdown with YAML frontmatter
 * @param userKeyTerms - Optional user-provided key terms to merge with extracted terms
 * @param userAlsoKnownAs - Optional user-provided "also known as" name
 */
export function formatArxivAsMarkdown(
  paper: ArxivPaper,
  personaSlug: string,
  userKeyTerms?: string[],
  userAlsoKnownAs?: string
): ArxivFormattedDocument {
  const frontmatter = buildFrontmatter(paper, personaSlug);
  const content = buildContent(paper, userKeyTerms, userAlsoKnownAs);

  const markdown = `${frontmatter}\n\n${content}`;

  // Count sections
  const sectionCount = (content.match(/^##\s+/gm) || []).length;

  return {
    markdown,
    stats: {
      sections: sectionCount,
      contentChars: content.length,
      authors: paper.authors.length
    }
  };
}

/**
 * Build YAML frontmatter (matching patent format - no key_terms here)
 */
function buildFrontmatter(paper: ArxivPaper, personaSlug: string): string {
  const lines: string[] = ['---'];

  // Document ID (required for storage)
  lines.push(`id: "${paper.arxivId}"`);

  lines.push('type: arxiv');

  // Title
  if (paper.title) {
    lines.push(`title: "${escapeYaml(paper.title)}"`);
  }

  // Personas (required for ingestion)
  lines.push(`personas:`);
  lines.push(`  - ${personaSlug}`);

  // Authors
  if (paper.authors.length > 0) {
    lines.push('authors:');
    for (const author of paper.authors) {
      if (author.affiliation) {
        lines.push(`  - name: "${escapeYaml(author.name)}"`);
        lines.push(`    affiliation: "${escapeYaml(author.affiliation)}"`);
      } else {
        lines.push(`  - "${escapeYaml(author.name)}"`);
      }
    }
  }

  // Summary
  if (paper.metadata.summary) {
    lines.push(`summary: "${escapeYaml(paper.metadata.summary)}"`);
  }

  // Source URL
  lines.push(`source_url: "https://arxiv.org/abs/${paper.arxivId}"`);
  lines.push(`html_url: "https://arxiv.org/html/${paper.arxivId}"`);

  // Identifiers (structured)
  lines.push(`identifiers:`);
  lines.push(`  arxiv_id: "${paper.arxivId}"`);
  if (paper.metadata.identifiers.doi) {
    lines.push(`  doi: "${paper.metadata.identifiers.doi}"`);
  }
  lines.push(`  abs_url: "https://arxiv.org/abs/${paper.arxivId}"`);
  lines.push(`  html_url: "https://arxiv.org/html/${paper.arxivId}"`);

  // Dates (structured)
  if (paper.metadata.dates?.published || paper.metadata.dates?.updated) {
    lines.push(`dates:`);
    if (paper.metadata.dates?.published) {
      lines.push(`  published: "${paper.metadata.dates.published}"`);
    }
    if (paper.metadata.dates?.updated) {
      lines.push(`  updated: "${paper.metadata.dates.updated}"`);
    }
  }

  // Actors (converting authors to actors format)
  if (paper.authors.length > 0) {
    lines.push(`actors:`);
    for (const author of paper.authors) {
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
 * Build markdown content (matching patent format with Key Terms and AKA in body)
 */
function buildContent(
  paper: ArxivPaper,
  userKeyTerms?: string[],
  userAlsoKnownAs?: string
): string {
  const sections: string[] = [];

  // Merge extracted key terms with user-provided ones
  const extractedKeyTerms = paper.metadata.key_terms || '';
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
  sections.push(`# ${paper.title}\n`);

  // Author metadata table (similar to patent metadata)
  if (paper.authors.length > 0) {
    const authorsList = paper.authors.map(a =>
      a.affiliation ? `${a.name} (${a.affiliation})` : a.name
    ).join(', ');
    sections.push(`**Authors**: ${authorsList}  `);
  }

  if (paper.metadata.dates?.published) {
    sections.push(`**Published**: ${paper.metadata.dates.published}  `);
  }

  if (paper.metadata.identifiers.doi) {
    sections.push(`**DOI**: ${paper.metadata.identifiers.doi}  `);
  }

  sections.push(`**ArXiv ID**: ${paper.arxivId}\n`);

  // Abstract
  if (paper.abstract) {
    sections.push('## Abstract\n\n' + paper.abstract.trim());
  }

  // Main content (already has section headers from extraction)
  if (paper.content) {
    sections.push(paper.content.trim());
  }

  return sections.join('\n\n');
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
