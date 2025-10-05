/**
 * Markdown Extraction Worker
 * Processes RAW markdown extraction jobs asynchronously
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../redis';
import { updateJobStatus, publishProgress } from '../jobQueue';
import type { MarkdownSingleJobData, MarkdownBatchJobData } from '../types';
import { formatRawMarkdown } from '@/lib/rag/extraction/rawMarkdownFormatter';
import { storeExtractedDocument } from '@/lib/rag/storage/documentStorage';
import { createServiceClient } from '@/lib/supabase/service';

const QUEUE_NAME = 'extraction-queue';

/**
 * Process single markdown extraction job
 */
export async function processSingleMarkdown(
  job: Job,
  data: MarkdownSingleJobData
): Promise<void> {
  const { content, filename, personaSlug, userId } = data;
  const jobId = job.id!;

  try {
    // Update status to processing
    await updateJobStatus(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
      progress: { current: 0, total: 1, message: 'Extracting metadata...' },
    }, true);
    await publishProgress(jobId, { current: 0, total: 1, message: 'Extracting metadata...' }, 'processing');

    // Get Gemini API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Format the raw markdown
    const result = await formatRawMarkdown(
      { content, filename, personaSlug },
      geminiApiKey
    );

    if (!result.success) {
      throw new Error(result.error || 'Extraction failed');
    }

    // Update progress
    await updateJobStatus(jobId, {
      progress: { current: 0, total: 1, message: 'Storing document...' },
    }, true);
    await publishProgress(jobId, { current: 0, total: 1, message: 'Storing document...' }, 'processing');

    // Store the extracted document
    const supabase = createServiceClient();
    const storeResult = await storeExtractedDocument(supabase, userId, {
      markdown: result.markdown!,
      personaSlug,
      filename,
      extractionMetadata: {
        documentType: result.stats?.documentType || 'article',
        originalChars: result.stats?.originalChars,
        formattedChars: result.stats?.formattedChars,
      },
    });

    if (!storeResult.success) {
      throw new Error(storeResult.error || 'Failed to store document');
    }

    // Mark as completed
    await updateJobStatus(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress: { current: 1, total: 1, message: 'Extraction complete' },
      result_data: {
        success: true,
        docIds: [storeResult.docId!],
        storedDocuments: [{
          docId: storeResult.docId!,
          title: storeResult.title!,
          storagePath: storeResult.storagePath!,
        }],
        stats: {
          total: 1,
          successful: 1,
          failed: 0,
        },
      },
    }, true);
    await publishProgress(jobId, { current: 1, total: 1, message: 'Extraction complete' }, 'completed');

    console.log(`✅ Job ${jobId} completed: ${storeResult.docId}`);
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
      { current: 0, total: 1, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}

/**
 * Process batch markdown extraction job
 */
async function processBatchMarkdown(
  job: Job,
  data: MarkdownBatchJobData
): Promise<void> {
  const { files, personaSlug, userId } = data;
  const jobId = job.id!;
  const total = files.length;

  try {
    await updateJobStatus(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
      progress: { current: 0, total, message: 'Starting batch extraction...' },
    }, true);
    await publishProgress(jobId, { current: 0, total, message: 'Starting batch extraction...' }, 'processing');

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const results: Array<{ docId: string; title: string; storagePath: string }> = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const current = i + 1;

      try {
        // Update progress
        await updateJobStatus(jobId, {
          progress: { current, total, message: `Processing ${file.filename} (${current}/${total})` },
        }, true);
        await publishProgress(
          jobId,
          { current, total, message: `Processing ${file.filename} (${current}/${total})` },
          'processing'
        );

        // Format markdown
        const result = await formatRawMarkdown(
          { content: file.content, filename: file.filename, personaSlug },
          geminiApiKey
        );

        if (!result.success) {
          errors.push(`${file.filename}: ${result.error}`);
          continue;
        }

        // Store document
        const supabase = createServiceClient();
        const storeResult = await storeExtractedDocument(supabase, userId, {
          markdown: result.markdown!,
          personaSlug,
          filename: file.filename,
          extractionMetadata: {
            documentType: result.stats?.documentType || 'article',
            originalChars: result.stats?.originalChars,
            formattedChars: result.stats?.formattedChars,
          },
        });

        if (storeResult.success) {
          results.push({
            docId: storeResult.docId!,
            title: storeResult.title!,
            storagePath: storeResult.storagePath!,
          });
        } else {
          errors.push(`${file.filename}: ${storeResult.error}`);
        }

        // Rate limiting: 500ms between files
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${file.filename}: ${errorMsg}`);
      }
    }

    // Mark as completed
    const status = errors.length === files.length ? 'failed' : 'completed';
    await updateJobStatus(jobId, {
      status,
      completed_at: new Date().toISOString(),
      progress: { current: total, total, message: `Processed ${results.length}/${total} files` },
      result_data: {
        success: results.length > 0,
        docIds: results.map(r => r.docId),
        storedDocuments: results,
        stats: {
          total: files.length,
          successful: results.length,
          failed: errors.length,
        },
      },
      error: errors.length > 0 ? errors.join('; ') : undefined,
    }, true);
    await publishProgress(
      jobId,
      { current: total, total, message: `Processed ${results.length}/${total} files` },
      status
    );

    console.log(`✅ Batch job ${jobId} completed: ${results.length} successful, ${errors.length} failed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Batch job ${jobId} failed:`, errorMessage);

    await updateJobStatus(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    }, true);
    await publishProgress(
      jobId,
      { current: 0, total, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}

/**
 * Job processor function
 */
async function processJob(job: Job): Promise<void> {
  const { jobType, inputData } = job.data;

  console.log(`🔄 Processing job ${job.id} (type: ${jobType})`);

  if (jobType === 'markdown_single') {
    await processSingleMarkdown(job, inputData as MarkdownSingleJobData);
  } else if (jobType === 'markdown_batch') {
    await processBatchMarkdown(job, inputData as MarkdownBatchJobData);
  } else {
    throw new Error(`Unsupported job type: ${jobType}`);
  }
}

/**
 * Create and start the markdown extraction worker
 */
export function createMarkdownExtractionWorker(): Worker {
  const connection = getRedisClient();

  const worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: 2, // Process 2 jobs concurrently
  });

  // Worker event handlers
  worker.on('completed', (job) => {
    console.log(`✅ Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Worker failed job ${job?.id}:`, err);
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err);
  });

  console.log('✅ Markdown extraction worker started (concurrency: 2)');

  return worker;
}
