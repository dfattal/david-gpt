/**
 * API route for listing and managing RAG documents
 * GET /api/admin/documents - List all documents with filters
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export interface DocumentListItem {
  id: string;
  title: string;
  personas: string[]; // Multi-persona support
  persona_slug: string; // Deprecated: kept for backward compatibility (first persona)
  type: string;
  date: string | null;
  source_url: string | null;
  tags: string[];
  summary: string | null;
  chunk_count: number;
  file_size: number | null;
  updated_at: string;
  storage_path: string | null;
}

/**
 * GET /api/admin/documents
 * List all documents with optional filters
 *
 * Query params:
 * - personaSlug: Filter by persona slug
 * - type: Filter by document type
 * - tags: Filter by tags (comma-separated)
 * - search: Search in title and summary
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

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

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const personaSlug = searchParams.get('personaSlug');
  const type = searchParams.get('type');
  const tagsParam = searchParams.get('tags');
  const search = searchParams.get('search');

  try {
    // Build query
    let query = supabase
      .from('docs')
      .select(`
        id,
        title,
        type,
        date,
        source_url,
        tags,
        summary,
        personas,
        updated_at,
        document_files!fk_doc_id (
          storage_path,
          file_size
        ),
        chunks (count)
      `);

    // Apply filters
    if (personaSlug) {
      query = query.contains('personas', [personaSlug]);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (tagsParam) {
      const tags = tagsParam.split(',').map((t) => t.trim());
      query = query.overlaps('tags', tags);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
    }

    // Execute query
    const { data: docs, error } = await query.order('updated_at', {
      ascending: false,
    });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    // Transform response
    const documents: DocumentListItem[] = docs.map((doc: any) => {
      const personas = doc.personas || [];
      const personaSlug = personas.length > 0 ? personas[0] : null;

      const fileInfo = doc.document_files?.[0];

      return {
        id: doc.id,
        title: doc.title,
        personas, // Full array for multi-persona support
        persona_slug: personaSlug, // Deprecated: kept for backward compatibility
        type: doc.type,
        date: doc.date,
        source_url: doc.source_url,
        tags: doc.tags || [],
        summary: doc.summary,
        chunk_count: doc.chunks?.[0]?.count || 0,
        file_size: fileInfo?.file_size || null,
        updated_at: doc.updated_at,
        storage_path: fileInfo?.storage_path || null,
      };
    });

    return NextResponse.json({
      documents,
      total: documents.length,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/documents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
