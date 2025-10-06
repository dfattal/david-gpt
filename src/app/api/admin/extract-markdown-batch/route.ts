/**
 * Batch RAW Markdown Extraction API Route
 * POST /api/admin/extract-markdown-batch
 * Extracts and formats multiple RAW markdown files
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { formatBatchRawMarkdown, RawMarkdownInput } from '@/lib/rag/extraction/rawMarkdownFormatter';
import { storeBatchExtractedDocuments } from '@/lib/rag/storage/documentStorage';

interface StoredDocument {
  docId: string;
  title: string;
  storagePath: string;
  filename: string;
  success: boolean;
  error?: string;
}

interface BatchExtractionResponse {
  success: boolean;
  results?: {
    total: number;
    successful: number;
    failed: number;
    items: Array<{
      filename: string;
      success: boolean;
      markdown?: string;
      error?: string;
      stats?: {
        originalChars: number;
        formattedChars: number;
        documentType: string;
      };
    }>;
  };
  storedDocuments?: StoredDocument[];
  error?: string;
}

/**
 * POST /api/admin/extract-markdown-batch
 * Extract and format multiple RAW markdown files
 *
 * Expected form-data:
 * - files: Multiple RAW markdown files
 * - personaSlug: target persona
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<BatchExtractionResponse>> {
  const supabase = await createClient();

  // Check authentication and admin role
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const personaSlug = formData.get('personaSlug') as string;

    if (!personaSlug) {
      return NextResponse.json(
        { success: false, error: 'Persona slug is required' },
        { status: 400 }
      );
    }

    // Get Gemini API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Collect all markdown files
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        if (value.name.toLowerCase().endsWith('.md')) {
          files.push(value);
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No markdown files provided' },
        { status: 400 }
      );
    }

    console.log(`\n📦 Processing ${files.length} RAW markdown files...`);

    // Read all file contents
    const inputs: RawMarkdownInput[] = await Promise.all(
      files.map(async (file) => ({
        content: await file.text(),
        filename: file.name,
        personaSlugs: [personaSlug],
      }))
    );

    // Process all files
    const results = await formatBatchRawMarkdown(inputs, geminiApiKey);

    // Prepare results summary
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const items = results.map((result, idx) => ({
      filename: files[idx].name,
      success: result.success,
      markdown: result.markdown,
      error: result.error,
      stats: result.stats,
    }));

    // Store successful extractions in database
    const documentsToStore = successful
      .map((result, idx) => ({
        markdown: result.markdown!,
        personaSlugs: [personaSlug],
        filename: files[results.indexOf(result)].name,
        extractionMetadata: {
          documentType: result.stats?.documentType || 'article',
          originalChars: result.stats?.originalChars,
          formattedChars: result.stats?.formattedChars,
        },
      }));

    const storeResults = await storeBatchExtractedDocuments(
      supabase,
      user.id,
      documentsToStore
    );

    // Map storage results
    const storedDocuments: StoredDocument[] = storeResults.map((storeResult, idx) => ({
      docId: storeResult.docId || '',
      title: storeResult.title || '',
      storagePath: storeResult.storagePath || '',
      filename: documentsToStore[idx].filename,
      success: storeResult.success,
      error: storeResult.error,
    }));

    console.log(`\n✅ Batch extraction complete:`);
    console.log(`   Total: ${files.length}`);
    console.log(`   Successful: ${successful.length}`);
    console.log(`   Failed: ${failed.length}`);
    console.log(`   Stored: ${storedDocuments.filter(d => d.success).length}`);

    return NextResponse.json({
      success: true,
      results: {
        total: files.length,
        successful: successful.length,
        failed: failed.length,
        items,
      },
      storedDocuments,
    });

  } catch (error) {
    console.error('Error in POST /api/admin/extract-markdown-batch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
