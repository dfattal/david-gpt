/**
 * Service Role API Test 
 * Tests document ingest API using service role authentication
 */

const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function testServiceRoleAPI() {
  console.log('🔑 Testing Document Ingest API with Service Role Authentication\n');

  const testCases = [
    {
      name: "Patent URL Test - US11281020B2",
      payload: {
        title: "Multi-view display system patent",
        docType: "patent",
        patentUrl: "https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1"
      }
    },
    {
      name: "Simple Content Test", 
      payload: {
        title: "Test Document Content",
        docType: "note",
        content: "This is a test document with some meaningful content for chunking and entity extraction testing. It should generate proper chunks and extract basic entities."
      }
    }
  ];

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`
  };

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`Payload:`, JSON.stringify(testCase.payload, null, 2));

    try {
      const startTime = Date.now();
      
      const response = await fetch('http://localhost:3001/api/documents/ingest', {
        method: 'POST',
        headers,
        body: JSON.stringify(testCase.payload)
      });

      const endTime = Date.now();
      console.log(`⏱️ Request time: ${endTime - startTime}ms`);
      console.log(`📡 Response Status: ${response.status}`);
      
      const responseText = await response.text();
      
      if (response.ok) {
        const result = JSON.parse(responseText);
        console.log('✅ Success:', JSON.stringify(result, null, 2));
        
        if (result.jobId) {
          console.log(`📊 Job created: ${result.jobId}`);
          console.log(`📄 Document created: ${result.document?.id || 'Unknown ID'}`);
        }
      } else {
        console.log('❌ Error Response:', responseText.substring(0, 500));
      }
      
    } catch (error) {
      console.error('❌ Request Error:', error.message);
    }
  }
}

if (require.main === module) {
  testServiceRoleAPI()
    .then(() => {
      console.log('\n✅ Service role API test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Service role API test failed:', error);
      process.exit(1);
    });
}