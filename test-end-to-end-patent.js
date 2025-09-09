#!/usr/bin/env node

/**
 * End-to-End Patent Ingestion and Retrieval Test
 * 
 * This test verifies that enhanced patent metadata flows through the entire RAG pipeline:
 * 1. Patent ingestion via document ingestion API
 * 2. Enhanced metadata extraction and storage
 * 3. RAG retrieval including patent metadata
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Configuration
const SUPABASE_URL = 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjYxNDQsImV4cCI6MjA3MTQwMjE0NH0.FFDVr-eUHKpys-2FhOJfR0V4nofydgtK0D96tNUQTGA';
const TEST_PATENT_URL = 'https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1';
const BASE_URL = 'http://localhost:3000';

// Expected patent structure
const EXPECTED_PATENT_DATA = {
  patentNumber: "US11281020B2",
  inventors: ["Fetze Pijlman", "Jan Van Der Horst"],
  assignee: "Leia Inc",
  originalAssignee: "Koninklijke Philips NV",
  filingDate: "2019-10-09",
  grantDate: "2022-03-22",
  priorityDate: "2010-09-22",
  status: "Active",
  expirationDate: "2031-12-31"
};

// Test results tracking
let testResults = {
  ingestion: { passed: false, details: '' },
  metadata: { passed: false, details: '' },
  retrieval: { passed: false, details: '' },
  ragIntegration: { passed: false, details: '' }
};

console.log('🧪 Starting End-to-End Patent RAG Test');
console.log('=====================================');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  try {
    // Step 1: Clean up any existing test data
    await cleanupTestData();
    
    // Step 2: Test patent ingestion
    await testPatentIngestion();
    
    // Step 3: Verify patent metadata storage
    await testPatentMetadataStorage();
    
    // Step 4: Test RAG retrieval with patent metadata
    await testRAGRetrievalWithPatents();
    
    // Step 5: Test chat API integration
    await testChatAPIWithPatents();
    
    // Print final test results
    printTestResults();
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

/**
 * Clean up any existing test data
 */
async function cleanupTestData() {
  console.log('\n🧹 Cleaning up existing test data...');
  
  try {
    // Find and delete existing patent document
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('patent_no', 'US11281020B2')
      .limit(1);
    
    if (existingDocs && existingDocs.length > 0) {
      console.log(`  Found existing document: ${existingDocs[0].id}`);
      
      // Delete chunks first
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', existingDocs[0].id);
      
      // Delete document
      await supabase
        .from('documents')
        .delete()
        .eq('id', existingDocs[0].id);
      
      console.log('  ✅ Cleaned up existing test data');
    } else {
      console.log('  ✅ No existing test data found');
    }
  } catch (error) {
    console.warn('  ⚠️ Cleanup failed (continuing anyway):', error.message);
  }
}

/**
 * Test patent ingestion via API
 */
async function testPatentIngestion() {
  console.log('\n📥 Testing Patent Ingestion...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/documents/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: TEST_PATENT_URL,
        title: 'Test Patent Ingestion - US11281020B2',
        patentUrl: TEST_PATENT_URL
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ingestion failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('  📄 Ingestion response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.documentId) {
      testResults.ingestion.passed = true;
      testResults.ingestion.details = `Document ID: ${result.documentId}`;
      console.log('  ✅ Patent ingestion successful');
      return result.documentId;
    } else {
      throw new Error(`Ingestion failed: ${JSON.stringify(result)}`);
    }
    
  } catch (error) {
    testResults.ingestion.details = error.message;
    console.error('  ❌ Patent ingestion failed:', error.message);
    throw error;
  }
}

/**
 * Test patent metadata storage in database
 */
