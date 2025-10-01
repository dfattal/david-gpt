/**
 * Document Metadata Editor Component
 * Split-pane editor for frontmatter, Key Terms, and Also Known As
 */

'use client';

import { useState, useEffect } from 'react';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import matter from 'gray-matter';

interface Document {
  id: string;
  title: string;
  type: string;
  tags: string[];
  raw_content: string;
}

interface DocumentMetadataEditorProps {
  document: Document;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  title: string;
  type: string;
  date: string;
  source_url: string;
  tags: string[];
  summary: string;
  license: string;
  author: string;
  publisher: string;
  keyTerms: string[];
  alsoKnownAs: Record<string, string[]>;
  identifiers: Record<string, string>;
  dates: Record<string, string>;
  actors: Array<{ name: string; role: string }>;
}

export function DocumentMetadataEditor({
  document,
  isOpen,
  onClose,
  onSuccess,
}: DocumentMetadataEditorProps) {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    type: 'other',
    date: '',
    source_url: '',
    tags: [],
    summary: '',
    license: '',
    author: '',
    publisher: '',
    keyTerms: [],
    alsoKnownAs: {},
    identifiers: {},
    dates: {},
    actors: [],
  });

  const [tagInput, setTagInput] = useState('');
  const [keyTermInput, setKeyTermInput] = useState('');
  const [akaTermInput, setAkaTermInput] = useState('');
  const [akaAliasesInput, setAkaAliasesInput] = useState('');
  const [identifierKey, setIdentifierKey] = useState('');
  const [identifierValue, setIdentifierValue] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [actorName, setActorName] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse document content on load
  useEffect(() => {
    if (!document) return;

    try {
      const { data: frontmatter, content } = matter(document.raw_content);

      // Extract Key Terms from content
      const keyTermsMatch = content.match(/\*\*Key Terms\*\*:\s*([^\n]+)/);
      const keyTerms = keyTermsMatch
        ? keyTermsMatch[1].split(',').map((t) => t.trim())
        : [];

      // Extract Also Known As from content
      const akaMatch = content.match(
        /\*\*Also Known As\*\*:\s*([^\n]+)/
      );
      const aka: Record<string, string[]> = {};
      if (akaMatch) {
        // Parse "term: alias1, alias2" format
        const akaStr = akaMatch[1];
        const entries = akaStr.split(',').map((e) => e.trim());
        entries.forEach((entry) => {
          const [term, ...aliases] = entry.split(':').map((s) => s.trim());
          if (term) {
            aka[term] = aliases.length ? aliases : [];
          }
        });
      }

      // Convert any Date objects to strings
      const serializeDates = (obj: any): Record<string, string> => {
        if (!obj) return {};
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value instanceof Date) {
            result[key] = value.toISOString().split('T')[0];
          } else if (typeof value === 'string') {
            result[key] = value;
          } else {
            result[key] = String(value);
          }
        }
        return result;
      };

      setFormData({
        title: frontmatter.title || document.title,
        type: frontmatter.type || 'other',
        date: frontmatter.date instanceof Date ? frontmatter.date.toISOString().split('T')[0] : (frontmatter.date || ''),
        source_url: frontmatter.source_url || '',
        tags: frontmatter.tags || document.tags || [],
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
      setError('Failed to parse document content');
    }
  }, [document]);

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const handleAddKeyTerm = () => {
    if (keyTermInput.trim() && !formData.keyTerms.includes(keyTermInput.trim())) {
      setFormData({
        ...formData,
        keyTerms: [...formData.keyTerms, keyTermInput.trim()],
      });
      setKeyTermInput('');
    }
  };

  const handleRemoveKeyTerm = (term: string) => {
    setFormData({
      ...formData,
      keyTerms: formData.keyTerms.filter((t) => t !== term),
    });
  };

  const handleAddAKA = () => {
    if (akaTermInput.trim()) {
      const aliases = akaAliasesInput
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a);

      setFormData({
        ...formData,
        alsoKnownAs: {
          ...formData.alsoKnownAs,
          [akaTermInput.trim()]: aliases,
        },
      });
      setAkaTermInput('');
      setAkaAliasesInput('');
    }
  };

  const handleRemoveAKA = (term: string) => {
    const { [term]: removed, ...rest } = formData.alsoKnownAs;
    setFormData({
      ...formData,
      alsoKnownAs: rest,
    });
  };

  const handleAddIdentifier = () => {
    if (identifierKey.trim() && identifierValue.trim()) {
      setFormData({
        ...formData,
        identifiers: {
          ...formData.identifiers,
          [identifierKey.trim()]: identifierValue.trim(),
        },
      });
      setIdentifierKey('');
      setIdentifierValue('');
    }
  };

  const handleRemoveIdentifier = (key: string) => {
    const { [key]: removed, ...rest } = formData.identifiers;
    setFormData({
      ...formData,
      identifiers: rest,
    });
  };

  const handleAddDate = () => {
    if (dateKey.trim() && dateValue.trim()) {
      setFormData({
        ...formData,
        dates: {
          ...formData.dates,
          [dateKey.trim()]: dateValue.trim(),
        },
      });
      setDateKey('');
      setDateValue('');
    }
  };

  const handleRemoveDate = (key: string) => {
    const { [key]: removed, ...rest } = formData.dates;
    setFormData({
      ...formData,
      dates: rest,
    });
  };

  const handleAddActor = () => {
    if (actorName.trim() && actorRole.trim()) {
      setFormData({
        ...formData,
        actors: [
          ...formData.actors,
          { name: actorName.trim(), role: actorRole.trim() },
        ],
      });
      setActorName('');
      setActorRole('');
    }
  };

  const handleRemoveActor = (index: number) => {
    setFormData({
      ...formData,
      actors: formData.actors.filter((_, i) => i !== index),
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/admin/documents/${document.id}/metadata`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update metadata');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Document Metadata</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Document title"
            />
          </div>

          {/* Type and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-2">Type</label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog">Blog</SelectItem>
                  <SelectItem value="press">Press Release</SelectItem>
                  <SelectItem value="spec">Specification</SelectItem>
                  <SelectItem value="tech_memo">Tech Memo</SelectItem>
                  <SelectItem value="faq">FAQ</SelectItem>
                  <SelectItem value="slide">Slides</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="patent">Patent</SelectItem>
                  <SelectItem value="release_notes">Release Notes</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Date</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
              />
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="text-sm font-medium block mb-2">Source URL</label>
            <Input
              value={formData.source_url}
              onChange={(e) =>
                setFormData({ ...formData, source_url: e.target.value })
              }
              placeholder="https://..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium block mb-2">Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Add tag..."
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-primary/10 text-primary rounded flex items-center gap-2"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-primary/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Summary <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={formData.summary}
              onChange={(e) =>
                setFormData({ ...formData, summary: e.target.value })
              }
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
                onValueChange={(value) =>
                  setFormData({ ...formData, license: value === 'none' ? '' : value })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Publisher</label>
              <Input
                value={formData.publisher}
                onChange={(e) =>
                  setFormData({ ...formData, publisher: e.target.value })
                }
              />
            </div>
          </div>

          {/* Key Terms */}
          <div>
            <label className="text-sm font-medium block mb-2">Key Terms</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={keyTermInput}
                onChange={(e) => setKeyTermInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyTerm())}
                placeholder="Add key term..."
              />
              <Button type="button" onClick={handleAddKeyTerm} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {formData.keyTerms.map((term) => (
                <span
                  key={term}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-2"
                >
                  {term}
                  <button
                    onClick={() => handleRemoveKeyTerm(term)}
                    className="hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Also Known As */}
          <div>
            <label className="text-sm font-medium block mb-2">Also Known As (AKA)</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={akaTermInput}
                onChange={(e) => setAkaTermInput(e.target.value)}
                placeholder="Term..."
                className="flex-1"
              />
              <Input
                value={akaAliasesInput}
                onChange={(e) => setAkaAliasesInput(e.target.value)}
                placeholder="Aliases (comma-separated)..."
                className="flex-1"
              />
              <Button type="button" onClick={handleAddAKA} variant="outline">
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {Object.entries(formData.alsoKnownAs).map(([term, aliases]) => (
                <div
                  key={term}
                  className="flex items-center gap-2 p-2 bg-muted rounded"
                >
                  <span className="font-medium">{term}:</span>
                  <span className="text-muted-foreground">
                    {aliases.join(', ') || '(no aliases)'}
                  </span>
                  <button
                    onClick={() => handleRemoveAKA(term)}
                    className="ml-auto hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
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
                <div
                  key={key}
                  className="flex items-center gap-2 p-2 bg-muted rounded"
                >
                  <span className="font-medium">{key}:</span>
                  <span className="text-muted-foreground">{value}</span>
                  <button
                    onClick={() => handleRemoveIdentifier(key)}
                    className="ml-auto hover:text-red-600"
                  >
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
                <div
                  key={key}
                  className="flex items-center gap-2 p-2 bg-muted rounded"
                >
                  <span className="font-medium">{key}:</span>
                  <span className="text-muted-foreground">{value}</span>
                  <button
                    onClick={() => handleRemoveDate(key)}
                    className="ml-auto hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actors */}
          <div>
            <label className="text-sm font-medium block mb-2">Actors</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={actorName}
                onChange={(e) => setActorName(e.target.value)}
                placeholder="Name..."
                className="flex-1"
              />
              <Input
                value={actorRole}
                onChange={(e) => setActorRole(e.target.value)}
                placeholder="Role (e.g., inventor, author)..."
                className="flex-1"
              />
              <Button type="button" onClick={handleAddActor} variant="outline">
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {formData.actors.map((actor, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-muted rounded"
                >
                  <span className="font-medium">{actor.name}</span>
                  <span className="text-muted-foreground">({actor.role})</span>
                  <button
                    onClick={() => handleRemoveActor(index)}
                    className="ml-auto hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !formData.title || !formData.summary}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
