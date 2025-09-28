'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { RelationshipEditorDialog } from './relationship-editor-dialog';
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowRight,
  Eye,
} from 'lucide-react';

interface Entity {
  name: string;
  kind: string;
}

interface Relationship {
  id: string;
  src_id: string;
  src_type: string;
  rel: string;
  dst_id: string;
  dst_type: string;
  weight: number;
  evidence_text?: string;
  evidence_doc_id?: string;
  created_at: string;
  src_entity?: Entity;
  dst_entity?: Entity;
  evidence_document?: {
    title: string;
  };
}

interface RelationshipSearchParams {
  entityId?: string;
  relation?: string;
  limit: number;
  offset: number;
}

const RELATION_TYPES = [
  'author_of',
  'inventor_of',
  'assignee_of',
  'cites',
  'supersedes',
  'implements',
  'used_in',
  'similar_to',
  'enables_3d',
  'uses_component',
  'competing_with',
  'integrates_with',
  'can_use',
  'enhances',
  'evolved_to',
  'alternative_to',
];

const RELATION_COLORS: Record<string, string> = {
  author_of: 'bg-blue-100 text-blue-800',
  inventor_of: 'bg-green-100 text-green-800',
  assignee_of: 'bg-purple-100 text-purple-800',
  cites: 'bg-yellow-100 text-yellow-800',
  supersedes: 'bg-red-100 text-red-800',
  implements: 'bg-indigo-100 text-indigo-800',
  used_in: 'bg-pink-100 text-pink-800',
  similar_to: 'bg-gray-100 text-gray-800',
  enables_3d: 'bg-cyan-100 text-cyan-800',
  uses_component: 'bg-orange-100 text-orange-800',
  competing_with: 'bg-red-200 text-red-900',
  integrates_with: 'bg-green-200 text-green-900',
  can_use: 'bg-blue-200 text-blue-900',
  enhances: 'bg-purple-200 text-purple-900',
  evolved_to: 'bg-amber-100 text-amber-800',
  alternative_to: 'bg-slate-100 text-slate-800',
};

const KIND_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-800',
  organization: 'bg-green-100 text-green-800',
  product: 'bg-purple-100 text-purple-800',
  technology: 'bg-orange-100 text-orange-800',
  component: 'bg-red-100 text-red-800',
  document: 'bg-gray-100 text-gray-800',
};

