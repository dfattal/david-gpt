import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as matter from 'gray-matter';
import * as yaml from 'js-yaml';
import {
  PersonaMetadataSchema,
  PersonaConstraintsSchema,
  type PersonaMetadata,
  type PersonaConstraints,
} from './types';

export interface PersonaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: PersonaMetadata;
  constraints?: PersonaConstraints;
}

export interface PersonaFiles {
  personaMd: string;
  constraintsYaml: string;
}

export class PersonaValidator {
  private static readonly REQUIRED_PERSONA_SECTIONS = [
    'Core Identity',
    'Personality & Tone',
    'Expertise',
    'Response Guidelines',
  ];

  private static readonly REQUIRED_FRONTMATTER_FIELDS = [
    'title',
    'version',
    'last_updated',
    'persona_id',
  ];

  /**
   * Validate persona files from disk
   */
  static async validateFromDisk(
    personaPath: string
  ): Promise<PersonaValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if required files exist
      const personaMdPath = join(personaPath, 'Persona.md');
      const constraintsYamlPath = join(personaPath, 'constraints.yaml');

      let personaMdContent: string;
      let constraintsYamlContent: string;

      try {
        personaMdContent = readFileSync(personaMdPath, 'utf-8');
      } catch (error) {
        errors.push(`Missing required file: Persona.md`);
        return { isValid: false, errors, warnings };
      }

      try {
        constraintsYamlContent = readFileSync(constraintsYamlPath, 'utf-8');
      } catch (error) {
        errors.push(`Missing required file: constraints.yaml`);
        return { isValid: false, errors, warnings };
      }

