/**
 * Paper Re-processing Migration Script
 *
 * Identifies papers with minimal chunks (URL-only content) and re-processes them
 * with proper PDF download and chunking using the enhanced document processor.
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { documentProcessor } from './document-processors';
import { createArticleChunks } from './article-chunking';
import { embeddingService } from './embeddings';
import { injectMetadataIntoContent } from './metadata-templates';
import { createHash } from 'crypto';

export interface PaperMigrationResult {
  paperId: string;
  title: string;
  originalChunks: number;
  newChunks: number;
  originalContentLength: number;
  newContentLength: number;
  success: boolean;
  error?: string;
  arxivId?: string;
  doi?: string;
  pdfProcessed?: boolean;
  grobidExtraction?: boolean;
}

export class PaperReprocessingMigration {
  private supabase = createOptimizedAdminClient();

  /**
   * Find papers that need re-processing (minimal chunks, URL-only content)
   */
  async findPapersNeedingReprocessing(): Promise<Array<{
    id: string;
    title: string;
    source_url: string;
    doc_type: string;
    chunk_count: number;
    total_content_length: number;
    avg_chunk_length: number;
  }>> {
    const { data, error } = await this.supabase.rpc('find_papers_needing_reprocessing');

    if (error) {
      console.error('Error finding papers needing reprocessing:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Re-process a single paper with enhanced PDF download
   */
  async reprocessPaper(paperId: string, sourceUrl: string, title: string): Promise<PaperMigrationResult> {
    console.log(`\n🔄 Re-processing paper: ${title}`);
    console.log(`   Paper ID: ${paperId}`);
    console.log(`   Source URL: ${sourceUrl}`);

    const result: PaperMigrationResult = {
      paperId,
      title,
      originalChunks: 0,
      newChunks: 0,
      originalContentLength: 0,
      newContentLength: 0,
      success: false
    };

    try {
      // Step 1: Get current chunks for backup and metrics
      const { data: originalChunks, error: chunksError } = await this.supabase
        .from('document_chunks')
        .select('id, content, token_count')
        .eq('document_id', paperId);

      if (chunksError) {
        throw new Error(`Failed to get original chunks: ${chunksError.message}`);
      }

      result.originalChunks = originalChunks?.length || 0;
      result.originalContentLength = originalChunks?.reduce((sum, chunk) => sum + chunk.content.length, 0) || 0;

      console.log(`📊 Original state: ${result.originalChunks} chunks, ${result.originalContentLength} chars`);

      // Step 2: Extract document identifier from URL
      let documentType: 'arxiv' | 'doi' | 'url' = 'url';
      let documentId: string = sourceUrl;

      // Check for ArXiv paper
      const arxivMatch = sourceUrl.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
      if (arxivMatch) {
        documentType = 'arxiv';
        documentId = arxivMatch[1];
        result.arxivId = documentId;
        console.log(`📋 Detected ArXiv paper: ${documentId}`);
      }

      // Check for DOI
      const doiMatch = sourceUrl.match(/doi\.org\/(.+)/);
      if (doiMatch) {
        documentType = 'doi';
        documentId = doiMatch[1];
        result.doi = documentId;
        console.log(`📋 Detected DOI paper: ${documentId}`);
      }

      // Step 3: Process document with enhanced processor
      console.log(`🔍 Processing ${documentType} document: ${documentId}`);

      const processedResult = await documentProcessor.processDocument({
        type: documentType,
        content: documentId,
        metadata: { title }
      });

      if (!processedResult) {
        throw new Error('Document processor returned null result');
      }

      result.newContentLength = processedResult.content?.length || 0;
      result.pdfProcessed = processedResult.structuredData?.pdfProcessed || false;
      result.grobidExtraction = processedResult.structuredData?.grobidExtraction || false;

      console.log(`✅ Document processed: ${result.newContentLength} chars, PDF: ${result.pdfProcessed}, GROBID: ${result.grobidExtraction}`);

      // Step 4: Check if we got substantial content improvement
      if (result.newContentLength < 1000) {
        console.log(`⚠️  Content still minimal (${result.newContentLength} chars), keeping original chunks`);
        result.success = true; // Not an error, just no improvement available
        return result;
      }

      // Step 5: Create proper chunks using article chunking
      console.log(`📄 Creating article chunks from ${result.newContentLength} characters...`);

      const chunks = createArticleChunks(
        paperId,
        processedResult.content!,
        processedResult.structuredData,
        {
          targetTokens: 900,
          maxTokens: 1200,
          minTokens: 100,
          overlapPercent: 17.5
        }
      );

      result.newChunks = chunks.length;
      console.log(`📦 Created ${result.newChunks} chunks`);

      // Step 6: Generate embeddings for new chunks
      console.log(`🧠 Generating embeddings for ${chunks.length} chunks...`);
      const embeddings = await embeddingService.generateEmbeddings(chunks.map(c => c.content));

      // Step 7: Backup original chunks before deletion
      console.log(`💾 Backing up original chunks...`);
      for (const chunk of originalChunks || []) {
        await this.supabase
          .from('chunk_backup')
          .insert({
            original_chunk_id: chunk.id,
            document_id: paperId,
            content: chunk.content,
            token_count: chunk.token_count,
            migration_timestamp: new Date().toISOString(),
            migration_reason: 'paper_reprocessing_minimal_content'
          });
      }

      // Step 8: Delete original chunks
      console.log(`🗑️  Deleting ${result.originalChunks} original chunks...`);
      const { error: deleteError } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', paperId);

      if (deleteError) {
        throw new Error(`Failed to delete original chunks: ${deleteError.message}`);
      }

      // Step 9: Insert new chunks with embeddings
      console.log(`📝 Inserting ${chunks.length} new chunks with embeddings...`);
      const chunksToInsert = chunks.map((chunk, index) => ({
        document_id: paperId,
        content: chunk.content,
        content_hash: chunk.contentHash,
        token_count: chunk.tokenCount,
        chunk_index: chunk.chunkIndex,
        section_title: chunk.sectionTitle || null,
        embedding: JSON.stringify(embeddings[index]),
        metadata: chunk.metadata || null,
        created_at: new Date().toISOString()
      }));

      const { error: insertError } = await this.supabase
        .from('document_chunks')
        .insert(chunksToInsert);

      if (insertError) {
        throw new Error(`Failed to insert new chunks: ${insertError.message}`);
      }

      // Step 10: Update document metadata
      console.log(`📋 Updating document metadata...`);
      const documentUpdate: any = {
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        file_size: processedResult.metadata.fileSize || null,
        file_hash: processedResult.metadata.fileHash || null
      };

      // Update title if we got a better one
      if (processedResult.metadata.title &&
          processedResult.metadata.title !== title &&
          processedResult.metadata.title !== 'Untitled' &&
          processedResult.metadata.title.length > title.length) {
        documentUpdate.title = processedResult.metadata.title;
        console.log(`📝 Updated title: "${processedResult.metadata.title}"`);
      }

      // Update paper-specific metadata
      if (processedResult.metadata.abstract) documentUpdate.abstract = processedResult.metadata.abstract;
      if (processedResult.metadata.doi) documentUpdate.doi = processedResult.metadata.doi;
      if (processedResult.metadata.venue) documentUpdate.venue = processedResult.metadata.venue;
      if (processedResult.metadata.year) documentUpdate.publication_year = processedResult.metadata.year;
      if (processedResult.metadata.authorsAffiliations) {
        documentUpdate.authors_affiliations = JSON.stringify(processedResult.metadata.authorsAffiliations);
      }

      const { error: updateError } = await this.supabase
        .from('documents')
        .update(documentUpdate)
        .eq('id', paperId);

      if (updateError) {
        throw new Error(`Failed to update document metadata: ${updateError.message}`);
      }

      result.success = true;
      console.log(`✅ Successfully re-processed paper: ${title}`);
      console.log(`📊 Improvement: ${result.originalChunks} → ${result.newChunks} chunks, ${result.originalContentLength} → ${result.newContentLength} chars`);

      return result;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      console.error(`❌ Failed to re-process paper "${title}":`, error);
      return result;
    }
  }

  /**
   * Run migration on all papers that need re-processing
   */
  async runMigration(dryRun: boolean = false): Promise<{
    totalPapers: number;
    processedPapers: number;
    successfulPapers: number;
    failedPapers: number;
    results: PaperMigrationResult[];
  }> {
    console.log(`🚀 Starting paper re-processing migration (${dryRun ? 'DRY RUN' : 'LIVE'})`);

    // Find papers needing reprocessing
    const papersToProcess = await this.findPapersNeedingReprocessing();
    console.log(`📋 Found ${papersToProcess.length} papers needing re-processing`);

    if (papersToProcess.length === 0) {
      console.log(`✅ No papers need re-processing`);
      return {
        totalPapers: 0,
        processedPapers: 0,
        successfulPapers: 0,
        failedPapers: 0,
        results: []
      };
    }

    // Show papers that will be processed
    console.log(`\n📄 Papers to be re-processed:`);
    papersToProcess.forEach((paper, index) => {
      console.log(`   ${index + 1}. "${paper.title}" (${paper.chunk_count} chunks, ${paper.total_content_length} chars)`);
      console.log(`      URL: ${paper.source_url}`);
    });

    if (dryRun) {
      console.log(`\n🔍 DRY RUN: Would process ${papersToProcess.length} papers`);
      return {
        totalPapers: papersToProcess.length,
        processedPapers: 0,
        successfulPapers: 0,
        failedPapers: 0,
        results: []
      };
    }

    // Process each paper
    const results: PaperMigrationResult[] = [];
    let successfulPapers = 0;
    let failedPapers = 0;

    for (const paper of papersToProcess) {
      const result = await this.reprocessPaper(paper.id, paper.source_url, paper.title);
      results.push(result);

      if (result.success) {
        successfulPapers++;
      } else {
        failedPapers++;
      }

      // Add delay between papers to avoid overwhelming external APIs
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log(`\n📊 Migration Summary:`);
    console.log(`   Total Papers: ${papersToProcess.length}`);
    console.log(`   Successful: ${successfulPapers}`);
    console.log(`   Failed: ${failedPapers}`);
    console.log(`   Success Rate: ${Math.round(successfulPapers / papersToProcess.length * 100)}%`);

    if (successfulPapers > 0) {
      const totalOriginalChunks = results.reduce((sum, r) => sum + r.originalChunks, 0);
      const totalNewChunks = results.filter(r => r.success).reduce((sum, r) => sum + r.newChunks, 0);
      const totalOriginalContent = results.reduce((sum, r) => sum + r.originalContentLength, 0);
      const totalNewContent = results.filter(r => r.success).reduce((sum, r) => sum + r.newContentLength, 0);

      console.log(`\n📈 Content Improvements:`);
      console.log(`   Chunks: ${totalOriginalChunks} → ${totalNewChunks} (${Math.round(totalNewChunks / totalOriginalChunks * 100)}% increase)`);
      console.log(`   Content: ${totalOriginalContent} → ${totalNewContent} chars (${Math.round(totalNewContent / totalOriginalContent * 100)}x increase)`);
      console.log(`   PDF Downloads: ${results.filter(r => r.pdfProcessed).length}/${successfulPapers}`);
      console.log(`   GROBID Extractions: ${results.filter(r => r.grobidExtraction).length}/${successfulPapers}`);
    }

    if (failedPapers > 0) {
      console.log(`\n❌ Failed Papers:`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   "${r.title}": ${r.error}`);
      });
    }

    return {
      totalPapers: papersToProcess.length,
      processedPapers: papersToProcess.length,
      successfulPapers,
      failedPapers,
      results
    };
  }
}

/**
 * Create backup table for original chunks (run once)
 */
export async function createChunkBackupTable(): Promise<void> {
  const supabase = createOptimizedAdminClient();

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS chunk_backup (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      original_chunk_id UUID NOT NULL,
      document_id UUID NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      migration_timestamp TIMESTAMPTZ NOT NULL,
      migration_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chunk_backup_document_id ON chunk_backup(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunk_backup_migration_timestamp ON chunk_backup(migration_timestamp);
  `;

  const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
  if (error) {
    console.error('Failed to create backup table:', error);
    throw error;
  }

  console.log('✅ Chunk backup table created successfully');
}

/**
 * Create database function to find papers needing reprocessing
 */
export async function createReprocessingFunction(): Promise<void> {
  const supabase = createOptimizedAdminClient();

  const functionSQL = `
    CREATE OR REPLACE FUNCTION find_papers_needing_reprocessing()
    RETURNS TABLE (
      id UUID,
      title TEXT,
      source_url TEXT,
      doc_type TEXT,
      chunk_count BIGINT,
      total_content_length BIGINT,
      avg_chunk_length NUMERIC
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        d.id,
        d.title,
        d.url as source_url,
        d.doc_type,
        COUNT(dc.id) as chunk_count,
        SUM(LENGTH(dc.content)) as total_content_length,
        AVG(LENGTH(dc.content)) as avg_chunk_length
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.doc_type = 'paper'
        AND d.url IS NOT NULL
        AND (d.url LIKE '%arxiv.org%' OR d.url LIKE '%doi.org%')
      GROUP BY d.id, d.title, d.url, d.doc_type
      HAVING COUNT(dc.id) <= 2 OR AVG(LENGTH(dc.content)) < 100
      ORDER BY COUNT(dc.id) ASC, AVG(LENGTH(dc.content)) ASC;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql: functionSQL });
  if (error) {
    console.error('Failed to create reprocessing function:', error);
    throw error;
  }

  console.log('✅ Reprocessing function created successfully');
}

// Export singleton instance
export const paperReprocessingMigration = new PaperReprocessingMigration();