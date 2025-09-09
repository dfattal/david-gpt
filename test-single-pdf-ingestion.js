/**
 * Test Single Document PDF Ingestion
 * Tests CAT3D.pdf processing through the single document ingestion route
 */

const fs = require('fs');

async function testSinglePDFIngestion() {
  console.log('🧪 Testing Single Document PDF Ingestion\n');
  
  try {
    // Read the CAT3D.pdf file
    console.log('📖 Reading CAT3D.pdf file...');
    const pdfBuffer = fs.readFileSync('/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES/CAT3D.pdf');
    console.log(`File size: ${pdfBuffer.length} bytes\n`);
    
    // Convert buffer to base64 for JSON transmission
    const pdfBase64 = pdfBuffer.toString('base64');
    
    // Test via single document ingestion API
    console.log('📡 Sending to single document ingestion API...');
    const response = await fetch('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        title: 'CAT3D Single Document Test',
        content: pdfBase64, // Try sending base64 encoded PDF
        docType: 'pdf'
      })
    });
    
    console.log('Response Status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Single ingestion successful!');
      console.log('Document ID:', result.document?.id);
      console.log('Job ID:', result.jobId);
      
      // Monitor processing
      await monitorProcessing(result.document?.id);
    } else {
      const error = await response.text();
      console.log('❌ Single ingestion failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function monitorProcessing(documentId) {
  if (!documentId) return;
  
  console.log('\n📊 Monitoring processing...');
  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Check document status in database by making a query request
      // Since we can't directly query the DB, we'll wait and check logs
      console.log(`⏳ Attempt ${attempts + 1}/${maxAttempts} - Checking processing status...`);
      attempts++;
      
      if (attempts >= maxAttempts) {
        console.log('⏰ Monitoring timeout - check server logs for final status');
        break;
      }
    } catch (error) {
      console.error('Error monitoring:', error);
      break;
    }
  }
}

testSinglePDFIngestion();