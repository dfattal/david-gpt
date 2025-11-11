/**
 * Clean Database Jobs Script
 * Cleans up orphaned/stuck jobs from Supabase database
 */

import { createOptimizedAdminClient } from '../src/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function cleanDbJobs() {
  console.log('🧹 Cleaning orphaned jobs from database...\n');

  try {
    const supabase = createOptimizedAdminClient();

    // 1. Check for stuck jobs
    console.log('1️⃣ Checking for stuck jobs...');
    const { data: stuckJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, type, status, created_at, error')
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    console.log(`   Found ${stuckJobs?.length || 0} pending/active job(s)\n`);

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('✅ No stuck jobs found!');
      process.exit(0);
    }

    // 2. Show stuck jobs
    console.log('   Stuck jobs:');
    for (const job of stuckJobs) {
      const age = Date.now() - new Date(job.created_at).getTime();
      const ageMinutes = Math.floor(age / 60000);
      console.log(`   • Job ${job.id}:`);
      console.log(`     Type: ${job.type}`);
      console.log(`     Status: ${job.status}`);
      console.log(`     Age: ${ageMinutes} minutes`);
      if (job.error) {
        console.log(`     Error: ${job.error}`);
      }
    }

    // 3. Mark old jobs as failed
    console.log('\n2️⃣ Marking stuck jobs as failed...');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error: 'Job timed out - cleaned up after Redis migration',
        completed_at: new Date().toISOString(),
      })
      .in('status', ['pending', 'active'])
      .lt('created_at', oneHourAgo)
      .select();

    if (updateError) {
      throw new Error(`Failed to update jobs: ${updateError.message}`);
    }

    console.log(`   ✅ Marked ${updated?.length || 0} job(s) as failed`);

    // 4. Check recent jobs (created in last hour) - these might be legitimate
    const recentJobs = stuckJobs.filter(
      job => Date.now() - new Date(job.created_at).getTime() < 60 * 60 * 1000
    );

    if (recentJobs.length > 0) {
      console.log('\n3️⃣ Found recent pending jobs (< 1 hour old):');
      for (const job of recentJobs) {
        console.log(`   • Job ${job.id}: ${job.type} (${job.status})`);
      }
      console.log('   💡 These might be legitimate - not marking as failed');
      console.log('   💡 If they\'re stuck, run this script again in an hour');
    }

    // 5. Final status
    console.log('\n📊 Final job statistics:');

    const { count: pendingCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: activeCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: completedCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { count: failedCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    console.log(`   Pending:   ${pendingCount || 0}`);
    console.log(`   Active:    ${activeCount || 0}`);
    console.log(`   Completed: ${completedCount || 0}`);
    console.log(`   Failed:    ${failedCount || 0}`);

    console.log('\n✅ Database cleanup complete!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanDbJobs();
