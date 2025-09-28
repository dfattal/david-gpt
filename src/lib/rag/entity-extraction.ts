/**
 * Modern Entity Extraction Service (Replacement for entity-extraction.ts)
 *
 * This is the new, simplified entity extraction system that replaces the
 * complex pattern-based approach with LLM-powered extraction.
 */

export {
  modernEntityExtractor,
  processDocumentEntitiesModern as processDocumentEntities,
  EntityExtractionService,
} from './entity-extraction-service';

export {
  unifiedLLMEntityExtractor,
  extractEntitiesWithLLM,
} from './unified-llm-entity-extractor';

export {
  getExtractionConfig,
  selectConfigForDocument,
  DAVID_GPT_LEIA_CONFIG,
  COMPUTER_VISION_CONFIG,
  BUSINESS_PRESS_CONFIG,
  GENERIC_TECH_CONFIG,
} from './extraction-configs';

// =======================
// Legacy Compatibility
// =======================

/**
 * Legacy compatibility function for existing ingestion pipeline
 */
export async function batchProcessEntities(limit = 10): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const { processDocumentEntitiesModern } = await import(
    './entity-extraction-service'
  );

  try {
    console.log(`🔄 Starting batch entity processing (limit: ${limit})...`);

    // Get documents that haven't been processed for entities
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('id, title')
      .eq('processing_status', 'completed')
      .limit(limit);

    if (!documents || documents.length === 0) {
      console.log('No documents found for entity processing');
      return;
    }

    console.log(`Processing ${documents.length} documents...`);

    for (const doc of documents) {
      try {
        await processDocumentEntitiesModern(doc.id);
      } catch (error) {
        console.error(
          `Failed to process entities for document ${doc.title}:`,
          error
        );
        // Continue with other documents
      }
    }

    console.log('✅ Batch entity processing completed');
  } catch (error) {
    console.error('Error in batchProcessEntities:', error);
    throw error;
  }
}
