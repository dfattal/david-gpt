/**
 * RAW Markdown Extraction Component
 * Upload raw markdown files and extract to formatted RAG markdown
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PersonaMultiSelect } from '@/components/ui/persona-multi-select';
import { FileText, X, CheckCircle, AlertCircle, Eye, Loader2 } from 'lucide-react';
import { DocumentMetadataModal } from '@/components/admin/DocumentMetadataModal';
import { useJobStatus } from '@/hooks/useJobStatus';

interface MarkdownExtractionProps {
  onSuccess?: () => void;
  defaultPersonaSlugs?: string[];
}

interface ExtractionResult {
  filename: string;
  success: boolean;
  docId?: string;
  title?: string;
  storagePath?: string;
  markdown?: string;
  error?: string;
  stats?: {
    originalChars: number;
    formattedChars: number;
    documentType: string;
  };
}

interface MarkdownFile {
  file: File;
  status: 'pending' | 'extracting' | 'success' | 'error';
  error?: string;
  result?: ExtractionResult;
}

type ExtractionMode = 'single' | 'batch';

export function MarkdownExtraction({ onSuccess, defaultPersonaSlugs }: MarkdownExtractionProps) {
  const [mode, setMode] = useState<ExtractionMode>('single');
  const [personaSlugs, setPersonaSlugs] = useState<string[]>(defaultPersonaSlugs || []);
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Update persona slugs when defaults change
  useEffect(() => {
    if (defaultPersonaSlugs) {
      setPersonaSlugs(defaultPersonaSlugs);
    }
  }, [defaultPersonaSlugs]);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Batch results
  const [batchResults, setBatchResults] = useState<{
    total: number;
    successful: number;
    failed: number;
    items: ExtractionResult[];
  } | null>(null);

  const [storedDocuments, setStoredDocuments] = useState<Array<{
    docId: string;
    title: string;
    filename: string;
  }> | null>(null);

  // Bulk ingest state
  const [isIngestingAll, setIsIngestingAll] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const mdFiles = acceptedFiles.filter(f => f.name.toLowerCase().endsWith('.md'));
    const newFiles = mdFiles.map((file) => ({
      file,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.md'],
    },
    multiple: mode === 'batch',
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Poll job status
  const { job: currentJob } = useJobStatus({
    jobId: currentJobId,
    pollInterval: 1000,
    onComplete: (job) => {
      setIsExtracting(false);
      setCurrentJobId(null);

      if (job.resultData?.success && job.resultData.storedDocuments?.length) {
        const doc = job.resultData.storedDocuments[0];
        setFiles((prev) =>
          prev.map((f, i) =>
            i === 0
              ? {
                  ...f,
                  status: 'success' as const,
                  result: {
                    filename: f.file.name,
                    success: true,
                    docId: doc.docId,
                    title: doc.title,
                    storagePath: doc.storagePath,
                  },
                }
              : f
          )
        );

        // Auto-open preview modal
        setPreviewDocId(doc.docId);
        setPreviewTitle(doc.title || files[0].file.name);
        setShowPreviewModal(true);
        // Don't call onSuccess when showing preview - modal will handle cleanup
      } else {
        // Only call onSuccess if no preview modal
        onSuccess?.();
      }
    },
    onError: (error) => {
      setIsExtracting(false);
      setCurrentJobId(null);
      setFiles((prev) =>
        prev.map((f, i) =>
          i === 0
            ? {
                ...f,
                status: 'error' as const,
                error,
              }
            : f
        )
      );
    },
  });

  // Update progress based on job status
  useEffect(() => {
    if (currentJob?.progress) {
      const percent = currentJob.progress.total > 0
        ? (currentJob.progress.current / currentJob.progress.total) * 100
        : 0;
      setProgress(percent);
    }
  }, [currentJob]);

  // Handle single extraction
  const handleSingleExtraction = async () => {
    if (files.length === 0) return;
    if (personaSlugs.length === 0) return;
    setIsExtracting(true);
    setFiles((prev) =>
      prev.map((f, i) => (i === 0 ? { ...f, status: 'extracting' as const } : f))
    );

    const formData = new FormData();
    formData.append('file', files[0].file);
    formData.append('personaSlugs', JSON.stringify(personaSlugs));

    try {
      const response = await fetch('/api/admin/extract-markdown', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed');
      }

      // Start polling for job status
      if (data.jobId) {
        setCurrentJobId(data.jobId);
      } else {
        throw new Error('No job ID returned');
      }
    } catch (error) {
      setIsExtracting(false);
      setFiles((prev) =>
        prev.map((f, i) =>
          i === 0
            ? {
                ...f,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Extraction failed',
              }
            : f
        )
      );
    }
  };

  // Handle batch extraction
  const handleBatchExtraction = async () => {
    if (files.length === 0) return;
    if (personaSlugs.length === 0) return;

    setIsExtracting(true);
    setProgress(0);
    setBatchResults(null);
    setStoredDocuments(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f.file));
    formData.append('personaSlugs', JSON.stringify(personaSlugs));

    try {
      const response = await fetch('/api/admin/extract-markdown-batch', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Batch extraction failed');
      }

      setBatchResults(data.results);
      setStoredDocuments(data.storedDocuments);
      setProgress(100);

      // Trigger document list refresh
      onSuccess?.();
    } catch (error) {
      console.error('Batch extraction failed:', error);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setBatchResults(null);
    setStoredDocuments(null);
    setProgress(0);
    setShowPreviewModal(false);
    setPreviewDocId(null);
    setPreviewTitle('');
  };

  const handlePreviewClose = () => {
    setShowPreviewModal(false);
    // Refresh document list after preview is closed
    onSuccess?.();
  };

  const handleIngestSuccess = () => {
    setShowPreviewModal(false);
    handleReset();
    onSuccess?.();
  };

  const handlePreviewDocument = (docId: string, title: string) => {
    setPreviewDocId(docId);
    setPreviewTitle(title);
    setShowPreviewModal(true);
  };

  const handleIngestAll = async () => {
    if (!storedDocuments || storedDocuments.length === 0) return;

    setIsIngestingAll(true);

    try {
      const docIds = storedDocuments
        .filter(doc => doc.docId)
        .map(doc => doc.docId);

      const response = await fetch('/api/admin/documents/bulk-reingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ docIds }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Bulk ingestion failed');
      }

      // Reset and refresh
      handleReset();
      onSuccess?.();
    } catch (error) {
      console.error('Bulk ingestion failed:', error);
    } finally {
      setIsIngestingAll(false);
    }
  };

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">RAW Markdown Extraction</h3>
          <p className="text-sm text-muted-foreground">
            Upload raw markdown files and convert them to RAG-formatted markdown with auto-generated frontmatter
          </p>
        </div>

        {/* Persona Selection - only show if no global persona is selected */}
        {!defaultPersonaSlugs || defaultPersonaSlugs.length === 0 ? (
          <div>
            <PersonaMultiSelect
              selectedSlugs={personaSlugs}
              onChange={setPersonaSlugs}
              disabled={isExtracting}
              label="Target Personas"
            />
          </div>
        ) : (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded text-sm">
            <strong className="text-primary">Extracting to:</strong>{' '}
            <span className="text-foreground">{defaultPersonaSlugs.join(', ')}</span>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => { setMode('single'); setFiles([]); setBatchResults(null); }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              mode === 'single'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            disabled={isExtracting}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Single File
          </button>
          <button
            onClick={() => { setMode('batch'); setFiles([]); setBatchResults(null); }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              mode === 'batch'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            disabled={isExtracting}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Batch Files
          </button>
        </div>

        {/* Dropzone */}
        {files.length === 0 && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop markdown file{mode === 'batch' ? 's' : ''} here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop {mode === 'batch' ? 'markdown files' : 'a markdown file'} here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  {mode === 'batch' ? 'Multiple .md files supported' : 'Single .md file'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* File List (Single Mode) */}
        {mode === 'single' && files.length > 0 && (
          <div className="space-y-4">
            {files.map((mdFile, idx) => (
              <div key={idx} className="flex items-center gap-3 p-4 bg-muted/50 rounded border">
                <FileText className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mdFile.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(mdFile.file.size / 1024).toFixed(2)} KB
                  </p>
                  {mdFile.status === 'extracting' && currentJob?.progress && (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                      {currentJob.progress.message}
                    </p>
                  )}
                  {mdFile.error && (
                    <p className="text-xs text-red-600 mt-1">{mdFile.error}</p>
                  )}
                  {mdFile.result?.success && (
                    <p className="text-xs text-green-600 mt-1">
                      Document stored in database. Preview modal will open automatically.
                    </p>
                  )}
                </div>
                {mdFile.status === 'success' && (
                  <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                )}
                {mdFile.status === 'error' && (
                  <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                )}
                {mdFile.status === 'extracting' && (
                  <Loader2 className="h-6 w-6 text-primary animate-spin flex-shrink-0" />
                )}
                {mdFile.status === 'pending' && (
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}

            <div className="flex gap-2 justify-end">
              {files[0]?.status === 'success' && (
                <Button variant="outline" onClick={handleReset}>
                  Extract Another
                </Button>
              )}
              {files[0]?.status === 'pending' && (
                <Button onClick={handleSingleExtraction} disabled={isExtracting}>
                  Extract Markdown
                </Button>
              )}
              {files[0]?.status === 'error' && (
                <Button onClick={handleSingleExtraction} disabled={isExtracting}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}

        {/* File List (Batch Mode) */}
        {mode === 'batch' && files.length > 0 && !batchResults && (
          <div className="space-y-4">
            <div className="max-h-60 overflow-y-auto space-y-2">
              {files.map((mdFile, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded border">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mdFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(mdFile.file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    disabled={isExtracting}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {isExtracting && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Extracting {files.length} files... This may take a few minutes.
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {!isExtracting && (
                <Button variant="outline" onClick={handleReset}>
                  Clear All
                </Button>
              )}
              <Button onClick={handleBatchExtraction} disabled={isExtracting}>
                {isExtracting ? 'Extracting...' : `Extract ${files.length} Files`}
              </Button>
            </div>
          </div>
        )}

        {/* Batch Results */}
        {batchResults && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded border">
              <h4 className="font-medium mb-2">Batch Extraction Complete</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <span className="font-medium">{batchResults.total}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Successful:</span>{' '}
                  <span className="font-medium text-green-600">{batchResults.successful}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failed:</span>{' '}
                  <span className="font-medium text-red-600">{batchResults.failed}</span>
                </div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {batchResults.items.map((result, idx) => {
                const storedDoc = storedDocuments?.find(d => d.filename === result.filename);

                return (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.filename}</p>
                      {result.error && (
                        <p className="text-xs text-red-600">{result.error}</p>
                      )}
                    </div>
                    {storedDoc?.docId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePreviewDocument(storedDoc.docId, storedDoc.title)}
                        className="flex-shrink-0"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    ) : result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleReset} disabled={isIngestingAll}>
                Extract More
              </Button>
              {storedDocuments && storedDocuments.length > 0 && (
                <Button onClick={handleIngestAll} disabled={isIngestingAll}>
                  {isIngestingAll ? 'Ingesting...' : `Ingest All (${storedDocuments.length})`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      {previewDocId && (
        <DocumentMetadataModal
          document={{ id: previewDocId, title: previewTitle, type: '', tags: [], raw_content: '' }}
          isOpen={showPreviewModal}
          onClose={handlePreviewClose}
          onSuccess={handleIngestSuccess}
          showIngestButton={true}
          showDeleteButton={true}
          showExtractionStats={true}
          defaultTab="preview"
        />
      )}
    </div>
  );
}
