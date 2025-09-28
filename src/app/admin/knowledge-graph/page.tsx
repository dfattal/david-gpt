'use client';

import { Card } from '@/components/ui/card';

export default function KnowledgeGraphPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Knowledge Graph Management
        </h1>
        <p className="text-gray-600 mt-1">
          Manage entities, relationships, and knowledge graph validation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Entities</h3>
          <p className="text-sm text-gray-600 mb-4">
            Browse and manage knowledge graph entities
          </p>
          <div className="text-2xl font-bold text-blue-600 mb-1">77</div>
          <div className="text-xs text-gray-500">Total entities</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Relationships
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            View and edit entity relationships
          </p>
          <div className="text-2xl font-bold text-green-600 mb-1">5</div>
          <div className="text-xs text-gray-500">Active relationships</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Validation
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Data quality and consistency checks
          </p>
          <div className="text-2xl font-bold text-orange-600 mb-1">3</div>
          <div className="text-xs text-gray-500">Issues to review</div>
        </Card>
      </div>

      <Card className="p-8 text-center">
        <div className="text-gray-500">
          <div className="text-lg font-medium mb-2">
            Knowledge Graph Tools Coming Soon
          </div>
          <div className="text-sm">
            Entity browser, relationship editor, and validation tools will be
            implemented in Phase 2
          </div>
        </div>
      </Card>
    </div>
  );
}
