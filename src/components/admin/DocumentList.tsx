/**
 * Document List Component
 * Displays documents in a table with sorting, filtering, and actions
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { DocumentActions } from '@/components/admin/DocumentActions';
import { InlinePersonaEditor } from '@/components/admin/InlinePersonaEditor';
import { JobStatusChip } from '@/components/admin/JobStatusChip';
import { useActiveJobs } from '@/hooks/useActiveJobs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Search } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  personas: string[]; // Multi-persona support
  persona_slug: string; // Deprecated: for backward compatibility
  type: string;
  chunk_count: number;
  file_size: number | null;
  updated_at: string;
  tags: string[];
}

interface DocumentListProps {
  refreshTrigger: number;
  defaultPersonaFilter?: string;
}

export function DocumentList({ refreshTrigger, defaultPersonaFilter }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch documents function (extracted for reuse)
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/documents');
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Active jobs polling (real-time progress UI)
  const { jobs: activeJobs, getJobForDocument } = useActiveJobs({
    pollInterval: 2000,
    onJobComplete: useCallback(() => {
      // Refresh document list when any job completes
      fetchDocuments();
    }, [fetchDocuments]),
  });

  // Bulk ingestion state
  const [showBulkIngestDialog, setShowBulkIngestDialog] = useState(false);
  const [isBulkIngesting, setIsBulkIngesting] = useState(false);
  const [bulkIngestError, setBulkIngestError] = useState<string | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);

  // Bulk delete state
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Filters
  const [personaFilter, setPersonaFilter] = useState<string>(defaultPersonaFilter || 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotIngested, setShowNotIngested] = useState(false);

  // Update persona filter when default changes
  useEffect(() => {
    if (defaultPersonaFilter) {
      setPersonaFilter(defaultPersonaFilter);
    }
  }, [defaultPersonaFilter]);

  // Sorting
  const [sortBy, setSortBy] = useState<'title' | 'updated_at' | 'chunk_count'>(
    'updated_at'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch documents on mount and when refreshTrigger changes
  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger, fetchDocuments]);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...documents];

    // Persona filter (check if any of the document's personas match)
    if (personaFilter !== 'all') {
      filtered = filtered.filter((doc) => doc.personas.includes(personaFilter));
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((doc) => doc.type === typeFilter);
    }

    // Not ingested filter
    if (showNotIngested) {
      filtered = filtered.filter((doc) => doc.chunk_count === 0);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          doc.id.toLowerCase().includes(query) ||
          doc.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortBy];
      let bVal: any = b[sortBy];

      if (sortBy === 'updated_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredDocs(filtered);
  }, [documents, personaFilter, typeFilter, searchQuery, sortBy, sortOrder, showNotIngested]);

  const handleDocumentDeleted = (docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const handleDocumentUpdated = async (docId: string) => {
    // Fetch only the updated document instead of reloading the entire list
    try {
      const response = await fetch(`/api/admin/documents/${docId}`);
      if (!response.ok) {
        console.error('Failed to fetch updated document');
        return;
      }

      const data = await response.json();
      const updatedDoc = data.document;

      // Update the document in the list
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === docId ? updatedDoc : doc))
      );
    } catch (error) {
      console.error('Error fetching updated document:', error);
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((doc) => doc.id)));
    }
  };

  const toggleSelectDoc = (docId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedIds(newSelection);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkIngest = async () => {
    try {
      setIsBulkIngesting(true);
      setBulkIngestError(null);

      const docIds = Array.from(selectedIds);

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

      setJobIds(data.jobIds || []);
      setShowBulkIngestDialog(false);
      clearSelection();

      // Refetch documents to show updated status
      fetchDocuments();
    } catch (err) {
      setBulkIngestError(
        err instanceof Error ? err.message : 'Bulk ingestion failed'
      );
    } finally {
      setIsBulkIngesting(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      setIsBulkDeleting(true);
      setBulkDeleteError(null);

      const docIds = Array.from(selectedIds);

      // Delete each document
      const deletePromises = docIds.map(docId =>
        fetch(`/api/admin/documents/${docId}`, {
          method: 'DELETE',
        })
      );

      const responses = await Promise.all(deletePromises);
      const failures = responses.filter(r => !r.ok);

      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} document(s)`);
      }

      setShowBulkDeleteDialog(false);
      clearSelection();

      // Remove deleted documents from the list
      setDocuments(prev => prev.filter(doc => !selectedIds.has(doc.id)));
    } catch (err) {
      setBulkDeleteError(
        err instanceof Error ? err.message : 'Bulk deletion failed'
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const uniquePersonas = Array.from(
    new Set(documents.flatMap((d) => d.personas))
  ).sort();
  const uniqueTypes = Array.from(new Set(documents.map((d) => d.type)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg p-6 bg-red-50">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 items-center bg-card border rounded-lg p-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, ID, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="relative">
          <Select
            value={personaFilter}
            onValueChange={setPersonaFilter}
            disabled={!!defaultPersonaFilter}
          >
            <SelectTrigger className={`w-[150px] ${defaultPersonaFilter ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <SelectValue placeholder="Persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Personas</SelectItem>
              {uniquePersonas.map((persona) => (
                <SelectItem key={persona} value={persona}>
                  {persona}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {defaultPersonaFilter && (
            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
              Global
            </div>
          )}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showNotIngested ? 'default' : 'outline'}
          onClick={() => setShowNotIngested(!showNotIngested)}
        >
          Not Ingested (0 chunks)
        </Button>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-blue-900">
              ✓ {selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Deselect All
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                Delete Selected ({selectedIds.size})
              </Button>
              <Button size="sm" onClick={() => setShowBulkIngestDialog(true)}>
                Ingest Selected ({selectedIds.size})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filteredDocs.length} of {documents.length} documents
        </span>
      </div>

      {/* Table */}
      {filteredDocs.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-1">No documents found</p>
          <p className="text-sm text-muted-foreground">
            {searchQuery || personaFilter !== 'all' || typeFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Upload your first document to get started'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium w-12">
                    <Checkbox
                      checked={selectedIds.size === filteredDocs.length && filteredDocs.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th
                    className="text-left p-4 font-medium cursor-pointer hover:bg-muted/80"
                    onClick={() => toggleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      Title
                      {sortBy === 'title' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="text-left p-4 font-medium">Persona</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th
                    className="text-left p-4 font-medium cursor-pointer hover:bg-muted/80"
                    onClick={() => toggleSort('chunk_count')}
                  >
                    <div className="flex items-center gap-2">
                      Chunks
                      {sortBy === 'chunk_count' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="text-left p-4 font-medium">Size</th>
                  <th
                    className="text-left p-4 font-medium cursor-pointer hover:bg-muted/80"
                    onClick={() => toggleSort('updated_at')}
                  >
                    <div className="flex items-center gap-2">
                      Last Updated
                      {sortBy === 'updated_at' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`border-b last:border-0 hover:bg-muted/50 ${
                      selectedIds.has(doc.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="p-4">
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleSelectDoc(doc.id)}
                      />
                    </td>
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {doc.id}
                        </p>
                        {doc.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {doc.tags.length > 3 && (
                              <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded">
                                +{doc.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <InlinePersonaEditor
                        docId={doc.id}
                        currentPersonas={doc.personas}
                        onUpdate={() => {
                          // Refetch documents to show updated personas
                          fetchDocuments();
                        }}
                      />
                    </td>
                    <td className="p-4 text-sm">{doc.type}</td>
                    <td className="p-4 text-sm">
                      <span className={doc.chunk_count === 0 ? 'font-bold text-red-600' : ''}>
                        {doc.chunk_count}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {doc.file_size
                        ? `${(doc.file_size / 1024).toFixed(1)} KB`
                        : '-'}
                    </td>
                    <td className="p-4">
                      {(() => {
                        const job = getJobForDocument(doc.id);
                        if (job) {
                          // Map job type to status display
                          const status =
                            job.jobType === 'reingest'
                              ? 'ingesting'
                              : job.jobType === 'pdf' ||
                                  job.jobType === 'url_single' ||
                                  job.jobType === 'url_batch' ||
                                  job.jobType === 'markdown_single' ||
                                  job.jobType === 'markdown_batch'
                                ? 'extracting'
                                : job.status === 'completed'
                                  ? 'completed'
                                  : job.status === 'failed'
                                    ? 'failed'
                                    : null;

                          return (
                            <JobStatusChip
                              status={status as any}
                              progress={job.progress}
                              error={job.error}
                            />
                          );
                        }
                        // No active job - show normal timestamp
                        return (
                          <JobStatusChip status={null} timestamp={doc.updated_at} />
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <DocumentActions
                        document={doc}
                        onDeleted={handleDocumentDeleted}
                        onUpdated={handleDocumentUpdated}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Ingest Confirmation Dialog */}
      <Dialog open={showBulkIngestDialog} onOpenChange={setShowBulkIngestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingest {selectedIds.size} Document{selectedIds.size !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This will create chunks and embeddings for the selected documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="list-disc list-inside space-y-1">
              {Array.from(selectedIds)
                .slice(0, 3)
                .map((id) => {
                  const doc = documents.find((d) => d.id === id);
                  return doc ? (
                    <li key={id}>
                      {doc.title} ({doc.persona_slug})
                    </li>
                  ) : null;
                })}
              {selectedIds.size > 3 && (
                <li>... and {selectedIds.size - 3} more</li>
              )}
            </ul>
            <p className="text-sm text-muted-foreground">
              Estimated processing time: ~{Math.ceil(selectedIds.size * 0.5)}-{selectedIds.size} minutes
            </p>
          </div>

          {bulkIngestError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {bulkIngestError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkIngestDialog(false)}
              disabled={isBulkIngesting}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkIngest} disabled={isBulkIngesting}>
              {isBulkIngesting ? 'Starting Ingestion...' : 'Start Ingestion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Document{selectedIds.size !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the selected documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="list-disc list-inside space-y-1">
              {Array.from(selectedIds)
                .slice(0, 3)
                .map((id) => {
                  const doc = documents.find((d) => d.id === id);
                  return doc ? (
                    <li key={id}>
                      {doc.title}
                    </li>
                  ) : null;
                })}
              {selectedIds.size > 3 && (
                <li>... and {selectedIds.size - 3} more</li>
              )}
            </ul>
            <p className="text-sm font-medium text-red-600">
              All chunks, embeddings, and metadata will be permanently removed.
            </p>
          </div>

          {bulkDeleteError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {bulkDeleteError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteDialog(false)}
              disabled={isBulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete Forever'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
