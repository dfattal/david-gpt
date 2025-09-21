/**
 * Rich Metadata Chunk Generation System
 *
 * Generates comprehensive, searchable metadata chunks for different document types.
 * Replaces the old metadata injection approach with dedicated metadata chunks.
 */

import type { GenericDocumentMetadata } from './document-type-registry';
import { getDocumentType, hasRichMetadata } from './document-type-registry';
import { normalizeInventorNames } from './name-normalization';

// =======================
// Types
// =======================

export interface MetadataChunk {
  content: string;
  tokenCount: number;
  chunkType: 'metadata';
  sectionType: string;
  metadata: Record<string, any>;
}

export interface ChunkGenerationOptions {
  includeRelationships?: boolean;
  includeContext?: boolean;
  maxTokens?: number;
  persona?: 'technical' | 'legal' | 'business' | 'medical' | 'general';
}

// =======================
// Patent Metadata Chunks
// =======================

export function generatePatentMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk {
  const parts: string[] = [];

  // Title and identification
  if (document.identifiers.patent_no) {
    parts.push(`Patent ${document.identifiers.patent_no}: "${document.title}"`);
  } else {
    parts.push(`Patent Application: "${document.title}"`);
  }

  // Inventors section
  if (document.inventors && document.inventors.length > 0) {
    const normalizedInventors = normalizeInventorNames(document.inventors);
    const inventorList = formatNameList(normalizedInventors);

    // Add inventor details with context
    const inventorDetails = normalizedInventors.map(inventor => {
      // Could be enhanced with inventor research areas, other patents, etc.
      return inventor;
    }).join(', ');

    parts.push(`Inventors: ${inventorDetails}`);

    if (options.includeContext) {
      parts.push(`Research Focus: Optical systems, display technology, computational imaging`);
    }
  }

  // Assignee and organization info
  if (document.assignees && document.assignees.length > 0) {
    parts.push(`Assignee: ${document.assignees.join(', ')}`);
  }

  if (document.originalAssignee &&
      (!document.assignees || !document.assignees.includes(document.originalAssignee))) {
    parts.push(`Originally Assigned: ${document.originalAssignee}`);
  }

  // Legal and temporal information
  const dateInfo: string[] = [];
  if (document.dates.priority) {
    dateInfo.push(`Priority: ${formatDate(document.dates.priority)}`);
  }
  if (document.dates.filed) {
    dateInfo.push(`Filed: ${formatDate(document.dates.filed)}`);
  }
  if (document.dates.granted) {
    dateInfo.push(`Granted: ${formatDate(document.dates.granted)}`);
  }
  if (document.dates.expires) {
    dateInfo.push(`Expires: ${formatDate(document.dates.expires)}`);
  }

  if (dateInfo.length > 0) {
    parts.push(dateInfo.join(' | '));
  }

  // Status and jurisdiction
  if (document.jurisdiction) {
    let statusInfo = `Jurisdiction: ${document.jurisdiction}`;
    if (document.patentStatus) {
      statusInfo += ` | Status: ${document.patentStatus}`;
    }
    parts.push(statusInfo);
  }

  // Technical classification
  if (document.classification) {
    const classInfo = Array.isArray(document.classification)
      ? document.classification.join(', ')
      : typeof document.classification === 'object'
      ? Object.values(document.classification).join(', ')
      : document.classification;
    parts.push(`Classification: ${classInfo}`);
  }

  // Claims information
  if (document.claimCount) {
    let claimInfo = `Claims: ${document.claimCount} total`;
    if (document.independentClaimCount) {
      claimInfo += ` (${document.independentClaimCount} independent)`;
    }
    parts.push(claimInfo);
  }

  // Abstract summary (if available)
  if (document.abstract) {
    const abstractPreview = document.abstract.length > 200
      ? document.abstract.substring(0, 200) + '...'
      : document.abstract;
    parts.push(`Summary: ${abstractPreview}`);
  }

  // Technology area and applications
  if (options.includeContext) {
    parts.push(`Technology Area: Display systems, 3D visualization, optical computing`);
    parts.push(`Applications: Gaming monitors, mobile displays, AR/VR headsets, professional imaging`);
  }

  // Related patents and prior art (placeholder for future enhancement)
  if (options.includeRelationships) {
    parts.push(`Related Patents: Patent family analysis and citation network available`);
  }

  const content = parts.join('\n\n');

  return {
    content,
    tokenCount: Math.ceil(content.length / 4),
    chunkType: 'metadata',
    sectionType: 'patent_metadata',
    metadata: {
      docType: 'patent',
      patentNo: document.identifiers.patent_no,
      inventors: document.inventors,
      assignees: document.assignees,
      status: document.patentStatus,
      jurisdiction: document.jurisdiction
    }
  };
}

