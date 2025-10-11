/**
 * Test Redis Connection and Job Queue
 * Tests that Redis is properly configured and jobs can be queued
 */

import dotenv from 'dotenv';
import { getRedisClient } from '../src/lib/queue/redis';
import { getQueue } from '../src/lib/queue/jobQueue';

dotenv.config({ path: '.env.local' });

async function testRedisConnection() {
  console.log('🧪 Testing Redis Connection...\n');

  try {
    // Test 1: Basic Redis connection
    console.log('📡 Test 1: Connecting to Redis...');
    const redis = getRedisClient();

    await redis.ping();
    console.log('✅ Redis connection successful!');
    console.log(`   Connected to: ${process.env.REDIS_URL}\n`);

    // Test 2: Queue connection
    console.log('📋 Test 2: Testing BullMQ Queue...');
    const queue = getQueue();
    console.log(`✅ Queue initialized: ${queue.name}\n`);

    // Test 3: Queue a test job
    console.log('🎯 Test 3: Creating a test job...');
    const testJob = await queue.add('test-job', {
      inputData: {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'This is a test job to verify queue functionality'
      }
    });

    console.log(`✅ Test job created with ID: ${testJob.id}`);
    console.log(`   Job name: ${testJob.name}`);
    console.log(`   Job data:`, testJob.data);
    console.log('');

    // Test 4: Check job status
    console.log('📊 Test 4: Checking job status...');
    const jobState = await testJob.getState();
    console.log(`✅ Job state: ${jobState}`);
    console.log('');

    // Test 5: Get job counts
    console.log('📈 Test 5: Queue statistics...');
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
    console.log('✅ Queue counts:');
    console.log(`   Waiting: ${counts.waiting}`);
    console.log(`   Active: ${counts.active}`);
    console.log(`   Completed: ${counts.completed}`);
    console.log(`   Failed: ${counts.failed}`);
    console.log('');

    // Clean up test job
    console.log('🧹 Cleaning up test job...');
    await testJob.remove();
    console.log('✅ Test job removed\n');

    console.log('🎉 All tests passed! Redis and Queue are working correctly.\n');
    console.log('Next steps:');
    console.log('  1. Make sure your Railway worker service is deployed and running');
    console.log('  2. Check Railway logs to see if the worker connected to Redis');
    console.log('  3. Try creating a real job from your app to test end-to-end\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\nTroubleshooting:');
    console.error('  1. Check that REDIS_URL is set in .env.local');
    console.error('  2. Verify Redis is running and accessible');
    console.error('  3. If using Railway Redis, ensure the URL is correct');
    console.error('  4. Check network/firewall settings\n');
    process.exit(1);
  }
}

testRedisConnection();
