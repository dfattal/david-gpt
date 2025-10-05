/**
 * API route for bulk re-ingesting documents (ASYNC)
 * POST /api/admin/documents/bulk-reingest
 * Creates multiple reingest jobs for selected documents
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import type { ReingestJobData } from '@/lib/queue/types';

interface BulkReingestRequest {
  docIds: string[];
}

interface BulkReingestResponse {
  success: boolean;
  jobIds?: string[];
  message?: string;
  error?: string;
}

/**
 * POST /api/admin/documents/bulk-reingest
 * Create reingest jobs for multiple documents
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<BulkReingestResponse>> {
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
    const body: BulkReingestRequest = await request.json();
    const { docIds } = body;

    if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'docIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Fetch all documents to validate they exist and get personas
    const { data: docs, error: fetchError } = await supabase
      .from('docs')
      .select('id, title, personas')
      .in('id', docIds);

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch documents: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!docs || docs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid documents found' },
        { status: 404 }
      );
    }

    // Create jobs for each document
    const jobIds: string[] = [];

    for (const doc of docs) {
      // Get persona slug (use first persona)
      const personaSlug = doc.personas?.[0];
      if (!personaSlug) {
        console.warn(`Document ${doc.id} has no associated persona, skipping`);
        continue;
      }

      // Create job data
      const jobData: ReingestJobData = {
        docId: doc.id,
        personaSlug,
        userId: user.id,
      };

      // Create async job
      const jobId = await createExtractionJob({
        jobType: 'reingest',
        inputData: jobData,
        userId: user.id,
      });

      jobIds.push(jobId);
    }

    return NextResponse.json({
      success: true,
      jobIds,
      message: `Created ${jobIds.length} reingest job(s). Use /api/admin/jobs/[id] to check status.`,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/documents/bulk-reingest:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
