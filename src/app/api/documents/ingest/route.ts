import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import {
  unifiedIngestionService,
  type SingleIngestionRequest,
  type BatchIngestionRequest,
} from '@/lib/rag/ingestion-service';
import { urlListParser } from '@/lib/rag/url-list-parser';
import type { DocumentType } from '@/lib/rag/types';

function extractPatentNumber(url: string): string | null {
  // Extract patent number from Google Patents URL
  const match = url.match(/([A-Z]{2}\d+[A-Z]\d)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    // DEPRECATION WARNING: This endpoint is deprecated
    console.warn(
      '⚠️  DEPRECATED: /api/documents/ingest is deprecated. Use /api/documents/markdown-ingest for single documents or /api/documents/folder-ingest for batch processing.'
    );

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
      console.log('🔑 Using service role authentication for testing');
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
    let body: any;
    let fileBuffer: Buffer | null = null;
    let fileName: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file upload)
      const formData = await req.formData();

      // Extract file if present
      const file = formData.get('file') as File | null;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        fileName = file.name;
      }

      // Extract other form fields
      body = {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
        docType: formData.get('docType') as string,
        url: formData.get('url') as string,
        patentUrl: formData.get('patentUrl') as string,
        doi: formData.get('doi') as string,
        metadata: formData.get('metadata')
          ? JSON.parse(formData.get('metadata') as string)
          : undefined,
      };
    } else {
      // Handle JSON request
      body = await req.json();

      // Handle base64 encoded file content
      if (body.fileContent) {
        fileBuffer = Buffer.from(body.fileContent, 'base64');
        fileName = body.fileName;
      }
    }

    const { title, content, docType, url, patentUrl, doi, metadata } = body;

    // Validation
    if (!content && !fileBuffer && !url && !patentUrl && !doi) {
      throw new AppError(
        'Either content, file upload, URL, patent URL, or DOI is required',
        400
      );
    }

    // Check for comma-separated URLs in single URL input
    if (url && url.includes(',')) {
      console.log(
        `🔄 Detected comma-separated URLs, converting to batch processing...`
      );

      const urls = url
        .split(',')
        .map((u: any) => u.trim())
        .filter((u: any) => u.length > 0);
      if (urls.length > 1) {
        console.log(`📚 Converting ${urls.length} URLs to batch request`);

        // Create batch request from comma-separated URLs
        const batchDocuments = urls.map((singleUrl: any, index: any) => ({
          title: title
            ? `${title} (${index + 1})`
            : `URL Document ${index + 1}`,
          detectedType: 'url',
          confidence: 0.8,
          metadata: {
            sourceUrl: singleUrl,
            batch: true,
            originalTitle: title,
          },
        }));

        const batchRequest: BatchIngestionRequest = {
          type: 'batch',
          documents: batchDocuments,
          batchDescription: title || `Batch processing of ${urls.length} URLs`,
          userId: user.id,
          metadata: {
            originalInput: 'comma-separated-urls',
            splitFromSingleUrl: true,
          },
        };

        // Process as batch
        const result = await unifiedIngestionService.ingestDocuments(
          batchRequest,
          { supabase, user }
        );

        if (!result.success) {
          throw new AppError(result.error || 'Batch URL ingestion failed', 500);
        }

        return NextResponse.json(
          {
            batchId: result.batchId,
            batchJobId: result.batchJobId,
            totalDocuments: result.totalDocuments,
            message: result.message,
            processedAs: 'batch',
          },
          { status: 201 }
        );
      }
    }

    console.log(`📝 Processing document ingestion:`, {
      title,
      type: docType,
      hasFile: !!fileBuffer,
      hasContent: !!content,
      hasUrl: !!url,
      hasPatentUrl: !!patentUrl,
      hasDoi: !!doi,
    });

    // If we have a file buffer, check if it's a text file we should read
    let fileContent: string | undefined;
    if (fileBuffer && fileName) {
      const isTextFile =
        fileName.endsWith('.md') ||
        fileName.endsWith('.txt') ||
        fileName.endsWith('.markdown') ||
        fileName.endsWith('.json');

      if (isTextFile) {
        try {
          fileContent = fileBuffer.toString('utf-8');
          console.log(
            `📄 Read text file content: ${fileName} (${fileContent.length} characters)`
          );
        } catch (error) {
          console.warn(`⚠️ Failed to read text file ${fileName}:`, error);
        }
      }
    }

    // Create ingestion request
    const ingestionRequest: SingleIngestionRequest = {
      type: 'single',
      title,
      content: content || fileContent, // Use file content if no direct content provided
      fileBuffer: fileBuffer || undefined,
      fileName,
      docType: docType as DocumentType,
      url,
      patentUrl,
      doi,
      metadata,
      userId: user.id,
    };

    // Process through unified ingestion service
    const result = await unifiedIngestionService.ingestDocuments(
      ingestionRequest,
      { supabase, user }
    );

    if (!result.success) {
      throw new AppError(result.error || 'Ingestion failed', 500);
    }

    return NextResponse.json(
      {
        documentId: result.documentId,
        jobId: result.jobId,
        message: result.message,
        warning:
          'DEPRECATED: This endpoint is deprecated. Use /api/documents/markdown-ingest for single documents or /api/documents/folder-ingest for batch processing.',
      },
      {
        status: 201,
        headers: {
          'X-Deprecated': 'true',
          'X-Deprecated-Message':
            'Use /api/documents/markdown-ingest for single documents or /api/documents/folder-ingest for batch processing.',
          'X-Migration-Guide':
            'See DOCS/Ingestion-Strategies.md for migration guidance',
        },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
