'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Network, Search, Users, GitBranch, Brain, Filter, Download, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface KnowledgeGraphStats {
  totalEntities: number
  totalRelations: number
  connectedComponents: number
  entityTypes: Array<{ type: string; count: number }>
  relationTypes: Array<{ type: string; count: number }>
  topEntities: Array<{ name: string; type: string; connections: number }>
}

interface Entity {
  id: number
  canonical_name: string
  type: string
  aliases: string[]
  metadata: any
  created_at: string
}

interface Relation {
  id: number
  head_id: number
  relation: string
  tail_id: number
  confidence: number
  evidence_chunk_id?: number
  created_at: string
}

export function KnowledgeGraphVisualization() {
  const router = useRouter()
  const [stats, setStats] = useState<KnowledgeGraphStats | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all')
  const [selectedRelationType, setSelectedRelationType] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'overview' | 'entities' | 'relations'>('overview')
  const [isExtracting, setIsExtracting] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)

  const loadKnowledgeGraph = async () => {
    try {
      setLoading(true)
      
      // Load stats
      const statsResponse = await fetch('/api/rag/kg/stats')
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData.stats)
      }

      // Load entities (paginated)
      const entitiesResponse = await fetch('/api/rag/kg/entities?limit=100')
      if (entitiesResponse.ok) {
        const entitiesData = await entitiesResponse.json()
        setEntities(entitiesData.entities || [])
      }

      // Load relations (paginated)
      const relationsResponse = await fetch('/api/rag/kg/relations?limit=100')
      if (relationsResponse.ok) {
        const relationsData = await relationsResponse.json()
        setRelations(relationsData.relations || [])
      }

    } catch (error) {
      console.error('Failed to load knowledge graph:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExtractAll = async () => {
    try {
      setIsExtracting(true)
      
      const response = await fetch('/api/admin/kg-extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extract_all: true
        })
      })

      const result = await response.json()

      if (response.ok) {
        console.log('KG extraction completed:', result)
        alert(`Knowledge Graph extraction completed!\n\nProcessed: ${result.summary?.documents_processed || 0} documents\nEntities: ${result.summary?.total_entities_extracted || 0}\nRelations: ${result.summary?.total_relations_extracted || 0}`)
        
        // Refresh the knowledge graph data
        await loadKnowledgeGraph()
      } else {
        console.error('KG extraction failed:', result)
        alert(`Knowledge Graph extraction failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to trigger KG extraction:', error)
      alert(`Failed to trigger extraction: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleReprocessAll = async () => {
    try {
      setIsReprocessing(true)
      
      const response = await fetch('/api/admin/kg-reprocess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reprocess_all: true
        })
      })

      const result = await response.json()

      if (response.ok) {
        console.log('KG re-processing completed:', result)
        alert(`Knowledge Graph re-processing completed!\n\nProcessed: ${result.summary?.documents_processed || 0} documents\nEntities: ${result.summary?.total_entities_extracted || 0}\nRelations: ${result.summary?.total_relations_extracted || 0}`)
        
        // Refresh the knowledge graph data
        await loadKnowledgeGraph()
      } else {
        console.error('KG re-processing failed:', result)
        alert(`Knowledge Graph re-processing failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to trigger KG re-processing:', error)
      alert(`Failed to trigger re-processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsReprocessing(false)
    }
  }

  useEffect(() => {
    loadKnowledgeGraph()
  }, [])

  const getEntityTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      person: 'bg-blue-100 text-blue-800',
      company: 'bg-green-100 text-green-800',
      product: 'bg-purple-100 text-purple-800',
      tech: 'bg-orange-100 text-orange-800',
      team: 'bg-pink-100 text-pink-800',
      event: 'bg-yellow-100 text-yellow-800',
      publication: 'bg-gray-100 text-gray-800'
    }
    return colors[type.toLowerCase()] || 'bg-gray-100 text-gray-800'
  }

  const getRelationTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      developed_by: 'bg-blue-100 text-blue-700',
      partnered_with: 'bg-green-100 text-green-700',
      launched_by: 'bg-purple-100 text-purple-700',
      uses_technology: 'bg-orange-100 text-orange-700',
      funded_by: 'bg-pink-100 text-pink-700',
      led_by: 'bg-indigo-100 text-indigo-700',
      competitor_of: 'bg-red-100 text-red-700',
      acquired: 'bg-yellow-100 text-yellow-700'
    }
    return colors[type.toLowerCase()] || 'bg-gray-100 text-gray-700'
  }

  const filteredEntities = entities.filter(entity => {
    const matchesSearch = searchQuery === '' || 
      entity.canonical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.aliases.some(alias => alias.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesType = selectedEntityType === 'all' || entity.type === selectedEntityType
    
    return matchesSearch && matchesType
  })

  const filteredRelations = relations.filter(relation => {
    const matchesType = selectedRelationType === 'all' || relation.relation === selectedRelationType
    return matchesType
  })

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading knowledge graph...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Network size={24} />
              Knowledge Graph
            </h1>
            <p className="text-gray-600">Explore entities and relationships extracted from your documents</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('overview')}
          >
            Overview
          </Button>
          <Button
            variant={viewMode === 'entities' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('entities')}
          >
            Entities
          </Button>
          <Button
            variant={viewMode === 'relations' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('relations')}
          >
            Relations
          </Button>
          <Button onClick={loadKnowledgeGraph} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleExtractAll} disabled={isExtracting || isReprocessing} variant="default">
            <Brain className="h-4 w-4 mr-2" />
            {isExtracting ? 'Extracting...' : 'Extract All'}
          </Button>
          <Button onClick={handleReprocessAll} disabled={isExtracting || isReprocessing} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {isReprocessing ? 'Re-processing...' : 'Re-process KG'}
          </Button>
        </div>
      </div>

      {/* Overview Mode */}
      {viewMode === 'overview' && stats && (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Entities</p>
                    <p className="text-2xl font-bold">{stats.totalEntities}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Relations</p>
                    <p className="text-2xl font-bold">{stats.totalRelations}</p>
                  </div>
                  <GitBranch className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Entity Types</p>
                    <p className="text-2xl font-bold">{stats?.entityTypes?.length || 0}</p>
                  </div>
                  <Brain className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Components</p>
                    <p className="text-2xl font-bold">{stats.connectedComponents}</p>
                  </div>
                  <Network className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Entity Types Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Entity Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.entityTypes?.map(({ type, count }) => (
                    <div key={type} className="flex items-center justify-between">
                      <Badge className={getEntityTypeColor(type)}>
                        {type}
                      </Badge>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  )) || <p className="text-gray-500">No entity types found</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Relation Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.relationTypes?.map(({ type, count }) => (
                    <div key={type} className="flex items-center justify-between">
                      <Badge className={getRelationTypeColor(type)}>
                        {type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  )) || <p className="text-gray-500">No relation types found</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Connected Entities */}
          <Card>
            <CardHeader>
              <CardTitle>Most Connected Entities</CardTitle>
              <p className="text-sm text-gray-600">Entities with the most relationships</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats?.topEntities?.length > 0 ? stats.topEntities.map((entity, index) => (
                  <div key={entity.name} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={getEntityTypeColor(entity.type)}>
                        #{index + 1}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {entity.connections} connections
                      </span>
                    </div>
                    <p className="font-medium text-sm">{entity.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{entity.type}</p>
                  </div>
                )) : (
                  <div className="col-span-full text-center py-8">
                    <p className="text-gray-500">No entities found</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Upload and process documents to build the knowledge graph
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Entities Mode */}
      {viewMode === 'entities' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search entities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {stats?.entityTypes?.map(({ type }) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Entities List */}
          <Card>
            <CardHeader>
              <CardTitle>Entities ({filteredEntities.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredEntities.map(entity => (
                  <div key={entity.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{entity.canonical_name}</h3>
                        <Badge className={getEntityTypeColor(entity.type)}>
                          {entity.type}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(entity.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {entity.aliases && entity.aliases.length > 1 && (
                      <div className="mb-2">
                        <span className="text-sm text-gray-600">Aliases: </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entity.aliases.filter(alias => alias !== entity.canonical_name).map(alias => (
                            <Badge key={alias} variant="outline" className="text-xs">
                              {alias}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {entity.metadata?.description && (
                      <p className="text-sm text-gray-600">{entity.metadata.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Relations Mode */}
      {viewMode === 'relations' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by relation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Relations</SelectItem>
                    {stats?.relationTypes?.map(({ type }) => (
                      <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                    )) || []}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Relations List */}
          <Card>
            <CardHeader>
              <CardTitle>Relations ({filteredRelations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredRelations.map(relation => (
                  <div key={relation.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Entity {relation.head_id}</span>
                        <Badge className={getRelationTypeColor(relation.relation)}>
                          {relation.relation.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-sm font-medium">Entity {relation.tail_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {Math.round(relation.confidence * 100)}%
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(relation.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}