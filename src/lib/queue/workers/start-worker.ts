/**
 * Worker Startup Script
 * Starts unified extraction job worker
 * Run: tsx src/lib/queue/workers/start-worker.ts
 */

import { Job, Worker } from 'bullmq';
import { getRedisClient } from '../redis';
import { getQueue } from '../jobQueue';
import dotenv from 'dotenv';

// Import job processors
import { processSingleMarkdown } from './markdownExtractionWorker';
import { processSingleUrl, processBatchUrl } from './urlExtractionWorker';
import { processPdfJob } from './pdfExtractionWorker';
import { processReingest } from './reingestWorker';

// Load environment variables
dotenv.config({ path: '.env.local' });

console.log('🚀 Starting unified extraction worker...');

/**
 * Unified job processor - routes jobs to appropriate handlers
 */
async function processJob(job: Job): Promise<void> {
  console.log(`🔄 Processing job ${job.id} (type: ${job.name})`);

  switch (job.name) {
    case 'markdown_single':
      await processSingleMarkdown(job, job.data.inputData);
      break;

    case 'url_single':
      await processSingleUrl(job, job.data.inputData);
      break;

    case 'url_batch':
      await processBatchUrl(job, job.data.inputData);
      break;

    case 'pdf':
      await processPdfJob(job, job.data.inputData);
      break;

    case 'reingest':
      await processReingest(job, job.data.inputData);
      break;

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }

  console.log(`✅ Worker completed job ${job.id}\n`);
}

// Create unified worker
const redis = getRedisClient();
const queue = getQueue();

const worker = new Worker(queue.name, processJob, {
  connection: redis,
  concurrency: 3, // Process 3 jobs concurrently
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
  settings: {
    // Optimize for Upstash free tier (500k commands/month)
    // Check for stalled jobs every 60 seconds instead of default 30s
    stalledInterval: 60000,
    // Lock jobs for 5 minutes (plenty of time for document processing)
    lockDuration: 300000,
    // Maximum wait time when checking for jobs (reduces polling frequency)
    // This means worker will wait up to 30 seconds before checking again
    drainDelay: 30,
  },
});

// Handle worker errors
worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

worker.on('completed', (job) => {
  console.log(`✅ Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Worker failed job ${job?.id}:`, err.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down worker...');
  await worker.close();
  console.log('✅ Worker closed gracefully');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down worker...');
  await worker.close();
  console.log('✅ Worker closed gracefully');
  process.exit(0);
});

console.log('✅ Unified worker started (concurrency: 3)');
console.log('   Supports: markdown_single, url_single, url_batch, pdf, reingest');
console.log('Press Ctrl+C to stop');

// Keep process alive - worker runs indefinitely until SIGTERM/SIGINT
// Use setInterval instead of stdin.resume() for better compatibility
setInterval(() => {
  // Heartbeat every 30 seconds
  console.log(`💓 Worker alive - waiting for jobs...`);
}, 30000);
