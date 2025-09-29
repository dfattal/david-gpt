/**
 * Extensible Type Registry System
 *
 * Provides dynamic registration and validation of document types, metadata templates,
 * and detection rules for different expert personas.
 */

import type {
  DocumentType,
  Persona,
  PersonaConfig,
  EnhancedPersonaConfig,
  DocumentTypeRegistration,
  MetadataTemplate,
  DetectionRule,
  TypeRegistry,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  FieldValidation
} from './types';

// Global registry instance
class DocumentTypeRegistry implements TypeRegistry {
  documentTypes = new Map<string, DocumentTypeRegistration>();
  metadataTemplates = new Map<string, MetadataTemplate>();
  detectionRules = new Map<string, DetectionRule[]>();
  personas = new Map<Persona, PersonaConfig>();

  // Default persona configuration for backward compatibility
  constructor() {
    this.initializeDefaultPersonas();
  }

  private initializeDefaultPersonas() {
    // David persona (original system)
    this.registerPersona('david', {
      name: "David's Technical Expertise",
      description: "3D display technology, patents, and research papers",
      documentTypes: ['patent', 'paper', 'press-article', 'book', 'url', 'note'],
      defaultType: 'url',
      requiredFields: {
        title: { type: 'string', required: true },
        docType: { type: 'enum', values: ['patent', 'paper', 'press-article', 'book', 'url', 'note'], required: true }
      },
      optionalFields: {
        url: { type: 'string' },
        doi: { type: 'string', pattern: /^10\.\d+\/[^\s]+$/ },
        arxivId: { type: 'string', pattern: /^\d{4}\.\d{4,5}(v\d+)?$/ },
        patentNo: { type: 'string' },
        inventors: { type: 'array' },
        assignees: { type: 'array' },
        authorsAffiliations: { type: 'array' },
        oem: { type: 'string' },
        model: { type: 'string' },
        leiaFeature: { type: 'array' }
      },
      searchBoosts: {
        patentNo: 1.5,
        inventors: 1.2,
        oem: 1.3,
        leiaFeature: 1.4
      },
      citationFormat: 'technical',
      metadataTemplates: ['patent', 'paper', 'press-article', 'book', 'url']
    });

    // Legal persona
    this.registerPersona('legal', {
      name: "Legal Expert",
      description: "Legal documents, case law, and statutes",
      documentTypes: ['legal-doc', 'case-law', 'statute', 'legal-brief', 'paper', 'book'],
      defaultType: 'legal-doc',
      requiredFields: {
        title: { type: 'string', required: true },
        docType: { type: 'enum', values: ['legal-doc', 'case-law', 'statute', 'legal-brief', 'paper', 'book'], required: true }
      },
      optionalFields: {
        caseNumber: { type: 'string' },
        courtLevel: { type: 'enum', values: ['Supreme Court', 'Appeals', 'District', 'State', 'Federal'] },
        jurisdiction: { type: 'string' },
        legalCitation: { type: 'string' },
        caseParties: { type: 'array' },
        legalTopics: { type: 'array' },
        precedential: { type: 'boolean' },
        outcome: { type: 'enum', values: ['Granted', 'Denied', 'Dismissed', 'Settled'] }
      },
      searchBoosts: {
        precedential: 1.8,
        courtLevel: 1.5,
        legalCitation: 1.3,
        caseNumber: 1.4
      },
      citationFormat: 'legal',
      metadataTemplates: ['legal', 'case-law', 'statute']
    });

    // Medical persona
    this.registerPersona('medical', {
      name: "Medical Expert",
      description: "Medical research, clinical trials, and guidelines",
      documentTypes: ['medical-paper', 'clinical-trial', 'medical-guideline', 'case-report', 'paper', 'book'],
      defaultType: 'medical-paper',
      requiredFields: {
        title: { type: 'string', required: true },
        docType: { type: 'enum', values: ['medical-paper', 'clinical-trial', 'medical-guideline', 'case-report', 'paper', 'book'], required: true }
      },
      optionalFields: {
        clinicalTrialId: { type: 'string', pattern: /^NCT\d+$/ },
        pubmedId: { type: 'string', pattern: /^PMID\d+$/ },
        meshTerms: { type: 'array' },
        studyType: { type: 'enum', values: ['RCT', 'Observational', 'Meta-Analysis', 'Case Series'] },
        studyPhase: { type: 'enum', values: ['Phase I', 'Phase II', 'Phase III', 'Phase IV'] },
        sampleSize: { type: 'number' },
        medicalSpecialty: { type: 'array' },
        fdaApproval: { type: 'enum', values: ['Approved', 'Pending', 'Denied'] }
      },
      searchBoosts: {
        clinicalTrialId: 1.6,
        studyType: 1.4,
        fdaApproval: 1.5,
        meshTerms: 1.3
      },
      citationFormat: 'medical',
      metadataTemplates: ['medical', 'clinical-trial', 'medical-guideline']
    });
  }

