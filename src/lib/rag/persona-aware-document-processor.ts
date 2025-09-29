/**
 * Persona-Aware Document Processor
 *
 * Comprehensive document processing service that integrates persona-specific
 * configuration with the existing RAG pipeline components.
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { personaManager } from '@/lib/personas/persona-manager';
import type {
  PersonaConfig,
  DocumentProcessingConfig,
  ChunkConstraints,
  QualityGates
} from '@/lib/personas/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DocumentProcessingRequest {
  document_id: string;
  persona_id: string;
  content: string;
  doc_type: string;
  file_path?: string;
  metadata?: Record<string, any>;
}

export interface DocumentProcessingResult {
  success: boolean;
  document_id: string;
  persona_id: string;
  chunks_created: number;
  entities_extracted: number;
  relationships_extracted: number;
  processing_time_ms: number;
  errors?: string[];
  warnings?: string[];
}

export class PersonaAwareDocumentProcessor {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createOptimizedAdminClient();
  }

  /**
   * Main document processing method
   */
  async processDocument(request: DocumentProcessingRequest): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    const { document_id, persona_id, content, doc_type, file_path, metadata = {} } = request;

    console.log(`🎭 Starting persona-aware processing for document ${document_id} with persona ${persona_id}`);

    try {
      // Step 1: Load persona configuration
      const configResult = await personaManager.getDocumentProcessingConfig(persona_id);

      if (!configResult.success || !configResult.config) {
        return {
          success: false,
          document_id,
          persona_id,
          chunks_created: 0,
          entities_extracted: 0,
          relationships_extracted: 0,
          processing_time_ms: Date.now() - startTime,
          errors: [`Failed to load persona config: ${configResult.errors?.join(', ')}`]
        };
      }

      const processingConfig = configResult.config;

      // Step 2: Validate document type permissions
      const isAllowed = await personaManager.validateDocumentType(persona_id, doc_type);
      if (!isAllowed) {
        return {
          success: false,
          document_id,
          persona_id,
          chunks_created: 0,
          entities_extracted: 0,
          relationships_extracted: 0,
          processing_time_ms: Date.now() - startTime,
          errors: [`Document type '${doc_type}' not allowed for persona '${persona_id}'`]
        };
      }

      // Step 3: Get document type ID from database
      const documentTypeId = await this.getDocumentTypeId(doc_type, persona_id);
      if (!documentTypeId) {
        return {
          success: false,
          document_id,
          persona_id,
          chunks_created: 0,
          entities_extracted: 0,
          relationships_extracted: 0,
          processing_time_ms: Date.now() - startTime,
          errors: [`Could not resolve document type '${doc_type}' for persona '${persona_id}'`]
        };
      }

      // Step 4: Update document record with persona information
      await this.updateDocumentWithPersona(document_id, persona_id, documentTypeId);

      // Step 5: Perform persona-specific chunking
      const chunksResult = await this.performPersonaChunking(
        document_id,
        content,
        processingConfig.chunk_constraints,
        persona_id
      );

      if (!chunksResult.success) {
        return {
          success: false,
          document_id,
          persona_id,
          chunks_created: 0,
          entities_extracted: 0,
          relationships_extracted: 0,
          processing_time_ms: Date.now() - startTime,
          errors: chunksResult.errors
        };
      }

      // Step 6: Extract entities and relationships using persona constraints
      const entitiesResult = await this.extractPersonaEntities(
        document_id,
        content,
        processingConfig,
        persona_id
      );

      // Step 7: Apply quality gates
      const qualityResult = await this.applyQualityGates(
        document_id,
        chunksResult.chunks_created,
        entitiesResult.entities_extracted,
        processingConfig.quality_gates
      );

      // Step 8: Mark document as completed or failed based on quality gates
      const processingStatus = qualityResult.passed ? 'completed' : 'failed';
      await this.updateDocumentStatus(document_id, processingStatus, qualityResult.errors);

      const result: DocumentProcessingResult = {
        success: qualityResult.passed,
        document_id,
        persona_id,
        chunks_created: chunksResult.chunks_created,
        entities_extracted: entitiesResult.entities_extracted,
        relationships_extracted: entitiesResult.relationships_extracted,
        processing_time_ms: Date.now() - startTime,
        warnings: qualityResult.warnings
      };

      if (!qualityResult.passed) {
        result.errors = qualityResult.errors;
      }

      console.log(`✅ Completed persona-aware processing for ${document_id} in ${result.processing_time_ms}ms`);

      return result;

    } catch (error) {
      console.error(`❌ Error in persona-aware document processing:`, error);

      // Mark document as failed
      await this.updateDocumentStatus(document_id, 'failed', [
        error instanceof Error ? error.message : 'Unknown processing error'
      ]);

      return {
        success: false,
        document_id,
        persona_id,
        chunks_created: 0,
        entities_extracted: 0,
        relationships_extracted: 0,
        processing_time_ms: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get document type ID from database
   */
  private async getDocumentTypeId(docType: string, personaId: string): Promise<number | null> {
    try {
      // First try to find persona-specific document type
      const { data: personaType } = await this.supabase
        .from('document_types')
        .select('id')
        .eq('name', docType)
        .eq('persona_id', (await this.getPersonaUUID(personaId)))
        .single();

      if (personaType) {
        return personaType.id;
      }

      // Fall back to global document type
      const { data: globalType } = await this.supabase
        .from('document_types')
        .select('id')
        .eq('name', docType)
        .is('persona_id', null)
        .single();

      return globalType?.id || null;
    } catch (error) {
      console.error('Error resolving document type ID:', error);
      return null;
    }
  }

  /**
   * Get persona UUID from persona_id
   */
  private async getPersonaUUID(personaId: string): Promise<string | null> {
    try {
      const { data } = await this.supabase
        .from('personas')
        .select('id')
        .eq('persona_id', personaId)
        .single();

      return data?.id || null;
    } catch (error) {
      console.error('Error resolving persona UUID:', error);
      return null;
    }
  }

  /**
   * Update document record with persona association
   */
  private async updateDocumentWithPersona(
    documentId: string,
    personaId: string,
    documentTypeId: number
  ): Promise<void> {
    const personaUUID = await this.getPersonaUUID(personaId);

    await this.supabase
      .from('documents')
      .update({
        persona_id: personaUUID,
        document_type_id: documentTypeId,
        processing_status: 'processing'
      })
      .eq('id', documentId);
  }

  /**
   * Perform persona-specific chunking
   */
  private async performPersonaChunking(
    documentId: string,
    content: string,
    chunkConstraints: ChunkConstraints,
    personaId: string
  ): Promise<{ success: boolean; chunks_created: number; errors?: string[] }> {
    try {
      // Use persona-specific chunk constraints
      const chunks = this.chunkContentWithConstraints(content, chunkConstraints);

      let chunksCreated = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        await this.supabase
          .from('document_chunks')
          .insert({
            document_id: documentId,
            content: chunk.content,
            content_hash: this.generateContentHash(chunk.content),
            token_count: this.estimateTokens(chunk.content),
            chunk_index: i,
            chunk_type: 'content',
            overlap_start: chunk.overlap_start || 0,
            overlap_end: chunk.overlap_end || 0,
            metadata: {
              persona_id: personaId,
              chunk_constraints: chunkConstraints
            }
          });

        chunksCreated++;
      }

      return {
        success: true,
        chunks_created: chunksCreated
      };

    } catch (error) {
      console.error('Error in persona chunking:', error);
      return {
        success: false,
        chunks_created: 0,
        errors: [error instanceof Error ? error.message : 'Chunking failed']
      };
    }
  }

  /**
   * Chunk content using persona-specific constraints
   */
  private chunkContentWithConstraints(
    content: string,
    constraints: ChunkConstraints
  ): Array<{
    content: string;
    overlap_start?: number;
    overlap_end?: number;
  }> {
    const chunks = [];
    const minChars = constraints.content_chunk_min_chars;
    const maxChars = constraints.content_chunk_max_chars;
    const overlapPct = constraints.chunk_overlap_percentage;

    let position = 0;
    const contentLength = content.length;

    while (position < contentLength) {
      const remainingLength = contentLength - position;
      let chunkSize = Math.min(maxChars, remainingLength);

      // Ensure minimum chunk size if possible
      if (remainingLength > minChars && chunkSize < minChars) {
        chunkSize = minChars;
      }

      // Find a good break point (end of sentence or paragraph)
      let endPosition = position + chunkSize;
      if (endPosition < contentLength) {
        const breakPoint = this.findBreakPoint(content, endPosition);
        if (breakPoint > position + minChars) {
          endPosition = breakPoint;
        }
      }

      const chunkContent = content.substring(position, endPosition).trim();

      if (chunkContent.length > 0) {
        chunks.push({
          content: chunkContent,
          overlap_start: position > 0 ? Math.floor(chunkContent.length * (overlapPct / 100)) : 0,
          overlap_end: endPosition < contentLength ? Math.floor(chunkContent.length * (overlapPct / 100)) : 0
        });
      }

      // Calculate next position with overlap
      const overlap = Math.floor(chunkContent.length * (overlapPct / 100));
      position = Math.max(position + 1, endPosition - overlap);
    }

    return chunks;
  }

  /**
   * Find optimal break point for chunking
   */
  private findBreakPoint(content: string, position: number): number {
    const lookback = 100; // Look back up to 100 characters for a break point
    const startSearch = Math.max(0, position - lookback);

    // Look for paragraph breaks first
    const paragraphBreak = content.lastIndexOf('\n\n', position);
    if (paragraphBreak > startSearch) {
      return paragraphBreak;
    }

    // Look for sentence endings
    const sentenceBreak = content.search(/[.!?]\s+/g);
    if (sentenceBreak > startSearch && sentenceBreak <= position) {
      return sentenceBreak + 2; // Include the punctuation and space
    }

    // Fall back to word boundary
    const wordBreak = content.lastIndexOf(' ', position);
    if (wordBreak > startSearch) {
      return wordBreak;
    }

    return position; // No good break point found
  }

  /**
   * Extract entities using persona-specific requirements
   */
  private async extractPersonaEntities(
    documentId: string,
    content: string,
    config: DocumentProcessingConfig,
    personaId: string
  ): Promise<{ entities_extracted: number; relationships_extracted: number }> {
    try {
      // TODO: Implement persona-specific entity extraction
      // This would integrate with existing entity-extraction-service.ts
      // but filter results by config.entity_requirements.kg_required_entities
      // and config.entity_requirements.kg_required_edges

      console.log(`🔍 Entity extraction for persona ${personaId} - placeholder implementation`);
      console.log(`   - Allowed entities: ${config.entity_requirements.kg_required_entities.join(', ')}`);
      console.log(`   - Allowed relationships: ${config.entity_requirements.kg_required_edges.join(', ')}`);

      return {
        entities_extracted: 0, // Placeholder
        relationships_extracted: 0 // Placeholder
      };

    } catch (error) {
      console.error('Error in persona entity extraction:', error);
      return {
        entities_extracted: 0,
        relationships_extracted: 0
      };
    }
  }

  /**
   * Apply persona-specific quality gates
   */
  private async applyQualityGates(
    documentId: string,
    chunksCreated: number,
    entitiesExtracted: number,
    qualityGates: QualityGates
  ): Promise<{
    passed: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum completion percentage
    const completionPercentage = chunksCreated > 0 ? 100 : 0; // Simplified
    if (completionPercentage < qualityGates.min_completion_percentage) {
      errors.push(`Completion ${completionPercentage}% below minimum ${qualityGates.min_completion_percentage}%`);
    }

    // Check entity requirements
    if (qualityGates.require_metadata_chunk && chunksCreated === 0) {
      errors.push('No chunks created - metadata chunk required');
    }

    if (qualityGates.require_content_chunks && chunksCreated === 0) {
      errors.push('No content chunks created');
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Update document processing status
   */
  private async updateDocumentStatus(
    documentId: string,
    status: string,
    errors?: string[]
  ): Promise<void> {
    await this.supabase
      .from('documents')
      .update({
        processing_status: status,
        processed_at: new Date().toISOString(),
        error_message: errors?.join('; ') || null
      })
      .eq('id', documentId);
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Estimate token count (simplified)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough approximation
  }
}