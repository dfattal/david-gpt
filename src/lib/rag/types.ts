// RAG Type Definitions for David-GPT
// Phase 1: Foundation types for documents, chunks, entities, and jobs

export interface RAGDocument {
  id: string
  owner: string
  source_type: 'text' | 'url' | 'pdf' | 'docx'
  source_uri?: string
  title: string
  doc_date: string // ISO date string (YYYY-MM-DD)
  tags: string[]
  labels: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RAGChunk {
  id: number
  doc_id: string
  chunk_index: number
  content: string
  embedding?: number[] // Vector embedding (1536 dimensions for OpenAI)
  fts?: string // Full-text search vector (internal PostgreSQL format)
  chunk_date?: string // Optional override date
  tags: string[]
  labels: Record<string, unknown>
  created_at: string
}

export interface RAGEntity {
  id: number
  canonical_name: string
  type: 'company' | 'product' | 'tech' | 'team' | 'person' | 'event' | 'publication'
  aliases: string[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface RAGRelation {
  id: number
  head_id: number
  relation: 'partnered_with' | 'developed_by' | 'developed' | 'launched_by' | 
           'launched' | 'uses_technology' | 'funded_by' | 'led_by' | 
           'competitor_of' | 'acquired'
  tail_id: number
  evidence_chunk_id?: number
  confidence: number // 0.0 to 1.0
  created_at: string
}

export interface RAGChunkEntity {
  chunk_id: number
  entity_id: number
  mention: string // How entity appears in the chunk
  confidence: number // 0.0 to 1.0
  created_at: string
}

export interface RAGIngestJob {
  id: string
  owner: string
  payload: Record<string, unknown>
  status: 'queued' | 'processing' | 'completed' | 'error'
  error?: string
  created_at: string
  updated_at: string
}

// Request/Response types for API endpoints
export interface DocumentUploadRequest {
  title: string
  content: string
  source_type: 'text' | 'url' | 'pdf' | 'docx'
  source_uri?: string
  doc_date?: string
  tags?: string[]
  labels?: Record<string, unknown>
}

export interface DocumentListResponse {
  documents: RAGDocument[]
  pagination: {
    limit: number
    offset: number
    count: number
  }
}

export interface JobCreateRequest {
  document_id: string
  operation: 'chunk_and_embed' | 'extract_entities' | 'reprocess'
  payload?: Record<string, unknown>
}

export interface JobListResponse {
  jobs: RAGIngestJob[]
  pagination: {
    limit: number
    offset: number
    count: number
  }
}

// Retrieval types (for future phases)
export interface RetrievalQuery {
  text: string
  filters?: {
    tags?: string[]
    labels?: Record<string, unknown>
    doc_date_from?: string
    doc_date_to?: string
    source_types?: string[]
  }
  limit?: number
  hybrid_alpha?: number // Weight for vector vs BM25 (0.0 = BM25 only, 1.0 = vector only)
}

export interface RetrievalResult {
  chunk: RAGChunk
  document: RAGDocument
  score: number
  rank: number
  source: 'vector' | 'bm25' | 'hybrid'
}

export interface RAGContext {
  query: string
  results: RetrievalResult[]
  total_results: number
  retrieval_time_ms: number
}

// Knowledge Graph types (for future phases)
export interface EntityMatch {
  entity: RAGEntity
  mention: string
  confidence: number
}

export interface RelationPath {
  entities: RAGEntity[]
  relations: RAGRelation[]
  path_length: number
  confidence: number
}

export interface KGExpansionResult {
  original_entities: EntityMatch[]
  expanded_entities: RAGEntity[]
  relation_paths: RelationPath[]
  additional_chunks: RAGChunk[]
}

// Error types
export interface RAGError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// Constants
export const RAG_CONSTANTS = {
  EMBEDDING_DIMENSIONS: 1536, // OpenAI text-embedding-3-small
  CHUNK_SIZE_MIN: 200,
  CHUNK_SIZE_MAX: 300,
  CHUNK_OVERLAP: 50,
  MAX_RETRIEVAL_RESULTS: 100,
  DEFAULT_RETRIEVAL_LIMIT: 20,
  DEFAULT_HYBRID_ALPHA: 0.6, // Slight preference for vector search
  CONFIDENCE_THRESHOLD: 0.1,
  HIGH_CONFIDENCE_THRESHOLD: 0.8
} as const

// Utility type guards
export function isRAGDocument(obj: unknown): obj is RAGDocument {
  if (!obj || typeof obj !== 'object') return false
  const record = obj as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.title === 'string'
}

export function isRAGChunk(obj: unknown): obj is RAGChunk {
  if (!obj || typeof obj !== 'object') return false
  const record = obj as Record<string, unknown>
  return typeof record.id === 'number' && typeof record.content === 'string'
}

export function isRAGEntity(obj: unknown): obj is RAGEntity {
  if (!obj || typeof obj !== 'object') return false
  const record = obj as Record<string, unknown>
  return typeof record.id === 'number' && typeof record.canonical_name === 'string'
}