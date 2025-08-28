#!/usr/bin/env node
// Debug script to check knowledge graph data directly in database

const { createClient } = require('@supabase/supabase-js');

// Load environment variables directly
const supabaseUrl = 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjYxNDQsImV4cCI6MjA3MTQwMjE0NH0.FFDVr-eUHKpys-2FhOJfR0V4nofydgtK0D96tNUQTGA';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugKGData() {
  console.log('🔍 Debugging Knowledge Graph Data...\n');
  
  try {
    // Check entities table
    console.log('📊 Checking rag_entities table...');
    const { data: entities, error: entitiesError, count: entitiesCount } = await supabase
      .from('rag_entities')
      .select('*', { count: 'exact' })
      .limit(5);
      
    if (entitiesError) {
      console.log('❌ Entities error:', entitiesError.message);
    } else {
      console.log(`✅ Found ${entitiesCount || entities?.length || 0} entities total`);
      if (entities && entities.length > 0) {
        console.log('   Sample entities:');
        entities.forEach(e => {
          console.log(`     - ${e.canonical_name} (${e.type}) - Doc: ${e.document_id}`);
        });
      }
    }
    
    // Check relations table  
    console.log('\n🔗 Checking rag_relations table...');
    const { data: relations, error: relationsError, count: relationsCount } = await supabase
      .from('rag_relations')
      .select('*', { count: 'exact' })
      .limit(5);
      
    if (relationsError) {
      console.log('❌ Relations error:', relationsError.message);
    } else {
      console.log(`✅ Found ${relationsCount || relations?.length || 0} relations total`);
      if (relations && relations.length > 0) {
        console.log('   Sample relations:');
        relations.forEach(r => {
          console.log(`     - ${r.relation} (confidence: ${r.confidence}) - Doc: ${r.document_id}`);
        });
      }
    }
    
    // Check chunk entities mapping
    console.log('\n🧩 Checking rag_chunk_entities table...');
    const { data: chunkEntities, error: chunkEntitiesError, count: chunkEntitiesCount } = await supabase
      .from('rag_chunk_entities')
      .select('*', { count: 'exact' })
      .limit(5);
      
    if (chunkEntitiesError) {
      console.log('❌ Chunk entities error:', chunkEntitiesError.message);
    } else {
      console.log(`✅ Found ${chunkEntitiesCount || chunkEntities?.length || 0} chunk-entity mappings total`);
      if (chunkEntities && chunkEntities.length > 0) {
        console.log('   Sample mappings:');
        chunkEntities.forEach(ce => {
          console.log(`     - Chunk ${ce.chunk_id} -> Entity ${ce.entity_id}`);
        });
      }
    }
    
    // Check our specific document
    console.log('\n📄 Checking our test document...');
    const testDocId = '480bb035-5c9e-4573-91c2-a8228c11ec08';
    
    const { data: docEntities, error: docEntitiesError } = await supabase
      .from('rag_entities')
      .select('*')
      .eq('document_id', testDocId)
      .limit(10);
      
    if (docEntitiesError) {
      console.log('❌ Test doc entities error:', docEntitiesError.message);
    } else {
      console.log(`   Entities for test document: ${docEntities?.length || 0}`);
      if (docEntities && docEntities.length > 0) {
        docEntities.slice(0, 5).forEach(e => {
          console.log(`     - ${e.canonical_name} (${e.type})`);
        });
      }
    }
    
    const { data: docRelations, error: docRelationsError } = await supabase
      .from('rag_relations')
      .select('*')
      .eq('document_id', testDocId)
      .limit(10);
      
    if (docRelationsError) {
      console.log('❌ Test doc relations error:', docRelationsError.message);
    } else {
      console.log(`   Relations for test document: ${docRelations?.length || 0}`);
      if (docRelations && docRelations.length > 0) {
        docRelations.slice(0, 5).forEach(r => {
          console.log(`     - ${r.relation} (confidence: ${r.confidence})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugKGData();