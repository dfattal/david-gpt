'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface SingleDocumentProgressProps {
  jobId: string;
  batchId?: string;
  onComplete?: (results: {
    chunksCreated?: number;
    entitiesExtracted?: number;
  }) => void;
}

interface ProgressStage {
  id: 'validation' | 'processing' | 'completion';
  label: string;
  description: string;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
}

interface JobProgress {
  currentStage: string;
  overallProgress: number;
  message: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results?: {
    chunksCreated?: number;
    entitiesExtracted?: number;
    embeddingsGenerated?: number;
  };
  error?: string;
}

export function SingleDocumentProgress({
  jobId,
  batchId,
  onComplete,
}: SingleDocumentProgressProps) {
  const [progress, setProgress] = useState<JobProgress>({
    currentStage: 'validation',
    overallProgress: 0,
    message: 'Starting document processing...',
    status: 'pending',
  });

  const [startTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  // Define our simplified 3-stage model
  const stages: ProgressStage[] = [
    {
      id: 'validation',
      label: 'Validation & Upload',
      description: 'Validating markdown format and uploading to database',
      progress: Math.min(progress.overallProgress / 0.3, 1) * 100,
      status:
        progress.overallProgress <= 0.3
          ? progress.status === 'processing'
            ? 'active'
            : 'pending'
          : 'completed',
    },
    {
      id: 'processing',
      label: 'Processing',
      description: 'Chunking content, generating embeddings, and storing data',
      progress:
        progress.overallProgress > 0.3
          ? Math.min((progress.overallProgress - 0.3) / 0.5, 1) * 100
          : 0,
      status:
        progress.overallProgress <= 0.3
          ? 'pending'
          : progress.overallProgress < 0.8
            ? 'active'
            : 'completed',
    },
    {
      id: 'completion',
      label: 'Completion',
      description: 'Extracting entities, building indexes, and finalizing',
      progress:
        progress.overallProgress > 0.8
          ? Math.min((progress.overallProgress - 0.8) / 0.2, 1) * 100
          : 0,
      status:
        progress.overallProgress <= 0.8
          ? 'pending'
          : progress.status === 'completed'
            ? 'completed'
            : 'active',
    },
  ];

  useEffect(() => {
    if (!jobId) return;

    let cleanup: (() => void) | undefined;

    // Use SSE for batch documents, polling for single documents
    if (batchId) {
      console.log(
        `Setting up SSE for batch document: jobId=${jobId}, batchId=${batchId}`
      );

      const eventSource = new EventSource(
        `/api/ingestion/progress?batchId=${batchId}&jobId=${jobId}`
      );

      eventSource.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          if (
            data.type === 'document_progress' &&
            data.document.jobId === jobId
          ) {
            updateProgressFromSSE(data.document);
          } else if (data.type === 'batch_progress') {
            const ourDocument = data.batch.documents?.find(
              (doc: any) => doc.jobId === jobId
            );
            if (ourDocument) {
              updateProgressFromSSE(ourDocument);
            }
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = error => {
        console.error('SSE error for batch document:', error);
        eventSource.close();
      };

      cleanup = () => eventSource.close();
    } else {
      // Use polling for single documents with longer intervals
      const pollProgress = async () => {
        try {
          const response = await fetch(`/api/processing-jobs/${jobId}`);
          if (!response.ok) return;

          const job = await response.json();
          updateProgressFromJob(job);

          // Stop polling if job is complete or failed
          if (job.status === 'completed' || job.status === 'failed') {
            if (pollInterval) clearInterval(pollInterval);
          }
        } catch (error) {
          console.error('Error polling job progress:', error);
        }
      };

      // Initial poll
      pollProgress();

      // Poll every 3 seconds (reduced from 2s)
      const pollInterval = setInterval(pollProgress, 3000);

      cleanup = () => clearInterval(pollInterval);
    }

    return cleanup;
  }, [jobId, batchId]);

  const updateProgressFromJob = (job: any) => {
    const newProgress: JobProgress = {
      currentStage: mapJobStatusToStage(
        job.status,
        job.progress,
        job.progress_message
      ),
      overallProgress: job.progress || 0,
      message: job.progress_message || 'Processing...',
      status: job.status,
      results: job.results,
      error: job.error_message,
    };

    setProgress(newProgress);

    // Handle completion
    if (job.status === 'completed' && !isCompleted) {
      setIsCompleted(true);
      setEndTime(new Date());
      onComplete?.(job.results || {});
    }
  };

  const updateProgressFromSSE = (document: any) => {
    const newProgress: JobProgress = {
      currentStage: document.currentStage.stage,
      overallProgress: document.currentStage.progress || 0,
      message: document.currentStage.message || 'Processing...',
      status:
        document.currentStage.stage === 'completed'
          ? 'completed'
          : document.currentStage.stage === 'failed'
            ? 'failed'
            : 'processing',
      results: document.currentStage.details,
      error: document.currentStage.details?.error,
    };

    setProgress(newProgress);

    // Handle completion
    if (document.currentStage.stage === 'completed' && !isCompleted) {
      setIsCompleted(true);
      setEndTime(new Date());
      onComplete?.(document.currentStage.details || {});
    }
  };

  const mapJobStatusToStage = (
    status: string,
    progressValue?: number,
    message?: string
  ): string => {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';

    // Map based on progress thresholds
    if ((progressValue || 0) <= 0.3) return 'validation';
    if ((progressValue || 0) <= 0.8) return 'processing';
    return 'completion';
  };

  const getStatusBadge = () => {
    switch (progress.status) {
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <Spinner className="w-3 h-3 mr-1" />
            Processing
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getElapsedTime = () => {
    const end = endTime || new Date();
    const elapsed = Math.round((end.getTime() - startTime.getTime()) / 1000);

    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.round(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.round(elapsed / 3600)}h ${Math.round((elapsed % 3600) / 60)}m`;
  };

  const getEstimatedTimeRemaining = () => {
    if (progress.overallProgress <= 0 || progress.status === 'completed')
      return null;

    const elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
    const estimated =
      (elapsed / progress.overallProgress) * (1 - progress.overallProgress);

    if (estimated < 60) return `~${Math.round(estimated)}s remaining`;
    if (estimated < 3600) return `~${Math.round(estimated / 60)}m remaining`;
    return `~${Math.round(estimated / 3600)}h remaining`;
  };

  if (progress.status === 'failed') {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-red-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="font-semibold">Processing Failed</span>
            </div>
            <span className="text-sm text-red-600">
              Duration: {getElapsedTime()}
            </span>
          </div>
          <p className="text-sm bg-red-100 p-3 rounded border border-red-200">
            {progress.error || progress.message}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Document Processing
            </h3>
            {getStatusBadge()}
          </div>
          <div className="text-sm text-gray-500">
            Duration: {getElapsedTime()}
            {getEstimatedTimeRemaining() && (
              <div className="text-xs">{getEstimatedTimeRemaining()}</div>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(progress.overallProgress * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                progress.status === 'completed'
                  ? 'bg-green-500'
                  : progress.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${progress.overallProgress * 100}%` }}
            />
          </div>
        </div>

        {/* Current Status */}
        <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          {progress.status === 'processing' && (
            <Spinner className="w-5 h-5 text-blue-600" />
          )}
          <div className="flex-1">
            <div className="font-medium text-blue-800">
              Current Stage: {progress.currentStage}
            </div>
            <div className="text-sm text-blue-700">{progress.message}</div>
          </div>
        </div>

        {/* Stage Progress */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700">Stage Progress</h4>
          {stages.map((stage, index) => (
            <div key={stage.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      stage.status === 'completed'
                        ? 'bg-green-500'
                        : stage.status === 'active'
                          ? 'bg-blue-500'
                          : 'bg-gray-300'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      stage.status === 'completed'
                        ? 'text-green-700'
                        : stage.status === 'active'
                          ? 'text-blue-700'
                          : 'text-gray-500'
                    }`}
                  >
                    {stage.label}
                  </span>
                  {stage.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {stage.status === 'active' && (
                    <Spinner className="w-4 h-4 text-blue-500" />
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {Math.round(stage.progress)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 ml-4">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    stage.status === 'completed'
                      ? 'bg-green-500'
                      : stage.status === 'active'
                        ? 'bg-blue-500'
                        : 'bg-gray-300'
                  }`}
                  style={{ width: `${stage.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 ml-4">{stage.description}</p>
            </div>
          ))}
        </div>

        {/* Results Summary */}
        {progress.results && (
          <div className="p-4 bg-gray-50 rounded-lg border">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Processing Results
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {progress.results.chunksCreated && (
                <div>
                  <div className="font-medium text-gray-900">
                    {progress.results.chunksCreated}
                  </div>
                  <div className="text-gray-600">Chunks Created</div>
                </div>
              )}
              {progress.results.embeddingsGenerated && (
                <div>
                  <div className="font-medium text-gray-900">
                    {progress.results.embeddingsGenerated}
                  </div>
                  <div className="text-gray-600">Embeddings</div>
                </div>
              )}
              {progress.results.entitiesExtracted && (
                <div>
                  <div className="font-medium text-gray-900">
                    {progress.results.entitiesExtracted}
                  </div>
                  <div className="text-gray-600">Entities</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success Message */}
        {progress.status === 'completed' && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center text-green-800">
              <CheckCircle className="w-5 h-5 mr-2" />
              <span className="font-medium">
                Document processing completed successfully!
              </span>
            </div>
            <p className="text-sm text-green-700 mt-1">
              Your document is now ready for search and chat queries.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
