import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import {
  PersonaConstraintsSchema,
  type PersonaConstraints,
  type ChunkConstraints,
  type EntityRequirements,
  type QualityGates,
  type DocTypeOverride,
  type CanonicalEntitiesConfig,
  type CanonicalEntityDefinition,
  type CanonicalRelationshipDefinition,
} from './types';

export interface ParsedConstraints {
  constraints: PersonaConstraints;
  rawYaml: any;
  templateVariables?: Record<string, any>;
}

export interface ConstraintsParseResult {
  success: boolean;
  constraints?: PersonaConstraints;
  errors: string[];
  warnings: string[];
}

export class ConstraintsParser {
  private static readonly DEFAULT_CONSTRAINTS: Partial<PersonaConstraints> = {
    abstract_max_words: 200,
    metadata_chunk_max_chars: 1200,
    content_chunk_min_chars: 800,
    content_chunk_max_chars: 2000,
    chunk_overlap_percentage: 15,
    require_document_url_if_available: true,
    min_entities_per_document: 3,
    min_edges_per_document: 2,
    require_evidence_for_edges: true,
    default_processor: 'auto',
    fallback_processors: ['gemini', 'exa', 'html', 'pdf'],
    quality_gates: {
      min_completion_percentage: 85,
      max_error_rate: 10,
      require_metadata_chunk: true,
      require_content_chunks: true,
      min_citation_coverage: 80,
    },
    canonical_entities: {},
    canonical_relationships: [],
  };

