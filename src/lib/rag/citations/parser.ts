/**
 * Citation Parser for RAG System
 *
 * Parses citations in the format [^doc_id:section] from LLM responses
 * and maps them to source URLs and section anchors.
 */

export interface Citation {
  /** Original citation text (e.g., "doc_1:Introduction") */
  id: string;
  /** Document ID from RAG context (e.g., "doc_1") */
  docId: string;
  /** Section path (e.g., "Introduction > Background") */
  sectionPath: string;
  /** Display number for the citation (e.g., 1, 2, 3) */
  number: number;
  /** Source URL for the document */
  sourceUrl?: string;
  /** Document title */
  docTitle?: string;
}

export interface ParsedContent {
  /** Original content with citations replaced by numbered links */
  content: string;
  /** List of unique citations found in the content */
  citations: Citation[];
}

/**
 * Citation regex pattern: [^doc_id:section_path]
 * Captures: doc_id and section_path
 * Examples:
 * - [^doc_1:Introduction]
 * - [^evolution-leia-inc:Background > History]
 * - [^us11281020:Claims]
 */
const CITATION_REGEX = /\[\^([^:\]]+):([^\]]+)\]/g;

/**
 * Parse citations from LLM response content
 *
 * @param content - Raw content from LLM with [^doc_id:section] citations
 * @param contextMap - Optional map of doc_id to metadata (source_url, title)
 * @returns Parsed content with citations replaced by numbered links and citation list
 */
export function parseCitations(
  content: string,
  contextMap?: Map<string, { sourceUrl?: string; docTitle?: string }>
): ParsedContent {
  const citations: Citation[] = [];
  const citationMap = new Map<string, number>(); // Track unique citations
  let citationNumber = 0;

  // Replace citations with numbered links
  const processedContent = content.replace(
    CITATION_REGEX,
    (match, docId: string, sectionPath: string) => {
      const citationId = `${docId}:${sectionPath}`;

      // Check if we've seen this citation before
      if (!citationMap.has(citationId)) {
        citationNumber++;
        citationMap.set(citationId, citationNumber);

        // Get metadata from context map if available
        const metadata = contextMap?.get(docId);

        citations.push({
          id: citationId,
          docId: docId.trim(),
          sectionPath: sectionPath.trim(),
          number: citationNumber,
          sourceUrl: metadata?.sourceUrl,
          docTitle: metadata?.docTitle,
        });
      }

      const number = citationMap.get(citationId)!;
      // Return a markdown link that will be rendered by ReactMarkdown
      // Using sup tag for superscript citation numbers
      return `<sup>[${number}](#citation-${number})</sup>`;
    }
  );

  return {
    content: processedContent,
    citations,
  };
}

/**
 * Generate section anchor from section path
 * Converts "Introduction > Background" to "#introduction--background"
 */
export function generateSectionAnchor(sectionPath: string): string {
  return (
    '#' +
    sectionPath
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
  );
}

/**
 * Build full citation URL with section anchor
 *
 * @param sourceUrl - Base document URL
 * @param sectionPath - Section path for anchor
 * @returns Full URL with anchor (e.g., "https://example.com/doc#section")
 */
export function buildCitationUrl(sourceUrl: string, sectionPath: string): string {
  const anchor = generateSectionAnchor(sectionPath);

  // Handle URLs that already have anchors or query params
  const url = new URL(sourceUrl);
  url.hash = anchor;

  return url.toString();
}

/**
 * Format citation for display in sources list
 *
 * @param citation - Citation object
 * @returns Formatted citation string (e.g., "[1] Document Title, §Section Path")
 */
export function formatCitationForDisplay(citation: Citation): string {
  const title = citation.docTitle || citation.docId;
  return `[${citation.number}] ${title}, §${citation.sectionPath}`;
}