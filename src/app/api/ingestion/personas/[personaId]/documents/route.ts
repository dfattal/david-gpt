import { NextRequest, NextResponse } from 'next/server';
import { personaManager } from '@/lib/personas/persona-manager';
import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { PersonaAwareDocumentProcessor } from '@/lib/rag/persona-aware-document-processor';
import {
  withPersonaMiddleware,
  type PersonaMiddlewareContext,
} from '@/lib/personas/middleware';

interface Params {
  personaId: string;
}

async function handleDocumentIngestion(
  request: NextRequest,
  context: { params: Promise<Params> },
  personaContext: PersonaMiddlewareContext
) {
  try {
    const { persona_id, processing_config: config } = personaContext;

    // Parse form data for file uploads
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const docType = formData.get('doc_type') as string;
    const metadata = formData.get('metadata')
      ? JSON.parse(formData.get('metadata') as string)
      : {};

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Note: docType validation is handled by middleware

    const supabase = createOptimizedAdminClient();
    const processor = new PersonaAwareDocumentProcessor(supabase);
    const results = [];
    const errors = [];

    // Process each file
    for (const file of files) {
      try {
        console.log(
          `📄 Processing file: ${file.name} for persona: ${persona_id}`
        );

        // Create document record with persona association
        const { data: document, error: docError } = await supabase
          .from('documents')
          .insert({
            title: file.name,
            file_path: null, // Will be set after storage
            file_size: file.size,
            persona_id: null, // Will be set by processor
            document_type_id: null, // Will be resolved from docType
            processing_status: 'pending',
            identifiers: metadata.identifiers || {},
            dates: metadata.dates || {},
            actors: metadata.actors || {},
          })
          .select()
          .single();

        if (docError) {
          console.error('Database error creating document:', docError);
          errors.push(
            `Failed to create document record for ${file.name}: ${docError.message}`
          );
          continue;
        }

        // Extract file content (simplified - in production would use proper parsers)
        const fileBuffer = await file.arrayBuffer();
        const fileContent = new TextDecoder().decode(fileBuffer);

        // Process document with persona-aware processor
        const processingResult = await processor.processDocument({
          document_id: document.id,
          persona_id: persona_id,
          content: fileContent,
          doc_type: docType,
          file_path: file.name,
          metadata: {
            ...metadata,
            original_filename: file.name,
            file_size: file.size,
            upload_timestamp: new Date().toISOString(),
          },
        });

        if (processingResult.success) {
          results.push({
            document_id: document.id,
            filename: file.name,
            status: 'completed',
            processing_time_ms: processingResult.processing_time_ms,
            chunks_created: processingResult.chunks_created,
            entities_extracted: processingResult.entities_extracted,
            relationships_extracted: processingResult.relationships_extracted,
            persona_config: {
              persona_id: config.persona_id,
              processor: await personaManager.getEffectiveProcessor(
                persona_id,
                docType
              ),
              chunk_size: `${config.chunk_constraints.content_chunk_min_chars}-${config.chunk_constraints.content_chunk_max_chars}`,
              quality_threshold: config.quality_gates.min_completion_percentage,
            },
          });
        } else {
          errors.push(
            `Processing failed for ${file.name}: ${processingResult.errors?.join(', ')}`
          );
          results.push({
            document_id: document.id,
            filename: file.name,
            status: 'failed',
            error: processingResult.errors?.join(', '),
            warnings: processingResult.warnings,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing file ${file.name}:`, error);
        errors.push(`Error processing ${file.name}: ${errorMessage}`);
      }
    }

    const completedResults = results.filter(r => r.status === 'completed');
    const failedResults = results.filter(r => r.status === 'failed');

    const response = {
      success: completedResults.length > 0,
      persona_id: persona_id,
      total_files: files.length,
      completed: completedResults.length,
      failed: failedResults.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      processing_summary: {
        total_chunks_created: completedResults.reduce(
          (sum, r) => sum + (r.chunks_created || 0),
          0
        ),
        total_entities_extracted: completedResults.reduce(
          (sum, r) => sum + (r.entities_extracted || 0),
          0
        ),
        total_relationships_extracted: completedResults.reduce(
          (sum, r) => sum + (r.relationships_extracted || 0),
          0
        ),
        average_processing_time_ms:
          completedResults.length > 0
            ? completedResults.reduce(
                (sum, r) => sum + (r.processing_time_ms || 0),
                0
              ) / completedResults.length
            : 0,
      },
      config_summary: {
        document_types: config.document_types,
        default_processor: config.default_processor,
        chunk_constraints: config.chunk_constraints,
        quality_gates: config.quality_gates,
      },
    };

    // Determine response status
    let statusCode = 200;
    if (completedResults.length === 0 && failedResults.length > 0) {
      statusCode = 400; // All failed
    } else if (completedResults.length > 0 && failedResults.length > 0) {
      statusCode = 207; // Partial success
    }

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    console.error('Document ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process document ingestion',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Export the POST handler with persona middleware
export const POST = withPersonaMiddleware(handleDocumentIngestion, {
  requireProcessingConfig: true,
  requireDocumentTypeFromRequest: true,
});

async function handlePersonaInfo(
  request: NextRequest,
  context: { params: Promise<Params> },
  personaContext: PersonaMiddlewareContext
) {
  try {
    const { persona_id, processing_config: config } = personaContext;

    // Get recent documents for this persona
    const supabase = createOptimizedAdminClient();
    const { data: documents } = await supabase
      .from('documents')
      .select('id, title, processing_status, created_at')
      .eq('persona_id', persona_id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      persona_id: persona_id,
      ingestion_config: {
        allowed_document_types: config.document_types,
        default_processor: config.default_processor,
        chunk_constraints: config.chunk_constraints,
        quality_gates: config.quality_gates,
        supported_formats: ['pdf', 'txt', 'md', 'docx'], // TODO: Make this dynamic
      },
      recent_documents: documents || [],
      usage_stats: {
        total_documents: documents?.length || 0,
        processing_queue:
          documents?.filter(d => d.processing_status === 'pending').length || 0,
      },
    });
  } catch (error) {
    console.error('Error getting ingestion info:', error);
    return NextResponse.json(
      {
        error: 'Failed to get ingestion information',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Export the GET handler with persona middleware
export const GET = withPersonaMiddleware(handlePersonaInfo, {
  requireProcessingConfig: true,
});
