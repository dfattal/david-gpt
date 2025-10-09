/**
 * Vector search using pgvector cosine similarity
 * Searches chunks by semantic similarity to query embedding
 */

import { createClient } from '@supabase/supabase-js';
import { createEmbeddingGenerator } from '../embeddings/embeddingGenerator';

export interface VectorSearchResult {
  chunkId: string;
  docId: string;
  sectionPath: string;
  text: string;
  score: number; // Cosine similarity (0-1, higher is better)
  docTitle?: string;
  docType?: string;
  sourceUrl?: string;
}

export interface VectorSearchOptions {
  personaSlug: string;
  limit?: number; // Default: 20
  threshold?: number; // Minimum similarity score (0-1), default: 0.35
}

/**
 * Perform vector similarity search for a query
 */
export async function vectorSearch(
  query: string,
  options: VectorSearchOptions,
  supabase: ReturnType<typeof createClient>
): Promise<VectorSearchResult[]> {
  const { personaSlug, limit = 20, threshold = 0.35 } = options;

  try {
    // Step 1: Generate query embedding
    const embeddingGenerator = createEmbeddingGenerator();
    const { embedding } = await embeddingGenerator.generateSingle(query);

    // Step 2: Convert embedding to PostgreSQL format
    const embeddingVector = `[${embedding.join(',')}]`;

    // Step 3: Perform vector similarity search with pgvector
    // Note: pgvector uses <=> for cosine distance (0 = identical, 2 = opposite)
    // We convert distance to similarity: similarity = 1 - (distance / 2)
    const { data, error } = await supabase.rpc('vector_search_chunks', {
      query_embedding: embeddingVector,
      persona_slug: personaSlug,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Vector search error:', error);
      throw new Error(`Vector search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(`Vector search: No results found for query "${query}" (persona: ${personaSlug})`);
      return [];
    }

    // Step 4: Transform results
    const results: VectorSearchResult[] = data.map((row: any) => ({
      chunkId: row.chunk_id,
      docId: row.doc_id,
      sectionPath: row.section_path,
      text: row.text,
      score: row.similarity, // Already converted to 0-1 similarity by RPC
      docTitle: row.doc_title,
      docType: row.doc_type,
      sourceUrl: row.source_url,
    }));

    console.log(`Vector search: Found ${results.length} chunks (threshold: ${threshold})`);
    return results;
  } catch (error) {
    console.error('Vector search error:', error);
    throw error;
  }
}

/**
 * Get configurable threshold from persona config
 */
export async function getVectorThreshold(
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
      console.warn(`Could not load persona config for ${personaSlug}, using default threshold`);
      return 0.35;
    }

    const config = typeof data.config_json === 'string'
      ? JSON.parse(data.config_json)
      : data.config_json;

    return config?.router?.vector_threshold || 0.35;
  } catch (error) {
    console.warn('Error loading vector threshold:', error);
    return 0.35;
  }
}