#!/usr/bin/env node

/**
 * Simple Patent Batch Test
 * Test just the patent URL expansion with a simple JSON payload
 */

const { default: fetch } = require('node-fetch');

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

async function testPatentBatch() {
  console.log('🧪 Testing Patent URL Batch Processing');
  console.log('====================================');
  
  // Create batch with expanded patent documents
  const batchRequest = {
    documents: [
      {
        title: "Patent US11281020B2",
        detectedType: "patent",
        confidence: 0.95,
        metadata: {
          patentUrl: "https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1",
          patentNumber: "US11281020B2",
          description: "Individual patent document: US11281020B2",
          batch: true
        }
      },
      {
        title: "Patent WO2024145265A1", 
        detectedType: "patent",
        confidence: 0.95,
        metadata: {
          patentUrl: "https://patents.google.com/patent/WO2024145265A1/en?oq=WO2024145265A1",
          patentNumber: "WO2024145265A1",
          description: "Individual patent document: WO2024145265A1",
          batch: true
        }
      },
      {
        title: "Immersity (LeiaSR) FAQ",
        content: "# FAQ\n\nThis is a test content for the FAQ document.",
        detectedType: "note",
        confidence: 0.8,
        metadata: {
          description: "Text document from RAG-SAMPLES",
          batch: true
        }
      }
    ],
    batchDescription: "Test batch with patent URL expansion and text content"
  };

  try {
    console.log(`📦 Submitting batch with ${batchRequest.documents.length} documents...`);
    
    const response = await fetch('http://localhost:3001/api/documents/batch-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(batchRequest)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Batch processing started successfully!');
      console.log(`   📦 Batch ID: ${result.batchId}`);
      console.log(`   🆔 Job ID: ${result.batchJobId}`);
      console.log(`   📊 Total Documents: ${result.totalDocuments}`);
      console.log('\n🎯 Expected Processing:');
      console.log('   🔗 US11281020B2 → JSON-LD extraction + patent content formatting');
      console.log('   🔗 WO2024145265A1 → JSON-LD extraction + patent content formatting');
      console.log('   📝 FAQ document → Direct text content ingestion');
      console.log('   🧠 All documents → Entity extraction for knowledge graph');
      
      // Show progress monitoring info
      console.log('\n📊 Progress Monitoring:');
      console.log('   You can monitor progress in the server logs or admin panel');
      console.log('   Each document will go through: Analysis → Extraction → Chunking → Embedding → Entity Extraction');
      
      return result;
    } else {
      console.log('❌ Batch processing failed');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${result.error || result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
      return null;
    }
  } catch (error) {
    console.log('❌ Request failed');
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

// Run the test
testPatentBatch().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});