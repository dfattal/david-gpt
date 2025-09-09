/**
 * Test Patent URL Ingestion
 * Tests various patent URL ingestion scenarios to ensure proper document creation
 */

const fs = require('fs');

async function testPatentURLIngestion() {
  console.log('🧪 Testing Patent URL Ingestion Scenarios\n');
  
  // Read the patent URL list
  const patentListContent = fs.readFileSync('/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES/patent-url-list.md', 'utf8');
  console.log('📄 Patent URL List Content:');
  console.log(patentListContent);
  
  // Extract URLs from the content
  const urlMatches = patentListContent.match(/https:\/\/patents\.google\.com\/patent\/[A-Z0-9]+/g);
  const patentUrls = urlMatches || [];
  
  console.log(`\n🔗 Found ${patentUrls.length} patent URLs:`);
  patentUrls.forEach((url, index) => {
    console.log(`   ${index + 1}. ${url}`);
  });
  
  console.log('\n' + '='.repeat(60));
  
  // Test 1: Single document ingestion with patent URL list content
  console.log('\n📡 Test 1: Single Document Ingestion with Patent URL List');
  const singleDocResult = await testSingleDocumentWithPatentList(patentListContent);
  
  // Test 2: Individual patent URL ingestion (via URL parameter)
  console.log('\n📡 Test 2: Individual Patent URL Ingestion');
  const individualResults = [];
  for (let i = 0; i < patentUrls.length; i++) {
    console.log(`\n   Testing URL ${i + 1}/${patentUrls.length}: ${patentUrls[i]}`);
    const result = await testIndividualPatentURL(patentUrls[i], i + 1);
    individualResults.push(result);
  }
  
  // Test 3: Batch ingestion with patent URLs
  console.log('\n📡 Test 3: Batch Ingestion with Patent URLs');
  const batchResult = await testBatchPatentIngestion(patentUrls);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY RESULTS');
  console.log('='.repeat(60));
  console.log(`Expected patent URLs: ${patentUrls.length}`);
  console.log(`Single doc ingestion: ${singleDocResult.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Individual URL tests: ${individualResults.filter(r => r.success).length}/${individualResults.length} successful`);
  console.log(`Batch ingestion: ${batchResult.success ? 'SUCCESS' : 'FAILED'}`);
  
  // Check server logs after processing
  console.log('\n⏳ Waiting 15 seconds for processing to complete...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  console.log('✅ Check server logs for final document counts and chunk creation results');
}

async function testSingleDocumentWithPatentList(content) {
  try {
    const response = await fetch('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        title: 'Patent URL List Test - Single Document',
        content: content,
        docType: 'note'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ Single document ingestion successful');
      console.log(`   📄 Document ID: ${result.document?.id}`);
      console.log(`   🔄 Job ID: ${result.jobId}`);
      return { success: true, documentId: result.document?.id };
    } else {
      const error = await response.text();
      console.log('   ❌ Single document ingestion failed:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.log('   ❌ Single document ingestion error:', error.message);
    return { success: false, error: error.message };
  }
}

async function testIndividualPatentURL(patentUrl, index) {
  try {
    const response = await fetch('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        title: `Patent URL Test ${index}`,
        url: patentUrl, // Use URL parameter for direct patent processing
        docType: 'patent'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`   ✅ Patent URL ${index} ingestion successful`);
      console.log(`   📄 Document ID: ${result.document?.id}`);
      return { success: true, documentId: result.document?.id, url: patentUrl };
    } else {
      const error = await response.text();
      console.log(`   ❌ Patent URL ${index} ingestion failed:`, error);
      return { success: false, error, url: patentUrl };
    }
  } catch (error) {
    console.log(`   ❌ Patent URL ${index} ingestion error:`, error.message);
    return { success: false, error: error.message, url: patentUrl };
  }
}

async function testBatchPatentIngestion(patentUrls) {
  try {
    // Create documents array for batch ingestion
    const documents = patentUrls.map((url, index) => ({
      title: `Batch Patent Test ${index + 1}`,
      content: '', // Empty content, will use metadata.patentUrl
      detectedType: 'patent',
      confidence: 1.0,
      metadata: {
        patentUrl: url,
        description: 'Batch patent URL ingestion test'
      }
    }));

    const response = await fetch('http://localhost:3000/api/documents/batch-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        documents,
        batchDescription: 'Patent URL batch ingestion test'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ Batch patent ingestion successful');
      console.log(`   📦 Batch ID: ${result.batchId}`);
      console.log(`   📄 Total documents: ${result.totalDocuments}`);
      return { success: true, batchId: result.batchId, totalDocuments: result.totalDocuments };
    } else {
      const error = await response.text();
      console.log('   ❌ Batch patent ingestion failed:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.log('   ❌ Batch patent ingestion error:', error.message);
    return { success: false, error: error.message };
  }
}

testPatentURLIngestion();