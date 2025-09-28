/**
 * Extensible Metadata Template System for Document Chunks
 *
 * Provides standardized metadata injection templates for different document types
 * and personas to ensure metadata information is searchable in RAG.
 * Supports dynamic registration of new templates for different expert domains.
 */

import type { DocumentMetadata, Persona, MetadataTemplate } from './types';
import { normalizeInventorNames } from './name-normalization';
import { typeRegistry } from './type-registry';

// Extensible metadata interface for template generation
export interface ExtensibleDocumentMetadata {
  title?: string;
  docType: string;
  persona?: Persona;

  // Core fields
  patentNo?: string;
  inventors?: string[];
  assignees?: string[];
  originalAssignee?: string;
  filedDate?: string;
  grantedDate?: string;
  authorsAffiliations?: Array<{ name: string; affiliation?: string }>;
  venue?: string;
  publicationYear?: number;
  doi?: string;
  arxivId?: string;
  citationCount?: number;
  url?: string;
  date?: string;

  // David persona fields (tech/press)
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

  // Legal persona fields
  caseNumber?: string;
  courtLevel?: string;
  jurisdiction?: string;
  legalCitation?: string;
  caseParties?: { plaintiff?: string[]; defendant?: string[] };
  caseType?: string;
  legalTopics?: string[];
  courtName?: string;
  judgeName?: string;
  outcome?: string;
  precedential?: boolean;
  appealStatus?: string;
  decidedDate?: string;
  effectiveDate?: string;

  // Medical persona fields
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

  // Extensible custom fields
  customFields?: Record<string, any>;
}

// Legacy type for backward compatibility
export type SimpleDocumentMetadata = ExtensibleDocumentMetadata;

