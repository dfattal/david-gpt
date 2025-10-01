/**
 * API route for updating document metadata
 * PATCH /api/admin/documents/[id]/metadata
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import matter from 'gray-matter';
import crypto from 'crypto';

interface MetadataUpdate {
  title?: string;
  type?: string;
  date?: string;
  source_url?: string;
  tags?: string[];
  summary?: string;
  license?: string;
  author?: string;
  publisher?: string;
  keyTerms?: string[];
  alsoKnownAs?: Record<string, string[]>;
  identifiers?: Record<string, string>; // Structured identifiers
  dates?: Record<string, string>; // Structured dates
  actors?: Array<{ name: string; role: string }>; // Actors
}

interface UpdateResponse {
  success: boolean;
  document?: {
    id: string;
    title: string;
    updated_at: string;
  };
  error?: string;
}

/**
 * PATCH /api/admin/documents/[id]/metadata
 * Update document frontmatter, Key Terms, and Also Known As sections
 *
 * Body: MetadataUpdate (JSON)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<UpdateResponse>> {
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
    const updates: MetadataUpdate = await request.json();

    // Fetch current document
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select(`
        *,
        document_files!fk_doc_id (storage_path, content_hash)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    const fileInfo = doc.document_files?.[0];
    if (!fileInfo?.storage_path) {
      return NextResponse.json(
        { success: false, error: 'Document file not found in storage' },
        { status: 404 }
      );
    }

    // Parse current content
    const currentContent = doc.raw_content;
    const { data: currentMeta, content: bodyContent } = matter(currentContent);

    // Merge updates with current metadata
    const updatedMeta = {
      ...currentMeta,
      ...(updates.title && { title: updates.title }),
      ...(updates.type && { type: updates.type }),
      ...(updates.date && { date: updates.date }),
      ...(updates.source_url !== undefined && { source_url: updates.source_url }),
      ...(updates.tags && { tags: updates.tags }),
      ...(updates.summary && { summary: updates.summary }),
      ...(updates.license && { license: updates.license }),
      ...(updates.author && { author: updates.author }),
      ...(updates.publisher && { publisher: updates.publisher }),
      ...(updates.identifiers && { identifiers: updates.identifiers }),
      ...(updates.dates && { dates: updates.dates }),
      ...(updates.actors && { actors: updates.actors }),
    };

    // Update Key Terms and Also Known As sections if provided
    let updatedBody = bodyContent;

    if (updates.keyTerms) {
      // Replace or add Key Terms section
      const keyTermsSection = `## Key Terms\n\n${updates.keyTerms.map(term => `- ${term}`).join('\n')}`;

      if (updatedBody.includes('## Key Terms')) {
        updatedBody = updatedBody.replace(
          /## Key Terms\n\n[\s\S]*?(?=\n## |\n---|\Z)/,
          keyTermsSection + '\n\n'
        );
      } else {
        // Add before Also Known As or at the beginning
        if (updatedBody.includes('## Also Known As')) {
          updatedBody = keyTermsSection + '\n\n' + updatedBody;
        } else {
          updatedBody = keyTermsSection + '\n\n' + updatedBody;
        }
      }
    }

    if (updates.alsoKnownAs) {
      // Replace or add Also Known As section
      const akaLines = Object.entries(updates.alsoKnownAs).map(
        ([term, aliases]) => `- **${term}**: ${aliases.join(', ')}`
      );
      const akaSection = `## Also Known As (AKA)\n\n${akaLines.join('\n')}`;

      if (updatedBody.includes('## Also Known As')) {
        updatedBody = updatedBody.replace(
          /## Also Known As.*?\n\n[\s\S]*?(?=\n## |\n---|\Z)/,
          akaSection + '\n\n'
        );
      } else {
        // Add after Key Terms or at the beginning
        if (updatedBody.includes('## Key Terms')) {
          updatedBody = updatedBody.replace(
            /(## Key Terms\n\n[\s\S]*?(?=\n## |\n---|\Z))/,
            `$1${akaSection}\n\n`
          );
        } else {
          updatedBody = akaSection + '\n\n' + updatedBody;
        }
      }
    }

    // Reconstruct markdown with updated frontmatter
    const updatedContent = matter.stringify(updatedBody.trim(), updatedMeta);

    // Calculate new hash
    const newHash = crypto
      .createHash('sha256')
      .update(updatedContent)
      .digest('hex');

    // Update document in database
    const { error: updateError } = await supabase
      .from('docs')
      .update({
        title: updatedMeta.title,
        type: updatedMeta.type,
        date: updatedMeta.date || null,
        source_url: updatedMeta.source_url || null,
        tags: updatedMeta.tags || [],
        summary: updatedMeta.summary || null,
        license: updatedMeta.license || null,
        identifiers: updatedMeta.identifiers || {},
        dates_structured: updatedMeta.dates || {},
        actors: updatedMeta.actors || [],
        raw_content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { success: false, error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Update file in storage
    const { error: storageError } = await supabase.storage
      .from('formatted-documents')
      .update(fileInfo.storage_path, updatedContent, {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (storageError) {
      console.error('Storage update error:', storageError);
      // Continue anyway - database is source of truth
    }

    // Update content hash in document_files
    await supabase
      .from('document_files')
      .update({
        content_hash: newHash,
        file_size: new Blob([updatedContent]).size,
      })
      .eq('storage_path', fileInfo.storage_path);

    return NextResponse.json({
      success: true,
      document: {
        id,
        title: updatedMeta.title,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error in PATCH /api/admin/documents/[id]/metadata:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
