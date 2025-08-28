'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Share2, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Edit, 
  Merge,
  RefreshCw,
  Search,
  Filter,
  Star,
  TrendingUp,
  Eye
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Entity {
  id: string
  name: string
  type: string
  description?: string
  aliases: string[]
  confidence: number
  created_at: string
  updated_at: string
  merged_from?: string[]
  status: 'active' | 'merged' | 'rejected'
  metadata?: {
    source_count?: number
    relation_count?: number
    last_mentioned?: string
  }
}

interface EntityStats {
  total_entities: number
  active_entities: number
  merged_entities: number
  rejected_entities: number
  entities_by_type: Record<string, number>
  total_relations: number
  pending_relations: number
  approved_relations: number
  avg_confidence: number
  entities_needing_review: number
}

interface EntityManagementProps {
  onNavigateToRelations?: (entityId: string) => void
}

export function EntityManagement({ onNavigateToRelations }: EntityManagementProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [stats, setStats] = useState<EntityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [confidenceFilter, setConfidenceFilter] = useState('all')
  const [needsReviewFilter, setNeedsReviewFilter] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set())
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })

  const loadEntities = async () => {
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })

      if (searchTerm) params.set('search', searchTerm)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (confidenceFilter !== 'all') params.set('confidence_min', confidenceFilter)
      if (needsReviewFilter) params.set('needs_review', 'true')

      const [entitiesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/kg/entities?${params}`),
        fetch('/api/admin/kg/stats')
      ])

      const entitiesData = await entitiesResponse.json()
      const statsData = await statsResponse.json()

      if (!entitiesResponse.ok) {
        throw new Error(entitiesData.error || 'Failed to load entities')
      }

      if (!statsResponse.ok) {
        throw new Error(statsData.error || 'Failed to load stats')
      }

      setEntities(entitiesData.entities)
      setPagination(entitiesData.pagination)
      setStats(statsData.stats)
      setError(null)
    } catch (err) {
      console.error('Failed to load entities:', err)
      setError(err instanceof Error ? err.message : 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEntity = async (entityId: string, updates: any) => {
    try {
      const response = await fetch(`/api/admin/kg/entities/${entityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update entity')
      }

      await loadEntities()
      setEditingEntity(null)
    } catch (err) {
      console.error('Failed to update entity:', err)
      setError(err instanceof Error ? err.message : 'Failed to update entity')
    }
  }

  const handleMergeEntities = async () => {
    if (selectedEntities.size < 2) {
      setError('Please select at least 2 entities to merge')
      return
    }

    const entityIds = Array.from(selectedEntities)
    const primaryId = entityIds[0]
    const secondaryIds = entityIds.slice(1)

    try {
      const response = await fetch('/api/admin/kg/entities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'merge',
          primary_entity_id: primaryId,
          secondary_entity_ids: secondaryIds
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to merge entities')
      }

      await loadEntities()
      setSelectedEntities(new Set())
    } catch (err) {
      console.error('Failed to merge entities:', err)
      setError(err instanceof Error ? err.message : 'Failed to merge entities')
    }
  }

  useEffect(() => {
    loadEntities()
  }, [pagination.page, searchTerm, typeFilter, statusFilter, confidenceFilter, needsReviewFilter])

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'border-green-200 bg-green-50 text-green-800'
      case 'merged':
        return 'border-blue-200 bg-blue-50 text-blue-800'
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-800'
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'merged':
        return <Merge className="h-4 w-4 text-blue-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
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
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
          <Button onClick={() => loadEntities()} variant="outline" className="mt-4">
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
            Entity Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage knowledge graph entities and relationships
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleMergeEntities}
            disabled={selectedEntities.size < 2}
            variant="outline"
          >
            <Merge className="h-4 w-4 mr-2" />
            Merge Selected ({selectedEntities.size})
          </Button>
          <Button onClick={() => loadEntities()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_entities.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.active_entities} active, {stats.merged_entities} merged
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getConfidenceColor(stats.avg_confidence)}`}>
                {(stats.avg_confidence * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Quality score
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Relations</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_relations.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pending_relations} pending review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {stats.entities_needing_review}
              </div>
              <p className="text-xs text-muted-foreground">
                Low confidence or duplicates
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search entities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {stats && Object.keys(stats.entities_by_type).map(type => (
              <SelectItem key={type} value={type}>
                {type} ({stats.entities_by_type[type]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="merged">Merged</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
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

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="needsReview"
            checked={needsReviewFilter}
            onChange={(e) => setNeedsReviewFilter(e.target.checked)}
          />
          <label htmlFor="needsReview" className="text-sm">
            Needs Review
          </label>
        </div>
      </div>

      {/* Entities List */}
      <Card>
        <CardHeader>
          <CardTitle>Entities</CardTitle>
          <CardDescription>
            Knowledge graph entities extracted from documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entities.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No entities found matching the current filters
            </div>
          ) : (
            <div className="space-y-4">
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className={`border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedEntities.has(entity.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={selectedEntities.has(entity.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedEntities)
                            if (e.target.checked) {
                              newSelected.add(entity.id)
                            } else {
                              newSelected.delete(entity.id)
                            }
                            setSelectedEntities(newSelected)
                          }}
                        />
                        {getStatusIcon(entity.status)}
                        <h4 className="font-medium text-lg">{entity.name}</h4>
                        <Badge variant="outline">{entity.type}</Badge>
                        <Badge className={getStatusColor(entity.status)}>
                          {entity.status}
                        </Badge>
                        <span className={`text-sm font-medium ${getConfidenceColor(entity.confidence)}`}>
                          {(entity.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      
                      {entity.description && (
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                          {entity.description}
                        </p>
                      )}

                      {entity.aliases && entity.aliases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {entity.aliases.slice(0, 5).map((alias, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {alias}
                            </Badge>
                          ))}
                          {entity.aliases.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{entity.aliases.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Sources: {entity.metadata?.source_count || 0}</span>
                        <span>Relations: {entity.metadata?.relation_count || 0}</span>
                        <span>Created: {new Date(entity.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            onClick={() => setEditingEntity(entity)}
                            variant="outline"
                            size="sm"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Entity</DialogTitle>
                            <DialogDescription>
                              Update entity information and aliases
                            </DialogDescription>
                          </DialogHeader>
                          {editingEntity && (
                            <EntityEditForm
                              entity={editingEntity}
                              onSave={(updates) => handleUpdateEntity(editingEntity.id, updates)}
                              onCancel={() => setEditingEntity(null)}
                            />
                          )}
                        </DialogContent>
                      </Dialog>

                      {onNavigateToRelations && (
                        <Button
                          onClick={() => onNavigateToRelations(entity.id)}
                          variant="ghost"
                          size="sm"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Relations
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-500">
                Showing {entities.length} of {pagination.total} entities
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

interface EntityEditFormProps {
  entity: Entity
  onSave: (updates: any) => void
  onCancel: () => void
}

function EntityEditForm({ entity, onSave, onCancel }: EntityEditFormProps) {
  const [formData, setFormData] = useState({
    name: entity.name,
    type: entity.type,
    description: entity.description || '',
    aliases: entity.aliases.join(', '),
    status: entity.status,
    confidence: entity.confidence
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const updates = {
      name: formData.name,
      type: formData.type,
      description: formData.description || undefined,
      aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean),
      status: formData.status,
      confidence: formData.confidence
    }

    onSave(updates)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="type">Type</Label>
        <Input
          id="type"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="aliases">Aliases (comma-separated)</Label>
        <Textarea
          id="aliases"
          value={formData.aliases}
          onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
          rows={2}
          placeholder="Alternative names, separated by commas"
        />
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select 
          value={formData.status} 
          onValueChange={(value: any) => setFormData({ ...formData, status: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="merged">Merged</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="confidence">Confidence</Label>
        <Input
          id="confidence"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={formData.confidence}
          onChange={(e) => setFormData({ ...formData, confidence: parseFloat(e.target.value) })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onCancel} variant="outline" type="button">
          Cancel
        </Button>
        <Button type="submit">
          Save Changes
        </Button>
      </div>
    </form>
  )
}