/**
 * PDF Extraction Worker
 * Processes PDF extraction jobs
 */

import { Job, Worker } from 'bullmq';
import { getRedisClient } from '../redis';
import { getQueue, updateJobStatus, publishProgress } from '../jobQueue';
import { createServiceClient } from '@/lib/supabase/service';
import { PdfJobData } from '../types';
import { processPdfDocument } from '@/lib/rag/extraction/pdfPipeline';
import { storeExtractedDocument } from '@/lib/rag/storage/documentStorage';

/**
 * Process a PDF extraction job
 */
export async function processPdfJob(job: Job, data: PdfJobData): Promise<void> {
  const { pdfBase64, filename, personaSlugs, userId, docType } = data;
  const jobId = job.id!;

  try {
    await updateJobStatus(
      jobId,
      {
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 1, message: 'Processing PDF...' },
      },
      true // use service client
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: 'Processing PDF...' },
      'processing'
    );

    // Get API keys
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }
    const exaApiKey = process.env.EXA_API_KEY;

    console.log(`\n📄 Processing PDF: ${filename}`);

    // Convert base64 back to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    await updateJobStatus(
      jobId,
      {
        progress: { current: 0, total: 1, message: 'Extracting content...' },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: 'Extracting content...' },
      'processing'
    );

    // Process PDF through the pipeline
    const result = await processPdfDocument(
      pdfBuffer,
      personaSlugs,
      geminiApiKey,
      docType as any,
      exaApiKey
    );

    if (!result.success) {
      throw new Error(result.error || 'PDF extraction failed');
    }

    console.log(`   ✓ Extracted: ${result.stats?.totalPages} pages, ${result.stats?.totalChunks} chunks`);
    console.log(`   ✓ Content: ${result.stats?.formattedChars} chars (${result.stats?.retentionRatio.toFixed(1)}% retention)`);

    await updateJobStatus(
      jobId,
      {
        progress: { current: 0, total: 1, message: 'Storing document...' },
      },
      true
    );

    // Store document
    const supabase = createServiceClient();
    const storeResult = await storeExtractedDocument(supabase, userId, {
      markdown: result.markdown!,
      personaSlugs,
      filename: filename.replace('.pdf', '.md'),
      extractionMetadata: {
        documentType: 'pdf',
        totalPages: result.stats?.totalPages,
        totalChunks: result.stats?.totalChunks,
        originalChars: result.stats?.originalChars,
        formattedChars: result.stats?.formattedChars,
        retentionRatio: result.stats?.retentionRatio,
      },
    });

    if (!storeResult.success) {
      throw new Error(storeResult.error || 'Failed to store document');
    }

    console.log(`✅ Stored extracted document: ${storeResult.docId} (status: ${storeResult.status})`);

    await updateJobStatus(
      jobId,
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: 1, total: 1, message: 'Extraction complete' },
        result_data: {
          success: true,
          docIds: [storeResult.docId!],
          storedDocuments: [
            {
              docId: storeResult.docId!,
              title: storeResult.title || filename,
              storagePath: storeResult.storagePath || '',
            },
          ],
          stats: {
            total: 1,
            successful: 1,
            failed: 0,
          },
        },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 1, total: 1, message: 'Extraction complete' },
      'completed'
    );

    console.log(`✅ Job ${jobId} completed: ${storeResult.docId}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Job ${jobId} failed:`, errorMessage);

    await updateJobStatus(
      jobId,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMessage,
        result_data: {
          success: false,
          error: errorMessage,
        },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}

/**
 * Main job processor
 */
async function processJob(job: Job): Promise<void> {
  console.log(`🔄 Processing job ${job.id} (type: ${job.name})`);

  if (job.name === 'pdf') {
    await processPdfJob(job, job.data as PdfJobData);
  } else {
    throw new Error(`Unknown job type: ${job.name}`);
  }

  console.log(`✅ Worker completed job ${job.id}\n`);
}

/**
 * Create and configure PDF extraction worker
 */
export function createPdfExtractionWorker(): Worker {
  const redis = getRedisClient();
  const queue = getQueue();

  const worker = new Worker(queue.name, processJob, {
    connection: redis,
    concurrency: 1, // Process 1 PDF at a time (PDFs can be large)
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  });

  worker.on('completed', (job) => {
    console.log(`✅ PDF extraction worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ PDF extraction worker failed job ${job?.id}:`, err.message);
  });

  console.log('✅ PDF extraction worker started (concurrency: 1)');

  return worker;
}
