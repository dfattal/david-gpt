'use client';

import { useState } from 'react';
import {
  Database,
  Network,
  BarChart3,
  Settings,
  ChevronRight,
  Users,
  GitMerge,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EntityBrowser } from './entity-browser';
import { RelationshipBrowser } from './relationship-browser';
import { KGQualityDashboard } from './kg-quality-dashboard';
import { DatabaseResetDialog } from './database-reset-dialog';

type KGAdminTab = 'dashboard' | 'entities' | 'relationships' | 'settings';

interface KGAdminLayoutProps {
  initialTab?: KGAdminTab;
}

export function KGAdminLayout({
  initialTab = 'dashboard',
}: KGAdminLayoutProps) {
  const [activeTab, setActiveTab] = useState<KGAdminTab>(initialTab);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const tabs = [
    {
      id: 'dashboard' as const,
      label: 'Quality Dashboard',
      icon: BarChart3,
      description: 'Monitor KG quality and identify issues',
      badge: null,
    },
    {
      id: 'entities' as const,
      label: 'Entity Management',
      icon: Database,
      description: 'Browse, edit, and merge entities',
      badge: null,
    },
    {
      id: 'relationships' as const,
      label: 'Relationship Management',
      icon: Network,
      description: 'Manage connections between entities',
      badge: null,
    },
    {
      id: 'settings' as const,
      label: 'KG Settings',
      icon: Settings,
      description:
        'Configure knowledge graph parameters and database management',
      badge: null,
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <KGQualityDashboard />;
      case 'entities':
        return <EntityBrowser />;
      case 'relationships':
        return <RelationshipBrowser />;
      case 'settings':
        return (
          <div className="space-y-8">
            <div className="text-center">
              <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                KG Settings
              </h3>
              <p className="text-gray-600 mb-8">
                Knowledge graph configuration and maintenance settings.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <Card className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Database Reset
                    </h4>
                    <p className="text-gray-600 text-sm mb-4">
                      Permanently delete all data from the database. This action
                      cannot be undone and should only be used in testing
                      environments.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-yellow-800 text-sm">
                        <strong>Warning:</strong> This will delete all entities,
                        relationships, documents, conversations, and user data.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowResetDialog(true)}
                      className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Reset Database
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Knowledge Graph Administration
          </h1>
          <p className="text-gray-600 mt-1">
            Manage and optimize your knowledge graph
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setShowResetDialog(true)}
            className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Clear DB
          </Button>
          <Badge variant="outline" className="text-green-700 border-green-300">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
            System Active
          </Badge>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-8">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
                disabled={false}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {tab.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Description */}
      <div className="text-sm text-gray-600">
        {tabs.find(tab => tab.id === activeTab)?.description}
      </div>

      {/* Main Content */}
      <div className="py-6">{renderTabContent()}</div>

      {/* Help Cards for first-time users */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="p-6">
            <div className="flex items-center mb-3">
              <Users className="w-6 h-6 text-blue-600 mr-2" />
              <h3 className="font-semibold text-gray-900">Entity Management</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Browse and manage all entities in your knowledge graph. Search,
              filter, edit, and merge duplicate entities.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('entities')}
            >
              <Eye className="w-4 h-4 mr-2" />
              View Entities
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center mb-3">
              <Network className="w-6 h-6 text-green-600 mr-2" />
              <h3 className="font-semibold text-gray-900">Relationships</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage connections between entities. Create, edit, and delete
              relationships to improve graph connectivity.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('relationships')}
            >
              <Eye className="w-4 h-4 mr-2" />
              View Relationships
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center mb-3">
              <GitMerge className="w-6 h-6 text-purple-600 mr-2" />
              <h3 className="font-semibold text-gray-900">Quality Tools</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Use automated tools to detect duplicates, orphaned entities, and
              other quality issues for systematic cleanup.
            </p>
            <Button variant="outline" size="sm" disabled>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Auto-Cleanup (Coming Soon)
            </Button>
          </Card>
        </div>
      )}

      {/* Database Reset Dialog */}
      <DatabaseResetDialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
      />
    </div>
  );
}
