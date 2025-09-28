'use client';

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { validateDocument } from '@/lib/validation/document-format-validator';
import { SingleDocumentProgress } from './single-document-progress';
import {
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  FileText,
  Eye,
  Upload,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DocumentUploadProps {
  onUploadComplete?: () => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    type: string;
    field?: string;
    message: string;
    severity: string;
  }>;
  warnings: Array<{
    type: string;
    field?: string;
    message: string;
    suggestion: string;
  }>;
  qualityScore: number;
  suggestions: string[];
}

interface UploadData {
  content: string;
  fileName?: string;
  validation?: ValidationResult;
  validating: boolean;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [uploadData, setUploadData] = useState<UploadData>({
    content: '',
    validating: false,
  });
  const [uploading, setUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [strictValidation, setStrictValidation] = useState(false);
  const [validateOnly, setValidateOnly] = useState(false);
  const { addToast } = useToast();

  // Auto-validate when content changes
  const validateContent = useCallback(
    async (content: string, fileName?: string) => {
      if (!content.trim()) {
        setUploadData(prev => ({ ...prev, validation: undefined }));
        return;
      }

      setUploadData(prev => ({ ...prev, validating: true }));

      try {
        const validation = validateDocument(content, fileName);
        setUploadData(prev => ({ ...prev, validation, validating: false }));
      } catch (error) {
        console.error('Validation error:', error);
        setUploadData(prev => ({
          ...prev,
          validation: {
            isValid: false,
            errors: [
              {
                type: 'validation',
                message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                severity: 'error',
              },
            ],
            warnings: [],
            qualityScore: 0,
            suggestions: [],
          },
          validating: false,
        }));
      }
    },
    []
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];

        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
          addToast(
            'Only markdown files (.md, .markdown) are supported in the new workflow',
            'error'
          );
          return;
        }

