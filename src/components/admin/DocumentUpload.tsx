/**
 * Document Upload Component
 * Supports single and batch uploads of formatted markdown files
 */

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentUploadProps {
  onSuccess: () => void;
}

interface UploadFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  documentId?: string;
}

export function DocumentUpload({ onSuccess }: DocumentUploadProps) {
  const [personaSlug, setPersonaSlug] = useState<string>('david');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
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
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (uploadFile: UploadFile, index: number) => {
    const formData = new FormData();
    formData.append('file', uploadFile.file);
    formData.append('personaSlug', personaSlug);

    try {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'uploading' as const } : f
        )
      );

      const response = await fetch('/api/admin/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: 'success' as const,
                documentId: data.document.id,
              }
            : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      );
    }
  };

  const handleUpload = async () => {
    if (!personaSlug) {
      alert('Please select a persona');
      return;
    }

    setIsUploading(true);

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending') {
        await uploadFile(files[i], i);
      }
    }

    setIsUploading(false);

    // Check if all uploads succeeded
    const allSuccess = files.every((f) => f.status === 'success');
    if (allSuccess) {
      setTimeout(() => {
        onSuccess();
        setFiles([]);
      }, 1000);
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;
  const progress =
    files.length > 0 ? ((successCount + errorCount) / files.length) * 100 : 0;

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="space-y-6">
        {/* Persona Selection */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Target Persona
          </label>
          <Select value={personaSlug} onValueChange={setPersonaSlug}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="david">David</SelectItem>
              <SelectItem value="leia">Leia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          {isDragActive ? (
            <p className="text-lg">Drop markdown files here...</p>
          ) : (
            <div>
              <p className="text-lg mb-2">
                Drag & drop markdown files here, or click to select
              </p>
              <p className="text-sm text-muted-foreground">
                Supports batch upload - select multiple .md files from your
                local /personas/&lt;slug&gt;/RAG/ directory
              </p>
            </div>
          )}
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                Selected Files ({files.length})
              </h3>
              <div className="text-sm text-muted-foreground">
                {successCount > 0 && (
                  <span className="text-green-600 mr-3">
                    ✓ {successCount} success
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-600 mr-3">
                    ✗ {errorCount} failed
                  </span>
                )}
                {uploadingCount > 0 && (
                  <span className="text-blue-600 mr-3">
                    ⟳ {uploadingCount} uploading
                  </span>
                )}
              </div>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  Uploading {successCount + errorCount} of {files.length}...
                </p>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2">
              {files.map((uploadFile, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded border"
                >
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadFile.file.size / 1024).toFixed(1)} KB
                    </p>
                    {uploadFile.error && (
                      <p className="text-xs text-red-600 mt-1">
                        {uploadFile.error}
                      </p>
                    )}
                  </div>
                  {uploadFile.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  )}
                  {uploadFile.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  )}
                  {uploadFile.status === 'uploading' && (
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {uploadFile.status === 'pending' && !isUploading && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {files.length > 0 && (
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setFiles([])}
              disabled={isUploading}
            >
              Clear All
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading || pendingCount === 0}
            >
              {isUploading
                ? 'Uploading...'
                : `Upload ${pendingCount} File${pendingCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
