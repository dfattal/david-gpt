/**
 * API route for downloading document files
 * GET /api/admin/documents/[id]/download
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/documents/[id]/download
 * Download the formatted markdown file for a document
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
    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select(`
        id,
        title,
        raw_content,
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

    // Generate filename from title
    const filename = `${doc.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;

    // Return raw content as markdown file
    return new NextResponse(doc.raw_content, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/documents/[id]/download:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
