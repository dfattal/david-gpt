/**
 * Manual Relationship Creation Script
 * 
 * Creates logical relationships between known entities in our database
 * as a proof-of-concept for the relationship system
 */

// Load environment variables
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const envVars = envFile.split('\n').filter(line => line.includes('='));
  envVars.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (error) {
  console.warn('Warning: Could not load .env.local file');
}

import { supabaseAdmin } from '../src/lib/supabase';

async function createManualRelationships() {
  console.log('🔄 Creating Manual Relationships for Testing\n');

  // Get all current entities
  const { data: entities, error: entitiesError } = await supabaseAdmin
    .from('entities')
    .select('id, name, kind')
    .order('name');

  if (entitiesError || !entities) {
    console.error('❌ Failed to fetch entities:', entitiesError);
    return;
  }

  console.log(`📊 Found ${entities.length} entities to work with`);

  // Helper function to find entity by name
  const findEntity = (name: string) => entities.find(e => e.name === name);

  // Define logical relationships based on our domain knowledge
  const manualRelationships = [
    // Leia organization relationships
    {
      src: 'Leia Inc', srcType: 'entity',
      rel: 'implements',
      dst: 'lightfield', dstType: 'entity',
      weight: 0.9,
      evidence: 'Leia Inc specializes in lightfield display technology'
    },
    {
      src: 'Leia Inc', srcType: 'entity', 
      rel: 'implements',
      dst: 'head tracking', dstType: 'entity',
      weight: 0.8,
      evidence: 'Leia displays use head tracking for 3D experience'
    },
    {
      src: 'lightfield', srcType: 'entity',
      rel: 'used_in',
      dst: 'Android', dstType: 'entity', 
      weight: 0.7,
      evidence: 'Lightfield technology used in Android devices'
    },
    {
      src: 'OLED', srcType: 'entity',
      rel: 'used_in',
      dst: 'Android', dstType: 'entity',
      weight: 0.8,
      evidence: 'OLED displays used in Android devices'
    },
    {
      src: 'head tracking', srcType: 'entity',
      rel: 'used_in', 
      dst: '3D reconstruction', dstType: 'entity',
      weight: 0.7,
      evidence: 'Head tracking enables 3D reconstruction'
    },
    {
      src: 'diffusion', srcType: 'entity',
      rel: 'implements',
      dst: 'view synthesis', dstType: 'entity',
      weight: 0.8,
      evidence: 'Diffusion models implement view synthesis'
    },
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const rel of manualRelationships) {
    try {
      // Find source and destination entities
      const srcEntity = findEntity(rel.src);
      const dstEntity = findEntity(rel.dst);

      if (!srcEntity) {
        console.warn(`⚠️  Source entity not found: ${rel.src}`);
        continue;
      }

      if (!dstEntity) {
        console.warn(`⚠️  Destination entity not found: ${rel.dst}`);
        continue;
      }

      // Check if relationship already exists
      const { data: existing } = await supabaseAdmin
        .from('edges')
        .select('id')
        .eq('src_id', srcEntity.id)
        .eq('rel', rel.rel)
        .eq('dst_id', dstEntity.id)
        .single();

      if (existing) {
        console.log(`✅ Relationship already exists: ${rel.src} --[${rel.rel}]--> ${rel.dst}`);
        continue;
      }

      // Create the relationship
      const { error: insertError } = await supabaseAdmin
        .from('edges')
        .insert({
          src_id: srcEntity.id,
          src_type: rel.srcType,
          rel: rel.rel,
          dst_id: dstEntity.id,
          dst_type: rel.dstType,
          weight: rel.weight,
          evidence_text: rel.evidence,
        });

      if (insertError) {
        console.error(`❌ Failed to create: ${rel.src} --[${rel.rel}]--> ${rel.dst}:`, insertError);
        failureCount++;
      } else {
        console.log(`✅ Created: ${rel.src} --[${rel.rel}]--> ${rel.dst}`);
        successCount++;
      }

    } catch (error) {
      console.error(`💥 Error processing relationship:`, error);
      failureCount++;
    }
  }

  // Show final results
  console.log('\n📊 Manual Relationship Creation Results:');
  console.log(`✅ Successfully created: ${successCount} relationships`);
  console.log(`❌ Failed to create: ${failureCount} relationships`);

  // Verify relationships in database
  const { count: totalRelationships } = await supabaseAdmin
    .from('edges')
    .select('*', { count: 'exact', head: true });

  console.log(`🔗 Total relationships in database: ${totalRelationships}`);

  if (totalRelationships && totalRelationships > 0) {
    // Show sample relationships
    const { data: sampleRels } = await supabaseAdmin
      .from('edges')
      .select(`
        rel,
        weight,
        evidence_text,
        src:entities!src_id(name),
        dst:entities!dst_id(name)
      `)
      .limit(5);

    console.log('\n🎯 Sample Relationships:');
    sampleRels?.forEach((rel: any, i) => {
      console.log(`  ${i+1}. ${rel.src?.name} --[${rel.rel}]--> ${rel.dst?.name} (weight: ${rel.weight})`);
      if (rel.evidence_text) {
        console.log(`     Evidence: "${rel.evidence_text}"`);
      }
    });
  }

  console.log('\n🎉 Manual relationship creation complete!');
}

// Run the script
if (require.main === module) {
  createManualRelationships()
    .then(() => {
      console.log('\n✅ Manual relationship creation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Manual relationship creation failed:', error);
      process.exit(1);
    });
}

export { createManualRelationships };