import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { DocumentProcessor } from '@/lib/rag/document-processor.service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ personaId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    const { personaId } = await params;
    const body = await req.json();
    const { manifestPath, options = {} } = body;

    if (!manifestPath) {
      throw new AppError('Manifest path is required', 400);
    }

    // Validate persona exists and user has access
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('*')
      .eq('persona_id', personaId)
      .single();

    if (personaError || !persona) {
      throw new AppError(`Persona '${personaId}' not found`, 404);
    }

    console.log(`🚀 Starting document processing from manifest for persona: ${personaId}`);

    // Initialize document processor with persona configuration
    const processor = new DocumentProcessor({
      personaId,
      persona: persona,
      userId: user.id,
      ...options
    });

    // Process the manifest
    const result = await processor.processManifest(manifestPath);

    return NextResponse.json({
      success: true,
      personaId,
      manifestPath,
      totalDocuments: result.totalDocuments,
      successCount: result.successCount,
      failureCount: result.failureCount,
      skippedCount: result.skippedCount,
      duration: result.duration,
      successRate: result.successRate,
      errors: result.errors.slice(0, 10), // Limit errors in response
      message: `Processing completed for ${personaId} persona`
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Process manifest error:', error);
    return handleApiError(error);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ personaId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    const { personaId } = await params;

    // Get processing status for persona
    const { data: jobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('user_id', user.id)
      .ilike('config->>personaId', personaId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (jobsError) {
      throw new AppError('Failed to fetch processing status', 500);
    }

    return NextResponse.json({
      personaId,
      recentJobs: jobs || [],
      message: `Processing status for ${personaId} persona`
    });

  } catch (error) {
    return handleApiError(error);
  }
}