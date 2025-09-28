import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import {
  DocumentFormatValidator,
  type ValidationResult,
} from '@/lib/validation/document-format-validator';
import {
  unifiedIngestionService,
  type BatchIngestionRequest,
} from '@/lib/rag/ingestion-service';
import type { DocumentType } from '@/lib/rag/types';

/**
 * Folder-Based Batch Ingestion API
 *
 * Accepts folder uploads with recursive file discovery for `/my-corpus` structure.
 * Processes each markdown file through validation and ingestion pipeline.
 * Maintains folder structure organization and provides detailed progress tracking.
 */

interface FolderFile {
  name: string;
  path: string;
  content: string;
  size: number;
  type: string;
  webkitRelativePath?: string;
}

interface ProcessedDocument {
  title: string;
  filePath: string;
  folderPath: string;
  detectedType: DocumentType;
  confidence: number;
  validation?: ValidationResult;
  metadata: any;
  content: string;
}

interface FolderValidationSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  warningFiles: number;
  averageQualityScore: number;
  folderStructure: Record<string, number>;
  documentTypes: Record<string, number>;
  validationErrors: Array<{
    fileName: string;
    errors: ValidationResult['errors'];
  }>;
}

export async function POST(req: NextRequest) {
  try {
    // Check for service role bypass (for testing only)
    const authHeader = req.headers.get('Authorization');
    const isServiceRoleRequest = authHeader?.includes(
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let supabase;
    let user;

    if (isServiceRoleRequest) {
      // Use admin client for service role requests
      const { createOptimizedAdminClient } = await import(
        '@/lib/supabase/server'
      );
      supabase = createOptimizedAdminClient();
      user = {
        id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf',
        email: 'dfattal@gmail.com',
      };
      console.log('🔑 Using service role authentication for folder ingestion');
    } else {
      // Standard authentication
      supabase = await createClient();
      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) {
        throw new AppError('Authentication required', 401);
      }
      user = authUser;
    }

    const contentType = req.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      throw new AppError(
        'Folder upload requires multipart/form-data with files',
        400
      );
    }

    const formData = await req.formData();

    // Extract configuration options
    const validateOnly = formData.get('validateOnly') === 'true';
    const strictValidation = formData.get('strictValidation') === 'true';
    const batchDescription =
      (formData.get('batchDescription') as string) || 'Folder batch ingestion';
    const skipInvalidFiles = formData.get('skipInvalidFiles') === 'true';

    // Extract files from FormData
    const files: FolderFile[] = [];
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && key.startsWith('file_')) {
        // Only process markdown files
        if (!value.name.endsWith('.md') && !value.name.endsWith('.markdown')) {
          console.log(`⏭️ Skipping non-markdown file: ${value.name}`);
          continue;
        }

        const content = await value.text();
        files.push({
          name: value.name,
          path: value.webkitRelativePath || value.name,
          content,
          size: value.size,
          type: value.type,
          webkitRelativePath: value.webkitRelativePath,
        });
      }
    }

    if (files.length === 0) {
      throw new AppError(
        'No markdown files found in upload. Please ensure your folder contains .md or .markdown files.',
        400
      );
    }

    console.log(`📁 Processing folder ingestion:`, {
      totalFiles: files.length,
      validateOnly,
      strictValidation,
      skipInvalidFiles,
      batchDescription,
    });

    // Process files recursively
    const processedDocuments: ProcessedDocument[] = [];
    const validationSummary: FolderValidationSummary = {
      totalFiles: files.length,
      validFiles: 0,
      invalidFiles: 0,
      warningFiles: 0,
      averageQualityScore: 0,
      folderStructure: {},
      documentTypes: {},
      validationErrors: [],
    };

    let totalQualityScore = 0;

    // Process each file
    for (const file of files) {
      try {
        console.log(`📄 Processing file: ${file.path}`);

        // Validate markdown format
        const validation = DocumentFormatValidator.validateDocument(
          file.content,
          file.name
        );

        // Update validation summary
        if (validation.isValid) {
          validationSummary.validFiles++;
        } else {
          validationSummary.invalidFiles++;
          validationSummary.validationErrors.push({
            fileName: file.path,
            errors: validation.errors,
          });
        }

        if (validation.warnings.length > 0) {
          validationSummary.warningFiles++;
        }

        totalQualityScore += validation.qualityScore;

        // Extract folder structure
        const folderPath = file.path.includes('/')
          ? file.path.substring(0, file.path.lastIndexOf('/'))
          : 'root';
        validationSummary.folderStructure[folderPath] =
          (validationSummary.folderStructure[folderPath] || 0) + 1;

        // Extract frontmatter for document type
        const { frontmatter } = parseFrontmatter(file.content);
        const docType = frontmatter.docType || 'note';
        validationSummary.documentTypes[docType] =
          (validationSummary.documentTypes[docType] || 0) + 1;

        // Create processed document entry
        const processedDoc: ProcessedDocument = {
          title:
            frontmatter.title ||
            extractTitleFromContent(file.content) ||
            file.name.replace(/\.md$/, ''),
          filePath: file.path,
          folderPath,
          detectedType: docType as DocumentType,
          confidence: validation.isValid ? 0.9 : 0.5,
          validation,
          metadata: {
            sourceType: 'folder-upload',
            originalFileName: file.name,
            folderPath,
            fileSize: file.size,
            validationScore: validation.qualityScore,
            ...frontmatter,
          },
          content: file.content,
        };

        // Only include valid documents or if skipping invalid files is disabled
        if (validation.isValid || !skipInvalidFiles) {
          processedDocuments.push(processedDoc);
        }
      } catch (error) {
        console.error(`❌ Error processing file ${file.path}:`, error);
        validationSummary.invalidFiles++;
        validationSummary.validationErrors.push({
          fileName: file.path,
          errors: [
            {
              type: 'structure',
              message: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error',
            },
          ],
        });

        if (!skipInvalidFiles) {
          // Create a basic document entry for failed files
          processedDocuments.push({
            title: file.name.replace(/\.md$/, ''),
            filePath: file.path,
            folderPath: file.path.includes('/')
              ? file.path.substring(0, file.path.lastIndexOf('/'))
              : 'root',
            detectedType: 'note' as DocumentType,
            confidence: 0.1,
            validation: {
              isValid: false,
              errors: [
                {
                  type: 'structure',
                  message: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  severity: 'error',
                },
              ],
              warnings: [],
              qualityScore: 0,
              suggestions: [],
            },
            metadata: {
              sourceType: 'folder-upload',
              originalFileName: file.name,
              folderPath: file.path.includes('/')
                ? file.path.substring(0, file.path.lastIndexOf('/'))
                : 'root',
              fileSize: file.size,
              processingError: true,
            },
            content: file.content,
          });
        }
      }
    }

    // Calculate final validation summary
    validationSummary.averageQualityScore = totalQualityScore / files.length;

    // For validation-only requests, return detailed validation results
    if (validateOnly) {
      return NextResponse.json(
        {
          validationSummary,
          processedDocuments: processedDocuments.map(doc => ({
            title: doc.title,
            filePath: doc.filePath,
            folderPath: doc.folderPath,
            validation: doc.validation,
            detectedType: doc.detectedType,
          })),
          message: `Validation complete. ${validationSummary.validFiles}/${validationSummary.totalFiles} files are valid.`,
          canProceed: validationSummary.validFiles > 0,
        },
        {
          status: validationSummary.validFiles > 0 ? 200 : 400,
        }
      );
    }

    // Check if we have any processable documents
    if (processedDocuments.length === 0) {
      throw new AppError('No valid documents found for ingestion', 400);
    }

    // Filter out invalid documents for ingestion if strict validation is enabled
    const documentsToIngest = strictValidation
      ? processedDocuments.filter(
          doc => doc.validation?.isValid && doc.validation.warnings.length === 0
        )
      : processedDocuments.filter(
          doc => doc.validation?.isValid || !skipInvalidFiles
        );

    if (documentsToIngest.length === 0) {
      return NextResponse.json(
        {
          error: 'No documents meet validation requirements for ingestion',
          validationSummary,
          suggestion: strictValidation
            ? 'Disable strictValidation or fix all warnings to proceed'
            : 'Fix validation errors or enable skipInvalidFiles to proceed',
        },
        { status: 400 }
      );
    }

    // Convert to batch ingestion format
    const batchDocuments = documentsToIngest.map(doc => ({
      title: doc.title,
      content: doc.content,
      detectedType: doc.detectedType,
      confidence: doc.confidence,
      metadata: doc.metadata,
    }));

    // Create batch ingestion request
    const batchRequest: BatchIngestionRequest = {
      type: 'batch',
      documents: batchDocuments,
      batchDescription: `${batchDescription} (${documentsToIngest.length} files from folder structure)`,
      userId: user.id,
      metadata: {
        sourceType: 'folder-upload',
        folderStructure: validationSummary.folderStructure,
        validationSummary,
        totalFilesProcessed: files.length,
        validFilesIngested: documentsToIngest.length,
      },
    };

    // Process through unified ingestion service
    const result = await unifiedIngestionService.ingestDocuments(batchRequest, {
      supabase,
      user,
    });

    if (!result.success) {
      throw new AppError(result.error || 'Folder batch ingestion failed', 500);
    }

    return NextResponse.json(
      {
        batchId: result.batchId,
        batchJobId: result.batchJobId,
        totalDocuments: result.totalDocuments,
        message: result.message,
        validationSummary,
        folderStructure: validationSummary.folderStructure,
        ingestionStats: {
          filesUploaded: files.length,
          documentsIngested: documentsToIngest.length,
          averageQualityScore: validationSummary.averageQualityScore,
          documentTypes: validationSummary.documentTypes,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET endpoint for folder ingestion information and examples
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'folder-structure-example') {
      return NextResponse.json({
        recommendedStructure: {
          '/my-corpus/': 'Root corpus folder',
          '/my-corpus/papers/': 'Academic papers and research documents',
          '/my-corpus/patents/': 'Patent documents and IP filings',
          '/my-corpus/articles/': 'Press articles and news content',
          '/my-corpus/specs/': 'Technical specifications and documentation',
          '/my-corpus/notes/': 'Personal notes and observations',
          '/my-corpus/books/': 'Book content and chapters',
        },
        usage: 'Upload your /my-corpus folder using the webkitdirectory API',
        supportedFiles: ['.md', '.markdown'],
        example: {
          'my-corpus/papers/ai-research-2024.md':
            'Research paper with docType: "paper"',
          'my-corpus/patents/display-tech-patent.md':
            'Patent with docType: "patent"',
          'my-corpus/articles/tech-news.md':
            'Article with docType: "press-article"',
          'my-corpus/notes/meeting-notes.md':
            'Personal note with docType: "note"',
        },
      });
    }

    if (action === 'validation-requirements') {
      return NextResponse.json({
        requiredForAllFiles: [
          'YAML frontmatter with --- markers',
          'title field in frontmatter',
          'docType field in frontmatter',
          'scraped_at timestamp',
          'word_count number',
          'extraction_quality (high/medium/low)',
        ],
        recommendedForQuality: [
          'Abstract or summary section',
          'Proper heading hierarchy (# ## ###)',
          'Relevant keywords in frontmatter',
          'Author or creator information',
          'Document-specific metadata (DOI, patent numbers, etc.)',
        ],
        qualityScoring: {
          high: '90-100 points',
          good: '70-89 points',
          acceptable: '50-69 points',
          poor: 'Below 50 points',
        },
      });
    }

    // Default: return API information
    return NextResponse.json({
      endpoint: '/api/documents/folder-ingest',
      methods: ['POST', 'GET'],
      description:
        'Folder-based batch ingestion with recursive processing for /my-corpus structure',
      usage: {
        POST: {
          contentType: 'multipart/form-data',
          requiredFields: ['files with webkitRelativePath'],
          optionalFields: [
            'validateOnly - true to validate without ingesting',
            'strictValidation - true to require zero warnings',
            'skipInvalidFiles - true to skip files with validation errors',
            'batchDescription - description for the batch job',
          ],
          fileRequirements: 'Only .md and .markdown files are processed',
          folderStructure: 'Maintains folder hierarchy from uploaded structure',
        },
        GET: {
          queryParams: {
            action: ['folder-structure-example', 'validation-requirements'],
          },
        },
      },
      supportedActions: {
        'folder-structure-example':
          'Get recommended /my-corpus folder organization',
        'validation-requirements':
          'Get validation requirements and quality scoring details',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: any;
  content: string;
  hasFrontmatter: boolean;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: content,
      hasFrontmatter: false,
    };
  }

  try {
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(match[1]) as any;
    return {
      frontmatter: frontmatter || {},
      content: match[2],
      hasFrontmatter: true,
    };
  } catch (error) {
    return {
      frontmatter: {},
      content: content,
      hasFrontmatter: false,
    };
  }
}

/**
 * Extract title from markdown content if not in frontmatter
 */
function extractTitleFromContent(content: string): string | null {
  const lines = content.split('\n');

  // Look for first H1 heading
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') && trimmed.length > 2) {
      return trimmed.substring(2).trim();
    }
  }

  return null;
}
