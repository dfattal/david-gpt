/**
 * Hook for polling multiple job statuses simultaneously
 * Used for batch operations where multiple jobs are queued
 */

import { useState, useEffect, useCallback } from 'react';
import { JobStatus } from './useJobStatus';

interface UseBatchJobStatusOptions {
  jobIds: string[];
  pollInterval?: number; // ms
  onAllComplete?: (jobs: JobStatus[]) => void;
  onJobComplete?: (job: JobStatus) => void;
  onError?: (jobId: string, error: string) => void;
}

export function useBatchJobStatus({
  jobIds,
  pollInterval = 2000,
  onAllComplete,
  onJobComplete,
  onError,
}: UseBatchJobStatusOptions) {
  const [jobs, setJobs] = useState<Map<string, JobStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [completedJobIds, setCompletedJobIds] = useState<Set<string>>(new Set());
  const [failedJobIds, setFailedJobIds] = useState<Set<string>>(new Set());

  const fetchJobStatus = useCallback(async (jobId: string): Promise<JobStatus> => {
    const response = await fetch(`/api/admin/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch job status');
    }
    return response.json();
  }, []);

  useEffect(() => {
    if (jobIds.length === 0) {
      setJobs(new Map());
      setCompletedJobIds(new Set());
      setFailedJobIds(new Set());
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isMounted = true;
    let hasCalledOnAllComplete = false;

    const pollAllJobs = async () => {
      try {
        setIsLoading(true);

        // Fetch all job statuses in parallel
        const jobPromises = jobIds.map(jobId =>
          fetchJobStatus(jobId).catch(err => ({
            id: jobId,
            error: err.message,
            status: 'failed' as const,
          }))
        );

        const jobStatuses = await Promise.all(jobPromises);

        if (!isMounted) return;

        const newJobs = new Map<string, JobStatus>();
        const newCompleted = new Set<string>();
        const newFailed = new Set<string>();

        for (const job of jobStatuses) {
          newJobs.set(job.id, job as JobStatus);

          // Track completed jobs
          if (job.status === 'completed' && !completedJobIds.has(job.id)) {
            newCompleted.add(job.id);
            onJobComplete?.(job as JobStatus);
          }

          // Track failed jobs
          if (job.status === 'failed' && !failedJobIds.has(job.id)) {
            newFailed.add(job.id);
            onError?.(job.id, job.error || 'Job failed');
          }

          if (job.status === 'completed') {
            newCompleted.add(job.id);
          }
          if (job.status === 'failed') {
            newFailed.add(job.id);
          }
        }

        setJobs(newJobs);
        setCompletedJobIds(newCompleted);
        setFailedJobIds(newFailed);

        // Check if all jobs are done (completed or failed)
        const allDone = jobStatuses.every(
          job => job.status === 'completed' || job.status === 'failed'
        );

        if (allDone && !hasCalledOnAllComplete) {
          clearInterval(intervalId);
          setIsLoading(false);
          hasCalledOnAllComplete = true;
          onAllComplete?.(jobStatuses as JobStatus[]);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error polling batch jobs:', err);
        setIsLoading(false);
      }
    };

    // Initial fetch
    pollAllJobs();

    // Start polling
    intervalId = setInterval(pollAllJobs, pollInterval);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIds.join(','), pollInterval]);

  // Calculate overall progress
  const getOverallProgress = useCallback(() => {
    if (jobIds.length === 0) return 0;

    let totalProgress = 0;
    for (const jobId of jobIds) {
      const job = jobs.get(jobId);
      if (job?.progress && job.progress.total > 0) {
        totalProgress += (job.progress.current / job.progress.total) * 100;
      } else if (job?.status === 'completed') {
        totalProgress += 100;
      }
    }

    return Math.round(totalProgress / jobIds.length);
  }, [jobs, jobIds]);

  return {
    jobs: Array.from(jobs.values()),
    jobsMap: jobs,
    isLoading,
    completedCount: completedJobIds.size,
    failedCount: failedJobIds.size,
    totalCount: jobIds.length,
    allComplete: completedJobIds.size + failedJobIds.size === jobIds.length && jobIds.length > 0,
    overallProgress: getOverallProgress(),
  };
}
