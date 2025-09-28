/**
 * Persona Manager Service
 *
 * Core service for managing personas in the multi-persona RAG system.
 * Handles CRUD operations, validation, and persona lifecycle management.
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { PersonaValidator } from './persona-validator';
import { ConstraintsParser } from './constraints-parser';
import type {
  PersonaRecord,
  PersonaDefinition,
  PersonaValidationResult,
  PersonaConstraints,
  CreatePersonaRequest,
  UpdatePersonaRequest,
  PersonaListFilters,
  PersonaOperationResult,
  PersonaOperation,
  PersonaConfig,
  PersonaConfigResult,
  DocumentProcessingConfig,
  SearchConfig,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from '@/lib/rag/types';

export class PersonaManager {
  private supabase: SupabaseClient;
  private validator: PersonaValidator;
  private constraintsParser: ConstraintsParser;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createOptimizedAdminClient();
    this.validator = new PersonaValidator();
    this.constraintsParser = new ConstraintsParser();
  }

  // =======================
  // CRUD Operations
  // =======================

  /**
   * Create a new persona
   */
  async createPersona(
    request: CreatePersonaRequest
  ): Promise<PersonaOperationResult> {
    try {
      const { persona_id, content, validate = true } = request;

      // Check if persona already exists
      const existing = await this.getPersona(persona_id);
      if (existing.success) {
        return {
          success: false,
          errors: [`Persona '${persona_id}' already exists`],
        };
      }

      // Validate persona definition if requested
      let validationResult: PersonaValidationResult | null = null;
      if (validate) {
        validationResult = await this.validator.validatePersona({
          persona_id,
          content,
        });
        if (!validationResult.isValid) {
          return {
            success: false,
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          };
        }
      }

      // Create persona record
      const personaData = {
        persona_id,
        content,
        validation_status: validate
          ? validationResult?.isValid
            ? 'valid'
            : 'invalid'
          : null,
        validation_errors: validationResult?.errors || [],
        metadata: validationResult?.extractedMetadata || {},
        is_active: true,
      };

      const { data, error } = await this.supabase
        .from('personas')
        .insert(personaData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      await this.logPersonaOperation('create', persona_id, { success: true });

      return {
        success: true,
        persona: data,
        warnings: validationResult?.warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.logPersonaOperation('create', request.persona_id, {
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Get a persona by ID
   */
  async getPersona(persona_id: string): Promise<PersonaOperationResult> {
    try {
      const { data, error } = await this.supabase
        .from('personas')
        .select('*')
        .eq('persona_id', persona_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return {
            success: false,
            errors: [`Persona '${persona_id}' not found`],
          };
        }
        throw error;
      }

      return {
        success: true,
        persona: data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * List personas with optional filters
   */
  async listPersonas(filters?: PersonaListFilters): Promise<{
    success: boolean;
    personas?: PersonaRecord[];
    errors?: string[];
  }> {
    try {
      let query = this.supabase
        .from('personas')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters?.validation_status) {
        query = query.eq('validation_status', filters.validation_status);
      }

      if (filters?.expertise_domain) {
        query = query.contains('metadata->expertise_domains', [
          filters.expertise_domain,
        ]);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return {
        success: true,
        personas: data || [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Update a persona
   */
  async updatePersona(
    persona_id: string,
    request: UpdatePersonaRequest
  ): Promise<PersonaOperationResult> {
    try {
      const { content, is_active, validate = true } = request;

      // Check if persona exists
      const existing = await this.getPersona(persona_id);
      if (!existing.success) {
        return existing;
      }

      const updateData: Partial<PersonaRecord> = {
        updated_at: new Date().toISOString(),
      };

      // Update content if provided
      if (content) {
        updateData.content = content;

        // Revalidate if requested
        if (validate) {
          const validationResult = await this.validator.validatePersona({
            persona_id,
            content,
          });
          updateData.validation_status = validationResult.isValid
            ? 'valid'
            : 'invalid';
          updateData.validation_errors = validationResult.errors;
          updateData.metadata = validationResult.extractedMetadata || {};
        }
      }

      // Update active status if provided
      if (is_active !== undefined) {
        updateData.is_active = is_active;
      }

      const { data, error } = await this.supabase
        .from('personas')
        .update(updateData)
        .eq('persona_id', persona_id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      await this.logPersonaOperation('update', persona_id, { success: true });

      return {
        success: true,
        persona: data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.logPersonaOperation('update', persona_id, {
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Delete a persona
   */
  async deletePersona(persona_id: string): Promise<PersonaOperationResult> {
    try {
      // Check if persona exists
      const existing = await this.getPersona(persona_id);
      if (!existing.success) {
        return existing;
      }

      // Check if persona has associated documents
      const { data: documents } = await this.supabase
        .from('documents')
        .select('id')
        .eq('persona_id', persona_id)
        .limit(1);

      if (documents && documents.length > 0) {
        return {
          success: false,
          errors: [
            `Cannot delete persona '${persona_id}': it has associated documents`,
          ],
        };
      }

      const { error } = await this.supabase
        .from('personas')
        .delete()
        .eq('persona_id', persona_id);

      if (error) {
        throw error;
      }

      await this.logPersonaOperation('delete', persona_id, { success: true });

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.logPersonaOperation('delete', persona_id, {
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  // =======================
  // Validation & Parsing
  // =======================

  /**
   * Validate a persona definition
   */
  async validatePersona(
    definition: PersonaDefinition
  ): Promise<PersonaValidationResult> {
    return this.validator.validatePersona(definition);
  }

  /**
   * Parse persona constraints from content
   */
  async parsePersonaConstraints(persona_id: string): Promise<{
    success: boolean;
    constraints?: PersonaConstraints;
    errors?: string[];
  }> {
    try {
      const persona = await this.getPersona(persona_id);
      if (!persona.success || !persona.persona) {
        return {
          success: false,
          errors: [`Persona '${persona_id}' not found`],
        };
      }

      const constraints = await this.constraintsParser.parseConstraints(
        persona.persona.content,
        persona.persona.metadata
      );

      return {
        success: true,
        constraints,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Get active personas for selection UI
   */
  async getActivePersonas(): Promise<{
    success: boolean;
    personas?: Array<{
      persona_id: string;
      name: string;
      description?: string;
      expertise_domains: string[];
    }>;
    errors?: string[];
  }> {
    try {
      const result = await this.listPersonas({
        is_active: true,
        validation_status: 'valid',
      });

      if (!result.success) {
        return result;
      }

      const personas = result.personas!.map(p => ({
        persona_id: p.persona_id,
        name: p.metadata.name,
        description: p.metadata.description,
        expertise_domains: p.metadata.expertise_domains,
      }));

      return {
        success: true,
        personas,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  // =======================
  // Configuration Loading (for RAG Pipeline)
  // =======================

  /**
   * Get comprehensive persona configuration for RAG pipeline
   * This is the primary method used by document processing and chat services
   */
  async getPersonaConfig(persona_id: string): Promise<PersonaConfigResult> {
    try {
      // Get persona from database
      const personaResult = await this.getPersona(persona_id);
      if (!personaResult.success || !personaResult.persona) {
        return {
          success: false,
          errors: [`Persona '${persona_id}' not found in database`],
        };
      }

      const persona = personaResult.persona;

      // Check if persona is active
      if (!persona.is_active) {
        return {
          success: false,
          errors: [`Persona '${persona_id}' is not active`],
        };
      }

      // Load constraints from filesystem
      const constraintsResult = await ConstraintsParser.parseFromPersonaFolder(
        `personas/${persona_id}`
      );

      if (!constraintsResult.success || !constraintsResult.constraints) {
        return {
          success: false,
          errors: [
            `Failed to load constraints for persona '${persona_id}'`,
            ...(constraintsResult.errors || []),
          ],
          warnings: constraintsResult.warnings,
        };
      }

      // Load metadata from filesystem
      const validationResult = await PersonaValidator.validateFromDisk(
        `personas/${persona_id}`
      );

      if (!validationResult.isValid) {
        return {
          success: false,
          errors: [
            `Persona '${persona_id}' validation failed`,
            ...validationResult.errors,
          ],
          warnings: validationResult.warnings,
        };
      }

      // Construct comprehensive config
      const config: PersonaConfig = {
        persona_id,
        metadata: validationResult.metadata!,
        constraints: constraintsResult.constraints,
        database_id: persona.id,
        is_active: persona.is_active,
        validation_status: persona.validation_status,
      };

      return {
        success: true,
        config,
        warnings: [
          ...(constraintsResult.warnings || []),
          ...(validationResult.warnings || []),
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [`Failed to load persona config: ${errorMessage}`],
      };
    }
  }

  /**
   * Get document processing configuration for a persona
   */
  async getDocumentProcessingConfig(persona_id: string): Promise<{
    success: boolean;
    config?: DocumentProcessingConfig;
    errors?: string[];
  }> {
    const result = await this.getPersonaConfig(persona_id);

    if (!result.success || !result.config) {
      return {
        success: false,
        errors: result.errors,
      };
    }

    const { constraints } = result.config;

    const processingConfig: DocumentProcessingConfig = {
      persona_id,
      document_types: constraints.required_doc_types,
      chunk_constraints: ConstraintsParser.extractChunkConstraints(constraints),
      entity_requirements:
        ConstraintsParser.extractEntityRequirements(constraints),
      quality_gates: ConstraintsParser.extractQualityGates(constraints),
      default_processor: constraints.default_processor,
      fallback_processors: constraints.fallback_processors,
      doctype_overrides: constraints.doctype_overrides,
    };

    return {
      success: true,
      config: processingConfig,
    };
  }

  /**
   * Get search configuration for RAG retrieval
   */
  async getSearchConfig(persona_id: string): Promise<{
    success: boolean;
    config?: SearchConfig;
    errors?: string[];
  }> {
    try {
      const result = await this.getPersonaConfig(persona_id);

      if (!result.success || !result.config) {
        return {
          success: false,
          errors: result.errors,
        };
      }

      // Get allowed types from database permissions
      const [docTypes, entityKinds, relTypes] = await Promise.all([
        this.getAllowedDocumentTypes(persona_id),
        this.getAllowedEntityKinds(persona_id),
        this.getAllowedRelationshipTypes(persona_id),
      ]);

      const searchConfig: SearchConfig = {
        persona_id,
        allowed_document_types: docTypes,
        allowed_entity_kinds: entityKinds,
        allowed_relationship_types: relTypes,
        reranking_config: {
          max_results: 20,
          diversity_threshold: 0.7,
        },
      };

      return {
        success: true,
        config: searchConfig,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [`Failed to build search config: ${errorMessage}`],
      };
    }
  }

  /**
   * Get allowed document types for a persona from database
   */
  private async getAllowedDocumentTypes(persona_id: string): Promise<string[]> {
    try {
      const { data } = await this.supabase
        .from('persona_document_type_permissions')
        .select(
          `
          document_types!inner(name),
          personas!inner(persona_id)
        `
        )
        .eq('personas.persona_id', persona_id);

      return data?.map(item => item.document_types.name) || [];
    } catch (error) {
      console.error('Error fetching allowed document types:', error);
      return [];
    }
  }

  /**
   * Get allowed entity kinds for a persona from database
   */
  private async getAllowedEntityKinds(persona_id: string): Promise<string[]> {
    try {
      const { data } = await this.supabase
        .from('persona_entity_kind_permissions')
        .select(
          `
          entity_kinds!inner(name),
          personas!inner(persona_id)
        `
        )
        .eq('personas.persona_id', persona_id);

      return data?.map(item => item.entity_kinds.name) || [];
    } catch (error) {
      console.error('Error fetching allowed entity kinds:', error);
      return [];
    }
  }

  /**
   * Get allowed relationship types for a persona from database
   */
  private async getAllowedRelationshipTypes(
    persona_id: string
  ): Promise<string[]> {
    try {
      const { data } = await this.supabase
        .from('persona_relationship_type_permissions')
        .select(
          `
          relationship_types!inner(name),
          personas!inner(persona_id)
        `
        )
        .eq('personas.persona_id', persona_id);

      return data?.map(item => item.relationship_types.name) || [];
    } catch (error) {
      console.error('Error fetching allowed relationship types:', error);
      return [];
    }
  }

  /**
   * Validate that a document type is allowed for a persona
   */
  async validateDocumentType(
    persona_id: string,
    doc_type: string
  ): Promise<boolean> {
    const allowedTypes = await this.getAllowedDocumentTypes(persona_id);
    return allowedTypes.includes(doc_type);
  }

  /**
   * Get effective processor for a document type and persona
   */
  async getEffectiveProcessor(
    persona_id: string,
    doc_type?: string
  ): Promise<string> {
    const result = await this.getPersonaConfig(persona_id);

    if (!result.success || !result.config) {
      return 'auto'; // fallback
    }

    return ConstraintsParser.getEffectiveProcessor(
      result.config.constraints,
      doc_type
    );
  }

  /**
   * Log persona operations for audit trail
   */
  private async logPersonaOperation(
    operation: PersonaOperation,
    persona_id: string,
    result: { success: boolean; error?: string }
  ): Promise<void> {
    try {
      console.log(
        `📝 Persona ${operation}: ${persona_id} - ${result.success ? 'SUCCESS' : 'FAILED'}`,
        {
          operation,
          persona_id,
          success: result.success,
          error: result.error,
          timestamp: new Date().toISOString(),
        }
      );

      // Could also store in a personas_audit_log table if needed
    } catch (error) {
      console.error('Failed to log persona operation:', error);
    }
  }

  /**
   * Check if a persona has enhanced capabilities (for now, always return true)
   */
  isEnhanced(persona: Persona): boolean {
    // For now, all personas are considered enhanced
    // This could be extended to check for specific features, configurations, etc.
    return true;
  }

  /**
   * Load persona from markdown file (placeholder method)
   */
  async loadPersonaFromMarkdown(persona: Persona): Promise<void> {
    // This is a placeholder method that could load enhanced persona configurations
    // from markdown files in the future
    console.log(`Loading enhanced persona configuration for: ${persona}`);
  }

  /**
   * Generate system prompt for a persona
   */
  generateSystemPrompt(persona: Persona): string {
    const personaConfigs = {
      david: {
        identity:
          'You are David Fattal, a physicist turned entrepreneur and inventor of glasses-free 3D display technology. You are the Co-Founder and CTO of Leia Inc.',
        expertise:
          'lightfield displays, nanotechnology, optical interconnects, 3D display technology, photonics, holographic displays',
        style:
          'technical but accessible, enthusiastic about innovation, draws from personal experience',
      },
      legal: {
        identity:
          'You are a seasoned attorney and legal scholar with deep expertise in intellectual property law, corporate litigation, and regulatory compliance.',
        expertise:
          'patent law, intellectual property, corporate law, litigation, regulatory compliance, legal research',
        style:
          'precise, analytical, cites relevant legal precedents and statutes',
      },
      medical: {
        identity:
          'You are a medical professional with extensive clinical and research experience.',
        expertise:
          'clinical medicine, medical research, healthcare systems, patient care, medical technology',
        style:
          'evidence-based, compassionate, emphasizes patient safety and best practices',
      },
      technical: {
        identity:
          'You are a technical expert with broad engineering and technology knowledge.',
        expertise:
          'software engineering, hardware design, system architecture, emerging technologies',
        style:
          'methodical, detail-oriented, focuses on implementation and best practices',
      },
    };

    // Extract persona name from object or use as string
    const personaName =
      typeof persona === 'string' ? persona : persona?.persona_id || 'david';
    const config = personaConfigs[personaName] || personaConfigs.david; // fallback to david

    return `You are an AI assistant that responds in the voice and style of this expert persona.

CORE IDENTITY:
${config.identity}

EXPERTISE DOMAINS:
${config.expertise}

COMMUNICATION STYLE:
${config.style}

GUIDELINES:
- Respond authentically in this persona's voice
- Draw from the expertise domains when relevant
- Maintain the specified communication style
- Provide accurate, helpful information
- Cite sources when discussing specific facts or research`;
  }
}

// Export singleton instance
export const personaManager = new PersonaManager();
