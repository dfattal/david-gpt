/**
 * URL Extraction Component
 * Single URL and batch URL extraction with metadata support
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { PersonaMultiSelect } from '@/components/ui/persona-multi-select';
import {
  Link as LinkIcon,
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  Eye,
  Loader2,
} from 'lucide-react';
import { DocumentMetadataModal } from '@/components/admin/DocumentMetadataModal';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useBatchJobStatus } from '@/hooks/useBatchJobStatus';

interface UrlExtractionProps {
  onSuccess?: () => void;
  defaultPersonaSlugs?: string[];
}

interface ExtractionResult {
  url: string;
  success: boolean;
  docId?: string;
  title?: string;
  storagePath?: string;
  filename?: string;
  markdown?: string; // Still returned for backward compatibility
  error?: string;
  stats?: {
    documentType: string;
    identifier?: string;
    contentChars?: number;
  };
}

interface BatchResult {
  results: ExtractionResult[];
  storedDocuments?: Array<{
    docId: string;
    title: string;
    storagePath: string;
    url: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

type ExtractionMode = 'single' | 'batch';

export function UrlExtraction({ onSuccess, defaultPersonaSlugs }: UrlExtractionProps) {
  const [mode, setMode] = useState<ExtractionMode>('single');
  const [personaSlugs, setPersonaSlugs] = useState<string[]>(defaultPersonaSlugs || []);

  // Update persona slugs when defaults change
  useEffect(() => {
    if (defaultPersonaSlugs) {
      setPersonaSlugs(defaultPersonaSlugs);
    }
  }, [defaultPersonaSlugs]);

  // Single URL mode
  const [singleUrl, setSingleUrl] = useState('');
  const [singleResult, setSingleResult] = useState<ExtractionResult | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Batch mode
  const [urlListContent, setUrlListContent] = useState('');
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchJobIds, setBatchJobIds] = useState<string[]>([]);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Job status polling for single URL extraction
  const { job: currentJob } = useJobStatus({
    jobId: currentJobId,
    pollInterval: 1000,
    onComplete: (job) => {
      setIsExtracting(false);
      setCurrentJobId(null);

      if (job.resultData?.success && job.resultData.storedDocuments?.length) {
        const doc = job.resultData.storedDocuments[0];
        setSingleResult({
          url: singleUrl,
          success: true,
          docId: doc.docId,
          title: doc.title,
          storagePath: doc.storagePath,
          filename: doc.title,
        });

        // Auto-open preview modal
        setPreviewDocId(doc.docId);
        setPreviewTitle(doc.title || 'Extracted Document');
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
      setSingleResult({
        url: singleUrl,
        success: false,
        error,
      });
    },
  });

  // Update progress based on job status (single URL)
  useEffect(() => {
    if (currentJob?.progress) {
      const percent = currentJob.progress.total > 0
        ? (currentJob.progress.current / currentJob.progress.total) * 100
        : 0;
      setProgress(percent);
    }
  }, [currentJob]);

  // Handle case where job completes while component is mounted but onComplete didn't fire
  useEffect(() => {
    if (currentJob?.status === 'completed' && isExtracting) {
      console.log('Job completed, cleaning up stuck extracting state');
      setIsExtracting(false);
      setCurrentJobId(null);

      if (currentJob.resultData?.success && currentJob.resultData.storedDocuments?.length) {
        const doc = currentJob.resultData.storedDocuments[0];
        setSingleResult({
          url: singleUrl,
          success: true,
          docId: doc.docId,
          title: doc.title,
          storagePath: doc.storagePath,
          filename: doc.title,
        });

        // Auto-open preview modal
        setPreviewDocId(doc.docId);
        setPreviewTitle(doc.title || 'Extracted Document');
        setShowPreviewModal(true);
      } else {
        onSuccess?.();
      }
    }
  }, [currentJob?.status, isExtracting, currentJob?.resultData, singleUrl, onSuccess]);

  // Batch job polling
  const {
    jobs: batchJobs,
    overallProgress: batchProgress,
    allComplete: batchAllComplete,
    completedCount: batchCompletedCount,
    failedCount: batchFailedCount,
  } = useBatchJobStatus({
    jobIds: batchJobIds,
    pollInterval: 2000,
    onAllComplete: (jobs) => {
      setIsExtracting(false);

      // Build results from completed jobs
      const results: ExtractionResult[] = [];
      const storedDocuments: Array<{
        docId: string;
        title: string;
        storagePath: string;
        url: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const job of jobs) {
        const url = (job as any).inputData?.url || 'Unknown URL';

        if (job.status === 'completed' && job.resultData?.storedDocuments?.[0]) {
          const doc = job.resultData.storedDocuments[0];
          results.push({
            url,
            success: true,
            docId: doc.docId,
            title: doc.title,
            storagePath: doc.storagePath,
            filename: doc.title,
          });
          storedDocuments.push({
            docId: doc.docId,
            title: doc.title,
            storagePath: doc.storagePath,
            url,
            success: true,
          });
        } else {
          results.push({
            url,
            success: false,
            error: job.error || 'Extraction failed',
          });
        }
      }

      setBatchResult({
        results,
        storedDocuments,
        summary: {
          total: jobs.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });

      // Call onSuccess after all jobs complete
      onSuccess?.();
    },
  });

  // Update batch progress
  useEffect(() => {
    if (batchJobIds.length > 0 && isExtracting) {
      setProgress(batchProgress);
    }
  }, [batchProgress, batchJobIds.length, isExtracting]);

  // File drop for batch mode
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setUrlListContent(content);
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.txt', '.md'],
    },
    multiple: false,
  });

  // Handle single URL extraction (async with job polling)
  const handleSingleExtraction = async () => {
    if (!singleUrl.trim()) return;
    if (personaSlugs.length === 0) return;

    setIsExtracting(true);
    setSingleResult(null);

    try {
      const response = await fetch('/api/admin/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: singleUrl.trim(),
          personaSlugs,
        }),
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
      setSingleResult({
        url: singleUrl,
        success: false,
        error: error instanceof Error ? error.message : 'Extraction failed',
      });
    }
  };

  // Parse URL list content to extract individual URLs
  const parseUrlList = (content: string): Array<{ url: string; tags?: string[]; aka?: string }> => {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const urls: Array<{ url: string; tags?: string[]; aka?: string }> = [];

    for (const line of lines) {
      // Match formats:
      // - URL | aka: Name
      // - URL | tags
      // - URL | tags | aka: Name
      // Check for aka first, then tags
      const akaMatch = line.match(/^-?\s*(.+?)\s*\|\s*aka:\s*(.+)$/);
      if (akaMatch) {
        urls.push({ url: akaMatch[1].trim(), aka: akaMatch[2].trim() });
        continue;
      }

      const tagsAndAkaMatch = line.match(/^-?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*aka:\s*(.+)$/);
      if (tagsAndAkaMatch) {
        urls.push({
          url: tagsAndAkaMatch[1].trim(),
          tags: tagsAndAkaMatch[2].split(',').map(t => t.trim()).filter(Boolean),
          aka: tagsAndAkaMatch[3].trim(),
        });
        continue;
      }

      const tagsMatch = line.match(/^-?\s*(.+?)\s*\|\s*(.+)$/);
      if (tagsMatch) {
        urls.push({
          url: tagsMatch[1].trim(),
          tags: tagsMatch[2].split(',').map(t => t.trim()).filter(Boolean),
        });
        continue;
      }

      // Plain URL without metadata
      const plainMatch = line.match(/^-?\s*(.+)$/);
      if (plainMatch) {
        urls.push({ url: plainMatch[1].trim() });
      }
    }

    return urls;
  };

  // Handle batch URL extraction (async with job polling)
  const handleBatchExtraction = async () => {
    if (!urlListContent.trim()) return;
    if (personaSlugs.length === 0) return;

    setIsExtracting(true);
    setBatchResult(null);
    setProgress(0);

    try {
      // Parse URLs from content
      const urlItems = parseUrlList(urlListContent);

      if (urlItems.length === 0) {
        throw new Error('No valid URLs found in the list');
      }

      const jobIds: string[] = [];

      // Queue all extraction jobs
      for (let i = 0; i < urlItems.length; i++) {
        const item = urlItems[i];

        try {
          // Call single URL extraction API to queue the job
          const response = await fetch('/api/admin/extract-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: item.url,
              personaSlugs,
              tags: item.tags,
              aka: item.aka,
            }),
          });

          const data = await response.json();

          if (response.ok && data.jobId) {
            jobIds.push(data.jobId);
          } else {
            console.error(`Failed to queue job for ${item.url}:`, data.error);
          }
        } catch (error) {
          console.error(`Error queueing job for ${item.url}:`, error);
        }

        // Show queueing progress
        setProgress(Math.round(((i + 1) / urlItems.length) * 50)); // 50% for queueing
      }

      // Start polling for job completion
      setBatchJobIds(jobIds);
      // Progress will continue from 50% to 100% as jobs complete (handled by useBatchJobStatus)

    } catch (error) {
      console.error('Batch extraction failed:', error);
      setIsExtracting(false);
    }
  };

  const handleReset = () => {
    setSingleUrl('');
    setSingleResult(null);
    setUrlListContent('');
    setBatchResult(null);
    setBatchJobIds([]);
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
    onSuccess?.(); // Trigger parent refresh
  };

  const handlePreviewDocument = (docId: string, title: string) => {
    setPreviewDocId(docId);
    setPreviewTitle(title);
    setShowPreviewModal(true);
  };

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">URL Extraction</h3>
          <p className="text-sm text-muted-foreground">
            Extract formatted markdown from URLs (patents, ArXiv papers, etc.)
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
            onClick={() => setMode('single')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              mode === 'single'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            disabled={isExtracting}
          >
            <LinkIcon className="h-4 w-4 inline mr-2" />
            Single URL
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              mode === 'batch'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            disabled={isExtracting}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Batch URLs
          </button>
        </div>

        {/* Single URL Mode */}
        {mode === 'single' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">URL or Identifier</label>
              <input
                type="text"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://patents.google.com/patent/US10838134B2 or US10838134B2 or arxiv:2405.10314"
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={isExtracting}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports: Patent URLs/numbers, ArXiv URLs/IDs
              </p>
            </div>

            {/* Show progress message during extraction */}
            {isExtracting && (
              <div className="p-4 rounded border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {currentJob?.progress?.message || 'Extracting...'}
                  </p>
                </div>
                {currentJob?.progress && currentJob.progress.total > 0 && (
                  <div className="mt-2">
                    <Progress value={(currentJob.progress.current / currentJob.progress.total) * 100} className="h-1" />
                  </div>
                )}
              </div>
            )}

            {singleResult && (
              <div
                className={`p-4 rounded border ${
                  singleResult.success
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                }`}
              >
                {singleResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <h4 className="font-medium">Extraction Successful</h4>
                    </div>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      Document stored in database. {singleResult.docId ? 'Preview modal will open automatically.' : 'Ready for ingestion.'}
                    </p>
                    <div className="text-sm space-y-1">
                      <p>Type: {singleResult.stats?.documentType}</p>
                      <p>Filename: {singleResult.filename}</p>
                      {singleResult.stats?.contentChars && (
                        <p>Size: {singleResult.stats.contentChars.toLocaleString()} chars</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm">{singleResult.error}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {singleResult && (
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              )}
              <Button onClick={handleSingleExtraction} disabled={isExtracting || !singleUrl.trim()}>
                {isExtracting ? 'Extracting...' : 'Extract URL'}
              </Button>
            </div>
          </div>
        )}

        {/* Batch URL Mode */}
        {mode === 'batch' && (
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              {isDragActive ? (
                <p>Drop URL list file here...</p>
              ) : (
                <div>
                  <p className="mb-1">Drag & drop URL list file, or click to select</p>
                  <p className="text-xs text-muted-foreground">
                    Supports .md or .txt files with URL list format
                  </p>
                </div>
              )}
            </div>

            {/* Manual Input */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Or paste URL list content:
              </label>
              <Textarea
                value={urlListContent}
                onChange={(e) => setUrlListContent(e.target.value)}
                placeholder="# Document List&#10;- US10838134B2 | multibeam, light guide | aka: Core Patent&#10;- arxiv:2405.10314 | holography, neural networks"
                className="min-h-[150px] font-mono text-sm"
                disabled={isExtracting}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: <code>- URL [| key_terms] [| aka: Name]</code>
              </p>
            </div>

            {/* Progress */}
            {isExtracting && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <p>
                    Processing batch... {batchCompletedCount + batchFailedCount} / {batchJobIds.length || '...'}
                  </p>
                  {batchJobIds.length > 0 && (
                    <p>
                      ✓ {batchCompletedCount} completed • ✗ {batchFailedCount} failed
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Batch Results */}
            {batchResult && (
              <div className="space-y-3">
                <div className="p-4 bg-muted/50 rounded border">
                  <h4 className="font-medium mb-2">Batch Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total:</span>{' '}
                      <span className="font-medium">{batchResult.summary.total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Successful:</span>{' '}
                      <span className="font-medium text-green-600">
                        {batchResult.summary.successful}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed:</span>{' '}
                      <span className="font-medium text-red-600">
                        {batchResult.summary.failed}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Individual Results */}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {batchResult.results.map((result, idx) => {
                    // Find corresponding stored document
                    const storedDoc = batchResult.storedDocuments?.find(d => d.url === result.url);

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded border"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.url}</p>
                          {result.filename && (
                            <p className="text-xs text-muted-foreground">{result.filename}</p>
                          )}
                          {result.error && (
                            <p className="text-xs text-red-600">{result.error}</p>
                          )}
                        </div>
                        {storedDoc?.success && storedDoc.docId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePreviewDocument(storedDoc.docId, storedDoc.title || result.filename || 'Document')}
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
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {batchResult && (
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              )}
              <Button
                onClick={handleBatchExtraction}
                disabled={isExtracting || !urlListContent.trim()}
              >
                {isExtracting ? 'Extracting Batch...' : 'Extract Batch'}
              </Button>
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
