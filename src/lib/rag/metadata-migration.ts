/**
 * Batch Migration Script for Metadata Injection
 * 
 * Updates all existing documents to include metadata in their abstract/title chunks
 * for improved RAG retrieval accuracy.
 */

import { createClient } from '@supabase/supabase-js';
import { injectMetadataIntoContent, estimateTokensWithMetadata } from './metadata-templates';
import type { DocumentMetadata } from './types';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables for Supabase');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DocumentChunkUpdate {
  id: string;
  newContent: string;
  newTokenCount: number;
}

interface MigrationStats {
  totalDocuments: number;
  processedDocuments: number;
  updatedChunks: number;
  skippedDocuments: number;
  errors: number;
  documentTypeBreakdown: Record<string, number>;
}

/**
 * Get all documents that need metadata injection
 */
async function getDocumentsToMigrate(): Promise<any[]> {
  console.log('📊 Fetching documents for migration...');
  
  const { data: documents, error } = await supabase
    .from('documents')
    .select(`
      id, title, doc_type, patent_no, doi, arxiv_id,
      inventors, assignees, original_assignee,
      authors_affiliations, venue, publication_year,
      filed_date, granted_date, published_date,
      citation_count, keywords, url
    `)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  console.log(`✅ Found ${documents?.length || 0} documents to process`);
  return documents || [];
}

/**
 * Get abstract/title chunks for a document that need metadata injection
 */
