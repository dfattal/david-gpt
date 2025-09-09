/**
 * Direct CAT3D.pdf GROBID Processing Test
 * Tests actual CAT3D.pdf file with GROBID client to measure chunking behavior
 */

const fs = require('fs');

// GROBID Client (simplified version from document-processors.ts)
class GROBIDClient {
  constructor() {
    this.baseUrl = 'https://kermitt2-grobid.hf.space';
  }

  async processPDF(pdfBuffer) {
    try {
      const formData = new FormData();
      formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }));

      console.log(`📡 Sending PDF (${pdfBuffer.length} bytes) to GROBID...`);
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
      console.log(`📊 Received XML data: ${xmlData.length} characters`);
      
      return this.parseGROBIDResponse(xmlData);
    } catch (error) {
      console.error('Error processing PDF with GROBID:', error);
      return null;
    }
  }

  parseGROBIDResponse(xml) {
    // Extract text content from XML (simplified parsing)
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    const authorsMatch = xml.match(/<author[^>]*>.*?<persName[^>]*>.*?<forename[^>]*>([^<]*)<\/forename>.*?<surname[^>]*>([^<]*)<\/surname>.*?<\/persName>.*?<\/author>/g);
    const abstractMatch = xml.match(/<abstract[^>]*>(.*?)<\/abstract>/s);
    
    // Extract full body text (this is where the huge content comes from)
    const bodyMatch = xml.match(/<body[^>]*>(.*?)<\/body>/s);
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    
    // Also extract references and bibliography
    const referencesMatch = xml.match(/<listBibl[^>]*>(.*?)<\/listBibl>/s);
    const referencesText = referencesMatch ? referencesMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    
    const abstractText = abstractMatch ? abstractMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    const authors = authorsMatch ? authorsMatch.map(match => {
      const forenameMatch = match.match(/<forename[^>]*>([^<]*)<\/forename>/);
      const surnameMatch = match.match(/<surname[^>]*>([^<]*)<\/surname>/);
      const forename = forenameMatch ? forenameMatch[1].trim() : '';
      const surname = surnameMatch ? surnameMatch[1].trim() : '';
      return `${forename} ${surname}`.trim();
    }) : [];

    // Combine all text content
    const fullText = [title, abstractText, bodyText, referencesText]
      .filter(text => text && text.length > 0)
      .join('\n\n');

    return {
      title,
      authors,
      abstract: abstractText,
      bodyText,
      referencesText,
      fullText,
      statistics: {
        titleLength: title.length,
        abstractLength: abstractText.length,
        bodyLength: bodyText.length,
        referencesLength: referencesText.length,
        totalLength: fullText.length
      }
    };
  }
}

// Token estimation function (copied from chunking.js)
function estimateTokens(text) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const baseCount = normalized.length / 4;
  const punctuationCount = (normalized.match(/[.!?,;:()\\[\\]{}'\"]/g) || []).length;
  return Math.ceil(baseCount + (punctuationCount * 0.1));
}

async function testCAT3DWithGROBID() {
  console.log('🧪 Testing CAT3D.pdf with GROBID Processing\n');
  
  try {
    // Read the CAT3D.pdf file
    console.log('📖 Reading CAT3D.pdf file...');
    const pdfBuffer = fs.readFileSync('/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES/CAT3D.pdf');
    console.log(`File size: ${pdfBuffer.length} bytes\n`);
    
    // Process with GROBID
    const grobidClient = new GROBIDClient();
    const grobidResult = await grobidClient.processPDF(pdfBuffer);
    
    if (!grobidResult) {
      console.error('❌ GROBID processing failed');
      return;
    }
    
    console.log('✅ GROBID processing completed!\n');
    
    // Analyze results
    console.log('📊 GROBID Analysis Results:');
    console.log(`   Title: ${grobidResult.title}`);
    console.log(`   Authors: ${grobidResult.authors.length} found: ${grobidResult.authors.slice(0, 3).join(', ')}${grobidResult.authors.length > 3 ? '...' : ''}`);
    console.log('');
    
    console.log('📏 Content Statistics:');
    console.log(`   Title: ${grobidResult.statistics.titleLength} chars`);
    console.log(`   Abstract: ${grobidResult.statistics.abstractLength} chars`);
    console.log(`   Body: ${grobidResult.statistics.bodyLength} chars`);
    console.log(`   References: ${grobidResult.statistics.referencesLength} chars`);
    console.log(`   Total: ${grobidResult.statistics.totalLength} chars`);
    console.log('');
    
    // Token analysis
    const totalTokens = estimateTokens(grobidResult.fullText);
    const abstractTokens = estimateTokens(grobidResult.abstract);
    const bodyTokens = estimateTokens(grobidResult.bodyText);
    const referencesTokens = estimateTokens(grobidResult.referencesText);
    
    console.log('🔤 Token Analysis:');
    console.log(`   Abstract: ${abstractTokens} tokens`);
    console.log(`   Body: ${bodyTokens} tokens`);
    console.log(`   References: ${referencesTokens} tokens`);
    console.log(`   Total: ${totalTokens} tokens`);
    console.log('');
    
    // Chunking prediction
    const targetTokensPerChunk = 800;
    const expectedChunks = Math.ceil(totalTokens / targetTokensPerChunk);
    
    console.log('📝 Chunking Prediction:');
    console.log(`   Target tokens per chunk: ${targetTokensPerChunk}`);
    console.log(`   Expected chunks: ${expectedChunks}`);
    console.log(`   Previous problematic result: 5418 chunks`);
    console.log('');
    
    // Show content samples
    console.log('📄 Content Samples:');
    console.log('   Abstract (first 200 chars):');
    console.log(`   "${grobidResult.abstract.substring(0, 200)}..."`);
    console.log('');
    console.log('   Body (first 200 chars):');
    console.log(`   "${grobidResult.bodyText.substring(0, 200)}..."`);
    console.log('');
    
    // High-level analysis of the over-chunking issue
    if (expectedChunks < 100) {
      console.log('✅ Reasonable chunk count predicted');
    } else if (expectedChunks < 1000) {
      console.log('⚠️  High chunk count - content filtering may be needed');
    } else {
      console.log('❌ Extremely high chunk count - content filtering definitely needed');
      console.log('   This explains the previous 5418 chunk issue!');
    }
    
    console.log('\n🔍 Analysis Complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCAT3DWithGROBID();