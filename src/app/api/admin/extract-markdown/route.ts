/**
 * API route for RAW markdown extraction (ASYNC)
 * POST /api/admin/extract-markdown
 * Converts raw markdown files to RAG-formatted markdown with frontmatter
 * Returns jobId immediately, processing happens in background
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import type { MarkdownSingleJobData } from '@/lib/queue/types';

interface ExtractionResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/admin/extract-markdown
 * Extract and format RAW markdown to structured RAG markdown (async)
 *
 * Expected form-data:
 * - file: RAW markdown file
 * - personaSlugs: JSON array of target personas (e.g., '["david","albert"]')
 *
 * Returns: { success: true, jobId: "uuid", message: "Job queued" }
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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const personaSlugsStr = formData.get('personaSlugs') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!personaSlugsStr) {
      return NextResponse.json(
        { success: false, error: 'Persona slugs are required' },
        { status: 400 }
      );
    }

    // Parse persona slugs array
    let personaSlugs: string[];
    try {
      personaSlugs = JSON.parse(personaSlugsStr);
      if (!Array.isArray(personaSlugs) || personaSlugs.length === 0) {
        throw new Error('Invalid persona slugs array');
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'personaSlugs must be a JSON array with at least one slug' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.md')) {
      return NextResponse.json(
        { success: false, error: 'Only markdown (.md) files are supported' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Create job data
    const jobData: MarkdownSingleJobData = {
      content,
      filename: file.name,
      personaSlugs,
      userId: user.id,
    };

    // Create async job
    const jobId = await createExtractionJob({
      jobType: 'markdown_single',
      inputData: jobData,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Extraction job queued. Use /api/admin/jobs/[id] to check status.',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/extract-markdown:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
