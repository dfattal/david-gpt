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

// Base document types supported by all personas
export const BaseDocumentTypeSchema = z.enum([
  'pdf', 'paper', 'patent', 'note', 'url', 'book', 'press-article', 'url-list'
]);

// Extended document types for specific personas
export const LegalDocumentTypeSchema = z.enum([
  'legal-doc', 'case-law', 'statute', 'legal-brief'
]);

export const MedicalDocumentTypeSchema = z.enum([
  'medical-paper', 'clinical-trial', 'medical-guideline', 'case-report'
]);

export const TechnicalDocumentTypeSchema = z.enum([
  'technical-spec', 'api-doc', 'manual'
]);

// Combined schema that includes all possible document types
export const DocumentTypeSchema = z.union([
  BaseDocumentTypeSchema,
  LegalDocumentTypeSchema,
  MedicalDocumentTypeSchema,
  TechnicalDocumentTypeSchema,
  z.string() // Allow custom types for extensibility
]);

export const DocumentStatusSchema = z.enum([
  'draft', 'published', 'granted', 'expired', 'superseded'
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type BaseDocumentType = z.infer<typeof BaseDocumentTypeSchema>;
export type LegalDocumentType = z.infer<typeof LegalDocumentTypeSchema>;
export type MedicalDocumentType = z.infer<typeof MedicalDocumentTypeSchema>;
export type TechnicalDocumentType = z.infer<typeof TechnicalDocumentTypeSchema>;

// Persona types
export const PersonaSchema = z.enum(['david', 'legal', 'medical', 'technical']);
export type Persona = z.infer<typeof PersonaSchema>;

// Field validation for extensible metadata
export interface FieldValidation {
  type: 'string' | 'number' | 'date' | 'array' | 'enum' | 'boolean';
  pattern?: RegExp;
  values?: string[];
  required?: boolean;
  description?: string;
}

// Core persona configuration (original)
export interface PersonaConfig {
  name: string;
  description?: string;
  documentTypes: DocumentType[];
  defaultType: DocumentType;
  requiredFields: Record<string, FieldValidation>;
  optionalFields: Record<string, FieldValidation>;
  searchBoosts: Record<string, number>;
  citationFormat: string;
  metadataTemplates: string[];
}

// Enhanced persona configuration with rich descriptions
export interface EnhancedPersonaConfig extends PersonaConfig {
  // Rich persona description
  identity: {
    coreIdentity: string;
    background: string;
    narrative: string[];
  };

  // Communication style for chat responses
  communicationStyle: {
    tone: string;
    style: string;
    presence: string;
    voiceCharacteristics: string[];
    responseGuidelines: string[];
  };

  // Domain expertise for better document processing
  expertise: {
    domains: Array<{
      name: string;
      description: string;
      keywords: string[];
      concepts: string[];
    }>;
    achievements: string[];
    specializations: string[];
  };

  // Values and principles for response filtering
  coreValues: string[];

  // Chat system integration
  chat: {
    systemPrompt: string;
    responseStyle: 'conversational' | 'technical' | 'balanced';
    citationPreference: string;
    domainBoosts: Record<string, number>;
  };

  // Metadata from markdown parsing
  source?: {
    filePath: string;
    lastModified: Date;
    version: string;
  };
}

// Base metadata interface for all documents
export interface BaseDocumentMetadata {
  id: string;
  title: string;
  docType: DocumentType;
  persona?: Persona; // Optional, defaults to system configuration
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
  
  // New lean patent metadata fields
  inventors?: string[];
  assignees?: string[];
  originalAssignee?: string;
  priorityDate?: Date;
  expirationDate?: Date;
  expirationIsEstimate?: boolean;
  patentStatus?: string;
  abstract?: string;
  jurisdiction?: string;
  sourceUrl?: string;
  authority?: string;
  claimCount?: number;
  independentClaimCount?: number;
  classification?: string[];
  metaTitle?: string;
  
  // Academic article metadata fields
  authorsAffiliations?: Array<{name: string, affiliation?: string}>;
  venue?: string;
  publicationYear?: number;
  keywords?: string[];
  citationCount?: number;
  conferenceDate?: Date;
  impactFactor?: number;
  openAccess?: boolean;
  
  // Press article metadata fields
  oem?: string;
  model?: string;
  displaySize?: string;
  displayType?: 'OLED' | 'LCD' | 'MicroLED' | 'Other';
  refreshRate?: string;
  leiaFeature?: string[];
  productCategory?: string;
  journalist?: string[];
  outlet?: string;
  launchYear?: number;
  marketRegion?: string[];
  priceRange?: string;
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;

  // Extensible metadata - any additional fields for custom personas
  customFields?: Record<string, any>;
}

// Legal-specific metadata fields
export interface LegalDocumentMetadata extends BaseDocumentMetadata {
  // Legal identification
  caseNumber?: string;
  courtLevel?: 'Supreme Court' | 'Appeals' | 'District' | 'State' | 'Federal';
  jurisdiction?: string;
  legalCitation?: string;

  // Case information
  caseParties?: {
    plaintiff?: string[];
    defendant?: string[];
  };
  caseType?: 'Civil' | 'Criminal' | 'Constitutional' | 'Administrative';
  legalTopics?: string[];

  // Court details
  courtName?: string;
  judgeName?: string;
  attorneys?: Array<{
    name: string;
    firm?: string;
    represents: 'plaintiff' | 'defendant';
  }>;

  // Decision information
  outcome?: 'Granted' | 'Denied' | 'Dismissed' | 'Settled';
  precedential?: boolean;
  appealStatus?: 'Final' | 'Under Appeal' | 'Remanded';

  // Legal dates
  filedDate?: Date;
  decidedDate?: Date;
  effectiveDate?: Date;
}

// Medical-specific metadata fields
export interface MedicalDocumentMetadata extends BaseDocumentMetadata {
  // Medical identification
  clinicalTrialId?: string;
  pubmedId?: string;
  meshTerms?: string[];

  // Study information
  studyType?: 'RCT' | 'Observational' | 'Meta-Analysis' | 'Case Series';
  studyPhase?: 'Phase I' | 'Phase II' | 'Phase III' | 'Phase IV';
  patientPopulation?: string;
  sampleSize?: number;

  // Medical classification
  medicalSpecialty?: string[];
  interventionType?: 'Drug' | 'Device' | 'Procedure' | 'Behavioral';
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];

  // Regulatory information
  fdaApproval?: 'Approved' | 'Pending' | 'Denied';
  regulatoryBody?: string[];
  guideline?: string;

  // Clinical context
  indication?: string;
  contraindications?: string[];
  adverseEvents?: string[];
}

// Main DocumentMetadata type that can accommodate all personas
export interface DocumentMetadata extends BaseDocumentMetadata {
  // Legal fields (when persona = 'legal')
  caseNumber?: string;
  courtLevel?: string;
  jurisdiction?: string;
  legalCitation?: string;
  caseParties?: { plaintiff?: string[]; defendant?: string[] };
  caseType?: string;
  legalTopics?: string[];
  courtName?: string;
  judgeName?: string;
  attorneys?: Array<{ name: string; firm?: string; represents: string }>;
  outcome?: string;
  precedential?: boolean;
  appealStatus?: string;

  // Medical fields (when persona = 'medical')
  clinicalTrialId?: string;
  pubmedId?: string;
  meshTerms?: string[];
  studyType?: string;
  studyPhase?: string;
  patientPopulation?: string;
  sampleSize?: number;
  medicalSpecialty?: string[];
  interventionType?: string;
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];
  fdaApproval?: string;
  regulatoryBody?: string[];
  guideline?: string;
  indication?: string;
  contraindications?: string[];
  adverseEvents?: string[];
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

// Specialized chunk types for patent documents
export const PatentSectionTypeSchema = z.enum([
  'title', 'abstract', 'independent_claim', 'dependent_claims', 
  'background', 'summary', 'detailed_description', 'drawings'
]);

export type PatentSectionType = z.infer<typeof PatentSectionTypeSchema>;

export interface PatentChunk extends DocumentChunk {
  sectionType: PatentSectionType;
  claimNumber?: number; // For claim chunks
  dependsOnClaim?: number; // For dependent claim chunks  
  headingPath?: string; // e.g., "Background > Prior Art > Related Patents"
}

// Specialized chunk types for academic articles
export const ArticleSectionTypeSchema = z.enum([
  'title', 'abstract', 'introduction', 'related_work', 'methodology', 
  'results', 'discussion', 'conclusion', 'references', 'appendix',
  'figure_caption', 'table_caption'
]);

export type ArticleSectionType = z.infer<typeof ArticleSectionTypeSchema>;

export interface ArticleChunk extends DocumentChunk {
  sectionType: ArticleSectionType;
  headingPath?: string; // e.g., "Introduction > Motivation"
  figureNumber?: number; // For figure captions
  tableNumber?: number; // For table captions
}

// =======================
// Mini-KG Types
// =======================

export const EntityKindSchema = z.enum([
  'person', 'organization', 'product', 'technology', 'component', 'document'
]);

// Simplified, strict edge types for single-pass extraction
export const RelationTypeSchema = z.enum([
  'affiliated_with',  // person → organization
  'made_by',         // product → organization
  'implements',      // technology → product
  'uses_component',  // product → component
  'supplied_by'      // component → organization
]);

// Legacy relations (kept for backward compatibility but not extracted)
export const LegacyRelationTypeSchema = z.enum([
  // Patent/Document relations
  'author_of', 'inventor_of', 'assignee_of', 'cites', 'supersedes',
  // Technical relations
  'used_in', 'similar_to',
  // Spatial computing relations
  'enables_3d', 'competing_with', 'integrates_with',
  // Alternative implementation and enhancement relations
  'can_use', 'enhances', 'evolved_to', 'alternative_to'
]);

export const EventTypeSchema = z.enum([
  'filed', 'published', 'granted', 'expires', 'product_launch', 'acquired', 'founded',
  // Academic events
  'submitted', 'accepted', 'presented', 'conference', 'preprint_posted', 'peer_reviewed'
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

// Edge extraction result from LLM
export interface ExtractedEdge {
  src: {
    existing_id?: string;
    temp_id?: string;
  };
  rel: RelationType;
  dst: {
    existing_id?: string;
    temp_id?: string;
  };
  evidence: string;
  confidence: number;
}

// Validation matrix for allowed edge combinations
export const EDGE_VALIDATION_MATRIX: Record<RelationType, {
  srcType: EntityKind;
  dstType: EntityKind;
}> = {
  'affiliated_with': { srcType: 'person', dstType: 'organization' },
  'made_by': { srcType: 'product', dstType: 'organization' },
  'implements': { srcType: 'technology', dstType: 'product' },
  'uses_component': { srcType: 'product', dstType: 'component' },
  'supplied_by': { srcType: 'component', dstType: 'organization' }
};

// Combined extraction result
export interface EntityEdgeExtractionResult {
  entities: Array<{
    temp_id: string;
    name: string;
    type: EntityKind;
    aliases: string[];
    evidence: string;
    confidence: number;
  }>;
  edges: ExtractedEdge[];
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
  typeBoost?: number;
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
  // Relationship-aware search context
  relationshipContext?: any;
  enhancedQuery?: string;
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

// New lean patent metadata structure (stored in documents table)
export interface LeanPatentMetadata {
  patentNumber: string;
  jurisdiction: string;
  assignee?: string;
  originalAssignee?: string;
  inventors: string[];
  filingDate?: Date;
  grantDate?: Date;
  priorityDate?: Date;
  expirationDate?: Date;
  expirationIsEstimate: boolean;
  status: 'filed' | 'active' | 'expired';
  abstract: string;
  sourceUrl: string;
  authority: string;
  claimCount: number;
  independentClaimCount: number;
}

// Lean academic article metadata structure (stored in documents table)
export interface LeanArticleMetadata {
  title: string;
  authors: Array<{name: string, affiliation?: string}>;
  venue: string;
  doi?: string;
  arxivId?: string;
  publicationDate?: Date;
  status: string; // Published, Preprint, Accepted, In Review
  abstract: string;
  keywords: string[];
  citationCount?: number;
  sourceUrl: string;
  authority: string; // Crossref, arXiv, EXA
}

// Press article metadata structure for Leia technology coverage
export interface PressArticleMetadata {
  title: string;
  // OEM Information
  oem: string;                    // e.g., "Samsung", "LG", "TCL" 
  model?: string;                 // e.g., "Galaxy Tab S10", "OLED C4"
  
  // Display Technology
  displaySize?: string;           // e.g., "55-inch", "6.7-inch"
  displayType?: 'OLED' | 'LCD' | 'MicroLED' | 'Other';
  refreshRate?: string;           // e.g., "120Hz", "240Hz"
  
  // Leia Technology
  leiaFeature: string[];          // e.g., ["3D Display", "Immersive Gaming", "AR Interface"]
  productCategory: string;        // e.g., "TV", "Smartphone", "Tablet", "Monitor"
  
  // Article Metadata
  publicationDate: Date;
  journalist?: string[];
  outlet: string;                 // e.g., "The Verge", "CNET", "TechCrunch"
  
  // Market Context
  launchYear?: number;
  marketRegion?: string[];        // e.g., ["North America", "Europe", "Asia"]
  priceRange?: string;           // e.g., "$500-$1000", "Premium"
  
  // Content
  abstract: string;
  sourceUrl: string;
  authority: string;             // EXA, Direct
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
  fullText?: string; // Full extracted text content
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
  // Enhanced academic metadata
  doi?: string;
  venue?: string;
  year?: number;
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
    targetTokens: 800,
    overlapPercent: 17.5,
    minChunkTokens: 100,
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
    maxResults: 100,
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

// =======================
// Extensible Type System
// =======================

// Document type registry for dynamic registration
export interface DocumentTypeRegistration {
  name: string;
  persona: Persona;
  requiredFields: string[];
  optionalFields: string[];
  metadataTemplate: string;
  detectionRules?: DetectionRule[];
  validationSchema?: Record<string, FieldValidation>;
}

// Detection rules for automatic document type identification
export interface DetectionRule {
  filePatterns?: string[];
  contentPatterns?: RegExp[];
  urlPatterns?: RegExp[];
  confidence: number;
  priority?: number;
}

// Metadata template for dynamic content injection
export interface MetadataTemplate {
  name: string;
  persona: Persona;
  documentTypes: DocumentType[];
  generateFooter: (metadata: any) => string;
  estimateTokens?: (metadata: any) => number;
}

// Registry for extensible type system
export interface TypeRegistry {
  documentTypes: Map<string, DocumentTypeRegistration>;
  metadataTemplates: Map<string, MetadataTemplate>;
  detectionRules: Map<string, DetectionRule[]>;
  personas: Map<Persona, PersonaConfig>;
}

// Functions for type registration (to be implemented)
export interface TypeRegistrationFunctions {
  registerDocumentType: (registration: DocumentTypeRegistration) => void;
  registerMetadataTemplate: (template: MetadataTemplate) => void;
  registerDetectionRule: (docType: string, rule: DetectionRule) => void;
  registerPersona: (persona: Persona, config: PersonaConfig) => void;
  validateDocument: (docType: string, metadata: any) => ValidationResult;
}

// Validation result for document type checking
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestedType?: DocumentType;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}