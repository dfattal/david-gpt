/**
 * Document List Component
 * Displays documents in a table with sorting, filtering, and actions
 */

'use client';

import { useState, useEffect } from 'react';
import { DocumentActions } from '@/components/admin/DocumentActions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FileText, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Document {
  id: string;
  title: string;
  persona_slug: string;
  type: string;
  chunk_count: number;
  file_size: number | null;
  updated_at: string;
  tags: string[];
}

interface DocumentListProps {
  refreshTrigger: number;
}

export function DocumentList({ refreshTrigger }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<'title' | 'updated_at' | 'chunk_count'>(
    'updated_at'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch documents
  useEffect(() => {
    const fetchDocuments = async () => {
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
    };

    fetchDocuments();
  }, [refreshTrigger]);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...documents];

    // Persona filter
    if (personaFilter !== 'all') {
      filtered = filtered.filter((doc) => doc.persona_slug === personaFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((doc) => doc.type === typeFilter);
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
  }, [documents, personaFilter, typeFilter, searchQuery, sortBy, sortOrder]);

  const handleDocumentDeleted = (docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const handleDocumentUpdated = () => {
    // Trigger refresh after update
    window.location.reload();
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
    new Set(documents.map((d) => d.persona_slug))
  );
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

        <Select value={personaFilter} onValueChange={setPersonaFilter}>
          <SelectTrigger className="w-[150px]">
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
      </div>

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
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/50">
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
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded">
                        {doc.persona_slug}
                      </span>
                    </td>
                    <td className="p-4 text-sm">{doc.type}</td>
                    <td className="p-4 text-sm">{doc.chunk_count}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {doc.file_size
                        ? `${(doc.file_size / 1024).toFixed(1)} KB`
                        : '-'}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.updated_at), {
                        addSuffix: true,
                      })}
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
    </div>
  );
}
