/**
 * API route for re-ingesting documents (ASYNC)
 * POST /api/admin/documents/[id]/reingest
 * Returns jobId immediately, processing happens in background
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import type { ReingestJobData } from '@/lib/queue/types';

interface ReingestResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/admin/documents/[id]/reingest
 * Delete existing chunks and re-ingest document (async)
 * Useful after metadata updates or chunking strategy changes
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ReingestResponse>> {
  const supabase = await createClient();
  const { id } = await params;

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
    // Fetch document to validate it exists and get persona
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select('id, title, personas')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get persona slugs
    const personaSlugs = doc.personas;
    if (!personaSlugs || personaSlugs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document has no associated personas' },
        { status: 400 }
      );
    }

    // Create job data
    const jobData: ReingestJobData = {
      docId: id,
      personaSlugs,
      userId: user.id,
    };

    // Create async job
    const jobId = await createExtractionJob({
      jobType: 'reingest',
      inputData: jobData,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Ingestion job queued. Use /api/admin/jobs/[id] to check status.',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/documents/[id]/reingest:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
