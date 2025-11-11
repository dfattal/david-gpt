/**
 * Worker Health Check Script
 * Verifies the worker service is running and processing jobs
 */

import { getQueue } from '../src/lib/queue/jobQueue';
import { getRedisClient } from '../src/lib/queue/redis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkWorkerHealth() {
  console.log('🔍 Checking Railway Worker Health...\n');

  try {
    // 1. Check Redis connection
    console.log('1️⃣ Testing Redis connection...');
    const redis = getRedisClient();

    try {
      await redis.ping();
      console.log('   ✅ Redis connection successful');
      console.log(`   📍 Redis URL: ${process.env.REDIS_URL?.split('@')[1] || 'unknown'}`);
    } catch (error) {
      console.log('   ❌ Redis connection failed:', error);
      process.exit(1);
    }

    // 2. Check BullMQ queue
    console.log('\n2️⃣ Checking BullMQ queue status...');
    const queue = getQueue();

    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();

    console.log(`   📊 Queue Statistics:`);
    console.log(`      Waiting:   ${waiting}`);
    console.log(`      Active:    ${active}`);
    console.log(`      Completed: ${completed}`);
    console.log(`      Failed:    ${failed}`);

    // 3. Check for active workers
    console.log('\n3️⃣ Checking for active workers...');
    const workers = await queue.getWorkers();

    if (workers.length > 0) {
      console.log(`   ✅ Found ${workers.length} active worker(s)`);
      workers.forEach((worker, index) => {
        console.log(`      Worker ${index + 1}: ${worker.id || 'unknown'}`);
      });
    } else {
      console.log('   ⚠️  No active workers detected');
      console.log('   💡 Worker service may not be running or may be between jobs');
    }

    // 4. Check recent jobs
    console.log('\n4️⃣ Checking recent job activity...');
    const recentCompleted = await queue.getCompleted(0, 4);
    const recentFailed = await queue.getFailed(0, 4);

    if (recentCompleted.length > 0) {
      console.log(`   ✅ Recent completed jobs (last ${recentCompleted.length}):`);
      recentCompleted.forEach((job) => {
        const timestamp = new Date(job.finishedOn || 0).toLocaleString();
        console.log(`      • ${job.name} (ID: ${job.id}) - ${timestamp}`);
      });
    } else {
      console.log('   📭 No recently completed jobs');
    }

    if (recentFailed.length > 0) {
      console.log(`\n   ⚠️  Recent failed jobs (last ${recentFailed.length}):`);
      recentFailed.forEach((job) => {
        const timestamp = new Date(job.finishedOn || 0).toLocaleString();
        const error = job.failedReason || 'Unknown error';
        console.log(`      • ${job.name} (ID: ${job.id}) - ${timestamp}`);
        console.log(`        Error: ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
      });
    }

    // 5. Test job submission (optional - commented out by default)
    // Uncomment to test if worker can process jobs
    /*
    console.log('\n5️⃣ Testing job submission (dry run)...');
    const testJob = await queue.add('test', { test: true }, {
      attempts: 1,
      removeOnComplete: true,
    });
    console.log(`   ✅ Test job created: ${testJob.id}`);
    */

    console.log('\n✅ Worker health check complete!');

    // Summary
    console.log('\n📋 Summary:');
    if (workers.length > 0) {
      console.log('   ✅ Worker service is RUNNING');
    } else if (completed > 0 || recentCompleted.length > 0) {
      console.log('   ✅ Worker service appears to be working (has processed jobs)');
      console.log('   ℹ️  Worker may be idle (no jobs to process)');
    } else {
      console.log('   ⚠️  Worker status unclear - no active workers or recent jobs');
      console.log('   💡 Check Railway dashboard to verify service is deployed');
    }

    await queue.close();
    await redis.quit();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Health check failed:', error);
    process.exit(1);
  }
}

// Run the health check
checkWorkerHealth();
