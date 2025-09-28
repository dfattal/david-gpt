/**
 * Document Format Validator
 *
 * Validates markdown documents against the RAG ingestion format specification.
 * Ensures proper YAML frontmatter, content structure, and metadata completeness.
 */

import yaml from 'js-yaml';
import { z } from 'zod';
import { typeRegistry } from '@/lib/rag/type-registry';
import { personaManager } from '@/lib/personas/persona-manager';
import type { DocumentType, Persona } from '@/lib/rag/types';

// ===========================
// Validation Types
// ===========================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  qualityScore: number; // 0-100
  suggestions: string[];
}

export interface ValidationError {
  type: 'yaml' | 'structure' | 'content' | 'metadata';
  field?: string;
  message: string;
  line?: number;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'incomplete' | 'suboptimal' | 'missing';
  field?: string;
  message: string;
  suggestion: string;
}

export interface DocumentAnalysis {
  frontmatterValid: boolean;
  contentStructure: ContentStructureAnalysis;
  metadataCompleteness: MetadataAnalysis;
  searchOptimization: SearchOptimizationAnalysis;
  citationReadiness: CitationAnalysis;
}

export interface ContentStructureAnalysis {
  hasH1Title: boolean;
  hasAbstract: boolean;
  headingHierarchy: boolean;
  wordCount: number;
  estimatedReadingTime: number;
  sectionCount: number;
}

export interface MetadataAnalysis {
  requiredFieldsPresent: number;
  optionalFieldsPresent: number;
  domainSpecificFields: number;
  completenessScore: number;
}

export interface SearchOptimizationAnalysis {
  keywordDensity: number;
  technicalTermCount: number;
  headingOptimization: number;
  contextClarity: number;
}

export interface CitationAnalysis {
  structuredContent: boolean;
  factualPrecision: number;
  sectionClarity: number;
  referenceQuality: number;
}

// ===========================
// Core Metadata Schemas
// ===========================

const AuthorSchema = z.array(
  z.object({
    name: z.string(),
    affiliation: z.string().optional(),
  })
);

const BaseDocumentSchema = z.object({
  title: z.string().min(5).max(200),
  docType: z.string(),
  persona: z.string().optional(),
  url: z.string().url().optional().or(z.literal(null)),
  scraped_at: z.string().datetime({ offset: true }),
  word_count: z.number().positive(),
  extraction_quality: z.enum(['high', 'medium', 'low']),
  authors: AuthorSchema.optional(),
});

const AcademicPaperSchema = BaseDocumentSchema.extend({
  docType: z.enum(['academic-paper', 'preprint', 'thesis', 'conference-paper']),
  authors: AuthorSchema.min(1, {
    message: 'authors is required and must contain at least one author.',
  }),
  venue: z.string().optional(),
  publicationYear: z.number().min(1900).max(2030).optional(),
  doi: z
    .string()
    .regex(/^10\.\d+\/[^\s]+$/)
    .optional(),
  arxivId: z
    .string()
    .regex(/^\d{4}\.\d{4,5}(v\d+)?$/)
    .optional(),
  abstract: z
    .string()
    .min(1, { message: 'abstract is required and cannot be empty.' }),
  keywords: z
    .array(z.string())
    .min(1, { message: 'keywords array is required and cannot be empty.' }),
  url: z.string().url({ message: 'A valid URL is required.' }),
});

const PatentMetadataSchema = BaseDocumentSchema.extend({
  docType: z.literal('patent'),
  patentNo: z.string().regex(/^(US|EP|JP|WO|CN|KR|DE)\s*\d+\s*[A-Z]?\d*$/),
  inventors: z.array(z.string()),
  assignees: z.array(z.string()),
  filedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grantedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  patentFamily: z.array(z.string()).optional(),
});

