/**
 * Document Preview & Edit Modal
 * Shared component for previewing and editing extracted documents before ingestion
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Save, Zap, Eye, Code, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useJobStatus } from '@/hooks/useJobStatus';
import yaml from 'js-yaml';
import { useToast } from '@/hooks/use-toast';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  initialTitle?: string;
  onIngestSuccess?: () => void;
}

interface DocumentData {
  id: string;
  title: string;
  type: string;
  raw_content: string;
  ingestion_status: 'extracted' | 'ingested' | 'failed';
  extraction_metadata?: any;
}

export function DocumentPreviewModal({
  isOpen,
  onClose,
  docId,
  initialTitle,
  onIngestSuccess,
}: DocumentPreviewModalProps) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [ingestionProgress, setIngestionProgress] = useState<string>('');
  const { toast } = useToast();

  // Poll job status for ingestion
  const { job: currentJob } = useJobStatus({
    jobId: currentJobId,
    pollInterval: 1000,
    onComplete: (job) => {
      setIsIngesting(false);
      setCurrentJobId(null);
      setIngestionProgress('');

      if (job.resultData?.success) {
        toast({
          title: 'Success',
          description: 'Document ingested successfully!',
          variant: 'default',
        });
        onIngestSuccess?.();
        onClose();
      }
    },
    onError: (error) => {
      setIsIngesting(false);
      setCurrentJobId(null);
      setIngestionProgress('');
      toast({
        title: 'Ingestion Failed',
        description: error,
        variant: 'destructive',
      });
    },
  });

  // Update progress based on job status
  useEffect(() => {
    if (currentJob?.progress?.message) {
      setIngestionProgress(currentJob.progress.message);
    }
  }, [currentJob]);

  // Load document data
  useEffect(() => {
    if (isOpen && docId) {
      loadDocument();
    }
  }, [isOpen, docId]);

  const loadDocument = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/documents/${docId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load document');
      }

      setDocument(data.document);
      setEditedContent(data.document.raw_content);
    } catch (error) {
      console.error('Error loading document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load document',
        variant: 'destructive',
      });
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!document) return;

    setIsSaving(true);
    try {
      // Parse updated frontmatter from edited content
      const frontmatterMatch = editedContent.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        throw new Error('Invalid markdown format: missing frontmatter');
      }

      const response = await fetch(`/api/admin/documents/${docId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Extract key fields from edited content
          // For now, just update the full raw_content
          raw_content: editedContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save changes');
      }

      // Reload document to reflect changes
      await loadDocument();
      toast({
        title: 'Success',
        description: 'Changes saved successfully!',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleIngest = async () => {
    if (!document) return;

    if (
      !confirm(
        'This will generate embeddings and make the document searchable. Continue?'
      )
    ) {
      return;
    }

    setIsIngesting(true);
    setIngestionProgress('Starting ingestion...');

    try {
      const response = await fetch(`/api/admin/documents/${docId}/reingest`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ingestion failed');
      }

      // Start polling for job status
      if (data.jobId) {
        setCurrentJobId(data.jobId);
      } else {
        throw new Error('No job ID returned');
      }
    } catch (error) {
      setIsIngesting(false);
      setIngestionProgress('');
      console.error('Error ingesting document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Ingestion failed',
        variant: 'destructive',
      });
    }
  };

  const handleDiscard = async () => {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/documents/${docId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete document');
      }

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
        variant: 'default',
      });
      onIngestSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  // Parse frontmatter and content for better preview rendering
  const parsedContent = React.useMemo(() => {
    const frontmatterMatch = editedContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return { frontmatter: null, content: editedContent };
    }

    try {
      const frontmatter = yaml.load(frontmatterMatch[1]) as any;
      const content = frontmatterMatch[2];
      return { frontmatter, content };
    } catch (error) {
      console.error('Error parsing frontmatter:', error);
      return { frontmatter: null, content: editedContent };
    }
  }, [editedContent]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{initialTitle || document?.title || 'Document Preview'}</span>
            {document?.ingestion_status && (
              <span
                className={`text-xs px-2 py-1 rounded ${
                  document.ingestion_status === 'ingested'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : document.ingestion_status === 'extracted'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                }`}
              >
                {document.ingestion_status}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Preview and edit document metadata before ingestion
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="source">
                  <Code className="h-4 w-4 mr-2" />
                  Source
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-4">
                <div className="border rounded-lg p-6 overflow-y-auto max-h-[calc(90vh-300px)]">
                  {/* Frontmatter Section */}
                  {parsedContent.frontmatter && (
                    <div className="mb-6 p-4 bg-muted/30 rounded-lg border-l-4 border-primary">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                        Document Metadata
                      </h3>
                      <dl className="space-y-2 text-sm">
                        {Object.entries(parsedContent.frontmatter).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-4 gap-2">
                            <dt className="font-medium text-muted-foreground capitalize col-span-1">
                              {key.replace(/_/g, ' ')}:
                            </dt>
                            <dd className="col-span-3">
                              {Array.isArray(value) ? (
                                <div className="flex flex-wrap gap-1">
                                  {value.map((item, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-block px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                                    >
                                      {String(item)}
                                    </span>
                                  ))}
                                </div>
                              ) : typeof value === 'object' && value !== null ? (
                                <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                <span className="text-foreground">{String(value)}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {/* Content Section */}
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{parsedContent.content}</ReactMarkdown>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="source" className="mt-4">
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-[calc(90vh-300px)] font-mono text-sm"
                  placeholder="Markdown content with frontmatter..."
                />
              </TabsContent>
            </Tabs>

            {/* Extraction Metadata */}
            {document?.extraction_metadata &&
              Object.keys(document.extraction_metadata).length > 0 && (
                <div className="mt-4 p-3 bg-muted/50 rounded border">
                  <h4 className="text-sm font-medium mb-2">Extraction Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {Object.entries(document.extraction_metadata).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span>{' '}
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDiscard} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isLoading || isSaving || editedContent === document?.raw_content}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
          <Button
            onClick={handleIngest}
            disabled={isLoading || isIngesting || document?.ingestion_status === 'ingested'}
          >
            {isIngesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {isIngesting && ingestionProgress
              ? ingestionProgress
              : document?.ingestion_status === 'ingested'
              ? 'Re-ingest'
              : 'Ingest Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
