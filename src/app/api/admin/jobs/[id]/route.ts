/**
 * Admin Job Details API - Get single job with full details
 * Returns complete job information including input_data, result_data, and error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const jobId = params.id;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching job:', jobError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch job details' },
        { status: 500 }
      );
    }

    // Calculate duration if job has started
    let durationMs = null;
    if (job.started_at) {
      const endTime = job.completed_at ? new Date(job.completed_at) : new Date();
      const startTime = new Date(job.started_at);
      durationMs = endTime.getTime() - startTime.getTime();
    }

    // Return full job details
    const jobDetails = {
      id: job.id,
      job_type: job.job_type,
      status: job.status,
      progress: job.progress,
      input_data: job.input_data,
      result_data: job.result_data,
      error: job.error,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      user_id: job.user_id,
      created_by: job.created_by,
      duration_ms: durationMs,
    };

    return NextResponse.json({
      success: true,
      job: jobDetails,
    });
  } catch (error) {
    console.error('Error in job details API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
