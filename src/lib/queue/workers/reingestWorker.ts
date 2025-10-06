/**
 * Reingest Worker
 * Processes document re-ingestion jobs asynchronously
 */

import { Job } from 'bullmq';
import { updateJobStatus, publishProgress } from '../jobQueue';
import type { ReingestJobData } from '../types';
import { DatabaseIngestor } from '@/lib/rag/ingestion/databaseIngestor';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Process reingest job
 */
export async function processReingest(
  job: Job,
  data: ReingestJobData
): Promise<void> {
  const { docId, personaSlugs, userId } = data;
  const jobId = job.id!;
  const supabase = createServiceClient();

  try {
    // Update status to processing
    await updateJobStatus(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
      progress: { current: 0, total: 6, message: 'Fetching document...' },
    }, true);
    await publishProgress(jobId, { current: 0, total: 6, message: 'Fetching document...' }, 'processing');

    console.log(`📄 Re-ingesting document: ${docId}`);

    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('docs')
      .select('id, title, raw_content, personas')
      .eq('id', docId)
      .single();

    if (fetchError || !doc) {
      throw new Error('Document not found');
    }

    // Validate persona
    const documentPersona = doc.personas?.[0];
    if (!documentPersona) {
      throw new Error('Document has no associated persona');
    }

    console.log(`  ✓ Found document: ${doc.title}`);

    // Step 1: Delete existing chunks
    await updateJobStatus(jobId, {
      progress: { current: 1, total: 6, message: 'Deleting existing chunks...' },
    }, true);
    await publishProgress(jobId, { current: 1, total: 6, message: 'Deleting existing chunks...' }, 'processing');

    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('doc_id', docId);

    if (deleteError) {
      console.error('Error deleting chunks:', deleteError);
      throw new Error(`Failed to delete existing chunks: ${deleteError.message}`);
    }

    console.log(`  ✓ Deleted existing chunks`);

    // Step 2: Chunking document
    await updateJobStatus(jobId, {
      progress: { current: 2, total: 6, message: 'Chunking document...' },
    }, true);
    await publishProgress(jobId, { current: 2, total: 6, message: 'Chunking document...' }, 'processing');

    // Create ingestor with progress callbacks
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const ingestor = new DatabaseIngestor(supabase, openaiApiKey);

    // We'll track progress through the ingestor by modifying it inline
    // Since the DatabaseIngestor has console.log calls, we can report progress based on expected flow

    // Step 3: Contextual context generation
    await updateJobStatus(jobId, {
      progress: { current: 3, total: 6, message: 'Generating contextual contexts...' },
    }, true);
    await publishProgress(jobId, { current: 3, total: 6, message: 'Generating contextual contexts...' }, 'processing');

    console.log(`  🤖 Starting contextual context generation...`);

    // Step 4: Embedding generation
    await updateJobStatus(jobId, {
      progress: { current: 4, total: 6, message: 'Generating embeddings...' },
    }, true);
    await publishProgress(jobId, { current: 4, total: 6, message: 'Generating embeddings...' }, 'processing');

    console.log(`  🔢 Starting embedding generation...`);

    // Re-ingest document (this does chunking, context, embeddings, and DB insert)
    const result = await ingestor.ingestDocument(
      {
        filePath: docId,
        content: doc.raw_content,
      },
      true // overwrite
    );

    if (result.error) {
      throw new Error(result.error);
    }

    console.log(`  ✓ Chunks created: ${result.chunksCreated}`);

    // Step 5: Inserting chunks
    await updateJobStatus(jobId, {
      progress: { current: 5, total: 6, message: `Saving ${result.chunksCreated} chunks to database...` },
    }, true);
    await publishProgress(jobId, { current: 5, total: 6, message: `Saving ${result.chunksCreated} chunks to database...` }, 'processing');

    // Step 6: Update ingestion status
    await updateJobStatus(jobId, {
      progress: { current: 6, total: 6, message: 'Updating document status...' },
    }, true);
    await publishProgress(jobId, { current: 6, total: 6, message: 'Updating document status...' }, 'processing');

    await supabase
      .from('docs')
      .update({ ingestion_status: 'ingested' })
      .eq('id', docId);

    console.log(`  ✓ Updated ingestion status`);

    // Mark as completed
    await updateJobStatus(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress: { current: 6, total: 6, message: 'Ingestion complete' },
      result_data: {
        success: true,
        docIds: [docId],
        stats: {
          total: 1,
          successful: 1,
          failed: 0,
        },
      },
    }, true);
    await publishProgress(jobId, { current: 6, total: 6, message: 'Ingestion complete' }, 'completed');

    console.log(`✅ Re-ingested document ${docId}: ${result.chunksCreated} chunks created`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Job ${jobId} failed:`, errorMessage);

    await updateJobStatus(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    }, true);
    await publishProgress(
      jobId,
      { current: 0, total: 6, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}
