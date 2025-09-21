/**
 * Admin API Routes for Individual Relationship Management
 * 
 * Provides CRUD operations for specific relationships
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Validation schema
const UpdateRelationshipSchema = z.object({
  relation: z.enum([
    'author_of', 'inventor_of', 'assignee_of', 'cites', 'supersedes',
    'implements', 'used_in', 'similar_to', 'enables_3d', 'uses_component',
    'competing_with', 'integrates_with', 'can_use', 'enhances', 'evolved_to', 'alternative_to'
  ]).optional(),
  weight: z.number().min(0).max(1).optional(),
  evidenceText: z.string().optional(),
  evidenceDocId: z.string().uuid().optional(),
});

// Helper function to check admin permissions
async function checkAdminPermissions(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { error: null };
}

/**
 * GET /api/admin/relationships/[id]
 * Get a specific relationship with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const { data: relationship, error } = await supabaseAdmin
      .from('edges')
      .select(`
        id,
        src_id,
        src_type,
        rel,
        dst_id,
        dst_type,
        weight,
        evidence_text,
        evidence_doc_id,
        created_at,
        src_entity:entities!edges_src_id_fkey(name, kind, description),
        dst_entity:entities!edges_dst_id_fkey(name, kind, description),
        evidence_document:documents!edges_evidence_doc_id_fkey(title, doc_type)
      `)
      .eq('id', id)
      .single();

    if (error || !relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    return NextResponse.json({ relationship });

  } catch (error) {
    console.error('Error in GET /api/admin/relationships/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/relationships/[id]
 * Update a relationship
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = await request.json();
    const validatedData = UpdateRelationshipSchema.parse(body);

    // Check if relationship exists
    const { data: existing } = await supabaseAdmin
      .from('edges')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    // Update the relationship
    const updateData: any = {};

    if (validatedData.relation) updateData.rel = validatedData.relation;
    if (validatedData.weight !== undefined) updateData.weight = validatedData.weight;
    if (validatedData.evidenceText !== undefined) updateData.evidence_text = validatedData.evidenceText;
    if (validatedData.evidenceDocId !== undefined) updateData.evidence_doc_id = validatedData.evidenceDocId;

    const { data: relationship, error } = await supabaseAdmin
      .from('edges')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        src_id,
        src_type,
        rel,
        dst_id,
        dst_type,
        weight,
        evidence_text,
        evidence_doc_id,
        created_at,
        src_entity:entities!edges_src_id_fkey(name, kind),
        dst_entity:entities!edges_dst_id_fkey(name, kind)
      `)
      .single();

    if (error) {
      console.error('Failed to update relationship:', error);
      return NextResponse.json({ error: 'Failed to update relationship' }, { status: 500 });
    }

    return NextResponse.json({ relationship });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error in PUT /api/admin/relationships/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/relationships/[id]
 * Delete a relationship
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    // Check if relationship exists and get details for response
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('edges')
      .select(`
        id,
        src_id,
        src_type,
        rel,
        dst_id,
        dst_type,
        src_entity:entities!edges_src_id_fkey(name, kind),
        dst_entity:entities!edges_dst_id_fkey(name, kind)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    // Delete the relationship
    const { error: deleteError } = await supabaseAdmin
      .from('edges')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete relationship:', deleteError);
      return NextResponse.json({ error: 'Failed to delete relationship' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Relationship deleted successfully',
      deletedRelationship: existing
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/relationships/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}