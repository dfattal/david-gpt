"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { DocumentTypeDetector, DocumentDetectionResult } from "@/lib/rag/document-type-detector";
import { IngestionProgressVisualizer } from "./ingestion-progress-visualizer";

interface DetectedDocument extends DocumentDetectionResult {
  file: File;
  sourceFileName?: string;
  processing?: boolean;
  completed?: boolean;
  error?: string;
}

interface BatchFolderUploadProps {
  onUploadComplete?: () => void;
}

export function BatchFolderUpload({ onUploadComplete }: BatchFolderUploadProps) {
  const [documents, setDocuments] = useState<DetectedDocument[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [batchDescription, setBatchDescription] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const { addToast } = useToast();


  const readFileContent = (file: File, maxBytes?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(maxBytes ? result.slice(0, maxBytes) : result);
      };
      
      reader.onerror = reject;
      
      if (maxBytes && maxBytes < file.size) {
        const blob = file.slice(0, maxBytes);
        reader.readAsText(blob);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const extractPatentFromUrl = (url: string): string | undefined => {
    const match = url.match(/patent\/([A-Z]{2}\d+[A-Z]?\d*)/i);
    return match ? match[1] : undefined;
  };

  const extractDoiFromUrl = (url: string): string | undefined => {
    const doiMatch = url.match(/(?:doi\.org\/|arxiv\.org\/abs\/)(.+)/);
    return doiMatch ? doiMatch[1] : undefined;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setAnalyzing(true);
    addToast(`Analyzing ${acceptedFiles.length} files...`, 'info');
    
    try {
      // Process each file individually to maintain proper file associations
      const allDetectedDocs = [];
      
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const fileResults = await DocumentTypeDetector.analyzeFiles([file]);
        
        // Add the source file to each result from this file
        fileResults.forEach(doc => {
          allDetectedDocs.push({
            ...doc,
            file: file,
            sourceFileName: file.name
          });
        });
      }
      
      const docsWithFiles = allDetectedDocs;
      
      setDocuments(docsWithFiles);
      addToast(`Analyzed ${acceptedFiles.length} files. Review and process when ready.`, 'success');
    } catch (error) {
      console.error('Error analyzing files:', error);
      addToast('Failed to analyze some files', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [addToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/json': ['.json'],
      'text/csv': ['.csv']
    },
    multiple: true
  });

  const processBatch = async () => {
    if (documents.length === 0) {
      addToast('No documents to process', 'error');
      return;
    }

    setProcessing(true);
    
    try {
      // Prepare documents for batch API
      const batchDocuments = await Promise.all(
        documents.map(async (doc) => {
          let content = '';
          
          // Only read content if not using external APIs and we have a valid file
          if (!doc.metadata?.doi && !doc.metadata?.patentUrl && doc.file instanceof File) {
            content = await readFileContent(doc.file);
          }
          
          return {
            title: doc.title,
            content,
            detectedType: doc.detectedType,
            confidence: doc.confidence,
            metadata: {
              ...doc.metadata,
              description: batchDescription,
              batch: true
            }
          };
        })
      );

      // Submit batch to API
      const response = await fetch('/api/documents/batch-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documents: batchDocuments,
          batchDescription
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Batch processing failed');
      }

      const result = await response.json();
      setBatchId(result.batchId);
      
      addToast(`Batch processing started! Processing ${result.totalDocuments} documents.`, 'success');
    } catch (error) {
      console.error('Batch processing error:', error);
      addToast(error instanceof Error ? error.message : 'Batch processing failed', 'error');
      setProcessing(false);
    }
  };


  const getTypeColor = (type: DetectedDocument['detectedType']) => {
    switch (type) {
      case 'pdf': return 'bg-red-100 text-red-800';
      case 'paper': return 'bg-blue-100 text-blue-800';
      case 'patent': return 'bg-purple-100 text-purple-800';
      case 'note': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Batch Folder Upload
        </h2>
        
        <div className="space-y-4">
          {/* Batch Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Description (Optional)
            </label>
            <Input
              value={batchDescription}
              onChange={(e) => setBatchDescription(e.target.value)}
              placeholder="Enter description for this batch of documents"
            />
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            {analyzing ? (
              <div className="flex items-center justify-center">
                <Spinner className="w-6 h-6 mr-2" />
                <span className="text-sm text-gray-600">Analyzing files...</span>
              </div>
            ) : (
              <div className="pointer-events-none">
                <p className="text-sm text-gray-600">
                  {isDragActive 
                    ? 'Drop files here to analyze...' 
                    : 'Drag & drop multiple files/folders here, or click to select'
                  }
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Supports PDF, TXT, MD, JSON files. Automatic type detection included.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Analysis Results */}
      {documents.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Analysis Results ({documents.length} files)
            </h3>
            <div className="flex space-x-2">
              <Button
                onClick={() => setDocuments([])}
                variant="outline"
                disabled={processing}
              >
                Clear All
              </Button>
              <Button
                onClick={processBatch}
                disabled={processing || analyzing}
                className="min-w-32"
              >
                {processing ? (
                  <>
                    <Spinner className="w-4 h-4 mr-2" />
                    Processing...
                  </>
                ) : (
                  `Process ${documents.length} Documents`
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {documents.map((doc, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  doc.completed 
                    ? 'bg-green-50 border-green-200' 
                    : doc.error 
                    ? 'bg-red-50 border-red-200'
                    : doc.processing 
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-sm truncate max-w-64">
                        {doc.title}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(doc.detectedType)}`}>
                        {doc.detectedType}
                      </span>
                      <span className={`text-xs font-medium ${getConfidenceColor(doc.confidence)}`}>
                        {Math.round(doc.confidence * 100)}% confidence
                      </span>
                    </div>
                    
                    {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {doc.metadata.doi && <span>DOI: {doc.metadata.doi}</span>}
                        {doc.metadata.patentNumber && <span>Patent: {doc.metadata.patentNumber}</span>}
                      </div>
                    )}
                    
                    {doc.error && (
                      <div className="text-xs text-red-600 mt-1">
                        Error: {doc.error}
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4">
                    {doc.processing && <Spinner className="w-4 h-4" />}
                    {doc.completed && (
                      <span className="text-green-600 text-xs">✓ Complete</span>
                    )}
                    {doc.error && (
                      <span className="text-red-600 text-xs">✗ Failed</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Progress Visualizer */}
      {batchId && (
        <IngestionProgressVisualizer 
          batchId={batchId}
          onComplete={(results) => {
            setProcessing(false);
            setBatchId(null);
            setDocuments([]);
            onUploadComplete?.();
            addToast(
              `Batch completed! ${results.completedDocuments} successful, ${results.failedDocuments} failed`,
              results.failedDocuments > 0 ? 'error' : 'success'
            );
          }}
        />
      )}
    </div>
  );
}