async function testPatentMetadataStorage() {
  console.log('\n🗄️ Testing Patent Metadata Storage...');
  
  try {
    // Query for the ingested patent document
    const { data: documents, error } = await supabase
      .from('documents')
      .select(`
        id,
        title,
        patent_no,
        inventors,
        assignees,
        original_assignee,
        patent_status,
        filed_date,
        granted_date,
        priority_date,
        expiration_date,
        abstract,
        classification
      `)
      .eq('patent_no', 'US11281020B2')
      .single();
    
    if (error || !documents) {
      throw new Error(`Could not find patent document: ${error?.message || 'Not found'}`);
    }
    
    console.log('  📊 Stored patent metadata:', JSON.stringify(documents, null, 2));
    
    // Verify metadata matches expected structure
    const verificationResults = [];
    
    // Check patent number
    if (documents.patent_no === EXPECTED_PATENT_DATA.patentNumber) {
      verificationResults.push('✅ Patent Number: Correct');
    } else {
      verificationResults.push(`❌ Patent Number: Expected ${EXPECTED_PATENT_DATA.patentNumber}, got ${documents.patent_no}`);
    }
    
    // Check inventors (stored as JSON)
    try {
      const storedInventors = JSON.parse(documents.inventors || '[]');
      if (JSON.stringify(storedInventors.sort()) === JSON.stringify(EXPECTED_PATENT_DATA.inventors.sort())) {
        verificationResults.push('✅ Inventors: Correct');
      } else {
        verificationResults.push(`❌ Inventors: Expected ${JSON.stringify(EXPECTED_PATENT_DATA.inventors)}, got ${JSON.stringify(storedInventors)}`);
      }
    } catch (e) {
      verificationResults.push(`❌ Inventors: Could not parse JSON: ${documents.inventors}`);
    }
    
    // Check original assignee
    if (documents.original_assignee === EXPECTED_PATENT_DATA.originalAssignee) {
      verificationResults.push('✅ Original Assignee: Correct');
    } else {
      verificationResults.push(`❌ Original Assignee: Expected ${EXPECTED_PATENT_DATA.originalAssignee}, got ${documents.original_assignee}`);
    }
    
    // Check filing date
    if (documents.filed_date === EXPECTED_PATENT_DATA.filingDate) {
      verificationResults.push('✅ Filing Date: Correct');
    } else {
      verificationResults.push(`❌ Filing Date: Expected ${EXPECTED_PATENT_DATA.filingDate}, got ${documents.filed_date}`);
    }
    
    // Check grant date
    if (documents.granted_date === EXPECTED_PATENT_DATA.grantDate) {
      verificationResults.push('✅ Grant Date: Correct');
    } else {
      verificationResults.push(`❌ Grant Date: Expected ${EXPECTED_PATENT_DATA.grantDate}, got ${documents.granted_date}`);
    }
    
    // Check status
    if (documents.patent_status === EXPECTED_PATENT_DATA.status) {
      verificationResults.push('✅ Status: Correct');
    } else {
      verificationResults.push(`❌ Status: Expected ${EXPECTED_PATENT_DATA.status}, got ${documents.patent_status}`);
    }
    
    console.log('\n  📋 Verification Results:');
    verificationResults.forEach(result => console.log(`    ${result}`));
    
    const passedCount = verificationResults.filter(r => r.startsWith('✅')).length;
    const totalCount = verificationResults.length;
    
    if (passedCount === totalCount) {
      testResults.metadata.passed = true;
      testResults.metadata.details = `All ${totalCount} metadata fields correct`;
      console.log('  ✅ Patent metadata storage verification passed');
    } else {
      testResults.metadata.details = `${passedCount}/${totalCount} metadata fields correct`;
      console.log(`  ⚠️ Patent metadata partial success: ${passedCount}/${totalCount} fields correct`);
    }
    
  } catch (error) {
    testResults.metadata.details = error.message;
    console.error('  ❌ Patent metadata storage test failed:', error.message);
    throw error;
  }
}

/**
 * Test RAG retrieval including patent metadata
 */
