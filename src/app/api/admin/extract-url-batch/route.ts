/**
 * Batch URL Extraction API Route (Async)
 * POST /api/admin/extract-url-batch
 * Queues a job to extract content from multiple URLs with optional metadata injection
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { parseUrlList, validateUrlList } from '@/lib/rag/extraction/urlListParser';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import { UrlBatchJobData } from '@/lib/queue/types';

interface BatchExtractionRequest {
  urlListContent: string;
  personaSlug: string;
}

interface BatchExtractionResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  totalUrls?: number;
  error?: string;
}

/**
 * POST /api/admin/extract-url-batch
 * Queue batch URL extraction job
 *
 * Expected JSON body:
 * {
 *   "urlListContent": "# Document List\n- URL1\n- URL2 | key1, key2 | aka: Name",
 *   "personaSlug": "david"
 * }
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
    const body: BatchExtractionRequest = await request.json();
    const { urlListContent, personaSlug } = body;

    if (!urlListContent) {
      return NextResponse.json(
        { success: false, error: 'URL list content is required' },
        { status: 400 }
      );
    }

    if (!personaSlug) {
      return NextResponse.json(
        { success: false, error: 'Persona slug is required' },
        { status: 400 }
      );
    }

    // Validate URL list
    const validation = validateUrlList(urlListContent);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid URL list: ${validation.errors.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Parse URL list
    const parsed = parseUrlList(urlListContent);

    console.log(`\n📦 Batch URL Extraction Job Request:`);
    console.log(`   Persona: ${personaSlug}`);
    console.log(`   Total URLs: ${parsed.totalCount}`);
    if (validation.warnings.length > 0) {
      console.log(`   Warnings: ${validation.warnings.join(', ')}`);
    }

    // Convert parsed items to job data format
    const urls = parsed.items.map(item => ({
      url: item.url,
      docType: undefined, // Will be auto-detected
      tags: item.keyTerms,
      aka: item.alsoKnownAs,
    }));

    // Create job data
    const jobData: UrlBatchJobData = {
      urls,
      personaSlug,
      userId: user.id,
    };

    // Create extraction job
    const jobId = await createExtractionJob({
      jobType: 'url_batch',
      inputData: jobData,
      userId: user.id,
    });

    console.log(`✅ Job ${jobId} created and queued (type: url_batch, ${urls.length} URLs)`);

    return NextResponse.json({
      success: true,
      jobId,
      totalUrls: urls.length,
      message: `Batch URL extraction job queued with ${urls.length} URLs. Use /api/admin/jobs/[id] to check status.`,
    });

  } catch (error) {
    console.error('Error in POST /api/admin/extract-url-batch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
