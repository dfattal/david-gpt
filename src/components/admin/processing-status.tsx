"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supabase } from "@/lib/supabase/client";
import { IngestionProgressVisualizer } from "./ingestion-progress-visualizer";

interface ProcessingJob {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  document_id: string | null;
  priority: number;
  progress: number;
  progress_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  config: any;
  results: any;
  created_at: string;
  document?: {
    id: string;
    title: string;
    doc_type: string;
  };
}

interface ProcessingStatusProps {
  refreshKey: number;
}

export function ProcessingStatus({ refreshKey }: ProcessingStatusProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBatchIds, setActiveBatchIds] = useState<string[]>([]);

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('processing_jobs')
        .select(`
          *,
          document:documents(id, title, doc_type)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading processing jobs:', error);
        return;
      }

      setJobs(data || []);

      // Detect active batches from jobs with batchId in config
      const batchIds = new Set<string>();
      data?.forEach(job => {
        if (job.config?.batchId &&
            (job.status === 'pending' || job.status === 'processing')) {
          batchIds.add(job.config.batchId);
        }
      });
      setActiveBatchIds(Array.from(batchIds));
    } catch (error) {
      console.error('Error loading processing jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [refreshKey]);

  // Set up real-time updates for processing jobs
  useEffect(() => {
    const channel = supabase
      .channel('processing_jobs')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'processing_jobs' 
        },
        (payload) => {
          console.log('Processing job update:', payload);
          loadJobs(); // Refresh the entire list for simplicity (includes batch detection)
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusColor = (status: ProcessingJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getProgressBarColor = (status: ProcessingJob['status']) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-600';
      case 'completed':
        return 'bg-green-600';
      case 'failed':
        return 'bg-red-600';
      default:
        return 'bg-gray-400';
    }
  };

  const formatDuration = (startTime: string, endTime?: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();
    
    if (duration < 1000) return '< 1s';
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    return `${Math.round(duration / 60000)}m`;
  };

  const retryJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('processing_jobs')
        .update({ 
          status: 'pending',
          error_message: null,
          attempts: 0
        })
        .eq('id', jobId);

      if (error) {
        console.error('Error retrying job:', error);
        return;
      }

      loadJobs();
    } catch (error) {
      console.error('Error retrying job:', error);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('processing_jobs')
        .update({ status: 'cancelled' })
        .eq('id', jobId);

      if (error) {
        console.error('Error cancelling job:', error);
        return;
      }

      loadJobs();
    } catch (error) {
      console.error('Error cancelling job:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const activeJobs = jobs.filter(job => job.status === 'pending' || job.status === 'processing');
  const completedJobs = jobs.filter(job => job.status === 'completed');
  const failedJobs = jobs.filter(job => job.status === 'failed');

  return (
    <div className="space-y-6">
      {/* Active Batch Progress */}
      {activeBatchIds.map(batchId => (
        <IngestionProgressVisualizer
          key={batchId}
          batchId={batchId}
          onComplete={() => {
            // Refresh jobs when batch completes
            loadJobs();
          }}
        />
      ))}

      {/* Active Processing Jobs */}
      {activeJobs.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Active Processing Jobs ({activeJobs.length})
          </h3>
          <div className="space-y-4">
            {activeJobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                    <span className="text-sm font-medium">
                      {job.document?.title || `Job ${job.id.slice(0, 8)}`}
                    </span>
                    <span className="text-xs text-gray-500">
                      {job.type.replace('_', ' ')}
                    </span>
                  </div>
                  {job.status === 'processing' && (
                    <Button
                      onClick={() => cancelJob(job.id)}
                      variant="outline"
                      className="text-xs px-2 py-1"
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{job.progress_message || 'Processing...'}</span>
                    <span>{Math.round(job.progress * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(job.status)}`}
                      style={{ width: `${job.progress * 100}%` }}
                    />
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  Started: {job.started_at 
                    ? `${new Date(job.started_at).toLocaleString()} (${formatDuration(job.started_at)})`
                    : 'Pending'
                  }
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Completed Jobs */}
      {completedJobs.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recently Completed ({completedJobs.slice(0, 10).length})
          </h3>
          <div className="space-y-3">
            {completedJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    ✓ {job.status}
                  </span>
                  <span className="text-sm font-medium">
                    {job.document?.title || `Job ${job.id.slice(0, 8)}`}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {job.completed_at && job.started_at && (
                    <span>Duration: {formatDuration(job.started_at, job.completed_at)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Failed Jobs */}
      {failedJobs.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Failed Jobs ({failedJobs.slice(0, 10).length})
          </h3>
          <div className="space-y-3">
            {failedJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                      ✗ {job.status}
                    </span>
                    <span className="text-sm font-medium">
                      {job.document?.title || `Job ${job.id.slice(0, 8)}`}
                    </span>
                  </div>
                  {job.error_message && (
                    <div className="text-xs text-red-600 ml-3">
                      {job.error_message}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => retryJob(job.id)}
                  variant="outline"
                  className="text-xs px-2 py-1 ml-2"
                >
                  Retry
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {jobs.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-gray-500">
            <div className="text-lg font-medium mb-2">No processing jobs found</div>
            <div className="text-sm">Upload a document to see processing status here</div>
          </div>
        </Card>
      )}
    </div>
  );
}