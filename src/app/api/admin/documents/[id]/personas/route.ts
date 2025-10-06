/**
 * API Route: Update Document Persona Assignments
 * PATCH /api/admin/documents/[id]/personas
 *
 * Updates persona assignments for a document in both database and frontmatter
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import matter from 'gray-matter';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: docId } = await params;

    // Verify authentication and admin role
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    // Parse request body
    const { personaSlugs } = await request.json();

    if (!personaSlugs || !Array.isArray(personaSlugs) || personaSlugs.length === 0) {
      return NextResponse.json(
        { error: 'At least one persona must be assigned' },
        { status: 400 }
      );
    }

    // Fetch current document
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select('id, personas, raw_content')
      .eq('id', docId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Update frontmatter in raw_content
    const { data: frontmatter, content: bodyContent } = matter(doc.raw_content);
    frontmatter.personas = personaSlugs;
    const updatedMarkdown = matter.stringify(bodyContent, frontmatter);

    // Update database record
    const { error: updateError } = await supabase
      .from('docs')
      .update({
        personas: personaSlugs,
        raw_content: updatedMarkdown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId);

    if (updateError) {
      console.error('Failed to update document personas:', updateError);
      return NextResponse.json(
        { error: `Database update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Update storage file frontmatter
    // Note: We only update the primary storage file (first persona in original assignment)
    const { data: fileRecord } = await supabase
      .from('document_files')
      .select('storage_path')
      .eq('doc_id', docId)
      .single();

    if (fileRecord?.storage_path) {
      const { error: uploadError } = await supabase.storage
        .from('formatted-documents')
        .update(fileRecord.storage_path, updatedMarkdown, {
          contentType: 'text/markdown',
          upsert: true,
        });

      if (uploadError) {
        console.warn('Failed to update storage file frontmatter:', uploadError);
        // Continue anyway - database is source of truth
      }
    }

    console.log(
      `✅ Updated personas for document ${docId}: ${personaSlugs.join(', ')}`
    );

    return NextResponse.json({
      success: true,
      docId,
      personaSlugs,
      message: 'Persona assignments updated successfully',
    });
  } catch (error) {
    console.error('Error updating document personas:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update persona assignments',
      },
      { status: 500 }
    );
  }
}
