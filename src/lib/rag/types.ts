/**
 * RAG System Type Definitions
 * 
 * Comprehensive type definitions for the citation-first RAG system
 * including document processing, hybrid search, and mini-KG structures.
 */

import { z } from 'zod';

// =======================
// Document Types
// =======================

export const DocumentTypeSchema = z.enum([
  'pdf', 'paper', 'patent', 'note', 'url', 'book'
]);

export const DocumentStatusSchema = z.enum([
  'draft', 'published', 'granted', 'expired', 'superseded'
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export interface DocumentMetadata {
  id: string;
  title: string;
  docType: DocumentType;
  status?: DocumentStatus;
  filePath?: string;
  fileSize?: number;
  fileHash?: string;
  
  // Academic identifiers
  doi?: string;
  arxivId?: string;
  pubmedId?: string;
  
  // Patent identifiers
  patentNo?: string;
  publicationNo?: string;
  applicationNo?: string;
  grantNo?: string;
  fundingAgency?: string;
  
  // Web identifiers
  url?: string;
  canonicalUrl?: string;
  
  // Date fields
  rawDate?: string;
  isoDate?: Date;
  filedDate?: Date;
  grantedDate?: Date;
  publishedDate?: Date;
  
  // Relationship fields
  canonicalOf?: string;
  supersededBy?: string;
  
  // Processing status
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processedAt?: Date;
  errorMessage?: string;
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  contentHash: string;
  tokenCount: number;
  chunkIndex: number;
  pageStart?: number;
  pageEnd?: number;
  sectionTitle?: string;
  overlapStart: number;
  overlapEnd: number;
  embedding?: number[];
  tsvectorContent?: string;
  createdAt: Date;
}

// =======================
// Mini-KG Types
// =======================

export const EntityKindSchema = z.enum([
  'person', 'org', 'product', 'algorithm', 'material', 'concept'
]);

export const RelationTypeSchema = z.enum([
  'author_of', 'inventor_of', 'assignee_of', 'implements', 'used_in', 
  'supersedes', 'cites', 'similar_to'
]);

export const EventTypeSchema = z.enum([
  'filed', 'published', 'granted', 'expires', 'product_launch', 'acquired', 'founded'
]);

export type EntityKind = z.infer<typeof EntityKindSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  description?: string;
  authorityScore: number;
  mentionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntityAlias {
  id: string;
  entityId: string;
  alias: string;
  isPrimary: boolean;
  confidence: number;
  createdAt: Date;
}

export interface KnowledgeEdge {
  id: string;
  srcId: string;
  srcType: 'entity' | 'document';
  rel: RelationType;
  dstId: string;
  dstType: 'entity' | 'document';
  weight: number;
  evidenceText?: string;
  evidenceDocId?: string;
  createdAt: Date;
}

export interface KnowledgeEvent {
  id: string;
  documentId?: string;
  entityId?: string;
  type: EventType;
  eventDate: Date;
  authority?: string;
  description?: string;
  createdAt: Date;
}

// =======================
// Search & Retrieval Types
// =======================

export interface SearchQuery {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: SearchFilters;
  mode?: SearchMode;
}

export interface SearchFilters {
  documentTypes?: DocumentType[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  entities?: string[];
  authors?: string[];
  patents?: boolean;
  papers?: boolean;
  documentIds?: string[]; // For context-aware search filtering
}

export const SearchModeSchema = z.enum(['semantic', 'keyword', 'hybrid']);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export interface SearchResult {
  documentId: string;
  chunkId?: string;
  score: number;
  rerankedScore?: number;
  content: string;
  title: string;
  docType: DocumentType;
  pageRange?: string;
  sectionTitle?: string;
  metadata: DocumentMetadata;
}

export interface HybridSearchResult {
  results: SearchResult[];
  totalCount: number;
  semanticResults: SearchResult[];
  keywordResults: SearchResult[];
  rerankedResults: SearchResult[];
  query: SearchQuery;
  executionTime: number;
}

// =======================
// Multi-turn Context Types
// =======================

export const TurnTypeSchema = z.enum([
  'new-topic', 'drill-down', 'compare', 'same-sources'
]);

export const ResponseModeSchema = z.enum([
  'FACT', 'EXPLAIN', 'CONFLICTS'
]);

export type TurnType = z.infer<typeof TurnTypeSchema>;
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

export interface ConversationContext {
  id: string;
  userId: string;
  title?: string;
  lastMessageAt: Date;
  contextSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  turnType?: TurnType;
  responseMode?: ResponseMode;
  processingTime?: number;
  sourcesUsed?: number;
  createdAt: Date;
}

export interface ConversationSource {
  id: string;
  conversationId: string;
  documentId: string;
  lastUsedAt: Date;
  carryScore: number;
  pinned: boolean;
  turnsInactive: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageCitation {
  id: string;
  messageId: string;
  documentId: string;
  chunkId?: string;
  marker: string; // e.g., "[1]", "[A1]", "[B2]"
  factSummary?: string;
  pageRange?: string;
  relevanceScore?: number;
  citationOrder?: number;
  createdAt: Date;
}

// =======================
// Processing Types
// =======================

export const JobTypeSchema = z.enum([
  'document_ingest', 'entity_extraction', 'embedding_generation', 
  'kg_processing', 'reindexing'
]);

export const JobStatusSchema = z.enum([
  'pending', 'processing', 'completed', 'failed', 'cancelled'
]);

export type JobType = z.infer<typeof JobTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;

export interface ProcessingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  documentId?: string;
  userId?: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  progress: number;
  progressMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// =======================
// External API Types
// =======================

export interface DOIMetadata {
  doi: string;
  title: string;
  authors: string[];
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  year?: number;
  publishedDate?: Date;
  abstract?: string;
  url?: string;
}

export interface PatentMetadata {
  patentNumber: string;
  title: string;
  inventors: string[];
  assignee?: string;
  applicationNumber?: string;
  publicationNumber?: string;
  filedDate?: Date;
  publishedDate?: Date;
  grantedDate?: Date;
  abstract?: string;
  claims?: string[];
  description?: string;
}

export interface GROBIDResponse {
  title?: string;
  authors?: Array<{
    firstName?: string;
    middleName?: string;
    surname?: string;
    fullName?: string;
  }>;
  abstract?: string;
  keywords?: string[];
  sections?: Array<{
    title?: string;
    content?: string;
    level?: number;
  }>;
  references?: Array<{
    title?: string;
    authors?: string[];
    year?: number;
    venue?: string;
  }>;
  figures?: Array<{
    caption?: string;
    coordinates?: string;
  }>;
}

// =======================
// Response Generation Types
// =======================

export interface FactResponse {
  answer: string;
  sources: SearchResult[];
  citations: MessageCitation[];
  confidence: number;
  structuredFields?: Record<string, unknown>;
}

export interface ExplainResponse {
  answer: string;
  context: string;
  sources: SearchResult[];
  citations: MessageCitation[];
  relatedEntities: Entity[];
  supportingEvidence: KnowledgeEdge[];
}

export interface ConflictsResponse {
  answer: string;
  primarySource: SearchResult;
  conflictingSources: SearchResult[];
  resolution: string;
  citations: MessageCitation[];
  authorityRanking: Array<{
    source: SearchResult;
    authorityScore: number;
    reason: string;
  }>;
}

export type RAGResponse = FactResponse | ExplainResponse | ConflictsResponse;

// =======================
// Configuration Types
// =======================

export interface ChunkingConfig {
  targetTokens: number; // 800-1200
  overlapPercent: number; // 15-20%
  minChunkTokens: number;
  maxChunkTokens: number;
  sectionAware: boolean;
}

export interface EmbeddingConfig {
  model: string; // 'text-embedding-3-small'
  dimensions: number; // 1536
  batchSize: number;
  maxRetries: number;
}

export interface SearchConfig {
  semanticWeight: number; // 0.7
  keywordWeight: number; // 0.3
  rerank: boolean;
  rerankModel?: string; // 'rerank-english-v3.0'
  maxResults: number; // 50
  finalLimit: number; // 10
  threshold: number; // 0.7
}

export interface ContextConfig {
  maxTurns: number; // 10
  decayFactor: number; // 0.7
  maxCarryOverSources: number; // 5
  turnTTL: number; // 3 turns
}

export interface RAGConfig {
  chunking: ChunkingConfig;
  embedding: EmbeddingConfig;
  search: SearchConfig;
  context: ContextConfig;
  ingestionTimeout: number; // 300000ms (5 min)
  responseTimeout: number; // 30000ms (30s)
}

// Default configuration
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  chunking: {
    targetTokens: 1000,
    overlapPercent: 17.5,
    minChunkTokens: 800,
    maxChunkTokens: 1200,
    sectionAware: true,
  },
  embedding: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
    maxRetries: 3,
  },
  search: {
    semanticWeight: 0.7,
    keywordWeight: 0.3,
    rerank: true,
    rerankModel: 'rerank-english-v3.0',
    maxResults: 50,
    finalLimit: 10,
    threshold: 0.1,
  },
  context: {
    maxTurns: 10,
    decayFactor: 0.7,
    maxCarryOverSources: 5,
    turnTTL: 3,
  },
  ingestionTimeout: 300000, // 5 minutes
  responseTimeout: 30000, // 30 seconds
};