/**
 * Test script for relationship-aware search system
 * 
 * Demonstrates end-to-end functionality of relationship traversal in search
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

import { testRelationshipSearch } from '../src/lib/rag/relationship-search';
import { supabaseAdmin } from '../src/lib/supabase';

async function runRelationshipSearchTests() {
  console.log('🧪 Testing Relationship-Aware Search System\n');
  
  // Show current relationship state
  console.log('=== Current Database State ===');
  
  const { count: entityCount } = await supabaseAdmin
    .from('entities')
    .select('*', { count: 'exact', head: true });
    
  const { count: relationshipCount } = await supabaseAdmin
    .from('edges')
    .select('*', { count: 'exact', head: true });
    
  console.log(`📊 Entities in database: ${entityCount}`);
  console.log(`🔗 Relationships in database: ${relationshipCount}`);
  
  if (relationshipCount && relationshipCount > 0) {
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

    console.log('\n🔗 Sample Relationships:');
    sampleRels?.forEach((rel: any, i) => {
      console.log(`  ${i+1}. ${rel.src?.name} --[${rel.rel}]--> ${rel.dst?.name} (weight: ${rel.weight})`);
      if (rel.evidence_text) {
        console.log(`     Evidence: "${rel.evidence_text}"`);
      }
    });
  }
  
  console.log('\n=== Test Cases ===\n');
  
  // Test cases to demonstrate relationship-aware search
  const testQueries = [
    'Leia technology',
    'lightfield displays', 
    'OLED screens',
    'head tracking systems',
    'Android devices',
    '3D reconstruction'
  ];
  
  for (const query of testQueries) {
    console.log(`\n${'='.repeat(60)}`);
    await testRelationshipSearch(query);
    console.log(`${'='.repeat(60)}`);
    
    // Add a small delay between tests for readability
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎉 Relationship-aware search testing complete!');
}

// Run the tests
if (require.main === module) {
  runRelationshipSearchTests()
    .then(() => {
      console.log('\n✅ Relationship search testing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Relationship search testing failed:', error);
      process.exit(1);
    });
}

export { runRelationshipSearchTests };