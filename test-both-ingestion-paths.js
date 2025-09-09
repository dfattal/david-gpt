/**
 * Test Both Ingestion Paths with GROBID-processed CAT3D.pdf
 * Compares single document vs batch ingestion with the same processed content
 */

const fs = require('fs');

// GROBID Client (reused from previous test)
class GROBIDClient {
  constructor() {
    this.baseUrl = 'https://kermitt2-grobid.hf.space';
  }

  async processPDF(pdfBuffer) {
    try {
      const formData = new FormData();
      formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }));

      console.log(`📡 Processing PDF (${pdfBuffer.length} bytes) with GROBID...`);
      const response = await fetch(`${this.baseUrl}/api/processFulltextDocument`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/xml',
        },
      });

      if (!response.ok) {
        throw new Error(`GROBID API error: ${response.status} ${response.statusText}`);
      }

      const xmlData = await response.text();
      return this.parseGROBIDResponse(xmlData);
    } catch (error) {
      console.error('Error processing PDF with GROBID:', error);
      return null;
    }
  }

  parseGROBIDResponse(xml) {
    // Extract content sections
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    const abstractMatch = xml.match(/<abstract[^>]*>(.*?)<\/abstract>/s);
    const bodyMatch = xml.match(/<body[^>]*>(.*?)<\/body>/s);
    const referencesMatch = xml.match(/<listBibl[^>]*>(.*?)<\/listBibl>/s);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const abstractText = abstractMatch ? abstractMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const referencesText = referencesMatch ? referencesMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    
    const fullText = [title, abstractText, bodyText, referencesText]
      .filter(text => text && text.length > 0)
      .join('\\n\\n');

    return {
      title,
      fullText,
      length: fullText.length
    };
  }
}

// Token estimation
function estimateTokens(text) {
  const normalized = text.trim().replace(/\\s+/g, ' ');
  const baseCount = normalized.length / 4;
  const punctuationCount = (normalized.match(/[.!?,;:()\\[\\]{}'\"]/g) || []).length;
  return Math.ceil(baseCount + (punctuationCount * 0.1));
}

async function testBothIngestionPaths() {
  console.log('🧪 Testing Both Ingestion Paths with GROBID-processed CAT3D.pdf\\n');
  
  try {
    // Step 1: Process PDF with GROBID
    console.log('📖 Reading and processing CAT3D.pdf...');
    const pdfBuffer = fs.readFileSync('/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES/CAT3D.pdf');
    
    const grobidClient = new GROBIDClient();
    const grobidResult = await grobidClient.processPDF(pdfBuffer);
    
    if (!grobidResult) {
      throw new Error('GROBID processing failed');
    }
    
    const tokens = estimateTokens(grobidResult.fullText);
    console.log(`✅ GROBID processed: ${grobidResult.length} chars, ~${tokens} tokens\\n`);
    
    // Step 2: Test Single Document Ingestion
    console.log('📡 Testing Single Document Ingestion...');
    const singleResult = await testSingleIngestion(grobidResult);
    
    // Step 3: Test Batch Document Ingestion  
    console.log('\\n📡 Testing Batch Document Ingestion...');
    const batchResult = await testBatchIngestion(grobidResult);
    
    // Step 4: Monitor both and compare results
    console.log('\\n📊 Monitoring processing results...');
    await Promise.all([
      monitorDocument(singleResult.documentId, 'Single'),
      monitorDocument(batchResult.documentId, 'Batch')
    ]);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testSingleIngestion(grobidResult) {
  try {
    const response = await fetch('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        title: 'CAT3D Single Ingestion Test',
        content: grobidResult.fullText,
        docType: 'paper'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Single ingestion successful');
      console.log(`   Document ID: ${result.document?.id}`);
      return { documentId: result.document?.id, jobId: result.jobId };
    } else {
      const error = await response.text();
      console.log('❌ Single ingestion failed:', error);
      return { documentId: null };
    }
  } catch (error) {
    console.error('❌ Single ingestion error:', error);
    return { documentId: null };
  }
}

async function testBatchIngestion(grobidResult) {
  try {
    const response = await fetch('http://localhost:3000/api/documents/batch-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs`
      },
      body: JSON.stringify({
        documents: [{
          title: 'CAT3D Batch Ingestion Test',
          content: grobidResult.fullText,
          detectedType: 'paper',
          confidence: 1.0,
          metadata: {
            description: 'Testing batch ingestion with GROBID-processed content'
          }
        }],
        batchDescription: 'CAT3D GROBID processing test'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Batch ingestion successful');
      console.log(`   Batch ID: ${result.batchId}`);
      // For batch, we need to get the document ID differently - it's created during processing
      return { batchId: result.batchId, documentId: 'batch-processing' };
    } else {
      const error = await response.text();
      console.log('❌ Batch ingestion failed:', error);
      return { documentId: null };
    }
  } catch (error) {
    console.error('❌ Batch ingestion error:', error);
    return { documentId: null };
  }
}

async function monitorDocument(documentId, type) {
  if (!documentId || documentId === 'batch-processing') {
    console.log(`⏳ ${type}: Monitoring via server logs (document ID not available)`);
    return;
  }
  
  console.log(`⏳ ${type}: Monitoring document ${documentId}`);
  // Since we can't directly query the database, we'll rely on server logs
  await new Promise(resolve => setTimeout(resolve, 10000));
  console.log(`✅ ${type}: Check server logs for final chunk count`);
}

testBothIngestionPaths();