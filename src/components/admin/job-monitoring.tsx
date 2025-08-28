'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Play, 
  Square, 
  RotateCcw,
  RefreshCw,
  Activity,
  Timer,
  Zap,
  TrendingUp
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProcessingJob {
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

interface JobStats {
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

interface JobMonitoringProps {
  onNavigateToDocument?: (docId: string) => void
}

export function JobMonitoring({ onNavigateToDocument }: JobMonitoringProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([])
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const loadJobs = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('job_type', typeFilter)

      const response = await fetch(`/api/admin/jobs?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load jobs')
      }

      setJobs(data.jobs)
      setStats(data.stats)
      setError(null)
    } catch (err) {
      console.error('Failed to load jobs:', err)
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadJobs()
  }

  const handleJobAction = async (jobId: string, action: 'cancel' | 'retry') => {
    try {
      const response = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          job_id: jobId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} job`)
      }

      // Refresh the jobs list
      await loadJobs()
    } catch (err) {
      console.error(`Failed to ${action} job:`, err)
      setError(err instanceof Error ? err.message : `Failed to ${action} job`)
    }
  }

  useEffect(() => {
    loadJobs()

    // Auto-refresh every 10 seconds
    const interval = setInterval(loadJobs, 10000)
    return () => clearInterval(interval)
  }, [statusFilter, typeFilter])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'processing':
        return <Play className="h-4 w-4 text-blue-600 animate-pulse" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-200 bg-green-50 text-green-800'
      case 'failed':
        return 'border-red-200 bg-red-50 text-red-800'
      case 'cancelled':
        return 'border-gray-200 bg-gray-50 text-gray-800'
      case 'processing':
        return 'border-blue-200 bg-blue-50 text-blue-800'
      case 'pending':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800'
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50 text-red-800'
      case 'normal':
        return 'border-blue-200 bg-blue-50 text-blue-800'
      case 'low':
        return 'border-gray-200 bg-gray-50 text-gray-800'
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800'
    }
  }

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime()
    const end = endTime ? new Date(endTime).getTime() : Date.now()
    const duration = end - start
    
    if (duration < 1000) return `${duration}ms`
    if (duration < 60000) return `${Math.round(duration / 1000)}s`
    return `${Math.round(duration / 60000)}m`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Job Monitoring
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Document processing and ingestion jobs
          </p>
        </div>
        
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.pending_jobs + stats.processing_jobs}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.pending_jobs} pending, {stats.processing_jobs} processing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.success_rate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.completed_jobs} completed, {stats.failed_jobs} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Time</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avg_processing_time}</div>
              <p className="text-xs text-muted-foreground">
                Per job completion
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.jobs_last_hour}</div>
              <p className="text-xs text-muted-foreground">
                Jobs in last hour ({stats.jobs_last_24h} today)
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="chunking">Chunking</SelectItem>
            <SelectItem value="embedding">Embedding</SelectItem>
            <SelectItem value="entity_extraction">Entity Extraction</SelectItem>
            <SelectItem value="full_processing">Full Processing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Jobs</CardTitle>
          <CardDescription>
            Recent document processing and ingestion jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No jobs found matching the current filters
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(job.status)}
                        <h4 className="font-medium truncate">
                          {job.document_title}
                        </h4>
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                        <Badge className={getPriorityColor(job.priority)} variant="outline">
                          {job.priority}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Type: {job.job_type.replace('_', ' ')}</span>
                        <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                        {job.started_at && (
                          <span>Duration: {formatDuration(job.started_at, job.completed_at)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {job.status === 'pending' && (
                        <Button
                          onClick={() => handleJobAction(job.id, 'cancel')}
                          variant="outline"
                          size="sm"
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      )}
                      
                      {job.status === 'failed' && (
                        <Button
                          onClick={() => handleJobAction(job.id, 'retry')}
                          variant="outline"
                          size="sm"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}

                      {onNavigateToDocument && (
                        <Button
                          onClick={() => onNavigateToDocument(job.doc_id)}
                          variant="ghost"
                          size="sm"
                        >
                          View Doc
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(job.status === 'processing' || job.progress_percentage > 0) && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>{job.progress_percentage}%</span>
                      </div>
                      <Progress value={job.progress_percentage} className="h-2" />
                    </div>
                  )}

                  {/* Error Message */}
                  {job.error_message && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {job.error_message}
                      </p>
                    </div>
                  )}

                  {/* Processing Metadata */}
                  {job.processing_metadata && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600 dark:text-gray-400 mt-3 pt-3 border-t">
                      {job.processing_metadata.chunks_total && (
                        <div>
                          Chunks: {job.processing_metadata.chunks_processed || 0}/
                          {job.processing_metadata.chunks_total}
                        </div>
                      )}
                      {job.processing_metadata.embeddings_generated && (
                        <div>Embeddings: {job.processing_metadata.embeddings_generated}</div>
                      )}
                      {job.processing_metadata.entities_extracted && (
                        <div>Entities: {job.processing_metadata.entities_extracted}</div>
                      )}
                      {job.processing_metadata.retry_count && (
                        <div>Retries: {job.processing_metadata.retry_count}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}