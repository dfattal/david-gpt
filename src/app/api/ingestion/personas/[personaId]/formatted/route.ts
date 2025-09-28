import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { personaManager } from '@/lib/personas/persona-manager';
import {
  DocumentFormatValidator,
  type ValidationResult,
} from '@/lib/validation/document-format-validator';
import {
  unifiedIngestionService,
  type BatchIngestionRequest,
} from '@/lib/rag/ingestion-service';
import {
  withPersonaMiddleware,
  type PersonaMiddlewareContext,
} from '@/lib/personas/middleware';
import type { DocumentType } from '@/lib/rag/types';
import { AppError, handleApiError } from '@/lib/utils';

interface Params {
  personaId: string;
}

interface FormattedDocumentRequest {
  documents?: string[]; // Specific documents, or "all" for all documents
  overwrite?: boolean; // Default false (skip existing)
  dryRun?: boolean; // Default false
  validateOnly?: boolean; // Default false
}

interface DocumentProcessingResult {
  filename: string;
  title: string;
  document_id?: string;
  status: 'ingested' | 'skipped' | 'failed' | 'duplicate';
  reason?: string;
  validation?: ValidationResult;
  processing_time_ms?: number;
  chunks_created?: number;
  entities_extracted?: number;
}

interface DuplicateCheckResult {
  exists: boolean;
  document_id?: string;
  title?: string;
  created_at?: string;
}

/**
 * Enhanced Persona Formatted Document Ingestion API
 *
 * Features:
 * - Persona-specific document ingestion from formatted/ directory
 * - Selective document processing (--all or specific documents)
 * - Duplicate detection with skip/overwrite options
 * - Dry run mode for testing
 * - Comprehensive progress reporting
 */
