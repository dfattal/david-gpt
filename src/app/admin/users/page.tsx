'use client';

import { Card } from '@/components/ui/card';

export default function UsersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">
          Manage user roles, permissions, and access control
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Admin Users
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Users with full system access
          </p>
          <div className="text-2xl font-bold text-purple-600 mb-1">1</div>
          <div className="text-xs text-gray-500">Admin accounts</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Member Users
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Authenticated users with conversation access
          </p>
          <div className="text-2xl font-bold text-blue-600 mb-1">1</div>
          <div className="text-xs text-gray-500">Member accounts</div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Guest Users
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Users with limited access
          </p>
          <div className="text-2xl font-bold text-gray-600 mb-1">0</div>
          <div className="text-xs text-gray-500">Guest sessions</div>
        </Card>
      </div>

      <Card className="p-8 text-center">
        <div className="text-gray-500">
          <div className="text-lg font-medium mb-2">
            User Management Tools Coming Soon
          </div>
          <div className="text-sm">
            User list, role management, and permission controls will be
            implemented in Phase 3
          </div>
        </div>
      </Card>
    </div>
  );
}
