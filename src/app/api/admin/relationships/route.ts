/**
 * Admin API Routes for Relationship Management
 *
 * Provides CRUD operations for knowledge graph relationships (edges)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Validation schemas
const CreateRelationshipSchema = z.object({
  srcId: z.string().uuid(),
  srcType: z.enum(['entity', 'document']),
  relation: z.enum([
    'author_of',
    'inventor_of',
    'assignee_of',
    'cites',
    'supersedes',
    'implements',
    'used_in',
    'similar_to',
    'enables_3d',
    'uses_component',
    'competing_with',
    'integrates_with',
    'can_use',
    'enhances',
    'evolved_to',
    'alternative_to',
  ]),
  dstId: z.string().uuid(),
  dstType: z.enum(['entity', 'document']),
  weight: z.number().min(0).max(1).default(0.5),
  evidenceText: z.string().optional(),
  evidenceDocId: z.string().uuid().optional(),
});

const UpdateRelationshipSchema = z.object({
  relation: z
    .enum([
      'author_of',
      'inventor_of',
      'assignee_of',
      'cites',
      'supersedes',
      'implements',
      'used_in',
      'similar_to',
      'enables_3d',
      'uses_component',
      'competing_with',
      'integrates_with',
      'can_use',
      'enhances',
      'evolved_to',
      'alternative_to',
    ])
    .optional(),
  weight: z.number().min(0).max(1).optional(),
  evidenceText: z.string().optional(),
  evidenceDocId: z.string().uuid().optional(),
});

const SearchRelationshipsSchema = z.object({
  entityId: z.string().uuid().optional(),
  relation: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
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
 * GET /api/admin/relationships
 * Search and list relationships with filtering
 */
export async function GET(request: NextRequest) {
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = SearchRelationshipsSchema.parse(
      Object.fromEntries(searchParams)
    );

    let query = supabaseAdmin.from('edges').select(`
        id,
        src_id,
        src_type,
        rel,
        dst_id,
        dst_type,
        weight,
        evidence_text,
        evidence_doc_id,
        created_at
      `);

    // Apply filters
    if (params.entityId) {
      query = query.or(
        `src_id.eq.${params.entityId},dst_id.eq.${params.entityId}`
      );
    }

    if (params.relation) {
      query = query.eq('rel', params.relation as any);
    }

    // Apply pagination
    query = query
      .order('created_at', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1);

    const { data: relationships, error, count } = await query;

    if (error) {
      console.error('Failed to fetch relationships:', error);
      return NextResponse.json(
        { error: 'Failed to fetch relationships' },
        { status: 500 }
      );
    }

    // Manually fetch related entities and documents
    const enrichedRelationships = await Promise.all(
      (relationships || []).map(async rel => {
        const enrichedRel = { ...rel };

        // Fetch source entity if it's an entity type
        if (rel.src_type === 'entity') {
          const { data: srcEntity } = await supabaseAdmin
            .from('entities')
            .select('name, kind')
            .eq('id', rel.src_id)
            .single();
          enrichedRel.src_entity = srcEntity;
        }

        // Fetch destination entity if it's an entity type
        if (rel.dst_type === 'entity') {
          const { data: dstEntity } = await supabaseAdmin
            .from('entities')
            .select('name, kind')
            .eq('id', rel.dst_id)
            .single();
          enrichedRel.dst_entity = dstEntity;
        }

        // Fetch evidence document if exists
        if (rel.evidence_doc_id) {
          const { data: evidenceDoc } = await supabaseAdmin
            .from('documents')
            .select('title')
            .eq('id', rel.evidence_doc_id)
            .single();
          enrichedRel.evidence_document = evidenceDoc;
        }

        return enrichedRel;
      })
    );

    return NextResponse.json({
      relationships: enrichedRelationships,
      pagination: {
        total: count || 0,
        offset: params.offset,
        limit: params.limit,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/relationships:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/relationships
 * Create a new relationship
 */
export async function POST(request: NextRequest) {
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status }
    );
  }

  try {
    const body = await request.json();
    const validatedData = CreateRelationshipSchema.parse(body);

    // Validate that source and destination entities/documents exist
    if (validatedData.srcType === 'entity') {
      const { data: srcEntity } = await supabaseAdmin
        .from('entities')
        .select('id')
        .eq('id', validatedData.srcId)
        .single();

      if (!srcEntity) {
        return NextResponse.json(
          { error: 'Source entity not found' },
          { status: 404 }
        );
      }
    }

    if (validatedData.dstType === 'entity') {
      const { data: dstEntity } = await supabaseAdmin
        .from('entities')
        .select('id')
        .eq('id', validatedData.dstId)
        .single();

      if (!dstEntity) {
        return NextResponse.json(
          { error: 'Destination entity not found' },
          { status: 404 }
        );
      }
    }

    // Check for duplicate relationship
    const { data: existing } = await supabaseAdmin
      .from('edges')
      .select('id')
      .eq('src_id', validatedData.srcId)
      .eq('src_type', validatedData.srcType)
      .eq('rel', validatedData.relation)
      .eq('dst_id', validatedData.dstId)
      .eq('dst_type', validatedData.dstType)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Relationship already exists' },
        { status: 409 }
      );
    }

    // Create the relationship
    const { data: relationship, error } = await supabaseAdmin
      .from('edges')
      .insert({
        src_id: validatedData.srcId,
        src_type: validatedData.srcType,
        rel: validatedData.relation,
        dst_id: validatedData.dstId,
        dst_type: validatedData.dstType,
        weight: validatedData.weight,
        evidence_text: validatedData.evidenceText,
        evidence_doc_id: validatedData.evidenceDocId,
      })
      .select(
        `
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
      `
      )
      .single();

    if (error) {
      console.error('Failed to create relationship:', error);
      return NextResponse.json(
        { error: 'Failed to create relationship' },
        { status: 500 }
      );
    }

    return NextResponse.json({ relationship }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error in POST /api/admin/relationships:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
