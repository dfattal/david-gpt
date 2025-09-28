/**
 * Document Type Registry System
 *
 * Provides a generic, extensible system for defining document types
 * and their metadata structure. Enables the RAG system to be reused
 * across different personas and use cases.
 */

// =======================
// Core Types
// =======================

export interface DocumentTypeDefinition {
  /** Human-readable name for the document type */
  name: string;

  /** Description of what this document type represents */
  description: string;

  /** Primary identifier fields for exact lookups */
  identifierFields: string[];

  /** Date fields that are relevant for this document type */
  dateFields: string[];

  /** Rich metadata fields for enhanced chunk generation */
  richMetadataFields: string[];

  /** Whether this document type supports full-text content chunks */
  hasContentChunks: boolean;

  /** Whether this document type should generate special metadata chunks */
  hasMetadataChunks: boolean;

  /** Query patterns that indicate this document type */
  queryIndicators?: string[];

  /** Boost factor for queries that match this document type */
  queryBoost?: number;
}

export interface GenericDocumentMetadata {
  id: string;
  title: string;
  docType: string;
  identifiers: Record<string, string>;
  dates: Record<string, string>;

  // Rich metadata (stored in separate fields but used for chunk generation)
  inventors?: string[];
  assignees?: string[];
  originalAssignee?: string;
  authorsAffiliations?: Array<{ name: string; affiliation?: string }>;
  venue?: string;
  publicationYear?: number;
  keywords?: string[];
  citationCount?: number;
  abstract?: string;
  classification?: any;
  jurisdiction?: string;
  authority?: string;
  claimCount?: number;
  independentClaimCount?: number;
  patentStatus?: string;
  impactFactor?: number;
  openAccess?: boolean;

  // System metadata
  createdAt: Date;
  updatedAt: Date;
  ingestedAt?: Date;
  processedAt?: Date;
}

// =======================
// Document Type Registry
// =======================

