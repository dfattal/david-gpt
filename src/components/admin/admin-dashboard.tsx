'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  FileText, 
  Users, 
  Database, 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  BarChart3,
  RefreshCw,
  Settings
} from 'lucide-react'

interface AdminDashboardData {
  admin_user: {
    email: string
    role: string
    permissions: string[]
  }
  stats: {
    documents: {
      total: number
      by_format: Record<string, number>
      recent_uploads: number
    }
    chunks: {
      total: number
      processing_status: Record<string, number>
    }
    knowledge_graph: {
      entities: number
      relations: number
    }
    users: {
      total: number
      active_today: number
    }
    system: {
      uptime: string
      last_backup: string | null
    }
  }
  system_health: {
    status: 'healthy' | 'warning' | 'error'
    database: 'connected' | 'disconnected'
    embeddings: 'operational' | 'degraded' | 'offline'
    storage: 'available' | 'limited' | 'unavailable'
    last_check: string
  }
  processing_queue: {
    pending_documents: number
    active_jobs: number
    failed_jobs: number
    avg_processing_time: string
  }
  recent_activity: Array<{
    id: string
    admin_email: string
    action: string
    timestamp: string
    resource: string
  }>
}

interface AdminDashboardProps {
  onNavigateToDocuments?: () => void
  onNavigateToKnowledgeGraph?: () => void
  onNavigateToJobs?: () => void
}

export function AdminDashboard({ onNavigateToDocuments, onNavigateToKnowledgeGraph, onNavigateToJobs }: AdminDashboardProps) {
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load dashboard')
      }

      setDashboardData(data)
      setError(null)
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadDashboardData()
  }

  useEffect(() => {
    loadDashboardData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
              <Button onClick={handleRefresh} variant="outline" className="mt-4">
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!dashboardData) return null

  const { admin_user, stats, system_health, processing_queue } = dashboardData

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'operational':
      case 'available':
        return 'text-green-600'
      case 'warning':
      case 'degraded':
      case 'limited':
        return 'text-yellow-600'
      case 'error':
      case 'disconnected':
      case 'offline':
      case 'unavailable':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'operational':
      case 'available':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'warning':
      case 'degraded':
      case 'limited':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case 'error':
      case 'disconnected':
      case 'offline':
      case 'unavailable':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const totalProcessingJobs = processing_queue.pending_documents + processing_queue.active_jobs + processing_queue.failed_jobs
  const processingProgress = totalProcessingJobs > 0 
    ? ((processing_queue.active_jobs + processing_queue.pending_documents) / totalProcessingJobs) * 100 
    : 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Admin Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Welcome back, {admin_user.email}
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">{admin_user.role.replace('_', ' ')}</Badge>
              <Badge variant="outline">{admin_user.permissions.length} permissions</Badge>
            </div>
          </div>
          
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* System Health Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>
              Real-time system status and monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                {getHealthIcon(system_health.status)}
                <span className={`font-medium ${getHealthStatusColor(system_health.status)}`}>
                  System: {system_health.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getHealthIcon(system_health.database)}
                <span className={`font-medium ${getHealthStatusColor(system_health.database)}`}>
                  Database: {system_health.database}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getHealthIcon(system_health.embeddings)}
                <span className={`font-medium ${getHealthStatusColor(system_health.embeddings)}`}>
                  AI: {system_health.embeddings}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getHealthIcon(system_health.storage)}
                <span className={`font-medium ${getHealthStatusColor(system_health.storage)}`}>
                  Storage: {system_health.storage}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">
                Uptime: {stats.system.uptime} • Last check: {new Date(system_health.last_check).toLocaleTimeString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.documents.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.documents.recent_uploads} uploaded today
              </p>
              <div className="mt-2 space-y-1">
                {Object.entries(stats.documents.by_format).map(([format, count]) => (
                  <div key={format} className="flex justify-between text-xs">
                    <span className="capitalize">{format}:</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chunks</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.chunks.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Vector embeddings
              </p>
              <div className="mt-2 space-y-1">
                {Object.entries(stats.chunks.processing_status).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-xs">
                    <span className="capitalize">{status}:</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Knowledge Graph</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.knowledge_graph.entities.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.knowledge_graph.relations.toLocaleString()} relations
              </p>
              <Button 
                onClick={onNavigateToKnowledgeGraph}
                variant="ghost" 
                size="sm" 
                className="mt-2 p-0 h-auto text-xs"
              >
                Manage Graph →
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.users.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.users.active_today} active today
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Processing Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Processing Queue
              </CardTitle>
              <CardDescription>
                Document processing and embedding jobs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Queue Status</span>
                <Badge variant={processing_queue.failed_jobs > 0 ? "destructive" : "secondary"}>
                  {totalProcessingJobs === 0 ? 'Idle' : `${totalProcessingJobs} jobs`}
                </Badge>
              </div>
              
              {totalProcessingJobs > 0 && (
                <div className="space-y-2">
                  <Progress value={processingProgress} className="h-2" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-medium">{processing_queue.pending_documents}</div>
                      <div className="text-gray-500">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{processing_queue.active_jobs}</div>
                      <div className="text-gray-500">Processing</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{processing_queue.failed_jobs}</div>
                      <div className="text-gray-500">Failed</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500">
                  Average processing time: {processing_queue.avg_processing_time}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common administrative tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={onNavigateToDocuments}
                variant="outline" 
                className="w-full justify-start"
              >
                <FileText className="h-4 w-4 mr-2" />
                Manage Documents
              </Button>
              
              <Button 
                onClick={onNavigateToKnowledgeGraph}
                variant="outline" 
                className="w-full justify-start"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Knowledge Graph
              </Button>
              
              <Button 
                onClick={onNavigateToJobs}
                variant="outline" 
                className="w-full justify-start"
              >
                <Settings className="h-4 w-4 mr-2" />
                Job Monitoring
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                disabled
              >
                <Users className="h-4 w-4 mr-2" />
                User Management
                <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}