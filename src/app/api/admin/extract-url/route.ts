/**
 * Universal URL Extraction API Route (Async)
 * POST /api/admin/extract-url
 * Queues a job to extract content from any supported URL (patents, ArXiv, etc.)
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import { UrlSingleJobData } from '@/lib/queue/types';

interface ExtractionResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/admin/extract-url
 * Queue URL extraction job
 *
 * Expected JSON body:
 * {
 *   "url": "https://patents.google.com/patent/US10838134B2" | "arxiv:2405.10314" | etc.,
 *   "personaSlugs": ["david", "albert"],
 *   "docType": "patent" | "arxiv" (optional override),
 *   "tags": ["tag1", "tag2"] (optional),
 *   "aka": "Alternative name" (optional)
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse<ExtractionResponse>> {
  const supabase = await createClient();

  // Check authentication and admin role
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { url, personaSlugs, docType, tags, aka } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    if (!personaSlugs || !Array.isArray(personaSlugs) || personaSlugs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one persona slug is required' },
        { status: 400 }
      );
    }

    console.log(`\n📡 URL Extraction Job Request:`);
    console.log(`   URL: ${url}`);
    console.log(`   Personas: ${personaSlugs.join(', ')}`);
    console.log(`   Doc type override: ${docType || 'auto-detect'}`);
    console.log(`   Tags: ${tags ? JSON.stringify(tags) : 'none'}`);
    console.log(`   AKA: ${aka || 'none'}`);

    // Create job data
    const jobData: UrlSingleJobData = {
      url,
      personaSlugs,
      userId: user.id,
      docType,
      tags,
      aka,
    };

    // Create extraction job
    const jobId = await createExtractionJob({
      jobType: 'url_single',
      inputData: jobData,
      userId: user.id,
    });

    console.log(`✅ Job ${jobId} created and queued (type: url_single)`);

    return NextResponse.json({
      success: true,
      jobId,
      message: 'URL extraction job queued. Use /api/admin/jobs/[id] to check status.',
    });

  } catch (error) {
    console.error('Error in POST /api/admin/extract-url:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
