/**
 * Job Queue Setup
 * Manages BullMQ queue and job operations
 */

import { Queue, QueueEvents } from 'bullmq';
import { getRedisClient } from './redis';
import type { JobType, JobData, CreateJobParams } from './types';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// Queue name
const QUEUE_NAME = 'extraction-queue';

// Singleton queue instance
let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the extraction queue
 */
export function getQueue(): Queue {
  if (queue) {
    return queue;
  }

  const connection = getRedisClient();

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3, // Retry failed jobs 3 times
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2s delay, doubles each retry
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 604800, // Keep failed jobs for 7 days
        count: 5000, // Keep max 5000 failed jobs
      },
    },
  });

  console.log(`✅ Queue "${QUEUE_NAME}" initialized`);

  return queue;
}

/**
 * Get or create queue events listener
 */
export function getQueueEvents(): QueueEvents {
  if (queueEvents) {
    return queueEvents;
  }

  const connection = getRedisClient();

  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection,
  });

  console.log(`✅ QueueEvents for "${QUEUE_NAME}" initialized`);

  return queueEvents;
}

/**
 * Create a new extraction job
 */
export async function createExtractionJob(params: CreateJobParams): Promise<string> {
  const { jobType, inputData, userId } = params;

  // Create job in database first
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .insert({
      job_type: jobType,
      status: 'pending',
      input_data: inputData,
      user_id: userId,
      progress: { current: 0, total: 0, message: 'Job queued' },
    })
    .select()
    .single();

  if (error || !job) {
    throw new Error(`Failed to create job in database: ${error?.message}`);
  }

  // Add job to BullMQ queue
  const queue = getQueue();
  await queue.add(
    jobType,
    {
      jobId: job.id,
      jobType,
      inputData,
      userId,
    },
    {
      jobId: job.id, // Use database job ID as BullMQ job ID
    }
  );

  console.log(`✅ Job ${job.id} created and queued (type: ${jobType})`);

  return job.id;
}

/**
 * Update job status in database
 */
export async function updateJobStatus(
  jobId: string,
  updates: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: { current?: number; total?: number; message?: string };
    result_data?: any;
    error?: string;
    started_at?: string;
    completed_at?: string;
  },
  useServiceClient: boolean = false
): Promise<void> {
  const supabase = useServiceClient ? createServiceClient() : await createClient();

  const updateData: any = {};

  if (updates.status) updateData.status = updates.status;
  if (updates.progress) {
    // Merge with existing progress
    const { data: currentJob } = await supabase
      .from('extraction_jobs')
      .select('progress')
      .eq('id', jobId)
      .single();

    updateData.progress = {
      ...(currentJob?.progress || {}),
      ...updates.progress,
    };
  }
  if (updates.result_data) updateData.result_data = updates.result_data;
  if (updates.error !== undefined) updateData.error = updates.error;
  if (updates.started_at) updateData.started_at = updates.started_at;
  if (updates.completed_at) updateData.completed_at = updates.completed_at;

  const { error } = await supabase
    .from('extraction_jobs')
    .update(updateData)
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to update job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Publish progress update to Redis (for SSE)
 */
export async function publishProgress(
  jobId: string,
  progress: { current: number; total: number; message: string },
  status: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<void> {
  const redis = getRedisClient();

  const progressEvent = {
    jobId,
    status,
    progress,
    timestamp: new Date().toISOString(),
  };

  // Publish to Redis channel for SSE
  await redis.publish(`job:progress:${jobId}`, JSON.stringify(progressEvent));
}

/**
 * Get job status from database
 */
export async function getJobStatus(jobId: string) {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    throw new Error(`Failed to get job status: ${error.message}`);
  }

  return job;
}

/**
 * Close queue connections gracefully
 */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
    console.log('🔌 Queue closed');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
    console.log('🔌 QueueEvents closed');
  }
}
