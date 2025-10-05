/**
 * URL List Parser
 * Parses markdown URL list files with optional metadata (key terms, AKA)
 */

export interface ParsedUrlItem {
  url: string;
  keyTerms?: string[];
  alsoKnownAs?: string;
  section?: string;
}

export interface UrlListParseResult {
  items: ParsedUrlItem[];
  totalCount: number;
}

/**
 * Parse a markdown URL list with optional metadata
 *
 * Format:
 * ```markdown
 * ## Section Name (optional)
 * - URL [| key1, key2, ...] [| aka: Alternative Name]
 * ```
 *
 * Examples:
 * - US10838134B2
 * - https://patents.google.com/patent/US10838134B2 | multibeam, light guide | aka: Core Patent
 * - arxiv:2405.10314 | holography, neural networks
 */
export function parseUrlList(content: string): UrlListParseResult {
  const items: ParsedUrlItem[] = [];
  const lines = content.split('\n');
  let currentSection: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and main headers
    if (!trimmed || trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      continue;
    }

    // Track section headers
    if (trimmed.startsWith('##')) {
      currentSection = trimmed.replace(/^##\s+/, '').trim();
      continue;
    }

    // Skip comments
    if (trimmed.startsWith('>') || trimmed.startsWith('<!--')) {
      continue;
    }

    // Parse list items
    if (trimmed.startsWith('-')) {
      const parsed = parseUrlLine(trimmed, currentSection);
      if (parsed) {
        items.push(parsed);
      }
    }
  }

  return {
    items,
    totalCount: items.length,
  };
}

/**
 * Parse a single URL list line
 * Format: - URL [| key1, key2] [| aka: Name]
 */
function parseUrlLine(line: string, section?: string): ParsedUrlItem | null {
  // Remove leading "- " or "* "
  const content = line.replace(/^[-*]\s+/, '').trim();

  if (!content) return null;

  // Split by pipe separator
  const parts = content.split('|').map(p => p.trim());

  const url = parts[0];
  if (!url) return null;

  const item: ParsedUrlItem = { url };

  // Add section if available
  if (section) {
    item.section = section;
  }

  // Parse key terms (second part if exists)
  if (parts[1] && !parts[1].toLowerCase().startsWith('aka:')) {
    item.keyTerms = parts[1]
      .split(',')
      .map(term => term.trim())
      .filter(term => term.length > 0);
  }

  // Parse "also known as" (can be second or third part)
  const akaPart = parts.find(p => p.toLowerCase().startsWith('aka:'));
  if (akaPart) {
    item.alsoKnownAs = akaPart.replace(/^aka:\s*/i, '').trim();
  }

  return item;
}

/**
 * Validate URL list content
 */
export function validateUrlList(content: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content.trim()) {
    errors.push('URL list is empty');
    return { valid: false, errors, warnings };
  }

  const result = parseUrlList(content);

  if (result.totalCount === 0) {
    errors.push('No valid URLs found in the list');
    return { valid: false, errors, warnings };
  }

  // Check for duplicates
  const urls = result.items.map(item => item.url.toLowerCase());
  const duplicates = urls.filter((url, index) => urls.indexOf(url) !== index);
  if (duplicates.length > 0) {
    warnings.push(`Found ${duplicates.length} duplicate URLs`);
  }

  // Warn about very long lists
  if (result.totalCount > 50) {
    warnings.push(`Large batch detected (${result.totalCount} URLs). Processing may take significant time.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
