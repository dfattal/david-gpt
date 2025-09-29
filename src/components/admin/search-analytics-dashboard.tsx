/**
 * Search Analytics Dashboard Component
 *
 * Real-time performance monitoring dashboard for the three-tier search system.
 */

'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';

interface AnalyticsData {
  summary: {
    timeframe: string;
    totalQueries: number;
    averageLatency: number;
    successRate: number;
    generatedAt: string;
  };
  tierDistribution: {
    sql: { count: number; percentage: number; averageTime: number };
    vector: { count: number; percentage: number; averageTime: number };
    content: { count: number; percentage: number; averageTime: number };
  };
  performanceBenchmarks: {
    sqlTier: { totalQueries: number; under200ms: number; performanceMet: number; target: number };
    vectorTier: { totalQueries: number; under1000ms: number; performanceMet: number; target: number };
    overallSuccess: { rate: number; target: number };
  };
  queryPatterns: Array<{
    query: string;
    tier: string;
    frequency: number;
    avgTime: number;
    lastUsed: string;
  }>;
  recentActivity: {
    queriesLastHour: number;
    tierBreakdown: { sql: number; vector: number; content: number };
    averageLatencyLastHour: number;
  };
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
  };
}

interface SearchAnalyticsDashboardProps {
  className?: string;
}

export function SearchAnalyticsDashboard({ className }: SearchAnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/admin/search-analytics?timeframe=${timeframe}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const analyticsData = await response.json();
      setData(analyticsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    fetchAnalytics();
  }, [timeframe]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, timeframe]);

  // Clear analytics data
  const clearAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/search-analytics', { method: 'DELETE' });
      if (response.ok) {
        await fetchAnalytics(); // Refresh after clearing
      }
    } catch (err) {
      console.error('Failed to clear analytics:', err);
    }
  };

  // Export analytics data
  const exportAnalytics = () => {
    window.open(`/api/admin/search-analytics?timeframe=${timeframe}&format=csv`, '_blank');
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      critical: 'bg-red-100 text-red-800'
    };
    return variants[status as keyof typeof variants] || variants.warning;
  };

  const getPerformanceBadge = (current: number, target: number) => {
    if (current >= target) return 'bg-green-100 text-green-800';
    if (current >= target * 0.8) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Analytics Error</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Search Analytics Dashboard</h2>
        <div className="flex items-center space-x-4">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-md ${autoRefresh ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button
            onClick={exportAnalytics}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Export CSV
          </button>
          <button
            onClick={clearAnalytics}
            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Clear Data
          </button>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">System Health</h3>
          <Badge className={getStatusBadge(data.systemHealth.status)}>
            {data.systemHealth.status.toUpperCase()}
          </Badge>
        </div>
        {data.systemHealth.issues.length > 0 && (
          <div className="space-y-2">
            {data.systemHealth.issues.map((issue, index) => (
              <div key={index} className="text-orange-600 text-sm">⚠️ {issue}</div>
            ))}
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Queries</h3>
          <p className="text-3xl font-bold text-gray-900">{data.summary.totalQueries.toLocaleString()}</p>
          <p className="text-sm text-gray-500">Last {data.summary.timeframe}</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Average Latency</h3>
          <p className="text-3xl font-bold text-gray-900">{data.summary.averageLatency}ms</p>
          <p className="text-sm text-gray-500">Across all tiers</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Success Rate</h3>
          <p className="text-3xl font-bold text-gray-900">{data.summary.successRate.toFixed(1)}%</p>
          <Badge className={getPerformanceBadge(data.summary.successRate, 95)}>
            Target: 95%
          </Badge>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Queries/Hour</h3>
          <p className="text-3xl font-bold text-gray-900">{data.recentActivity.queriesLastHour}</p>
          <p className="text-sm text-gray-500">Recent activity</p>
        </div>
      </div>

      {/* Tier Distribution */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Tier Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(data.tierDistribution).map(([tier, stats]) => (
            <div key={tier} className="text-center">
              <h4 className="text-sm font-medium text-gray-500 mb-2">{tier.toUpperCase()} Tier</h4>
              <p className="text-2xl font-bold text-gray-900">{stats.percentage.toFixed(1)}%</p>
              <p className="text-sm text-gray-500">{stats.count} queries</p>
              <p className="text-sm text-gray-500">Avg: {stats.averageTime}ms</p>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Benchmarks */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Benchmarks</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-2">SQL Tier (&lt;200ms)</h4>
            <p className="text-2xl font-bold text-gray-900">{data.performanceBenchmarks.sqlTier.performanceMet.toFixed(1)}%</p>
            <Badge className={getPerformanceBadge(data.performanceBenchmarks.sqlTier.performanceMet, 80)}>
              Target: 80%
            </Badge>
            <p className="text-sm text-gray-500 mt-1">
              {data.performanceBenchmarks.sqlTier.under200ms}/{data.performanceBenchmarks.sqlTier.totalQueries} queries
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-2">Vector Tier (&lt;1000ms)</h4>
            <p className="text-2xl font-bold text-gray-900">{data.performanceBenchmarks.vectorTier.performanceMet.toFixed(1)}%</p>
            <Badge className={getPerformanceBadge(data.performanceBenchmarks.vectorTier.performanceMet, 80)}>
              Target: 80%
            </Badge>
            <p className="text-sm text-gray-500 mt-1">
              {data.performanceBenchmarks.vectorTier.under1000ms}/{data.performanceBenchmarks.vectorTier.totalQueries} queries
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-2">Overall Success</h4>
            <p className="text-2xl font-bold text-gray-900">{data.performanceBenchmarks.overallSuccess.rate.toFixed(1)}%</p>
            <Badge className={getPerformanceBadge(data.performanceBenchmarks.overallSuccess.rate, 95)}>
              Target: 95%
            </Badge>
          </div>
        </div>
      </div>

      {/* Top Query Patterns */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Top Query Patterns</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.queryPatterns.slice(0, 10).map((pattern, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pattern.query.length > 50 ? pattern.query.substring(0, 50) + '...' : pattern.query}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={`${pattern.tier === 'sql' ? 'bg-blue-100 text-blue-800' :
                                     pattern.tier === 'vector' ? 'bg-purple-100 text-purple-800' :
                                     'bg-green-100 text-green-800'}`}>
                      {pattern.tier.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pattern.frequency}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pattern.avgTime}ms</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(pattern.lastUsed).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-sm text-gray-500 text-center">
        Last updated: {new Date(data.summary.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}