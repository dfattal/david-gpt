import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { IngestionWebhookManager } from '@/lib/rag/ingestion-webhook';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new NextResponse('Authentication required', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    
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
          }
        });

        // Send initial batch state
        sendInitialBatchState(batchId, controller, supabase);

        // Set up periodic batch state updates
        const interval = setInterval(async () => {
          try {
            await sendBatchStateUpdate(batchId, controller, supabase);
          } catch (error) {
            console.error('Error sending batch update:', error);
          }
        }, 2000); // Update every 2 seconds

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
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
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
    // Get batch job
    const { data: batchJob } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', `batch_job_${batchId}`)
      .single();

    if (!batchJob) {
      return;
    }

    // Get individual document jobs
    const { data: documentJobs } = await supabase
      .from('processing_jobs')
      .select(`
        *,
        document:documents(id, title, doc_type)
      `)
      .eq('config->>batchId', batchId)
      .neq('id', `batch_job_${batchId}`)
      .order('created_at');

    const batchProgress = {
      batchId,
      totalDocuments: batchJob.config?.totalDocuments || 0,
      completedDocuments: documentJobs?.filter(job => job.status === 'completed').length || 0,
      failedDocuments: documentJobs?.filter(job => job.status === 'failed').length || 0,
      inProgressDocuments: documentJobs?.filter(job => job.status === 'processing').length || 0,
      startTime: batchJob.created_at,
      endTime: batchJob.completed_at,
      documents: documentJobs?.map(job => ({
        documentId: job.document_id,
        jobId: job.id,
        title: job.document?.title || 'Unknown',
        detectedType: job.document?.doc_type || 'unknown',
        currentStage: {
          stage: mapJobStatusToStage(job.status, job.progress, job.progress_message),
          progress: job.progress || 0,
          message: job.progress_message || 'Processing...',
          timestamp: job.updated_at,
          details: job.results
        },
        stageHistory: [], // Could be enhanced to track stage history
        startTime: job.created_at,
        endTime: job.completed_at
      })) || []
    };

    const message = JSON.stringify({
      type: 'batch_progress',
      batch: batchProgress
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
    // Get updated document jobs
    const { data: documentJobs } = await supabase
      .from('processing_jobs')
      .select(`
        *,
        document:documents(id, title, doc_type)
      `)
      .eq('config->>batchId', batchId)
      .neq('id', `batch_job_${batchId}`)
      .order('created_at');

    if (!documentJobs) return;

    // Send individual document updates
    for (const job of documentJobs) {
      const documentProgress = {
        documentId: job.document_id,
        jobId: job.id,
        title: job.document?.title || 'Unknown',
        detectedType: job.document?.doc_type || 'unknown',
        currentStage: {
          stage: mapJobStatusToStage(job.status, job.progress, job.progress_message),
          progress: job.progress || 0,
          message: job.progress_message || 'Processing...',
          timestamp: job.updated_at,
          details: job.results
        },
        stageHistory: [],
        startTime: job.created_at,
        endTime: job.completed_at
      };

      const message = JSON.stringify({
        type: 'document_progress',
        document: documentProgress
      });

      controller.enqueue(`data: ${message}\n\n`);
    }
  } catch (error) {
    console.error('Error sending batch state update:', error);
  }
}

function mapJobStatusToStage(status: string, progress?: number, message?: string): string {
  switch (status) {
    case 'pending': return 'upload';
    case 'processing': 
      // Map based on progress and message for more granular tracking
      if (message?.includes('analysis') || message?.includes('analyzing')) return 'analysis';
      if (message?.includes('chunk') || message?.includes('chunking')) return 'chunking';
      if (message?.includes('embedding') || message?.includes('embed')) return 'embedding';
      if (message?.includes('entities') && message?.includes('extract')) return 'entities_extraction';
      if (message?.includes('entities') && message?.includes('consolidat')) return 'entities_consolidation';
      
      // Default mapping based on progress
      if ((progress || 0) < 0.2) return 'analysis';
      if ((progress || 0) < 0.4) return 'chunking';
      if ((progress || 0) < 0.6) return 'embedding';
      if ((progress || 0) < 0.8) return 'entities_extraction';
      if ((progress || 0) < 1.0) return 'entities_consolidation';
      
      return 'chunking'; // Default fallback
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    default: return 'upload';
  }
}