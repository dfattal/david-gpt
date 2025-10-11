/**
 * Hook for polling active extraction/ingestion jobs
 * Used by DocumentList to show real-time progress
 */

import { useState, useEffect, useCallback } from 'react';

export interface ActiveJob {
  id: string;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    message: string;
  };
  docId?: string; // Document ID if available (from result_data or input_data)
  createdAt: string;
  error?: string;
}

interface UseActiveJobsOptions {
  pollInterval?: number; // ms, default 2000
  onJobComplete?: (job: ActiveJob) => void; // Callback when a job completes
  enabled?: boolean; // Whether to enable polling
}

export function useActiveJobs({
  pollInterval = 2000,
  onJobComplete,
  enabled = true,
}: UseActiveJobsOptions = {}) {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/jobs/active');
      if (!response.ok) {
        throw new Error('Failed to fetch active jobs');
      }
      const data = await response.json();
      return data.jobs as ActiveJob[];
    } catch (err) {
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setJobs([]);
      setError(null);
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isMounted = true;
    const previousJobIdsRef = { current: new Set<string>() };
    const previousJobsRef = { current: [] as ActiveJob[] };

    const pollJobs = async () => {
      try {
        setIsLoading(true);
        const activeJobs = await fetchActiveJobs();

        if (!isMounted) return;

        // Detect completed jobs (jobs that were active but are now gone)
        const currentJobIds = new Set(activeJobs.map((j) => j.id));
        const completedJobIds = Array.from(previousJobIdsRef.current).filter(
          (id) => !currentJobIds.has(id)
        );

        // If jobs were removed, they likely completed - trigger callback
        if (completedJobIds.length > 0 && onJobComplete) {
          // Call onJobComplete for each completed job
          completedJobIds.forEach((jobId) => {
            const completedJob = previousJobsRef.current.find((j) => j.id === jobId);
            if (completedJob) {
              onJobComplete(completedJob);
            }
          });
        }

        setJobs(activeJobs);
        setError(null);
        previousJobIdsRef.current = currentJobIds;
        previousJobsRef.current = activeJobs;
      } catch (err) {
        if (!isMounted) return;
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to fetch active jobs';
        setError(errorMsg);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    pollJobs();

    // Start polling
    intervalId = setInterval(pollJobs, pollInterval);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, fetchActiveJobs, onJobComplete]);

  // Helper to get job status for a specific document
  const getJobForDocument = useCallback(
    (docId: string): ActiveJob | undefined => {
      return jobs.find((job) => job.docId === docId);
    },
    [jobs]
  );

  return {
    jobs,
    isLoading,
    error,
    getJobForDocument,
    hasActiveJobs: jobs.length > 0,
  };
}
