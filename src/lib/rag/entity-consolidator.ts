/**
 * Entity Consolidation System
 *
 * Identifies and merges similar/duplicate entities to improve KG quality.
 * Handles cases like "Leia" vs "Leia Inc", "OLED" vs "oled", etc.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { Entity, EntityKind, EntityAlias } from './types';

interface ConsolidationRule {
  primaryName: string;
  variants: string[];
  kind: EntityKind;
  description?: string;
}

// Domain-specific consolidation rules
const CONSOLIDATION_RULES: ConsolidationRule[] = [
  // Organizations - OEMs from press articles
  {
    primaryName: 'Leia Inc',
    variants: ['Leia', 'Leia Inc.', 'Leia Inc', 'LEIA'],
    kind: 'organization',
    description: '3D lightfield display technology company',
  },
  {
    primaryName: 'Samsung Electronics',
    variants: ['Samsung', 'Samsung Corp', 'Samsung Corporation'],
    kind: 'organization',
    description: 'South Korean consumer electronics company',
  },
  {
    primaryName: 'LG Electronics',
    variants: ['LG', 'LG Corp', 'LG Corporation'],
    kind: 'organization',
    description: 'South Korean consumer electronics company',
  },
  {
    primaryName: 'Sony Corporation',
    variants: ['Sony', 'Sony Corp', 'Sony Electronics'],
    kind: 'organization',
    description: 'Japanese consumer electronics company',
  },
  {
    primaryName: 'TCL Technology',
    variants: ['TCL', 'TCL Corp', 'TCL Corporation'],
    kind: 'organization',
    description: 'Chinese consumer electronics company',
  },
  {
    primaryName: 'Apple Inc',
    variants: ['Apple', 'Apple Corp', 'Apple Corporation'],
    kind: 'organization',
    description: 'American consumer electronics company',
  },
  {
    primaryName: 'Google LLC',
    variants: ['Google', 'Google Corp', 'Google Corporation'],
    kind: 'organization',
    description: 'American technology company',
  },

  // Technologies (normalize casing)
  {
    primaryName: 'OLED',
    variants: ['oled', 'Oled', 'OLED'],
    kind: 'technology',
    description: 'Organic Light-Emitting Diode display technology',
  },
  {
    primaryName: 'lightfield',
    variants: ['light-field', 'light field', 'Lightfield', 'Light Field'],
    kind: 'technology',
    description: 'Lightfield display technology',
  },
  {
    primaryName: 'head tracking',
    variants: [
      'head-tracking',
      'headtracking',
      'Head tracking',
      'Head Tracking',
    ],
    kind: 'technology',
    description: 'Head position tracking technology',
  },
  {
    primaryName: 'view synthesis',
    variants: [
      'view-synthesis',
      'viewsynthesis',
      'View synthesis',
      'View Synthesis',
    ],
    kind: 'technology',
    description: '3D view synthesis technology',
  },
  {
    primaryName: '3D reconstruction',
    variants: [
      '3d reconstruction',
      '3D Reconstruction',
      'three-dimensional reconstruction',
    ],
    kind: 'technology',
    description: '3D scene reconstruction technology',
  },
  {
    primaryName: 'refractive index',
    variants: ['refractive-index', 'Refractive Index', 'refractive_index'],
    kind: 'technology',
    description: 'Optical refractive index property',
  },

  // Leia-specific technologies from press articles
  {
    primaryName: 'Leia 3D Technology',
    variants: ['Leia 3D', 'Leia technology', 'Leia display', 'Leia screen'],
    kind: 'technology',
    description: "Leia's proprietary 3D display technology",
  },
  {
    primaryName: 'Glasses-Free 3D',
    variants: [
      'glasses-free 3d',
      'glasses free 3d',
      'Glasses-Free 3D',
      'glassless 3d',
    ],
    kind: 'technology',
    description: "3D display technology that doesn't require special glasses",
  },
  {
    primaryName: 'Lightfield Display',
    variants: [
      'lightfield display',
      'light-field display',
      'light field display',
      'Lightfield Display',
    ],
    kind: 'technology',
    description: 'Advanced 3D display technology using lightfield principles',
  },
  {
    primaryName: 'Holographic Display',
    variants: [
      'holographic display',
      'hologram display',
      'Holographic Display',
      'holographic screen',
    ],
    kind: 'technology',
    description: 'Display technology creating holographic images',
  },
  {
    primaryName: 'Immersive Gaming',
    variants: [
      'immersive gaming',
      'Immersive Gaming',
      '3d gaming',
      '3D Gaming',
    ],
    kind: 'technology',
    description: 'Enhanced gaming experience with immersive 3D visuals',
  },
  {
    primaryName: 'Eye Tracking',
    variants: ['eye tracking', 'Eye Tracking', 'eye-tracking', 'gaze tracking'],
    kind: 'technology',
    description: "Technology that tracks user's eye movements",
  },
  {
    primaryName: 'Depth Sensing',
    variants: [
      'depth sensing',
      'Depth Sensing',
      'depth detection',
      '3D sensing',
    ],
    kind: 'technology',
    description: 'Technology for detecting spatial depth and distance',
  },
];

export class EntityConsolidator {
  /**
   * Resolve entity kind name to entity_kind_id
   */
  private async getEntityKindId(
    kindName: string,
    personaId: string
  ): Promise<number> {
    const { data: entityKind, error } = await supabaseAdmin
      .from('entity_kinds')
      .select('id')
      .eq('name', kindName)
      .eq('persona_id', personaId)
      .single();

    if (error || !entityKind) {
      throw new Error(`Entity kind '${kindName}' not found`);
    }

    return entityKind.id;
  }

  /**
   * Consolidate a single entity during ingestion (continuous consolidation)
   * Uses UPSERT with ON CONFLICT to prevent race conditions during concurrent processing
   */
  async consolidateEntityOnIngestion(
    name: string,
    kind: EntityKind,
    personaId: string,
    description?: string
  ): Promise<{
    entityId: string;
    wasReused: boolean;
    matchedName?: string;
  }> {
    // Check aliases first (these won't have race conditions since they reference existing entities)
    const { data: aliasMatch } = await supabaseAdmin
      .from('aliases')
      .select('entity_id, entities!inner(name, entity_kinds!inner(name))')
      .eq('alias', name)
      .eq('entities.entity_kinds.name', kind)
      .single();

    if (aliasMatch) {
      // Update mention count using RPC call
      await supabaseAdmin
        .rpc('increment_mention_count', { entity_id: aliasMatch.entity_id })
        .single();

      return {
        entityId: aliasMatch.entity_id,
        wasReused: true,
        matchedName: (aliasMatch.entities as any).name,
      };
    }

    // Check consolidation rules
    const rule = CONSOLIDATION_RULES.find(
      r => r.kind === kind && r.variants.includes(name)
    );

    if (rule) {
      // Get entity_kind_id for the kind
      const entityKindId = await this.getEntityKindId(rule.kind, personaId);

      // Use UPSERT for primary entity to handle race conditions
      const { data: primaryEntity } = await supabaseAdmin
        .from('entities')
        .upsert(
          {
            name: rule.primaryName,
            entity_kind_id: entityKindId,
            description: rule.description || description,
            mention_count: 1,
            authority_score: 0.8,
          },
          {
            onConflict: 'name,entity_kind_id',
            ignoreDuplicates: false,
          }
        )
        .select('id, name, mention_count')
        .single();

      if (!primaryEntity) {
        throw new Error(`Failed to upsert primary entity: ${rule.primaryName}`);
      }

      // If mention_count > 1, this entity already existed, so we reused it
      const wasReused = primaryEntity.mention_count > 1;

      // Increment mention count if we're reusing existing entity
      if (wasReused) {
        await supabaseAdmin
          .rpc('increment_mention_count', { entity_id: primaryEntity.id })
          .single();
      }

      // Create alias if name is different from primary (use upsert to avoid duplicates)
      if (name !== rule.primaryName) {
        await supabaseAdmin.from('aliases').upsert(
          {
            entity_id: primaryEntity.id,
            alias: name,
            is_primary: false,
            confidence: 0.95,
          },
          {
            onConflict: 'entity_id,alias',
            ignoreDuplicates: true,
          }
        );
      }

      return {
        entityId: primaryEntity.id,
        wasReused: true,
        matchedName: primaryEntity.name,
      };
    }

    // Check fuzzy match for similar entities (but only against established entities)
    const fuzzyMatch = await this.findSimilarEntityForIngestion(name, kind);
    if (fuzzyMatch) {
      // Create alias and reuse existing entity (use upsert to avoid duplicate aliases)
      await supabaseAdmin.from('aliases').upsert(
        {
          entity_id: fuzzyMatch.id,
          alias: name,
          is_primary: false,
          confidence: 0.8,
        },
        {
          onConflict: 'entity_id,alias',
          ignoreDuplicates: true,
        }
      );

      // Update mention count using RPC call
      await supabaseAdmin
        .rpc('increment_mention_count', { entity_id: fuzzyMatch.id })
        .single();

      return {
        entityId: fuzzyMatch.id,
        wasReused: true,
        matchedName: fuzzyMatch.name,
      };
    }

    // Get entity_kind_id for the kind
    const entityKindId = await this.getEntityKindId(kind, personaId);

    // Use UPSERT to create new entity, handling race conditions atomically
    const { data: newEntity, error } = await supabaseAdmin
      .from('entities')
      .upsert(
        {
          name,
          entity_kind_id: entityKindId,
          description: description || `${kind} entity`,
          mention_count: 1,
          authority_score: 0.3,
        },
        {
          onConflict: 'name,entity_kind_id',
          ignoreDuplicates: false,
        }
      )
      .select('id, mention_count')
      .single();

    if (error) {
      throw new Error(
        `Failed to upsert entity: ${name} (${kind}) - ${error.message}`
      );
    }

    if (!newEntity) {
      throw new Error(`Failed to upsert entity: ${name} (${kind})`);
    }

    // If mention_count > 1, this entity already existed (created by concurrent process)
    const wasReused = newEntity.mention_count > 1;

    // Increment mention count if we're reusing existing entity
    if (wasReused) {
      await supabaseAdmin
        .rpc('increment_mention_count', { entity_id: newEntity.id })
        .single();
    }

    return {
      entityId: newEntity.id,
      wasReused,
      matchedName: wasReused ? name : undefined,
    };
  }

  /**
   * Find similar entity for ingestion (fuzzy matching)
   */
  private async findSimilarEntityForIngestion(
    name: string,
    kind: EntityKind
  ): Promise<{
    id: string;
    name: string;
  } | null> {
    // Get entities of the same kind for fuzzy matching
    // Removed mention_count filter to allow matching newly created entities
    const { data: entities } = await supabaseAdmin
      .from('entities')
      .select('id, name, mention_count')
      .eq('kind', kind)
      .order('mention_count', { ascending: false })
      .limit(100); // Increased limit since we're checking all entities

    if (!entities || entities.length === 0) return null;

    // Find similar entity, prioritizing entities with higher mention counts
    for (const entity of entities) {
      if (this.areSimilar(name, entity.name, kind)) {
        return {
          id: entity.id,
          name: entity.name,
        };
      }
    }

    return null;
  }

  /**
   * Consolidate all entities in the database
   */
  async consolidateEntities(): Promise<{
    merged: number;
    aliasesCreated: number;
    duplicatesRemoved: number;
  }> {
    console.log('🔄 Starting entity consolidation...');

    let merged = 0;
    let aliasesCreated = 0;
    let duplicatesRemoved = 0;

    // Apply predefined consolidation rules
    for (const rule of CONSOLIDATION_RULES) {
      const result = await this.applyConsolidationRule(rule);
      merged += result.merged;
      aliasesCreated += result.aliasesCreated;
      duplicatesRemoved += result.duplicatesRemoved;
    }

    // Apply fuzzy matching for remaining duplicates
    const fuzzyResult = await this.fuzzyConsolidateRemaining();
    merged += fuzzyResult.merged;
    aliasesCreated += fuzzyResult.aliasesCreated;
    duplicatesRemoved += fuzzyResult.duplicatesRemoved;

    console.log(`✅ Entity consolidation complete:`);
    console.log(`  📝 ${merged} entity groups merged`);
    console.log(`  🔗 ${aliasesCreated} aliases created`);
    console.log(`  🗑️ ${duplicatesRemoved} duplicates removed`);

    return { merged, aliasesCreated, duplicatesRemoved };
  }

  /**
   * Apply a specific consolidation rule
   */
  private async applyConsolidationRule(rule: ConsolidationRule): Promise<{
    merged: number;
    aliasesCreated: number;
    duplicatesRemoved: number;
  }> {
    console.log(`🔍 Applying rule for "${rule.primaryName}"...`);

    // Find all entities matching the variants
    const { data: entities, error } = await supabaseAdmin
      .from('entities')
      .select('*, entity_kinds!inner(name)')
      .eq('entity_kinds.name', rule.kind)
      .in('name', rule.variants);

    if (error || !entities || entities.length <= 1) {
      return { merged: 0, aliasesCreated: 0, duplicatesRemoved: 0 };
    }

    console.log(`  📊 Found ${entities.length} matching entities`);

    // Find or create the primary entity
    let primaryEntity = entities.find(e => e.name === rule.primaryName);

    if (!primaryEntity) {
      // Create primary entity with combined stats
      const combinedMentions = entities.reduce(
        (sum, e) => sum + (e.mention_count || 0),
        0
      );
      const maxAuthority = Math.max(
        ...entities.map(e => e.authority_score || 0)
      );

      // Get entity_kind_id for the kind
      const entityKindId = await this.getEntityKindId(rule.kind);

      const { data: created, error: createError } = await supabaseAdmin
        .from('entities')
        .insert({
          name: rule.primaryName,
          entity_kind_id: entityKindId,
          description: rule.description || `${rule.kind} entity`,
          mention_count: combinedMentions,
          authority_score: Math.min(maxAuthority + 0.1, 0.95), // Boost primary
        })
        .select()
        .single();

      if (createError || !created) {
        console.error(`  ❌ Failed to create primary entity:`, createError);
        return { merged: 0, aliasesCreated: 0, duplicatesRemoved: 0 };
      }

      primaryEntity = created;
      console.log(`  ✅ Created primary entity: ${rule.primaryName}`);
    }

    // Create aliases for all variants (except primary)
    let aliasesCreated = 0;
    let duplicatesRemoved = 0;

    for (const entity of entities) {
      if (entity.name === rule.primaryName) continue;

      // Create alias
      const { error: aliasError } = await supabaseAdmin.from('aliases').insert({
        entity_id: primaryEntity.id,
        alias: entity.name,
        is_primary: false,
        confidence: 0.95,
      });

      if (!aliasError) {
        aliasesCreated++;
        console.log(
          `    🔗 Created alias: ${entity.name} → ${rule.primaryName}`
        );
      }

      // Remove duplicate entity
      const { error: deleteError } = await supabaseAdmin
        .from('entities')
        .delete()
        .eq('id', entity.id);

      if (!deleteError) {
        duplicatesRemoved++;
        console.log(`    🗑️ Removed duplicate: ${entity.name}`);
      }
    }

    // Update primary entity with combined mention count
    if (duplicatesRemoved > 0) {
      const totalMentions = entities.reduce(
        (sum, e) => sum + (e.mention_count || 0),
        0
      );
      await supabaseAdmin
        .from('entities')
        .update({
          mention_count: totalMentions,
          authority_score: Math.min(
            (primaryEntity.authority_score || 0) + duplicatesRemoved * 0.05,
            0.95
          ),
        })
        .eq('id', primaryEntity.id);
    }

    return {
      merged: duplicatesRemoved > 0 ? 1 : 0,
      aliasesCreated,
      duplicatesRemoved,
    };
  }

  /**
   * Fuzzy consolidation for remaining similar entities
   */
  private async fuzzyConsolidateRemaining(): Promise<{
    merged: number;
    aliasesCreated: number;
    duplicatesRemoved: number;
  }> {
    console.log('🔍 Applying fuzzy matching for remaining duplicates...');

    // Get all remaining entities grouped by kind
    const { data: entities, error } = await supabaseAdmin
      .from('entities')
      .select('*')
      .order('kind', { ascending: true })
      .order('mention_count', { ascending: false });

    if (error || !entities) {
      return { merged: 0, aliasesCreated: 0, duplicatesRemoved: 0 };
    }

    let merged = 0;
    let aliasesCreated = 0;
    let duplicatesRemoved = 0;

    // Group by kind and process
    const entityGroups = new Map<EntityKind, typeof entities>();
    entities.forEach(entity => {
      if (!entityGroups.has(entity.kind)) {
        entityGroups.set(entity.kind, []);
      }
      entityGroups.get(entity.kind)!.push(entity);
    });

    for (const [kind, kindEntities] of entityGroups) {
      const result = await this.fuzzyConsolidateGroup(kindEntities, kind);
      merged += result.merged;
      aliasesCreated += result.aliasesCreated;
      duplicatesRemoved += result.duplicatesRemoved;
    }

    return { merged, aliasesCreated, duplicatesRemoved };
  }

  /**
   * Fuzzy consolidate entities within a single kind group
   */
  private async fuzzyConsolidateGroup(
    entities: any[],
    kind: EntityKind
  ): Promise<{
    merged: number;
    aliasesCreated: number;
    duplicatesRemoved: number;
  }> {
    if (entities.length <= 1)
      return { merged: 0, aliasesCreated: 0, duplicatesRemoved: 0 };

    let merged = 0;
    let aliasesCreated = 0;
    let duplicatesRemoved = 0;

    // Find similar entities using fuzzy matching
    const processed = new Set<string>();

    for (let i = 0; i < entities.length; i++) {
      const primary = entities[i];
      if (processed.has(primary.id)) continue;

      const similar: any[] = [primary];
      processed.add(primary.id);

      // Find similar entities
      for (let j = i + 1; j < entities.length; j++) {
        const candidate = entities[j];
        if (processed.has(candidate.id)) continue;

        if (this.areSimilar(primary.name, candidate.name, kind)) {
          similar.push(candidate);
          processed.add(candidate.id);
        }
      }

      // If we found similar entities, consolidate them
      if (similar.length > 1) {
        console.log(
          `  🔗 Found ${similar.length} similar ${kind} entities:`,
          similar.map(e => e.name)
        );

        const result = await this.consolidateSimilarEntities(similar, kind);
        merged += result.merged;
        aliasesCreated += result.aliasesCreated;
        duplicatesRemoved += result.duplicatesRemoved;
      }
    }

    return { merged, aliasesCreated, duplicatesRemoved };
  }

  /**
   * Check if two entity names are similar enough to consolidate
   */
  private areSimilar(name1: string, name2: string, kind: EntityKind): boolean {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();

    // Exact match after normalization
    if (n1 === n2) return true;

    // One is substring of another (with reasonable length)
    if (Math.abs(n1.length - n2.length) <= 2) {
      if (n1.includes(n2) || n2.includes(n1)) return true;
    }

    // Similar with minor differences (for technology terms)
    if (kind === 'technology') {
      // Remove common suffixes/prefixes and compare
      const clean1 = n1.replace(/[-_\s]/g, '').toLowerCase();
      const clean2 = n2.replace(/[-_\s]/g, '').toLowerCase();
      if (clean1 === clean2) return true;

      // Check Levenshtein distance for very similar names
      if (Math.max(n1.length, n2.length) >= 8) {
        const distance = this.levenshteinDistance(n1, n2);
        const maxLength = Math.max(n1.length, n2.length);
        const similarity = 1 - distance / maxLength;
        return similarity >= 0.85;
      }
    }

    return false;
  }

  /**
   * Consolidate a group of similar entities
   */
  private async consolidateSimilarEntities(
    entities: any[],
    kind: EntityKind
  ): Promise<{
    merged: number;
    aliasesCreated: number;
    duplicatesRemoved: number;
  }> {
    // Choose primary entity (highest mention count, then shortest name)
    const primary = entities.reduce((best, current) => {
      if (current.mention_count > best.mention_count) return current;
      if (
        current.mention_count === best.mention_count &&
        current.name.length < best.name.length
      )
        return current;
      return best;
    });

    console.log(`    🎯 Primary entity: ${primary.name}`);

    let aliasesCreated = 0;
    let duplicatesRemoved = 0;

    // Create aliases and remove duplicates
    for (const entity of entities) {
      if (entity.id === primary.id) continue;

      // Create alias
      const { error: aliasError } = await supabaseAdmin.from('aliases').insert({
        entity_id: primary.id,
        alias: entity.name,
        is_primary: false,
        confidence: 0.85,
      });

      if (!aliasError) {
        aliasesCreated++;
        console.log(`      🔗 Created alias: ${entity.name} → ${primary.name}`);
      }

      // Remove duplicate
      const { error: deleteError } = await supabaseAdmin
        .from('entities')
        .delete()
        .eq('id', entity.id);

      if (!deleteError) {
        duplicatesRemoved++;
      }
    }

    // Update primary with combined stats
    if (duplicatesRemoved > 0) {
      const totalMentions = entities.reduce(
        (sum, e) => sum + (e.mention_count || 0),
        0
      );
      const maxAuthority = Math.max(
        ...entities.map(e => e.authority_score || 0)
      );

      await supabaseAdmin
        .from('entities')
        .update({
          mention_count: totalMentions,
          authority_score: Math.min(
            maxAuthority + duplicatesRemoved * 0.02,
            0.95
          ),
        })
        .eq('id', primary.id);
    }

    return {
      merged: duplicatesRemoved > 0 ? 1 : 0,
      aliasesCreated,
      duplicatesRemoved,
    };
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Export singleton
export const entityConsolidator = new EntityConsolidator();

/**
 * Run entity consolidation process
 */
export async function consolidateKnowledgeGraphEntities(): Promise<void> {
  console.log('🚀 Starting Knowledge Graph entity consolidation...');

  try {
    const results = await entityConsolidator.consolidateEntities();
    console.log('✅ Entity consolidation completed successfully!');
    return results;
  } catch (error) {
    console.error('❌ Entity consolidation failed:', error);
    throw error;
  }
}
