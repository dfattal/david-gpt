#!/usr/bin/env node
// Test the fixed knowledge graph extraction

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjYxNDQsImV4cCI6MjA3MTQwMjE0NH0.FFDVr-eUHKpys-2FhOJfR0V4nofydgtK0D96tNUQTGA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFixedKG() {
  console.log('🧪 Testing fixed knowledge graph extraction...\n');
  
  try {
    // Get a small chunk to test with
    console.log('📄 Getting a test chunk...');
    const { data: chunks, error: chunksError } = await supabase
      .from('rag_chunks')
      .select('*')
      .eq('doc_id', '480bb035-5c9e-4573-91c2-a8228c11ec08')
      .limit(1);
      
    if (chunksError || !chunks || chunks.length === 0) {
      console.log('❌ No chunks found for test document');
      return;
    }
    
    const chunk = chunks[0];
    console.log(`✅ Found test chunk: ${chunk.content.substring(0, 100)}...`);
    
    // Try to import and test the extraction function directly
    console.log('\n🧠 Testing entity extraction logic...');
    
    // Simulate what the KG extractor would do
    const { buildKnowledgeGraphForDocument } = require('./src/lib/rag/knowledge-graph.ts');
    
    console.log('   Calling buildKnowledgeGraphForDocument...');
    const result = await buildKnowledgeGraphForDocument(
      '480bb035-5c9e-4573-91c2-a8228c11ec08',
      'b349bd11-bd69-4582-9713-3ada0ba58fcf'
    );
    
    console.log('\n📊 Extraction result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Entities extracted: ${result.entitiesExtracted}`);
    console.log(`   Relations extracted: ${result.relationsExtracted}`);
    console.log(`   Chunks processed: ${result.chunksProcessed}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    // Verify data was actually stored
    console.log('\n🔍 Verifying storage...');
    
    const { data: entities, error: entitiesError } = await supabase
      .from('rag_entities')
      .select('*')
      .limit(5);
      
    const { data: relations, error: relationsError } = await supabase
      .from('rag_relations')
      .select('*')
      .limit(5);
      
    console.log(`   Entities in DB: ${entities?.length || 0}`);
    if (entities && entities.length > 0) {
      entities.forEach(e => {
        console.log(`     - ${e.canonical_name} (${e.type})`);
      });
    }
    
    console.log(`   Relations in DB: ${relations?.length || 0}`);
    if (relations && relations.length > 0) {
      relations.forEach(r => {
        console.log(`     - ${r.relation} (confidence: ${r.confidence})`);
      });
    }
    
    if (entitiesError) console.log('   Entities error:', entitiesError.message);
    if (relationsError) console.log('   Relations error:', relationsError.message);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testFixedKG();