async function testRAGRetrievalWithPatents() {
  console.log('\n🔍 Testing RAG Retrieval with Patent Metadata...');
  
  try {
    // Import hybrid search engine
    const { hybridSearchEngine } = await import('./src/lib/rag/hybrid-search.ts');
    
    // Test search that should return our patent
    const searchQueries = [
      'Philips Leia display patent US11281020B2',
      'autostereoscopic display Fetze Pijlman',
      'Koninklijke Philips NV patent filed 2019'
    ];
    
    let foundPatent = false;
    let searchDetails = [];
    
    for (const query of searchQueries) {
      console.log(`  🔎 Testing query: "${query}"`);
      
      try {
        const searchResult = await hybridSearchEngine.search({
          query: query,
          limit: 10,
          threshold: 0.1 // Lower threshold to ensure we find results
        });
        
        console.log(`    📊 Found ${searchResult.results.length} results`);
        
        // Check if our patent is in the results
        const patentResult = searchResult.results.find(result => 
          result.metadata?.patent_no === 'US11281020B2' || 
          result.content.includes('US11281020B2')
        );
        
        if (patentResult) {
          foundPatent = true;
          console.log('    ✅ Found target patent in search results');
          console.log(`    📄 Patent metadata available:`, {
            patent_no: patentResult.metadata?.patent_no,
            inventors: patentResult.metadata?.inventors,
            original_assignee: patentResult.metadata?.original_assignee,
            patent_status: patentResult.metadata?.patent_status
          });
          searchDetails.push(`Query "${query}": Found patent (score: ${patentResult.score.toFixed(3)})`);
        } else {
          searchDetails.push(`Query "${query}": Patent not found (${searchResult.results.length} results)`);
          console.log('    ⚠️ Target patent not found in search results');
        }
        
      } catch (searchError) {
        searchDetails.push(`Query "${query}": Search failed - ${searchError.message}`);
        console.error(`    ❌ Search failed for query "${query}":`, searchError.message);
      }
      
      // Add delay between searches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (foundPatent) {
      testResults.retrieval.passed = true;
      testResults.retrieval.details = searchDetails.join('; ');
      console.log('  ✅ RAG retrieval with patent metadata successful');
    } else {
      testResults.retrieval.details = 'Patent not found in any search queries: ' + searchDetails.join('; ');
      console.log('  ❌ RAG retrieval test failed - patent not found in search results');
    }
    
  } catch (error) {
    testResults.retrieval.details = error.message;
    console.error('  ❌ RAG retrieval test failed:', error.message);
  }
}

/**
 * Test chat API integration with patent queries
 */
async function testChatAPIWithPatents() {
  console.log('\n💬 Testing Chat API with Patent Queries...');
  
  try {
    const testQuery = "Tell me about the Philips patent US11281020B2 and its inventors";
    
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: testQuery }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Chat API failed: ${response.status} ${response.statusText}`);
    }
    
    // Read the streaming response
    const reader = response.body.getReader();
    let chatResponse = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chatResponse += new TextDecoder().decode(value);
      }
    } finally {
      reader.releaseLock();
    }
    
    console.log('  💬 Chat response preview:', chatResponse.substring(0, 200) + '...');
    
    // Check if response contains patent information
    const containsPatentNumber = chatResponse.includes('US11281020B2');
    const containsInventors = chatResponse.includes('Fetze Pijlman') || chatResponse.includes('Jan Van Der Horst');
    const containsAssignee = chatResponse.includes('Philips') || chatResponse.includes('Leia');
    
    const checks = [];
    if (containsPatentNumber) checks.push('✅ Patent Number');
    else checks.push('❌ Patent Number');
    
    if (containsInventors) checks.push('✅ Inventors');
    else checks.push('❌ Inventors');
    
    if (containsAssignee) checks.push('✅ Assignee Info');
    else checks.push('❌ Assignee Info');
    
    console.log('  🔍 Response content analysis:', checks.join(', '));
    
    if (containsPatentNumber && (containsInventors || containsAssignee)) {
      testResults.ragIntegration.passed = true;
      testResults.ragIntegration.details = `Chat response contains relevant patent information: ${checks.join(', ')}`;
      console.log('  ✅ Chat API patent integration successful');
    } else {
      testResults.ragIntegration.details = `Chat response missing patent information: ${checks.join(', ')}`;
      console.log('  ⚠️ Chat API patent integration partial - some information missing');
    }
    
  } catch (error) {
    testResults.ragIntegration.details = error.message;
    console.error('  ❌ Chat API integration test failed:', error.message);
  }
}

/**
 * Print final test results
 */
function printTestResults() {
  console.log('\n📊 Final Test Results');
  console.log('=====================');
  
  const tests = [
    { name: 'Patent Ingestion', ...testResults.ingestion },
    { name: 'Metadata Storage', ...testResults.metadata },
    { name: 'RAG Retrieval', ...testResults.retrieval },
    { name: 'Chat Integration', ...testResults.ragIntegration }
  ];
  
  tests.forEach(test => {
    const status = test.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${test.name}: ${test.details}`);
  });
  
  const passedCount = tests.filter(t => t.passed).length;
  const totalCount = tests.length;
  
  console.log(`\n🎯 Overall Result: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    console.log('🎉 All tests passed! Enhanced patent RAG pipeline is working correctly.');
    process.exit(0);
  } else {
    console.log('⚠️ Some tests failed. Please review the results above.');
    process.exit(1);
  }
}

// Run the test suite
main().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});