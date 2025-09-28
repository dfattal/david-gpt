import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { IngestionWebhookManager } from '@/lib/rag/ingestion-webhook';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse('Authentication required', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const jobId = searchParams.get('jobId'); // Optional: for single document within batch

    if (!batchId) {
      return new NextResponse('Batch ID required', { status: 400 });
    }

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        // Register SSE connection
        const webhookManager = IngestionWebhookManager.getInstance();
        webhookManager.registerSSEConnection(user.id, {
          write: (data: string) => {
            try {
              controller.enqueue(`data: ${data}\n\n`);
            } catch (error) {
              console.error('SSE write error:', error);
            }
          },
        });

        // Send initial state (batch or single document)
        if (jobId) {
          sendInitialDocumentState(jobId, batchId, controller, supabase);
        } else {
          sendInitialBatchState(batchId, controller, supabase);
        }

        // Set up periodic state updates with longer intervals for better performance
        const interval = setInterval(async () => {
          try {
            if (jobId) {
              await sendDocumentStateUpdate(
                jobId,
                batchId,
                controller,
                supabase
              );
            } else {
              await sendBatchStateUpdate(batchId, controller, supabase);
            }
          } catch (error) {
            console.error('Error sending update:', error);
          }
        }, 5000); // Update every 5 seconds (improved from 2s)

        // Cleanup on close
        const cleanup = () => {
          clearInterval(interval);
          webhookManager.unregisterSSEConnection(user.id);
          try {
            controller.close();
          } catch (error) {
            // Stream already closed
          }
        };

        // Handle client disconnect
        req.signal.addEventListener('abort', cleanup);

        // Auto-cleanup after 30 minutes
        setTimeout(cleanup, 30 * 60 * 1000);
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

async function sendInitialBatchState(
  batchId: string,
  controller: ReadableStreamDefaultController,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  try {
    // Get batch job by batchId in config
    const { data: batchJobs } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('config->>batchId', batchId)
      .eq('type', 'document_ingest')
      .order('created_at', { ascending: false })
      .limit(1);

    const batchJob = batchJobs?.[0];

    if (!batchJob) {
      return;
    }

    // Get individual document jobs (exclude the batch job itself)
    const { data: allJobs } = await supabase
      .from('processing_jobs')
      .select(
        `
        *,
        document:documents(id, title, doc_type)
      `
      )
      .eq('config->>batchId', batchId)
      .order('created_at');

    // Filter out the batch job (it won't have a document_id)
    const documentJobs = allJobs?.filter((job: any) => job.document_id) || [];

    const batchProgress = {
      batchId,
      totalDocuments: batchJob.config?.totalDocuments || 0,
      completedDocuments:
        documentJobs?.filter((job: any) => job.status === 'completed').length ||
        0,
      failedDocuments:
        documentJobs?.filter((job: any) => job.status === 'failed').length || 0,
      inProgressDocuments:
        documentJobs?.filter((job: any) => job.status === 'processing')
          .length || 0,
      startTime: batchJob.created_at,
      endTime: batchJob.completed_at,
      documents:
        documentJobs?.map((job: any) => ({
          documentId: job.document_id,
          jobId: job.id,
          title: job.document?.title || 'Unknown',
          detectedType: job.document?.doc_type || 'unknown',
          currentStage: {
            stage: mapJobStatusToStage(
              job.status,
              job.progress,
              job.progress_message
            ),
            progress: job.progress || 0,
            message: job.progress_message || 'Processing...',
            timestamp: job.updated_at,
            details: job.results,
          },
          stageHistory: [], // Could be enhanced to track stage history
          startTime: job.created_at,
          endTime: job.completed_at,
        })) || [],
    };

    const message = JSON.stringify({
      type: 'batch_progress',
      batch: batchProgress,
    });

    controller.enqueue(`data: ${message}\n\n`);
  } catch (error) {
    console.error('Error sending initial batch state:', error);
  }
}

async function sendBatchStateUpdate(
  batchId: string,
  controller: ReadableStreamDefaultController,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  try {
    // Get updated document jobs (exclude batch job)
    const { data: allJobs } = await supabase
      .from('processing_jobs')
      .select(
        `
        *,
        document:documents(id, title, doc_type)
      `
      )
      .eq('config->>batchId', batchId)
      .order('created_at');

    // Filter out the batch job (it won't have a document_id)
    const documentJobs = allJobs?.filter((job: any) => job.document_id);

    if (!documentJobs) return;

    // Send individual document updates
    for (const job of documentJobs) {
      const documentProgress = {
        documentId: job.document_id,
        jobId: job.id,
        title: job.document?.title || 'Unknown',
        detectedType: job.document?.doc_type || 'unknown',
        currentStage: {
          stage: mapJobStatusToStage(
            job.status,
            job.progress,
            job.progress_message
          ),
          progress: job.progress || 0,
          message: job.progress_message || 'Processing...',
          timestamp: job.updated_at,
          details: job.results,
        },
        stageHistory: [],
        startTime: job.created_at,
        endTime: job.completed_at,
      };

      const message = JSON.stringify({
        type: 'document_progress',
        document: documentProgress,
      });

      controller.enqueue(`data: ${message}\n\n`);
    }
  } catch (error) {
    console.error('Error sending batch state update:', error);
  }
}

async function sendInitialDocumentState(
  jobId: string,
  batchId: string,
  controller: ReadableStreamDefaultController,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  try {
    // Get the specific document job
    const { data: job } = await supabase
      .from('processing_jobs')
      .select(
        `
        *,
        document:documents(id, title, doc_type)
      `
      )
      .eq('id', jobId)
      .single();

    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    const documentProgress = {
      documentId: job.document_id,
      jobId: job.id,
      title: job.document?.title || 'Unknown',
      detectedType: job.document?.doc_type || 'unknown',
      currentStage: {
        stage: mapJobStatusToStage(
          job.status,
          job.progress,
          job.progress_message
        ),
        progress: job.progress || 0,
        message: job.progress_message || 'Processing...',
        timestamp: job.updated_at,
        details: job.results,
      },
      stageHistory: [],
      startTime: job.created_at,
      endTime: job.completed_at,
    };

    const message = JSON.stringify({
      type: 'document_progress',
      document: documentProgress,
    });

    controller.enqueue(`data: ${message}\n\n`);
  } catch (error) {
    console.error('Error sending initial document state:', error);
  }
}

async function sendDocumentStateUpdate(
  jobId: string,
  batchId: string,
  controller: ReadableStreamDefaultController,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  try {
    // Get updated document job
    const { data: job } = await supabase
      .from('processing_jobs')
      .select(
        `
        *,
        document:documents(id, title, doc_type)
      `
      )
      .eq('id', jobId)
      .single();

    if (!job) return;

    const documentProgress = {
      documentId: job.document_id,
      jobId: job.id,
      title: job.document?.title || 'Unknown',
      detectedType: job.document?.doc_type || 'unknown',
      currentStage: {
        stage: mapJobStatusToStage(
          job.status,
          job.progress,
          job.progress_message
        ),
        progress: job.progress || 0,
        message: job.progress_message || 'Processing...',
        timestamp: job.updated_at,
        details: job.results,
      },
      stageHistory: [],
      startTime: job.created_at,
      endTime: job.completed_at,
    };

    const message = JSON.stringify({
      type: 'document_progress',
      document: documentProgress,
    });

    controller.enqueue(`data: ${message}\n\n`);
  } catch (error) {
    console.error('Error sending document state update:', error);
  }
}

function mapJobStatusToStage(
  status: string,
  progress?: number,
  message?: string
): string {
  switch (status) {
    case 'pending':
      return 'validation';
    case 'processing':
      // Simplified 3-stage mapping based on progress thresholds
      if ((progress || 0) <= 0.3) return 'validation';
      if ((progress || 0) <= 0.8) return 'processing';
      return 'completion';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'validation';
  }
}
