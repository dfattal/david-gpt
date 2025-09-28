'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EntityMergeDialog } from './entity-merge-dialog';
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Merge,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  kind: string;
  description?: string;
  authority_score: number;
  mention_count: number;
  created_at: string;
  updated_at: string;
}

interface EntitySearchParams {
  q?: string;
  kind?: string;
  limit: number;
  offset: number;
  sortBy: 'name' | 'authority_score' | 'mention_count' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

const ENTITY_KINDS = [
  'person',
  'organization',
  'product',
  'technology',
  'component',
  'document',
];

const KIND_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-800',
  organization: 'bg-green-100 text-green-800',
  product: 'bg-purple-100 text-purple-800',
  technology: 'bg-orange-100 text-orange-800',
  component: 'bg-red-100 text-red-800',
  document: 'bg-gray-100 text-gray-800',
  algorithm: 'bg-indigo-100 text-indigo-800',
  material: 'bg-yellow-100 text-yellow-800',
  concept: 'bg-pink-100 text-pink-800',
  venue: 'bg-cyan-100 text-cyan-800',
  location: 'bg-emerald-100 text-emerald-800',
  dataset: 'bg-slate-100 text-slate-800',
};

export function EntityBrowser() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set()
  );

  const [searchParams, setSearchParams] = useState<EntitySearchParams>({
    q: '',
    kind: '',
    limit: 25,
    offset: 0,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 25,
  });

  const [showFilters, setShowFilters] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Fetch entities from API
  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchParams.q) params.set('q', searchParams.q);
      if (searchParams.kind) params.set('kind', searchParams.kind);
      params.set('limit', searchParams.limit.toString());
      params.set('offset', searchParams.offset.toString());
      params.set('sortBy', searchParams.sortBy);
      params.set('sortOrder', searchParams.sortOrder);

      const response = await fetch(`/api/admin/entities?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch entities: ${response.statusText}`);
      }

      const data = await response.json();
      setEntities(data.entities || []);
      setPagination(data.pagination || { total: 0, offset: 0, limit: 25 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entities');
      console.error('Error fetching entities:', err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  // Effect to fetch entities when search params change
  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Handle search input
  const handleSearch = (value: string) => {
    setSearchParams(prev => ({
      ...prev,
      q: value,
      offset: 0, // Reset to first page
    }));
  };

  // Handle kind filter
  const handleKindFilter = (kind: string) => {
    setSearchParams(prev => ({
      ...prev,
      kind: kind === prev.kind ? '' : kind, // Toggle filter
      offset: 0,
    }));
  };

  // Handle pagination
  const handlePageChange = (newOffset: number) => {
    setSearchParams(prev => ({
      ...prev,
      offset: newOffset,
    }));
  };

  // Handle sorting
  const handleSort = (sortBy: EntitySearchParams['sortBy']) => {
    setSearchParams(prev => ({
      ...prev,
      sortBy,
      sortOrder:
        prev.sortBy === sortBy && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      offset: 0,
    }));
  };

  // Handle entity selection
  const toggleEntitySelection = (entityId: string) => {
    setSelectedEntities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entityId)) {
        newSet.delete(entityId);
      } else {
        newSet.add(entityId);
      }
      return newSet;
    });
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectedEntities.size === entities.length && entities.length > 0) {
      setSelectedEntities(new Set());
    } else {
      setSelectedEntities(new Set(entities.map(e => e.id)));
    }
  };

  // Handle entity deletion
  const handleDeleteEntity = async (entityId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this entity? This will also remove all its relationships.'
      )
    ) {
      return;
    }

    setDeleteLoading(entityId);

    try {
      const response = await fetch(`/api/admin/entities/${entityId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete entity: ${response.statusText}`);
      }

      // Refresh entities list
      await fetchEntities();
      setSelectedEntities(prev => {
        const newSet = new Set(prev);
        newSet.delete(entityId);
        return newSet;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entity');
      console.error('Error deleting entity:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedEntities.size === 0) return;

    const entityCount = selectedEntities.size;
    if (
      !confirm(
        `Are you sure you want to delete ${entityCount} entities? This will also remove all their relationships.`
      )
    ) {
      return;
    }

    setDeleteLoading('bulk');

    try {
      const deletePromises = Array.from(selectedEntities).map(entityId =>
        fetch(`/api/admin/entities/${entityId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
          },
        })
      );

      await Promise.all(deletePromises);

      // Refresh entities list
      await fetchEntities();
      setSelectedEntities(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete entities'
      );
      console.error('Error deleting entities:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Handle merge completion
  const handleMergeComplete = () => {
    fetchEntities();
    setSelectedEntities(new Set());
    setShowMergeDialog(false);
  };

  // Calculate pagination info
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  // Get selected entities data for merge dialog
  const selectedEntitiesData = entities.filter(entity =>
    selectedEntities.has(entity.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Knowledge Graph Entities
          </h1>
          <p className="text-gray-600 mt-1">
            Browse and manage entities in the knowledge graph
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Entity
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col space-y-4">
          {/* Search Bar */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search entities by name..."
                value={searchParams.q}
                onChange={e => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Kind Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {ENTITY_KINDS.map(kind => (
                <Badge
                  key={kind}
                  variant={searchParams.kind === kind ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => handleKindFilter(kind)}
                >
                  {kind}
                </Badge>
              ))}
            </div>
          )}

          {/* Bulk Actions */}
          {selectedEntities.size > 0 && (
            <div className="flex items-center space-x-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-blue-800">
                {selectedEntities.size} entities selected
              </span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMergeDialog(true)}
                  disabled={selectedEntities.size < 2}
                >
                  <Merge className="w-4 h-4 mr-2" />
                  Merge Selected
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={deleteLoading === 'bulk'}
                >
                  {deleteLoading === 'bulk' ? (
                    <Spinner className="w-4 h-4 mr-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto"
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {/* Entity Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner className="w-8 h-8" />
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <input
                    type="checkbox"
                    checked={
                      selectedEntities.size === entities.length &&
                      entities.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </div>
                <div className="col-span-4">
                  <button
                    onClick={() => handleSort('name')}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    Name{' '}
                    {searchParams.sortBy === 'name' &&
                      (searchParams.sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
                <div className="col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Kind
                  </span>
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => handleSort('authority_score')}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    Authority{' '}
                    {searchParams.sortBy === 'authority_score' &&
                      (searchParams.sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => handleSort('mention_count')}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    Mentions{' '}
                    {searchParams.sortBy === 'mention_count' &&
                      (searchParams.sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
                <div className="col-span-1">
                  <span className="text-sm font-medium text-gray-700">
                    Actions
                  </span>
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-200">
              {entities.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No entities found. Try adjusting your search criteria.
                </div>
              ) : (
                entities.map(entity => (
                  <div key={entity.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-1">
                        <input
                          type="checkbox"
                          checked={selectedEntities.has(entity.id)}
                          onChange={() => toggleEntitySelection(entity.id)}
                          className="rounded border-gray-300"
                        />
                      </div>
                      <div className="col-span-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {entity.name}
                          </span>
                          {entity.description && (
                            <span className="text-sm text-gray-500 truncate">
                              {entity.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Badge
                          className={
                            KIND_COLORS[entity.kind] ||
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {entity.kind}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${entity.authority_score * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">
                            {Math.round(entity.authority_score * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-900">
                          {entity.mention_count}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntity(entity.id)}
                            disabled={deleteLoading === entity.id}
                          >
                            {deleteLoading === entity.id ? (
                              <Spinner className="w-4 h-4" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-red-600" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {pagination.offset + 1} to{' '}
                    {Math.min(
                      pagination.offset + pagination.limit,
                      pagination.total
                    )}{' '}
                    of {pagination.total} entities
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handlePageChange(
                          Math.max(0, pagination.offset - pagination.limit)
                        )
                      }
                      disabled={pagination.offset === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-700">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handlePageChange(pagination.offset + pagination.limit)
                      }
                      disabled={
                        pagination.offset + pagination.limit >= pagination.total
                      }
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Entity Merge Dialog */}
      <EntityMergeDialog
        open={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        selectedEntities={selectedEntitiesData}
        onMergeComplete={handleMergeComplete}
      />
    </div>
  );
}
