/**
 * Admin Statistics API
 * Returns dashboard statistics for documents, personas, and jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

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
      return NextResponse.json({ success: false, error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Fetch document statistics
    const { data: allDocs, error: docsError } = await supabase
      .from('docs')
      .select('ingestion_status');

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch document stats' },
        { status: 500 }
      );
    }

    const documentStats = {
      total: allDocs.length,
      extracted: allDocs.filter((d: any) => d.ingestion_status === 'extracted').length,
      ingested: allDocs.filter((d: any) => d.ingestion_status === 'ingested').length,
      failed: allDocs.filter((d: any) => d.ingestion_status === 'failed').length,
    };

    // Fetch persona count
    const { count: personaCount, error: personaError } = await supabase
      .from('personas')
      .select('*', { count: 'exact', head: true });

    if (personaError) {
      console.error('Error fetching personas:', personaError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch persona stats' },
        { status: 500 }
      );
    }

    // Fetch job statistics (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentJobs, error: jobsError } = await supabase
      .from('extraction_jobs')
      .select('status')
      .gte('created_at', twentyFourHoursAgo);

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      // Don't fail the entire request if jobs table doesn't exist yet
      return NextResponse.json({
        success: true,
        stats: {
          documents: documentStats,
          personas: {
            total: personaCount || 0,
          },
          jobs: {
            last24h: 0,
            pending: 0,
            failed: 0,
          },
        },
      });
    }

    const jobStats = {
      last24h: recentJobs?.length || 0,
      pending: recentJobs?.filter((j: any) => j.status === 'pending' || j.status === 'processing').length || 0,
      failed: recentJobs?.filter((j: any) => j.status === 'failed').length || 0,
    };

    return NextResponse.json({
      success: true,
      stats: {
        documents: documentStats,
        personas: {
          total: personaCount || 0,
        },
        jobs: jobStats,
      },
    });
  } catch (error) {
    console.error('Error in stats API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
