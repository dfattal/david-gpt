'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  Activity,
  Database,
  Clock,
  Users,
  FileText,
  Share2,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Server,
  Zap,
  BarChart3,
  RefreshCw
} from 'lucide-react'

interface SystemMetrics {
  system: {
    uptime: number
    memoryUsage: number
    cpuUsage: number
    diskUsage: number
    activeConnections: number
    requestsPerMinute: number
  }
  database: {
    totalDocuments: number
    totalChunks: number
    totalEntities: number
    totalRelations: number
    indexSize: number
    queryLatency: number
  }
  performance: {
    avgResponseTime: number
    cacheHitRate: number
    errorRate: number
    throughput: number
    p95ResponseTime: number
    p99ResponseTime: number
  }
  jobs: {
    pending: number
    running: number
    completed: number
    failed: number
    avgProcessingTime: number
    successRate: number
    queueDepth: number
  }
  usage: {
    activeUsers: number
    totalQueries24h: number
    documentsProcessed24h: number
    entitiesExtracted24h: number
    storageUsed: number
    embeddingCalls24h: number
  }
  health: {
    overall: 'healthy' | 'warning' | 'critical'
    issues: Array<{
      type: 'warning' | 'error'
      message: string
      timestamp: Date
      component: string
    }>
    lastHealthCheck: Date
  }
}

export function SystemDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/system/metrics')
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
        setLastRefresh(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch system metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800">Healthy</Badge>
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Critical</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-gray-500">Loading system metrics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            System Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Real-time system monitoring and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </div>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
          >
            {autoRefresh ? "Auto" : "Manual"}
          </Button>
          <Button onClick={fetchMetrics} size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Status */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
              {getHealthBadge(metrics.health.overall)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.health.issues.length > 0 ? (
              <div className="space-y-2">
                {metrics.health.issues.map((issue, index) => (
                  <div key={index} className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{issue.component}</div>
                      <div className="text-sm text-gray-600">{issue.message}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(issue.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>All systems operational</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* System Performance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Performance</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.performance.avgResponseTime}ms</div>
              <p className="text-xs text-muted-foreground">Average response time</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span>CPU Usage</span>
                  <span>{metrics.system.cpuUsage}%</span>
                </div>
                <Progress value={metrics.system.cpuUsage} className="h-1" />
                <div className="flex justify-between text-xs">
                  <span>Memory Usage</span>
                  <span>{metrics.system.memoryUsage}%</span>
                </div>
                <Progress value={metrics.system.memoryUsage} className="h-1" />
              </div>
            </CardContent>
          </Card>

          {/* Database Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Database</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(metrics.database.totalDocuments)}</div>
              <p className="text-xs text-muted-foreground">Total documents</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Chunks:</span>
                  <span>{formatNumber(metrics.database.totalChunks)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Entities:</span>
                  <span>{formatNumber(metrics.database.totalEntities)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Relations:</span>
                  <span>{formatNumber(metrics.database.totalRelations)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Query Latency:</span>
                  <span>{metrics.database.queryLatency}ms</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Queue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Job Queue</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.jobs.pending}</div>
              <p className="text-xs text-muted-foreground">Pending jobs</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Running:</span>
                  <span className="text-blue-600">{metrics.jobs.running}</span>
                </div>
                <div className="flex justify-between">
                  <span>Completed:</span>
                  <span className="text-green-600">{formatNumber(metrics.jobs.completed)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <span className="text-red-600">{metrics.jobs.failed}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span>{Math.round(metrics.jobs.successRate * 100)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usage (24h)</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(metrics.usage.totalQueries24h)}</div>
              <p className="text-xs text-muted-foreground">Total queries</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Active Users:</span>
                  <span>{metrics.usage.activeUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span>Docs Processed:</span>
                  <span>{metrics.usage.documentsProcessed24h}</span>
                </div>
                <div className="flex justify-between">
                  <span>Entities Extracted:</span>
                  <span>{formatNumber(metrics.usage.entitiesExtracted24h)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Embedding Calls:</span>
                  <span>{formatNumber(metrics.usage.embeddingCalls24h)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>
                Response times, throughput, and cache performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Cache Hit Rate</div>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(metrics.performance.cacheHitRate * 100)}%
                  </div>
                  <Progress value={metrics.performance.cacheHitRate * 100} className="h-2 mt-1" />
                </div>
                <div>
                  <div className="text-sm font-medium">Error Rate</div>
                  <div className="text-2xl font-bold text-red-600">
                    {(metrics.performance.errorRate * 100).toFixed(2)}%
                  </div>
                  <Progress value={metrics.performance.errorRate * 100} className="h-2 mt-1" />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Throughput</span>
                  <span className="font-medium">{metrics.performance.throughput} req/min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">P95 Response Time</span>
                  <span className="font-medium">{metrics.performance.p95ResponseTime}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">P99 Response Time</span>
                  <span className="font-medium">{metrics.performance.p99ResponseTime}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Requests/min</span>
                  <span className="font-medium">{metrics.system.requestsPerMinute}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                System Resources
              </CardTitle>
              <CardDescription>
                Server resources and capacity utilization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Disk Usage</span>
                  <span className="text-sm text-gray-500">{metrics.system.diskUsage}%</span>
                </div>
                <Progress value={metrics.system.diskUsage} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Uptime</span>
                  <span className="font-medium">{formatUptime(metrics.system.uptime)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Active Connections</span>
                  <span className="font-medium">{metrics.system.activeConnections}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Storage Used</span>
                  <span className="font-medium">{formatBytes(metrics.usage.storageUsed)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Index Size</span>
                  <span className="font-medium">{formatBytes(metrics.database.indexSize)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Job Processing Details */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Job Processing Overview
            </CardTitle>
            <CardDescription>
              Background job processing and queue management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">Queue Status</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm">Queue Depth:</span>
                    <Badge variant="outline">{metrics.jobs.queueDepth}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Avg Processing:</span>
                    <span className="text-sm">{metrics.jobs.avgProcessingTime}ms</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">Job Distribution</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-950 rounded">
                    <div className="text-lg font-bold text-blue-600">{metrics.jobs.pending}</div>
                    <div className="text-xs text-blue-600">Pending</div>
                  </div>
                  <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                    <div className="text-lg font-bold text-yellow-600">{metrics.jobs.running}</div>
                    <div className="text-xs text-yellow-600">Running</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">Success Metrics</div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(metrics.jobs.successRate * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                  <Progress 
                    value={metrics.jobs.successRate * 100} 
                    className="h-2 mt-2"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}