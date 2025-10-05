/**
 * API route for individual document operations
 * GET /api/admin/documents/[id] - Get document details
 * DELETE /api/admin/documents/[id] - Delete document and associated data
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export interface DocumentDetails {
  id: string;
  title: string;
  type: string;
  date: string | null;
  source_url: string | null;
  tags: string[];
  summary: string | null;
  license: string | null;
  personas: string[];
  raw_content: string;
  ingestion_status: 'extracted' | 'ingested' | 'failed';
  extraction_metadata?: any;
  chunk_count: number;
  file_size: number | null;
  storage_path: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  uploaded_at: string | null;
}

/**
 * GET /api/admin/documents/[id]
 * Get full document details including content
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Check authentication and admin role
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Fetch document with file info and chunk count
    const { data: doc, error } = await supabase
      .from('docs')
      .select(`
        *,
        document_files!fk_doc_id (
          storage_path,
          file_size,
          content_hash,
          uploaded_at
        ),
        chunks (count)
      `)
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const fileInfo = doc.document_files?.[0];

    const document: DocumentDetails = {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      date: doc.date,
      source_url: doc.source_url,
      tags: doc.tags || [],
      summary: doc.summary,
      license: doc.license,
      personas: doc.personas || [],
      raw_content: doc.raw_content,
      ingestion_status: doc.ingestion_status || 'extracted',
      extraction_metadata: doc.extraction_metadata || {},
      chunk_count: doc.chunks?.[0]?.count || 0,
      file_size: fileInfo?.file_size || null,
      storage_path: fileInfo?.storage_path || null,
      content_hash: fileInfo?.content_hash || null,
      created_at: typeof doc.created_at === 'string' ? doc.created_at : doc.created_at?.toISOString(),
      updated_at: typeof doc.updated_at === 'string' ? doc.updated_at : doc.updated_at?.toISOString(),
      uploaded_at: fileInfo?.uploaded_at ?
        (typeof fileInfo.uploaded_at === 'string' ? fileInfo.uploaded_at : fileInfo.uploaded_at.toISOString())
        : null,
    };

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Error in GET /api/admin/documents/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/documents/[id]
 * Delete document and all associated data (chunks, files, storage)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Check authentication and admin role
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Fetch document with file info
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select(`
        id,
        title,
        document_files!fk_doc_id (storage_path)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const storagePath = doc.document_files?.[0]?.storage_path;

    // Delete from storage if exists
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from('formatted-documents')
        .remove([storagePath]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue anyway - database is source of truth
      }
    }

    // Delete document (cascades to chunks and document_files via FK constraints)
    const { error: deleteError } = await supabase
      .from('docs')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Database deletion error:', deleteError);
      return NextResponse.json(
        { error: `Delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ Deleted document: ${id} (${doc.title})`);

    return NextResponse.json({
      success: true,
      message: `Document "${doc.title}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error in DELETE /api/admin/documents/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
