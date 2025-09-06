/**
 * Test Entity Consolidation System
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
      process.env[key.trim()] = value.trim().replace(/^[\"']|[\"']$/g, '');
    }
  });
} catch (error) {
  console.warn('Warning: Could not load .env.local file');
}

import { consolidateKnowledgeGraphEntities } from '../src/lib/rag/entity-consolidator';
import { supabaseAdmin } from '../src/lib/supabase';

async function testEntityConsolidation() {
  console.log('🧪 Testing Entity Consolidation System\n');

  // Show entities before consolidation
  console.log('=== Entities Before Consolidation ===');
  await showEntities();

  // Run consolidation
  console.log('\n=== Running Entity Consolidation ===');
  try {
    const results = await consolidateKnowledgeGraphEntities();
    console.log('✅ Entity consolidation completed successfully!');
    console.log(`📊 Results:`, results);
  } catch (error) {
    console.error('❌ Entity consolidation failed:', error);
    return;
  }

  // Show entities after consolidation
  console.log('\n=== Entities After Consolidation ===');
  await showEntities();

  // Show aliases created
  console.log('\n=== Aliases Created ===');
  await showAliases();

  console.log('\n🎉 Entity Consolidation Test Complete!');
}

async function showEntities() {
  try {
    const { data: entities, error } = await supabaseAdmin
      .from('entities')
      .select('name, kind, mention_count, authority_score')
      .order('kind')
      .order('mention_count', { ascending: false });

    if (error || !entities) {
      console.error('❌ Error fetching entities:', error);
      return;
    }

    console.log(`📊 Total entities: ${entities.length}`);
    
    // Group by kind
    const byKind = entities.reduce((acc: Record<string, any[]>, entity) => {
      if (!acc[entity.kind]) acc[entity.kind] = [];
      acc[entity.kind].push(entity);
      return acc;
    }, {});

    Object.entries(byKind).forEach(([kind, kindEntities]) => {
      console.log(`\n  ${kind.toUpperCase()} (${kindEntities.length}):`);
      kindEntities.slice(0, 5).forEach(entity => {
        console.log(`    - ${entity.name} (mentions: ${entity.mention_count}, score: ${entity.authority_score?.toFixed(2) || 'N/A'})`);
      });
      if (kindEntities.length > 5) {
        console.log(`    ... and ${kindEntities.length - 5} more`);
      }
    });

  } catch (error) {
    console.error('❌ Error showing entities:', error);
  }
}

async function showAliases() {
  try {
    const { data: aliases, error } = await supabaseAdmin
      .from('aliases')
      .select(`
        alias, 
        confidence,
        entities!inner(name, kind)
      `)
      .order('confidence', { ascending: false });

    if (error || !aliases) {
      console.error('❌ Error fetching aliases:', error);
      return;
    }

    console.log(`🔗 Total aliases: ${aliases.length}`);
    
    aliases.forEach(alias => {
      console.log(`  - "${alias.alias}" → "${alias.entities.name}" (${alias.entities.kind}, confidence: ${alias.confidence?.toFixed(2) || 'N/A'})`);
    });

  } catch (error) {
    console.error('❌ Error showing aliases:', error);
  }
}

// Run the test
if (require.main === module) {
  testEntityConsolidation()
    .then(() => {
      console.log('\n✅ Entity consolidation test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Entity consolidation test failed:', error);
      process.exit(1);
    });
}

export { testEntityConsolidation };