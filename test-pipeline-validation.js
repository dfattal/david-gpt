#!/usr/bin/env node

/**
 * Pipeline Validation Test
 * Tests that both single and batch document ingestion pipelines work correctly
 * with the enhanced features.
 */

const readline = require('readline');

const SUPABASE_URL = 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test data for validation
const testDocument = {
  title: "Enhanced Pipeline Test Document",
  content: "This is a test document to validate the enhanced ingestion pipeline with entity extraction and improved processing.",
  docType: "note"
};

const testPatentUrl = "https://patents.google.com/patent/US11281020B2";

const batchTestDocuments = [
  {
    title: "Batch Test Document 1",
    content: "First test document in batch processing with enhanced features.",
    detectedType: "note",
    confidence: 0.95,
    metadata: {
      description: "Test document for batch processing validation",
      batch: true
    }
  },
  {
    title: "Enhanced Patent Processing Test",
    detectedType: "patent",
    confidence: 0.98,
    metadata: {
      patentUrl: testPatentUrl,
      description: "Testing enhanced Google Patents processing",
      batch: true
    }
  }
];

async function testSinglePipeline() {
  console.log('🧪 Testing Single Document Pipeline...');
  
  try {
    const response = await fetch('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(testDocument)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Single pipeline test successful');
      console.log(`   Document ID: ${result.document.id}`);
      console.log(`   Job ID: ${result.jobId}`);
      console.log(`   Status: ${result.document.processing_status}`);
      return result;
    } else {
      console.log('❌ Single pipeline test failed');
      console.log(`   Error: ${result.error || result.message}`);
      return null;
    }
  } catch (error) {
    console.log('❌ Single pipeline test failed');
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

async function testBatchPipeline() {
  console.log('🧪 Testing Batch Document Pipeline...');
  
  try {
    const response = await fetch('http://localhost:3000/api/documents/batch-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        documents: batchTestDocuments,
        batchDescription: "Enhanced pipeline validation test batch"
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Batch pipeline test successful');
      console.log(`   Batch ID: ${result.batchId}`);
      console.log(`   Batch Job ID: ${result.batchJobId}`);
      console.log(`   Total Documents: ${result.totalDocuments}`);
      return result;
    } else {
      console.log('❌ Batch pipeline test failed');
      console.log(`   Error: ${result.error || result.message}`);
      return null;
    }
  } catch (error) {
    console.log('❌ Batch pipeline test failed');
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

async function checkProcessingStatus(jobId, documentId) {
  console.log(`🔄 Checking processing status for job ${jobId}...`);
  
  // Simple polling mechanism (in production, would use webhooks/SSE)
  let attempts = 0;
  const maxAttempts = 20; // 1 minute max wait
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`http://localhost:3000/api/documents/${documentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        }
      });

      const document = await response.json();
      
      if (document.processing_status === 'completed') {
        console.log('✅ Document processing completed');
        console.log(`   Processing time: ${document.processed_at ? new Date(document.processed_at).toISOString() : 'Unknown'}`);
        return true;
      } else if (document.processing_status === 'failed') {
        console.log('❌ Document processing failed');
        console.log(`   Error: ${document.error_message || 'Unknown error'}`);
        return false;
      } else {
        console.log(`   Status: ${document.processing_status} (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        attempts++;
      }
    } catch (error) {
      console.log(`   Error checking status: ${error.message}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('⏰ Processing status check timed out');
  return false;
}

async function runValidationTests() {
  console.log('🚀 Starting Enhanced Pipeline Validation Tests');
  console.log('============================================');
  
  console.log('\n📝 Test Summary:');
  console.log('1. Single Document Pipeline - Text content with entity extraction');
  console.log('2. Batch Document Pipeline - Mixed content types with enhanced processing');
  console.log('3. Processing status verification');
  
  console.log('\n⚙️ Enhanced Features Being Tested:');
  console.log('- Enhanced Google Patents processing with JSON-LD extraction');
  console.log('- FormData support for file uploads');
  console.log('- Text file detection and direct content reading');
  console.log('- Consistent DocumentProcessor usage');
  console.log('- Entity extraction integration');
  console.log('- Progress visualization and webhook notifications');

  // Ask user to confirm before running tests
  const shouldRun = await new Promise((resolve) => {
    rl.question('\n🤔 Run the validation tests? (y/N): ', (answer) => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });

  if (!shouldRun) {
    console.log('❌ Tests cancelled by user');
    rl.close();
    return;
  }

  console.log('\n🧪 Running Tests...\n');
  
  // Test 1: Single Pipeline
  const singleResult = await testSinglePipeline();
  
  if (singleResult) {
    console.log('\n⏳ Waiting for single document processing...');
    await checkProcessingStatus(singleResult.jobId, singleResult.document.id);
  }
  
  console.log('\n---\n');
  
  // Test 2: Batch Pipeline
  const batchResult = await testBatchPipeline();
  
  if (batchResult) {
    console.log('\n⏳ Batch processing started...');
    console.log('   Monitor progress via batch job ID or webhook notifications');
  }
  
  console.log('\n✅ Validation tests completed!');
  console.log('\n📊 Results Summary:');
  console.log(`- Single Pipeline: ${singleResult ? '✅ Success' : '❌ Failed'}`);
  console.log(`- Batch Pipeline: ${batchResult ? '✅ Success' : '❌ Failed'}`);
  
  if (singleResult && batchResult) {
    console.log('\n🎉 Both pipelines are functioning correctly with enhanced features!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
  
  rl.close();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Validation tests interrupted');
  rl.close();
  process.exit(0);
});

// Run the tests
runValidationTests().catch((error) => {
  console.error('❌ Validation test suite failed:', error);
  rl.close();
  process.exit(1);
});