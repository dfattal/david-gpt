import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getProcessingJobs, cancelProcessingJob, retryFailedJob } from '@/lib/admin/job-monitoring'
import { jobQueue, JobType, JobPriority, JobUtils } from '@/lib/queue/job-queue'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const status = searchParams.get('status') || undefined
    const jobType = searchParams.get('job_type') || undefined

    try {
      const { jobs, stats } = await getProcessingJobs(limit, status, jobType)
      
      // Enhanced stats with queue information
      const queueStats = jobQueue.getStats()
      const enhancedStats = {
        ...stats,
        queue: queueStats,
        throughput: queueStats.throughput,
        activeJobs: queueStats.running
      }

      await logAdminAction(adminUser.id, 'view_jobs', 'jobs', undefined, {
        filters: { status, job_type: jobType },
        results_count: jobs.length
      })

      return Response.json({
        jobs,
        stats: enhancedStats,
        filters: {
          status,
          job_type: jobType,
          limit
        },
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Failed to fetch processing jobs:', error)
      return Response.json({ 
        error: 'Failed to fetch processing jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'edit')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { action, job_id } = body

      if (!job_id) {
        return Response.json({ error: 'job_id is required' }, { status: 400 })
      }

      let success = false
      let message = ''

      switch (action) {
        case 'cancel':
          success = await cancelProcessingJob(job_id)
          // Also cancel in job queue
          const queueCancelled = jobQueue.cancel(job_id)
          success = success || queueCancelled
          message = success ? 'Job cancelled successfully' : 'Failed to cancel job'
          
          if (success) {
            await logAdminAction(adminUser.id, 'cancel_job', 'jobs', job_id)
          }
          break

        case 'retry':
          success = await retryFailedJob(job_id)
          message = success ? 'Job queued for retry' : 'Failed to retry job'
          
          if (success) {
            await logAdminAction(adminUser.id, 'retry_job', 'jobs', job_id)
          }
          break

        case 'create_processing_chain':
          if (body.document_id) {
            const supabase = await createClient()
            const jobs = JobUtils.createDocumentProcessingChain(body.document_id, adminUser.id)
            
            // Insert jobs into database
            const { data: insertedJobs, error } = await supabase
              .from('rag_ingest_jobs')
              .insert(
                jobs.map(job => ({
                  id: job.id,
                  type: job.type,
                  status: 'PENDING',
                  priority: job.priority,
                  data: job.data,
                  retry_count: 0,
                  max_retries: job.maxRetries,
                  timeout_ms: job.timeout,
                  user_id: job.userId,
                  dependencies: job.dependencies,
                  scheduled_at: job.scheduledAt
                }))
              )
              .select()

            if (!error) {
              // Add jobs to queue
              jobs.forEach(job => jobQueue.add(job))
              success = true
              message = 'Document processing chain created'
              
              await logAdminAction(adminUser.id, 'create_job_chain', 'jobs', body.document_id, {
                jobs_created: jobs.length
              })
            }
          }
          break

        default:
          return Response.json({ error: 'Invalid action' }, { status: 400 })
      }

      if (!success) {
        return Response.json({ error: message }, { status: 500 })
      }

      return Response.json({
        message,
        job_id,
        action
      })

    } catch (error) {
      console.error('Job action failed:', error)
      return Response.json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}