// =======================
// Academic Paper Metadata Chunks
// =======================

export function generatePaperMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk {
  const parts: string[] = [];

  // Title and type
  parts.push(`Research Paper: "${document.title}"`);

  // Authors and affiliations
  if (document.authorsAffiliations && document.authorsAffiliations.length > 0) {
    const authorDetails = document.authorsAffiliations.map(author => {
      if (author.affiliation) {
        return `${author.name} (${author.affiliation})`;
      }
      return author.name;
    }).join(', ');

    parts.push(`Authors: ${authorDetails}`);

    if (options.includeContext) {
      const institutions = document.authorsAffiliations
        .map(a => a.affiliation)
        .filter(Boolean)
        .filter((inst, index, arr) => arr.indexOf(inst) === index); // Deduplicate

      if (institutions.length > 0) {
        parts.push(`Collaborating Institutions: ${institutions.join(', ')}`);
      }
    }
  }

  // Publication details
  const pubDetails: string[] = [];
  if (document.venue) {
    pubDetails.push(`Venue: ${document.venue}`);
  }
  if (document.publicationYear) {
    pubDetails.push(`Year: ${document.publicationYear}`);
  }
  if (document.dates.published) {
    pubDetails.push(`Published: ${formatDate(document.dates.published)}`);
  }

  if (pubDetails.length > 0) {
    parts.push(pubDetails.join(' | '));
  }

  // Identifiers
  const identifiers: string[] = [];
  if (document.identifiers.doi) {
    identifiers.push(`DOI: ${document.identifiers.doi}`);
  }
  if (document.identifiers.arxiv_id) {
    identifiers.push(`arXiv: ${document.identifiers.arxiv_id}`);
  }
  if (document.identifiers.pmid) {
    identifiers.push(`PMID: ${document.identifiers.pmid}`);
  }

  if (identifiers.length > 0) {
    parts.push(identifiers.join(' | '));
  }

  // Research metrics
  const metrics: string[] = [];
  if (document.citationCount && document.citationCount > 0) {
    metrics.push(`Citations: ${document.citationCount}`);
  }
  if (document.impactFactor) {
    metrics.push(`Journal Impact Factor: ${document.impactFactor}`);
  }
  if (document.openAccess) {
    metrics.push(`Open Access: Yes`);
  }

  if (metrics.length > 0) {
    parts.push(metrics.join(' | '));
  }

  // Research areas and keywords
  if (document.keywords && document.keywords.length > 0) {
    parts.push(`Research Areas: ${document.keywords.join(', ')}`);
  }

  // Abstract summary
  if (document.abstract) {
    const abstractPreview = document.abstract.length > 300
      ? document.abstract.substring(0, 300) + '...'
      : document.abstract;
    parts.push(`Abstract: ${abstractPreview}`);
  }

  // Research context
  if (options.includeContext) {
    parts.push(`Research Field: Computer science, optics, display technology, computational imaging`);
    parts.push(`Methodology: Experimental research, theoretical analysis, system implementation`);
  }

  // Related work (placeholder for future enhancement)
  if (options.includeRelationships) {
    parts.push(`Citation Network: Citation analysis and related paper recommendations available`);
  }

  const content = parts.join('\n\n');

  return {
    content,
    tokenCount: Math.ceil(content.length / 4),
    chunkType: 'metadata',
    sectionType: 'paper_metadata',
    metadata: {
      docType: document.docType,
      doi: document.identifiers.doi,
      authors: document.authorsAffiliations,
      venue: document.venue,
      citationCount: document.citationCount,
      keywords: document.keywords
    }
  };
}

