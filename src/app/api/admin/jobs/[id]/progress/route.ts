/**
 * Job Progress SSE API Route
 * GET /api/admin/jobs/[id]/progress
 * Returns real-time progress updates via Server-Sent Events
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/queue/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  // Verify job exists and user has access
  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .select('user_id, status')
    .eq('id', id)
    .single();

  if (error || !job) {
    return new Response('Job not found', { status: 404 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isOwner = job.user_id === user.id;

  if (!isAdmin && !isOwner) {
    return new Response('Forbidden', { status: 403 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const redis = getRedisClient();

      // Send initial status
      const { data: initialJob } = await supabase
        .from('extraction_jobs')
        .select('status, progress')
        .eq('id', id)
        .single();

      if (initialJob) {
        const event = {
          jobId: id,
          status: initialJob.status,
          progress: initialJob.progress,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        // If job is already completed or failed, close stream
        if (initialJob.status === 'completed' || initialJob.status === 'failed') {
          controller.close();
          return;
        }
      }

      // Subscribe to Redis pub/sub for progress updates
      const subscriber = redis.duplicate();
      await subscriber.connect();

      const channel = `job:progress:${id}`;

      await subscriber.subscribe(channel, (message) => {
        try {
          const progressEvent = JSON.parse(message);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressEvent)}\n\n`));

          // Close stream if job is completed or failed
          if (progressEvent.status === 'completed' || progressEvent.status === 'failed') {
            subscriber.unsubscribe(channel);
            subscriber.quit();
            controller.close();
          }
        } catch (error) {
          console.error('Error processing progress event:', error);
        }
      });

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        subscriber.unsubscribe(channel);
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