async function getChunksToUpdate(documentId: string): Promise<any[]> {
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, content, token_count, section_title, chunk_index')
    .eq('document_id', documentId)
    .in('section_title', ['Abstract', 'Title'])
    .order('chunk_index', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch chunks for document ${documentId}: ${error.message}`);
  }

  return chunks || [];
}

/**
 * Check if a chunk already has metadata injection
 */
function hasMetadataInjection(content: string, docType: string): boolean {
  const indicators = [
    'Patent ', 'Inventors:', 'Authors:', 'Published:', 
    'DOI:', 'arXiv:', 'Assignee:', 'Source:', 'Book -'
  ];
  
  return indicators.some(indicator => content.includes(indicator));
}

/**
 * Convert database document to DocumentMetadata format
 */
function convertToDocumentMetadata(doc: any): DocumentMetadata {
  return {
    title: doc.title,
    docType: doc.doc_type,
    patentNo: doc.patent_no,
    doi: doc.doi,
    arxivId: doc.arxiv_id,
    inventors: doc.inventors,
    assignees: doc.assignees,
    originalAssignee: doc.original_assignee,
    authorsAffiliations: doc.authors_affiliations,
    venue: doc.venue,
    publicationYear: doc.publication_year,
    filedDate: doc.filed_date,
    grantedDate: doc.granted_date,
    date: doc.published_date,
    citationCount: doc.citation_count,
    keywords: doc.keywords,
    url: doc.url
  };
}

/**
 * Process a single document for metadata injection
 */
async function processDocument(doc: any, stats: MigrationStats): Promise<void> {
  try {
    console.log(`🔄 Processing ${doc.doc_type}: ${doc.title}`);
    
    const chunks = await getChunksToUpdate(doc.id);
    
    if (chunks.length === 0) {
      console.log(`⚠️  No abstract/title chunks found for document: ${doc.title}`);
      stats.skippedDocuments++;
      return;
    }

    const metadata = convertToDocumentMetadata(doc);
    const chunksToUpdate: DocumentChunkUpdate[] = [];

    // Process each chunk
    for (const chunk of chunks) {
      // Skip if already has metadata
      if (hasMetadataInjection(chunk.content, doc.doc_type)) {
        console.log(`✅ Chunk already has metadata: ${chunk.section_title}`);
        continue;
      }

      // For title chunks, we might want to skip injection to keep them clean
      if (chunk.section_title === 'Title' && chunk.content.length < 100) {
        console.log(`⏭️  Skipping title chunk (too short): ${chunk.content.slice(0, 50)}...`);
        continue;
      }

      // Inject metadata into content
      const enhancedContent = injectMetadataIntoContent(chunk.content, metadata);
      
      // Skip if no metadata was added
      if (enhancedContent === chunk.content) {
        console.log(`⏭️  No metadata to inject for: ${chunk.section_title}`);
        continue;
      }

      const newTokenCount = estimateTokensWithMetadata(chunk.token_count, metadata);
      
      chunksToUpdate.push({
        id: chunk.id,
        newContent: enhancedContent,
        newTokenCount
      });

      console.log(`📝 Enhanced ${chunk.section_title}: ${chunk.token_count} → ${newTokenCount} tokens`);
    }

    // Batch update chunks
    if (chunksToUpdate.length > 0) {
      await updateChunks(chunksToUpdate);
      stats.updatedChunks += chunksToUpdate.length;
      console.log(`✅ Updated ${chunksToUpdate.length} chunks for: ${doc.title}`);
    } else {
      console.log(`⏭️  No chunks needed updating for: ${doc.title}`);
      stats.skippedDocuments++;
    }

    stats.processedDocuments++;
    stats.documentTypeBreakdown[doc.doc_type] = (stats.documentTypeBreakdown[doc.doc_type] || 0) + 1;

  } catch (error) {
    console.error(`❌ Error processing document ${doc.title}:`, error);
    stats.errors++;
  }
}

/**
 * Update chunks with new content and regenerate tsvectors
 */
async function updateChunks(updates: DocumentChunkUpdate[]): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase
      .from('document_chunks')
      .update({
        content: update.newContent,
        token_count: update.newTokenCount,
        tsvector_content: supabase.rpc('to_tsvector', { 
          config: 'english', 
          text: update.newContent 
        })
      })
      .eq('id', update.id);

    if (error) {
      throw new Error(`Failed to update chunk ${update.id}: ${error.message}`);
    }
  }
}

/**
 * Main migration function
 */
export async function runMetadataMigration(dryRun: boolean = false): Promise<MigrationStats> {
  console.log(`🚀 Starting metadata migration (${dryRun ? 'DRY RUN' : 'LIVE RUN'})...`);
  
  const stats: MigrationStats = {
    totalDocuments: 0,
    processedDocuments: 0,
    updatedChunks: 0,
    skippedDocuments: 0,
    errors: 0,
    documentTypeBreakdown: {}
  };

  try {
    const documents = await getDocumentsToMigrate();
    stats.totalDocuments = documents.length;

    console.log(`📋 Migration plan:`);
    console.log(`  - Total documents: ${stats.totalDocuments}`);
    console.log(`  - Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE RUN'}`);
    console.log(`  - Processing abstract and title chunks only`);
    console.log('');

    // Process each document
    for (const doc of documents) {
      if (!dryRun) {
        await processDocument(doc, stats);
      } else {
        // In dry run, just log what would be processed
        const chunks = await getChunksToUpdate(doc.id);
        const metadata = convertToDocumentMetadata(doc);
        
        console.log(`🔍 [DRY RUN] Would process ${doc.doc_type}: ${doc.title}`);
        console.log(`    Chunks available: ${chunks.length}`);
        
        for (const chunk of chunks) {
          if (!hasMetadataInjection(chunk.content, doc.doc_type)) {
            const enhancedContent = injectMetadataIntoContent(chunk.content, metadata);
            if (enhancedContent !== chunk.content) {
              console.log(`    Would enhance: ${chunk.section_title} (${chunk.token_count} tokens)`);
            }
          }
        }
        
        stats.processedDocuments++;
      }

      // Add a small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print final statistics
    console.log('\n📊 Migration Statistics:');
    console.log(`  Total documents: ${stats.totalDocuments}`);
    console.log(`  Processed: ${stats.processedDocuments}`);
    console.log(`  Updated chunks: ${stats.updatedChunks}`);
    console.log(`  Skipped: ${stats.skippedDocuments}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log('\n📋 By document type:');
    
    Object.entries(stats.documentTypeBreakdown).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    if (dryRun) {
      console.log('\n🔍 DRY RUN COMPLETED - No changes were made');
    } else {
      console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY');
    }

    return stats;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * CLI interface for running the migration
 */
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  
  runMetadataMigration(dryRun)
    .then((stats) => {
      console.log('Migration completed with stats:', stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}