const InternalNoteSchema = BaseDocumentSchema.extend({
  docType: z.literal('internal-note'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const PressArticleSchema = BaseDocumentSchema.extend({
  docType: z.enum([
    'press-release',
    'news-article',
    'blog-post',
    'magazine-article',
  ]),
  outlet: z.string().optional(),
  published_date: z.string().datetime({ offset: true }).optional(),
  domain: z.string().optional(),
});

const BookSchema = BaseDocumentSchema.extend({
  docType: z.literal('book'),
  venue: z.string(), // Publisher
  publicationYear: z.number().min(1900).max(2030).optional(),
  isbn: z.string().optional(),
  chapter: z.string().optional(),
});

const LegalDocSchema = BaseDocumentSchema.extend({
  docType: z.literal('legal-document'),
  caseNumber: z.string().optional(),
  courtLevel: z
    .enum(['Supreme Court', 'Appeals', 'District', 'State', 'Federal'])
    .optional(),
  jurisdiction: z.string().optional(),
  legalCitation: z.string().optional(),
});

const TechnicalDocSchema = BaseDocumentSchema.extend({
  docType: z.enum([
    'white-paper',
    'datasheet',
    'manual',
    'report',
    'presentation',
  ]),
  version: z.string().optional(),
  framework: z.string().optional(),
  language: z.union([z.string(), z.array(z.string())]).optional(),
  repository: z.string().url().optional(),
});

// ===========================
// Document Format Validator
// ===========================

export class DocumentFormatValidator {
  private static readonly SUPPORTED_DOC_TYPES = [
    'academic-paper',
    'preprint',
    'thesis',
    'conference-paper',
    'patent',
    'legal-document',
    'press-release',
    'news-article',
    'blog-post',
    'magazine-article',
    'white-paper',
    'datasheet',
    'manual',
    'report',
    'presentation',
    'internal-note',
    'book',
  ];

  private static readonly REQUIRED_SECTIONS = ['title'];
  private static readonly RECOMMENDED_SECTIONS = [
    'abstract',
    'introduction',
    'conclusion',
  ];

  /**
   * Validate a complete document (frontmatter + content)
   */
  static validateDocument(
    content: string,
    filename?: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      qualityScore: 100,
      suggestions: [],
    };

    try {
      // Parse frontmatter and content
      const {
        frontmatter,
        content: markdownContent,
        hasFrontmatter,
        rawFrontmatter,
      } = this.parseFrontmatter(content);

      if (!hasFrontmatter) {
        result.errors.push({
          type: 'yaml',
          message:
            'Document must start with YAML frontmatter between --- markers',
          severity: 'error',
        });
        result.isValid = false;
        result.qualityScore = 0;
        return result;
      }

      // Validate frontmatter
      const frontmatterValidation = this.validateFrontmatter(
        frontmatter,
        rawFrontmatter
      );
      result.errors.push(...frontmatterValidation.errors);
      result.warnings.push(...frontmatterValidation.warnings);

      // Validate content structure
      const contentValidation = this.validateContentStructure(markdownContent);
      result.errors.push(...contentValidation.errors);
      result.warnings.push(...contentValidation.warnings);

      // Check metadata completeness
      const metadataValidation = this.validateMetadataCompleteness(frontmatter);
      result.warnings.push(...metadataValidation.warnings);

      // Assess search optimization
      const searchValidation = this.validateSearchOptimization(
        frontmatter,
        markdownContent
      );
      result.warnings.push(...searchValidation.warnings);

      // Calculate quality score
      result.qualityScore = this.calculateQualityScore(
        result,
        frontmatter,
        markdownContent
      );

      // Generate suggestions
      result.suggestions = this.generateSuggestions(
        result,
        frontmatter,
        markdownContent
      );

      // Determine overall validity
      result.isValid =
        result.errors.filter(e => e.severity === 'error').length === 0;
    } catch (error) {
      result.errors.push({
        type: 'yaml',
        message: `Document parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
      result.isValid = false;
      result.qualityScore = 0;
    }

    return result;
  }

  /**
   * Parse YAML frontmatter from markdown content
   */
  private static parseFrontmatter(content: string): {
    frontmatter: any;
    content: string;
    hasFrontmatter: boolean;
    rawFrontmatter: string | null;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        content: content,
        hasFrontmatter: false,
        rawFrontmatter: null,
      };
    }

    try {
      const rawFrontmatter = match[1];
      const frontmatter = yaml.load(rawFrontmatter) as any;
      return {
        frontmatter: frontmatter || {},
        content: match[2],
        hasFrontmatter: true,
        rawFrontmatter: rawFrontmatter,
      };
    } catch (error) {
      throw new Error(
        `Invalid YAML frontmatter: ${error instanceof Error ? error.message : 'Parse error'}`
      );
    }
  }

  /**
   * Validate YAML frontmatter against schema
   */
  private static validateFrontmatter(
    frontmatter: any,
    rawFrontmatter: string | null
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required core fields
    const requiredFields = [
      'title',
      'docType',
      'scraped_at',
      'word_count',
      'extraction_quality',
    ];
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        errors.push({
          type: 'metadata',
          field,
          message: `Required field '${field}' is missing`,
          severity: 'error',
        });
      }
    }

    // Validate document type
    if (
      frontmatter.docType &&
      !this.SUPPORTED_DOC_TYPES.includes(frontmatter.docType)
    ) {
      errors.push({
        type: 'metadata',
        field: 'docType',
        message: `Unsupported document type: ${frontmatter.docType}. Supported types: ${this.SUPPORTED_DOC_TYPES.join(', ')}`,
        severity: 'error',
      });
    }

    // Validate against document-specific schema
    if (frontmatter.docType) {
      const schemaValidation = this.validateAgainstSchema(frontmatter);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);
    }

    // Check for block arrays for simple string arrays
    if (rawFrontmatter) {
      const arrayKeys = [
        'keywords',
        'technologies',
        'patentFamily',
        'inventors',
        'assignees',
        'meshTerms',
      ];
      for (const key of arrayKeys) {
        const blockArrayRegex = new RegExp(
          `^\\s*${key}:\\s*\\n(\\s*-\\s+.*)+`,
          'm'
        );
        if (blockArrayRegex.test(rawFrontmatter)) {
          errors.push({
            type: 'yaml',
            field: key,
            message: `Field '${key}' must use inline array format (e.g., ["item1", "item2"])`,
            severity: 'error',
          });
        }
      }
    }

    // Check persona validity
    if (frontmatter.persona) {
      const personaConfig = typeRegistry.getPersonaConfig(frontmatter.persona);
      if (!personaConfig) {
        warnings.push({
          type: 'missing',
          field: 'persona',
          message: `Persona '${frontmatter.persona}' not found in system`,
          suggestion:
            'Upload the persona file first, or use a supported persona',
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate against document type-specific schema
   */
  private static validateAgainstSchema(frontmatter: any): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const docType = frontmatter.docType;
      let schema;

      switch (docType) {
        case 'academic-paper':
        case 'preprint':
        case 'thesis':
        case 'conference-paper':
          schema = AcademicPaperSchema;
          break;
        case 'patent':
          schema = PatentMetadataSchema;
          break;
        case 'press-release':
        case 'news-article':
        case 'blog-post':
        case 'magazine-article':
          schema = PressArticleSchema;
          break;
        case 'book':
          schema = BookSchema;
          break;
        case 'legal-document':
          schema = LegalDocSchema;
          break;
        case 'white-paper':
        case 'datasheet':
        case 'manual':
        case 'report':
        case 'presentation':
          schema = TechnicalDocSchema;
          break;
        case 'internal-note':
          schema = InternalNoteSchema;
          break;
        default:
          schema = BaseDocumentSchema;
      }

      const result = schema.safeParse(frontmatter);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            type: 'metadata',
            field: issue.path.join('.'),
            message: issue.message,
            severity: 'error',
          });
        }
      }
    } catch (error) {
      errors.push({
        type: 'metadata',
        message: `Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate markdown content structure
   */
  private static validateContentStructure(content: string): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const lines = content.split('\n');

    // Check for H1 title
    const hasH1 = lines.some(
      line => line.trim().startsWith('# ') && line.trim().length > 2
    );
    if (!hasH1) {
      errors.push({
        type: 'structure',
        message: 'Document must start with an H1 title (# Title)',
        severity: 'error',
      });
    }

    // Check heading hierarchy
    const headings = lines.filter(line => line.trim().startsWith('#'));
    if (headings.length === 0) {
      warnings.push({
        type: 'suboptimal',
        message: 'Document lacks proper heading structure',
        suggestion:
          'Add section headings (##, ###) to improve readability and searchability',
      });
    }

    // Check for abstract/summary
    const hasAbstract =
      content.toLowerCase().includes('abstract') ||
      content.toLowerCase().includes('summary');
    if (!hasAbstract) {
      warnings.push({
        type: 'incomplete',
        message: 'Document lacks an abstract or summary section',
        suggestion:
          'Add an abstract or summary section to improve search performance',
      });
    }

    // Check minimum content length
    const wordCount = content
      .split(/\s+/)
      .filter(word => word.length > 0).length;
    if (wordCount < 100) {
      warnings.push({
        type: 'incomplete',
        message: 'Document content is very short',
        suggestion:
          'Ensure document contains sufficient content for meaningful search and citations',
      });
    }

    // Check for broken links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      if (url.startsWith('http') && !this.isValidUrl(url)) {
        warnings.push({
          type: 'suboptimal',
          message: `Potentially invalid URL: ${url}`,
          suggestion: 'Verify all links are accessible and properly formatted',
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate metadata completeness for search optimization
   */
  private static validateMetadataCompleteness(frontmatter: any): {
    warnings: ValidationWarning[];
  } {
    const warnings: ValidationWarning[] = [];

    // Check for search-critical fields
    const searchFields = ['keywords', 'abstract', 'authors', 'venue'];
    const missingSearchFields = searchFields.filter(
      field => !frontmatter[field]
    );

    if (missingSearchFields.length > 0) {
      warnings.push({
        type: 'incomplete',
        message: `Missing search-critical fields: ${missingSearchFields.join(', ')}`,
        suggestion:
          'Add keywords, abstract, and authors information to improve search performance',
      });
    }

    // Check for domain-specific metadata
    const docType = frontmatter.docType;
    if (
      ['academic-paper', 'preprint', 'thesis', 'conference-paper'].includes(
        docType
      ) &&
      !frontmatter.doi &&
      !frontmatter.arxivId
    ) {
      warnings.push({
        type: 'incomplete',
        field: 'doi',
        message: 'Academic paper lacks DOI or arXiv ID',
        suggestion: 'Add DOI or arXiv ID for better academic citation tracking',
      });
    }

    if (docType === 'patent' && !frontmatter.patentFamily) {
      warnings.push({
        type: 'incomplete',
        field: 'patentFamily',
        message: 'Patent lacks family member information',
        suggestion: 'Add patent family members for comprehensive IP tracking',
      });
    }

    return { warnings };
  }

  /**
   * Validate search optimization
   */
  private static validateSearchOptimization(
    frontmatter: any,
    content: string
  ): {
    warnings: ValidationWarning[];
  } {
    const warnings: ValidationWarning[] = [];

    // Check keyword density in content
    const keywords = frontmatter.keywords || [];
    if (keywords.length > 0) {
      const contentLower = content.toLowerCase();
      const missingKeywords = keywords.filter(
        (keyword: string) => !contentLower.includes(keyword.toLowerCase())
      );

      if (missingKeywords.length > 0) {
        warnings.push({
          type: 'suboptimal',
          message: `Keywords not found in content: ${missingKeywords.join(', ')}`,
          suggestion:
            'Ensure keywords appear naturally in the document content',
        });
      }
    }

    // Check for technical terms in headings
    const headings = content
      .split('\n')
      .filter(line => line.trim().startsWith('#'));
    const hasDescriptiveHeadings = headings.some(
      heading => heading.split(' ').length > 3
    );

    if (!hasDescriptiveHeadings) {
      warnings.push({
        type: 'suboptimal',
        message: 'Headings lack descriptive keywords',
        suggestion:
          'Use descriptive headings that include relevant technical terms',
      });
    }

    return { warnings };
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private static calculateQualityScore(
    result: ValidationResult,
    frontmatter: any,
    content: string
  ): number {
    let score = 100;

    // Deduct for errors
    const errorCount = result.errors.filter(e => e.severity === 'error').length;
    score -= errorCount * 25;

    // Deduct for warnings
    score -= result.warnings.length * 5;

    // Bonus for completeness
    const hasAbstract = content.toLowerCase().includes('abstract');
    const hasKeywords = frontmatter.keywords && frontmatter.keywords.length > 0;
    const hasAuthor = frontmatter.authors && frontmatter.authors.length > 0;

    if (hasAbstract) score += 5;
    if (hasKeywords) score += 5;
    if (hasAuthor) score += 5;

    // Bonus for content quality
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 500) score += 5;
    if (wordCount > 2000) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate improvement suggestions
   */
  private static generateSuggestions(
    result: ValidationResult,
    frontmatter: any,
    content: string
  ): string[] {
    const suggestions: string[] = [];

    // Content improvement suggestions
    if (!content.toLowerCase().includes('abstract')) {
      suggestions.push(
        'Add an abstract or summary section to improve search performance'
      );
    }

    if (!frontmatter.keywords || frontmatter.keywords.length < 3) {
      suggestions.push('Add 3-5 relevant keywords to improve discoverability');
    }

    if (content.split(/\s+/).length < 500) {
      suggestions.push(
        'Consider expanding content for better context and search performance'
      );
    }

    // Domain-specific suggestions
    const docType = frontmatter.docType;
    if (
      ['academic-paper', 'preprint', 'thesis', 'conference-paper'].includes(
        docType
      ) &&
      !frontmatter.doi
    ) {
      suggestions.push('Add DOI for better academic citation tracking');
    }

    if (
      docType === 'patent' &&
      (!frontmatter.inventors || frontmatter.inventors.length === 0)
    ) {
      suggestions.push('Add inventor names for comprehensive patent analysis');
    }

    // Search optimization suggestions
    const headings = content
      .split('\n')
      .filter(line => line.trim().startsWith('#'));
    if (headings.length < 3) {
      suggestions.push(
        'Add more section headings to improve document structure'
      );
    }

    return suggestions;
  }

  /**
   * Utility: Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation schema for document type
   */
  static getSchemaForDocType(docType: string): z.ZodSchema | null {
    switch (docType) {
      case 'academic-paper':
      case 'preprint':
      case 'thesis':
      case 'conference-paper':
        return AcademicPaperSchema;
      case 'patent':
        return PatentMetadataSchema;
      case 'press-release':
      case 'news-article':
      case 'blog-post':
      case 'magazine-article':
        return PressArticleSchema;
      case 'book':
        return BookSchema;
      case 'legal-document':
        return LegalDocSchema;
      case 'white-paper':
      case 'datasheet':
      case 'manual':
      case 'report':
      case 'presentation':
        return TechnicalDocSchema;
      case 'internal-note':
        return InternalNoteSchema;
      default:
        return BaseDocumentSchema;
    }
  }

  /**
   * Get required fields for document type
   */
  static getRequiredFields(docType: string): string[] {
    const schema = this.getSchemaForDocType(docType);
    if (!schema) return [];

    // Extract required fields from schema
    const baseRequired = [
      'title',
      'docType',
      'scraped_at',
      'word_count',
      'extraction_quality',
    ];

    // Add document-specific required fields
    switch (docType) {
      case 'academic-paper':
      case 'preprint':
      case 'thesis':
      case 'conference-paper':
        return [...baseRequired, 'authors', 'abstract', 'keywords', 'url'];
      case 'patent':
        return [
          ...baseRequired,
          'patentNo',
          'inventors',
          'assignees',
          'filedDate',
        ];
      case 'book':
        return [...baseRequired, 'venue'];
      default:
        return baseRequired;
    }
  }

  /**
   * Get supported document types
   */
  static getSupportedDocTypes(): string[] {
    return [...this.SUPPORTED_DOC_TYPES];
  }
}

// Export validation functions for convenience
export const validateDocument = DocumentFormatValidator.validateDocument.bind(
  DocumentFormatValidator
);
export const getSchemaForDocType =
  DocumentFormatValidator.getSchemaForDocType.bind(DocumentFormatValidator);
export const getRequiredFields = DocumentFormatValidator.getRequiredFields.bind(
  DocumentFormatValidator
);
export const getSupportedDocTypes =
  DocumentFormatValidator.getSupportedDocTypes.bind(DocumentFormatValidator);