// Template registry for dynamic registration
class MetadataTemplateRegistry {
  private templates = new Map<string, MetadataTemplate>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates() {
    // Register David persona templates
    this.registerTemplate({
      name: 'patent',
      persona: 'david',
      documentTypes: ['patent'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generatePatentMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    this.registerTemplate({
      name: 'paper',
      persona: 'david',
      documentTypes: ['paper'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generatePaperMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    this.registerTemplate({
      name: 'press-article',
      persona: 'david',
      documentTypes: ['press-article'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generatePressArticleMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    this.registerTemplate({
      name: 'book',
      persona: 'david',
      documentTypes: ['book'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generateBookMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    this.registerTemplate({
      name: 'url',
      persona: 'david',
      documentTypes: ['url', 'note'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generateUrlMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    // Register Legal persona templates
    this.registerTemplate({
      name: 'legal',
      persona: 'legal',
      documentTypes: ['legal-doc', 'case-law', 'statute', 'legal-brief'],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generateLegalMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });

    // Register Medical persona templates
    this.registerTemplate({
      name: 'medical',
      persona: 'medical',
      documentTypes: [
        'medical-paper',
        'clinical-trial',
        'medical-guideline',
        'case-report',
      ],
      generateFooter: (metadata: ExtensibleDocumentMetadata) =>
        generateMedicalMetadata(metadata),
      estimateTokens: (metadata: ExtensibleDocumentMetadata) =>
        estimateTokensWithMetadata(0, metadata),
    });
  }

  registerTemplate(template: MetadataTemplate): void {
    this.templates.set(template.name, template);
    // Also register with the type registry
    typeRegistry.registerMetadataTemplate(template);
  }

  getTemplate(templateName: string): MetadataTemplate | undefined {
    return this.templates.get(templateName);
  }

  getTemplateForDocType(
    docType: string,
    persona?: Persona
  ): MetadataTemplate | undefined {
    // Find template that supports this document type and persona
    for (const template of this.templates.values()) {
      if (
        template.documentTypes.includes(docType as any) &&
        (!persona || template.persona === persona)
      ) {
        return template;
      }
    }
    return undefined;
  }

  getAllTemplates(): MetadataTemplate[] {
    return Array.from(this.templates.values());
  }
}

// Export singleton instance
export const templateRegistry = new MetadataTemplateRegistry();

/**
 * Generate metadata footer for legal documents
 */
export function generateLegalMetadata(
  metadata: ExtensibleDocumentMetadata
): string {
  const parts: string[] = [];

  if (metadata.caseNumber) {
    parts.push(`Case No. ${metadata.caseNumber}`);
  }

  if (metadata.caseParties) {
    const { plaintiff, defendant } = metadata.caseParties;
    if (plaintiff && defendant) {
      const plaintiffStr = Array.isArray(plaintiff)
        ? plaintiff.join(', ')
        : plaintiff;
      const defendantStr = Array.isArray(defendant)
        ? defendant.join(', ')
        : defendant;
      parts.push(`${plaintiffStr} v. ${defendantStr}`);
    }
  }

  if (metadata.courtLevel) {
    parts.push(`Court: ${metadata.courtLevel}`);
  }

  if (metadata.jurisdiction) {
    parts.push(`Jurisdiction: ${metadata.jurisdiction}`);
  }

  if (metadata.legalCitation) {
    parts.push(`Citation: ${metadata.legalCitation}`);
  }

  if (metadata.decidedDate) {
    parts.push(`Decided: ${new Date(metadata.decidedDate).getFullYear()}`);
  }

  if (metadata.outcome) {
    parts.push(`Outcome: ${metadata.outcome}`);
  }

  if (metadata.precedential) {
    parts.push('Precedential');
  }

  if (metadata.legalTopics && metadata.legalTopics.length > 0) {
    parts.push(`Topics: ${metadata.legalTopics.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Generate metadata footer for medical documents
 */
export function generateMedicalMetadata(
  metadata: ExtensibleDocumentMetadata
): string {
  const parts: string[] = [];

  if (metadata.clinicalTrialId) {
    parts.push(`Trial: ${metadata.clinicalTrialId}`);
  }

  if (metadata.pubmedId) {
    parts.push(`PMID: ${metadata.pubmedId}`);
  }

  if (metadata.studyType) {
    parts.push(`Study Type: ${metadata.studyType}`);
  }

  if (metadata.studyPhase) {
    parts.push(`Phase: ${metadata.studyPhase}`);
  }

  if (metadata.sampleSize) {
    parts.push(`N=${metadata.sampleSize}`);
  }

  if (metadata.medicalSpecialty && metadata.medicalSpecialty.length > 0) {
    parts.push(`Specialty: ${metadata.medicalSpecialty.join(', ')}`);
  }

  if (metadata.indication) {
    parts.push(`Indication: ${metadata.indication}`);
  }

  if (metadata.fdaApproval) {
    parts.push(`FDA: ${metadata.fdaApproval}`);
  }

  if (metadata.primaryEndpoint) {
    parts.push(`Primary Endpoint: ${metadata.primaryEndpoint}`);
  }

  if (metadata.meshTerms && metadata.meshTerms.length > 0) {
    parts.push(`MeSH: ${metadata.meshTerms.slice(0, 3).join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Generate metadata footer for patent documents
 */
export function generatePatentMetadata(
  metadata: ExtensibleDocumentMetadata
): string {
  const parts: string[] = [];

  if (metadata.patentNo) {
    parts.push(`Patent ${metadata.patentNo}`);
  }

  // Handle inventors with normalization
  if (metadata.inventors && Array.isArray(metadata.inventors)) {
    const inventors = metadata.inventors as string[];
    if (inventors.length > 0) {
      // Normalize inventor names for better searchability
      const normalizedInventors = normalizeInventorNames(inventors);
      const inventorList =
        normalizedInventors.length === 1
          ? normalizedInventors[0]
          : normalizedInventors.length === 2
            ? `${normalizedInventors[0]}, ${normalizedInventors[1]}`
            : `${normalizedInventors.slice(0, -1).join(', ')}, ${normalizedInventors[normalizedInventors.length - 1]}`;
      parts.push(`Inventors: ${inventorList}`);
    }
  }

  // Handle assignees
  if (metadata.assignees && Array.isArray(metadata.assignees)) {
    const assignees = metadata.assignees as string[];
    if (assignees.length > 0) {
      parts.push(`Assignee: ${assignees.join(', ')}`);
    }
  }

  // Handle original assignee if different
  if (
    metadata.originalAssignee &&
    (!metadata.assignees ||
      !metadata.assignees.includes(metadata.originalAssignee))
  ) {
    parts.push(`Originally: ${metadata.originalAssignee}`);
  }

  // Handle dates
  if (metadata.filedDate) {
    parts.push(`Filed: ${new Date(metadata.filedDate).getFullYear()}`);
  }

  if (metadata.grantedDate) {
    parts.push(`Granted: ${new Date(metadata.grantedDate).getFullYear()}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Generate metadata footer for academic papers
 */
export function generatePaperMetadata(
  metadata: SimpleDocumentMetadata
): string {
  const parts: string[] = [];

  // Handle authors
  if (
    metadata.authorsAffiliations &&
    Array.isArray(metadata.authorsAffiliations)
  ) {
    const authors = metadata.authorsAffiliations as Array<{
      name: string;
      affiliation?: string;
    }>;
    if (authors.length > 0) {
      const authorNames = authors.map(a => a.name);
      const authorList =
        authorNames.length === 1
          ? authorNames[0]
          : authorNames.length === 2
            ? `${authorNames[0]}, ${authorNames[1]}`
            : `${authorNames.slice(0, -1).join(', ')}, ${authorNames[authorNames.length - 1]}`;
      parts.push(`Authors: ${authorList}`);
    }
  }

  // Handle venue and year
  if (metadata.venue) {
    let venueInfo = metadata.venue;
    if (metadata.publicationYear) {
      venueInfo += ` (${metadata.publicationYear})`;
    }
    parts.push(`Published: ${venueInfo}`);
  } else if (metadata.publicationYear) {
    parts.push(`Published: ${metadata.publicationYear}`);
  }

  // Handle DOI
  if (metadata.doi) {
    parts.push(`DOI: ${metadata.doi}`);
  }

  // Handle arXiv
  if (metadata.arxivId) {
    parts.push(`arXiv: ${metadata.arxivId}`);
  }

  // Handle citations
  if (metadata.citationCount && metadata.citationCount > 0) {
    parts.push(`Citations: ${metadata.citationCount}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Generate metadata footer for book documents
 */
export function generateBookMetadata(metadata: SimpleDocumentMetadata): string {
  const parts: string[] = [];

  // Handle authors (assuming stored in authorsAffiliations for books too)
  if (
    metadata.authorsAffiliations &&
    Array.isArray(metadata.authorsAffiliations)
  ) {
    const authors = metadata.authorsAffiliations as Array<{
      name: string;
      affiliation?: string;
    }>;
    if (authors.length > 0) {
      const authorNames = authors.map(a => a.name);
      const authorList =
        authorNames.length === 1
          ? authorNames[0]
          : `${authorNames.slice(0, -1).join(', ')}, ${authorNames[authorNames.length - 1]}`;
      parts.push(`Authors: ${authorList}`);
    }
  }

  // Handle publication year
  if (metadata.publicationYear) {
    parts.push(`Published: ${metadata.publicationYear}`);
  }

  // Handle venue (publisher for books)
  if (metadata.venue) {
    parts.push(`Publisher: ${metadata.venue}`);
  }

  return parts.length > 0 ? `Book - ${parts.join(' - ')}` : 'Book';
}

/**
 * Generate metadata footer for URL/note documents
 */
export function generateUrlMetadata(metadata: SimpleDocumentMetadata): string {
  const parts: string[] = [];

  if (metadata.url) {
    try {
      const url = new URL(metadata.url);
      parts.push(`Source: ${url.hostname}`);
    } catch {
      parts.push(`Source: ${metadata.url}`);
    }
  }

  if (metadata.date) {
    parts.push(`Created: ${new Date(metadata.date).getFullYear()}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Generate metadata footer for press articles
 */
export function generatePressArticleMetadata(
  metadata: SimpleDocumentMetadata
): string {
  const parts: string[] = [];

  // OEM and product info
  if (metadata.oem) {
    let productInfo = metadata.oem;
    if (metadata.model) {
      productInfo += ` ${metadata.model}`;
    }
    parts.push(productInfo);
  }

  // Display specifications
  const displaySpecs: string[] = [];
  if (metadata.displaySize) {
    displaySpecs.push(metadata.displaySize);
  }
  if (metadata.displayType) {
    displaySpecs.push(metadata.displayType);
  }
  if (metadata.refreshRate) {
    displaySpecs.push(metadata.refreshRate);
  }
  if (displaySpecs.length > 0) {
    parts.push(`Display: ${displaySpecs.join(' ')}`);
  }

  // Leia features
  if (metadata.leiaFeature && metadata.leiaFeature.length > 0) {
    parts.push(`Leia Features: ${metadata.leiaFeature.join(', ')}`);
  }

  // Product category
  if (metadata.productCategory) {
    parts.push(`Category: ${metadata.productCategory}`);
  }

  // Publication info
  if (metadata.outlet) {
    let pubInfo = metadata.outlet;
    if (metadata.launchYear) {
      pubInfo += ` (${metadata.launchYear})`;
    }
    parts.push(`Published: ${pubInfo}`);
  } else if (metadata.launchYear) {
    parts.push(`Published: ${metadata.launchYear}`);
  }

  // Journalist
  if (metadata.journalist && metadata.journalist.length > 0) {
    const journalistList =
      metadata.journalist.length === 1
        ? metadata.journalist[0]
        : metadata.journalist.join(', ');
    parts.push(`Reporter: ${journalistList}`);
  }

  // Market info
  if (metadata.marketRegion && metadata.marketRegion.length > 0) {
    parts.push(`Markets: ${metadata.marketRegion.join(', ')}`);
  }

  if (metadata.priceRange) {
    parts.push(`Price: ${metadata.priceRange}`);
  }

  return parts.length > 0 ? parts.join(' - ') : '';
}

/**
 * Main function to generate appropriate metadata for any document type using extensible templates
 */
export function generateMetadataFooter(
  metadata: ExtensibleDocumentMetadata
): string {
  // Try to find a specific template for this document type and persona
  const template = templateRegistry.getTemplateForDocType(
    metadata.docType,
    metadata.persona
  );
  if (template) {
    return template.generateFooter(metadata);
  }

  // Fallback to legacy switching logic for backward compatibility
  switch (metadata.docType) {
    case 'patent':
      return generatePatentMetadata(metadata);
    case 'paper':
    case 'medical-paper':
      return generatePaperMetadata(metadata);
    case 'book':
      return generateBookMetadata(metadata);
    case 'press-article':
      return generatePressArticleMetadata(metadata);
    case 'legal-doc':
    case 'case-law':
    case 'statute':
    case 'legal-brief':
      return generateLegalMetadata(metadata);
    case 'clinical-trial':
    case 'medical-guideline':
    case 'case-report':
      return generateMedicalMetadata(metadata);
    case 'url':
    case 'note':
      // Check if this is a press article disguised as a URL
      if (metadata.oem || metadata.leiaFeature?.length) {
        return generatePressArticleMetadata(metadata);
      }
      return generateUrlMetadata(metadata);
    case 'pdf':
      // For PDFs, try to determine if it's a paper or other type
      if (metadata.doi || metadata.arxivId || metadata.venue) {
        return generatePaperMetadata(metadata);
      } else if (metadata.patentNo) {
        return generatePatentMetadata(metadata);
      } else {
        return generateUrlMetadata(metadata);
      }
    default:
      // Try to find any template that supports this document type
      const anyTemplate = templateRegistry
        .getAllTemplates()
        .find(t => t.documentTypes.includes(metadata.docType as any));
      if (anyTemplate) {
        return anyTemplate.generateFooter(metadata);
      }
      return '';
  }
}

/**
 * Inject metadata into abstract content using extensible templates
 */
export function injectMetadataIntoContent(
  content: string,
  metadata: ExtensibleDocumentMetadata
): string {
  const metadataFooter = generateMetadataFooter(metadata);

  if (!metadataFooter) {
    return content;
  }

  // Add metadata footer with proper spacing
  return `${content}\n\n${metadataFooter}`;
}

/**
 * Calculate token estimate for content with metadata using extensible templates
 */
export function estimateTokensWithMetadata(
  baseTokens: number,
  metadata: ExtensibleDocumentMetadata
): number {
  // Try to use template-specific estimation if available
  const template = templateRegistry.getTemplateForDocType(
    metadata.docType,
    metadata.persona
  );
  if (template && template.estimateTokens) {
    return template.estimateTokens(metadata) + baseTokens;
  }

  // Fallback to general estimation
  const metadataFooter = generateMetadataFooter(metadata);
  // Rough estimate: 1 token per 4 characters
  const metadataTokens = Math.ceil(metadataFooter.length / 4);
  return baseTokens + metadataTokens;
}

// Export convenience functions for registering new templates
export const {
  registerTemplate,
  getTemplate,
  getTemplateForDocType,
  getAllTemplates,
} = {
  registerTemplate: (template: MetadataTemplate) =>
    templateRegistry.registerTemplate(template),
  getTemplate: (templateName: string) =>
    templateRegistry.getTemplate(templateName),
  getTemplateForDocType: (docType: string, persona?: Persona) =>
    templateRegistry.getTemplateForDocType(docType, persona),
  getAllTemplates: () => templateRegistry.getAllTemplates(),
};

// Legacy function exports for backward compatibility
export function injectMetadataIntoContentLegacy(
  content: string,
  metadata: SimpleDocumentMetadata
): string {
  return injectMetadataIntoContent(content, metadata);
}

export function estimateTokensWithMetadataLegacy(
  baseTokens: number,
  metadata: SimpleDocumentMetadata
): number {
  return estimateTokensWithMetadata(baseTokens, metadata);
}
