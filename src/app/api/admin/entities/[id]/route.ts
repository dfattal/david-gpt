/**
 * Admin API Routes for Individual Entity Management
 * 
 * Provides CRUD operations for specific entities
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Validation schemas
const UpdateEntitySchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(['person', 'organization', 'product', 'technology', 'component', 'document']).optional(),
  description: z.string().optional(),
  authorityScore: z.number().min(0).max(1).optional(),
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
 * GET /api/admin/entities/[id]
 * Get a specific entity with its relationships
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
    // Get entity details
    const { data: entity, error: entityError } = await supabaseAdmin
      .from('entities')
      .select(`
        id,
        name,
        kind,
        description,
        authority_score,
        mention_count,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .single();

    if (entityError || !entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Get entity aliases
    const { data: aliases } = await supabaseAdmin
      .from('aliases')
      .select('id, alias, is_primary, confidence')
      .eq('entity_id', id);

    // Get outgoing relationships
    const { data: outgoingRels } = await supabaseAdmin
      .from('edges')
      .select(`
        id,
        rel,
        weight,
        evidence_text,
        dst_id,
        dst_type,
        created_at,
        dst_entity:entities!edges_dst_id_fkey(name, kind)
      `)
      .eq('src_id', id)
      .eq('src_type', 'entity');

    // Get incoming relationships
    const { data: incomingRels } = await supabaseAdmin
      .from('edges')
      .select(`
        id,
        rel,
        weight,
        evidence_text,
        src_id,
        src_type,
        created_at,
        src_entity:entities!edges_src_id_fkey(name, kind)
      `)
      .eq('dst_id', id)
      .eq('dst_type', 'entity');

    return NextResponse.json({
      entity,
      aliases: aliases || [],
      relationships: {
        outgoing: outgoingRels || [],
        incoming: incomingRels || []
      }
    });

  } catch (error) {
    console.error('Error in GET /api/admin/entities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/entities/[id]
 * Update an entity
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
    const validatedData = UpdateEntitySchema.parse(body);

    // Check if entity exists
    const { data: existing } = await supabaseAdmin
      .from('entities')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // If updating name, check for duplicates (only if kind is also provided)
    if (validatedData.name && validatedData.kind) {
      const { data: duplicate } = await supabaseAdmin
        .from('entities')
        .select('id')
        .eq('name', validatedData.name)
        .eq('kind', validatedData.kind as any) // Type assertion to bypass strict typing
        .neq('id', id)
        .single();

      if (duplicate) {
        return NextResponse.json(
          { error: 'Another entity with this name and kind already exists' },
          { status: 409 }
        );
      }
    }

    // Update the entity
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.name) updateData.name = validatedData.name;
    if (validatedData.kind) updateData.kind = validatedData.kind;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.authorityScore !== undefined) updateData.authority_score = validatedData.authorityScore;

    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update entity:', error);
      return NextResponse.json({ error: 'Failed to update entity' }, { status: 500 });
    }

    return NextResponse.json({ entity });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error in PUT /api/admin/entities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/entities/[id]
 * Delete an entity and clean up its relationships
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
    // Check if entity exists
    const { data: existing } = await supabaseAdmin
      .from('entities')
      .select('id, name, kind')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Delete in transaction-like order (manually since Supabase doesn't support transactions)
    
    // 1. Delete aliases
    await supabaseAdmin
      .from('aliases')
      .delete()
      .eq('entity_id', id);

    // 2. Delete relationships (both incoming and outgoing)
    await supabaseAdmin
      .from('edges')
      .delete()
      .or(`src_id.eq.${id},dst_id.eq.${id}`);

    // 3. Delete events
    await supabaseAdmin
      .from('events')
      .delete()
      .eq('entity_id', id);

    // 4. Finally delete the entity
    const { error: deleteError } = await supabaseAdmin
      .from('entities')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete entity:', deleteError);
      return NextResponse.json({ error: 'Failed to delete entity' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Entity deleted successfully',
      deletedEntity: existing
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/entities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}