'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Settings,
  Eye,
  Filter
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
  confidence: number
  x: number
  y: number
}

interface Relation {
  id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
}

interface KGVisualizationProps {
  onEntityClick?: (entityId: string) => void
  onRelationClick?: (relationId: string) => void
}

export function KGVisualization({ onEntityClick, onRelationClick }: KGVisualizationProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [confidenceFilter, setConfidenceFilter] = useState('0.5')
  const svgRef = useRef<SVGSVGElement>(null)

  const loadKGData = async () => {
    try {
      const [entitiesResponse, relationsResponse] = await Promise.all([
        fetch(`/api/admin/kg/entities?limit=50&confidence_min=${confidenceFilter}`),
        fetch(`/api/admin/kg/relations?limit=100&confidence_min=${confidenceFilter}&status=approved`)
      ])

      const [entitiesData, relationsData] = await Promise.all([
        entitiesResponse.json(),
        relationsResponse.json()
      ])

      if (!entitiesResponse.ok || !relationsResponse.ok) {
        throw new Error('Failed to load knowledge graph data')
      }

      // Position entities using a simple force-directed layout simulation
      const positionedEntities = positionEntities(entitiesData.entities, relationsData.relations)
      
      setEntities(positionedEntities)
      setRelations(relationsData.relations)
      setError(null)
    } catch (err) {
      console.error('Failed to load KG data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load knowledge graph')
    } finally {
      setLoading(false)
    }
  }

  const positionEntities = (entities: any[], relations: Relation[]): Entity[] => {
    const width = 800
    const height = 600
    const centerX = width / 2
    const centerY = height / 2

    // Create entity map for quick lookup
    const entityMap = new Map(entities.map(e => [e.id, e]))

    // Initialize positions randomly in a circle
    const positioned = entities.map((entity, i) => {
      const angle = (i / entities.length) * 2 * Math.PI
      const radius = Math.min(width, height) * 0.3
      return {
        ...entity,
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50
      }
    })

    // Simple force simulation for better positioning
    for (let iteration = 0; iteration < 50; iteration++) {
      positioned.forEach((entity, i) => {
        let fx = 0
        let fy = 0

        // Repulsion from other entities
        positioned.forEach((other, j) => {
          if (i !== j) {
            const dx = entity.x - other.x
            const dy = entity.y - other.y
            const distance = Math.sqrt(dx * dx + dy * dy) || 1
            const repulsion = 2000 / (distance * distance)
            fx += (dx / distance) * repulsion
            fy += (dy / distance) * repulsion
          }
        })

        // Attraction along relations
        relations.forEach(relation => {
          if (relation.source_entity_id === entity.id) {
            const target = positioned.find(e => e.id === relation.target_entity_id)
            if (target) {
              const dx = target.x - entity.x
              const dy = target.y - entity.y
              const distance = Math.sqrt(dx * dx + dy * dy) || 1
              const attraction = distance * 0.01 * relation.confidence
              fx += (dx / distance) * attraction
              fy += (dy / distance) * attraction
            }
          }
          if (relation.target_entity_id === entity.id) {
            const source = positioned.find(e => e.id === relation.source_entity_id)
            if (source) {
              const dx = source.x - entity.x
              const dy = source.y - entity.y
              const distance = Math.sqrt(dx * dx + dy * dy) || 1
              const attraction = distance * 0.01 * relation.confidence
              fx += (dx / distance) * attraction
              fy += (dy / distance) * attraction
            }
          }
        })

        // Center attraction
        const centerDx = centerX - entity.x
        const centerDy = centerY - entity.y
        fx += centerDx * 0.001
        fy += centerDy * 0.001

        // Apply forces with damping
        entity.x += fx * 0.1
        entity.y += fy * 0.1

        // Keep within bounds
        entity.x = Math.max(50, Math.min(width - 50, entity.x))
        entity.y = Math.max(50, Math.min(height - 50, entity.y))
      })
    }

    return positioned
  }

  const getEntityColor = (type: string) => {
    const colors: Record<string, string> = {
      'company': '#3B82F6',
      'person': '#EF4444',
      'product': '#10B981',
      'location': '#F59E0B',
      'technology': '#8B5CF6',
      'organization': '#06B6D4'
    }
    return colors[type] || '#6B7280'
  }

  const getEntityRadius = (entity: Entity) => {
    return Math.max(8, Math.min(20, 8 + entity.confidence * 12))
  }

  const filteredEntities = entities.filter(entity => 
    typeFilter === 'all' || entity.type === typeFilter
  )

  const filteredRelations = relations.filter(relation => {
    const sourceEntity = entities.find(e => e.id === relation.source_entity_id)
    const targetEntity = entities.find(e => e.id === relation.target_entity_id)
    
    if (!sourceEntity || !targetEntity) return false
    
    const sourceVisible = typeFilter === 'all' || sourceEntity.type === typeFilter
    const targetVisible = typeFilter === 'all' || targetEntity.type === typeFilter
    
    return sourceVisible && targetVisible
  })

  useEffect(() => {
    loadKGData()
  }, [confidenceFilter])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Graph Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin">
              <RefreshCw className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardContent className="pt-6">
          <p className="text-red-700 dark:text-red-300">{error}</p>
          <Button onClick={() => loadKGData()} variant="outline" className="mt-4">
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
            Knowledge Graph Visualization
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Interactive view of entities and their relationships
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            variant="outline"
            size="sm"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button 
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            variant="outline"
            size="sm"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button onClick={() => loadKGData()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="company">Companies</SelectItem>
            <SelectItem value="person">People</SelectItem>
            <SelectItem value="product">Products</SelectItem>
            <SelectItem value="location">Locations</SelectItem>
            <SelectItem value="technology">Technologies</SelectItem>
            <SelectItem value="organization">Organizations</SelectItem>
          </SelectContent>
        </Select>

        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Min confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.3">Low (≥30%)</SelectItem>
            <SelectItem value="0.5">Medium (≥50%)</SelectItem>
            <SelectItem value="0.7">High (≥70%)</SelectItem>
            <SelectItem value="0.8">Very High (≥80%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Visualization */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Graph View</CardTitle>
              <CardDescription>
                {filteredEntities.length} entities, {filteredRelations.length} relations
              </CardDescription>
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(filteredEntities.map(e => e.type))).map(type => (
                <div key={type} className="flex items-center gap-1">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getEntityColor(type) }}
                  />
                  <span className="text-xs capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <svg
              ref={svgRef}
              width="100%"
              height="600"
              viewBox={`0 0 800 600`}
              className="bg-white dark:bg-gray-900"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            >
              {/* Relations */}
              {filteredRelations.map(relation => {
                const sourceEntity = entities.find(e => e.id === relation.source_entity_id)
                const targetEntity = entities.find(e => e.id === relation.target_entity_id)
                
                if (!sourceEntity || !targetEntity) return null

                return (
                  <g key={relation.id}>
                    <line
                      x1={sourceEntity.x}
                      y1={sourceEntity.y}
                      x2={targetEntity.x}
                      y2={targetEntity.y}
                      stroke="#E5E7EB"
                      strokeWidth={Math.max(1, relation.confidence * 3)}
                      strokeOpacity={0.6}
                      className="cursor-pointer hover:stroke-blue-500"
                      onClick={() => onRelationClick?.(relation.id)}
                    />
                    
                    {/* Relation label */}
                    <text
                      x={(sourceEntity.x + targetEntity.x) / 2}
                      y={(sourceEntity.y + targetEntity.y) / 2}
                      fontSize="10"
                      fill="#6B7280"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {relation.relation_type.replace('_', ' ')}
                    </text>
                  </g>
                )
              })}

              {/* Entities */}
              {filteredEntities.map(entity => (
                <g key={entity.id}>
                  <circle
                    cx={entity.x}
                    cy={entity.y}
                    r={getEntityRadius(entity)}
                    fill={getEntityColor(entity.type)}
                    stroke={selectedEntity === entity.id ? '#1F2937' : 'white'}
                    strokeWidth={selectedEntity === entity.id ? 3 : 2}
                    className="cursor-pointer hover:opacity-80"
                    onClick={() => {
                      setSelectedEntity(entity.id)
                      onEntityClick?.(entity.id)
                    }}
                  />
                  
                  <text
                    x={entity.x}
                    y={entity.y + getEntityRadius(entity) + 14}
                    fontSize="11"
                    fill="currentColor"
                    textAnchor="middle"
                    className="pointer-events-none font-medium"
                  >
                    {entity.name.length > 15 ? entity.name.substring(0, 12) + '...' : entity.name}
                  </text>
                  
                  <text
                    x={entity.x}
                    y={entity.y + getEntityRadius(entity) + 26}
                    fontSize="9"
                    fill="#6B7280"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {(entity.confidence * 100).toFixed(0)}%
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Selected Entity Info */}
          {selectedEntity && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {(() => {
                const entity = entities.find(e => e.id === selectedEntity)
                if (!entity) return null

                const entityRelations = relations.filter(r => 
                  r.source_entity_id === entity.id || r.target_entity_id === entity.id
                )

                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: getEntityColor(entity.type) }}
                      />
                      <h4 className="font-medium">{entity.name}</h4>
                      <Badge variant="outline">{entity.type}</Badge>
                      <span className="text-sm text-gray-600">
                        {(entity.confidence * 100).toFixed(1)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Connected to {entityRelations.length} other entities
                    </p>
                  </div>
                )
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}