export function RelationshipBrowser() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRelationships, setSelectedRelationships] = useState<
    Set<string>
  >(new Set());

  const [searchParams, setSearchParams] = useState<RelationshipSearchParams>({
    entityId: '',
    relation: '',
    limit: 25,
    offset: 0,
  });

  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 25,
  });

  const [showFilters, setShowFilters] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [entitySearchQuery, setEntitySearchQuery] = useState('');
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const [editingRelationship, setEditingRelationship] =
    useState<Relationship | null>(null);

  // Fetch relationships from API
  const fetchRelationships = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchParams.entityId) params.set('entityId', searchParams.entityId);
      if (searchParams.relation) params.set('relation', searchParams.relation);
      params.set('limit', searchParams.limit.toString());
      params.set('offset', searchParams.offset.toString());

      const response = await fetch(`/api/admin/relationships?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch relationships: ${response.statusText}`
        );
      }

      const data = await response.json();
      setRelationships(data.relationships || []);
      setPagination(data.pagination || { total: 0, offset: 0, limit: 25 });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch relationships'
      );
      console.error('Error fetching relationships:', err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  // Effect to fetch relationships when search params change
  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  // Handle entity search
  const handleEntitySearch = (value: string) => {
    setEntitySearchQuery(value);
    // For now, we'll just set it directly - in a real app you'd want to search entities
    setSearchParams(prev => ({
      ...prev,
      entityId: value,
      offset: 0,
    }));
  };

  // Handle relation filter
  const handleRelationFilter = (relation: string) => {
    setSearchParams(prev => ({
      ...prev,
      relation: relation === prev.relation ? '' : relation,
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

  // Handle relationship selection
  const toggleRelationshipSelection = (relationshipId: string) => {
    setSelectedRelationships(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relationshipId)) {
        newSet.delete(relationshipId);
      } else {
        newSet.add(relationshipId);
      }
      return newSet;
    });
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (
      selectedRelationships.size === relationships.length &&
      relationships.length > 0
    ) {
      setSelectedRelationships(new Set());
    } else {
      setSelectedRelationships(new Set(relationships.map(r => r.id)));
    }
  };

  // Handle relationship deletion
  const handleDeleteRelationship = async (relationshipId: string) => {
    if (!confirm('Are you sure you want to delete this relationship?')) {
      return;
    }

    setDeleteLoading(relationshipId);

    try {
      const response = await fetch(
        `/api/admin/relationships/${relationshipId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to delete relationship: ${response.statusText}`
        );
      }

      // Refresh relationships list
      await fetchRelationships();
      setSelectedRelationships(prev => {
        const newSet = new Set(prev);
        newSet.delete(relationshipId);
        return newSet;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete relationship'
      );
      console.error('Error deleting relationship:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRelationships.size === 0) return;

    const relationshipCount = selectedRelationships.size;
    if (
      !confirm(
        `Are you sure you want to delete ${relationshipCount} relationships?`
      )
    ) {
      return;
    }

    setDeleteLoading('bulk');

    try {
      const deletePromises = Array.from(selectedRelationships).map(
        relationshipId =>
          fetch(`/api/admin/relationships/${relationshipId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
            },
          })
      );

      await Promise.all(deletePromises);

      // Refresh relationships list
      await fetchRelationships();
      setSelectedRelationships(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete relationships'
      );
      console.error('Error deleting relationships:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Handle edit relationship
  const handleEditRelationship = (relationship: Relationship) => {
    setEditingRelationship(relationship);
    setShowEditorDialog(true);
  };

  // Handle create new relationship
  const handleCreateRelationship = () => {
    setEditingRelationship(null);
    setShowEditorDialog(true);
  };

  // Handle editor save
  const handleEditorSave = () => {
    fetchRelationships();
    setShowEditorDialog(false);
    setEditingRelationship(null);
  };

  // Calculate pagination info
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Knowledge Graph Relationships
          </h1>
          <p className="text-gray-600 mt-1">
            Browse and manage relationships between entities
          </p>
        </div>
        <Button onClick={handleCreateRelationship}>
          <Plus className="w-4 h-4 mr-2" />
          Add Relationship
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
                placeholder="Search by entity ID or name..."
                value={entitySearchQuery}
                onChange={e => handleEntitySearch(e.target.value)}
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

          {/* Relation Type Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {RELATION_TYPES.map(relation => (
                <Badge
                  key={relation}
                  variant={
                    searchParams.relation === relation ? 'default' : 'outline'
                  }
                  className="cursor-pointer"
                  onClick={() => handleRelationFilter(relation)}
                >
                  {relation.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          )}

          {/* Bulk Actions */}
          {selectedRelationships.size > 0 && (
            <div className="flex items-center space-x-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-blue-800">
                {selectedRelationships.size} relationships selected
              </span>
              <div className="flex space-x-2">
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

      {/* Relationship Table */}
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
                      selectedRelationships.size === relationships.length &&
                      relationships.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </div>
                <div className="col-span-3">
                  <span className="text-sm font-medium text-gray-700">
                    Source Entity
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Relationship
                  </span>
                </div>
                <div className="col-span-3">
                  <span className="text-sm font-medium text-gray-700">
                    Target Entity
                  </span>
                </div>
                <div className="col-span-1">
                  <span className="text-sm font-medium text-gray-700">
                    Weight
                  </span>
                </div>
                <div className="col-span-1">
                  <span className="text-sm font-medium text-gray-700">
                    Evidence
                  </span>
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
              {relationships.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No relationships found. Try adjusting your search criteria.
                </div>
              ) : (
                relationships.map(relationship => (
                  <div
                    key={relationship.id}
                    className="px-6 py-4 hover:bg-gray-50"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-1">
                        <input
                          type="checkbox"
                          checked={selectedRelationships.has(relationship.id)}
                          onChange={() =>
                            toggleRelationshipSelection(relationship.id)
                          }
                          className="rounded border-gray-300"
                        />
                      </div>
                      <div className="col-span-3">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              {relationship.src_entity?.name ||
                                relationship.src_id}
                            </span>
                            {relationship.src_entity?.kind && (
                              <Badge
                                className={
                                  KIND_COLORS[relationship.src_entity.kind] ||
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {relationship.src_entity.kind}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {relationship.src_type}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center">
                          <Badge
                            className={
                              RELATION_COLORS[relationship.rel] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {relationship.rel.replace('_', ' ')}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-gray-400 ml-2" />
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              {relationship.dst_entity?.name ||
                                relationship.dst_id}
                            </span>
                            {relationship.dst_entity?.kind && (
                              <Badge
                                className={
                                  KIND_COLORS[relationship.dst_entity.kind] ||
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {relationship.dst_entity.kind}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {relationship.dst_type}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <div className="flex items-center">
                          <div className="w-12 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${relationship.weight * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">
                            {Math.round(relationship.weight * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        {relationship.evidence_text ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={relationship.evidence_text}
                          >
                            <Eye className="w-4 h-4 text-green-600" />
                          </Button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditRelationship(relationship)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDeleteRelationship(relationship.id)
                            }
                            disabled={deleteLoading === relationship.id}
                          >
                            {deleteLoading === relationship.id ? (
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
                    of {pagination.total} relationships
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

      {/* Relationship Editor Dialog */}
      <RelationshipEditorDialog
        open={showEditorDialog}
        onClose={() => {
          setShowEditorDialog(false);
          setEditingRelationship(null);
        }}
        relationship={editingRelationship}
        onSave={handleEditorSave}
      />
    </div>
  );
}
