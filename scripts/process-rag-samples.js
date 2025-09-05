#!/usr/bin/env node

/**
 * Script to process RAG-SAMPLES documents
 * Creates chunks and embeddings for documents already inserted in database
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import crypto from 'crypto';

// Initialize clients with environment variables
const supabase = createClient(
  'https://mnjrwjtzfjfixdjrerke.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs'
);

const openai = new OpenAI({
  apiKey: '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',
});

// Document IDs from our SQL inserts
const DOCUMENT_MAP = {
  '53196a2b-5ef8-4dcb-ba50-382609d2e969': 'LIF.md',
  'b1a5a2a4-f26c-4776-8838-39c3596924e7': 'Immersity (LeiaSR) FAQ.md',
  '1964606c-4324-4f70-aa25-8dc0efeda268': 'phase_eng.md',
  'f5497b91-5e73-4515-9f76-5afedc7a2295': 'patent-US11281020B2',
  'c04e617f-2339-4466-ad8e-2d7d43746a51': 'patent-WO2024145265A1',
  '43751e84-1740-42d6-880c-9fa2ff73bf9e': 'CAT3D.pdf'
};

const RAG_SAMPLES_DIR = '/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES';

/**
 * Simple text chunking function
 */
function chunkText(text, maxTokens = 800, overlapTokens = 120) {
  // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;
  
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const chunk = text.slice(start, end);
    
    // Try to break at sentence boundary
    let actualEnd = end;
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + maxChars * 0.5) {
        actualEnd = start + breakPoint + 1;
      }
    }
    
    chunks.push({
      content: text.slice(start, actualEnd).trim(),
      tokenCount: Math.ceil(actualEnd - start) / 4,
      start,
      end: actualEnd
    });
    
    start = actualEnd - overlapChars;
  }
  
  return chunks;
}

/**
 * Generate embeddings for text chunks
 */
async function generateEmbeddings(texts) {
  console.log(`🔮 Generating embeddings for ${texts.length} chunks...`);
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float',
  });
  
  return response.data.map(item => item.embedding);
}

/**
 * Process a single document
 */
async function processDocument(documentId, filename) {
  console.log(`\n📄 Processing document: ${filename}`);
  
  let content = '';
  
  // Load content based on type
  if (filename.startsWith('patent-')) {
    // For patents, create placeholder content
    const patentNo = filename.replace('patent-', '');
    content = `Patent Number: ${patentNo}\n\nThis is a placeholder for patent content. In a full implementation, this would contain the actual patent text extracted from the Google Patents URL.`;
  } else if (filename === 'CAT3D.pdf') {
    // For PDF, create placeholder content
    content = `CAT3D: Create Anything in 3D with Multi-View Diffusion Models\n\nThis is a placeholder for the CAT3D paper content. In a full implementation, this would contain the actual PDF text extracted using pdf-parse or similar library.`;
  } else {
    // Load markdown files
    const filePath = path.join(RAG_SAMPLES_DIR, filename);
    content = fs.readFileSync(filePath, 'utf-8');
  }
  
  console.log(`📝 Content length: ${content.length} characters`);
  
  // Chunk the content
  const chunks = chunkText(content);
  console.log(`🧩 Created ${chunks.length} chunks`);
  
  // Generate embeddings
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));
  
  // Insert chunks into database
  const chunksToInsert = chunks.map((chunk, index) => ({
    document_id: documentId,
    content: chunk.content,
    content_hash: crypto.createHash('sha256').update(chunk.content).digest('hex'),
    token_count: Math.round(chunk.tokenCount),
    chunk_index: index,
    embedding: JSON.stringify(embeddings[index]),
  }));
  
  const { error } = await supabase
    .from('document_chunks')
    .insert(chunksToInsert);
    
  if (error) {
    throw new Error(`Failed to insert chunks: ${error.message}`);
  }
  
  console.log(`✅ Inserted ${chunks.length} chunks with embeddings`);
  return chunks.length;
}

/**
 * Main processing function
 */
async function main() {
  console.log('🚀 Starting RAG-SAMPLES document processing...\n');
  
  let totalChunks = 0;
  
  for (const [documentId, filename] of Object.entries(DOCUMENT_MAP)) {
    try {
      const chunkCount = await processDocument(documentId, filename);
      totalChunks += chunkCount;
    } catch (error) {
      console.error(`❌ Error processing ${filename}:`, error.message);
    }
  }
  
  console.log(`\n🎉 Processing complete! Total chunks created: ${totalChunks}`);
  
  // Verify final state
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, (document_chunks(count))')
    .order('created_at');
    
  console.log('\n📊 Final document status:');
  documents?.forEach(doc => {
    console.log(`  • ${doc.title}: ${doc.document_chunks?.[0]?.count || 0} chunks`);
  });
}

// Run the script
main().catch(console.error);