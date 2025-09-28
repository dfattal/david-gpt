/**
 * Persona Management Types
 *
 * Type definitions for the multi-persona RAG system.
 */

import { z } from 'zod';

// =======================
// Core Persona Types
// =======================

export interface PersonaRecord {
  id: string;
  persona_id: string;
  content: string;
  validation_status: 'valid' | 'invalid' | 'warning' | null;
  validation_errors: string[];
  metadata: PersonaMetadata;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonaMetadata {
  title: string;
  version: string;
  last_updated: string;
  persona_id: string;
  description?: string;
  author?: string;
  tags?: string[];
}

export interface ChunkConstraints {
  abstract_max_words: number;
  metadata_chunk_max_chars: number;
  content_chunk_min_chars: number;
  content_chunk_max_chars: number;
  chunk_overlap_percentage: number;
}

export interface EntityRequirements {
  required_kinds: string[];
  min_entities_per_document: number;
  confidence_threshold: number;
}

export interface EdgeRequirements {
  required_types: string[];
  min_edges_per_document: number;
  require_evidence: boolean;
  evidence_min_length: number;
}

export interface QualityGates {
  min_completion_percentage: number;
  max_error_rate: number;
  require_identifiers: boolean;
  require_metadata_chunk: boolean;
  require_content_chunks: boolean;
}

// =======================
// Validation Schemas
// =======================

export const ChunkConstraintsSchema = z.object({
  abstract_max_words: z.number().min(50).max(500).default(200),
  metadata_chunk_max_chars: z.number().min(500).max(2000).default(1200),
  content_chunk_min_chars: z.number().min(200).max(1000).default(800),
  content_chunk_max_chars: z.number().min(1000).max(3000).default(2000),
  overlap_percentage: z.number().min(0).max(50).default(15),
});

export const EntityRequirementsSchema = z.object({
  required_kinds: z.array(z.string()).min(1),
  min_entities_per_document: z.number().min(0).default(3),
  confidence_threshold: z.number().min(0).max(1).default(0.7),
});

export const EdgeRequirementsSchema = z.object({
  required_types: z.array(z.string()).min(1),
  min_edges_per_document: z.number().min(0).default(2),
  require_evidence: z.boolean().default(true),
  evidence_min_length: z.number().min(10).default(50),
});

export const QualityGatesSchema = z.object({
  min_completion_percentage: z.number().min(0).max(100).default(90),
  max_error_rate: z.number().min(0).max(100).default(5),
  require_identifiers: z.boolean().default(true),
  require_metadata_chunk: z.boolean().default(true),
  require_content_chunks: z.boolean().default(true),
});

export const PersonaMetadataSchema = z.object({
  title: z.string().min(3).max(100),
  version: z
    .string()
    .regex(
      /^\d+\.\d+(\.\d+)?$/,
      'Version must follow semantic versioning (e.g., 1.0.0)'
    ),
  last_updated: z.string(),
  persona_id: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      'persona_id must contain only lowercase letters, numbers, and hyphens'
    ),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// =======================
// Persona Definition Types
// =======================

export interface PersonaDefinition {
  persona_id: string;
  content: string;
  metadata?: Partial<PersonaMetadata>;
}

export interface PersonaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  extractedMetadata: PersonaMetadata | null;
}

// =======================
// Canonical Entity Types
// =======================

export interface CanonicalEntityDefinition {
  description: string;
  aliases: string[];
  priority: number;
  domain?: string;
}

export interface CanonicalRelationshipDefinition {
  from: string;
  relation: string;
  to: string;
  confidence: number;
  context?: string;
}

export interface CanonicalEntitiesConfig {
  [entityKind: string]: {
    [canonicalName: string]: CanonicalEntityDefinition;
  };
}

// =======================
// Constraint Types
// =======================

export interface PersonaConstraints {
  required_doc_types: string[];
  abstract_max_words: number;
  metadata_chunk_max_chars: number;
  content_chunk_min_chars: number;
  content_chunk_max_chars: number;
  chunk_overlap_percentage: number;
  kg_required_entities: string[];
  kg_required_edges: string[];
  extra_identifiers?: string[];
  require_document_url_if_available?: boolean;
  min_entities_per_document: number;
  min_edges_per_document: number;
  require_evidence_for_edges?: boolean;
  default_processor: string;
  fallback_processors: string[];
  quality_gates: QualityGates;
  doctype_overrides?: Record<string, DocTypeOverride>;
  canonical_entities?: CanonicalEntitiesConfig;
  canonical_relationships?: CanonicalRelationshipDefinition[];
}

export interface DocTypeOverride {
  require_full_claims?: boolean;
  require_priority_date?: boolean;
  require_assignee?: boolean;
  require_inventors?: boolean;
  require_doi?: boolean;
  require_published_at?: boolean;
  require_authors?: boolean;
  require_abstract?: boolean;
  require_oem?: boolean;
  require_product_info?: boolean;
  require_updated_at?: boolean;
  min_word_count?: number;
  focus_technologies?: string[];
  focus_areas?: string[];
  focus_topics?: string[];
  default_processor?: string;
  fallback_processors?: string[];
}

// Zod Schemas
export const DocTypeOverrideSchema = z
  .object({
    require_full_claims: z.boolean().optional(),
    require_priority_date: z.boolean().optional(),
    require_assignee: z.boolean().optional(),
    require_inventors: z.boolean().optional(),
    require_doi: z.boolean().optional(),
    require_published_at: z.boolean().optional(),
    require_authors: z.boolean().optional(),
    require_abstract: z.boolean().optional(),
    require_oem: z.boolean().optional(),
    require_product_info: z.boolean().optional(),
    require_updated_at: z.boolean().optional(),
    min_word_count: z.number().optional(),
    focus_technologies: z.array(z.string()).optional(),
    focus_areas: z.array(z.string()).optional(),
    focus_topics: z.array(z.string()).optional(),
    default_processor: z.string().optional(),
    fallback_processors: z.array(z.string()).optional(),
  })
  .optional();

// Canonical Entity Schemas
export const CanonicalEntityDefinitionSchema = z.object({
  description: z.string().min(10).max(500),
  aliases: z.array(z.string().min(2)).min(1),
  priority: z.number().min(1).max(10).default(5),
  domain: z.string().optional(),
});

export const CanonicalRelationshipDefinitionSchema = z.object({
  from: z.string().min(2),
  relation: z.string().min(2),
  to: z.string().min(2),
  confidence: z.number().min(0).max(1),
  context: z.string().optional(),
});

export const CanonicalEntitiesConfigSchema = z.record(
  z.record(CanonicalEntityDefinitionSchema)
);

export const PersonaConstraintsSchema = z.object({
  required_doc_types: z.array(z.string()),
  abstract_max_words: z.number().positive(),
  metadata_chunk_max_chars: z.number().positive(),
  content_chunk_min_chars: z.number().positive(),
  content_chunk_max_chars: z.number().positive(),
  chunk_overlap_percentage: z.number().min(0).max(50),
  kg_required_entities: z.array(z.string()),
  kg_required_edges: z.array(z.string()),
  extra_identifiers: z.array(z.string()).optional(),
  require_document_url_if_available: z.boolean().optional(),
  min_entities_per_document: z.number().min(0),
  min_edges_per_document: z.number().min(0),
  require_evidence_for_edges: z.boolean().optional(),
  default_processor: z.string(),
  fallback_processors: z.array(z.string()),
  quality_gates: QualityGatesSchema,
  doctype_overrides: z.record(DocTypeOverrideSchema).optional(),
  canonical_entities: CanonicalEntitiesConfigSchema.optional(),
  canonical_relationships: z
    .array(CanonicalRelationshipDefinitionSchema)
    .optional(),
});

// =======================
// Operation Types
// =======================

export interface CreatePersonaRequest {
  persona_id: string;
  content: string;
  validate?: boolean;
}

export interface UpdatePersonaRequest {
  content?: string;
  is_active?: boolean;
  validate?: boolean;
}

// API Request/Response Types
export const PersonaCreateRequestSchema = z.object({
  metadata: PersonaMetadataSchema,
  constraints_yaml: z.string(),
  persona_md: z.string(),
});

export const PersonaUpdateRequestSchema = z.object({
  metadata: PersonaMetadataSchema.partial().optional(),
  constraints_yaml: z.string().optional(),
  persona_md: z.string().optional(),
});

export interface PersonaListFilters {
  is_active?: boolean;
  validation_status?: string;
  expertise_domain?: string;
}

export interface PersonaOperationResult {
  success: boolean;
  persona?: PersonaRecord;
  errors?: string[];
  warnings?: string[];
}

export type PersonaOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'validate'
  | 'activate'
  | 'deactivate';

// =======================
// Persona Configuration Types (for RAG Pipeline)
// =======================

export interface PersonaConfig {
  persona_id: string;
  metadata: PersonaMetadata;
  constraints: PersonaConstraints;
  database_id?: string; // UUID from database
  is_active: boolean;
  validation_status: 'valid' | 'invalid' | 'warning' | null;
}

export interface PersonaConfigResult {
  success: boolean;
  config?: PersonaConfig;
  errors?: string[];
  warnings?: string[];
}

// Document Processing Configuration derived from PersonaConfig
export interface DocumentProcessingConfig {
  persona_id: string;
  document_types: string[];
  chunk_constraints: ChunkConstraints;
  entity_requirements: EntityRequirements;
  quality_gates: QualityGates;
  default_processor: string;
  fallback_processors: string[];
  doctype_overrides?: Record<string, DocTypeOverride>;
}

// Search Configuration for RAG retrieval
export interface SearchConfig {
  persona_id: string;
  allowed_document_types: string[];
  allowed_entity_kinds: string[];
  allowed_relationship_types: string[];
  reranking_config?: {
    max_results: number;
    diversity_threshold: number;
  };
}
