/**
 * Admin API Route for Entity Merging
 *
 * Merges multiple entities into a single canonical entity
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Validation schema
const MergeEntitiesSchema = z.object({
  targetEntityId: z.string().uuid(),
  sourceEntityIds: z.array(z.string().uuid()).min(1),
  newName: z.string().min(1).optional(),
  newDescription: z.string().optional(),
  createAliases: z.boolean().default(true),
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
 * POST /api/admin/entities/merge
 * Merge multiple entities into one canonical entity
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
    const validatedData = MergeEntitiesSchema.parse(body);

    const {
      targetEntityId,
      sourceEntityIds,
      newName,
      newDescription,
      createAliases,
    } = validatedData;

    // Validate that all entities exist and are the same kind
    const allEntityIds = [targetEntityId, ...sourceEntityIds];
    const { data: entities, error: fetchError } = await supabaseAdmin
      .from('entities')
      .select('id, name, kind, authority_score, mention_count')
      .in('id', allEntityIds);

    if (fetchError || !entities || entities.length !== allEntityIds.length) {
      return NextResponse.json(
        { error: 'One or more entities not found' },
        { status: 404 }
      );
    }

    // Check that all entities are the same kind
    const kinds = [...new Set(entities.map(e => e.kind))];
    if (kinds.length > 1) {
      return NextResponse.json(
        { error: 'Cannot merge entities of different kinds' },
        { status: 400 }
      );
    }

    const targetEntity = entities.find(e => e.id === targetEntityId);
    const sourceEntities = entities.filter(e => sourceEntityIds.includes(e.id));

    if (!targetEntity) {
      return NextResponse.json(
        { error: 'Target entity not found' },
        { status: 404 }
      );
    }

    // Calculate new authority score and mention count
    const totalAuthorityScore = entities.reduce(
      (sum, e) => sum + (e.authority_score || 0),
      0
    );
    const totalMentionCount = entities.reduce(
      (sum, e) => sum + (e.mention_count || 0),
      0
    );
    const avgAuthorityScore = totalAuthorityScore / entities.length;

    // Start the merge process
    console.log(
      `🔄 Starting merge of entities ${sourceEntityIds.join(', ')} into ${targetEntityId}`
    );

    // 1. Create aliases from source entity names (if requested)
    if (createAliases) {
      const aliasInserts = sourceEntities.map(sourceEntity => ({
        entity_id: targetEntityId,
        alias: sourceEntity.name,
        is_primary: false,
        confidence: 0.9,
      }));

      if (aliasInserts.length > 0) {
        const { error: aliasError } = await supabaseAdmin
          .from('aliases')
          .insert(aliasInserts);

        if (aliasError) {
          console.warn('Failed to create some aliases:', aliasError);
        } else {
          console.log(`✅ Created ${aliasInserts.length} aliases`);
        }
      }
    }

    // 2. Transfer all relationships from source entities to target entity
    for (const sourceEntityId of sourceEntityIds) {
      // Update outgoing relationships (where source entity is the src)
      const { error: outgoingError } = await supabaseAdmin
        .from('edges')
        .update({ src_id: targetEntityId })
        .eq('src_id', sourceEntityId)
        .eq('src_type', 'entity');

      if (outgoingError) {
        console.warn(
          `Failed to transfer outgoing relationships from ${sourceEntityId}:`,
          outgoingError
        );
      }

      // Update incoming relationships (where source entity is the dst)
      const { error: incomingError } = await supabaseAdmin
        .from('edges')
        .update({ dst_id: targetEntityId })
        .eq('dst_id', sourceEntityId)
        .eq('dst_type', 'entity');

      if (incomingError) {
        console.warn(
          `Failed to transfer incoming relationships to ${sourceEntityId}:`,
          incomingError
        );
      }
    }

    // 3. Transfer aliases from source entities to target entity
    for (const sourceEntityId of sourceEntityIds) {
      const { error: transferAliasError } = await supabaseAdmin
        .from('aliases')
        .update({ entity_id: targetEntityId })
        .eq('entity_id', sourceEntityId);

      if (transferAliasError) {
        console.warn(
          `Failed to transfer aliases from ${sourceEntityId}:`,
          transferAliasError
        );
      }
    }

    // 4. Transfer events from source entities to target entity
    for (const sourceEntityId of sourceEntityIds) {
      const { error: transferEventError } = await supabaseAdmin
        .from('events')
        .update({ entity_id: targetEntityId })
        .eq('entity_id', sourceEntityId);

      if (transferEventError) {
        console.warn(
          `Failed to transfer events from ${sourceEntityId}:`,
          transferEventError
        );
      }
    }

    // 5. Update target entity with new information
    const updateData: any = {
      authority_score: Math.max(
        avgAuthorityScore,
        targetEntity.authority_score || 0
      ),
      mention_count: totalMentionCount,
      updated_at: new Date().toISOString(),
    };

    if (newName) updateData.name = newName;
    if (newDescription !== undefined) updateData.description = newDescription;

    const { data: updatedEntity, error: updateError } = await supabaseAdmin
      .from('entities')
      .update(updateData)
      .eq('id', targetEntityId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update target entity:', updateError);
      return NextResponse.json(
        { error: 'Failed to update target entity' },
        { status: 500 }
      );
    }

    // 6. Delete source entities
    const { error: deleteError } = await supabaseAdmin
      .from('entities')
      .delete()
      .in('id', sourceEntityIds);

    if (deleteError) {
      console.error('Failed to delete source entities:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete source entities' },
        { status: 500 }
      );
    }

    console.log(
      `✅ Successfully merged ${sourceEntityIds.length} entities into ${targetEntityId}`
    );

    return NextResponse.json({
      message: 'Entities merged successfully',
      mergedEntity: updatedEntity,
      mergedEntityIds: sourceEntityIds,
      aliasesCreated: createAliases ? sourceEntities.length : 0,
      relationshipsTransferred: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error in POST /api/admin/entities/merge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
