'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface IngestionStage {
  stage: 'validation' | 'processing' | 'completion' | 'completed' | 'failed';
  progress: number;
  message: string;
  timestamp?: string;
  details?: {
    chunksCreated?: number;
    embeddingsGenerated?: number;
    entitiesExtracted?: number;
    entitiesConsolidated?: number;
    timeElapsed?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}

interface DocumentProgress {
  documentId: string;
  jobId: string;
  title: string;
  detectedType: string;
  currentStage: IngestionStage;
  stageHistory: IngestionStage[];
  startTime: string;
  endTime?: string;
}

interface BatchProgress {
  batchId: string;
  totalDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  inProgressDocuments: number;
  documents: DocumentProgress[];
  startTime: string;
  endTime?: string;
}

interface IngestionProgressVisualizerProps {
  batchId?: string;
  onComplete?: (results: { results?: { chunksCreated?: number } }) => void;
}

export function IngestionProgressVisualizer({
  batchId,
  onComplete,
}: IngestionProgressVisualizerProps) {
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(
    null
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);

  // Track completion state to avoid calling onComplete multiple times
  const [isCompleted, setIsCompleted] = useState(false);

  // Use useEffect to call onComplete after render cycle completes
  useEffect(() => {
    if (batchProgress && !isCompleted && batchProgress.endTime) {
      const completed = batchProgress.completedDocuments;
      const failed = batchProgress.failedDocuments;
      const total = batchProgress.totalDocuments;

      if (completed + failed === total) {
        setIsCompleted(true);
        // Defer the callback to avoid setState during render
        setTimeout(() => {
          onComplete?.(batchProgress);
        }, 0);
      }
    }
  }, [batchProgress, isCompleted, onComplete]);

  const updateDocumentProgress = useCallback(
    (documentUpdate: DocumentProgress) => {
      setBatchProgress(prev => {
        if (!prev) return null;

        const updatedDocuments = prev.documents.map(doc =>
          doc.documentId === documentUpdate.documentId ? documentUpdate : doc
        );

        // Recalculate batch stats
        const completed = updatedDocuments.filter(
          doc => doc.currentStage.stage === 'completed'
        ).length;
        const failed = updatedDocuments.filter(
          doc => doc.currentStage.stage === 'failed'
        ).length;
        const inProgress = updatedDocuments.filter(
          doc => !['completed', 'failed'].includes(doc.currentStage.stage)
        ).length;

        const updatedBatch = {
          ...prev,
          completedDocuments: completed,
          failedDocuments: failed,
          inProgressDocuments: inProgress,
          documents: updatedDocuments,
        };

        // Set endTime when batch is complete, but don't call onComplete here
        if (completed + failed === prev.totalDocuments && !prev.endTime) {
          updatedBatch.endTime = new Date().toISOString();
        }

        return updatedBatch;
      });
    },
    [onComplete]
  );

  useEffect(() => {
    if (!batchId) return;

    // Set up SSE connection for real-time updates
    const eventSource = new EventSource(
      `/api/ingestion/progress?batchId=${batchId}`
    );

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'batch_progress') {
          setBatchProgress(data.batch);
        } else if (data.type === 'document_progress') {
          updateDocumentProgress(data.document);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = error => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [batchId, updateDocumentProgress]);

  const getStageColor = (
    stage: IngestionStage['stage'],
    isActive: boolean = false
  ) => {
    const baseColors = {
      validation: 'bg-blue-200 text-blue-800',
      processing: 'bg-indigo-200 text-indigo-800',
      completion: 'bg-purple-200 text-purple-800',
      completed: 'bg-green-200 text-green-800',
      failed: 'bg-red-200 text-red-800',
    };

    const activeColors = {
      validation: 'bg-blue-500 text-white',
      processing: 'bg-indigo-500 text-white',
      completion: 'bg-purple-500 text-white',
      completed: 'bg-green-500 text-white',
      failed: 'bg-red-500 text-white',
    };

    return isActive ? activeColors[stage] : baseColors[stage];
  };

  const getStageIcon = (
    stage: IngestionStage['stage'],
    isActive: boolean = false
  ) => {
    if (isActive && !['completed', 'failed'].includes(stage)) {
      return <Spinner className="w-4 h-4" />;
    }

    const icons = {
      validation: '📋',
      processing: '⚙️',
      completion: '🔗',
      completed: '✅',
      failed: '❌',
    };

    return <span className="text-lg">{icons[stage]}</span>;
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();

    if (duration < 1000) return '< 1s';
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    if (duration < 3600000)
      return `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
    return `${Math.round(duration / 3600000)}h ${Math.round((duration % 3600000) / 60000)}m`;
  };

  const renderStageProgress = (document: DocumentProgress) => {
    const stages: IngestionStage['stage'][] = [
      'validation',
      'processing',
      'completion',
    ];
    const currentStageIndex = getStageIndex(document.currentStage.stage);

    return (
      <div className="flex items-center space-x-4">
        {stages.map((stage, index) => {
          const isCompleted =
            index < currentStageIndex ||
            document.currentStage.stage === 'completed';
          const isActive =
            index === currentStageIndex &&
            document.currentStage.stage !== 'completed' &&
            document.currentStage.stage !== 'failed';
          const isFailed = document.currentStage.stage === 'failed';

          return (
            <div key={stage} className="flex items-center">
              <div
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300
                  ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? getStageColor(stage, true)
                        : isFailed
                          ? 'bg-red-200 text-red-600'
                          : 'bg-gray-200 text-gray-400'
                  }
                `}
                title={getStageName(stage)}
              >
                {isCompleted ? '✓' : getStageIcon(stage, isActive)}
              </div>

              {index < stages.length - 1 && (
                <div
                  className={`
                    w-12 h-1 transition-all duration-300
                    ${
                      isCompleted
                        ? 'bg-green-500'
                        : isFailed
                          ? 'bg-red-300'
                          : 'bg-gray-200'
                    }
                  `}
                />
              )}
            </div>
          );
        })}

        {/* Final status indicator */}
        <div className="flex items-center">
          <div className="w-12 h-1 bg-gray-200" />
          <div
            className={`
              flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300
              ${
                document.currentStage.stage === 'completed'
                  ? 'bg-green-500 text-white border-green-500'
                  : document.currentStage.stage === 'failed'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white border-gray-300 text-gray-400'
              }
            `}
          >
            {document.currentStage.stage === 'completed'
              ? '🎉'
              : document.currentStage.stage === 'failed'
                ? '❌'
                : '⏳'}
          </div>
        </div>
      </div>
    );
  };

  const getStageIndex = (stage: string): number => {
    const stageMap = {
      validation: 0,
      processing: 1,
      completion: 2,
      completed: 3,
      failed: -1,
    };
    return stageMap[stage as keyof typeof stageMap] ?? 0;
  };

  const getStageName = (stage: string): string => {
    const nameMap = {
      validation: 'Validation & Upload',
      processing: 'Processing',
      completion: 'Completion',
      completed: 'Completed',
      failed: 'Failed',
    };
    return nameMap[stage as keyof typeof nameMap] ?? stage;
  };

  const renderDocumentDetails = (document: DocumentProgress) => {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Document Info</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Type:{' '}
                <span className="font-medium">{document.detectedType}</span>
              </div>
              <div>
                Duration:{' '}
                <span className="font-medium">
                  {formatDuration(document.startTime, document.endTime)}
                </span>
              </div>
              <div>
                Job ID:{' '}
                <span className="font-mono text-xs">
                  {document.jobId.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Progress Details</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Stage:{' '}
                <span className="font-medium">
                  {getStageName(document.currentStage.stage)}
                </span>
              </div>
              <div>
                Progress:{' '}
                <span className="font-medium">
                  {Math.round(document.currentStage.progress * 100)}%
                </span>
              </div>
              {document.currentStage.details?.chunksCreated && (
                <div>
                  Chunks:{' '}
                  <span className="font-medium">
                    {document.currentStage.details.chunksCreated}
                  </span>
                </div>
              )}
              {document.currentStage.details?.embeddingsGenerated && (
                <div>
                  Embeddings:{' '}
                  <span className="font-medium">
                    {document.currentStage.details.embeddingsGenerated}
                  </span>
                </div>
              )}
              {document.currentStage.details?.entitiesExtracted && (
                <div>
                  Entities:{' '}
                  <span className="font-medium">
                    {document.currentStage.details.entitiesExtracted}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-medium text-gray-900 mb-2">Current Status</h4>
          <div className="text-sm text-gray-700 bg-white p-3 rounded border">
            {document.currentStage.message}
          </div>

          {document.currentStage.details?.error && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
              <strong>Error:</strong> {document.currentStage.details.error}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!batchProgress) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Spinner className="w-6 h-6 mr-2" />
          <span>Initializing batch processing...</span>
        </div>
      </Card>
    );
  }

  const overallProgress =
    batchProgress.totalDocuments > 0
      ? ((batchProgress.completedDocuments + batchProgress.failedDocuments) /
          batchProgress.totalDocuments) *
        100
      : 0;

  return (
    <div className="space-y-6">
      {/* Batch Overview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Batch Processing Progress
          </h2>
          <Button variant="outline" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Collapse' : 'Expand'} Details
          </Button>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Batch Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {batchProgress.totalDocuments}
            </div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {batchProgress.inProgressDocuments}
            </div>
            <div className="text-sm text-gray-600">In Progress</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {batchProgress.completedDocuments}
            </div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {batchProgress.failedDocuments}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
        </div>

        {batchProgress.endTime && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-green-800 font-medium">
              Batch completed in{' '}
              {formatDuration(batchProgress.startTime, batchProgress.endTime)}
            </div>
          </div>
        )}
      </Card>

      {/* Document Details */}
      {isExpanded && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Document Progress Details
          </h3>

          <div className="space-y-6">
            {batchProgress.documents.map(document => (
              <div
                key={document.documentId}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {document.title}
                    </h4>
                    <div className="text-sm text-gray-500 mt-1">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getStageColor(document.currentStage.stage)}`}
                      >
                        {document.detectedType}
                      </span>
                      <span>{document.currentStage.message}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelectedDocument(
                        selectedDocument === document.documentId
                          ? null
                          : document.documentId
                      )
                    }
                  >
                    {selectedDocument === document.documentId ? 'Hide' : 'Show'}{' '}
                    Details
                  </Button>
                </div>

                {/* Stage Progress Visualization */}
                <div className="mb-4">{renderStageProgress(document)}</div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {getStageName(document.currentStage.stage)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {Math.round(document.currentStage.progress * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        document.currentStage.stage === 'completed'
                          ? 'bg-green-500'
                          : document.currentStage.stage === 'failed'
                            ? 'bg-red-500'
                            : 'bg-blue-500'
                      }`}
                      style={{
                        width: `${document.currentStage.progress * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Expandable Details */}
                {selectedDocument === document.documentId &&
                  renderDocumentDetails(document)}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