async function handleFormattedIngestion(
  request: NextRequest,
  context: { params: Promise<Params> },
  personaContext: PersonaMiddlewareContext
) {
  try {
    const { persona_id, processing_config: config } = personaContext;
    const body = (await request.json()) as FormattedDocumentRequest;

    const {
      documents = ['all'],
      overwrite = false,
      dryRun = false,
      validateOnly = false,
    } = body;

    console.log(
      `📥 Starting formatted document ingestion for persona: ${persona_id}`,
      {
        documents,
        overwrite,
        dryRun,
        validateOnly,
      }
    );

    // Construct formatted directory path
    const formattedDir = join(
      process.cwd(),
      'personas',
      persona_id,
      'formatted'
    );

    // Verify formatted directory exists
    try {
      statSync(formattedDir);
    } catch {
      return NextResponse.json(
        {
          error: `Formatted directory not found for persona: ${persona_id}`,
          path: formattedDir,
          suggestion:
            'Run document processing pipeline first: make process-manifest-{persona}',
        },
        { status: 404 }
      );
    }

    const supabase = createOptimizedAdminClient();

    // Get all available documents in formatted directory
    const availableDocuments = getFormattedDocuments(formattedDir);

    if (availableDocuments.length === 0) {
      return NextResponse.json(
        {
          error: 'No formatted documents found',
          path: formattedDir,
          suggestion:
            'Process raw documents first using: make process-manifest-{persona}',
        },
        { status: 404 }
      );
    }

    // Determine which documents to process
    let documentsToProcess: string[];

    if (documents.includes('all')) {
      documentsToProcess = availableDocuments;
    } else {
      // Validate that requested documents exist
      const missingDocs = documents.filter(
        doc => !availableDocuments.includes(doc)
      );
      if (missingDocs.length > 0) {
        return NextResponse.json(
          {
            error: 'Some requested documents not found',
            missing_documents: missingDocs,
            available_documents: availableDocuments,
          },
          { status: 400 }
        );
      }
      documentsToProcess = documents;
    }

    console.log(
      `📊 Processing ${documentsToProcess.length} documents:`,
      documentsToProcess
    );

    // Process each document
    const results: DocumentProcessingResult[] = [];
    const summary = {
      total: documentsToProcess.length,
      ingested: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    };

    for (const filename of documentsToProcess) {
      try {
        console.log(`📄 Processing: ${filename}`);

        const filePath = findDocumentPath(formattedDir, filename);
        if (!filePath) {
          results.push({
            filename,
            title: filename,
            status: 'failed',
            reason: 'File not found in formatted directory',
          });
          summary.failed++;
          continue;
        }

        // Read and parse document
        const content = readFileSync(filePath, 'utf-8');
        const { frontmatter, markdownContent } = parseFrontmatter(content);

        if (!frontmatter.title) {
          results.push({
            filename,
            title: filename,
            status: 'failed',
            reason: 'Missing title in frontmatter',
          });
          summary.failed++;
          continue;
        }

        // Validate document format
        const validation = DocumentFormatValidator.validateDocument(
          content,
          filename
        );

        if (validateOnly) {
          results.push({
            filename,
            title: frontmatter.title,
            status: validation.isValid ? 'ingested' : 'failed',
            reason: validation.isValid ? 'Valid document' : 'Validation failed',
            validation,
          });
          continue;
        }

        // Check for duplicates
        const duplicateCheck = await checkForDuplicate(
          supabase,
          frontmatter.title,
          persona_id
        );

        if (duplicateCheck.exists && !overwrite) {
          results.push({
            filename,
            title: frontmatter.title,
            document_id: duplicateCheck.document_id,
            status: 'duplicate',
            reason: `Document already exists (created: ${duplicateCheck.created_at})`,
          });
          summary.duplicates++;
          continue;
        }

        // Skip processing if dry run
        if (dryRun) {
          results.push({
            filename,
            title: frontmatter.title,
            status: duplicateCheck.exists ? 'duplicate' : 'ingested',
            reason: 'Dry run mode - would be processed',
          });
          if (!duplicateCheck.exists) summary.ingested++;
          else summary.duplicates++;
          continue;
        }

        // Delete existing document if overwriting
        if (duplicateCheck.exists && overwrite) {
          console.log(
            `🔄 Overwriting existing document: ${duplicateCheck.document_id}`
          );
          await deleteExistingDocument(supabase, duplicateCheck.document_id!);
        }

        // Perform actual ingestion
        const startTime = Date.now();

        const ingestionResult = await unifiedIngestionService.ingestDocuments(
          {
            type: 'single',
            title: frontmatter.title,
            content: content,
            docType: frontmatter.docType as DocumentType,
            userId: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', // TODO: Get from auth
            persona: { persona_id },
            metadata: {
              sourceType: 'formatted-ingestion',
              originalFilename: filename,
              filePath,
              formattedDirectory: true,
              persona_id,
              ...frontmatter,
            },
          },
          { supabase, user: { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf' } }
        );

        const processingTime = Date.now() - startTime;

        if (ingestionResult.success) {
          results.push({
            filename,
            title: frontmatter.title,
            document_id: ingestionResult.documentId,
            status: 'ingested',
            processing_time_ms: processingTime,
            chunks_created: ingestionResult.chunks_created,
            entities_extracted: ingestionResult.entities_extracted,
            validation,
          });
          summary.ingested++;
        } else {
          results.push({
            filename,
            title: frontmatter.title,
            status: 'failed',
            reason: ingestionResult.error || 'Unknown ingestion error',
            validation,
          });
          summary.failed++;
        }

        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error);
        results.push({
          filename,
          title: filename,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        summary.failed++;
      }
    }

    // Generate response
    const response = {
      persona_id,
      mode: dryRun ? 'dry-run' : validateOnly ? 'validation-only' : 'ingestion',
      summary,
      results,
      settings: {
        overwrite_duplicates: overwrite,
        dry_run: dryRun,
        validate_only: validateOnly,
        documents_requested: documents,
        documents_processed: documentsToProcess,
      },
      formatted_directory: formattedDir,
      total_available_documents: availableDocuments.length,
      processing_config: {
        persona_id: config.persona_id,
        allowed_document_types: config.document_types,
        chunk_constraints: config.chunk_constraints,
      },
    };

    // Determine appropriate status code
    let statusCode = 200;
    if (summary.failed > 0 && summary.ingested === 0) {
      statusCode = 400; // All failed
    } else if (summary.failed > 0) {
      statusCode = 207; // Partial success
    }

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    console.error('Formatted ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process formatted document ingestion',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get persona ingestion status and available documents
 */
async function handleIngestionStatus(
  request: NextRequest,
  context: { params: Promise<Params> },
  personaContext: PersonaMiddlewareContext
) {
  try {
    const { persona_id, processing_config: config } = personaContext;

    // Get formatted directory info
    const formattedDir = join(
      process.cwd(),
      'personas',
      persona_id,
      'formatted'
    );
    const availableDocuments = getFormattedDocuments(formattedDir);

    // Get database document counts
    const supabase = createOptimizedAdminClient();
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id, title, created_at, processing_status, file_path')
      .eq('persona_id', persona_id)
      .order('created_at', { ascending: false });

    // Analyze which documents are missing from database
    const ingestedFilenames = new Set(
      (existingDocs || [])
        .map(doc => doc.file_path)
        .filter(path => path && path.includes('formatted/'))
        .map(path => basename(path!))
    );

    const notIngested = availableDocuments.filter(
      doc => !ingestedFilenames.has(doc)
    );

    return NextResponse.json({
      persona_id,
      ingestion_status: {
        formatted_directory: formattedDir,
        total_formatted_documents: availableDocuments.length,
        total_ingested_documents: existingDocs?.length || 0,
        documents_not_ingested: notIngested.length,
        documents_ready_for_ingestion: notIngested,
      },
      available_documents: availableDocuments,
      ingested_documents:
        existingDocs?.map(doc => ({
          id: doc.id,
          title: doc.title,
          status: doc.processing_status,
          created_at: doc.created_at,
          filename: doc.file_path ? basename(doc.file_path) : null,
        })) || [],
      processing_config: {
        persona_id: config.persona_id,
        allowed_document_types: config.document_types,
        default_processor: config.default_processor,
      },
      suggested_actions: {
        ingest_all_new: {
          endpoint: 'POST /api/ingestion/personas/{persona}/formatted',
          payload: { documents: ['all'], overwrite: false },
        },
        dry_run_check: {
          endpoint: 'POST /api/ingestion/personas/{persona}/formatted',
          payload: { documents: ['all'], dryRun: true },
        },
        overwrite_all: {
          endpoint: 'POST /api/ingestion/personas/{persona}/formatted',
          payload: { documents: ['all'], overwrite: true },
        },
      },
    });
  } catch (error) {
    console.error('Error getting ingestion status:', error);
    return NextResponse.json(
      {
        error: 'Failed to get ingestion status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper functions
function getFormattedDocuments(formattedDir: string): string[] {
  try {
    const documents: string[] = [];
    const subdirs = readdirSync(formattedDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const subdirPath = join(formattedDir, subdir);
      const files = readdirSync(subdirPath)
        .filter(file => file.endsWith('.md'))
        .map(file => file);
      documents.push(...files);
    }

    return documents.sort();
  } catch {
    return [];
  }
}

function findDocumentPath(
  formattedDir: string,
  filename: string
): string | null {
  try {
    const subdirs = readdirSync(formattedDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const filePath = join(formattedDir, subdir, filename);
      try {
        statSync(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseFrontmatter(content: string): {
  frontmatter: any;
  markdownContent: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, markdownContent: content };
  }

  try {
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(match[1]) as any;
    return {
      frontmatter: frontmatter || {},
      markdownContent: match[2],
    };
  } catch {
    return { frontmatter: {}, markdownContent: content };
  }
}

async function checkForDuplicate(
  supabase: any,
  title: string,
  persona_id: string
): Promise<DuplicateCheckResult> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('title', title)
      .eq('persona_id', persona_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // Not found error
      console.error('Error checking for duplicate:', error);
      return { exists: false };
    }

    if (data) {
      return {
        exists: true,
        document_id: data.id,
        title: data.title,
        created_at: data.created_at,
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { exists: false };
  }
}

async function deleteExistingDocument(
  supabase: any,
  documentId: string
): Promise<void> {
  try {
    // Delete related data first (due to foreign key constraints)
    await Promise.all([
      supabase.from('document_chunks').delete().eq('document_id', documentId),
      supabase.from('document_entities').delete().eq('document_id', documentId),
      supabase
        .from('document_citations')
        .delete()
        .eq('document_id', documentId),
    ]);

    // Delete the document itself
    await supabase.from('documents').delete().eq('id', documentId);

    console.log(`🗑️ Deleted existing document: ${documentId}`);
  } catch (error) {
    console.error('Error deleting existing document:', error);
    throw new AppError(
      `Failed to delete existing document: ${documentId}`,
      500
    );
  }
}

// Export handlers with persona middleware
export const POST = withPersonaMiddleware(handleFormattedIngestion, {
  requireProcessingConfig: true,
});

export const GET = withPersonaMiddleware(handleIngestionStatus, {
  requireProcessingConfig: true,
});
