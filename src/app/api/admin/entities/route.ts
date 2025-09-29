/**
 * Admin API Routes for Entity Management
 * 
 * Provides CRUD operations for knowledge graph entities with admin-level access
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Validation schemas
const CreateEntitySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['person', 'organization', 'product', 'technology', 'component', 'document']),
  description: z.string().optional(),
  authorityScore: z.number().min(0).max(1).default(0.5),
});

const UpdateEntitySchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(['person', 'organization', 'product', 'technology', 'component', 'document']).optional(),
  description: z.string().optional(),
  authorityScore: z.number().min(0).max(1).optional(),
});

const SearchEntitySchema = z.object({
  q: z.string().optional(),
  kind: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.enum(['name', 'authority_score', 'mention_count', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Helper function to check admin permissions
async function checkAdminPermissions(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  // For now, we'll implement basic validation
  // In production, you'd want proper JWT validation
  return { error: null };
}

/**
 * GET /api/admin/entities
 * Search and list entities with filtering and pagination
 */
export async function GET(request: NextRequest) {
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = SearchEntitySchema.parse(Object.fromEntries(searchParams));

    let query = supabaseAdmin
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
      `);

    // Apply filters
    if (params.q) {
      query = query.ilike('name', `%${params.q}%`);
    }

    if (params.kind) {
      query = query.eq('kind', params.kind as any);
    }

    // Apply sorting
    query = query.order(params.sortBy, { ascending: params.sortOrder === 'asc' });

    // Apply pagination
    query = query.range(params.offset, params.offset + params.limit - 1);

    const { data: entities, error, count } = await query;

    if (error) {
      console.error('Failed to fetch entities:', error);
      return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 });
    }

    return NextResponse.json({
      entities,
      pagination: {
        total: count || 0,
        offset: params.offset,
        limit: params.limit,
      }
    });

  } catch (error) {
    console.error('Error in GET /api/admin/entities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/entities
 * Create a new entity
 */
export async function POST(request: NextRequest) {
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = await request.json();
    const validatedData = CreateEntitySchema.parse(body);

    // Check for duplicate entity names within the same kind
    const { data: existing } = await supabaseAdmin
      .from('entities')
      .select('id')
      .eq('name', validatedData.name)
      .eq('kind', validatedData.kind)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Entity with this name and kind already exists' },
        { status: 409 }
      );
    }

    // Create the entity
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .insert({
        name: validatedData.name,
        kind: validatedData.kind,
        description: validatedData.description,
        authority_score: validatedData.authorityScore,
        mention_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create entity:', error);
      return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 });
    }

    return NextResponse.json({ entity }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error in POST /api/admin/entities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}