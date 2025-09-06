/**
 * Script to populate knowledge graph from existing documents
 */

// Load environment variables from .env.local
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const envVars = envFile.split('\n').filter(line => line.includes('='));
  envVars.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (error) {
  console.warn('Warning: Could not load .env.local file');
}

import { processDocumentEntitiesDomain } from '../src/lib/rag/domain-entity-extractor';
import { extractDocumentRelationships } from '../src/lib/rag/relationship-extractor';
import { supabaseAdmin } from '../src/lib/supabase';

async function populateKnowledgeGraph() {
  console.log('🔄 Starting knowledge graph population...');
  
  try {
    // Get all documents that have been processed (have chunks)
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, title, doc_type, processing_status')
      .eq('processing_status', 'completed');

    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('❌ No completed documents found');
      return;
    }

    console.log(`📄 Found ${documents.length} completed documents`);

    let processedCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      console.log(`\n🔄 Processing document: "${doc.title}" (${doc.doc_type})`);
      
      try {
        // Get document chunks for processing
        const { data: chunks, error: chunksError } = await supabaseAdmin
          .from('document_chunks')
          .select('content')
          .eq('document_id', doc.id);

        if (chunksError || !chunks) {
          console.warn(`  ⚠️  No chunks found for document: ${doc.title}`);
          continue;
        }

        // Extract entities for this document using domain-specific patterns
        console.log('  📊 Extracting domain-specific entities...');
        await processDocumentEntitiesDomain(doc.id);
        
        // Extract relationships for this document
        console.log('  🔗 Extracting relationships...');
        const documentMetadata = {
          title: doc.title,
          docType: doc.doc_type,
          patentNo: doc.patent_no,
          doi: doc.doi,
          arxivId: doc.arxiv_id,
          date: doc.iso_date
        };
        const documentChunks = chunks.map(chunk => ({ content: chunk.content }));
        
        await extractDocumentRelationships(doc.id, documentMetadata, documentChunks);
        
        processedCount++;
        console.log(`  ✅ Document processed successfully`);
        
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error processing document "${doc.title}":`, error);
      }
    }

    console.log(`\n🎉 Knowledge graph population complete!`);
    console.log(`✅ Successfully processed: ${processedCount} documents`);
    console.log(`❌ Failed: ${errorCount} documents`);

    // Show summary statistics
    await showKGStatistics();

  } catch (error) {
    console.error('💥 Fatal error during KG population:', error);
    throw error;
  }
}

async function showKGStatistics() {
  console.log('\n📊 Knowledge Graph Statistics:');
  
  try {
    // Count entities by type
    const { data: entityStats, error: entityError } = await supabaseAdmin
      .from('entities')
      .select('kind')
      .order('kind');

    if (!entityError && entityStats) {
      const kindCounts = entityStats.reduce((acc: Record<string, number>, entity) => {
        acc[entity.kind] = (acc[entity.kind] || 0) + 1;
        return acc;
      }, {});

      console.log('  Entities:');
      Object.entries(kindCounts).forEach(([kind, count]) => {
        console.log(`    ${kind}: ${count}`);
      });
      console.log(`    Total entities: ${entityStats.length}`);
    }

    // Count aliases
    const { count: aliasCount, error: aliasError } = await supabaseAdmin
      .from('aliases')
      .select('*', { count: 'exact', head: true });

    if (!aliasError) {
      console.log(`  Aliases: ${aliasCount || 0}`);
    }

    // Count relationships by type
    const { data: edgeStats, error: edgeError } = await supabaseAdmin
      .from('edges')
      .select('rel')
      .order('rel');

    if (!edgeError && edgeStats) {
      const relCounts = edgeStats.reduce((acc: Record<string, number>, edge) => {
        acc[edge.rel] = (acc[edge.rel] || 0) + 1;
        return acc;
      }, {});

      console.log('  Relationships:');
      Object.entries(relCounts).forEach(([rel, count]) => {
        console.log(`    ${rel}: ${count}`);
      });
      console.log(`    Total relationships: ${edgeStats.length}`);
    }

    // Count events
    const { count: eventCount, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*', { count: 'exact', head: true });

    if (!eventError) {
      console.log(`  Events: ${eventCount || 0}`);
    }

  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
  }
}

// Run the script
if (require.main === module) {
  populateKnowledgeGraph()
    .then(() => {
      console.log('\n🎉 KG population script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 KG population script failed:', error);
      process.exit(1);
    });
}

export { populateKnowledgeGraph };