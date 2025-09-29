/**
 * Persona Validator
 *
 * Validates persona markdown files against the template structure and requirements.
 * Ensures proper section hierarchy, content completeness, and system compatibility.
 */

import { PersonaParser } from '@/lib/personas/persona-parser';
import type { Persona, EnhancedPersonaConfig } from '@/lib/rag/types';

// ===========================
// Validation Types
// ===========================

export interface PersonaValidationResult {
  isValid: boolean;
  errors: PersonaValidationError[];
  warnings: PersonaValidationWarning[];
  qualityScore: number; // 0-100
  suggestions: string[];
  analysis: PersonaAnalysis;
}

export interface PersonaValidationError {
  type: 'structure' | 'content' | 'format' | 'completeness';
  section?: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
}

export interface PersonaValidationWarning {
  type: 'incomplete' | 'suboptimal' | 'missing' | 'inconsistent';
  section?: string;
  message: string;
  suggestion: string;
}

export interface PersonaAnalysis {
  structure: StructureAnalysis;
  content: ContentAnalysis;
  completeness: CompletenessAnalysis;
  systemCompatibility: CompatibilityAnalysis;
}

export interface StructureAnalysis {
  hasRequiredSections: boolean;
  sectionCount: number;
  headingHierarchy: boolean;
  templateCompliance: number; // 0-100
}

export interface ContentAnalysis {
  identityClarity: number; // 0-100
  expertiseDepth: number; // 0-100
  communicationSpecificity: number; // 0-100
  valuesCohesion: number; // 0-100
}

export interface CompletenessAnalysis {
  requiredFieldsPresent: number;
  optionalFieldsPresent: number;
  domainCount: number;
  keywordCount: number;
  completenessScore: number; // 0-100
}

export interface CompatibilityAnalysis {
  parserCompatible: boolean;
  systemPromptGeneratable: boolean;
  entityExtractionReady: boolean;
  documentTypesValid: boolean;
}

// ===========================
// Persona Validator
// ===========================

export class PersonaValidator {
  private static readonly REQUIRED_SECTIONS = [
    'Core Identity',
    'Personality & Tone',
    'Expertise',
    'Balance:',
    'Core Values',
    'Narrative Arc',
    'How a Chatbot Should Speak'
  ];

  private static readonly OPTIONAL_SECTIONS = [
    'Document Types and Metadata Preferences',
    'Usage Instructions'
  ];

  private static readonly EXPERTISE_SUBSECTION_PATTERN = /^### \d+\. .+$/;

  /**
   * Validate a complete persona markdown file
   */
  static validatePersona(content: string, personaId: Persona, filename?: string): PersonaValidationResult {
    const result: PersonaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      qualityScore: 100,
      suggestions: [],
      analysis: {
        structure: {
          hasRequiredSections: false,
          sectionCount: 0,
          headingHierarchy: false,
          templateCompliance: 0
        },
        content: {
          identityClarity: 0,
          expertiseDepth: 0,
          communicationSpecificity: 0,
          valuesCohesion: 0
        },
        completeness: {
          requiredFieldsPresent: 0,
          optionalFieldsPresent: 0,
          domainCount: 0,
          keywordCount: 0,
          completenessScore: 0
        },
        systemCompatibility: {
          parserCompatible: false,
          systemPromptGeneratable: false,
          entityExtractionReady: false,
          documentTypesValid: false
        }
      }
    };

