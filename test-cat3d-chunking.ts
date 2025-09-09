#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { GROBIDClient } from './src/lib/rag/document-processors';
import { DocumentChunker, estimateTokens } from './src/lib/rag/chunking';

async function testCAT3DChunking() {
  const pdfPath = '/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES/CAT3D.pdf';
  
  console.log('=== Processing CAT3D.pdf ===');
  
  try {
    // Read the PDF file
    const pdfBuffer = readFileSync(pdfPath);
    console.log(`PDF file size: ${pdfBuffer.length} bytes`);
    
    // First try basic pdf-parse for raw text extraction
    console.log('\n--- Basic PDF Text Extraction ---');
    const pdfParse = (await import('pdf-parse')).default;
    const basicPdfData = await pdfParse(pdfBuffer);
    const rawText = basicPdfData.text;
    const rawTokens = estimateTokens(rawText);
    console.log(`Raw text tokens: ${rawTokens}`);
    console.log(`Raw text length: ${rawText.length} characters`);
    console.log(`Raw text preview: ${rawText.substring(0, 200)}...`);
    
    // Now try GROBID processing
    console.log('\n--- GROBID Processing ---');
    const grobidClient = new GROBIDClient();
    const grobidResult = await grobidClient.processPDF(pdfBuffer);
    
    if (grobidResult) {
      console.log(`GROBID Title: ${grobidResult.title}`);
      console.log(`GROBID Authors: ${grobidResult.authors?.map(a => a.fullName).join(', ')}`);
      console.log(`GROBID Abstract: ${grobidResult.abstract?.substring(0, 200)}...`);
      console.log(`GROBID Keywords: ${grobidResult.keywords?.join(', ')}`);
      
      // Use GROBID-enhanced text for chunking if available
      const enhancedText = [
        grobidResult.title,
        grobidResult.abstract,
        // Note: GROBID doesn't return full text in this simplified version,
        // so we'll fall back to raw text for chunking analysis
      ].filter(Boolean).join('\n\n');
      
      const enhancedTokens = estimateTokens(enhancedText);
      console.log(`GROBID enhanced text tokens: ${enhancedTokens}`);
      
      if (enhancedTokens < rawTokens / 2) {
        console.log('GROBID text seems incomplete, using raw PDF text for chunking analysis');
      }
    } else {
      console.log('GROBID processing failed, using raw PDF text');
    }
    
    // Test chunking with the raw text (since GROBID may not return full content)
    console.log('\n--- Chunking Analysis ---');
    const chunker = new DocumentChunker();
    const chunks = await chunker.chunkDocument(rawText, 'cat3d-test');
    
    console.log(`\nChunks created: ${chunks.length}`);
    console.log(`Total tokens across chunks: ${chunks.reduce((sum, c) => sum + c.tokenCount, 0)}`);
    
    for (let i = 0; i < chunks.length && i < 10; i++) { // Show first 10 chunks
      const chunk = chunks[i];
      console.log(`\nChunk ${i + 1}:`);
      console.log(`  Tokens: ${chunk.tokenCount}`);
      console.log(`  Section: ${chunk.sectionTitle || 'undefined'}`);
      console.log(`  Preview: ${chunk.content.substring(0, 150)}...`);
    }
    
    if (chunks.length > 10) {
      console.log(`\n... and ${chunks.length - 10} more chunks`);
    }
    
    // Analyze chunk distribution
    const tokenCounts = chunks.map(c => c.tokenCount);
    const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const minTokens = Math.min(...tokenCounts);
    const maxTokens = Math.max(...tokenCounts);
    
    console.log(`\n--- Chunk Statistics ---`);
    console.log(`Average tokens per chunk: ${Math.round(avgTokens)}`);
    console.log(`Min tokens: ${minTokens}`);
    console.log(`Max tokens: ${maxTokens}`);
    console.log(`Chunks under 200 tokens: ${tokenCounts.filter(t => t < 200).length}`);
    console.log(`Chunks 800-1200 tokens (target range): ${tokenCounts.filter(t => t >= 800 && t <= 1200).length}`);
    
  } catch (error) {
    console.error('Error processing CAT3D.pdf:', error);
  }
}

testCAT3DChunking().catch(console.error);