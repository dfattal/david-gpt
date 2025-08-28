'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Settings,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Save,
  Play,
  AlertTriangle,
  CheckCircle,
  Info
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

interface ConfidenceThreshold {
  id: string
  extraction_type: 'entity' | 'relation'
  context: string
  threshold_value: number
  created_at: string
  updated_at: string
  created_by: string
  description?: string
  is_active: boolean
}

interface ImpactAnalysis {
  current_threshold: number
  proposed_threshold: number
  extraction_type: 'entity' | 'relation'
  context: string
  impact: {
    items_affected: number
    items_above_threshold: number
    items_below_threshold: number
    quality_score_change: number
    precision_estimate: number
    recall_estimate: number
  }
  examples: {
    would_include: Array<{
      id: string
      name: string
      confidence: number
      type?: string
    }>
    would_exclude: Array<{
      id: string
      name: string
      confidence: number
      type?: string
    }>
  }
}

interface DistributionData {
  bins: Array<{
    range: string
    count: number
    percentage: number
  }>
  total: number
  average: number
  median: number
}

export function ConfidenceTuning() {
  const [thresholds, setThresholds] = useState<ConfidenceThreshold[]>([])
  const [entityDistribution, setEntityDistribution] = useState<DistributionData | null>(null)
  const [relationDistribution, setRelationDistribution] = useState<DistributionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ImpactAnalysis | null>(null)
  const [analyzingThreshold, setAnalyzingThreshold] = useState<{
    type: 'entity' | 'relation'
    context: string
    value: number
  } | null>(null)

  const loadData = async () => {
    try {
      const [thresholdsResponse, entityDistResponse, relationDistResponse] = await Promise.all([
        fetch('/api/admin/kg/confidence'),
        fetch('/api/admin/kg/confidence?action=distribution&extraction_type=entity'),
        fetch('/api/admin/kg/confidence?action=distribution&extraction_type=relation')
      ])

      const [thresholdsData, entityDistData, relationDistData] = await Promise.all([
        thresholdsResponse.json(),
        entityDistResponse.json(),
        relationDistResponse.json()
      ])

      if (!thresholdsResponse.ok || !entityDistResponse.ok || !relationDistResponse.ok) {
        throw new Error('Failed to load confidence data')
      }

      setThresholds(thresholdsData.thresholds)
      setEntityDistribution(entityDistData.distribution)
      setRelationDistribution(relationDistData.distribution)
      setError(null)
    } catch (err) {
      console.error('Failed to load confidence data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load confidence data')
    } finally {
      setLoading(false)
    }
  }

  const analyzeThresholdImpact = async (
    extractionType: 'entity' | 'relation',
    context: string,
    proposedThreshold: number
  ) => {
    setAnalyzingThreshold({ type: extractionType, context, value: proposedThreshold })
    
    try {
      const response = await fetch(
        `/api/admin/kg/confidence?action=analyze&extraction_type=${extractionType}&context=${context}&proposed_threshold=${proposedThreshold}`
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze threshold impact')
      }

      setAnalysis(data.analysis)
    } catch (err) {
      console.error('Failed to analyze threshold:', err)
      setError(err instanceof Error ? err.message : 'Failed to analyze threshold')
    } finally {
      setAnalyzingThreshold(null)
    }
  }

  const createThreshold = async (
    extractionType: 'entity' | 'relation',
    context: string,
    thresholdValue: number,
    description?: string
  ) => {
    try {
      const response = await fetch('/api/admin/kg/confidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_threshold',
          extraction_type: extractionType,
          context,
          threshold_value: thresholdValue,
          description
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create threshold')
      }

      await loadData()
    } catch (err) {
      console.error('Failed to create threshold:', err)
      setError(err instanceof Error ? err.message : 'Failed to create threshold')
    }
  }

  const updateThreshold = async (thresholdId: string, updates: any) => {
    try {
      const response = await fetch('/api/admin/kg/confidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_threshold',
          threshold_id: thresholdId,
          updates
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update threshold')
      }

      await loadData()
    } catch (err) {
      console.error('Failed to update threshold:', err)
      setError(err instanceof Error ? err.message : 'Failed to update threshold')
    }
  }

  const applyThresholds = async () => {
    try {
      const response = await fetch('/api/admin/kg/confidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'apply_thresholds'
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply thresholds')
      }

      await loadData()
      alert(`Thresholds applied! Updated ${data.results.entities_updated} entities and ${data.results.relations_updated} relations.`)
    } catch (err) {
      console.error('Failed to apply thresholds:', err)
      setError(err instanceof Error ? err.message : 'Failed to apply thresholds')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const renderDistributionChart = (distribution: DistributionData, title: string) => {
    const maxCount = Math.max(...distribution.bins.map(bin => bin.count))
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>
            Total: {distribution.total} | Average: {(distribution.average * 100).toFixed(1)}% | 
            Median: {(distribution.median * 100).toFixed(1)}%
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {distribution.bins.map((bin, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-16 text-sm">{bin.range}</div>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(bin.count / maxCount) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                    {bin.count}
                  </span>
                </div>
                <div className="w-12 text-sm text-right">{bin.percentage}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
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
          <Button onClick={() => loadData()} variant="outline" className="mt-4">
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
            Confidence Threshold Tuning
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Optimize extraction quality by adjusting confidence thresholds
          </p>
        </div>
        
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                New Threshold
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Confidence Threshold</DialogTitle>
                <DialogDescription>
                  Set quality thresholds for entities or relations
                </DialogDescription>
              </DialogHeader>
              <ThresholdForm onSave={createThreshold} />
            </DialogContent>
          </Dialog>

          <Button onClick={applyThresholds} className="bg-blue-600 hover:bg-blue-700">
            <Play className="h-4 w-4 mr-2" />
            Apply Thresholds
          </Button>

          <Button onClick={() => loadData()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Confidence Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {entityDistribution && renderDistributionChart(entityDistribution, 'Entity Confidence Distribution')}
        {relationDistribution && renderDistributionChart(relationDistribution, 'Relation Confidence Distribution')}
      </div>

      {/* Current Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Active Thresholds</CardTitle>
          <CardDescription>
            Current confidence thresholds for entities and relations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {thresholds.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No confidence thresholds configured
            </div>
          ) : (
            <div className="space-y-4">
              {thresholds.map((threshold) => (
                <div
                  key={threshold.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="capitalize">
                          {threshold.extraction_type}
                        </Badge>
                        <Badge variant="secondary">
                          {threshold.context}
                        </Badge>
                        <span className="font-medium">
                          {(threshold.threshold_value * 100).toFixed(1)}%
                        </span>
                      </div>
                      {threshold.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {threshold.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Created: {new Date(threshold.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => analyzeThresholdImpact(
                          threshold.extraction_type,
                          threshold.context,
                          threshold.threshold_value
                        )}
                        variant="outline"
                        size="sm"
                        disabled={analyzingThreshold !== null}
                      >
                        {analyzingThreshold?.type === threshold.extraction_type &&
                         analyzingThreshold?.context === threshold.context &&
                         analyzingThreshold?.value === threshold.threshold_value ? (
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        )}
                        Analyze
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impact Analysis */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Impact Analysis
            </CardTitle>
            <CardDescription>
              Analysis for {analysis.extraction_type} threshold in {analysis.context} context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {analysis.impact.items_above_threshold}
                </div>
                <div className="text-sm text-gray-600">Items Above Threshold</div>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {(analysis.impact.precision_estimate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Est. Precision</div>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {(analysis.impact.recall_estimate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Est. Recall</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {analysis.examples.would_include.length > 0 && (
                <div>
                  <h4 className="font-medium text-green-700 mb-2">Would Include</h4>
                  <div className="space-y-2">
                    {analysis.examples.would_include.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-950 rounded">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-sm">{(item.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.examples.would_exclude.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-700 mb-2">Would Exclude</h4>
                  <div className="space-y-2">
                    {analysis.examples.would_exclude.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950 rounded">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-sm">{(item.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface ThresholdFormProps {
  onSave: (extractionType: 'entity' | 'relation', context: string, thresholdValue: number, description?: string) => void
}

function ThresholdForm({ onSave }: ThresholdFormProps) {
  const [extractionType, setExtractionType] = useState<'entity' | 'relation'>('entity')
  const [context, setContext] = useState('global')
  const [thresholdValue, setThresholdValue] = useState(0.7)
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(extractionType, context, thresholdValue, description)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="extractionType">Type</Label>
        <Select 
          value={extractionType} 
          onValueChange={(value: any) => setExtractionType(value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entity">Entity</SelectItem>
            <SelectItem value="relation">Relation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="context">Context</Label>
        <Input
          id="context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="global, company, person, etc."
          required
        />
      </div>

      <div>
        <Label htmlFor="thresholdValue">Threshold Value (0-1)</Label>
        <Input
          id="thresholdValue"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={thresholdValue}
          onChange={(e) => setThresholdValue(parseFloat(e.target.value))}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Purpose and rationale for this threshold"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit">
          <Save className="h-4 w-4 mr-2" />
          Create Threshold
        </Button>
      </div>
    </form>
  )
}