  /**
   * Parse constraints from file path
   */
  static async parseFromFile(
    constraintsPath: string
  ): Promise<ConstraintsParseResult> {
    try {
      const content = readFileSync(constraintsPath, 'utf-8');
      return this.parseFromContent(content);
    } catch (error) {
      return {
        success: false,
        errors: [
          `Failed to read constraints file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        warnings: [],
      };
    }
  }

  /**
   * Parse constraints from persona folder
   */
  static async parseFromPersonaFolder(
    personaPath: string
  ): Promise<ConstraintsParseResult> {
    const constraintsPath = join(personaPath, 'constraints.yaml');
    return this.parseFromFile(constraintsPath);
  }

  /**
   * Parse constraints from YAML content string
   */
  static parseFromContent(yamlContent: string): ConstraintsParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse YAML
      const rawYaml = yaml.load(yamlContent) as any;

      if (!rawYaml || typeof rawYaml !== 'object') {
        return {
          success: false,
          errors: ['Invalid YAML format or empty file'],
          warnings: [],
        };
      }

      // Apply defaults
      const mergedConstraints = this.mergeWithDefaults(rawYaml);

      // Validate structure
      const structureValidation = this.validateStructure(mergedConstraints);
      errors.push(...structureValidation.errors);
      warnings.push(...structureValidation.warnings);

      // Parse with Zod schema
      try {
        const constraints = PersonaConstraintsSchema.parse(mergedConstraints);

        return {
          success: errors.length === 0,
          constraints,
          errors,
          warnings,
        };
      } catch (zodError) {
        if (zodError instanceof Error) {
          errors.push(`Schema validation failed: ${zodError.message}`);
        }
        return {
          success: false,
          errors,
          warnings,
        };
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          `YAML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        warnings: [],
      };
    }
  }

  /**
   * Merge parsed constraints with defaults
   */
  private static mergeWithDefaults(parsed: any): any {
    const merged = { ...this.DEFAULT_CONSTRAINTS, ...parsed };

    // Deep merge quality_gates
    if (parsed.quality_gates) {
      merged.quality_gates = {
        ...this.DEFAULT_CONSTRAINTS.quality_gates,
        ...parsed.quality_gates,
      };
    }

    // Ensure arrays are properly set
    merged.required_doc_types = parsed.required_doc_types || [];
    merged.kg_required_entities = parsed.kg_required_entities || [];
    merged.kg_required_edges = parsed.kg_required_edges || [];
    merged.extra_identifiers = parsed.extra_identifiers || [];
    merged.fallback_processors =
      parsed.fallback_processors ||
      this.DEFAULT_CONSTRAINTS.fallback_processors;

    // Handle canonical entities
    merged.canonical_entities = parsed.canonical_entities || {};
    merged.canonical_relationships = parsed.canonical_relationships || [];

    return merged;
  }

  /**
   * Validate constraints structure and values
   */
  private static validateStructure(constraints: any): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required arrays
    if (!Array.isArray(constraints.required_doc_types)) {
      errors.push('required_doc_types must be an array');
    } else if (constraints.required_doc_types.length === 0) {
      warnings.push(
        'No document types specified - this persona may not process any documents'
      );
    }

    if (!Array.isArray(constraints.kg_required_entities)) {
      errors.push('kg_required_entities must be an array');
    }

    if (!Array.isArray(constraints.kg_required_edges)) {
      errors.push('kg_required_edges must be an array');
    }

    // Validate chunk size constraints
    if (
      constraints.content_chunk_max_chars <= constraints.content_chunk_min_chars
    ) {
      errors.push(
        'content_chunk_max_chars must be greater than content_chunk_min_chars'
      );
    }

    if (constraints.content_chunk_max_chars > 4000) {
      warnings.push(
        'Very large chunk size (>4000 chars) may impact retrieval performance'
      );
    }

    if (constraints.content_chunk_min_chars < 200) {
      warnings.push(
        'Very small chunk size (<200 chars) may result in fragmented content'
      );
    }

    // Validate overlap percentage
    if (
      constraints.chunk_overlap_percentage < 0 ||
      constraints.chunk_overlap_percentage > 50
    ) {
      errors.push('chunk_overlap_percentage must be between 0-50');
    }

    // Validate quality gates
    if (constraints.quality_gates) {
      const qg = constraints.quality_gates;

      if (
        qg.min_completion_percentage < 0 ||
        qg.min_completion_percentage > 100
      ) {
        errors.push('min_completion_percentage must be between 0-100');
      }

      if (qg.max_error_rate < 0) {
        errors.push('max_error_rate must be non-negative');
      }

      if (qg.min_citation_coverage < 0 || qg.min_citation_coverage > 100) {
        errors.push('min_citation_coverage must be between 0-100');
      }
    }

    // Validate processors
    if (
      constraints.fallback_processors &&
      !Array.isArray(constraints.fallback_processors)
    ) {
      errors.push('fallback_processors must be an array');
    }

    // Validate canonical entities
    if (constraints.canonical_entities) {
      if (typeof constraints.canonical_entities !== 'object') {
        errors.push('canonical_entities must be an object');
      } else {
        // Validate each entity kind and its entities
        for (const [entityKind, entities] of Object.entries(
          constraints.canonical_entities
        )) {
          if (!entities || typeof entities !== 'object') {
            errors.push(`canonical_entities.${entityKind} must be an object`);
            continue;
          }

          for (const [canonicalName, definition] of Object.entries(entities)) {
            if (!definition.description) {
              errors.push(
                `canonical_entities.${entityKind}.${canonicalName} must have a description`
              );
            }
            if (
              !definition.aliases ||
              !Array.isArray(definition.aliases) ||
              definition.aliases.length === 0
            ) {
              errors.push(
                `canonical_entities.${entityKind}.${canonicalName} must have at least one alias`
              );
            }
            if (
              typeof definition.priority !== 'number' ||
              definition.priority < 1 ||
              definition.priority > 10
            ) {
              errors.push(
                `canonical_entities.${entityKind}.${canonicalName} priority must be a number between 1-10`
              );
            }
          }
        }
      }
    }

    // Validate canonical relationships
    if (constraints.canonical_relationships) {
      if (!Array.isArray(constraints.canonical_relationships)) {
        errors.push('canonical_relationships must be an array');
      } else {
        for (let i = 0; i < constraints.canonical_relationships.length; i++) {
          const rel = constraints.canonical_relationships[i];
          if (!rel.from || !rel.relation || !rel.to) {
            errors.push(
              `canonical_relationships[${i}] must have from, relation, and to fields`
            );
          }
          if (
            typeof rel.confidence !== 'number' ||
            rel.confidence < 0 ||
            rel.confidence > 1
          ) {
            errors.push(
              `canonical_relationships[${i}].confidence must be a number between 0-1`
            );
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Extract chunk constraints from parsed constraints
   */
  static extractChunkConstraints(
    constraints: PersonaConstraints
  ): ChunkConstraints {
    return {
      abstract_max_words: constraints.abstract_max_words,
      metadata_chunk_max_chars: constraints.metadata_chunk_max_chars,
      content_chunk_min_chars: constraints.content_chunk_min_chars,
      content_chunk_max_chars: constraints.content_chunk_max_chars,
      chunk_overlap_percentage: constraints.chunk_overlap_percentage,
    };
  }

  /**
   * Extract entity requirements from parsed constraints
   */
  static extractEntityRequirements(
    constraints: PersonaConstraints
  ): EntityRequirements {
    return {
      kg_required_entities: constraints.kg_required_entities,
      kg_required_edges: constraints.kg_required_edges,
      min_entities_per_document: constraints.min_entities_per_document,
      min_edges_per_document: constraints.min_edges_per_document,
      require_evidence_for_edges: constraints.require_evidence_for_edges,
    };
  }

  /**
   * Extract quality gates from parsed constraints
   */
  static extractQualityGates(constraints: PersonaConstraints): QualityGates {
    return constraints.quality_gates;
  }

  /**
   * Get document type specific overrides
   */
  static getDocTypeOverrides(
    constraints: PersonaConstraints,
    docType: string
  ): DocTypeOverride | undefined {
    return constraints.doctype_overrides?.[docType];
  }

  /**
   * Check if a document type is supported by the persona
   */
  static isDocTypeSupported(
    constraints: PersonaConstraints,
    docType: string
  ): boolean {
    return constraints.required_doc_types.includes(docType);
  }

  /**
   * Get effective processor for a document type
   */
  static getEffectiveProcessor(
    constraints: PersonaConstraints,
    docType?: string
  ): string {
    // Check for document type specific processor
    if (
      docType &&
      constraints.doctype_overrides?.[docType]?.default_processor
    ) {
      return constraints.doctype_overrides[docType].default_processor;
    }

    // Use persona default
    return constraints.default_processor;
  }

  /**
   * Get fallback processors in order
   */
  static getFallbackProcessors(
    constraints: PersonaConstraints,
    docType?: string
  ): string[] {
    // Check for document type specific fallbacks
    if (
      docType &&
      constraints.doctype_overrides?.[docType]?.fallback_processors
    ) {
      return constraints.doctype_overrides[docType].fallback_processors;
    }

    // Use persona defaults
    return constraints.fallback_processors;
  }

  /**
   * Validate constraints against a document
   */
  static validateDocument(
    constraints: PersonaConstraints,
    document: {
      doc_type: string;
      content_length?: number;
      entities_count?: number;
      edges_count?: number;
    }
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if document type is supported
    if (!this.isDocTypeSupported(constraints, document.doc_type)) {
      errors.push(
        `Document type '${document.doc_type}' is not supported by this persona`
      );
    }

    // Check content length against chunk constraints
    if (document.content_length) {
      if (document.content_length < constraints.content_chunk_min_chars) {
        warnings.push(
          `Document content is shorter than minimum chunk size (${constraints.content_chunk_min_chars} chars)`
        );
      }
    }

    // Check entity requirements
    if (
      document.entities_count !== undefined &&
      document.entities_count < constraints.min_entities_per_document
    ) {
      warnings.push(
        `Document has fewer entities than required (${constraints.min_entities_per_document})`
      );
    }

    // Check edge requirements
    if (
      document.edges_count !== undefined &&
      document.edges_count < constraints.min_edges_per_document
    ) {
      warnings.push(
        `Document has fewer relationships than required (${constraints.min_edges_per_document})`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract canonical entities from parsed constraints
   */
  static extractCanonicalEntities(
    constraints: PersonaConstraints
  ): CanonicalEntitiesConfig {
    return constraints.canonical_entities || {};
  }

  /**
   * Extract canonical relationships from parsed constraints
   */
  static extractCanonicalRelationships(
    constraints: PersonaConstraints
  ): CanonicalRelationshipDefinition[] {
    return constraints.canonical_relationships || [];
  }

  /**
   * Get canonical entities for a specific entity kind
   */
  static getCanonicalEntitiesForKind(
    constraints: PersonaConstraints,
    entityKind: string
  ): Record<string, CanonicalEntityDefinition> {
    return constraints.canonical_entities?.[entityKind] || {};
  }

  /**
   * Check if a canonical entity exists
   */
  static hasCanonicalEntity(
    constraints: PersonaConstraints,
    entityKind: string,
    canonicalName: string
  ): boolean {
    return !!constraints.canonical_entities?.[entityKind]?.[canonicalName];
  }

  /**
   * Get all aliases for all canonical entities
   */
  static getAllCanonicalAliases(
    constraints: PersonaConstraints
  ): Map<string, { canonicalName: string; entityKind: string }> {
    const aliasMap = new Map<
      string,
      { canonicalName: string; entityKind: string }
    >();

    if (!constraints.canonical_entities) return aliasMap;

    for (const [entityKind, entities] of Object.entries(
      constraints.canonical_entities
    )) {
      for (const [canonicalName, definition] of Object.entries(entities)) {
        // Add canonical name itself as an alias
        aliasMap.set(canonicalName.toLowerCase(), {
          canonicalName,
          entityKind,
        });

        // Add all defined aliases
        for (const alias of definition.aliases) {
          aliasMap.set(alias.toLowerCase(), { canonicalName, entityKind });
        }
      }
    }

    return aliasMap;
  }

  /**
   * Generate a summary of constraints for logging/debugging
   */
  static generateConstraintsSummary(constraints: PersonaConstraints): string {
    const lines: string[] = [];

    lines.push('Persona Constraints Summary');
    lines.push('==========================');
    lines.push(`Document Types: ${constraints.required_doc_types.join(', ')}`);
    lines.push(
      `Chunk Size: ${constraints.content_chunk_min_chars}-${constraints.content_chunk_max_chars} chars`
    );
    lines.push(`Chunk Overlap: ${constraints.chunk_overlap_percentage}%`);
    lines.push(
      `Required Entities: ${constraints.kg_required_entities.join(', ')}`
    );
    lines.push(
      `Required Relationships: ${constraints.kg_required_edges.join(', ')}`
    );
    lines.push(`Default Processor: ${constraints.default_processor}`);
    lines.push(
      `Fallback Processors: ${constraints.fallback_processors.join(', ')}`
    );

    const qg = constraints.quality_gates;
    lines.push('Quality Gates:');
    lines.push(`  Min Completion: ${qg.min_completion_percentage}%`);
    lines.push(`  Max Error Rate: ${qg.max_error_rate}%`);
    lines.push(`  Min Citation Coverage: ${qg.min_citation_coverage}%`);

    if (
      constraints.doctype_overrides &&
      Object.keys(constraints.doctype_overrides).length > 0
    ) {
      lines.push('Document Type Overrides:');
      for (const [docType, overrides] of Object.entries(
        constraints.doctype_overrides
      )) {
        lines.push(`  ${docType}: ${Object.keys(overrides).length} overrides`);
      }
    }

    // Canonical entities summary
    if (
      constraints.canonical_entities &&
      Object.keys(constraints.canonical_entities).length > 0
    ) {
      lines.push('Canonical Entities:');
      for (const [entityKind, entities] of Object.entries(
        constraints.canonical_entities
      )) {
        const entityCount = Object.keys(entities).length;
        const aliasCount = Object.values(entities).reduce(
          (sum, def) => sum + def.aliases.length,
          0
        );
        lines.push(
          `  ${entityKind}: ${entityCount} entities, ${aliasCount} aliases`
        );
      }
    }

    if (
      constraints.canonical_relationships &&
      constraints.canonical_relationships.length > 0
    ) {
      lines.push(
        `Canonical Relationships: ${constraints.canonical_relationships.length} defined`
      );
    }

    return lines.join('\n');
  }
}
