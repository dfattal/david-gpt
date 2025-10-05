/**
 * API route for PDF extraction using async job queue
 * POST /api/admin/extract-pdf
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createExtractionJob } from '@/lib/queue/jobQueue';
import { PdfJobData } from '@/lib/queue/types';

interface ExtractionResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/admin/extract-pdf
 * Queue PDF extraction job
 *
 * Expected form-data:
 * - file: PDF file
 * - personaSlug: target persona
 * - docType: (optional) document type override
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
    const personaSlug = formData.get('personaSlug') as string;
    const docType = formData.get('docType') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!personaSlug) {
      return NextResponse.json(
        { success: false, error: 'Persona slug is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    console.log(`\n📄 PDF Extraction Job Request:`);
    console.log(`   File: ${file.name}`);
    console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
    console.log(`   Persona: ${personaSlug}`);
    console.log(`   Doc type override: ${docType || 'auto-detect'}`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString('base64');

    // Create job data
    const jobData: PdfJobData = {
      pdfBase64,
      filename: file.name,
      personaSlug,
      userId: user.id,
      docType: docType || undefined,
    };

    // Create extraction job
    const jobId = await createExtractionJob({
      jobType: 'pdf',
      inputData: jobData,
      userId: user.id,
    });

    console.log(`✅ Job ${jobId} created and queued (type: pdf)`);

    return NextResponse.json({
      success: true,
      jobId,
      message: 'PDF extraction job queued. Use /api/admin/jobs/[id] to check status.',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/extract-pdf:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
