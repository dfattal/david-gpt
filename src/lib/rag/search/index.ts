/**
 * Main RAG search interface
 * Combines vector search, BM25 search, and RRF fusion with tag boosting
 */

import { createClient } from '@supabase/supabase-js';
import { vectorSearch, getVectorThreshold } from './vectorSearch';
import { bm25Search, getBM25MinScore } from './bm25Search';
import { hybridSearch, FusedSearchResult } from './fusionSearch';

export interface SearchOptions {
  personaSlug: string;
  limit?: number; // Final number of results to return (default: 12)
  vectorLimit?: number; // Top-N from vector search (default: 20)
  bm25Limit?: number; // Top-N from BM25 search (default: 20)
  vectorThreshold?: number; // Minimum similarity (default: from persona config)
  bm25MinScore?: number; // Minimum BM25 score (default: from persona config)
  tagBoostMultiplier?: number; // Tag boost percentage (default: 1.075)
  maxChunksPerDoc?: number; // Max chunks per document (default: 3)
}

export interface SearchResult {
  chunkId: string;
  docId: string;
  sectionPath: string;
  text: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
  tagBoostApplied?: boolean;
  docTitle?: string;
  docType?: string;
  sourceUrl?: string;
}

/**
 * Perform complete hybrid RAG search
 */
export async function performSearch(
  query: string,
  options: SearchOptions,
  supabase: ReturnType<typeof createClient>
): Promise<SearchResult[]> {
  const {
    personaSlug,
    limit = 12,
    vectorLimit = 20,
    bm25Limit = 20,
    tagBoostMultiplier = 1.075,
    maxChunksPerDoc = 3,
  } = options;

  console.log(`\n=== RAG Search for: "${query}" (persona: ${personaSlug}) ===`);

  try {
    // Load persona config for thresholds if not provided
    const vectorThreshold = options.vectorThreshold ??
      await getVectorThreshold(personaSlug, supabase);
    const bm25MinScore = options.bm25MinScore ??
      await getBM25MinScore(personaSlug, supabase);

    // Step 1: Perform vector search
    console.log('\n[1/3] Vector search...');
    const vectorResults = await vectorSearch(query, {
      personaSlug,
      limit: vectorLimit,
      threshold: vectorThreshold,
    }, supabase);

    // Step 2: Perform BM25 search
    console.log('[2/3] BM25 search...');
    const bm25Results = await bm25Search(query, {
      personaSlug,
      limit: bm25Limit,
      minScore: bm25MinScore,
    }, supabase);

    // Step 3: Fuse results with RRF and tag boosting
    console.log('[3/3] Hybrid fusion (RRF + tag boosting)...');
    const fusedResults = await hybridSearch(
      vectorResults,
      bm25Results,
      query,
      personaSlug,
      supabase,
      {
        tagBoostMultiplier,
        maxChunksPerDoc,
      }
    );

    // Return top-N results
    const finalResults = fusedResults.slice(0, limit);

    console.log(`\n✓ Search complete: ${finalResults.length} results returned`);
    console.log('='.repeat(60) + '\n');

    return finalResults;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

// Re-export types and utilities
export type { FusedSearchResult } from './fusionSearch';
export { vectorSearch } from './vectorSearch';
export { bm25Search } from './bm25Search';
export { hybridSearch } from './fusionSearch';