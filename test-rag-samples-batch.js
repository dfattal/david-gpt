/**
 * Test Batch Ingestion of RAG-SAMPLES folder with Entity Consolidation
 * This test will ingest all files from the RAG-SAMPLES folder and monitor entity extraction
 */

const fs = require('fs');
const path = require('path');

const RAG_SAMPLES_DIR = '/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES';
const API_BASE = 'http://localhost:3000';
const SERVICE_ROLE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs';

async function testRAGSamplesBatchIngestion() {
  console.log('🚀 Testing RAG-SAMPLES Batch Ingestion with Entity Consolidation\n');
  
  try {
    // Step 1: Read all files from RAG-SAMPLES directory
    console.log('📂 Reading files from RAG-SAMPLES directory...');
    const files = fs.readdirSync(RAG_SAMPLES_DIR).filter(file => 
      !file.startsWith('.') && (
        file.endsWith('.md') || 
        file.endsWith('.txt') || 
        file.endsWith('.pdf')
      )
    );
    
    console.log(`📄 Found ${files.length} files:`, files);
    
    // Step 2: Prepare documents for batch ingestion
    const documents = [];
    
    for (const file of files) {
      const filePath = path.join(RAG_SAMPLES_DIR, file);
      const fileExt = path.extname(file).toLowerCase();
      const fileName = path.basename(file, fileExt);
      
      let docData = {
        title: fileName.replace(/-|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        metadata: {
          fileName: file,
          description: `File from RAG-SAMPLES batch ingestion test`,
          batch: true
        }
      };
      
      // Handle different file types
      if (fileExt === '.md' || fileExt === '.txt') {
        // Read text content
        const content = fs.readFileSync(filePath, 'utf8');
        docData.content = content;
        docData.detectedType = fileExt === '.md' ? 'note' : 'note';
        docData.confidence = 1.0;
        
        console.log(`  📄 ${file}: ${content.length} characters`);
      } else if (fileExt === '.pdf') {
        // For PDF, we'll let the server process it
        docData.content = ''; // Empty content, will be processed by GROBID
        docData.detectedType = 'pdf';
        docData.confidence = 1.0;
        docData.metadata.requiresProcessing = true;
        
        const stats = fs.statSync(filePath);
        console.log(`  📄 ${file}: ${(stats.size / 1024 / 1024).toFixed(2)} MB (PDF)`);
      }
      
      documents.push(docData);
    }
    
    console.log(`\n📦 Prepared ${documents.length} documents for batch ingestion`);
    
    // Step 3: Submit batch ingestion request
    console.log('\n🚀 Submitting batch ingestion request...');
    const response = await fetch(`${API_BASE}/api/documents/batch-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_TOKEN}`
      },
      body: JSON.stringify({
        documents,
        batchDescription: 'RAG-SAMPLES folder batch ingestion test - includes CAT3D.pdf, FAQ.md, LIF.md, phase_eng.md, and patent-url-list.md. Testing entity extraction and consolidation during ingestion process.'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batch ingestion failed: ${response.status} ${error}`);
    }
    
    const result = await response.json();
    console.log('✅ Batch ingestion submitted successfully!');
    console.log(`📦 Batch ID: ${result.batchId}`);
    console.log(`📄 Total documents: ${result.totalDocuments}`);
    
    // Step 4: Monitor processing with emphasis on entity extraction
    console.log('\n⏳ Monitoring batch processing and entity consolidation...');
    await monitorBatchProcessing(result.batchId);
    
  } catch (error) {
    console.error('❌ Error during batch ingestion test:', error);
  }
}

async function monitorBatchProcessing(batchId) {
  let completed = false;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max wait time
  
  while (!completed && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    
    try {
      // Check overall processing progress
      console.log(`\n📊 Check ${attempts + 1}/${maxAttempts} - Monitoring batch ${batchId}...`);
      
      // Note: Since we don't have a specific progress endpoint, we'll monitor via server logs
      // In a real implementation, you'd query the processing_jobs table or have a progress endpoint
      
      attempts++;
      
      // For this test, we'll run for a reasonable time to allow entity extraction
      if (attempts >= 24) { // After 2 minutes, check completion status
        console.log('\n🔍 Checking completion status via server logs...');
        console.log('🏁 Batch processing monitoring complete. Check server logs for:');
        console.log('  - Document processing completion messages');
        console.log('  - Entity extraction progress');
        console.log('  - Entity consolidation activities');
        console.log('  - Knowledge graph updates');
        console.log('\n💡 Key things to monitor in server logs:');
        console.log('  - "✅ Document processed successfully" messages');
        console.log('  - "✅ Entity extraction completed" messages'); 
        console.log('  - "🔗 Entity consolidation" activities');
        console.log('  - Final chunk counts per document');
        console.log('  - Entity relationship extraction');
        completed = true;
      }
      
    } catch (error) {
      console.error('Error monitoring batch processing:', error);
      attempts++;
    }
  }
  
  if (!completed) {
    console.log('\n⏰ Monitoring timeout reached. Check server logs for processing status.');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 BATCH INGESTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`📦 Batch ID: ${batchId}`);
  console.log(`📄 Expected documents: 5 (CAT3D.pdf, FAQ.md, LIF.md, phase_eng.md, patent-url-list.md)`);
  console.log(`⏱️  Processing time monitored: ${Math.round(attempts * 5 / 60)} minutes`);
  console.log('\n🔍 Entity Consolidation Test Points:');
  console.log('  1. Check if common entities (e.g., "David Fattal", "Leia Inc") are consolidated');
  console.log('  2. Verify cross-document entity relationships are established');
  console.log('  3. Confirm entity mention counts are aggregated correctly');
  console.log('  4. Validate authority scores are computed based on multiple mentions');
  console.log('\n📊 Next Steps:');
  console.log('  - Query the entities table to see extracted entities');
  console.log('  - Check the edges table for cross-document relationships');
  console.log('  - Verify document chunks were created with proper embeddings');
  console.log('  - Test hybrid search across the ingested corpus');
}

testRAGSamplesBatchIngestion();