#!/usr/bin/env node
// Script to set up knowledge graph extraction for existing documents

const { createClient } = require('@supabase/supabase-js');
const { buildKnowledgeGraphForDocument } = require('./dist/src/lib/rag/knowledge-graph.js');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupKnowledgeGraph() {
  console.log('🧠 Setting up Knowledge Graph extraction...\n');
  
  try {
    // Get all documents
    console.log('📄 Fetching documents...');
    const { data: documents, error } = await supabase
      .from('rag_documents')
      .select('id, title, owner')
      .eq('status', 'completed');
    
    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    
    if (!documents || documents.length === 0) {
      console.log('⚠️  No completed documents found');
      return;
    }
    
    console.log(`✅ Found ${documents.length} completed documents:`);
    documents.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.title} (ID: ${doc.id})`);
    });
    
    // Process each document for KG extraction
    console.log('\n🔬 Starting knowledge graph extraction...');
    
    for (const doc of documents) {
      console.log(`\n📊 Processing: ${doc.title}`);
      console.log(`   Document ID: ${doc.id}`);
      console.log(`   Owner: ${doc.owner}`);
      
      try {
        // This will call the KG extraction function
        const result = await buildKnowledgeGraphForDocument(doc.id, doc.owner);
        
        if (result.success) {
          console.log(`   ✅ Success!`);
          console.log(`      - Entities extracted: ${result.entitiesExtracted}`);
          console.log(`      - Relations extracted: ${result.relationsExtracted}`); 
          console.log(`      - Chunks processed: ${result.chunksProcessed}`);
        } else {
          console.log(`   ❌ Failed: ${result.error}`);
        }
        
      } catch (docError) {
        console.log(`   ❌ Error processing document: ${docError.message}`);
      }
      
      // Small delay between documents to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Verify results
    console.log('\n🔍 Verifying knowledge graph creation...');
    
    const { data: entities, error: entitiesError } = await supabase
      .from('rag_entities')
      .select('id, canonical_name, type')
      .limit(10);
    
    const { data: relations, error: relationsError } = await supabase
      .from('rag_relations')
      .select('id, relation, confidence')
      .limit(10);
    
    if (!entitiesError && entities) {
      console.log(`✅ Total entities in database: ${entities.length > 0 ? 'Found some' : '0'}`);
      if (entities.length > 0) {
        console.log('   Sample entities:');
        entities.slice(0, 5).forEach(e => {
          console.log(`      - ${e.canonical_name} (${e.type})`);
        });
      }
    }
    
    if (!relationsError && relations) {
      console.log(`✅ Total relations in database: ${relations.length > 0 ? 'Found some' : '0'}`);
      if (relations.length > 0) {
        console.log('   Sample relations:');
        relations.slice(0, 5).forEach(r => {
          console.log(`      - ${r.relation} (confidence: ${r.confidence})`);
        });
      }
    }
    
    console.log('\n🎉 Knowledge graph setup completed!');
    console.log('   Check http://localhost:3000/admin/knowledge-graph to view results');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('   Stack trace:', error.stack);
  }
}

// Run the setup
setupKnowledgeGraph();