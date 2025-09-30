/**
 * Reciprocal Rank Fusion (RRF) for combining vector and BM25 search results
 * Includes tag boosting for persona-relevant documents
 */

import { createClient } from '@supabase/supabase-js';
import { VectorSearchResult } from './vectorSearch';
import { BM25SearchResult } from './bm25Search';

export interface FusedSearchResult {
  chunkId: string;
  docId: string;
  sectionPath: string;
  text: string;
  score: number; // Fused RRF score (higher is better)
  vectorScore?: number;
  bm25Score?: number;
  tagBoostApplied?: boolean;
  docTitle?: string;
  docType?: string;
  sourceUrl?: string;
}

export interface FusionOptions {
  k?: number; // RRF constant (default: 60)
  tagBoostMultiplier?: number; // Tag boost percentage (default: 1.075 = 7.5% boost)
  citationBoostMultiplier?: number; // Citation boost percentage (default: 1.15 = 15% boost)
  maxChunksPerDoc?: number; // Max chunks from same doc (default: 3)
  conversationId?: string; // Conversation ID for citation-based boosting
}

const DEFAULT_K = 60;
const DEFAULT_TAG_BOOST = 1.075; // 7.5% boost
const DEFAULT_CITATION_BOOST = 1.15; // 15% boost
const DEFAULT_MAX_CHUNKS_PER_DOC = 3;

/**
 * Apply Reciprocal Rank Fusion to combine search results
 * RRF formula: score = Σ(1 / (k + rank))
 */
export function rrfFusion(
  vectorResults: VectorSearchResult[],
  bm25Results: BM25SearchResult[],
  options: FusionOptions = {}
): Map<string, FusedSearchResult> {
  const { k = DEFAULT_K } = options;

  // Create maps for quick lookup
  const fusedResults = new Map<string, FusedSearchResult>();

  // Process vector results (rank 1 = first result)
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    fusedResults.set(result.chunkId, {
      chunkId: result.chunkId,
      docId: result.docId,
      sectionPath: result.sectionPath,
      text: result.text,
      score: rrfScore,
      vectorScore: result.score,
      docTitle: result.docTitle,
      docType: result.docType,
      sourceUrl: result.sourceUrl,
    });
  });

  // Process BM25 results and add to existing or create new
  bm25Results.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    const existing = fusedResults.get(result.chunkId);
    if (existing) {
      // Chunk appears in both results - add scores
      existing.score += rrfScore;
      existing.bm25Score = result.score;
    } else {
      // New chunk from BM25 only
      fusedResults.set(result.chunkId, {
        chunkId: result.chunkId,
        docId: result.docId,
        sectionPath: result.sectionPath,
        text: result.text,
        score: rrfScore,
        bm25Score: result.score,
        docTitle: result.docTitle,
        docType: result.docType,
        sourceUrl: result.sourceUrl,
      });
    }
  });

  return fusedResults;
}

/**
 * Get recently cited document IDs from conversation
 * Returns document IDs from citations in last 2 assistant messages
 */
export async function getRecentlyCitedDocs(
  conversationId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  try {
    // Get last 2 assistant messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(2);

    if (messagesError || !messages || messages.length === 0) {
      return [];
    }

    // Get citations from these messages
    const messageIds = messages.map(m => m.id);
    const { data: citations, error: citationsError } = await supabase
      .from('message_citations')
      .select('document_id')
      .in('message_id', messageIds);

    if (citationsError || !citations) {
      return [];
    }

    // Return unique document IDs
    const uniqueDocIds = [...new Set(citations.map(c => c.document_id).filter(Boolean))];
    console.log(`📚 Found ${uniqueDocIds.length} recently cited documents from conversation`);
    return uniqueDocIds;
  } catch (error) {
    console.warn('Error fetching recently cited docs:', error);
    return [];
  }
}

/**
 * Apply citation-based boosting to fused results
 * Boosts chunks from documents that were recently cited in the conversation
 */
export async function applyCitationBoost(
  fusedResults: Map<string, FusedSearchResult>,
  conversationId: string,
  supabase: ReturnType<typeof createClient>,
  boostMultiplier: number = DEFAULT_CITATION_BOOST
): Promise<void> {
  try {
    // Get recently cited document IDs
    const citedDocIds = await getRecentlyCitedDocs(conversationId, supabase);

    if (citedDocIds.length === 0) {
      console.log('No recently cited documents found for boosting');
      return;
    }

    const citedDocSet = new Set(citedDocIds);

    // Apply boost to chunks from cited documents
    let boostedCount = 0;
    fusedResults.forEach((result) => {
      if (citedDocSet.has(result.docId)) {
        result.score *= boostMultiplier;
        boostedCount++;
      }
    });

    console.log(`📈 Citation boost: Applied ${((boostMultiplier - 1) * 100).toFixed(1)}% boost to ${boostedCount} chunks from ${citedDocIds.length} documents`);
  } catch (error) {
    console.warn('Error applying citation boost:', error);
  }
}

/**
 * Apply tag boosting to fused results
 * Boosts chunks from documents that match persona tags
 */
