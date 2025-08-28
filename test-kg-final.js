#!/usr/bin/env node
// Final test of knowledge graph extraction with all fixes

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjYxNDQsImV4cCI6MjA3MTQwMjE0NH0.FFDVr-eUHKpys-2FhOJfR0V4nofydgtK0D96tNUQTGA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFinalKG() {
  console.log('🧪 Final KG extraction test with all fixes...\n');
  
  try {
    // First get available documents
    console.log('📄 Getting available documents...');
    const { data: documents, error: docsError } = await supabase
      .from('rag_documents')
      .select('id, title, owner');
      
    if (docsError) {
      console.log('❌ Error getting documents:', docsError.message);
      return;
    }
    
    if (!documents || documents.length === 0) {
      console.log('❌ No documents found');
      return;
    }
    
    console.log(`✅ Found ${documents.length} documents:`);
    documents.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.title} (ID: ${doc.id})`);
    });
    
    // Test with the Neural Network document which should be good for entity extraction
    const targetDoc = documents.find(d => d.title.includes('Neural Network')) || documents[0];
    console.log(`\n🎯 Testing with: ${targetDoc.title} (${targetDoc.id})`);
    
    // Build KG using our fixed function
    console.log('\n🧠 Building knowledge graph...');
    const { buildKnowledgeGraphForDocument } = require('./src/lib/rag/knowledge-graph.ts');
    
    const result = await buildKnowledgeGraphForDocument(
      targetDoc.id,
      targetDoc.owner
    );
    
    console.log('\n📊 Extraction results:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Entities extracted: ${result.entitiesExtracted}`);
    console.log(`   Relations extracted: ${result.relationsExtracted}`);
    console.log(`   Chunks processed: ${result.chunksProcessed}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    // Verify data was stored - check raw tables first
    console.log('\n🔍 Verifying data storage...');
    
    // Wait a moment for data to be committed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check entities table
    const { data: entities, error: entitiesError } = await supabase
      .from('rag_entities')
      .select('id, canonical_name, type')
      .limit(10);
      
    console.log(`   Entities in database: ${entities?.length || 0}`);
    if (entitiesError) {
      console.log(`     Error: ${entitiesError.message}`);
    } else if (entities && entities.length > 0) {
      entities.slice(0, 5).forEach(e => {
        console.log(`     - ${e.canonical_name} (${e.type})`);
      });
    }
    
    // Check relations table
    const { data: relations, error: relationsError } = await supabase
      .from('rag_relations')
      .select('id, relation, confidence')
      .limit(10);
      
    console.log(`   Relations in database: ${relations?.length || 0}`);
    if (relationsError) {
      console.log(`     Error: ${relationsError.message}`);
    } else if (relations && relations.length > 0) {
      relations.slice(0, 5).forEach(r => {
        console.log(`     - ${r.relation} (confidence: ${r.confidence})`);
      });
    }
    
    // Check chunk-entity associations
    const { data: chunkEntities, error: chunkEntitiesError } = await supabase
      .from('rag_chunk_entities')
      .select('chunk_id, entity_id')
      .limit(5);
      
    console.log(`   Chunk-entity associations: ${chunkEntities?.length || 0}`);
    if (chunkEntitiesError) {
      console.log(`     Error: ${chunkEntitiesError.message}`);
    }
    
    // Test the stats function
    console.log('\n📈 Testing knowledge graph stats...');
    const { getKnowledgeGraphStats } = require('./src/lib/rag/knowledge-graph.ts');
    
    const stats = await getKnowledgeGraphStats(targetDoc.owner);
    console.log('   Stats:', {
      totalEntities: stats.totalEntities,
      totalRelations: stats.totalRelations,
      entityTypes: stats.entityTypes.length,
      relationTypes: stats.relationTypes.length
    });
    
    if (stats.entityTypes.length > 0) {
      console.log('   Entity types:');
      stats.entityTypes.forEach(et => {
        console.log(`     - ${et.type}: ${et.count}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testFinalKG();