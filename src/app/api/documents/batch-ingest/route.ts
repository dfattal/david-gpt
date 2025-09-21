import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { unifiedIngestionService, type BatchIngestionRequest } from '@/lib/rag/ingestion-service';

export async function POST(req: NextRequest) {
  try {
    // Check for service role bypass (for testing only)
    const authHeader = req.headers.get('Authorization');
    const isServiceRoleRequest = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    let supabase;
    let user;
    
    if (isServiceRoleRequest) {
      // Use admin client for service role requests
      const { createOptimizedAdminClient } = await import('@/lib/supabase/server');
      supabase = createOptimizedAdminClient();
      user = { id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', email: 'dfattal@gmail.com' };
      console.log('🔑 Using service role authentication for batch testing');
    } else {
      // Standard authentication
      supabase = await createClient();
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !authUser) {
        throw new AppError('Authentication required', 401);
      }
      user = authUser;
    }

    const contentType = req.headers.get('content-type') || '';
    let body: any;
    const fileMap = new Map<string, { buffer: Buffer; fileName: string }>();

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file uploads)
      const formData = await req.formData();
      
      // Extract JSON body
      const bodyData = formData.get('body') as string;
      if (!bodyData) {
        throw new AppError('Request body is required', 400);
      }
      body = JSON.parse(bodyData);
      
      // Extract files and build fileMap
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('file_') && value instanceof File) {
          const fileBuffer = Buffer.from(await value.arrayBuffer());
          fileMap.set(key, { buffer: fileBuffer, fileName: value.name });
        }
      }
    } else {
      // Handle JSON request
      body = await req.json();
    }
    
    const { documents, batchDescription } = body;

    // Validation
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new AppError('Documents array is required', 400);
    }

    if (documents.length > 100) {
      throw new AppError('Maximum 100 documents per batch', 400);
    }

    // Validate document requirements (consistent with single upload validation)
    for (const doc of documents) {
      const hasContent = doc.content;
      const hasFileContent = doc.fileContent || doc.fileKey;
      const hasUrl = doc.metadata?.url || doc.metadata?.sourceUrl;
      const hasPatentUrl = doc.metadata?.patentUrl;
      const hasDoi = doc.metadata?.doi;

      if (!hasContent && !hasFileContent && !hasUrl && !hasPatentUrl && !hasDoi) {
        throw new AppError(
          `Document "${doc.title || 'Untitled'}" must have content, file content, file upload, URL, patent URL, or DOI`,
          400
        );
      }

      // Validate fileKey references exist in fileMap
      if (doc.fileKey && !fileMap.has(doc.fileKey)) {
        throw new AppError(`File reference '${doc.fileKey}' not found in uploaded files`, 400);
      }
    }

    console.log(`📚 Processing batch ingestion:`, {
      totalDocuments: documents.length,
      batchDescription,
      hasFileUploads: fileMap.size > 0
    });

    // Create batch ingestion request
    const ingestionRequest: BatchIngestionRequest = {
      type: 'batch',
      documents,
      batchDescription,
      userId: user.id,
      metadata: {
        fileMap: fileMap.size > 0 ? Object.fromEntries(
          Array.from(fileMap.entries()).map(([key, { fileName }]) => [key, { fileName }])
        ) : undefined
      }
    };

    // Process through unified ingestion service
    const result = await unifiedIngestionService.ingestDocuments(
      ingestionRequest,
      { supabase, user }
    );

    if (!result.success) {
      throw new AppError(result.error || 'Batch ingestion failed', 500);
    }

    return NextResponse.json({
      batchId: result.batchId,
      batchJobId: result.batchJobId,
      totalDocuments: result.totalDocuments,
      message: result.message
    }, { status: 201 });

  } catch (error) {
    return handleApiError(error);
  }
}