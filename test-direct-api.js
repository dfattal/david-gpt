/**
 * Direct API Test with Supabase Authentication
 * Tests the single document ingest API with proper authentication
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDocumentIngestWithAuth() {
  console.log('🚀 Testing Document Ingest API with Authentication\n');

  try {
    // Get admin user for testing (assuming david.fattal@leiainc.com is admin)
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    const adminUser = users.users.find(user => 
      user.email === 'dfattal@gmail.com' || user.email === 'david.fattal@leiainc.com'
    );

    if (!adminUser) {
      console.error('❌ No admin user found. Available users:', users.users.map(u => u.email));
      return;
    }

    console.log(`✅ Found admin user: ${adminUser.email}`);

    // Create access token for the admin user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: adminUser.email,
    });

    if (sessionError) {
      console.error('❌ Error creating session:', sessionError);
      return;
    }

    console.log('✅ Generated magic link for authentication');

    // Test Cases
    const testCases = [
      {
        name: "Patent URL Test",
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
          content: "This is a test document with some meaningful content for chunking and entity extraction testing."
        }
      }
    ];

    // Use service role key for direct API access (bypassing browser auth)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'X-User-Email': adminUser.email // Custom header to identify user
    };

    for (const testCase of testCases) {
      console.log(`\n🧪 Testing: ${testCase.name}`);
      console.log(`Payload:`, JSON.stringify(testCase.payload, null, 2));

      try {
        const response = await fetch('http://localhost:3001/api/documents/ingest', {
          method: 'POST',
          headers,
          body: JSON.stringify(testCase.payload)
        });

        console.log(`Response Status: ${response.status}`);
        
        const responseText = await response.text();
        
        if (response.ok) {
          const result = JSON.parse(responseText);
          console.log('✅ Success:', JSON.stringify(result, null, 2));
          
          if (result.jobId) {
            console.log(`📊 Job created: ${result.jobId}`);
            // Could monitor job here if needed
          }
        } else {
          console.log('❌ Error Response:', responseText.substring(0, 500));
        }
        
      } catch (error) {
        console.error('❌ Request Error:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Test setup failed:', error);
  }
}

if (require.main === module) {
  testDocumentIngestWithAuth()
    .then(() => {
      console.log('\n✅ Direct API test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Direct API test failed:', error);
      process.exit(1);
    });
}