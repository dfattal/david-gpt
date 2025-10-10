/**
 * PDF Extraction Component
 * Upload PDFs and extract formatted markdown using the new pipeline
 */

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PersonaMultiSelect } from '@/components/ui/persona-multi-select';
import { FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { DocumentMetadataModal } from '@/components/admin/DocumentMetadataModal';
import { useJobStatus } from '@/hooks/useJobStatus';

interface PdfExtractionProps {
  onSuccess?: () => void;
}

interface ExtractionResult {
  success: boolean;
  docId?: string;
  title?: string;
  storagePath?: string;
  markdown?: string; // Still returned for backward compatibility
  stats?: {
    totalChunks: number;
    totalPages: number;
    originalChars: number;
    formattedChars: number;
    retentionRatio: number;
  };
  validation?: {
    valid: boolean;
    warnings: string[];
    errors: string[];
  };
  error?: string;
}

interface PdfFile {
  file: File;
  status: 'pending' | 'extracting' | 'success' | 'error';
  error?: string;
  result?: ExtractionResult;
}

export function PdfExtraction({ onSuccess }: PdfExtractionProps) {
  const [personaSlugs, setPersonaSlugs] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Job status polling
  const { job: currentJob } = useJobStatus({
    jobId: currentJobId,
    pollInterval: 1000,
    onComplete: (job) => {
      setIsExtracting(false);
      setCurrentJobId(null);

      if (job.resultData?.success && job.resultData.storedDocuments && job.resultData.storedDocuments.length > 0) {
        const result = job.resultData;
        const firstDoc = result.storedDocuments![0];
        setPdfFile({
          ...pdfFile!,
          status: 'success',
          result: {
            success: true,
            docId: firstDoc.docId,
            title: firstDoc.title,
            storagePath: firstDoc.storagePath,
            stats: result.stats,
          },
        });

        // Auto-open preview modal
        setPreviewDocId(firstDoc.docId);
        setPreviewTitle(firstDoc.title || pdfFile!.file.name);
        setShowPreviewModal(true);
      } else {
        onSuccess?.();
      }
    },
    onError: (error) => {
      setIsExtracting(false);
      setCurrentJobId(null);
      setPdfFile({
        ...pdfFile!,
        status: 'error',
        error,
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setPdfFile({
        file: acceptedFiles[0],
        status: 'pending',
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  const handleExtract = async () => {
    if (!pdfFile || personaSlugs.length === 0) return;

    setIsExtracting(true);
    setPdfFile({ ...pdfFile, status: 'extracting' });

    const formData = new FormData();
    formData.append('file', pdfFile.file);
    formData.append('personaSlugs', JSON.stringify(personaSlugs));

    try {
      const response = await fetch('/api/admin/extract-pdf', {
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
      setPdfFile({
        ...pdfFile,
        status: 'error',
        error: error instanceof Error ? error.message : 'Extraction failed',
      });
    }
  };

  const handleReset = () => {
    setPdfFile(null);
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

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">PDF Extraction Pipeline</h3>
          <p className="text-sm text-muted-foreground">
            Upload a PDF and extract formatted markdown using the advanced 7-step pipeline
          </p>
        </div>

        {/* Persona Selection */}
        <div>
          <PersonaMultiSelect
            selectedSlugs={personaSlugs}
            onChange={setPersonaSlugs}
            disabled={isExtracting}
            label="Target Personas"
          />
        </div>

        {/* Dropzone */}
        {!pdfFile && (
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
              <p className="text-lg">Drop PDF here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop a PDF file here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports patents, arxiv papers, and general documents
                </p>
              </div>
            )}
          </div>
        )}

        {/* Selected File */}
        {pdfFile && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded border">
              <FileText className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {pdfFile.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(pdfFile.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {pdfFile.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {pdfFile.error}
                  </p>
                )}
              </div>
              {pdfFile.status === 'success' && (
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
              )}
              {pdfFile.status === 'error' && (
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
              )}
              {pdfFile.status === 'extracting' && (
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {pdfFile.status === 'pending' && (
                <button
                  onClick={handleReset}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Extraction Progress */}
            {pdfFile.status === 'extracting' && (
              <div className="space-y-2">
                <Progress value={50} className="h-2" />
                {currentJob?.progress ? (
                  <div className="p-4 rounded border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {currentJob.progress.message}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground text-center">
                      Extracting and formatting PDF content...
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
                      This may take 1-2 minutes depending on document length
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Extraction Results */}
            {pdfFile.status === 'success' && pdfFile.result && (
              <div className="space-y-3">
                <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
                  <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                    ✓ Extraction Successful
                  </h4>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Document stored in database. {pdfFile.result.docId ? 'Preview modal will open automatically.' : 'Ready for ingestion.'}
                  </p>

                  {pdfFile.result.stats && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
                      <div className="text-muted-foreground">Total Pages:</div>
                      <div>{pdfFile.result.stats.totalPages}</div>

                      <div className="text-muted-foreground">Total Chunks:</div>
                      <div>{pdfFile.result.stats.totalChunks}</div>

                      <div className="text-muted-foreground">Original Characters:</div>
                      <div>{pdfFile.result.stats.originalChars.toLocaleString()}</div>

                      <div className="text-muted-foreground">Formatted Characters:</div>
                      <div>{pdfFile.result.stats.formattedChars.toLocaleString()}</div>

                      <div className="text-muted-foreground">Retention Ratio:</div>
                      <div>{(pdfFile.result.stats.retentionRatio * 100).toFixed(1)}%</div>
                    </div>
                  )}
                </div>

                {pdfFile.result.validation && (
                  <div className="p-4 bg-muted/50 rounded border">
                    <h4 className="font-medium mb-2">Validation</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={pdfFile.result.validation.valid ? 'text-green-600' : 'text-red-600'}>
                          {pdfFile.result.validation.valid ? '✓ Valid' : '✗ Invalid'}
                        </span>
                      </div>

                      {pdfFile.result.validation.warnings.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Warnings:</span>
                          <ul className="ml-4 mt-1 text-yellow-600">
                            {pdfFile.result.validation.warnings.map((w, i) => (
                              <li key={i}>• {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {pdfFile.result.validation.errors.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Errors:</span>
                          <ul className="ml-4 mt-1 text-red-600">
                            {pdfFile.result.validation.errors.map((e, i) => (
                              <li key={i}>• {e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              {pdfFile.status === 'success' && (
                <Button
                  variant="outline"
                  onClick={handleReset}
                >
                  Extract Another
                </Button>
              )}
              {pdfFile.status === 'pending' && (
                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || personaSlugs.length === 0}
                >
                  Extract PDF
                </Button>
              )}
              {pdfFile.status === 'error' && (
                <Button
                  onClick={handleExtract}
                  disabled={isExtracting}
                >
                  Retry
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
