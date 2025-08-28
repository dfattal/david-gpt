#!/usr/bin/env node
// Simple script to trigger knowledge graph extraction
// This calls the existing buildKnowledgeGraphForDocument function

async function triggerKGExtraction() {
  console.log('🧠 Starting Knowledge Graph Extraction...\n');
  
  try {
    // Import the KG extraction function
    const { buildKnowledgeGraphForDocument } = require('./src/lib/rag/knowledge-graph.ts');
    
    // Mock user ID - this should be the actual user ID from the database
    const userId = 'b349bd11-bd69-4582-9713-3ada0ba58fcf'; // From the logs we saw earlier
    
    // Mock document IDs - these would be the actual document IDs
    const documentIds = [
      // We'll need to get these from the database or admin interface
      'doc-id-1',
      'doc-id-2', 
      'doc-id-3'
    ];
    
    console.log('⚠️  This script needs to be updated with actual document IDs');
    console.log('   Check the database or admin interface for document IDs');
    console.log('   Then update the documentIds array in this script');
    
    // For now, just show what would happen
    console.log('\n📋 What this script would do:');
    console.log('1. Extract entities from document chunks');
    console.log('2. Identify relationships between entities');
    console.log('3. Store entities in rag_entities table');
    console.log('4. Store relationships in rag_relations table'); 
    console.log('5. Create chunk-entity associations');
    
    console.log('\n✅ To complete the setup:');
    console.log('1. Get document IDs from: http://localhost:3000/admin/documents');
    console.log('2. Update this script with real document IDs');
    console.log('3. Run the script again');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Alternative approach using API call
    console.log('\n🔄 Alternative: Use the API endpoint');
    console.log('POST http://localhost:3000/api/rag/kg/extract');
    console.log('Body: { "doc_id": "your-document-id" }');
    console.log('(Requires authentication)');
  }
}

triggerKGExtraction();