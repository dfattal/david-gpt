/**
 * Clean Stuck Jobs Script
 * Clears orphaned/stuck jobs from the BullMQ queue
 */

import { getQueue } from '../src/lib/queue/jobQueue';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function cleanStuckJobs() {
  console.log('🧹 Cleaning stuck jobs from queue...\n');

  try {
    const queue = getQueue();

    // Get all active jobs
    console.log('1️⃣ Checking active jobs...');
    const activeJobs = await queue.getActive();
    console.log(`   Found ${activeJobs.length} active job(s)`);

    if (activeJobs.length > 0) {
      console.log('\n   Active jobs:');
      for (const job of activeJobs) {
        const age = Date.now() - (job.timestamp || 0);
        const ageMinutes = Math.floor(age / 60000);
        console.log(`   • Job ${job.id}: ${job.name} (${ageMinutes} minutes old)`);

        // Jobs active for more than 10 minutes are likely stuck
        if (ageMinutes > 10) {
          console.log(`     ⚠️  Job appears stuck (active for ${ageMinutes} minutes)`);
          console.log(`     🗑️  Moving to failed...`);
          await job.moveToFailed({
            message: 'Job stuck in active state for too long - manually cleaned',
          }, null);
          console.log(`     ✅ Moved to failed queue`);
        }
      }
    }

    // Get all failed jobs
    console.log('\n2️⃣ Checking failed jobs...');
    const failedJobs = await queue.getFailed();
    console.log(`   Found ${failedJobs.length} failed job(s)`);

    if (failedJobs.length > 0) {
      console.log('\n   Recent failed jobs:');
      for (const job of failedJobs.slice(0, 5)) {
        console.log(`   • Job ${job.id}: ${job.name}`);
        console.log(`     Reason: ${job.failedReason || 'Unknown'}`);
      }

      console.log(`\n   💡 To retry a failed job, use: queue.retryJob(jobId)`);
      console.log(`   💡 To clear all failed jobs, use the option below`);
    }

    // Get all completed jobs
    console.log('\n3️⃣ Checking completed jobs...');
    const completedJobs = await queue.getCompleted();
    console.log(`   Found ${completedJobs.length} completed job(s)`);

    // Clean old completed/failed jobs (optional)
    console.log('\n4️⃣ Cleaning old completed jobs (older than 24 hours)...');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    await queue.clean(24 * 60 * 60 * 1000, 1000, 'completed');
    console.log('   ✅ Old completed jobs cleaned');

    console.log('\n5️⃣ Cleaning old failed jobs (older than 7 days)...');
    await queue.clean(7 * 24 * 60 * 60 * 1000, 1000, 'failed');
    console.log('   ✅ Old failed jobs cleaned');

    // Final status
    console.log('\n📊 Final queue status:');
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();

    console.log(`   Waiting:   ${waiting}`);
    console.log(`   Active:    ${active}`);
    console.log(`   Completed: ${completed}`);
    console.log(`   Failed:    ${failed}`);

    console.log('\n✅ Queue cleanup complete!');

    await queue.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanStuckJobs();
