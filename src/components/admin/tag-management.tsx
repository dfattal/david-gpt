'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ArrowLeft, Tags, Merge, Edit3, AlertTriangle, Sparkles, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TagAnalytics {
  tag: string
  count: number
  lastUsed: string
  variants: string[]
  needsNormalization: boolean
}

interface TagOperation {
  type: 'normalize' | 'merge' | 'rename'
  data: any
}

export function TagManagement() {
  const router = useRouter()
  const [analytics, setAnalytics] = useState<TagAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [operation, setOperation] = useState<TagOperation | null>(null)
  const [newTagName, setNewTagName] = useState('')

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/rag/tags?type=analytics')
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data.analytics || [])
      }
    } catch (error) {
      console.error('Failed to load tag analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [])

  const handleTagOperation = async (op: TagOperation) => {
    try {
      setProcessing(true)
      
      const response = await fetch('/api/rag/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: op.type,
          tags: op.data
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message)
        await loadAnalytics()
        setOperation(null)
        setSelectedTags([])
        setNewTagName('')
      } else {
        const error = await response.json()
        alert(`Operation failed: ${error.error}`)
      }
    } catch (error) {
      console.error('Tag operation failed:', error)
      alert('Operation failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getTagColor = (count: number) => {
    if (count >= 10) return 'bg-green-100 text-green-800'
    if (count >= 5) return 'bg-blue-100 text-blue-800'
    if (count >= 2) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-800'
  }

  // Group tags for better organization
  const popularTags = analytics.filter(tag => tag.count >= 3)
  const infrequentTags = analytics.filter(tag => tag.count < 3)
  const tagsNeedingNormalization = analytics.filter(tag => tag.needsNormalization)

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
              <Tags size={24} />
              Tag Management
            </h1>
            <p className="text-gray-600">Organize and normalize your document tags</p>
          </div>
        </div>
        <Button onClick={loadAnalytics} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading tag analytics...</div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Tags</p>
                    <p className="text-2xl font-bold">{analytics.length}</p>
                  </div>
                  <Tags className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Popular Tags</p>
                    <p className="text-2xl font-bold">{popularTags.length}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Need Normalization</p>
                    <p className="text-2xl font-bold">{tagsNeedingNormalization.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Infrequent Tags</p>
                    <p className="text-2xl font-bold">{infrequentTags.length}</p>
                  </div>
                  <Sparkles className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tags Needing Normalization */}
          {tagsNeedingNormalization.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-orange-600" />
                  Tags Needing Normalization
                </CardTitle>
                <p className="text-sm text-gray-600">
                  These tags have multiple variants that should be standardized
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tagsNeedingNormalization.map(tag => (
                    <div key={tag.tag} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={getTagColor(tag.count)}>
                            {tag.tag} ({tag.count} uses)
                          </Badge>
                          <span className="text-sm text-gray-500">
                            Last used: {formatDate(tag.lastUsed)}
                          </span>
                        </div>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Edit3 size={14} className="mr-1" />
                              Normalize
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Normalize Tag Variants</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Current variants:</Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tag.variants.map(variant => (
                                    <Badge key={variant} variant="secondary">
                                      {variant}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label htmlFor="standard-form">Standard form:</Label>
                                <Input
                                  id="standard-form"
                                  value={newTagName || tag.variants[0]}
                                  onChange={(e) => setNewTagName(e.target.value)}
                                  placeholder="Enter the standard form"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setNewTagName('')}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => handleTagOperation({
                                    type: 'normalize',
                                    data: {
                                      oldTags: tag.variants,
                                      standardTag: newTagName || tag.variants[0]
                                    }
                                  })}
                                  disabled={processing}
                                >
                                  {processing ? 'Processing...' : 'Normalize'}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Variants: </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tag.variants.map(variant => (
                            <Badge key={variant} variant="outline" className="text-xs">
                              {variant}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Popular Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} className="text-green-600" />
                Popular Tags
              </CardTitle>
              <p className="text-sm text-gray-600">
                Frequently used tags (3+ documents)
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {popularTags.map(tag => (
                  <div key={tag.tag} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={getTagColor(tag.count)}>
                        {tag.tag}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {tag.count} uses
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Last used: {formatDate(tag.lastUsed)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bulk Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Bulk Operations</CardTitle>
              <p className="text-sm text-gray-600">
                Select multiple tags to merge or rename
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Tag Selection */}
                <div>
                  <Label>Select tags to operate on:</Label>
                  <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-lg max-h-40 overflow-y-auto">
                    {analytics.map(tag => (
                      <button
                        key={tag.tag}
                        onClick={() => {
                          if (selectedTags.includes(tag.tag)) {
                            setSelectedTags(prev => prev.filter(t => t !== tag.tag))
                          } else {
                            setSelectedTags(prev => [...prev, tag.tag])
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded ${
                          selectedTags.includes(tag.tag)
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-gray-100 text-gray-600 border-gray-300'
                        } border hover:border-blue-300`}
                      >
                        {tag.tag} ({tag.count})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected tags */}
                {selectedTags.length > 0 && (
                  <div>
                    <Label>Selected tags ({selectedTags.length}):</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedTags.map(tag => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Operations */}
                {selectedTags.length > 1 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Merge size={14} className="mr-1" />
                        Merge Selected Tags
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Merge Tags</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Tags to merge:</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedTags.map(tag => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="target-tag">Merge into (target tag):</Label>
                          <Input
                            id="target-tag"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder="Enter the target tag name"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => {
                            setNewTagName('')
                            setSelectedTags([])
                          }}>
                            Cancel
                          </Button>
                          <Button
                            onClick={() => handleTagOperation({
                              type: 'merge',
                              data: {
                                sourceTags: selectedTags,
                                targetTag: newTagName
                              }
                            })}
                            disabled={processing || !newTagName.trim()}
                          >
                            {processing ? 'Processing...' : 'Merge Tags'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}