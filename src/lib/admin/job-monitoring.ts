import { createClient } from '@/lib/supabase/server'

export interface ProcessingJob {
  id: string
  doc_id: string
  document_title: string
  job_type: 'chunking' | 'embedding' | 'entity_extraction' | 'full_processing'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  priority: 'low' | 'normal' | 'high'
  created_at: string
  started_at?: string
  completed_at?: string
  progress_percentage: number
  error_message?: string
  estimated_completion?: string
  processing_metadata?: {
    chunks_total?: number
    chunks_processed?: number
    embeddings_generated?: number
    entities_extracted?: number
    processing_time_ms?: number
    retry_count?: number
  }
}

export interface JobStats {
  total_jobs: number
  pending_jobs: number
  processing_jobs: number
  completed_jobs: number
  failed_jobs: number
  avg_processing_time: string
  success_rate: number
  jobs_last_hour: number
  jobs_last_24h: number
}

export async function getProcessingJobs(
  limit = 50,
  status?: string,
  jobType?: string
): Promise<{ jobs: ProcessingJob[], stats: JobStats }> {
  const supabase = await createClient()

  try {
    // Build query for jobs
    let jobQuery = supabase
      .from('rag_ingest_jobs')
      .select(`
        id,
        doc_id,
        job_type,
        status,
        priority,
        created_at,
        started_at,
        completed_at,
        progress_percentage,
        error_message,
        estimated_completion,
        processing_metadata,
        rag_documents!inner(
          title
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Apply filters
    if (status) {
      jobQuery = jobQuery.eq('status', status)
    }
    
    if (jobType) {
      jobQuery = jobQuery.eq('job_type', jobType)
    }

    const { data: jobsData, error: jobsError } = await jobQuery

    if (jobsError) {
      console.error('Failed to fetch processing jobs:', jobsError)
      throw new Error('Failed to fetch processing jobs')
    }

    // Get statistics
    const { data: statsData, error: statsError } = await supabase
      .from('rag_ingest_jobs')
      .select('status, created_at, completed_at, started_at')

    if (statsError) {
      console.error('Failed to fetch job statistics:', statsError)
      throw new Error('Failed to fetch job statistics')
    }

    // Calculate stats
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const stats: JobStats = {
      total_jobs: statsData.length,
      pending_jobs: statsData.filter(j => j.status === 'pending').length,
      processing_jobs: statsData.filter(j => j.status === 'processing').length,
      completed_jobs: statsData.filter(j => j.status === 'completed').length,
      failed_jobs: statsData.filter(j => j.status === 'failed').length,
      jobs_last_hour: statsData.filter(j => new Date(j.created_at) > oneHourAgo).length,
      jobs_last_24h: statsData.filter(j => new Date(j.created_at) > oneDayAgo).length,
      success_rate: statsData.length > 0 
        ? (statsData.filter(j => j.status === 'completed').length / statsData.length) * 100 
        : 0,
      avg_processing_time: calculateAverageProcessingTime(statsData)
    }

    // Transform jobs data
    const jobs: ProcessingJob[] = jobsData.map(job => ({
      id: job.id,
      doc_id: job.doc_id,
      document_title: (job.rag_documents as any)?.[0]?.title || 'Unknown Document',
      job_type: job.job_type,
      status: job.status,
      priority: job.priority,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      progress_percentage: job.progress_percentage || 0,
      error_message: job.error_message,
      estimated_completion: job.estimated_completion,
      processing_metadata: job.processing_metadata
    }))

    return { jobs, stats }

  } catch (error) {
    console.error('Job monitoring error:', error)
    throw error
  }
}

export async function cancelProcessingJob(jobId: string): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('rag_ingest_jobs')
      .update({ 
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .eq('status', 'pending') // Only cancel pending jobs

    if (error) {
      console.error('Failed to cancel job:', error)
      return false
    }

    return true

  } catch (error) {
    console.error('Job cancellation error:', error)
    return false
  }
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('rag_ingest_jobs')
      .update({ 
        status: 'pending',
        error_message: null,
        started_at: null,
        completed_at: null,
        progress_percentage: 0
      })
      .eq('id', jobId)
      .eq('status', 'failed')

    if (error) {
      console.error('Failed to retry job:', error)
      return false
    }

    return true

  } catch (error) {
    console.error('Job retry error:', error)
    return false
  }
}

export async function getJobDetails(jobId: string): Promise<ProcessingJob | null> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('rag_ingest_jobs')
      .select(`
        id,
        doc_id,
        job_type,
        status,
        priority,
        created_at,
        started_at,
        completed_at,
        progress_percentage,
        error_message,
        estimated_completion,
        processing_metadata,
        rag_documents!inner(
          title,
          source_type,
          source_uri
        )
      `)
      .eq('id', jobId)
      .single()

    if (error) {
      console.error('Failed to fetch job details:', error)
      return null
    }

    return {
      id: data.id,
      doc_id: data.doc_id,
      document_title: (data.rag_documents as any)?.[0]?.title || 'Unknown Document',
      job_type: data.job_type,
      status: data.status,
      priority: data.priority,
      created_at: data.created_at,
      started_at: data.started_at,
      completed_at: data.completed_at,
      progress_percentage: data.progress_percentage || 0,
      error_message: data.error_message,
      estimated_completion: data.estimated_completion,
      processing_metadata: data.processing_metadata
    }

  } catch (error) {
    console.error('Job details fetch error:', error)
    return null
  }
}

function calculateAverageProcessingTime(jobs: any[]): string {
  const completedJobs = jobs.filter(j => 
    j.status === 'completed' && 
    j.started_at && 
    j.completed_at
  )

  if (completedJobs.length === 0) return '0s'

  const totalMs = completedJobs.reduce((sum, job) => {
    const start = new Date(job.started_at).getTime()
    const end = new Date(job.completed_at).getTime()
    return sum + (end - start)
  }, 0)

  const avgMs = totalMs / completedJobs.length

  if (avgMs < 1000) return `${Math.round(avgMs)}ms`
  if (avgMs < 60000) return `${Math.round(avgMs / 1000)}s`
  return `${Math.round(avgMs / 60000)}m`
}