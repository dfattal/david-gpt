/**
 * Active Jobs API Route
 * GET /api/admin/jobs/active
 * Returns all active (pending/processing) extraction/ingestion jobs for the current user
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface ActiveJob {
  id: string;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    message: string;
  };
  docId?: string; // Document ID if available
  createdAt: string;
  error?: string;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch active jobs (pending or processing) for the current user
    const { data: jobs, error } = await supabase
      .from('extraction_jobs')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(50); // Limit to recent 50 jobs

    if (error) {
      console.error('Error fetching active jobs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch active jobs' },
        { status: 500 }
      );
    }

    // Transform database records to ActiveJob format
    const activeJobs: ActiveJob[] = (jobs || []).map((job) => {
      // Try to extract docId from result_data or input_data
      let docId: string | undefined;

      // Check result_data first (for completed extractions)
      if (job.result_data?.docIds?.length > 0) {
        docId = job.result_data.docIds[0];
      } else if (job.result_data?.storedDocuments?.length > 0) {
        docId = job.result_data.storedDocuments[0].docId;
      }
      // Check input_data for reingest jobs
      else if (job.job_type === 'reingest' && job.input_data?.docId) {
        docId = job.input_data.docId;
      }

      return {
        id: job.id,
        jobType: job.job_type,
        status: job.status as 'pending' | 'processing' | 'completed' | 'failed',
        progress: job.progress || { current: 0, total: 0, message: '' },
        docId,
        createdAt: job.created_at,
        error: job.error || undefined,
      };
    });

    return NextResponse.json({
      jobs: activeJobs,
      count: activeJobs.length,
    });
  } catch (error) {
    console.error('Error in active jobs endpoint:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
