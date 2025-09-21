"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface SingleDocumentProgressProps {
  jobId: string;
  batchId?: string;
  onComplete?: (results: { chunksCreated?: number; entitiesExtracted?: number }) => void;
}

interface ProcessingStage {
  id: 'upload' | 'analysis' | 'chunking' | 'embedding' | 'entities_extraction' | 'entities_consolidation' | 'completed';
  label: string;
  icon: string;
  description: string;
  completed: boolean;
  active: boolean;
  details?: string;
}

export function SingleDocumentProgress({ jobId, batchId, onComplete }: SingleDocumentProgressProps) {
  const [stages, setStages] = useState<ProcessingStage[]>([
    { id: 'upload', label: 'Upload', icon: '📤', description: 'Document uploaded to database', completed: false, active: true },
    { id: 'analysis', label: 'Analysis', icon: '🔍', description: 'Analyzing document content and structure', completed: false, active: false },
    { id: 'chunking', label: 'Chunking', icon: '✂️', description: 'Breaking document into searchable chunks', completed: false, active: false },
    { id: 'embedding', label: 'Embeddings', icon: '🧠', description: 'Generating semantic embeddings', completed: false, active: false },
    { id: 'entities_extraction', label: 'Entity Extraction', icon: '🕷️', description: 'Extracting entities for knowledge graph', completed: false, active: false },
    { id: 'entities_consolidation', label: 'Entity Consolidation', icon: '🔗', description: 'Consolidating and linking entities', completed: false, active: false },
    { id: 'completed', label: 'Complete', icon: '✅', description: 'Ready for search and chat', completed: false, active: false }
  ]);

  const [currentDetails, setCurrentDetails] = useState<string>('Starting document processing...');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);
  const [urlListExpansion, setUrlListExpansion] = useState<{
    detected: boolean;
    totalDocuments: number;
    listType?: string;
  } | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // If this document is part of a batch, use SSE for progress updates
    if (batchId) {
      console.log(`Setting up SSE for batch document: jobId=${jobId}, batchId=${batchId}`);

      const eventSource = new EventSource(`/api/ingestion/progress?batchId=${batchId}&jobId=${jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'document_progress' && data.document.jobId === jobId) {
            updateProgressFromSSE(data.document);
          } else if (data.type === 'batch_progress') {
            // Check if we can find our document in the batch
            const ourDocument = data.batch.documents?.find((doc: any) => doc.jobId === jobId);
            if (ourDocument) {
              updateProgressFromSSE(ourDocument);
            }
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error for batch document:', error);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    } else {
      // Use polling for single documents
      const pollProgress = async () => {
        try {
          const response = await fetch(`/api/processing-jobs/${jobId}`);
          if (!response.ok) return;

          const job = await response.json();

          // Check if this is a batch job (URL list expansion)
          if (job.config?.batchId && job.config?.totalDocuments && !urlListExpansion) {
            setUrlListExpansion({
              detected: true,
              totalDocuments: job.config.totalDocuments,
              listType: job.config.batchDescription?.includes('patent') ? 'patent' :
                       job.config.batchDescription?.includes('paper') ? 'paper' :
                       job.config.batchDescription?.includes('article') ? 'article' : 'mixed'
            });
          }

          updateProgress(job);

          // Stop polling if job is complete or failed
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(pollInterval);
            if (job.status === 'completed' && !completed) {
              setCompleted(true);
              onComplete?.({
                chunksCreated: job.results?.chunksCreated,
                entitiesExtracted: job.results?.entitiesExtracted
              });
            } else if (job.status === 'failed') {
              setError(job.error_message || 'Processing failed');
            }
          }
        } catch (error) {
          console.error('Error polling job progress:', error);
        }
      };

      // Initial poll
      pollProgress();

      // Poll every 2 seconds
      const pollInterval = setInterval(pollProgress, 2000);

      return () => clearInterval(pollInterval);
    }
  }, [jobId, batchId, onComplete, completed, urlListExpansion]);

  const updateProgress = (job: any) => {
    const progress = job.progress || 0;
    const message = job.progress_message || '';

    setCurrentDetails(message);

    setStages(prevStages => prevStages.map(stage => {
      let completed = false;
      let active = false;
      let details = stage.description;

      switch (stage.id) {
        case 'upload':
          completed = progress > 0.1;
          active = progress <= 0.1 && job.status === 'processing';
          if (completed) details = 'Document uploaded to database ✓';
          break;

        case 'analysis':
          completed = progress > 0.3;
          active = progress > 0.1 && progress <= 0.3;
          if (completed) {
            details = urlListExpansion?.detected
              ? `URL list analysis complete - ${urlListExpansion.totalDocuments} documents identified ✓`
              : 'Document analysis complete ✓';
          } else if (active) {
            details = urlListExpansion?.detected
              ? 'Analyzing URL list and expanding into individual documents...'
              : 'Analyzing document structure and content...';
          }
          break;

        case 'chunking':
          completed = progress > 0.5;
          active = progress > 0.3 && progress <= 0.5;
          if (completed && job.results?.chunksCreated) {
            details = `${job.results.chunksCreated} chunks created ✓`;
          } else if (active) {
            details = 'Breaking document into searchable chunks...';
          }
          break;

        case 'embedding':
          completed = progress > 0.7;
          active = progress > 0.5 && progress <= 0.7;
          if (completed && job.results?.embeddingsGenerated) {
            details = `${job.results.embeddingsGenerated} embeddings generated ✓`;
          } else if (active) {
            details = 'Generating semantic embeddings...';
          }
          break;

        case 'entities_extraction':
          completed = progress > 0.85;
          active = progress > 0.7 && progress <= 0.85;
          if (completed && job.results?.entitiesExtracted) {
            details = `${job.results.entitiesExtracted} entities extracted ✓`;
          } else if (active) {
            details = 'Extracting entities for knowledge graph...';
          }
          break;

        case 'entities_consolidation':
          completed = progress > 0.95;
          active = progress > 0.85 && progress <= 0.95;
          if (completed && job.results?.entitiesConsolidated) {
            details = `${job.results.entitiesConsolidated} entities consolidated ✓`;
          } else if (active) {
            details = 'Consolidating and linking entities...';
          }
          break;

        case 'completed':
          completed = job.status === 'completed';
          active = false;
          if (completed) details = 'DONE - Document ready for search and chat ✓';
          break;
      }

      return { ...stage, completed, active, details };
    }));
  };

  const updateProgressFromSSE = (document: any) => {
    // Map SSE document format to job format for consistency
    const job = {
      progress: document.currentStage.progress,
      progress_message: document.currentStage.message,
      status: document.currentStage.stage === 'completed' ? 'completed' :
              document.currentStage.stage === 'failed' ? 'failed' : 'processing',
      results: document.currentStage.details,
      error_message: document.currentStage.details?.error
    };

    updateProgress(job);

    // Handle completion
    if (document.currentStage.stage === 'completed' && !completed) {
      setCompleted(true);
      onComplete?.({
        chunksCreated: document.currentStage.details?.chunksCreated,
        entitiesExtracted: document.currentStage.details?.entitiesExtracted
      });
    } else if (document.currentStage.stage === 'failed') {
      setError(document.currentStage.details?.error || 'Processing failed');
    }
  };

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-red-800">
          <div className="flex items-center mb-2">
            <span className="text-lg mr-2">❌</span>
            <span className="font-semibold">Processing Failed</span>
          </div>
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* URL List Expansion Alert */}
        {urlListExpansion?.detected && (
          <div className="flex items-center space-x-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <div className="font-semibold text-purple-800">URL List Detected</div>
              <div className="text-sm text-purple-700">
                Expanded into {urlListExpansion.totalDocuments} individual documents
                {urlListExpansion.listType && ` (${urlListExpansion.listType} list)`}
              </div>
            </div>
          </div>
        )}

        {/* Current Status */}
        <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Spinner className="w-5 h-5 text-blue-600" />
          <span className="text-blue-800 font-medium">{currentDetails}</span>
        </div>

        {/* Progress Steps */}
        <div className="space-y-3">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`flex items-center space-x-4 p-3 rounded-lg transition-all duration-300 ${
                stage.completed 
                  ? 'bg-green-50 border border-green-200' 
                  : stage.active 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                stage.completed 
                  ? 'bg-green-500 text-white' 
                  : stage.active 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-300 text-gray-600'
              }`}>
                {stage.active && !stage.completed ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <span className="text-sm">{stage.icon}</span>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${
                    stage.completed 
                      ? 'text-green-800' 
                      : stage.active 
                        ? 'text-blue-800' 
                        : 'text-gray-600'
                  }`}>
                    {stage.label}
                  </span>
                  {stage.completed && (
                    <span className="text-green-600 text-sm">✓</span>
                  )}
                </div>
                <p className={`text-sm mt-1 ${
                  stage.completed 
                    ? 'text-green-700' 
                    : stage.active 
                      ? 'text-blue-700' 
                      : 'text-gray-500'
                }`}>
                  {stage.details}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}