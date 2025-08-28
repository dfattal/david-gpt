-- Migration 005: Knowledge Graph Utility Functions
-- Utility functions for KG management and maintenance

-- Function to clear all knowledge graph data for a user
CREATE OR REPLACE FUNCTION clear_user_knowledge_graph(p_user_id UUID)
RETURNS TABLE(
  entities_deleted INTEGER,
  relations_deleted INTEGER,
  chunk_entities_deleted INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entities_deleted INTEGER := 0;
  v_relations_deleted INTEGER := 0;
  v_chunk_entities_deleted INTEGER := 0;
BEGIN
  -- Delete chunk-entity relationships for user's documents
  WITH user_chunks AS (
    SELECT rc.id 
    FROM rag_chunks rc
    INNER JOIN rag_documents rd ON rc.doc_id = rd.id
    WHERE rd.user_id = p_user_id
  )
  DELETE FROM rag_chunk_entities 
  WHERE chunk_id IN (SELECT id FROM user_chunks);
  
  GET DIAGNOSTICS v_chunk_entities_deleted = ROW_COUNT;
  
  -- Delete relations involving user's entities
  WITH user_entities AS (
    SELECT re.id
    FROM rag_entities re
    INNER JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    INNER JOIN rag_chunks rc ON rce.chunk_id = rc.id
    INNER JOIN rag_documents rd ON rc.doc_id = rd.id
    WHERE rd.user_id = p_user_id
  )
  DELETE FROM rag_relations 
  WHERE head_id IN (SELECT id FROM user_entities) 
     OR tail_id IN (SELECT id FROM user_entities);
  
  GET DIAGNOSTICS v_relations_deleted = ROW_COUNT;
  
  -- Delete entities that are no longer referenced
  WITH unreferenced_entities AS (
    SELECT re.id
    FROM rag_entities re
    LEFT JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    WHERE rce.entity_id IS NULL
  )
  DELETE FROM rag_entities 
  WHERE id IN (SELECT id FROM unreferenced_entities);
  
  GET DIAGNOSTICS v_entities_deleted = ROW_COUNT;
  
  -- Return counts
  entities_deleted := v_entities_deleted;
  relations_deleted := v_relations_deleted;
  chunk_entities_deleted := v_chunk_entities_deleted;
  
  RETURN NEXT;
END;
$$;

-- Function to get entity statistics for a user
CREATE OR REPLACE FUNCTION get_user_entity_stats(p_user_id UUID)
RETURNS TABLE(
  entity_type TEXT,
  entity_count BIGINT,
  avg_confidence NUMERIC,
  total_mentions BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    re.type as entity_type,
    COUNT(*) as entity_count,
    ROUND(AVG(rce.confidence), 3) as avg_confidence,
    SUM(COALESCE((re.metadata->>'mention_count')::INTEGER, 1)) as total_mentions
  FROM rag_entities re
  INNER JOIN rag_chunk_entities rce ON re.id = rce.entity_id
  INNER JOIN rag_chunks rc ON rce.chunk_id = rc.id
  INNER JOIN rag_documents rd ON rc.doc_id = rd.id
  WHERE rd.user_id = p_user_id
  GROUP BY re.type
  ORDER BY entity_count DESC;
$$;

-- Function to find orphaned entities (not connected to any user documents)
CREATE OR REPLACE FUNCTION find_orphaned_entities()
RETURNS TABLE(
  entity_id BIGINT,
  canonical_name TEXT,
  type TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    re.id as entity_id,
    re.canonical_name,
    re.type,
    re.created_at
  FROM rag_entities re
  LEFT JOIN rag_chunk_entities rce ON re.id = rce.entity_id
  WHERE rce.entity_id IS NULL
  ORDER BY re.created_at DESC;
$$;

-- Function to clean up orphaned entities
CREATE OR REPLACE FUNCTION cleanup_orphaned_entities()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Delete relations referencing orphaned entities first
  WITH orphaned_entities AS (
    SELECT re.id
    FROM rag_entities re
    LEFT JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    WHERE rce.entity_id IS NULL
  )
  DELETE FROM rag_relations 
  WHERE head_id IN (SELECT id FROM orphaned_entities) 
     OR tail_id IN (SELECT id FROM orphaned_entities);
  
  -- Delete the orphaned entities
  WITH orphaned_entities AS (
    SELECT re.id
    FROM rag_entities re
    LEFT JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    WHERE rce.entity_id IS NULL
  )
  DELETE FROM rag_entities 
  WHERE id IN (SELECT id FROM orphaned_entities);
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Function to get knowledge graph connectivity stats
CREATE OR REPLACE FUNCTION get_kg_connectivity_stats(p_user_id UUID)
RETURNS TABLE(
  total_entities BIGINT,
  connected_entities BIGINT,
  isolated_entities BIGINT,
  total_relations BIGINT,
  avg_entity_degree NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_entities BIGINT;
  v_connected_entities BIGINT;
  v_isolated_entities BIGINT;
  v_total_relations BIGINT;
  v_avg_degree NUMERIC;
BEGIN
  -- Get user's entities
  WITH user_entities AS (
    SELECT DISTINCT re.id
    FROM rag_entities re
    INNER JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    INNER JOIN rag_chunks rc ON rce.chunk_id = rc.id
    INNER JOIN rag_documents rd ON rc.doc_id = rd.id
    WHERE rd.user_id = p_user_id
  )
  SELECT COUNT(*) INTO v_total_entities FROM user_entities;
  
  -- Get connected entities (entities with at least one relation)
  WITH user_entities AS (
    SELECT DISTINCT re.id
    FROM rag_entities re
    INNER JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    INNER JOIN rag_chunks rc ON rce.chunk_id = rc.id
    INNER JOIN rag_documents rd ON rc.doc_id = rd.id
    WHERE rd.user_id = p_user_id
  ),
  connected AS (
    SELECT DISTINCT ue.id
    FROM user_entities ue
    INNER JOIN rag_relations rr ON ue.id = rr.head_id OR ue.id = rr.tail_id
  )
  SELECT COUNT(*) INTO v_connected_entities FROM connected;
  
  v_isolated_entities := v_total_entities - v_connected_entities;
  
  -- Get total relations for user's entities
  WITH user_entities AS (
    SELECT DISTINCT re.id
    FROM rag_entities re
    INNER JOIN rag_chunk_entities rce ON re.id = rce.entity_id
    INNER JOIN rag_chunks rc ON rce.chunk_id = rc.id
    INNER JOIN rag_documents rd ON rc.doc_id = rd.id
    WHERE rd.user_id = p_user_id
  )
  SELECT COUNT(*)
  INTO v_total_relations
  FROM rag_relations rr
  WHERE rr.head_id IN (SELECT id FROM user_entities)
     OR rr.tail_id IN (SELECT id FROM user_entities);
  
  -- Calculate average degree (relations per entity)
  IF v_total_entities > 0 THEN
    v_avg_degree := ROUND(v_total_relations::NUMERIC / v_total_entities, 2);
  ELSE
    v_avg_degree := 0;
  END IF;
  
  -- Return results
  total_entities := v_total_entities;
  connected_entities := v_connected_entities;
  isolated_entities := v_isolated_entities;
  total_relations := v_total_relations;
  avg_entity_degree := v_avg_degree;
  
  RETURN NEXT;
END;
$$;

-- Function to merge duplicate entities
CREATE OR REPLACE FUNCTION merge_duplicate_entities(
  p_keep_entity_id BIGINT,
  p_merge_entity_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_keep_entity rag_entities%ROWTYPE;
  v_merge_entity rag_entities%ROWTYPE;
  v_merged_aliases TEXT[];
BEGIN
  -- Get both entities
  SELECT * INTO v_keep_entity FROM rag_entities WHERE id = p_keep_entity_id;
  SELECT * INTO v_merge_entity FROM rag_entities WHERE id = p_merge_entity_id;
  
  IF NOT FOUND OR v_keep_entity.id IS NULL OR v_merge_entity.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Merge aliases
  v_merged_aliases := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(v_keep_entity.aliases, ARRAY[]::TEXT[]) || 
      COALESCE(v_merge_entity.aliases, ARRAY[]::TEXT[]) ||
      ARRAY[v_merge_entity.canonical_name]
    )
  );
  
  -- Update chunk-entity relationships
  UPDATE rag_chunk_entities 
  SET entity_id = p_keep_entity_id,
      mention = CASE 
        WHEN LENGTH(mention) > LENGTH((SELECT mention FROM rag_chunk_entities WHERE entity_id = p_keep_entity_id AND chunk_id = rag_chunk_entities.chunk_id LIMIT 1))
        THEN mention
        ELSE COALESCE((SELECT mention FROM rag_chunk_entities WHERE entity_id = p_keep_entity_id AND chunk_id = rag_chunk_entities.chunk_id LIMIT 1), mention)
      END
  WHERE entity_id = p_merge_entity_id;
  
  -- Update relations
  UPDATE rag_relations SET head_id = p_keep_entity_id WHERE head_id = p_merge_entity_id;
  UPDATE rag_relations SET tail_id = p_keep_entity_id WHERE tail_id = p_merge_entity_id;
  
  -- Update keep entity with merged data
  UPDATE rag_entities 
  SET aliases = v_merged_aliases,
      metadata = jsonb_build_object(
        'mention_count', GREATEST(
          COALESCE((v_keep_entity.metadata->>'mention_count')::INTEGER, 1),
          COALESCE((v_merge_entity.metadata->>'mention_count')::INTEGER, 1)
        ),
        'merged_from', v_merge_entity.canonical_name,
        'merged_at', NOW()
      ) || COALESCE(v_keep_entity.metadata, '{}'::jsonb)
  WHERE id = p_keep_entity_id;
  
  -- Delete the merged entity
  DELETE FROM rag_entities WHERE id = p_merge_entity_id;
  
  RETURN TRUE;
END;
$$;

-- Create indexes for better knowledge graph query performance
CREATE INDEX IF NOT EXISTS idx_rag_entities_canonical_name_gin 
ON rag_entities USING gin(canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rag_entities_aliases_gin 
ON rag_entities USING gin(aliases);

CREATE INDEX IF NOT EXISTS idx_rag_entities_type 
ON rag_entities(type);

CREATE INDEX IF NOT EXISTS idx_rag_entities_metadata_mention_count 
ON rag_entities USING gin((metadata->'mention_count'));

CREATE INDEX IF NOT EXISTS idx_rag_relations_head_tail 
ON rag_relations(head_id, tail_id);

CREATE INDEX IF NOT EXISTS idx_rag_relations_relation_type 
ON rag_relations(relation);

CREATE INDEX IF NOT EXISTS idx_rag_relations_confidence 
ON rag_relations(confidence DESC);

CREATE INDEX IF NOT EXISTS idx_rag_chunk_entities_entity_confidence 
ON rag_chunk_entities(entity_id, confidence DESC);

-- Enable trigram extension for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON FUNCTION clear_user_knowledge_graph IS 'Clear all knowledge graph data for a specific user';
COMMENT ON FUNCTION get_user_entity_stats IS 'Get entity statistics grouped by type for a user';
COMMENT ON FUNCTION find_orphaned_entities IS 'Find entities not connected to any user documents';
COMMENT ON FUNCTION cleanup_orphaned_entities IS 'Remove orphaned entities and their relations';
COMMENT ON FUNCTION get_kg_connectivity_stats IS 'Get knowledge graph connectivity metrics for a user';
COMMENT ON FUNCTION merge_duplicate_entities IS 'Merge two duplicate entities, keeping the first and merging data from the second';