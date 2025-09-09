#!/usr/bin/env node

/**
 * Simple Patent API Test
 * Tests the document ingestion API with enhanced patent extraction
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const TEST_PATENT_URL = 'https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1';

console.log('🧪 Testing Patent Ingestion API');
console.log('===============================');

async function testPatentIngestion() {
  console.log('📥 Testing patent ingestion via API...');
  console.log(`🔗 Patent URL: ${TEST_PATENT_URL}`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/documents/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: TEST_PATENT_URL,
        title: 'Enhanced Test Patent Ingestion - US11281020B2',
        patentUrl: TEST_PATENT_URL,
        forceRefresh: true // Force re-processing even if document exists
      })
    });
    
    console.log(`📊 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Error response: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Ingestion response:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('🎉 Patent ingestion completed successfully!');
      console.log(`📄 Document ID: ${result.documentId}`);
      
      if (result.extractedMetadata) {
        console.log('🔍 Enhanced metadata extracted:');
        console.log('  📝 Patent Number:', result.extractedMetadata.patentNumber);
        console.log('  👥 Inventors:', result.extractedMetadata.inventors);
        console.log('  🏢 Assignee:', result.extractedMetadata.assignee);
        console.log('  🏢 Original Assignee:', result.extractedMetadata.originalAssignee);
        console.log('  📅 Filing Date:', result.extractedMetadata.filingDate);
        console.log('  📅 Grant Date:', result.extractedMetadata.grantDate);
        console.log('  📅 Priority Date:', result.extractedMetadata.priorityDate);
        console.log('  📊 Status:', result.extractedMetadata.status);
        console.log('  📅 Expiration Date:', result.extractedMetadata.expirationDate);
      }
      
      return result.documentId;
    } else {
      console.log('❌ Ingestion failed:', result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('💥 API test failed:', error.message);
  }
}

async function testChatAPI() {
  console.log('\n💬 Testing Chat API with patent query...');
  
  try {
    const testQuery = "Tell me about patent US11281020B2, who are the inventors and what company owns it?";
    console.log(`❓ Query: ${testQuery}`);
    
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
      console.log(`❌ Chat API failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    // Read streaming response
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
    
    console.log('💬 Chat response received (length:', chatResponse.length, 'chars)');
    console.log('📝 Response preview:', chatResponse.substring(0, 300) + '...');
    
    // Check for key information
    const hasPatentNumber = chatResponse.includes('US11281020B2');
    const hasInventors = chatResponse.includes('Fetze Pijlman') || chatResponse.includes('Jan Van Der Horst');
    const hasCompany = chatResponse.includes('Philips') || chatResponse.includes('Leia');
    
    console.log('🔍 Response analysis:');
    console.log(`  📄 Contains patent number: ${hasPatentNumber ? '✅' : '❌'}`);
    console.log(`  👥 Contains inventors: ${hasInventors ? '✅' : '❌'}`);
    console.log(`  🏢 Contains company info: ${hasCompany ? '✅' : '❌'}`);
    
    if (hasPatentNumber && (hasInventors || hasCompany)) {
      console.log('🎉 Chat API successfully retrieved patent information!');
    } else {
      console.log('⚠️ Chat API response may be missing some patent information');
    }
    
  } catch (error) {
    console.error('💥 Chat API test failed:', error.message);
  }
}

async function main() {
  await testPatentIngestion();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
  await testChatAPI();
  
  console.log('\n🎯 Test completed!');
}

main().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});