/**
 * Citation Generation System
 *
 * Handles the generation of transparent citations for RAG responses with
 * stable identifiers [A1], [B2] format and accurate fact summaries.
 */

import { supabase } from '@/lib/supabase';
import type {
  SearchResult,
  MessageCitation,
  ResponseMode,
  DocumentMetadata,
} from './types';

// =======================
// Citation Generation
// =======================

export interface CitationMarker {
  id: string;
  marker: string; // e.g., "A1", "B2"
  documentId: string;
  chunkId?: string;
  title: string;
  docType: string;
  pageRange?: string;
  factSummary?: string;
  relevanceScore: number;
  sourceMetadata: DocumentMetadata;
}

export interface CitationContext {
  conversationId?: string;
  messageId?: string;
  responseMode: ResponseMode;
  userRole: 'admin' | 'member' | 'guest';
}

/**
 * Generate citations from search results with stable identifiers
 */
export class CitationGenerator {
  private citationCounter = 0;
  private usedMarkers = new Set<string>();

  /**
   * Generate citation markers for search results
   */
  generateCitations(
    searchResults: SearchResult[],
    context: CitationContext
  ): CitationMarker[] {
    const citations: CitationMarker[] = [];
    const documentGroups = this.groupResultsByDocument(searchResults);

    // Generate document-level citations (A, B, C, etc.)
    let documentIndex = 0;

    for (const [documentId, chunks] of documentGroups.entries()) {
      const letter = String.fromCharCode(65 + documentIndex); // A, B, C...

      // Sort chunks by relevance score (highest first)
      const sortedChunks = chunks.sort((a, b) => b.score - a.score);

      // Take top chunks per document (limit based on response mode)
      const maxChunksPerDoc =
        context.responseMode === 'FACT'
          ? 2
          : context.responseMode === 'EXPLAIN'
            ? 3
            : 4;
      const selectedChunks = sortedChunks.slice(0, maxChunksPerDoc);

      for (
        let chunkIndex = 0;
        chunkIndex < selectedChunks.length;
        chunkIndex++
      ) {
        const chunk = selectedChunks[chunkIndex];
        const chunkNumber = chunkIndex + 1;
        const marker = `${letter}${chunkNumber}`;

        // Skip if marker already used (shouldn't happen, but safety check)
        if (this.usedMarkers.has(marker)) {
          continue;
        }

        this.usedMarkers.add(marker);

        citations.push({
          id: `citation_${documentId}_${chunk.chunkId || 'doc'}`,
          marker,
          documentId: chunk.documentId,
          chunkId: chunk.chunkId,
          title: chunk.title,
          docType: chunk.docType || 'document',
          pageRange: chunk.pageRange,
          factSummary: this.generateFactSummary(
            chunk.content,
            context.responseMode
          ),
          relevanceScore: chunk.score,
          sourceMetadata: chunk.metadata,
        });
      }

      documentIndex++;
    }

    return citations;
  }

  /**
   * Group search results by document ID
   */
  private groupResultsByDocument(
    results: SearchResult[]
  ): Map<string, SearchResult[]> {
    const groups = new Map<string, SearchResult[]>();

    for (const result of results) {
      const existing = groups.get(result.documentId) || [];
      existing.push(result);
      groups.set(result.documentId, existing);
    }

    return groups;
  }

  /**
   * Generate concise fact summary from chunk content
   */
  private generateFactSummary(
    content: string,
    responseMode: ResponseMode
  ): string {
    // Clean up content and extract key fact
    const cleanContent = content.replace(/\s+/g, ' ').trim();

    // Different summarization strategies based on response mode
    switch (responseMode) {
      case 'FACT':
        // Extract the most direct factual statement (first sentence usually)
        const firstSentence = cleanContent.split(/[.!?]/)[0];
        return firstSentence.length > 200
          ? firstSentence.slice(0, 200) + '...'
          : firstSentence + '.';

      case 'EXPLAIN':
        // Take a broader context snippet
        return cleanContent.length > 300
          ? cleanContent.slice(0, 300) + '...'
          : cleanContent;

      case 'CONFLICTS':
        // Focus on conflicting information or key claims
        const keyClaim = this.extractKeyClaim(cleanContent);
        return keyClaim;

      default:
        return cleanContent.slice(0, 200) + '...';
    }
  }

  /**
   * Extract key claim for conflict resolution
   */
  private extractKeyClaim(content: string): string {
    // Look for definitive statements, numbers, dates, conclusions
    const patterns = [
      /([A-Z][^.!?]*(?:shows?|proves?|demonstrates?|indicates?|suggests?)[^.!?]*[.!?])/i,
      /([A-Z][^.!?]*(?:\d+(?:,\d+)*(?:\.\d+)?)[^.!?]*[.!?])/i,
      /([A-Z][^.!?]*(?:found|discovered|observed|concluded)[^.!?]*[.!?])/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const claim = match[1].trim();
        return claim.length > 250 ? claim.slice(0, 250) + '...' : claim;
      }
    }

    // Fallback to first sentence
    const firstSentence = content.split(/[.!?]/)[0];
    return firstSentence.length > 200
      ? firstSentence.slice(0, 200) + '...'
      : firstSentence + '.';
  }

  /**
   * Reset citation counters for new conversation
   */
  reset(): void {
    this.citationCounter = 0;
    this.usedMarkers.clear();
  }
}

// =======================
// Citation Storage
// =======================

/**
 * Save citations to database for persistence and tracking
 */
