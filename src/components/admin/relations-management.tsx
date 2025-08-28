'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  Search,
  Filter,
  ThumbsUp,
  ThumbsDown,
  Eye,
  ArrowRight,
  TrendingUp,
  Users,
  AlertTriangle
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface Entity {
  id: string
  name: string
  type: string
}

interface Relation {
  id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  description?: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
  source_chunks: string[]
  metadata?: {
    evidence_count?: number
    strength?: number
    bidirectional?: boolean
  }
  source_entity?: Entity
  target_entity?: Entity
}

interface RelationsManagementProps {
  entityId?: string
  onNavigateToEntity?: (entityId: string) => void
}

export function RelationsManagement({ entityId, onNavigateToEntity }: RelationsManagementProps) {
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [relationTypeFilter, setRelationTypeFilter] = useState('all')
  const [confidenceFilter, setConfidenceFilter] = useState('all')
  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set())
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })

  const loadRelations = async () => {
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })

      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (relationTypeFilter !== 'all') params.set('relation_type', relationTypeFilter)
      if (confidenceFilter !== 'all') params.set('confidence_min', confidenceFilter)
      if (entityId) params.set('entity_id', entityId)

      const response = await fetch(`/api/admin/kg/relations?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load relations')
      }

      setRelations(data.relations)
      setPagination(data.pagination)
      setError(null)
    } catch (err) {
      console.error('Failed to load relations:', err)
      setError(err instanceof Error ? err.message : 'Failed to load relations')
    } finally {
      setLoading(false)
    }
  }

  const handleRelationStatusUpdate = async (relationId: string, status: 'approved' | 'rejected') => {
    try {
      const response = await fetch('/api/admin/kg/relations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_status',
          relation_id: relationId,
          new_status: status
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update relation status')
      }

      await loadRelations()
    } catch (err) {
      console.error('Failed to update relation status:', err)
      setError(err instanceof Error ? err.message : 'Failed to update relation status')
    }
  }

  const handleBulkStatusUpdate = async (status: 'approved' | 'rejected') => {
    if (selectedRelations.size === 0) {
      setError('Please select relations to update')
      return
    }

    try {
      const response = await fetch('/api/admin/kg/relations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'bulk_update_status',
          relation_ids: Array.from(selectedRelations),
          status
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to bulk update relation status')
      }

      await loadRelations()
      setSelectedRelations(new Set())
    } catch (err) {
      console.error('Failed to bulk update relation status:', err)
      setError(err instanceof Error ? err.message : 'Failed to bulk update relation status')
    }
  }

  useEffect(() => {
    loadRelations()
  }, [pagination.page, statusFilter, relationTypeFilter, confidenceFilter, entityId])

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'border-green-200 bg-green-50 text-green-800'
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-800'
      case 'pending':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800'
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
          <Button onClick={() => loadRelations()} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Relations Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Review and curate entity relationships
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={() => handleBulkStatusUpdate('approved')}
            disabled={selectedRelations.size === 0}
            variant="outline"
            className="text-green-600 hover:text-green-700"
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Approve Selected ({selectedRelations.size})
          </Button>
          <Button 
            onClick={() => handleBulkStatusUpdate('rejected')}
            disabled={selectedRelations.size === 0}
            variant="outline"
            className="text-red-600 hover:text-red-700"
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Reject Selected ({selectedRelations.size})
          </Button>
          <Button onClick={() => loadRelations()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={relationTypeFilter} onValueChange={setRelationTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="partnered_with">Partnered With</SelectItem>
            <SelectItem value="developed_by">Developed By</SelectItem>
            <SelectItem value="acquired_by">Acquired By</SelectItem>
            <SelectItem value="works_at">Works At</SelectItem>
            <SelectItem value="located_in">Located In</SelectItem>
            <SelectItem value="competes_with">Competes With</SelectItem>
          </SelectContent>
        </Select>

        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="0.8">High (≥80%)</SelectItem>
            <SelectItem value="0.6">Medium (≥60%)</SelectItem>
            <SelectItem value="0.4">Low (≥40%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Relations List */}
      <Card>
        <CardHeader>
          <CardTitle>Relations</CardTitle>
          <CardDescription>
            Entity relationships extracted from documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {relations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No relations found matching the current filters
            </div>
          ) : (
            <div className="space-y-4">
              {relations.map((relation) => (
                <div
                  key={relation.id}
                  className={`border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedRelations.has(relation.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedRelations.has(relation.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedRelations)
                            if (e.target.checked) {
                              newSelected.add(relation.id)
                            } else {
                              newSelected.delete(relation.id)
                            }
                            setSelectedRelations(newSelected)
                          }}
                        />
                        {getStatusIcon(relation.status)}
                        <Badge className={getStatusColor(relation.status)}>
                          {relation.status}
                        </Badge>
                        <span className={`text-sm font-medium ${getConfidenceColor(relation.confidence)}`}>
                          {(relation.confidence * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          variant="link"
                          className="p-0 h-auto text-base font-medium"
                          onClick={() => onNavigateToEntity?.(relation.source_entity_id)}
                        >
                          {relation.source_entity?.name}
                        </Button>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <Badge variant="outline" className="mx-2">
                          {relation.relation_type.replace('_', ' ')}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <Button
                          variant="link"
                          className="p-0 h-auto text-base font-medium"
                          onClick={() => onNavigateToEntity?.(relation.target_entity_id)}
                        >
                          {relation.target_entity?.name}
                        </Button>
                      </div>

                      {relation.description && (
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                          {relation.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Evidence: {relation.metadata?.evidence_count || 0} sources</span>
                        <span>Created: {new Date(relation.created_at).toLocaleDateString()}</span>
                        {relation.metadata?.bidirectional && (
                          <Badge variant="secondary" className="text-xs">
                            Bidirectional
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {relation.status === 'pending' && (
                        <>
                          <Button
                            onClick={() => handleRelationStatusUpdate(relation.id, 'approved')}
                            variant="outline"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                          >
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            onClick={() => handleRelationStatusUpdate(relation.id, 'rejected')}
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                          >
                            <ThumbsDown className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}

                      {relation.status !== 'pending' && (
                        <Button
                          onClick={() => handleRelationStatusUpdate(
                            relation.id, 
                            relation.status === 'approved' ? 'rejected' : 'approved'
                          )}
                          variant="ghost"
                          size="sm"
                        >
                          {relation.status === 'approved' ? 'Mark Rejected' : 'Mark Approved'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Source chunks preview */}
                  {relation.source_chunks && relation.source_chunks.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-500 mb-1">
                        Evidence from {relation.source_chunks.length} source{relation.source_chunks.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-500">
                Showing {relations.length} of {pagination.total} relations
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <span className="px-3 py-1 text-sm">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <Button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.total_pages}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}