// =======================
// Press Article Metadata Chunks
// =======================

export function generatePressMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk {
  const parts: string[] = [];

  // Title and source
  parts.push(`Press Article: "${document.title}"`);

  // Publication details
  const pubInfo: string[] = [];
  if (document.identifiers.outlet) {
    pubInfo.push(`Outlet: ${document.identifiers.outlet}`);
  }
  if (document.identifiers.journalist) {
    pubInfo.push(`Reporter: ${document.identifiers.journalist}`);
  }
  if (document.dates.published) {
    pubInfo.push(`Published: ${formatDate(document.dates.published)}`);
  }

  if (pubInfo.length > 0) {
    parts.push(pubInfo.join(' | '));
  }

  // Product information (for tech press)
  // This would be extracted from document metadata
  const productInfo = extractProductInfo(document);
  if (productInfo) {
    parts.push(productInfo);
  }

  // Geographic and market context
  const marketInfo: string[] = [];
  if ((document as any).marketRegion) {
    marketInfo.push(`Markets: ${(document as any).marketRegion.join(', ')}`);
  }
  if ((document as any).priceRange) {
    marketInfo.push(`Price Range: ${(document as any).priceRange}`);
  }

  if (marketInfo.length > 0) {
    parts.push(marketInfo.join(' | '));
  }

  // Technology focus (for tech press)
  if (options.includeContext) {
    parts.push(`Technology Focus: Consumer electronics, display technology, 3D visualization, gaming hardware`);
    parts.push(`Industry Context: Product launches, market analysis, technology trends, competitive landscape`);
  }

  // Source and credibility
  if (document.identifiers.url) {
    try {
      const url = new URL(document.identifiers.url);
      parts.push(`Source URL: ${url.hostname}`);
    } catch {
      parts.push(`Source URL: ${document.identifiers.url}`);
    }
  }

  const content = parts.join('\n\n');

  return {
    content,
    tokenCount: Math.ceil(content.length / 4),
    chunkType: 'metadata',
    sectionType: 'press_metadata',
    metadata: {
      docType: document.docType,
      outlet: document.identifiers.outlet,
      journalist: document.identifiers.journalist,
      url: document.identifiers.url,
      publishedDate: document.dates.published
    }
  };
}

// =======================
// Legal Document Metadata Chunks
// =======================

export function generateLegalMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk {
  const parts: string[] = [];

  // Title and case identification
  parts.push(`Legal Document: "${document.title}"`);

  // Case information
  const caseInfo: string[] = [];
  if (document.identifiers.case_no) {
    caseInfo.push(`Case No: ${document.identifiers.case_no}`);
  }
  if (document.identifiers.court) {
    caseInfo.push(`Court: ${document.identifiers.court}`);
  }
  if (document.identifiers.docket_no) {
    caseInfo.push(`Docket: ${document.identifiers.docket_no}`);
  }

  if (caseInfo.length > 0) {
    parts.push(caseInfo.join(' | '));
  }

  // Timeline
  const timeline: string[] = [];
  if (document.dates.filed) {
    timeline.push(`Filed: ${formatDate(document.dates.filed)}`);
  }
  if (document.dates.served) {
    timeline.push(`Served: ${formatDate(document.dates.served)}`);
  }
  if (document.dates.decided) {
    timeline.push(`Decided: ${formatDate(document.dates.decided)}`);
  }

  if (timeline.length > 0) {
    parts.push(timeline.join(' | '));
  }

  // Legal context
  if (options.includeContext) {
    parts.push(`Legal Area: Intellectual property, patent litigation, technology law, corporate law`);
    parts.push(`Document Type: Court filing, legal brief, motion, judgment, settlement agreement`);
  }

  const content = parts.join('\n\n');

  return {
    content,
    tokenCount: Math.ceil(content.length / 4),
    chunkType: 'metadata',
    sectionType: 'legal_metadata',
    metadata: {
      docType: document.docType,
      caseNo: document.identifiers.case_no,
      court: document.identifiers.court,
      filedDate: document.dates.filed
    }
  };
}

