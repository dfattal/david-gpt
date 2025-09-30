/**
 * BM25 lexical search using PostgreSQL full-text search
 * Searches chunks by keyword relevance using ts_rank_cd
 */

import { createClient } from '@supabase/supabase-js';

export interface BM25SearchResult {
  chunkId: string;
  docId: string;
  sectionPath: string;
  text: string;
  score: number; // BM25-like relevance score (higher is better)
  docTitle?: string;
  docType?: string;
  sourceUrl?: string;
}

export interface BM25SearchOptions {
  personaSlug: string;
  limit?: number; // Default: 20
  minScore?: number; // Minimum relevance score, default: 0.1
}

/**
 * Perform BM25 keyword search for a query
 */
export async function bm25Search(
  query: string,
  options: BM25SearchOptions,
  supabase: ReturnType<typeof createClient>
): Promise<BM25SearchResult[]> {
  const { personaSlug, limit = 20, minScore = 0.1 } = options;

  try {
    // Perform BM25 search using PostgreSQL full-text search
    const { data, error } = await supabase.rpc('bm25_search_chunks', {
      query_text: query,
      persona_slug: personaSlug,
      min_score: minScore,
      match_count: limit,
    });

    if (error) {
      console.error('BM25 search error:', error);
      throw new Error(`BM25 search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(`BM25 search: No results found for query "${query}" (persona: ${personaSlug})`);
      return [];
    }

    // Transform results
    const results: BM25SearchResult[] = data.map((row: any) => ({
      chunkId: row.chunk_id,
      docId: row.doc_id,
      sectionPath: row.section_path,
      text: row.text,
      score: row.score,
      docTitle: row.doc_title,
      docType: row.doc_type,
      sourceUrl: row.source_url,
    }));

    console.log(`BM25 search: Found ${results.length} chunks (minScore: ${minScore})`);
    return results;
  } catch (error) {
    console.error('BM25 search error:', error);
    throw error;
  }
}

/**
 * Get configurable min score from persona config
 */
export async function getBM25MinScore(
  personaSlug: string,
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('personas')
      .select('config_json')
      .eq('slug', personaSlug)
      .single();

    if (error || !data) {
      console.warn(`Could not load persona config for ${personaSlug}, using default min score`);
      return 0.1;
    }

    const config = typeof data.config_json === 'string'
      ? JSON.parse(data.config_json)
      : data.config_json;

    return config?.retrieval?.bm25_min_score || 0.1;
  } catch (error) {
    console.warn('Error loading BM25 min score:', error);
    return 0.1;
  }
}