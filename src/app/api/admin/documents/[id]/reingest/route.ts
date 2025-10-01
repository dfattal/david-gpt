/**
 * API route for re-ingesting documents
 * POST /api/admin/documents/[id]/reingest
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { DatabaseIngestor } from '@/lib/rag/ingestion/databaseIngestor';

interface ReingestResponse {
  success: boolean;
  result?: {
    id: string;
    title: string;
    chunks_created: number;
  };
  error?: string;
}

/**
 * POST /api/admin/documents/[id]/reingest
 * Delete existing chunks and re-ingest document
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
    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select('id, title, raw_content, personas')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get persona slug (use first persona)
    const personaSlug = doc.personas?.[0];
    if (!personaSlug) {
      return NextResponse.json(
        { success: false, error: 'Document has no associated persona' },
        { status: 400 }
      );
    }

    // Delete existing chunks
    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('doc_id', id);

    if (deleteError) {
      console.error('Error deleting chunks:', deleteError);
      return NextResponse.json(
        { success: false, error: `Failed to delete existing chunks: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Re-ingest document
    const ingestor = new DatabaseIngestor(supabase, process.env.OPENAI_API_KEY);
    const result = await ingestor.ingestDocument(
      {
        filePath: id,
        content: doc.raw_content,
      },
      true // overwrite
    );

    if (result.error) {
      throw new Error(result.error);
    }

    // Count new chunks
    const { count, error: countError } = await supabase
      .from('chunks')
      .select('id', { count: 'exact', head: true })
      .eq('doc_id', id);

    if (countError) {
      console.error('Error counting chunks:', countError);
    }

    console.log(`✅ Re-ingested document ${id}: ${count || 0} chunks created`);

    return NextResponse.json({
      success: true,
      result: {
        id,
        title: doc.title,
        chunks_created: count || 0,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/admin/documents/[id]/reingest:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
