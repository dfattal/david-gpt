"use client";

import { useState, useEffect } from "react";
import { DocumentUpload } from "@/components/admin/document-upload";
import { BatchFolderUpload } from "@/components/admin/batch-folder-upload";
import { ProcessingStatus } from "@/components/admin/processing-status";
import { DocumentList } from "@/components/admin/document-list";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

interface DocumentStats {
  total: number;
  processing: number;
  completed: number;
  failed: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<DocumentStats>({
    total: 0,
    processing: 0,
    completed: 0,
    failed: 0
  });
  const [activeTab, setActiveTab] = useState<'upload' | 'batch' | 'status' | 'manage'>('upload');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = async () => {
    try {
      const { data: documents } = await supabase
        .from('documents')
        .select('processing_status');

      if (documents) {
        const stats = documents.reduce((acc, doc) => {
          acc.total++;
          if (doc.processing_status === 'pending' || doc.processing_status === 'processing') {
            acc.processing++;
          } else if (doc.processing_status === 'completed') {
            acc.completed++;
          } else if (doc.processing_status === 'failed') {
            acc.failed++;
          }
          return acc;
        }, { total: 0, processing: 0, completed: 0, failed: 0 });

        setStats(stats);
      }
    } catch (error) {
      console.error('Error loading document stats:', error);
    }
  };

  useEffect(() => {
    loadStats();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const tabs = [
    { id: 'upload', name: 'Upload Documents', description: 'Add new documents to the corpus' },
    { id: 'batch', name: 'Batch Upload', description: 'Upload multiple documents from folders' },
    { id: 'status', name: 'Processing Status', description: 'Monitor ongoing document processing' },
    { id: 'manage', name: 'Manage Documents', description: 'View and manage existing documents' }
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Management</h1>
          <p className="text-gray-600 mt-1">
            Manage document ingestion, processing, and knowledge corpus
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          Refresh Stats
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Documents</div>
        </Card>
        <Card className="p-6">
          <div className="text-2xl font-bold text-orange-600">{stats.processing}</div>
          <div className="text-sm text-gray-600">Processing</div>
        </Card>
        <Card className="p-6">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </Card>
        <Card className="p-6">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div>{tab.name}</div>
              <div className="text-xs opacity-75">{tab.description}</div>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-8">
        {activeTab === 'upload' && (
          <DocumentUpload onUploadComplete={handleRefresh} />
        )}
        {activeTab === 'batch' && (
          <BatchFolderUpload onUploadComplete={handleRefresh} />
        )}
        {activeTab === 'status' && (
          <ProcessingStatus refreshKey={refreshKey} />
        )}
        {activeTab === 'manage' && (
          <DocumentList refreshKey={refreshKey} onDocumentUpdate={handleRefresh} />
        )}
      </div>
    </div>
  );
}