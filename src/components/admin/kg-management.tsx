'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Share2,
  Users,
  Settings,
  BarChart3,
  Eye,
  Sliders
} from 'lucide-react'
import { EntityManagement } from './entity-management'
import { RelationsManagement } from './relations-management'
import { KGVisualization } from './kg-visualization'
import { ConfidenceTuning } from './confidence-tuning'

type View = 'overview' | 'entities' | 'relations' | 'visualization' | 'tuning'

export function KGManagement() {
  const [currentView, setCurrentView] = useState<View>('overview')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  const handleNavigateToEntity = (entityId: string) => {
    setSelectedEntityId(entityId)
    setCurrentView('entities')
  }

  const handleNavigateToRelations = (entityId?: string) => {
    setSelectedEntityId(entityId || null)
    setCurrentView('relations')
  }

  const renderViewContent = () => {
    switch (currentView) {
      case 'entities':
        return (
          <EntityManagement 
            onNavigateToRelations={handleNavigateToRelations}
          />
        )
      
      case 'relations':
        return (
          <RelationsManagement 
            entityId={selectedEntityId || undefined}
            onNavigateToEntity={handleNavigateToEntity}
          />
        )
      
      case 'visualization':
        return (
          <KGVisualization 
            onEntityClick={handleNavigateToEntity}
            onRelationClick={(relationId) => handleNavigateToRelations()}
          />
        )
      
      case 'tuning':
        return <ConfidenceTuning />
      
      default:
        return renderOverview()
    }
  }

  const renderOverview = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Knowledge Graph Management
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Comprehensive tools for managing entities, relations, and extraction quality
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('entities')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entity Management</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Entities</div>
            <p className="text-xs text-muted-foreground">
              View, edit, and merge entities
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('relations')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Relations</div>
            <p className="text-xs text-muted-foreground">
              Approve and curate relationships
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('visualization')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visualization</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Graph View</div>
            <p className="text-xs text-muted-foreground">
              Interactive knowledge graph
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('tuning')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Tuning</CardTitle>
            <Sliders className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Thresholds</div>
            <p className="text-xs text-muted-foreground">
              Configure confidence thresholds
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common knowledge graph management tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              onClick={() => setCurrentView('entities')}
              variant="outline" 
              className="w-full justify-start"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Review Entities Needing Attention
            </Button>
            
            <Button 
              onClick={() => setCurrentView('relations')}
              variant="outline" 
              className="w-full justify-start"
            >
              <Users className="h-4 w-4 mr-2" />
              Approve Pending Relations
            </Button>
            
            <Button 
              onClick={() => setCurrentView('tuning')}
              variant="outline" 
              className="w-full justify-start"
            >
              <Sliders className="h-4 w-4 mr-2" />
              Optimize Quality Thresholds
            </Button>

            <Button 
              onClick={() => setCurrentView('visualization')}
              variant="outline" 
              className="w-full justify-start"
            >
              <Eye className="h-4 w-4 mr-2" />
              Explore Knowledge Graph
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Management Features</CardTitle>
            <CardDescription>
              Advanced KG curation capabilities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 rounded">
              <span className="text-sm font-medium">Entity Merging</span>
              <Badge variant="secondary">Available</Badge>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 rounded">
              <span className="text-sm font-medium">Alias Management</span>
              <Badge variant="secondary">Available</Badge>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 rounded">
              <span className="text-sm font-medium">Relation Curation</span>
              <Badge variant="secondary">Available</Badge>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 rounded">
              <span className="text-sm font-medium">Confidence Tuning</span>
              <Badge variant="secondary">Available</Badge>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950 rounded">
              <span className="text-sm font-medium">Graph Visualization</span>
              <Badge variant="secondary">Interactive</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Navigation */}
      {currentView !== 'overview' && (
        <div className="flex items-center gap-2 pb-4">
          <Button 
            onClick={() => setCurrentView('overview')}
            variant="ghost"
            size="sm"
          >
            ← Back to Overview
          </Button>
          
          <div className="flex gap-1">
            <Badge 
              variant={currentView === 'entities' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCurrentView('entities')}
            >
              Entities
            </Badge>
            <Badge 
              variant={currentView === 'relations' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCurrentView('relations')}
            >
              Relations
            </Badge>
            <Badge 
              variant={currentView === 'visualization' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCurrentView('visualization')}
            >
              Visualization
            </Badge>
            <Badge 
              variant={currentView === 'tuning' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCurrentView('tuning')}
            >
              Tuning
            </Badge>
          </div>
        </div>
      )}

      {/* View Content */}
      {renderViewContent()}
    </div>
  )
}