/**
 * Admin RAG Document Management Page
 * Allows admins to view, upload, edit, and delete documents
 */

'use client';

import { useState } from 'react';
import { DocumentList } from '@/components/admin/DocumentList';
import { DocumentUpload } from '@/components/admin/DocumentUpload';
import { Button } from '@/components/ui/button';
import { Upload, RefreshCw } from 'lucide-react';

export default function AdminRAGPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setShowUpload(false);
    setRefreshTrigger((prev) => prev + 1); // Trigger document list refresh
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">RAG Document Management</h1>
            <p className="text-muted-foreground mt-2">
              Manage your knowledge base documents, metadata, and ingestion
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowUpload(!showUpload)}>
              <Upload className="h-4 w-4 mr-2" />
              {showUpload ? 'Hide Upload' : 'Upload Documents'}
            </Button>
          </div>
        </div>

        {/* Upload Section */}
        {showUpload && (
          <div className="mb-8">
            <DocumentUpload onSuccess={handleUploadSuccess} />
          </div>
        )}

        {/* Document List */}
        <DocumentList refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}
