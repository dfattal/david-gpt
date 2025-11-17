/**
 * On-Demand Worker Startup Script
 * Processes all queued jobs and exits when queue is empty
 * Optimized for Upstash free tier - only uses Redis when actively processing
 * Run: tsx src/lib/queue/workers/start-worker-on-demand.ts
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

console.log('🚀 Starting on-demand worker...');

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

/**
 * Main worker loop - processes jobs until queue is empty
 */
async function runOnDemandWorker() {
  const redis = getRedisClient();
  const queue = getQueue();

  try {
    // Check if there are any jobs to process
    const jobCounts = await queue.getJobCounts('waiting', 'active', 'delayed');
    const totalJobs = jobCounts.waiting + jobCounts.active + jobCounts.delayed;

    console.log(`📊 Queue status: ${jobCounts.waiting} waiting, ${jobCounts.active} active, ${jobCounts.delayed} delayed`);

    if (totalJobs === 0) {
      console.log('✅ No jobs to process. Exiting gracefully.');
      process.exit(0);
    }

    console.log(`🔥 Found ${totalJobs} job(s) to process. Starting worker...`);

    // Create worker with optimized settings
    const worker = new Worker(queue.name, processJob, {
      connection: redis,
      concurrency: 3,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
      settings: {
        stalledInterval: 60000,
        lockDuration: 300000,
        // For on-demand mode, don't wait long when queue is empty
        drainDelay: 5,
      },
    });

    // Track completed jobs
    let completedCount = 0;
    let failedCount = 0;

    worker.on('completed', async (job) => {
      completedCount++;
      console.log(`✅ Job ${job.id} completed (${completedCount + failedCount}/${totalJobs})`);
      await checkIfDone();
    });

    worker.on('failed', async (job, err) => {
      failedCount++;
      console.error(`❌ Job ${job?.id} failed: ${err.message} (${completedCount + failedCount}/${totalJobs})`);
      await checkIfDone();
    });

    worker.on('error', (err) => {
      console.error('❌ Worker error:', err);
    });

    // Check if all jobs are done and exit
    async function checkIfDone() {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
      const remaining = counts.waiting + counts.active + counts.delayed;

      if (remaining === 0) {
        console.log(`\n✅ All jobs processed! (${completedCount} completed, ${failedCount} failed)`);
        console.log('🛑 No more jobs in queue. Shutting down...');

        await worker.close();
        process.exit(0);
      } else {
        console.log(`📊 ${remaining} job(s) remaining...`);
      }
    }

    // Graceful shutdown on SIGINT/SIGTERM
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT. Shutting down...');
      await worker.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM. Shutting down...');
      await worker.close();
      process.exit(0);
    });

    // Safety timeout - exit after 10 minutes even if jobs aren't done
    // This prevents the worker from running indefinitely if something goes wrong
    setTimeout(async () => {
      console.log('⏰ Safety timeout reached (10 minutes). Shutting down...');
      await worker.close();
      process.exit(1);
    }, 10 * 60 * 1000);

  } catch (error) {
    console.error('❌ Error starting worker:', error);
    process.exit(1);
  }
}

// Start the worker
runOnDemandWorker();