export const DOCUMENT_TYPES: Record<string, DocumentTypeDefinition> = {
  // Technical/Research persona
  patent: {
    name: 'Patent',
    description: 'Patent documents from patent offices worldwide',
    identifierFields: ['patent_no', 'publication_no', 'application_no'],
    dateFields: ['filed', 'granted', 'published', 'priority', 'expires'],
    richMetadataFields: [
      'inventors',
      'assignees',
      'originalAssignee',
      'jurisdiction',
      'classification',
      'claimCount',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: [
      'patent',
      'invention',
      'inventor',
      'assignee',
      'claim',
      'USPTO',
      'EPO',
    ],
    queryBoost: 1.2,
  },

  paper: {
    name: 'Research Paper',
    description: 'Academic papers and research publications',
    identifierFields: ['doi', 'arxiv_id', 'pmid'],
    dateFields: ['submitted', 'accepted', 'published', 'conference'],
    richMetadataFields: [
      'authorsAffiliations',
      'venue',
      'keywords',
      'citationCount',
      'impactFactor',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: [
      'paper',
      'research',
      'study',
      'journal',
      'conference',
      'author',
    ],
    queryBoost: 1.1,
  },

  article: {
    name: 'Academic Article',
    description: 'Academic articles and journal publications',
    identifierFields: ['doi', 'arxiv_id', 'pmid'],
    dateFields: ['submitted', 'accepted', 'published'],
    richMetadataFields: [
      'authorsAffiliations',
      'venue',
      'keywords',
      'citationCount',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['article', 'journal', 'publication'],
    queryBoost: 1.1,
  },

  thesis: {
    name: 'Thesis/Dissertation',
    description: 'Academic theses and dissertations',
    identifierFields: ['university', 'degree', 'advisor'],
    dateFields: ['defended', 'published', 'submitted'],
    richMetadataFields: [
      'authorsAffiliations',
      'university',
      'degree',
      'advisor',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['thesis', 'dissertation', 'phd', 'masters'],
    queryBoost: 1.0,
  },

  // Legal persona
  legal: {
    name: 'Legal Document',
    description: 'Legal documents, court filings, and legal opinions',
    identifierFields: ['case_no', 'court', 'docket_no'],
    dateFields: ['filed', 'served', 'decided', 'deadline'],
    richMetadataFields: ['court', 'parties', 'attorneys', 'judges'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['case', 'court', 'legal', 'filing', 'judgment'],
    queryBoost: 1.3,
  },

  contract: {
    name: 'Contract',
    description: 'Legal contracts and agreements',
    identifierFields: ['contract_id', 'parties', 'jurisdiction'],
    dateFields: ['signed', 'effective', 'expires', 'terminated'],
    richMetadataFields: ['parties', 'contractType', 'jurisdiction', 'value'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['contract', 'agreement', 'license', 'terms'],
    queryBoost: 1.2,
  },

  filing: {
    name: 'Court Filing',
    description: 'Court filings, motions, and legal pleadings',
    identifierFields: ['docket_no', 'motion_type', 'court'],
    dateFields: ['filed', 'served', 'hearing_date', 'deadline'],
    richMetadataFields: ['motionType', 'court', 'parties', 'outcome'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['motion', 'filing', 'pleading', 'brief'],
    queryBoost: 1.1,
  },

  // Business persona
  report: {
    name: 'Business Report',
    description: 'Business reports, market research, and analytical documents',
    identifierFields: ['report_id', 'department', 'company'],
    dateFields: ['published', 'period_start', 'period_end', 'updated'],
    richMetadataFields: ['department', 'author', 'company', 'reportType'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['report', 'analysis', 'market', 'business', 'financial'],
    queryBoost: 1.0,
  },

  memo: {
    name: 'Internal Memo',
    description: 'Internal company memos and communications',
    identifierFields: ['memo_id', 'department', 'recipients'],
    dateFields: ['sent', 'deadline', 'follow_up'],
    richMetadataFields: ['sender', 'recipients', 'department', 'priority'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['memo', 'internal', 'communication', 'policy'],
    queryBoost: 0.9,
  },

  presentation: {
    name: 'Presentation',
    description: 'Business presentations and slide decks',
    identifierFields: ['event', 'audience', 'presenter'],
    dateFields: ['presented', 'created', 'updated'],
    richMetadataFields: ['presenter', 'audience', 'event', 'slideCount'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['presentation', 'slides', 'deck', 'meeting'],
    queryBoost: 0.8,
  },

  // Medical persona
  study: {
    name: 'Clinical Study',
    description: 'Clinical studies and medical research',
    identifierFields: ['nct_id', 'trial_phase', 'sponsor'],
    dateFields: ['started', 'completed', 'published', 'enrollment_end'],
    richMetadataFields: ['trialPhase', 'sponsor', 'indication', 'enrollment'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['clinical', 'trial', 'study', 'patient', 'drug'],
    queryBoost: 1.2,
  },

  guideline: {
    name: 'Medical Guideline',
    description: 'Medical guidelines and clinical protocols',
    identifierFields: ['society', 'version', 'guideline_id'],
    dateFields: ['published', 'updated', 'reviewed', 'expires'],
    richMetadataFields: [
      'society',
      'specialty',
      'evidenceLevel',
      'recommendations',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['guideline', 'protocol', 'recommendation', 'treatment'],
    queryBoost: 1.3,
  },

  // Generic document types
  book: {
    name: 'Book',
    description: 'Books, textbooks, and published volumes',
    identifierFields: ['isbn', 'publisher', 'edition'],
    dateFields: ['published', 'reprinted', 'revised'],
    richMetadataFields: [
      'authorsAffiliations',
      'publisher',
      'edition',
      'pages',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['book', 'textbook', 'volume', 'chapter'],
    queryBoost: 1.0,
  },

  note: {
    name: 'Personal Note',
    description: 'Personal notes, observations, and documentation',
    identifierFields: ['note_id', 'topic', 'source'],
    dateFields: ['created', 'updated', 'reviewed'],
    richMetadataFields: ['topic', 'source', 'tags', 'priority'],
    hasContentChunks: true,
    hasMetadataChunks: false, // Notes are usually short, don't need separate metadata chunks
    queryIndicators: ['note', 'observation', 'idea', 'thought'],
    queryBoost: 0.8,
  },

  press: {
    name: 'Press Article',
    description: 'Press articles, news reports, and media coverage',
    identifierFields: ['url', 'outlet', 'journalist'],
    dateFields: ['published', 'updated', 'archived'],
    richMetadataFields: ['outlet', 'journalist', 'category', 'region'],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['news', 'article', 'press', 'media', 'report'],
    queryBoost: 1.1,
  },

  'press-article': {
    name: 'Press Article',
    description: 'Press articles with product focus and technical details',
    identifierFields: ['url', 'outlet', 'journalist'],
    dateFields: ['published', 'updated'],
    richMetadataFields: [
      'outlet',
      'journalist',
      'oem',
      'model',
      'displaySpecs',
      'leiaFeatures',
    ],
    hasContentChunks: true,
    hasMetadataChunks: true,
    queryIndicators: ['product', 'launch', 'announce', 'release', 'specs'],
    queryBoost: 1.2,
  },

  webpage: {
    name: 'Web Content',
    description: 'Web pages, blog posts, and online content',
    identifierFields: ['url', 'domain', 'path'],
    dateFields: ['published', 'updated', 'crawled'],
    richMetadataFields: ['domain', 'author', 'category', 'tags'],
    hasContentChunks: true,
    hasMetadataChunks: false,
    queryIndicators: ['web', 'blog', 'online', 'website'],
    queryBoost: 0.7,
  },

  pdf: {
    name: 'PDF Document',
    description: 'Generic PDF documents (classification TBD)',
    identifierFields: ['file_path', 'file_hash'],
    dateFields: ['created', 'modified', 'processed'],
    richMetadataFields: ['fileSize', 'pageCount', 'author', 'subject'],
    hasContentChunks: true,
    hasMetadataChunks: false, // Will be classified to specific type during processing
    queryIndicators: ['pdf', 'document', 'file'],
    queryBoost: 0.9,
  },

  url: {
    name: 'URL Content',
    description: 'Generic URL-based content',
    identifierFields: ['url', 'canonical_url'],
    dateFields: ['fetched', 'updated', 'expires'],
    richMetadataFields: ['domain', 'contentType', 'language'],
    hasContentChunks: true,
    hasMetadataChunks: false,
    queryIndicators: ['url', 'link', 'web'],
    queryBoost: 0.6,
  },
} as const;

// =======================
// Registry Functions
// =======================

/**
 * Get document type definition by type key
 */
export function getDocumentType(
  docType: string
): DocumentTypeDefinition | null {
  return DOCUMENT_TYPES[docType] || null;
}

/**
 * Get all supported document types
 */
export function getAllDocumentTypes(): Record<string, DocumentTypeDefinition> {
  return DOCUMENT_TYPES;
}

/**
 * Get document types for a specific persona/use case
 */
export function getDocumentTypesForPersona(
  persona: 'technical' | 'legal' | 'business' | 'medical' | 'general'
): string[] {
  switch (persona) {
    case 'technical':
      return [
        'patent',
        'paper',
        'article',
        'thesis',
        'book',
        'note',
        'press',
        'press-article',
      ];
    case 'legal':
      return ['legal', 'contract', 'filing', 'patent', 'note', 'report'];
    case 'business':
      return ['report', 'memo', 'presentation', 'contract', 'note', 'press'];
    case 'medical':
      return ['study', 'guideline', 'paper', 'article', 'report', 'note'];
    case 'general':
      return Object.keys(DOCUMENT_TYPES);
    default:
      return Object.keys(DOCUMENT_TYPES);
  }
}

/**
 * Classify query intent based on document type indicators
 */
export function classifyQueryByDocumentType(query: string): {
  documentTypes: string[];
  confidence: number;
} {
  const lowerQuery = query.toLowerCase();
  const matches: Array<{ type: string; score: number }> = [];

  for (const [docType, definition] of Object.entries(DOCUMENT_TYPES)) {
    const indicators = definition.queryIndicators || [];
    const matchCount = indicators.filter(indicator =>
      lowerQuery.includes(indicator.toLowerCase())
    ).length;

    if (matchCount > 0) {
      const score = matchCount * (definition.queryBoost || 1.0);
      matches.push({ type: docType, score });
    }
  }

  // Sort by score and return top matches
  matches.sort((a, b) => b.score - a.score);

  const documentTypes = matches.slice(0, 3).map(m => m.type);
  const confidence =
    matches.length > 0 ? Math.min(matches[0].score / 3, 1.0) : 0;

  return { documentTypes, confidence };
}

/**
 * Validate document metadata against type definition
 */
export function validateDocumentMetadata(
  docType: string,
  metadata: Partial<GenericDocumentMetadata>
): { valid: boolean; errors: string[] } {
  const definition = getDocumentType(docType);
  if (!definition) {
    return { valid: false, errors: [`Unknown document type: ${docType}`] };
  }

  const errors: string[] = [];

  // Check required fields
  if (!metadata.title) {
    errors.push('Title is required');
  }

  // Check identifier fields (at least one should be present)
  const hasIdentifier = definition.identifierFields.some(
    field => metadata.identifiers && metadata.identifiers[field]
  );

  if (!hasIdentifier && definition.identifierFields.length > 0) {
    errors.push(
      `At least one identifier is required: ${definition.identifierFields.join(', ')}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extract structured metadata from generic document metadata
 */
export function extractStructuredMetadata(metadata: GenericDocumentMetadata): {
  identifiers: Record<string, string>;
  dates: Record<string, string>;
  richMetadata: Record<string, any>;
} {
  const definition = getDocumentType(metadata.docType);
  if (!definition) {
    throw new Error(`Unknown document type: ${metadata.docType}`);
  }

  // Extract identifiers
  const identifiers: Record<string, string> = {};
  for (const field of definition.identifierFields) {
    if (metadata.identifiers[field]) {
      identifiers[field] = metadata.identifiers[field];
    }
  }

  // Extract dates
  const dates: Record<string, string> = {};
  for (const field of definition.dateFields) {
    if (metadata.dates[field]) {
      dates[field] = metadata.dates[field];
    }
  }

  // Extract rich metadata
  const richMetadata: Record<string, any> = {};
  for (const field of definition.richMetadataFields) {
    if ((metadata as any)[field] !== undefined) {
      richMetadata[field] = (metadata as any)[field];
    }
  }

  return { identifiers, dates, richMetadata };
}

// =======================
// Type Guards
// =======================

export function isPatentDocument(docType: string): boolean {
  return docType === 'patent';
}

export function isAcademicDocument(docType: string): boolean {
  return ['paper', 'article', 'thesis'].includes(docType);
}

export function isLegalDocument(docType: string): boolean {
  return ['legal', 'contract', 'filing'].includes(docType);
}

export function isBusinessDocument(docType: string): boolean {
  return ['report', 'memo', 'presentation'].includes(docType);
}

export function isMedicalDocument(docType: string): boolean {
  return ['study', 'guideline'].includes(docType);
}

export function hasRichMetadata(docType: string): boolean {
  const definition = getDocumentType(docType);
  return definition ? definition.hasMetadataChunks : false;
}

export function hasContentChunks(docType: string): boolean {
  const definition = getDocumentType(docType);
  return definition ? definition.hasContentChunks : true; // Default to true
}