    try {
      // Parse sections from markdown
      const sections = this.parseMarkdownSections(content);

      // Validate structure
      const structureValidation = this.validateStructure(sections, content);
      result.errors.push(...structureValidation.errors);
      result.warnings.push(...structureValidation.warnings);
      result.analysis.structure = structureValidation.analysis;

      // Validate content quality
      const contentValidation = this.validateContentQuality(sections);
      result.warnings.push(...contentValidation.warnings);
      result.analysis.content = contentValidation.analysis;

      // Check completeness
      const completenessValidation = this.validateCompleteness(sections);
      result.warnings.push(...completenessValidation.warnings);
      result.analysis.completeness = completenessValidation.analysis;

      // Test system compatibility
      const compatibilityValidation = this.validateSystemCompatibility(content, personaId);
      result.errors.push(...compatibilityValidation.errors);
      result.warnings.push(...compatibilityValidation.warnings);
      result.analysis.systemCompatibility = compatibilityValidation.analysis;

      // Calculate quality score
      result.qualityScore = this.calculateQualityScore(result.analysis, result.errors, result.warnings);

      // Generate suggestions
      result.suggestions = this.generateSuggestions(result.analysis, sections);

      // Determine overall validity
      result.isValid = result.errors.filter(e => e.severity === 'error').length === 0;

    } catch (error) {
      result.errors.push({
        type: 'format',
        message: `Persona parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
      result.isValid = false;
      result.qualityScore = 0;
    }

    return result;
  }

  /**
   * Parse markdown content into sections
   */
  private static parseMarkdownSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');

    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Check for section headers (## Section Name)
      const headerMatch = line.match(/^## (.+)$/);
      if (headerMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }

        // Start new section
        currentSection = headerMatch[1];
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save final section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Validate markdown structure and template compliance
   */
  private static validateStructure(sections: Record<string, string>, content: string): {
    errors: PersonaValidationError[];
    warnings: PersonaValidationWarning[];
    analysis: StructureAnalysis;
  } {
    const errors: PersonaValidationError[] = [];
    const warnings: PersonaValidationWarning[] = [];

    // Check for required sections
    const missingSections = this.REQUIRED_SECTIONS.filter(section => {
      return !Object.keys(sections).some(key => key.includes(section));
    });

    if (missingSections.length > 0) {
      for (const section of missingSections) {
        errors.push({
          type: 'structure',
          section,
          message: `Required section missing: ${section}`,
          severity: 'error'
        });
      }
    }

    // Check heading hierarchy
    const lines = content.split('\n');
    const headings = lines.filter(line => line.trim().startsWith('#'));
    let hierarchyValid = true;

    // Should start with H1 title
    if (!headings[0]?.startsWith('# ')) {
      errors.push({
        type: 'structure',
        message: 'Document must start with H1 title (# Persona Name)',
        severity: 'error'
      });
      hierarchyValid = false;
    }

    // Check for proper H2 sections
    const h2Sections = headings.filter(h => h.startsWith('## '));
    if (h2Sections.length < 3) {
      warnings.push({
        type: 'incomplete',
        message: 'Persona lacks sufficient section structure',
        suggestion: 'Add more H2 sections (##) to organize content properly'
      });
    }

    // Validate expertise section structure
    if (sections['Expertise']) {
      const expertiseContent = sections['Expertise'];
      const expertiseSubsections = expertiseContent.split('\n')
        .filter(line => this.EXPERTISE_SUBSECTION_PATTERN.test(line.trim()));

      if (expertiseSubsections.length < 2) {
        warnings.push({
          type: 'incomplete',
          section: 'Expertise',
          message: 'Expertise section should have 2-4 numbered domains (### 1. Domain Name)',
          suggestion: 'Structure expertise into numbered domains with clear descriptions'
        });
      }

      if (expertiseSubsections.length > 4) {
        warnings.push({
          type: 'suboptimal',
          section: 'Expertise',
          message: 'Too many expertise domains (more than 4)',
          suggestion: 'Focus on 2-4 core expertise areas for better clarity'
        });
      }
    }

    const analysis: StructureAnalysis = {
      hasRequiredSections: missingSections.length === 0,
      sectionCount: Object.keys(sections).length,
      headingHierarchy: hierarchyValid,
      templateCompliance: Math.max(0, 100 - (missingSections.length * 20) - (hierarchyValid ? 0 : 20))
    };

    return { errors, warnings, analysis };
  }

  /**
   * Validate content quality and specificity
   */
  private static validateContentQuality(sections: Record<string, string>): {
    warnings: PersonaValidationWarning[];
    analysis: ContentAnalysis;
  } {
    const warnings: PersonaValidationWarning[] = [];

    // Analyze Core Identity clarity
    const identityContent = sections['Core Identity'] || '';
    const identityClarity = this.assessIdentityClarity(identityContent);
    if (identityClarity < 60) {
      warnings.push({
        type: 'suboptimal',
        section: 'Core Identity',
        message: 'Core identity lacks specificity and concrete details',
        suggestion: 'Include specific achievements, numbers, and unique characteristics'
      });
    }

    // Analyze Expertise depth
    const expertiseContent = sections['Expertise'] || '';
    const expertiseDepth = this.assessExpertiseDepth(expertiseContent);
    if (expertiseDepth < 60) {
      warnings.push({
        type: 'incomplete',
        section: 'Expertise',
        message: 'Expertise domains lack technical depth and specific details',
        suggestion: 'Add technical skills, methodologies, tools, and quantifiable achievements'
      });
    }

    // Analyze Communication Style specificity
    const communicationContent = sections['Personality & Tone'] || '';
    const communicationSpecificity = this.assessCommunicationSpecificity(communicationContent);
    if (communicationSpecificity < 60) {
      warnings.push({
        type: 'suboptimal',
        section: 'Personality & Tone',
        message: 'Communication style guidelines are too generic',
        suggestion: 'Add specific examples of tone, preferred phrases, and communication patterns'
      });
    }

    // Analyze Core Values cohesion
    const valuesContent = sections['Core Values'] || '';
    const valuesCohesion = this.assessValuesCohesion(valuesContent);
    if (valuesCohesion < 60) {
      warnings.push({
        type: 'incomplete',
        section: 'Core Values',
        message: 'Core values lack depth and professional context',
        suggestion: 'Explain how each value influences professional decisions and work approach'
      });
    }

    const analysis: ContentAnalysis = {
      identityClarity,
      expertiseDepth,
      communicationSpecificity,
      valuesCohesion
    };

    return { warnings, analysis };
  }

  /**
   * Validate completeness of persona information
   */
  private static validateCompleteness(sections: Record<string, string>): {
    warnings: PersonaValidationWarning[];
    analysis: CompletenessAnalysis;
  } {
    const warnings: PersonaValidationWarning[] = [];

    // Count expertise domains
    const expertiseContent = sections['Expertise'] || '';
    const domainCount = (expertiseContent.match(/### \d+\./g) || []).length;

    // Count keywords across domains
    const keywordCount = this.countKeywords(expertiseContent);

    // Check for chat guidelines
    const chatSection = Object.keys(sections).find(key => key.includes('Chatbot Should Speak'));
    if (!chatSection || sections[chatSection].split('\n').filter(line => line.trim().startsWith('*')).length < 3) {
      warnings.push({
        type: 'incomplete',
        section: 'Chat Guidelines',
        message: 'Insufficient chat response guidelines',
        suggestion: 'Add 3-5 specific guidelines for how the chatbot should respond'
      });
    }

    // Check for document preferences
    const docPrefsSection = sections['Document Types and Metadata Preferences'];
    if (!docPrefsSection) {
      warnings.push({
        type: 'missing',
        section: 'Document Types and Metadata Preferences',
        message: 'Missing document type preferences',
        suggestion: 'Add section specifying preferred document types and metadata fields'
      });
    }

    const requiredFieldsPresent = Object.keys(sections).filter(key =>
      this.REQUIRED_SECTIONS.some(req => key.includes(req))
    ).length;

    const optionalFieldsPresent = Object.keys(sections).filter(key =>
      this.OPTIONAL_SECTIONS.some(opt => key.includes(opt))
    ).length;

    const completenessScore = Math.min(100, (
      (requiredFieldsPresent / this.REQUIRED_SECTIONS.length) * 60 +
      (optionalFieldsPresent / this.OPTIONAL_SECTIONS.length) * 20 +
      (Math.min(domainCount, 4) / 4) * 20
    ));

    const analysis: CompletenessAnalysis = {
      requiredFieldsPresent,
      optionalFieldsPresent,
      domainCount,
      keywordCount,
      completenessScore
    };

    return { warnings, analysis };
  }

  /**
   * Test compatibility with persona parser and system
   */
  private static validateSystemCompatibility(content: string, personaId: Persona): {
    errors: PersonaValidationError[];
    warnings: PersonaValidationWarning[];
    analysis: CompatibilityAnalysis;
  } {
    const errors: PersonaValidationError[] = [];
    const warnings: PersonaValidationWarning[] = [];

    let parserCompatible = false;
    let systemPromptGeneratable = false;
    let entityExtractionReady = false;
    let documentTypesValid = true;

    // Test parser compatibility
    try {
      const parseResult = PersonaParser.parsePersonaContent(content, personaId, filename);
      parserCompatible = parseResult.success;

      if (!parseResult.success) {
        errors.push({
          type: 'format',
          message: `Persona parser failed: ${parseResult.errors.join(', ')}`,
          severity: 'error'
        });
      } else if (parseResult.config) {
        systemPromptGeneratable = !!parseResult.config.chat?.systemPrompt;
        entityExtractionReady = parseResult.config.expertise?.domains?.length > 0;

        // Check document types validity
        const docTypes = parseResult.config.documentTypes || [];
        const invalidTypes = docTypes.filter(type => !this.isValidDocumentType(type));
        if (invalidTypes.length > 0) {
          documentTypesValid = false;
          warnings.push({
            type: 'inconsistent',
            message: `Invalid document types specified: ${invalidTypes.join(', ')}`,
            suggestion: 'Use only supported document types or register new types in the system'
          });
        }
      }
    } catch (error) {
      parserCompatible = false;
      errors.push({
        type: 'format',
        message: `Parser compatibility test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    }

    const analysis: CompatibilityAnalysis = {
      parserCompatible,
      systemPromptGeneratable,
      entityExtractionReady,
      documentTypesValid
    };

    return { errors, warnings, analysis };
  }

  /**
   * Helper: Assess identity clarity (0-100)
   */
  private static assessIdentityClarity(content: string): number {
    let score = 0;

    // Check for specific achievements
    if (content.includes('PhD') || content.includes('Dr.')) score += 15;
    if (/\d+\+?\s*(years?|patents?|papers?|employees?|users?)/.test(content)) score += 20;
    if (content.includes('founded') || content.includes('developed') || content.includes('invented')) score += 15;

    // Check for current role clarity
    if (content.includes('CEO') || content.includes('CTO') || content.includes('Chief')) score += 10;
    if (content.includes('Professor') || content.includes('Director')) score += 10;

    // Check for dual identity description
    if (content.includes('both') || content.includes('combines') || content.includes('bridges')) score += 15;

    // Check for specificity vs. generic language
    const specificTerms = (content.match(/\b[A-Z][a-z]*(?:\s+[A-Z][a-z]*)*\b/g) || []).length;
    score += Math.min(15, specificTerms * 2);

    return Math.min(100, score);
  }

  /**
   * Helper: Assess expertise depth (0-100)
   */
  private static assessExpertiseDepth(content: string): number {
    let score = 0;

    // Check for domain count
    const domainCount = (content.match(/### \d+\./g) || []).length;
    score += Math.min(30, domainCount * 10);

    // Check for technical terms
    const technicalTerms = (content.match(/\b[A-Z]{2,}|\b[A-Z][a-z]*(?:[A-Z][a-z]*)+/g) || []).length;
    score += Math.min(25, technicalTerms * 2);

    // Check for quantifiable achievements
    const numbers = (content.match(/\d+\+?[%\s]*(years?|patents?|papers?|[MB]B?)/g) || []).length;
    score += Math.min(20, numbers * 5);

    // Check for tools and methodologies
    const tools = (content.match(/Python|R|MATLAB|TensorFlow|PyTorch|Docker|AWS|Azure|GCP/gi) || []).length;
    score += Math.min(15, tools * 3);

    // Check for industry context
    if (content.includes('industry') || content.includes('standard') || content.includes('adopted')) score += 10;

    return Math.min(100, score);
  }

  /**
   * Helper: Assess communication specificity (0-100)
   */
  private static assessCommunicationSpecificity(content: string): number {
    let score = 0;

    // Check for specific tone descriptors
    const toneWords = ['conversational', 'analytical', 'direct', 'technical', 'accessible', 'authoritative'];
    const toneScore = toneWords.filter(word => content.toLowerCase().includes(word)).length;
    score += Math.min(25, toneScore * 5);

    // Check for style descriptions
    if (content.includes('balances') || content.includes('combines') || content.includes('maintains')) score += 15;

    // Check for presence components
    if (content.includes('Tone of Voice') && content.includes('Style') && content.includes('Presence')) score += 20;

    // Check for specific examples or patterns
    if (content.includes('prefers') || content.includes('avoids') || content.includes('uses')) score += 20;

    // Check for detailed bullet points
    const bulletPoints = (content.match(/^\s*[\*\-]\s+/gm) || []).length;
    score += Math.min(20, bulletPoints * 3);

    return Math.min(100, score);
  }

  /**
   * Helper: Assess values cohesion (0-100)
   */
  private static assessValuesCohesion(content: string): number {
    let score = 0;

    // Check for value count
    const valueCount = (content.match(/\*\*[^*]+\*\*:/g) || []).length;
    score += Math.min(30, valueCount * 6);

    // Check for explanations
    const explanations = content.split('\n').filter(line =>
      line.includes(':') && line.length > 50
    ).length;
    score += Math.min(35, explanations * 7);

    // Check for professional context
    if (content.includes('work') || content.includes('professional') || content.includes('practice')) score += 15;

    // Check for consistency with identity
    if (content.includes('integrity') || content.includes('innovation') || content.includes('excellence')) score += 20;

    return Math.min(100, score);
  }

  /**
   * Helper: Count keywords in expertise content
   */
  private static countKeywords(content: string): number {
    const technicalTerms = content.match(/\b[A-Z]{2,}|\b[A-Z][a-z]*(?:[A-Z][a-z]*)+/g) || [];
    const domainSpecific = content.match(/algorithms?|models?|systems?|frameworks?|technologies?/gi) || [];
    return technicalTerms.length + domainSpecific.length;
  }

  /**
   * Helper: Check if document type is valid
   */
  private static isValidDocumentType(type: string): boolean {
    const validTypes = [
      'paper', 'patent', 'technical-spec', 'press-article', 'book',
      'legal-doc', 'case-law', 'statute', 'legal-brief',
      'medical-paper', 'clinical-trial', 'medical-guideline', 'case-report',
      'url', 'note'
    ];
    return validTypes.includes(type);
  }

  /**
   * Calculate overall quality score
   */
  private static calculateQualityScore(
    analysis: PersonaAnalysis,
    errors: PersonaValidationError[],
    warnings: PersonaValidationWarning[]
  ): number {
    let score = 100;

    // Deduct for errors
    const errorCount = errors.filter(e => e.severity === 'error').length;
    score -= errorCount * 30;

    // Deduct for warnings
    score -= warnings.length * 5;

    // Add component scores (weighted)
    score = Math.min(100, score * 0.4 +
      analysis.structure.templateCompliance * 0.25 +
      analysis.content.identityClarity * 0.15 +
      analysis.content.expertiseDepth * 0.15 +
      analysis.completeness.completenessScore * 0.05
    );

    return Math.max(0, score);
  }

  /**
   * Generate improvement suggestions
   */
  private static generateSuggestions(
    analysis: PersonaAnalysis,
    sections: Record<string, string>
  ): string[] {
    const suggestions: string[] = [];

    // Structure suggestions
    if (analysis.structure.templateCompliance < 80) {
      suggestions.push('Review the persona template and ensure all required sections are present');
    }

    // Content suggestions
    if (analysis.content.identityClarity < 70) {
      suggestions.push('Add more specific achievements, numbers, and concrete details to Core Identity');
    }

    if (analysis.content.expertiseDepth < 70) {
      suggestions.push('Include more technical details, tools, and quantifiable accomplishments in Expertise domains');
    }

    if (analysis.content.communicationSpecificity < 70) {
      suggestions.push('Add specific examples of communication style, preferred phrases, and tone guidelines');
    }

    // Completeness suggestions
    if (analysis.completeness.domainCount < 2) {
      suggestions.push('Add at least 2-3 numbered expertise domains with clear descriptions');
    }

    if (analysis.completeness.keywordCount < 20) {
      suggestions.push('Include more technical terminology and domain-specific keywords');
    }

    // System compatibility suggestions
    if (!analysis.systemCompatibility.systemPromptGeneratable) {
      suggestions.push('Ensure all sections have sufficient content for system prompt generation');
    }

    if (!analysis.systemCompatibility.entityExtractionReady) {
      suggestions.push('Add more entity-rich content with organizations, technologies, and technical terms');
    }

    return suggestions;
  }

  /**
   * Quick validation check (basic structure only)
   */
  static quickValidate(content: string): boolean {
    try {
      const sections = this.parseMarkdownSections(content);
      const requiredSectionCount = this.REQUIRED_SECTIONS.filter(section =>
        Object.keys(sections).some(key => key.includes(section))
      ).length;

      return requiredSectionCount >= this.REQUIRED_SECTIONS.length - 1; // Allow 1 missing section
    } catch {
      return false;
    }
  }

  /**
   * Get required sections for template compliance
   */
  static getRequiredSections(): string[] {
    return [...this.REQUIRED_SECTIONS];
  }

  /**
   * Get optional sections for enhanced functionality
   */
  static getOptionalSections(): string[] {
    return [...this.OPTIONAL_SECTIONS];
  }
}

// Export validation functions for convenience
export const validatePersona = PersonaValidator.validatePersona.bind(PersonaValidator);
export const quickValidatePersona = PersonaValidator.quickValidate.bind(PersonaValidator);
export const getRequiredSections = PersonaValidator.getRequiredSections.bind(PersonaValidator);
export const getOptionalSections = PersonaValidator.getOptionalSections.bind(PersonaValidator);