export async function applyTagBoost(
  fusedResults: Map<string, FusedSearchResult>,
  query: string,
  personaSlug: string,
  supabase: ReturnType<typeof createClient>,
  boostMultiplier: number = DEFAULT_TAG_BOOST
): Promise<void> {
  try {
    // Load persona config to get tags
    const { data: personaData, error: personaError } = await supabase
      .from('personas')
      .select('config_json')
      .eq('slug', personaSlug)
      .single();

    if (personaError || !personaData) {
      console.warn(`Could not load persona config for tag boosting: ${personaSlug}`);
      return;
    }

    const config = typeof personaData.config_json === 'string'
      ? JSON.parse(personaData.config_json)
      : personaData.config_json;

    // Extract tags from config (flatten topic aliases)
    const personaTags: string[] = [];
    if (config?.topics && Array.isArray(config.topics)) {
      config.topics.forEach((topic: any) => {
        if (topic.aliases && Array.isArray(topic.aliases)) {
          personaTags.push(...topic.aliases);
        }
      });
    }

    if (personaTags.length === 0) {
      console.log('No persona tags found for boosting');
      return;
    }

    // Normalize query to lowercase for matching
    const queryLower = query.toLowerCase();

    // Get unique doc IDs from results
    const docIds = Array.from(new Set(Array.from(fusedResults.values()).map(r => r.docId)));

    // Load document tags
    const { data: docs, error: docsError } = await supabase
      .from('docs')
      .select('id, tags')
      .in('id', docIds);

    if (docsError || !docs) {
      console.warn('Could not load document tags for boosting');
      return;
    }

    // Build set of doc IDs that should receive boost
    const boostedDocIds = new Set<string>();

    docs.forEach((doc: any) => {
      const docTags = Array.isArray(doc.tags) ? doc.tags : JSON.parse(doc.tags || '[]');

      // Check if any doc tag matches query or persona tags
      const hasMatch = docTags.some((tag: string) => {
        const tagLower = tag.toLowerCase();
        return queryLower.includes(tagLower) ||
               personaTags.some(pt => pt.toLowerCase().includes(tagLower));
      });

      if (hasMatch) {
        boostedDocIds.add(doc.id);
      }
    });

    // Apply boost to matching documents
    let boostedCount = 0;
    fusedResults.forEach((result) => {
      if (boostedDocIds.has(result.docId)) {
        result.score *= boostMultiplier;
        result.tagBoostApplied = true;
        boostedCount++;
      }
    });

    console.log(`Tag boost: Applied ${((boostMultiplier - 1) * 100).toFixed(1)}% boost to ${boostedCount} chunks`);
  } catch (error) {
    console.warn('Error applying tag boost:', error);
  }
}

/**
 * Deduplicate by document, keeping top N chunks per document
 */
export function deduplicateByDoc(
  fusedResults: Map<string, FusedSearchResult>,
  maxChunksPerDoc: number = DEFAULT_MAX_CHUNKS_PER_DOC
): FusedSearchResult[] {
  // Sort all results by score descending
  const sortedResults = Array.from(fusedResults.values())
    .sort((a, b) => b.score - a.score);

  // Track chunks per document
  const docChunkCount = new Map<string, number>();
  const finalResults: FusedSearchResult[] = [];

  for (const result of sortedResults) {
    const currentCount = docChunkCount.get(result.docId) || 0;

    if (currentCount < maxChunksPerDoc) {
      finalResults.push(result);
      docChunkCount.set(result.docId, currentCount + 1);
    }
  }

  return finalResults;
}

/**
 * Complete hybrid search with RRF fusion, citation boosting, and tag boosting
 */
export async function hybridSearch(
  vectorResults: VectorSearchResult[],
  bm25Results: BM25SearchResult[],
  query: string,
  personaSlug: string,
  supabase: ReturnType<typeof createClient>,
  options: FusionOptions = {}
): Promise<FusedSearchResult[]> {
  const {
    k = DEFAULT_K,
    tagBoostMultiplier = DEFAULT_TAG_BOOST,
    citationBoostMultiplier = DEFAULT_CITATION_BOOST,
    maxChunksPerDoc = DEFAULT_MAX_CHUNKS_PER_DOC,
    conversationId,
  } = options;

  console.log('\n=== Hybrid Search (RRF Fusion) ===');
  console.log(`Vector results: ${vectorResults.length}`);
  console.log(`BM25 results: ${bm25Results.length}`);

  // Step 1: Apply RRF fusion
  const fusedResults = rrfFusion(vectorResults, bm25Results, { k });
  console.log(`Fused results: ${fusedResults.size} unique chunks`);

  // Step 2: Apply citation-based boosting (if conversation ID provided)
  if (conversationId) {
    await applyCitationBoost(fusedResults, conversationId, supabase, citationBoostMultiplier);
  }

  // Step 3: Apply tag boosting
  await applyTagBoost(fusedResults, query, personaSlug, supabase, tagBoostMultiplier);

  // Step 4: Deduplicate by document
  const finalResults = deduplicateByDoc(fusedResults, maxChunksPerDoc);
  console.log(`Final results: ${finalResults.length} chunks (max ${maxChunksPerDoc} per doc)`);
  console.log('=====================================\n');

  return finalResults;
}