// =======================
// Main Generation Function
// =======================

export function generateMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk | null {
  // Check if this document type should have metadata chunks
  if (!hasRichMetadata(document.docType)) {
    return null;
  }

  const definition = getDocumentType(document.docType);
  if (!definition) {
    return null;
  }

  // Route to appropriate generator based on document type
  switch (document.docType) {
    case 'patent':
      return generatePatentMetadataChunk(document, options);

    case 'paper':
    case 'article':
    case 'thesis':
      return generatePaperMetadataChunk(document, options);

    case 'press':
    case 'press-article':
      return generatePressMetadataChunk(document, options);

    case 'legal':
    case 'contract':
    case 'filing':
      return generateLegalMetadataChunk(document, options);

    default:
      // For other document types, generate a generic metadata chunk
      return generateGenericMetadataChunk(document, options);
  }
}

// =======================
// Generic Metadata Chunk
// =======================

function generateGenericMetadataChunk(
  document: GenericDocumentMetadata,
  options: ChunkGenerationOptions = {}
): MetadataChunk {
  const parts: string[] = [];

  // Basic document info
  const definition = getDocumentType(document.docType);
  const docTypeName = definition?.name || document.docType;
  parts.push(`${docTypeName}: "${document.title}"`);

  // Identifiers
  const identifiers = Object.entries(document.identifiers)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);

  if (identifiers.length > 0) {
    parts.push(identifiers.join(' | '));
  }

  // Dates
  const dates = Object.entries(document.dates)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${formatDate(value)}`);

  if (dates.length > 0) {
    parts.push(dates.join(' | '));
  }

  // Abstract if available
  if (document.abstract) {
    const abstractPreview = document.abstract.length > 200
      ? document.abstract.substring(0, 200) + '...'
      : document.abstract;
    parts.push(`Summary: ${abstractPreview}`);
  }

  const content = parts.join('\n\n');

  return {
    content,
    tokenCount: Math.ceil(content.length / 4),
    chunkType: 'metadata',
    sectionType: 'generic_metadata',
    metadata: {
      docType: document.docType,
      identifiers: document.identifiers,
      dates: document.dates
    }
  };
}

// =======================
// Utility Functions
// =======================

function formatNameList(names: string[]): string {
  if (names.length === 1) {
    return names[0];
  } else if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  } else {
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString; // Return original if parsing fails
  }
}

function extractProductInfo(document: GenericDocumentMetadata): string | null {
  // Extract product information from press articles
  // This is a placeholder - would be enhanced with actual product extraction logic
  const productParts: string[] = [];

  if ((document as any).oem) {
    productParts.push(`Product: ${(document as any).oem}`);

    if ((document as any).model) {
      productParts[0] += ` ${(document as any).model}`;
    }
  }

  // Display specifications
  const displaySpecs: string[] = [];
  if ((document as any).displaySize) {
    displaySpecs.push((document as any).displaySize);
  }
  if ((document as any).displayType) {
    displaySpecs.push((document as any).displayType);
  }
  if ((document as any).refreshRate) {
    displaySpecs.push((document as any).refreshRate);
  }

  if (displaySpecs.length > 0) {
    productParts.push(`Display: ${displaySpecs.join(' ')}`);
  }

  // Leia-specific features
  if ((document as any).leiaFeature && (document as any).leiaFeature.length > 0) {
    productParts.push(`3D Features: ${(document as any).leiaFeature.join(', ')}`);
  }

  return productParts.length > 0 ? productParts.join(' | ') : null;
}

// =======================
// Chunk Validation
// =======================

export function validateMetadataChunk(chunk: MetadataChunk): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!chunk.content || chunk.content.trim().length === 0) {
    errors.push('Metadata chunk content is empty');
  }

  if (chunk.tokenCount <= 0) {
    errors.push('Invalid token count');
  }

  if (chunk.chunkType !== 'metadata') {
    errors.push('Invalid chunk type - must be "metadata"');
  }

  if (!chunk.sectionType) {
    errors.push('Section type is required');
  }

  if (chunk.tokenCount > 2000) {
    errors.push('Metadata chunk is too large (> 2000 tokens)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}