export async function saveCitations(
  messageId: string,
  citations: CitationMarker[]
): Promise<void> {
  if (!citations.length) return;

  const citationRecords = citations.map((citation, index) => ({
    message_id: messageId,
    document_id: citation.documentId,
    chunk_id: citation.chunkId,
    marker: `[${citation.marker}]`,
    fact_summary: citation.factSummary,
    page_range: citation.pageRange,
    relevance_score: citation.relevanceScore,
    citation_order: index + 1,
  }));

  const { error } = await supabase
    .from('message_citations')
    .insert(citationRecords);

  if (error) {
    console.error('Error saving citations:', error);
    throw new Error(`Failed to save citations: ${error.message}`);
  }
}

/**
 * Retrieve citations for a message
 */
export async function getCitations(
  messageId: string
): Promise<MessageCitation[]> {
  const { data, error } = await supabase
    .from('message_citations')
    .select(
      `
      id,
      message_id,
      document_id,
      chunk_id,
      marker,
      fact_summary,
      page_range,
      relevance_score,
      citation_order,
      created_at,
      documents (
        title,
        doc_type,
        doi,
        arxiv_id,
        patent_no,
        url,
        published_date
      )
    `
    )
    .eq('message_id', messageId)
    .order('citation_order');

  if (error) {
    console.error('Error retrieving citations:', error);
    throw new Error(`Failed to retrieve citations: ${error.message}`);
  }

  return data || [];
}

// =======================
// Citation Formatting
// =======================

/**
 * Insert citations into response text
 */
export function insertCitationsIntoText(
  text: string,
  citations: CitationMarker[]
): string {
  let citedText = text;

  // Create a citation map for quick lookup
  const citationMap = new Map<string, string>();
  citations.forEach(citation => {
    citationMap.set(citation.factSummary || '', `[${citation.marker}]`);
  });

  // Sort citations by fact summary length (longest first) to avoid substring issues
  const sortedCitations = citations.sort(
    (a, b) => (b.factSummary?.length || 0) - (a.factSummary?.length || 0)
  );

  // Insert citations at appropriate points
  for (const citation of sortedCitations) {
    if (!citation.factSummary) continue;

    // Look for related content in the response
    const factContent = citation.factSummary.toLowerCase();
    const responseContent = citedText.toLowerCase();

    // Find best insertion point
    const insertionPoint = this.findBestInsertionPoint(
      responseContent,
      factContent
    );

    if (insertionPoint > -1) {
      // Insert citation marker
      const beforeInsertion = citedText.slice(0, insertionPoint);
      const afterInsertion = citedText.slice(insertionPoint);

      citedText = beforeInsertion + ` [${citation.marker}]` + afterInsertion;
    }
  }

  return citedText;
}

/**
 * Find the best position to insert a citation
 */
function findBestInsertionPoint(
  responseText: string,
  factContent: string
): number {
  // Try to find exact matches first
  const exactMatch = responseText.indexOf(factContent);
  if (exactMatch > -1) {
    return exactMatch + factContent.length;
  }

  // Try to find partial matches
  const words = factContent.split(/\s+/).slice(0, 5); // First 5 words
  for (let i = words.length; i >= 2; i--) {
    const phrase = words.slice(0, i).join(' ');
    const match = responseText.indexOf(phrase);
    if (match > -1) {
      return match + phrase.length;
    }
  }

  return -1; // No good insertion point found
}

/**
 * Generate citation list for display
 */
export function formatCitationList(citations: CitationMarker[]): string {
  if (!citations.length) return '';

  let citationList = '\n\n**Sources:**\n';

  for (const citation of citations) {
    const docInfo = this.formatDocumentInfo(citation);
    const pageInfo = citation.pageRange ? ` (${citation.pageRange})` : '';

    citationList += `[${citation.marker}] ${docInfo}${pageInfo}\n`;
  }

  return citationList;
}

/**
 * Format document information for citation
 */
function formatDocumentInfo(citation: CitationMarker): string {
  const metadata = citation.sourceMetadata;

  switch (citation.docType) {
    case 'paper':
      if (metadata.doi) {
        return `${citation.title}. DOI: ${metadata.doi}`;
      }
      if (metadata.arxivId) {
        return `${citation.title}. arXiv: ${metadata.arxivId}`;
      }
      return citation.title;

    case 'patent':
      if (metadata.patentNo) {
        return `${citation.title}. Patent ${metadata.patentNo}`;
      }
      return citation.title;

    case 'url':
      if (metadata.url) {
        return `${citation.title}. ${metadata.url}`;
      }
      return citation.title;

    default:
      return citation.title;
  }
}

// =======================
// Export Default Instance
// =======================

export const citationGenerator = new CitationGenerator();

// =======================
// Convenience Functions
// =======================

/**
 * Complete citation workflow: generate, insert, and format
 */
export async function processCitations(
  searchResults: SearchResult[],
  responseText: string,
  context: CitationContext,
  messageId?: string
): Promise<{
  citedText: string;
  citations: CitationMarker[];
  citationList: string;
}> {
  // Generate citations
  const citations = citationGenerator.generateCitations(searchResults, context);

  // Insert citations into text
  const citedText = insertCitationsIntoText(responseText, citations);

  // Format citation list
  const citationList = formatCitationList(citations);

  // Save to database if messageId provided
  if (messageId && citations.length > 0) {
    try {
      await saveCitations(messageId, citations);
    } catch (error) {
      console.error('Failed to save citations:', error);
      // Don't fail the entire request if citation saving fails
    }
  }

  return {
    citedText,
    citations,
    citationList,
  };
}
