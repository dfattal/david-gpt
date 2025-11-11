/**
 * API route for uploading formatted markdown documents
 * POST /api/admin/documents/upload
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getQueue } from '@/lib/queue/jobQueue';
import matter from 'gray-matter';
import crypto from 'crypto';

interface UploadResponse {
  success: boolean;
  document?: {
    id: string;
    title: string;
    storage_path: string;
  };
  error?: string;
}

/**
 * POST /api/admin/documents/upload
 * Upload a formatted markdown file and trigger ingestion
 *
 * Expected form-data:
 * - file: markdown file
 * - personaSlugs: JSON array of target personas (e.g., '["david","albert"]')
 */
export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
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
    if (!file.name.endsWith('.md') && !file.type.includes('markdown')) {
      return NextResponse.json(
        { success: false, error: 'Only markdown files are supported' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();
    const fileSize = new Blob([content]).size;

    // Parse frontmatter to get document ID
    const { data: frontmatter } = matter(content);
    const docId = frontmatter.id;

    if (!docId) {
      return NextResponse.json(
        { success: false, error: 'Document ID not found in frontmatter' },
        { status: 400 }
      );
    }

    // Calculate content hash
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    // Upload to Supabase Storage (use first persona for path)
    const storagePath = `${personaSlugs[0]}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('formatted-documents')
      .upload(storagePath, content, {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Create document_files record
    const { error: dbError } = await supabase
      .from('document_files')
      .upsert(
        {
          doc_id: docId,
          persona_slug: personaSlugs[0], // Use first persona for compatibility
          storage_path: storagePath,
          file_size: fileSize,
          content_hash: contentHash,
          uploaded_by: user.id,
        },
        { onConflict: 'storage_path' }
      );

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up uploaded file
      await supabase.storage
        .from('formatted-documents')
        .remove([storagePath]);

      return NextResponse.json(
        { success: false, error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Queue ingestion job for background processing
    try {
      const queue = getQueue();
      const job = await queue.add('markdown_single', {
        inputData: {
          storagePath,
          content,
          personaSlug: personaSlugs[0],
          userId: user.id,
          docId,
        },
      });

      console.log(
        `✅ Document uploaded and queued for processing: ${docId} (Job ID: ${job.id})`
      );
    } catch (queueError) {
      console.error('Failed to queue ingestion job:', queueError);
      // Don't fail the upload, but log the error
      // The document is uploaded, admin can manually trigger re-ingestion
    }

    // Get the document title for response
    const { data: doc } = await supabase
      .from('docs')
      .select('id, title')
      .eq('id', docId)
      .single();

    return NextResponse.json({
      success: true,
      document: {
        id: docId,
        title: doc?.title || docId,
        storage_path: storagePath,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/admin/documents/upload:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