  // Registration functions
  registerDocumentType(registration: DocumentTypeRegistration): void {
    this.documentTypes.set(registration.name, registration);

    // Register detection rules if provided
    if (registration.detectionRules) {
      this.detectionRules.set(registration.name, registration.detectionRules);
    }
  }

  registerMetadataTemplate(template: MetadataTemplate): void {
    this.metadataTemplates.set(template.name, template);
  }

  registerDetectionRule(docType: string, rule: DetectionRule): void {
    const existing = this.detectionRules.get(docType) || [];
    existing.push(rule);
    this.detectionRules.set(docType, existing);
  }

  registerPersona(persona: Persona, config: PersonaConfig | EnhancedPersonaConfig): void {
    this.personas.set(persona, config);
  }

  // Validation functions
  validateDocument(docType: string, metadata: any, persona?: Persona): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Get persona config
    const personaConfig = persona ? this.personas.get(persona) : this.getPersonaForDocType(docType);
    if (!personaConfig) {
      errors.push({
        field: 'persona',
        message: `Unknown persona: ${persona}`,
        code: 'INVALID_PERSONA'
      });
      return { isValid: false, errors, warnings };
    }

    // Check if document type is supported by persona
    if (!personaConfig.documentTypes.includes(docType as DocumentType)) {
      errors.push({
        field: 'docType',
        message: `Document type '${docType}' not supported by persona '${persona}'`,
        code: 'UNSUPPORTED_DOCTYPE'
      });
    }

    // Validate required fields
    for (const [fieldName, validation] of Object.entries(personaConfig.requiredFields)) {
      if (validation.required && !metadata[fieldName]) {
        errors.push({
          field: fieldName,
          message: `Required field '${fieldName}' is missing`,
          code: 'MISSING_REQUIRED_FIELD'
        });
      } else if (metadata[fieldName]) {
        const fieldErrors = this.validateField(fieldName, metadata[fieldName], validation);
        errors.push(...fieldErrors);
      }
    }

    // Validate optional fields
    for (const [fieldName, validation] of Object.entries(personaConfig.optionalFields)) {
      if (metadata[fieldName]) {
        const fieldErrors = this.validateField(fieldName, metadata[fieldName], validation);
        errors.push(...fieldErrors);
      }
    }

    // Check for unknown fields
    const knownFields = new Set([
      ...Object.keys(personaConfig.requiredFields),
      ...Object.keys(personaConfig.optionalFields),
      'id', 'createdAt', 'updatedAt', 'scraped_at', 'word_count', 'extraction_quality' // Core fields
    ]);

