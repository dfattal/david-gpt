"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { DocumentTypeDetector } from "@/lib/rag/document-type-detector";
import { SingleDocumentProgress } from "./single-document-progress";

interface DocumentUploadProps {
  onUploadComplete?: () => void;
}

interface UploadFormData {
  title: string;
  inputType: 'document' | 'text' | 'url';
  content?: string;
  url?: string;
  file?: File;
  detectedType?: string;
  metadata: {
    description?: string;
    tags?: string[];
  };
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [formData, setFormData] = useState<UploadFormData>({
    title: '',
    inputType: 'document',
    metadata: {}
  });
  const [uploading, setUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<{
    detectedType: string;
    confidence: number;
    title: string;
  } | null>(null);
  const { addToast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      
      try {
        // Analyze file to detect document type
        const analysis = await DocumentTypeDetector.analyzeFile(file);
        setDetectionResult(analysis);
        
        setFormData(prev => ({
          ...prev,
          file,
          title: prev.title || analysis.title,
          detectedType: analysis.detectedType
        }));
        
        addToast(`File analyzed: ${analysis.detectedType} (${Math.round(analysis.confidence * 100)}% confidence)`, 'success');
      } catch (error) {
        console.error('File analysis error:', error);
        setFormData(prev => ({
          ...prev,
          file,
          title: prev.title || file.name.replace(/\.[^/.]+$/, '')
        }));
      }
    }
  }, [addToast]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/json': ['.json'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1,
    noClick: false,
    noKeyboard: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation based on input type
    if (formData.inputType === 'document' && !formData.file) {
      addToast('Please upload a file', 'error');
      return;
    }
    
    if (formData.inputType === 'text' && !formData.content?.trim()) {
      addToast('Please provide text content', 'error');
      return;
    }
    
    if (formData.inputType === 'url' && !formData.url?.trim()) {
      addToast('Please provide a URL', 'error');
      return;
    }

    setUploading(true);

    try {
      let requestBody: Record<string, unknown> = {
        metadata: formData.metadata
      };

      // Handle different input types
      if (formData.inputType === 'document' && formData.file) {
        // Use FormData for file uploads
        const formDataObj = new FormData();
        formDataObj.append('file', formData.file);
        formDataObj.append('title', formData.title.trim() || '');
        formDataObj.append('docType', detectionResult?.detectedType || 'pdf');
        formDataObj.append('metadata', JSON.stringify(formData.metadata));

        const response = await fetch('/api/documents/ingest', {
          method: 'POST',
          body: formDataObj
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();
        setActiveJobId(result.jobId);
        
      } else if (formData.inputType === 'text') {
        // Direct text content
        requestBody = {
          title: formData.title.trim() || await generateTitle(formData.content!),
          content: formData.content,
          docType: 'note',
          metadata: formData.metadata
        };

      } else if (formData.inputType === 'url') {
        // URL processing with Google Patents detection
        const isGooglePatent = formData.url!.includes('patents.google.com');
        
        requestBody = {
          title: formData.title.trim() || await generateTitle(`URL: ${formData.url}`),
          docType: isGooglePatent ? 'patent' : 'url',
          [isGooglePatent ? 'patentUrl' : 'url']: formData.url,
          metadata: formData.metadata
        };
      }

      // For text and URL submissions, send JSON
      if (formData.inputType !== 'document') {
        const response = await fetch('/api/documents/ingest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();
        setActiveJobId(result.jobId);
      }

      addToast('Document ingestion started! View progress below.', 'success');
      
      // Reset form
      setFormData({
        title: '',
        inputType: 'document',
        metadata: {}
      });
      setDetectionResult(null);

    } catch (error) {
      console.error('Upload error:', error);
      addToast(
        error instanceof Error ? error.message : 'Failed to upload document',
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  // Generate title using LLM if none provided
  const generateTitle = async (content: string): Promise<string> => {
    try {
      const response = await fetch('/api/llm/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.substring(0, 1000) })
      });
      
      if (response.ok) {
        const { title } = await response.json();
        return title;
      }
    } catch (error) {
      console.error('Title generation failed:', error);
    }
    
    // Fallback to simple extraction
    return content.split('\n')[0]?.trim()?.substring(0, 100) || 'Untitled Document';
  };

  const inputTypes = [
    { value: 'document', label: 'Document', description: 'Upload PDF, text, or other document files' },
    { value: 'text', label: 'Text', description: 'Paste text content directly' },
    { value: 'url', label: 'URL', description: 'Web URL or Google Patents link' }
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Upload New Document
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Input Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Input Type
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {inputTypes.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    inputType: type.value,
                    // Reset relevant fields when switching types
                    file: undefined,
                    content: '',
                    url: ''
                  }))}
                  className={`p-4 text-left rounded-lg border transition-all ${
                    formData.inputType === type.value
                      ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{type.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title (Optional)
              {detectionResult && (
                <span className="text-xs text-gray-500 ml-2">
                  Auto-detected: {detectionResult.detectedType} ({Math.round(detectionResult.confidence * 100)}% confidence)
                </span>
              )}
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter document title (leave blank to auto-generate)"
            />
          </div>

          {/* Content Input Based on Type */}
          {formData.inputType === 'document' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload File
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                role="button"
                tabIndex={0}
                onClick={open}
              >
                <input {...getInputProps()} style={{ display: 'none' }} />
                {formData.file ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Selected: {formData.file.name}</p>
                    <p className="text-xs text-gray-400">
                      Size: {(formData.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {detectionResult && (
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Detected: {detectionResult.detectedType} ({Math.round(detectionResult.confidence * 100)}%)
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">
                      {isDragActive ? 'Drop file here' : 'Drag & drop file here, or click to select'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Supports PDF, TXT, MD, JSON, CSV files up to 10MB
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      System will auto-detect document type (PDF, academic paper, patent, etc.)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {formData.inputType === 'text' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Content
              </label>
              <Textarea
                value={formData.content || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Paste your text content here... (Markdown supported)"
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports Markdown formatting. Title will be auto-generated if not provided.
              </p>
            </div>
          )}

          {formData.inputType === 'url' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Web URL
              </label>
              <Input
                value={formData.url || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com/article or https://patents.google.com/patent/US123456"
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports any web URL. Google Patents URLs will be processed using patent extraction APIs.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <Textarea
              value={formData.metadata.description || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                metadata: { ...prev.metadata, description: e.target.value }
              }))}
              placeholder="Brief description of the document"
              rows={3}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={uploading}
              className="min-w-32 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {uploading ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  Starting ingestion...
                </>
              ) : (
                `Upload ${formData.inputType === 'document' ? 'Document' : 
                         formData.inputType === 'text' ? 'Text' : 'URL'}`
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Single Document Progress Tracking */}
      {activeJobId && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Document Processing Progress
          </h3>
          <SingleDocumentProgress 
            jobId={activeJobId} 
            onComplete={(results) => {
              setActiveJobId(null);
              addToast(
                `Document processing completed! Created ${results.chunksCreated || 0} chunks and extracted ${results.entitiesExtracted || 0} entities.`, 
                'success'
              );
              onUploadComplete?.();
            }}
          />
        </div>
      )}
    </div>
  );
}