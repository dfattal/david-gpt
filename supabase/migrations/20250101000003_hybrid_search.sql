-- Migration 004: Hybrid Search (Vector + BM25) Support
-- Add full-text search capabilities to RAG chunks

-- Add tsvector column for full-text search
ALTER TABLE rag_chunks 
ADD COLUMN search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX idx_rag_chunks_search_vector ON rag_chunks USING gin(search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_rag_chunk_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.metadata->>'title', '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search_vector on insert/update
DROP TRIGGER IF EXISTS trigger_update_rag_chunk_search_vector ON rag_chunks;
CREATE TRIGGER trigger_update_rag_chunk_search_vector
  BEFORE INSERT OR UPDATE ON rag_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_chunk_search_vector();

-- Update existing chunks with search vectors
UPDATE rag_chunks SET search_vector = 
  setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(metadata->>'title', '')), 'B')
WHERE search_vector IS NULL;

-- Add hybrid search statistics table for tuning weights
CREATE TABLE IF NOT EXISTS rag_search_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  vector_results integer DEFAULT 0,
  bm25_results integer DEFAULT 0,
  merged_results integer DEFAULT 0,
  vector_weight real DEFAULT 0.7,
  bm25_weight real DEFAULT 0.3,
  avg_vector_score real DEFAULT 0.0,
  avg_bm25_score real DEFAULT 0.0,
  search_time_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS for search stats
ALTER TABLE rag_search_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own search stats" ON rag_search_stats
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own search stats" ON rag_search_stats
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Create function for BM25 scoring (simplified version)
CREATE OR REPLACE FUNCTION bm25_score(
  query_text text,
  document_vector tsvector,
  k1 real DEFAULT 1.5,
  b real DEFAULT 0.75
) RETURNS real AS $$
DECLARE
  score real := 0.0;
  query_vector tsquery;
BEGIN
  query_vector := plainto_tsquery('english', query_text);
  
  -- Simplified BM25 calculation using PostgreSQL's built-in ranking
  score := ts_rank_cd(document_vector, query_vector);
  
  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view for hybrid search results
CREATE OR REPLACE VIEW rag_hybrid_search AS
SELECT 
  chunk_id,
  document_id,
  content,
  metadata,
  embedding,
  user_id,
  chunk_index,
  token_count,
  search_vector,
  created_at
FROM rag_chunks
WHERE user_id = auth.uid();

COMMENT ON TABLE rag_search_stats IS 'Statistics for hybrid search performance tuning';
COMMENT ON COLUMN rag_chunks.search_vector IS 'Full-text search vector for BM25 ranking';
COMMENT ON FUNCTION bm25_score IS 'Simplified BM25 scoring function for full-text search';
COMMENT ON VIEW rag_hybrid_search IS 'User-scoped view for hybrid search operations';