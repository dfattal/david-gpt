/**
 * Admin API Route for Knowledge Graph Quality Analysis
 *
 * Provides quality metrics, duplicate detection, and validation checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper function to check admin permissions
async function checkAdminPermissions(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { error: null };
}

// Helper function to calculate string similarity using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  const matrix = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(null));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return (maxLen - distance) / maxLen;
}

/**
 * GET /api/admin/kg/quality
 * Get knowledge graph quality metrics and issues
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
    const includeDetails = searchParams.get('details') === 'true';

    // 1. Basic statistics
    const { data: entityStats } = await supabaseAdmin
      .from('entities')
      .select('kind')
      .then(result => ({
        data:
          result.data?.reduce((acc: any, entity) => {
            if (entity.kind) {
              acc[entity.kind] = (acc[entity.kind] || 0) + 1;
            }
            return acc;
          }, {}) || {},
      }));

    const { count: totalEntities } = await supabaseAdmin
      .from('entities')
      .select('*', { count: 'exact', head: true });

    const { count: totalRelationships } = await supabaseAdmin
      .from('edges')
      .select('*', { count: 'exact', head: true });

    const { count: totalAliases } = await supabaseAdmin
      .from('aliases')
      .select('*', { count: 'exact', head: true });

    // 2. Find orphaned entities (entities with no relationships)
    let orphanedEntities;
    try {
      const result = await supabaseAdmin.rpc('find_orphaned_entities');
      orphanedEntities = result.data || [];
    } catch {
      // Fallback query if RPC doesn't exist
      const fallbackResult = await supabaseAdmin.from('entities').select(`
          id, name, kind, authority_score,
          outgoing:edges!edges_src_id_fkey(id),
          incoming:edges!edges_dst_id_fkey(id)
        `);

      orphanedEntities =
        fallbackResult.data?.filter(
          entity =>
            (!entity.outgoing || entity.outgoing.length === 0) &&
            (!entity.incoming || entity.incoming.length === 0)
        ) || [];
    }

    // 3. Find potential duplicate entities
    const duplicates: Array<{
      entities: Array<{
        id: string;
        name: string;
        kind: string;
        authority_score: number;
      }>;
      similarity: number;
    }> = [];

    if (includeDetails) {
      // Group entities by kind for more efficient comparison
      const { data: allEntities } = await supabaseAdmin
        .from('entities')
        .select('id, name, kind, authority_score')
        .order('kind');

      if (allEntities) {
        const entitiesByKind = allEntities.reduce((acc: any, entity) => {
          if (entity.kind) {
            if (!acc[entity.kind]) acc[entity.kind] = [];
            acc[entity.kind].push(entity);
          }
          return acc;
        }, {});

        // Find potential duplicates within each kind
        Object.values(entitiesByKind).forEach((entities: any) => {
          for (let i = 0; i < entities.length - 1; i++) {
            for (let j = i + 1; j < entities.length; j++) {
              const similarity = calculateSimilarity(
                entities[i].name.toLowerCase(),
                entities[j].name.toLowerCase()
              );

              if (similarity > 0.7) {
                // 70% similarity threshold
                duplicates.push({
                  entities: [entities[i], entities[j]],
                  similarity: Math.round(similarity * 100) / 100,
                });
              }
            }
          }
        });

        // Sort by similarity (highest first)
        duplicates.sort((a, b) => b.similarity - a.similarity);
      }
    }

    // 4. Find entities with low authority scores
    const { data: lowAuthorityEntities } = await supabaseAdmin
      .from('entities')
      .select('id, name, kind, authority_score, mention_count')
      .lt('authority_score', 0.3)
      .order('authority_score')
      .limit(20);

    // 5. Find entities with no aliases
    const { count: entitiesWithoutAliases } = await supabaseAdmin
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .not(
        'id',
        'in',
        `(${supabaseAdmin
          .from('aliases')
          .select('entity_id')
          .then(r => r.data?.map(a => a.entity_id).join(',') || '')})`
      );

    // 6. Relationship quality metrics
    const { data: relationshipStats } = await supabaseAdmin
      .from('edges')
      .select('rel')
      .then(result => ({
        data:
          result.data?.reduce((acc: any, edge) => {
            acc[edge.rel] = (acc[edge.rel] || 0) + 1;
            return acc;
          }, {}) || {},
      }));

    // 7. Find weak relationships (low confidence)
    const { data: weakRelationships } = await supabaseAdmin
      .from('edges')
      .select(
        `
        id, rel, weight, evidence_text,
        src_entity:entities!edges_src_id_fkey(name, kind),
        dst_entity:entities!edges_dst_id_fkey(name, kind)
      `
      )
      .lt('weight', 0.4)
      .order('weight')
      .limit(10);

    const qualityReport = {
      overview: {
        totalEntities: totalEntities || 0,
        totalRelationships: totalRelationships || 0,
        totalAliases: totalAliases || 0,
        entityDistribution: entityStats,
        relationshipDistribution: relationshipStats,
      },
      issues: {
        orphanedEntities: {
          count: orphanedEntities?.length || 0,
          entities: includeDetails ? orphanedEntities?.slice(0, 10) : undefined,
        },
        potentialDuplicates: {
          count: duplicates.length,
          duplicates: includeDetails ? duplicates.slice(0, 10) : undefined,
        },
        lowAuthorityEntities: {
          count: lowAuthorityEntities?.length || 0,
          entities: includeDetails ? lowAuthorityEntities : undefined,
        },
        entitiesWithoutAliases: {
          count: entitiesWithoutAliases || 0,
        },
        weakRelationships: {
          count: weakRelationships?.length || 0,
          relationships: includeDetails ? weakRelationships : undefined,
        },
      },
      recommendations: [
        ...(duplicates.length > 0
          ? ['Consider merging potential duplicate entities']
          : []),
        ...(orphanedEntities && orphanedEntities.length > 0
          ? ['Review orphaned entities for relevance']
          : []),
        ...((lowAuthorityEntities?.length || 0) > 0
          ? ['Validate or remove low authority entities']
          : []),
        ...((weakRelationships?.length || 0) > 0
          ? ['Review and strengthen weak relationships']
          : []),
      ],
    };

    return NextResponse.json(qualityReport);
  } catch (error) {
    console.error('Error in GET /api/admin/kg/quality:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
