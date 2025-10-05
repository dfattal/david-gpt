/**
 * Hook for polling job status
 */

import { useState, useEffect, useCallback } from 'react';

export interface JobStatus {
  id: string;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    message: string;
  };
  resultData?: {
    success: boolean;
    docIds?: string[];
    storedDocuments?: Array<{
      docId: string;
      title: string;
      storagePath: string;
    }>;
    stats?: any;
    error?: string;
  };
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface UseJobStatusOptions {
  jobId: string | null;
  pollInterval?: number; // ms
  onComplete?: (job: JobStatus) => void;
  onError?: (error: string) => void;
}

export function useJobStatus({
  jobId,
  pollInterval = 1000,
  onComplete,
  onError,
}: UseJobStatusOptions) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobStatus = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/admin/jobs/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      const data = await response.json();
      return data as JobStatus;
    } catch (err) {
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isMounted = true;

    const pollJob = async () => {
      try {
        setIsLoading(true);
        const jobData = await fetchJobStatus(jobId);

        if (!isMounted) return;

        setJob(jobData);
        setError(null);

        // Stop polling if job is completed or failed
        if (jobData.status === 'completed') {
          clearInterval(intervalId);
          setIsLoading(false);
          onComplete?.(jobData);
        } else if (jobData.status === 'failed') {
          clearInterval(intervalId);
          setIsLoading(false);
          const errorMsg = jobData.error || 'Job failed';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        if (!isMounted) return;
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch job status';
        setError(errorMsg);
        setIsLoading(false);
        clearInterval(intervalId);
        onError?.(errorMsg);
      }
    };

    // Initial fetch
    pollJob();

    // Start polling
    intervalId = setInterval(pollJob, pollInterval);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [jobId, pollInterval, fetchJobStatus, onComplete, onError]);

  return { job, isLoading, error };
}
