'use client';

import { Card } from '@/components/ui/card';

export default function MonitoringPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
        <p className="text-gray-600 mt-1">
          Performance metrics, usage analytics, and system health monitoring
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Response Time
          </h3>
          <div className="text-2xl font-bold text-green-600 mb-1">0.98s</div>
          <div className="text-xs text-gray-500">Average chat response</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Conversations
          </h3>
          <div className="text-2xl font-bold text-blue-600 mb-1">19</div>
          <div className="text-xs text-gray-500">Total conversations</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Messages</h3>
          <div className="text-2xl font-bold text-purple-600 mb-1">90</div>
          <div className="text-xs text-gray-500">Total messages</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Citations
          </h3>
          <div className="text-2xl font-bold text-orange-600 mb-1">10</div>
          <div className="text-xs text-gray-500">Active citations</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            System Performance
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">API Response Time</span>
              <span className="text-sm font-medium text-green-600">
                Excellent (0.98s)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">RAG Execution Time</span>
              <span className="text-sm font-medium text-green-600">
                Fast (463ms)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Database Performance
              </span>
              <span className="text-sm font-medium text-green-600">
                Optimal (357ms)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Citation Accuracy</span>
              <span className="text-sm font-medium text-green-600">
                &gt;95%
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Usage Analytics
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active Users</span>
              <span className="text-sm font-medium">2</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Document Corpus Size
              </span>
              <span className="text-sm font-medium">6 documents</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Knowledge Graph Entities
              </span>
              <span className="text-sm font-medium">77 entities</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Processing Queue</span>
              <span className="text-sm font-medium text-green-600">Empty</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-8 text-center">
        <div className="text-gray-500">
          <div className="text-lg font-medium mb-2">
            Advanced Analytics Coming Soon
          </div>
          <div className="text-sm">
            Real-time charts, detailed usage metrics, and comprehensive system
            monitoring will be implemented in Phase 4
          </div>
        </div>
      </Card>
    </div>
  );
}