        try {
          const content = await file.text();
          setUploadData({
            content,
            fileName: file.name,
            validating: false,
          });

          await validateContent(content, file.name);
          addToast(`Markdown file loaded: ${file.name}`, 'success');
        } catch (error) {
          console.error('File reading error:', error);
          addToast('Failed to read file', 'error');
        }
      }
    },
    [addToast, validateContent]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.markdown'],
    },
    maxFiles: 1,
    noClick: false,
    noKeyboard: false,
  });

  const handleContentChange = useCallback(
    (newContent: string) => {
      setUploadData(prev => ({ ...prev, content: newContent }));

      // Debounce validation
      const timeoutId = setTimeout(() => {
        validateContent(newContent, uploadData.fileName);
      }, 500);

      return () => clearTimeout(timeoutId);
    },
    [validateContent, uploadData.fileName]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadData.content.trim()) {
      addToast('Please provide markdown content', 'error');
      return;
    }

    // Check validation requirements
    if (!uploadData.validation) {
      addToast('Content validation is required', 'error');
      return;
    }

    if (!uploadData.validation.isValid) {
      addToast(
        'Document has validation errors. Please fix them before uploading.',
        'error'
      );
      return;
    }

    if (strictValidation && uploadData.validation.warnings.length > 0) {
      addToast(
        'Strict validation enabled: Please address all warnings before uploading.',
        'error'
      );
      return;
    }

    setUploading(true);

    try {
      const requestBody = {
        content: uploadData.content,
        fileName: uploadData.fileName,
        validateOnly,
        strictValidation,
      };

      const response = await fetch('/api/documents/markdown-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Upload failed');
      }

      if (validateOnly) {
        addToast(
          `Validation complete! Quality score: ${result.validation.qualityScore}/100`,
          'success'
        );
      } else {
        setActiveJobId(result.jobId);
        addToast(
          `Document ingestion started! Quality score: ${result.validation.qualityScore}/100`,
          'success'
        );

        // Reset form
        setUploadData({
          content: '',
          validating: false,
        });
      }
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

  const getValidationBadge = () => {
    if (uploadData.validating) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <Spinner className="w-3 h-3 mr-1" />
          Validating...
        </Badge>
      );
    }
    if (!uploadData.validation) {
      return <Badge variant="secondary">Not Validated</Badge>;
    }
    if (uploadData.validation.isValid) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Valid ({uploadData.validation.qualityScore}/100)
        </Badge>
      );
    }
    if (uploadData.validation.errors.length > 0) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Errors ({uploadData.validation.qualityScore}/100)
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Warnings ({uploadData.validation.qualityScore}/100)
      </Badge>
    );
  };

  const generateExampleMarkdown = () => {
    const timestamp = new Date().toISOString();
    const example = `---
title: "Example Document Title"
docType: "note"
persona: "david"
scraped_at: "${timestamp}"
word_count: 150
extraction_quality: "high"
---

# Example Document Title

This is an example of a properly formatted markdown document for the David-GPT system.

## Key Points

- Complete YAML frontmatter with required fields
- Clear heading hierarchy
- Sufficient content for meaningful search

The document follows the formatting guidelines from DOCS/CONTENT_GUIDE.md.`;

    setUploadData({
      content: example,
      fileName: 'example.md',
      validating: false,
    });
    validateContent(example, 'example.md');
    addToast('Example markdown loaded. Edit as needed.', 'info');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Single Document Upload
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload or create a single markdown document with proper YAML
          frontmatter.
          <Button
            variant="link"
            className="p-0 h-auto text-blue-600"
            onClick={generateExampleMarkdown}
          >
            Load example
          </Button>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Area */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">
              {isDragActive
                ? 'Drop markdown file here'
                : 'Drop a .md file here or click to select'}
            </p>
            <p className="text-xs text-gray-500">
              Only .md and .markdown files are supported
            </p>
          </div>

          {/* Content Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Markdown Content
              </label>
              <div className="flex items-center space-x-2">
                {getValidationBadge()}
                {uploadData.validation && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowValidationDetails(true)}
                    className="h-7 px-2"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              value={uploadData.content}
              onChange={e => handleContentChange(e.target.value)}
              placeholder="Paste your markdown content here or upload a file above..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>

          {/* Advanced Options */}
          <Collapsible
            open={showAdvancedOptions}
            onOpenChange={setShowAdvancedOptions}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between"
              >
                Advanced Options
                <Info className="w-4 h-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={validateOnly}
                    onChange={e => setValidateOnly(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    Validate only (don&apos;t ingest)
                  </span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={strictValidation}
                    onChange={e => setStrictValidation(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    Strict validation (require zero warnings)
                  </span>
                </label>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={
              uploading ||
              uploadData.validating ||
              !uploadData.validation?.isValid
            }
            className="w-full"
          >
            {uploading ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                {validateOnly ? 'Validating...' : 'Uploading...'}
              </>
            ) : validateOnly ? (
              'Validate Document'
            ) : (
              'Upload Document'
            )}
          </Button>
        </form>
      </Card>

      {/* Progress Tracking */}
      {activeJobId && (
        <SingleDocumentProgress
          jobId={activeJobId}
          onComplete={() => {
            setActiveJobId(null);
            onUploadComplete?.();
          }}
        />
      )}

      {/* Validation Details Dialog */}
      <Dialog
        open={showValidationDetails}
        onOpenChange={setShowValidationDetails}
      >
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Validation Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {getValidationBadge()}
              </div>

              {uploadData.validation?.errors &&
                uploadData.validation.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <h4 className="text-sm font-medium text-red-800 mb-1">
                      Errors:
                    </h4>
                    <ul className="text-sm text-red-700 list-disc list-inside">
                      {uploadData.validation.errors.map((error, i) => (
                        <li key={i}>
                          {error.field && (
                            <code className="bg-red-100 px-1 rounded">
                              {error.field}
                            </code>
                          )}
                          : {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {uploadData.validation?.warnings &&
                uploadData.validation.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="text-sm font-medium text-yellow-800 mb-1">
                      Warnings:
                    </h4>
                    <ul className="text-sm text-yellow-700 list-disc list-inside">
                      {uploadData.validation.warnings.map((warning, i) => (
                        <li key={i}>
                          {warning.field && (
                            <code className="bg-yellow-100 px-1 rounded">
                              {warning.field}
                            </code>
                          )}
                          : {warning.message}
                          {warning.suggestion && (
                            <div className="ml-4 mt-1 text-yellow-600">
                              💡 {warning.suggestion}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {uploadData.validation?.suggestions &&
                uploadData.validation.suggestions.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <h4 className="text-sm font-medium text-blue-800 mb-1">
                      Suggestions:
                    </h4>
                    <ul className="text-sm text-blue-700 list-disc list-inside">
                      {uploadData.validation.suggestions.map(
                        (suggestion, i) => (
                          <li key={i}>{suggestion}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

              {uploadData.validation?.isValid && (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <h4 className="text-sm font-medium text-green-800 mb-1">
                    ✅ Document is valid and ready for ingestion!
                  </h4>
                  <p className="text-sm text-green-700">
                    Quality score: {uploadData.validation.qualityScore}/100
                    {uploadData.validation.warnings.length > 0 &&
                      ` (${uploadData.validation.warnings.length} warnings)`}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