    for (const fieldName of Object.keys(metadata)) {
      if (!knownFields.has(fieldName)) {
        warnings.push({
          field: fieldName,
          message: `Unknown field '${fieldName}' for persona '${persona}'`,
          suggestion: `Consider adding this field to the persona configuration or use customFields`
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateField(fieldName: string, value: any, validation: FieldValidation): ValidationError[] {
    const errors: ValidationError[] = [];

    // Type validation
    switch (validation.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be a string`,
            code: 'INVALID_TYPE'
          });
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be a number`,
            code: 'INVALID_TYPE'
          });
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be a boolean`,
            code: 'INVALID_TYPE'
          });
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be an array`,
            code: 'INVALID_TYPE'
          });
        }
        break;
      case 'enum':
        if (validation.values && !validation.values.includes(value)) {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be one of: ${validation.values.join(', ')}`,
            code: 'INVALID_ENUM_VALUE'
          });
        }
        break;
    }

    // Pattern validation
    if (validation.pattern && typeof value === 'string' && !validation.pattern.test(value)) {
      errors.push({
        field: fieldName,
        message: `Field '${fieldName}' does not match required pattern`,
        code: 'INVALID_PATTERN'
      });
    }

    return errors;
  }

  // Helper functions
  getPersonaForDocType(docType: string): PersonaConfig | undefined {
    for (const [_, config] of this.personas) {
      if (config.documentTypes.includes(docType as DocumentType)) {
        return config;
      }
    }
    return undefined;
  }

  getSupportedDocTypes(persona: Persona): DocumentType[] {
    const config = this.personas.get(persona);
    return config ? config.documentTypes : [];
  }

  getDetectionRules(docType: string): DetectionRule[] {
    return this.detectionRules.get(docType) || [];
  }

  getMetadataTemplate(templateName: string): MetadataTemplate | undefined {
    return this.metadataTemplates.get(templateName);
  }

  getAllPersonas(): Persona[] {
    return Array.from(this.personas.keys());
  }

  getPersonaConfig(persona: Persona): PersonaConfig | undefined {
    return this.personas.get(persona);
  }

  // Dynamic type checking
  isValidDocumentType(docType: string, persona?: Persona): boolean {
    if (persona) {
      const config = this.personas.get(persona);
      return config ? config.documentTypes.includes(docType as DocumentType) : false;
    }

    // Check if it's valid for any persona
    for (const [_, config] of this.personas) {
      if (config.documentTypes.includes(docType as DocumentType)) {
        return true;
      }
    }

    return false;
  }
}

// Export singleton instance
export const typeRegistry = new DocumentTypeRegistry();

// Export convenience functions
export const {
  registerDocumentType,
  registerMetadataTemplate,
  registerDetectionRule,
  registerPersona,
  validateDocument,
  getSupportedDocTypes,
  getDetectionRules,
  getMetadataTemplate,
  getAllPersonas,
  getPersonaConfig,
  isValidDocumentType
} = {
  registerDocumentType: (reg: DocumentTypeRegistration) => typeRegistry.registerDocumentType(reg),
  registerMetadataTemplate: (template: MetadataTemplate) => typeRegistry.registerMetadataTemplate(template),
  registerDetectionRule: (docType: string, rule: DetectionRule) => typeRegistry.registerDetectionRule(docType, rule),
  registerPersona: (persona: Persona, config: PersonaConfig | EnhancedPersonaConfig) => typeRegistry.registerPersona(persona, config),
  validateDocument: (docType: string, metadata: any, persona?: Persona) => typeRegistry.validateDocument(docType, metadata, persona),
  getSupportedDocTypes: (persona: Persona) => typeRegistry.getSupportedDocTypes(persona),
  getDetectionRules: (docType: string) => typeRegistry.getDetectionRules(docType),
  getMetadataTemplate: (templateName: string) => typeRegistry.getMetadataTemplate(templateName),
  getAllPersonas: () => typeRegistry.getAllPersonas(),
  getPersonaConfig: (persona: Persona) => typeRegistry.getPersonaConfig(persona),
  isValidDocumentType: (docType: string, persona?: Persona) => typeRegistry.isValidDocumentType(docType, persona)
};

// Export default persona for backward compatibility
export const DEFAULT_PERSONA: Persona = 'david';