      return this.validateFromContent({
        personaMd: personaMdContent,
        constraintsYaml: constraintsYamlContent,
      });
    } catch (error) {
      errors.push(
        `Failed to read persona files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate persona files from content strings
   */
  static validateFromContent(files: PersonaFiles): PersonaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Parse and validate Persona.md
    const personaResult = this.validatePersonaMd(files.personaMd);
    errors.push(...personaResult.errors);
    warnings.push(...personaResult.warnings);

    // Parse and validate constraints.yaml
    const constraintsResult = this.validateConstraintsYaml(
      files.constraintsYaml
    );
    errors.push(...constraintsResult.errors);
    warnings.push(...constraintsResult.warnings);

    // Cross-validation between files
    if (personaResult.metadata && constraintsResult.constraints) {
      const crossValidation = this.crossValidateFiles(
        personaResult.metadata,
        constraintsResult.constraints
      );
      errors.push(...crossValidation.errors);
      warnings.push(...crossValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: personaResult.metadata,
      constraints: constraintsResult.constraints,
    };
  }

  /**
   * Validate Persona.md file structure and content
   */
  private static validatePersonaMd(content: string): {
    errors: string[];
    warnings: string[];
    metadata?: PersonaMetadata;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse frontmatter
      const parsed = matter(content);
      const frontmatter = parsed.data;
      const markdownContent = parsed.content;

      // Validate frontmatter structure
      for (const field of this.REQUIRED_FRONTMATTER_FIELDS) {
        if (!frontmatter[field]) {
          errors.push(`Missing required frontmatter field: ${field}`);
        }
      }

      // Validate persona_id format
      if (
        frontmatter.persona_id &&
        !/^[a-z0-9-]+$/.test(frontmatter.persona_id)
      ) {
        errors.push(
          'persona_id must contain only lowercase letters, numbers, and hyphens'
        );
      }

      // Validate version format
      if (
        frontmatter.version &&
        !/^\d+\.\d+(\.\d+)?$/.test(frontmatter.version)
      ) {
        warnings.push(
          'version should follow semantic versioning (e.g., 1.0.0)'
        );
      }

      // Validate required sections in markdown content
      for (const section of this.REQUIRED_PERSONA_SECTIONS) {
        const sectionRegex = new RegExp(
          `##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          'i'
        );
        if (!sectionRegex.test(markdownContent)) {
          errors.push(`Missing required section: ${section}`);
        }
      }

      // Validate content quality
      if (markdownContent.length < 500) {
        warnings.push(
          'Persona description is quite short - consider adding more detail'
        );
      }

      // Check for placeholder content
      if (
        markdownContent.includes('{{') ||
        markdownContent.includes('[INSERT')
      ) {
        errors.push(
          'Persona contains placeholder content that needs to be filled in'
        );
      }

      // Validate using Zod schema if no critical errors
      let metadata: PersonaMetadata | undefined;
      if (errors.length === 0) {
        try {
          metadata = PersonaMetadataSchema.parse({
            title: frontmatter.title,
            version: frontmatter.version,
            last_updated: frontmatter.last_updated,
            persona_id: frontmatter.persona_id,
            description: frontmatter.description || '',
            author: frontmatter.author,
            tags: frontmatter.tags || [],
          });
        } catch (zodError) {
          if (zodError instanceof z.ZodError) {
            errors.push(
              ...zodError.errors.map(
                e => `Metadata validation: ${e.path.join('.')}: ${e.message}`
              )
            );
          }
        }
      }

      return { errors, warnings, metadata };
    } catch (error) {
      errors.push(
        `Failed to parse Persona.md: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { errors, warnings };
    }
  }

  /**
   * Validate constraints.yaml file structure and content
   */
  private static validateConstraintsYaml(content: string): {
    errors: string[];
    warnings: string[];
    constraints?: PersonaConstraints;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse YAML
      const parsed = yaml.load(content) as any;

      if (!parsed || typeof parsed !== 'object') {
        errors.push('Invalid YAML format');
        return { errors, warnings };
      }

      // Validate required top-level keys
      const requiredKeys = [
        'required_doc_types',
        'kg_required_entities',
        'kg_required_edges',
      ];
      for (const key of requiredKeys) {
        if (!parsed[key]) {
          errors.push(`Missing required key: ${key}`);
        }
      }

      // Validate document types
      if (
        parsed.required_doc_types &&
        !Array.isArray(parsed.required_doc_types)
      ) {
        errors.push('required_doc_types must be an array');
      } else if (
        parsed.required_doc_types &&
        parsed.required_doc_types.length === 0
      ) {
        warnings.push(
          'No document types specified - persona may not process any documents'
        );
      }

      // Validate chunk constraints
      if (parsed.content_chunk_max_chars && parsed.content_chunk_min_chars) {
        if (parsed.content_chunk_max_chars <= parsed.content_chunk_min_chars) {
          errors.push(
            'content_chunk_max_chars must be greater than content_chunk_min_chars'
          );
        }
      }

      // Validate overlap percentage
      if (
        parsed.chunk_overlap_percentage &&
        (parsed.chunk_overlap_percentage < 0 ||
          parsed.chunk_overlap_percentage > 50)
      ) {
        warnings.push('chunk_overlap_percentage should be between 0-50%');
      }

      // Validate quality gates
      if (parsed.quality_gates) {
        if (
          parsed.quality_gates.min_completion_percentage &&
          (parsed.quality_gates.min_completion_percentage < 0 ||
            parsed.quality_gates.min_completion_percentage > 100)
        ) {
          errors.push('min_completion_percentage must be between 0-100');
        }
        if (
          parsed.quality_gates.max_error_rate &&
          parsed.quality_gates.max_error_rate < 0
        ) {
          errors.push('max_error_rate must be non-negative');
        }
      }

      // Validate using Zod schema if no critical errors
      let constraints: PersonaConstraints | undefined;
      if (errors.length === 0) {
        try {
          constraints = PersonaConstraintsSchema.parse(parsed);
        } catch (zodError) {
          if (zodError instanceof z.ZodError) {
            errors.push(
              ...zodError.errors.map(
                e => `Constraints validation: ${e.path.join('.')}: ${e.message}`
              )
            );
          }
        }
      }

      return { errors, warnings, constraints };
    } catch (error) {
      errors.push(
        `Failed to parse constraints.yaml: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { errors, warnings };
    }
  }

  /**
   * Cross-validate consistency between Persona.md and constraints.yaml
   */
  private static crossValidateFiles(
    metadata: PersonaMetadata,
    constraints: PersonaConstraints
  ): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if persona_id matches folder structure expectations
    if (!metadata.persona_id || metadata.persona_id.length < 2) {
      errors.push('persona_id should be at least 2 characters long');
    }

    // Validate document type consistency
    if (constraints.required_doc_types.length === 0) {
      warnings.push(
        'No document types specified - this persona will not process any documents'
      );
    }

    // Check for reasonable chunk sizes
    if (
      constraints.content_chunk_max_chars &&
      constraints.content_chunk_max_chars > 4000
    ) {
      warnings.push('Very large chunk size may impact retrieval performance');
    }

    // Validate entity/edge relationship consistency
    if (
      constraints.kg_required_entities.length > 0 &&
      constraints.kg_required_edges.length === 0
    ) {
      warnings.push(
        'Entities specified but no relationships defined - knowledge graph may be incomplete'
      );
    }

    return { errors, warnings };
  }

  /**
   * Generate validation report as formatted string
   */
  static formatValidationReport(result: PersonaValidationResult): string {
    const lines: string[] = [];

    lines.push(`Persona Validation Report`);
    lines.push(`========================`);
    lines.push(`Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach(error => lines.push(`  ❌ ${error}`));
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach(warning => lines.push(`  ⚠️  ${warning}`));
      lines.push('');
    }

    if (result.metadata) {
      lines.push('Metadata:');
      lines.push(`  📝 Title: ${result.metadata.title}`);
      lines.push(`  🏷️  ID: ${result.metadata.persona_id}`);
      lines.push(`  📅 Version: ${result.metadata.version}`);
      lines.push('');
    }

    if (result.constraints) {
      lines.push('Constraints:');
      lines.push(
        `  📄 Document Types: ${result.constraints.required_doc_types.join(', ')}`
      );
      lines.push(
        `  🧩 Entities: ${result.constraints.kg_required_entities.length} types`
      );
      lines.push(
        `  🔗 Relationships: ${result.constraints.kg_required_edges.length} types`
      );
    }

    return lines.join('\n');
  }
}
