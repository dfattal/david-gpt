/**
 * Markdown processing utilities for RAG documents
 * Normalizes markdown formatting and extracts structure
 */

export interface MarkdownSection {
  level: number;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Clean and normalize markdown content
 */
export function normalizeMarkdown(content: string): string {
  let normalized = content;

  // Normalize line endings to LF
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove excessive blank lines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  // Fix heading spacing - ensure blank line before and after headings
  normalized = normalized.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
  normalized = normalized.replace(/(#{1,6}\s[^\n]+)\n([^\n#])/g, '$1\n\n$2');

  // Normalize heading format - ensure space after #
  normalized = normalized.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');

  // Fix list formatting - ensure consistent spacing
  normalized = normalized.replace(/^([*\-+])\s*/gm, '- ');
  normalized = normalized.replace(/^(\d+\.)\s*/gm, '$1 ');

  // Normalize code blocks - ensure language tags are lowercase
  normalized = normalized.replace(/```([A-Z]+)/g, (match, lang) => {
    return '```' + lang.toLowerCase();
  });

  // Remove trailing whitespace from lines
  normalized = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // Ensure file ends with single newline
  normalized = normalized.trim() + '\n';

  return normalized;
}

/**
 * Extract section hierarchy from markdown headings
 */
export function extractSections(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endLine = index - 1;
        sections.push(currentSection);
      }

      // Start new section
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      currentSection = {
        level,
        title,
        content: '',
        startLine: index,
        endLine: index,
      };
    } else if (currentSection) {
      // Accumulate content for current section
      currentSection.content += line + '\n';
    }
  });

  // Save last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Build hierarchical section path from heading levels
 * Example: "Introduction > Background > Early Work"
 */
export function buildSectionPath(
  sections: MarkdownSection[],
  currentIndex: number
): string {
  const currentSection = sections[currentIndex];
  const path: string[] = [currentSection.title];

  // Walk backwards to find parent sections
  let currentLevel = currentSection.level;

  for (let i = currentIndex - 1; i >= 0; i--) {
    const section = sections[i];
    if (section.level < currentLevel) {
      path.unshift(section.title);
      currentLevel = section.level;
    }
  }

  return path.join(' > ');
}

/**
 * Extract all section paths from document
 */
export function extractSectionPaths(content: string): Map<number, string> {
  const sections = extractSections(content);
  const paths = new Map<number, string>();

  sections.forEach((section, index) => {
    const path = buildSectionPath(sections, index);
    paths.set(section.startLine, path);
  });

  return paths;
}

/**
 * Remove YAML frontmatter from content
 */
export function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  return content.replace(frontmatterRegex, '');
}

/**
 * Extract key terms from document for search boosting
 * Looks for technical terms, acronyms, and important phrases
 */
export function extractKeyTerms(content: string): string[] {
  const terms: Set<string> = new Set();

  // Extract terms from a "Key Terms" section if present
  const keyTermsMatch = content.match(
    /\*\*Key Terms\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s
  );
  if (keyTermsMatch) {
    const termsText = keyTermsMatch[1];
    const extracted = termsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    extracted.forEach((t) => terms.add(t));
  }

  // Extract from "Also Known As" section
  const akaMatch = content.match(
    /\*\*Also Known As\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s
  );
  if (akaMatch) {
    const akaText = akaMatch[1];
    const extracted = akaText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    extracted.forEach((t) => terms.add(t));
  }

  // Extract capitalized technical terms (2+ words, 3+ chars each)
  const technicalTerms = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
  if (technicalTerms) {
    technicalTerms
      .filter((t) => t.length >= 6)
      .forEach((t) => terms.add(t.toLowerCase()));
  }

  // Extract acronyms (2-6 uppercase letters)
  const acronyms = content.match(/\b[A-Z]{2,6}\b/g);
  if (acronyms) {
    acronyms.forEach((a) => terms.add(a));
  }

  return Array.from(terms);
}

/**
 * Clean extracted text for better readability
 * Useful after PDF extraction
 */
export function cleanExtractedText(text: string): string {
  let cleaned = text;

  // Fix broken hyphenation across lines
  cleaned = cleaned.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Fix sentence spacing
  cleaned = cleaned.replace(/\.\s+/g, '. ');
  cleaned = cleaned.replace(/\?\s+/g, '? ');
  cleaned = cleaned.replace(/!\s+/g, '! ');

  // Remove page numbers (common in PDFs)
  cleaned = cleaned.replace(/\n\s*\d+\s*\n/g, '\n');

  // Remove headers/footers (repeated text)
  const lines = cleaned.split('\n');
  const uniqueLines = [...new Set(lines)];
  if (uniqueLines.length < lines.length * 0.8) {
    // If more than 20% are duplicates, filter them
    cleaned = uniqueLines.join('\n');
  }

  return cleaned.trim();
}

/**
 * Convert plain text to basic markdown
 * Detects paragraphs and attempts to identify headings
 */
export function textToMarkdown(text: string): string {
  const lines = text.split('\n').map((l) => l.trim());
  const markdown: string[] = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Empty line
    if (!line) {
      if (inParagraph) {
        markdown.push('');
        inParagraph = false;
      }
      continue;
    }

    // Detect potential heading (short line followed by empty line or capitalized)
    const isShort = line.length < 60;
    const isCapitalized = /^[A-Z]/.test(line);
    const nextIsEmpty = !nextLine || nextLine.trim() === '';
    const endsWithPeriod = line.endsWith('.');

    if (isShort && isCapitalized && nextIsEmpty && !endsWithPeriod) {
      // Likely a heading
      markdown.push('');
      markdown.push(`## ${line}`);
      markdown.push('');
      inParagraph = false;
    } else {
      // Regular paragraph text
      if (!inParagraph) {
        markdown.push('');
        inParagraph = true;
      }
      markdown.push(line);
    }
  }

  return markdown.join('\n').trim() + '\n';
}

/**
 * Process raw content into clean, structured markdown
 */
export function processMarkdown(rawContent: string): string {
  // Clean extracted text
  let processed = cleanExtractedText(rawContent);

  // Convert to markdown if needed (detect if it's plain text)
  const hasMarkdown = /^#{1,6}\s+/m.test(processed) || /\[.+\]\(.+\)/.test(processed);
  if (!hasMarkdown) {
    processed = textToMarkdown(processed);
  }

  // Normalize markdown formatting
  processed = normalizeMarkdown(processed);

  return processed;
}