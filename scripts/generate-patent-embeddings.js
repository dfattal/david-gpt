#!/usr/bin/env node

/**
 * Generate embeddings for patent chunks
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initialize clients
const supabase = createClient(
  'https://mnjrwjtzfjfixdjrerke.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uanJ3anR6ZmpmaXhkanJlcmtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgyNjE0NCwiZXhwIjoyMDcxNDAyMTQ0fQ.rIOuS8bwOpLivFQIQZF2bZvdWTEkfA-4hsK6d-9xJrs'
);

const openai = new OpenAI({
  apiKey: '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',
});

/**
 * Generate embeddings in small batches
 */
async function generateEmbeddings(texts) {
  console.log(`🔮 Generating embeddings for ${texts.length} chunks...`);
  
  const batchSize = 5; // Small batch size to avoid memory issues
  const allEmbeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}...`);
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      encoding_format: 'float',
    });
    
    allEmbeddings.push(...response.data.map(item => item.embedding));
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allEmbeddings;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting patent embedding generation...\n');
  
  // Get all patent chunks without embeddings
  const { data: chunks, error: fetchError } = await supabase
    .from('document_chunks')
    .select(`
      id,
      content,
      chunk_index,
      documents!inner (
        patent_no,
        title
      )
    `)
    .is('embedding', null)
    .eq('documents.doc_type', 'patent')
    .order('chunk_index');
    
  if (fetchError) {
    console.error('❌ Error fetching chunks:', fetchError);
    return;
  }
  
  if (!chunks || chunks.length === 0) {
    console.log('✅ All patent chunks already have embeddings!');
    return;
  }
  
  console.log(`📊 Found ${chunks.length} chunks without embeddings`);
  chunks.forEach(chunk => {
    console.log(`  📄 ${chunk.documents.patent_no} - Chunk ${chunk.chunk_index} (${chunk.content.length} chars)`);
  });
  
  // Generate embeddings
  const texts = chunks.map(chunk => chunk.content);
  const embeddings = await generateEmbeddings(texts);
  
  // Update chunks with embeddings
  console.log('\n💾 Updating chunks with embeddings...');
  let successCount = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    
    const { error: updateError } = await supabase
      .from('document_chunks')
      .update({
        embedding: JSON.stringify(embedding)
      })
      .eq('id', chunk.id);
      
    if (updateError) {
      console.error(`❌ Failed to update chunk ${chunk.id}:`, updateError);
    } else {
      successCount++;
      console.log(`✅ Updated ${chunk.documents.patent_no} chunk ${chunk.chunk_index}`);
    }
  }
  
  console.log(`\n🎉 Embedding generation complete!`);
  console.log(`✅ Successfully updated: ${successCount}/${chunks.length} chunks`);
  
  // Verify final state
  const { data: verifyChunks } = await supabase
    .from('document_chunks')
    .select(`
      chunk_index,
      embedding IS NOT NULL as has_embedding,
      documents!inner (
        patent_no,
        title
      )
    `)
    .eq('documents.doc_type', 'patent')
    .order('chunk_index');
    
  console.log('\n📊 Final embedding status:');
  const groupedByPatent = verifyChunks?.reduce((acc, chunk) => {
    const patent = chunk.documents.patent_no;
    if (!acc[patent]) acc[patent] = [];
    acc[patent].push(chunk);
    return acc;
  }, {});
  
  Object.entries(groupedByPatent || {}).forEach(([patent, chunks]) => {
    const withEmbeddings = chunks.filter(c => c.has_embedding).length;
    console.log(`  📋 ${patent}: ${withEmbeddings}/${chunks.length} chunks with embeddings`);
  });
}

// Run the script
main().catch(console.error);