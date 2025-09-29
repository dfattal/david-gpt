"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRealtimeAnalytics } from '@/hooks/use-realtime-analytics';
import {
  Activity,
  Users,
  MessageSquare,
  Database,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Eye,
  Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function RealtimeAnalyticsDashboard() {
  const {
    analytics,
    personaActivity,
    isLoading,
    error,
    isConnected,
    refresh,
    lastUpdated
  } = useRealtimeAnalytics();

  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>Failed to load analytics: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSystemHealthColor = (health?: string) => {
    switch (health) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'down': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPersonaStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'busy': return 'text-orange-600 bg-orange-100';
      case 'idle': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Real-time Analytics</h2>
          <p className="text-muted-foreground">
            Live system metrics and persona activity
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge variant={isConnected ? "default" : "secondary"} className="flex items-center gap-1">
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? 'Live' : 'Polling'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Health */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge className={cn("capitalize", getSystemHealthColor(analytics?.systemHealth))}>
                {analytics?.systemHealth || 'unknown'}
              </Badge>
              {analytics?.systemHealth === 'healthy' && (
                <CheckCircle className="w-4 h-4 text-green-600" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.activeUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active today
            </p>
          </CardContent>
        </Card>

        {/* Messages Last Hour */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.messagesLastHour || 0}</div>
            <p className="text-xs text-muted-foreground">
              Last hour
            </p>
          </CardContent>
        </Card>

        {/* Conversations Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Conversations</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.conversationsToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              Today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Personas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalPersonas || 0}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.activePersonas || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalMessages?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalDocuments?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.documentsThisWeek || 0} this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Persona Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Persona Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Real-time activity for all personas
            </p>
          </div>
          <Dialog open={isDetailViewOpen} onOpenChange={setIsDetailViewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Detailed View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Detailed Persona Activity</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-96">
                <div className="space-y-4">
                  {personaActivity.map((persona) => (
                    <Card key={persona.persona_id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{persona.name}</h4>
                            <p className="text-sm text-muted-foreground">{persona.persona_id}</p>
                          </div>
                          <Badge className={getPersonaStatusColor(persona.status)}>
                            {persona.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div>
                            <div className="text-lg font-semibold">{persona.conversations_last_hour}</div>
                            <div className="text-xs text-muted-foreground">Conversations/hour</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold">{persona.messages_last_hour}</div>
                            <div className="text-xs text-muted-foreground">Messages/hour</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold">{persona.active_users}</div>
                            <div className="text-xs text-muted-foreground">Active users</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold">{persona.avg_response_time.toFixed(0)}ms</div>
                            <div className="text-xs text-muted-foreground">Avg response</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {personaActivity.slice(0, 5).map((persona) => (
              <div key={persona.persona_id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    persona.status === 'active' ? "bg-green-500" :
                    persona.status === 'busy' ? "bg-orange-500" : "bg-gray-400"
                  )} />
                  <div>
                    <div className="font-medium text-sm">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">{persona.persona_id}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <MessageSquare className="w-3 h-3" />
                    <span>{persona.messages_last_hour}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{persona.active_users}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", getPersonaStatusColor(persona.status))}
                  >
                    {persona.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-1">
          <Clock className="w-4 h-4" />
          <span>
            Last updated {lastUpdated ? formatDistanceToNow(new Date(lastUpdated), { addSuffix: true }) : 'never'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <Zap className="w-4 h-4" />
          <span>Auto-refresh every 5 seconds</span>
        </div>
      </div>
    </div>
  );
}