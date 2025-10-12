/**
 * Unified Document Metadata & Preview Modal
 * Combines metadata editing, content preview, and ingestion functionality
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Save, Zap, Edit, Eye, Code, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useToast } from '@/hooks/use-toast';
import matter from 'gray-matter';
import yaml from 'js-yaml';

interface Document {
  id: string;
  title: string;
  type: string;
  tags: string[];
  raw_content: string;
  ingestion_status?: 'extracted' | 'ingested' | 'failed';
  extraction_metadata?: any;
}

interface DocumentMetadataModalProps {
  document?: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;

  // Optional features
  showIngestButton?: boolean;
  showDeleteButton?: boolean;
  showExtractionStats?: boolean;
  defaultTab?: 'edit' | 'preview' | 'source';
}

interface FormData {
  title: string;
  type: string;
  date: string;
  source_url: string;
  summary: string;
  license: string;
  author: string;
  publisher: string;
  keyTerms: string[];
  alsoKnownAs: string[];
  identifiers: Record<string, string>;
  dates: Record<string, string>;
  actors: Array<{ name: string; role: string; affiliation?: string }>;
}

export function DocumentMetadataModal({
  document: initialDocument,
  isOpen,
  onClose,
  onSuccess,
  showIngestButton = false,
  showDeleteButton = false,
  showExtractionStats = false,
  defaultTab = 'edit',
}: DocumentMetadataModalProps) {
  const [document, setDocument] = useState<Document | null>(initialDocument || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'source'>(defaultTab);
  const [editedContent, setEditedContent] = useState('');
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState<FormData>({
    title: '',
    type: 'other',
    date: '',
    source_url: '',
    summary: '',
    license: '',
    author: '',
    publisher: '',
    keyTerms: [],
    alsoKnownAs: [],
    identifiers: {},
    dates: {},
    actors: [],
  });

  // Input states for adding items
  const [keyTermInput, setKeyTermInput] = useState('');
  const [akaInput, setAkaInput] = useState('');
  const [identifierKey, setIdentifierKey] = useState('');
  const [identifierValue, setIdentifierValue] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [actorName, setActorName] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [actorAffiliation, setActorAffiliation] = useState('');

  // Ingestion job tracking
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [ingestionProgress, setIngestionProgress] = useState<string>('');

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
        onSuccess();
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

  // Load document data on open
  useEffect(() => {
    if (isOpen && initialDocument) {
      loadDocument(initialDocument);
    }
  }, [isOpen, initialDocument]);

  const loadDocument = async (doc: Document) => {
    setIsLoading(true);
    try {
      // If we don't have raw_content, fetch it
      if (!doc.raw_content) {
        const response = await fetch(`/api/admin/documents/${doc.id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load document');
        }

        doc = data.document;
      }

      setDocument(doc);
      setEditedContent(doc.raw_content);
      parseDocumentContent(doc.raw_content, doc);
    } catch (err) {
      console.error('Error loading document:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load document',
        variant: 'destructive',
      });
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // Parse document content into form fields
  const parseDocumentContent = (content: string, doc: Document) => {
    try {
      const { data: frontmatter, content: bodyContent } = matter(content);

      // Extract Key Terms from content
      const keyTermsMatch = bodyContent.match(/\*\*Key Terms\*\*:\s*([^\n]+)/);
      const keyTerms = keyTermsMatch
        ? keyTermsMatch[1].split(',').map((t) => t.trim())
        : [];

      // Extract Also Known As from content
      const akaMatch = bodyContent.match(/\*\*Also Known As\*\*:\s*([^\n]+)/);
      const aka: string[] = akaMatch
        ? akaMatch[1].split(',').map((a) => a.trim()).filter((a) => a)
        : [];

      // Helper to convert dates to string
      const toDateString = (value: any): string => {
        if (!value) return '';
        if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
        if (typeof value === 'string') {
          const parsed = new Date(value);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
        }
        return String(value);
      };

      const serializeDates = (obj: any): Record<string, string> => {
        if (!obj) return {};
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = toDateString(value);
        }
        return result;
      };

      setFormData({
        title: frontmatter.title || doc.title,
        type: frontmatter.type || 'other',
        date: toDateString(frontmatter.dates?.created || frontmatter.dates?.published || frontmatter.date),
        source_url: frontmatter.identifiers?.source_url || frontmatter.source_url || '',
        summary: frontmatter.summary || '',
        license: frontmatter.license || '',
        author: frontmatter.author || '',
        publisher: frontmatter.publisher || '',
        keyTerms,
        alsoKnownAs: aka,
        identifiers: frontmatter.identifiers || {},
        dates: serializeDates(frontmatter.dates),
        actors: frontmatter.actors || [],
      });
    } catch (err) {
      console.error('Failed to parse document content:', err);
      setError(`Failed to parse document content: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Parse content for preview rendering
  const parsedContent = useMemo(() => {
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

  // Handler functions for adding/removing items
  const handleAddKeyTerm = () => {
    if (!keyTermInput.trim()) return;

    // Split by comma and process each term
    const newTerms = keyTermInput
      .split(',')
      .map(term => term.trim())
      .filter(term => term && !formData.keyTerms.includes(term));

    if (newTerms.length > 0) {
      setFormData({ ...formData, keyTerms: [...formData.keyTerms, ...newTerms] });
      setKeyTermInput('');
    }
  };

  const handleRemoveKeyTerm = (term: string) => {
    setFormData({ ...formData, keyTerms: formData.keyTerms.filter((t) => t !== term) });
  };

  const handleAddAKA = () => {
    if (!akaInput.trim()) return;

    // Split by comma and process each alias
    const newAliases = akaInput
      .split(',')
      .map(alias => alias.trim())
      .filter(alias => alias && !formData.alsoKnownAs.includes(alias));

    if (newAliases.length > 0) {
      setFormData({ ...formData, alsoKnownAs: [...formData.alsoKnownAs, ...newAliases] });
      setAkaInput('');
    }
  };

  const handleRemoveAKA = (alias: string) => {
    setFormData({ ...formData, alsoKnownAs: formData.alsoKnownAs.filter((a) => a !== alias) });
  };

  const handleAddIdentifier = () => {
    if (identifierKey.trim() && identifierValue.trim()) {
      setFormData({
        ...formData,
        identifiers: { ...formData.identifiers, [identifierKey.trim()]: identifierValue.trim() },
      });
      setIdentifierKey('');
      setIdentifierValue('');
    }
  };

  const handleRemoveIdentifier = (key: string) => {
    const { [key]: removed, ...rest } = formData.identifiers;
    setFormData({ ...formData, identifiers: rest });
  };

  const handleAddDate = () => {
    if (dateKey.trim() && dateValue.trim()) {
      setFormData({
        ...formData,
        dates: { ...formData.dates, [dateKey.trim()]: dateValue.trim() },
      });
      setDateKey('');
      setDateValue('');
    }
  };

  const handleRemoveDate = (key: string) => {
    const { [key]: removed, ...rest } = formData.dates;
    setFormData({ ...formData, dates: rest });
  };

  const handleAddActor = () => {
    if (actorName.trim() && actorRole.trim()) {
      const newActor: { name: string; role: string; affiliation?: string } = {
        name: actorName.trim(),
        role: actorRole.trim(),
      };
      if (actorAffiliation.trim()) {
        newActor.affiliation = actorAffiliation.trim();
      }
      setFormData({ ...formData, actors: [...formData.actors, newActor] });
      setActorName('');
      setActorRole('');
      setActorAffiliation('');
    }
  };

  const handleRemoveActor = (index: number) => {
    setFormData({ ...formData, actors: formData.actors.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!document) return;

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/admin/documents/${document.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update metadata');
      }

      toast({
        title: 'Success',
        description: 'Metadata saved successfully!',
        variant: 'default',
      });

      // Notify parent of success and close modal
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleIngest = async () => {
    if (!document) return;

    if (!confirm('This will generate embeddings and make the document searchable. Continue?')) {
      return;
    }

    setIsIngesting(true);
    setIngestionProgress('Starting ingestion...');

    try {
      const response = await fetch(`/api/admin/documents/${document.id}/reingest`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ingestion failed');
      }

      if (data.jobId) {
        setCurrentJobId(data.jobId);
      } else {
        throw new Error('No job ID returned');
      }
    } catch (error) {
      setIsIngesting(false);
      setIngestionProgress('');
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Ingestion failed',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!document) return;

    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/documents/${document.id}`, {
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
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{document?.title || 'Document Metadata'}</span>
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
            {showIngestButton ? 'Preview and edit document before ingestion' : 'Edit document metadata'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="edit">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Metadata
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="source">
                  <Code className="h-4 w-4 mr-2" />
                  Source
                </TabsTrigger>
              </TabsList>

              {/* Edit Metadata Tab */}
              <TabsContent value="edit" className="mt-4">
                <div className="overflow-y-auto max-h-[calc(90vh-300px)] space-y-6 pr-2">
                  {/* Title */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Document title"
                    />
                  </div>

                  {/* Type and Date */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">Type</label>
                      <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="arxiv">Paper (Academic)</SelectItem>
                          <SelectItem value="patent">Patent</SelectItem>
                          <SelectItem value="article">Article</SelectItem>
                          <SelectItem value="technical_note">Technical Note</SelectItem>
                          <SelectItem value="release_notes">Release Notes</SelectItem>
                          <SelectItem value="spec">Specification</SelectItem>
                          <SelectItem value="blog">Blog</SelectItem>
                          <SelectItem value="press">Press Release</SelectItem>
                          <SelectItem value="tech_memo">Tech Memo</SelectItem>
                          <SelectItem value="faq">FAQ</SelectItem>
                          <SelectItem value="slide">Slides</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">Date</label>
                      <Input
                        type="date"
                        value={formData.date}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          setFormData({
                            ...formData,
                            date: newDate,
                            dates: { ...formData.dates, created: newDate },
                          });
                        }}
                      />
                    </div>
                  </div>

                  {/* Source URL */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Source URL</label>
                    <Input
                      value={formData.source_url}
                      onChange={(e) => {
                        const newUrl = e.target.value;
                        setFormData({
                          ...formData,
                          source_url: newUrl,
                          identifiers: { ...formData.identifiers, source_url: newUrl },
                        });
                      }}
                      placeholder="https://..."
                    />
                  </div>

                  {/* Summary */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Summary <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      placeholder="Brief summary of the document..."
                      rows={3}
                    />
                  </div>

                  {/* License, Author, Publisher */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">License</label>
                      <Select
                        value={formData.license || 'none'}
                        onValueChange={(value) => setFormData({ ...formData, license: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="public">Public Domain</SelectItem>
                          <SelectItem value="cc-by">CC BY</SelectItem>
                          <SelectItem value="proprietary">Proprietary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">Author</label>
                      <Input
                        value={formData.author}
                        onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">Publisher</label>
                      <Input
                        value={formData.publisher}
                        onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Key Terms */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Key Terms</label>
                    <p className="text-xs text-muted-foreground mb-2">Comma-separated values supported (e.g., &quot;term1, term2, term3&quot;)</p>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={keyTermInput}
                        onChange={(e) => setKeyTermInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyTerm())}
                        placeholder="Add key terms (comma-separated)..."
                      />
                      <Button type="button" onClick={handleAddKeyTerm} variant="outline">
                        Add
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {formData.keyTerms.map((term) => (
                        <span key={term} className="px-3 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-2">
                          {term}
                          <button onClick={() => handleRemoveKeyTerm(term)} className="hover:text-blue-600">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Also Known As */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Also Known As (Document Aliases)</label>
                    <p className="text-xs text-muted-foreground mb-2">Alternative names or titles for this document (comma-separated values supported)</p>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={akaInput}
                        onChange={(e) => setAkaInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAKA())}
                        placeholder="Add aliases (comma-separated)..."
                      />
                      <Button type="button" onClick={handleAddAKA} variant="outline">
                        Add
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {formData.alsoKnownAs.map((alias) => (
                        <span key={alias} className="px-3 py-1 bg-purple-100 text-purple-700 rounded flex items-center gap-2">
                          {alias}
                          <button onClick={() => handleRemoveAKA(alias)} className="hover:text-purple-600">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Identifiers */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Identifiers</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={identifierKey}
                        onChange={(e) => setIdentifierKey(e.target.value)}
                        placeholder="Type (e.g., patent_number, doi)..."
                        className="flex-1"
                      />
                      <Input
                        value={identifierValue}
                        onChange={(e) => setIdentifierValue(e.target.value)}
                        placeholder="Value..."
                        className="flex-1"
                      />
                      <Button type="button" onClick={handleAddIdentifier} variant="outline">
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(formData.identifiers).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <span className="font-medium">{key}:</span>
                          <span className="text-muted-foreground">{value}</span>
                          <button onClick={() => handleRemoveIdentifier(key)} className="ml-auto hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Structured Dates</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={dateKey}
                        onChange={(e) => setDateKey(e.target.value)}
                        placeholder="Type (e.g., filing, publication)..."
                        className="flex-1"
                      />
                      <Input
                        type="date"
                        value={dateValue}
                        onChange={(e) => setDateValue(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" onClick={handleAddDate} variant="outline">
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(formData.dates).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <span className="font-medium">{key}:</span>
                          <span className="text-muted-foreground">{value}</span>
                          <button onClick={() => handleRemoveDate(key)} className="ml-auto hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actors */}
                  <div>
                    <label className="text-sm font-medium block mb-2">Actors</label>
                    <div className="grid grid-cols-12 gap-2 mb-2">
                      <Input
                        value={actorName}
                        onChange={(e) => setActorName(e.target.value)}
                        placeholder="Name..."
                        className="col-span-4"
                      />
                      <Input
                        value={actorRole}
                        onChange={(e) => setActorRole(e.target.value)}
                        placeholder="Role (inventor, author)..."
                        className="col-span-3"
                      />
                      <Input
                        value={actorAffiliation}
                        onChange={(e) => setActorAffiliation(e.target.value)}
                        placeholder="Affiliation (optional)..."
                        className="col-span-4"
                      />
                      <Button type="button" onClick={handleAddActor} variant="outline" className="col-span-1">
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {formData.actors.map((actor, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <span className="font-medium">{actor.name}</span>
                          <span className="text-muted-foreground">({actor.role})</span>
                          {actor.affiliation && (
                            <span className="text-xs text-muted-foreground">- {actor.affiliation}</span>
                          )}
                          <button onClick={() => handleRemoveActor(index)} className="ml-auto hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Preview Tab */}
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

              {/* Source Tab */}
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
            {showExtractionStats &&
              document?.extraction_metadata &&
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
          {showDeleteButton && (
            <Button variant="outline" onClick={handleDelete} disabled={isLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={isLoading || isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !formData.title || !formData.summary}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
          {showIngestButton && (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
