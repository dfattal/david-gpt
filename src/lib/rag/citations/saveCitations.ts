/**
 * Save citations from assistant messages to the database
 * Enables citation-based document boosting in multi-turn conversations
 */

import { createClient } from '@/lib/supabase/server';
import { parseCitations } from './parser';

export interface CitationMetadata {
  docRef: string; // e.g., "doc_1"
  sourceUrl?: string;
  docTitle?: string;
  docId: string; // Actual document ID from database
}

/**
 * Extract and save citations from assistant message content
 *
 * @param messageId - ID of the assistant message
 * @param content - Message content with [^doc_id:section] citations
 * @param metadataArray - Metadata mapping doc references to actual document IDs
 * @param supabase - Supabase client (optional, will create if not provided)
 */
export async function saveCitations(
  messageId: string,
  content: string,
  metadataArray: CitationMetadata[],
  supabase?: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  const client = supabase || await createClient();

  try {
    // Create metadata map for parser
    const metadataMap = new Map(
      metadataArray.map(item => [
        item.docRef,
        { sourceUrl: item.sourceUrl, docTitle: item.docTitle }
      ])
    );

    // Parse citations from content
    const { citations } = parseCitations(content, metadataMap);

    if (citations.length === 0) {
      console.log(`No citations found in message ${messageId}`);
      return;
    }

    // Map doc references back to actual document IDs
    const docRefToIdMap = new Map(
      metadataArray.map(item => [item.docRef, item.docId])
    );

    // Prepare citation records for insertion
    const citationRecords = citations.map(citation => {
      // Extract doc reference from citation.id (format: "doc_1:section_path")
      const [docRef] = citation.id.split(':');
      const documentId = docRefToIdMap.get(docRef);

      if (!documentId) {
        console.warn(`Could not find document ID for citation: ${citation.id}`);
        return null;
      }

      return {
        message_id: messageId,
        document_id: documentId,
        marker: `[^${citation.id}]`, // Store the full bracket notation
        citation_order: citation.number,
        chunk_id: null, // TODO: Map to actual chunk ID if needed
        fact_summary: null,
        relevance_score: null,
        page_range: null,
      };
    }).filter(Boolean); // Remove null entries

    if (citationRecords.length === 0) {
      console.warn(`No valid citation records to save for message ${messageId}`);
      return;
    }

    // Insert citations into database
    const { error } = await client
      .from('message_citations')
      .insert(citationRecords);

    if (error) {
      console.error('Failed to save citations:', error);
      throw error;
    }

    console.log(`✓ Saved ${citationRecords.length} citations for message ${messageId}`);
  } catch (error) {
    console.error('Error saving citations:', error);
    // Don't throw - citation saving failures shouldn't break message creation
  }
}
