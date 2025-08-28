// Test script for fixes
// 1. Test hybrid search with correct column names
// 2. Trigger knowledge graph extraction

const fetch = require('node-fetch');

async function testFixes() {
  console.log('🔧 Testing fixes...\n');
  
  // Test 1: Get documents to find IDs
  console.log('1. Getting document list...');
  try {
    const response = await fetch('http://localhost:3000/api/rag/documents');
    const data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      console.log(`✅ Found ${data.documents.length} documents`);
      
      // Find neural network document
      const neuralNetDoc = data.documents.find(doc => 
        doc.title.includes('Neural Network')
      );
      
      if (neuralNetDoc) {
        console.log(`📄 Target document: ${neuralNetDoc.title} (ID: ${neuralNetDoc.id})`);
        
        // Test 2: Trigger KG extraction
        console.log('\n2. Triggering knowledge graph extraction...');
        
        const kgResponse = await fetch('http://localhost:3000/api/rag/kg/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            doc_id: neuralNetDoc.id
          })
        });
        
        const kgResult = await kgResponse.json();
        
        if (kgResponse.ok) {
          console.log('✅ Knowledge graph extraction successful!');
          console.log(`   - Entities extracted: ${kgResult.extraction.entities_extracted}`);
          console.log(`   - Relations extracted: ${kgResult.extraction.relations_extracted}`);
          console.log(`   - Chunks processed: ${kgResult.extraction.chunks_processed}`);
        } else {
          console.log('❌ KG extraction failed:', kgResult.error);
          if (kgResult.details) {
            console.log('   Details:', kgResult.details);
          }
        }
        
        // Test 3: Verify hybrid search now works
        console.log('\n3. Testing hybrid search...');
        
        const chatResponse = await fetch('http://localhost:3000/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: 'What are attention mechanisms in transformers?'
              }
            ]
          })
        });
        
        if (chatResponse.ok) {
          console.log('✅ Chat API with hybrid search working!');
          console.log('   Response status:', chatResponse.status);
        } else {
          console.log('❌ Chat API failed:', chatResponse.status);
        }
        
      } else {
        console.log('❌ Neural network document not found');
      }
    } else {
      console.log('❌ No documents found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  console.log('\n🏁 Test completed');
}

testFixes();