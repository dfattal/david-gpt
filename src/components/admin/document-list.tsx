'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase/client';

interface Document {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  processing_status: string;
  doi: string | null;
  arxiv_id: string | null;
  patent_no: string | null;
  url: string | null;
  published_date: string | null;
  filed_date: string | null;
  granted_date: string | null;
  file_size: number | null;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
  created_by: string;
  document_chunks: Array<{ count: number }>;
}

interface DocumentListProps {
  refreshKey: number;
  onDocumentUpdate?: () => void;
}

export function DocumentList({
  refreshKey,
  onDocumentUpdate,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'completed' | 'processing' | 'failed'
  >('all');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'pdf' | 'paper' | 'patent' | 'note' | 'url'
  >('all');
  const { addToast } = useToast();

  const loadDocuments = async () => {
    try {
      let query = supabase
        .from('documents')
        .select(
          `
          *,
          document_chunks(count)
        `
        )
        .order('created_at', { ascending: false });

      // Apply filters
      if (statusFilter !== 'all') {
        query = query.eq('processing_status', statusFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('doc_type', typeFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading documents:', error);
        addToast('Failed to load documents', 'error');
        return;
      }

      let filteredData = data || [];

      // Apply search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        filteredData = filteredData.filter(
          doc =>
            doc.title.toLowerCase().includes(searchLower) ||
            doc.doi?.toLowerCase().includes(searchLower) ||
            doc.patent_no?.toLowerCase().includes(searchLower) ||
            doc.arxiv_id?.toLowerCase().includes(searchLower)
        );
      }

      setDocuments(filteredData);
    } catch (error) {
      console.error('Error loading documents:', error);
      addToast('Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [refreshKey, statusFilter, typeFilter, searchTerm]);

  const deleteDocument = async (documentId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) {
        console.error('Error deleting document:', error);
        addToast('Failed to delete document', 'error');
        return;
      }

      addToast('Document deleted successfully', 'success');
      onDocumentUpdate?.();
      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      addToast('Failed to delete document', 'error');
    }
  };

  const reprocessDocument = async (documentId: string) => {
    if (
      !confirm(
        'Are you sure you want to reprocess this document? This will overwrite existing chunks and embeddings.'
      )
    ) {
      return;
    }

    try {
      // Update document status to pending
      const { error } = await supabase
        .from('documents')
        .update({
          processing_status: 'pending',
          error_message: null,
        })
        .eq('id', documentId);

      if (error) {
        console.error('Error updating document:', error);
        addToast('Failed to reprocess document', 'error');
        return;
      }

      addToast('Document queued for reprocessing', 'success');
      onDocumentUpdate?.();
      loadDocuments();
    } catch (error) {
      console.error('Error reprocessing document:', error);
      addToast('Failed to reprocess document', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'pdf':
        return 'bg-red-100 text-red-800';
      case 'paper':
        return 'bg-blue-100 text-blue-800';
      case 'patent':
        return 'bg-purple-100 text-purple-800';
      case 'note':
        return 'bg-green-100 text-green-800';
      case 'url':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-64">
            <Input
              placeholder="Search documents by title, DOI, patent number..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Types</option>
              <option value="pdf">PDF</option>
              <option value="paper">Paper</option>
              <option value="patent">Patent</option>
              <option value="note">Note</option>
              <option value="url">URL</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Documents Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                      {doc.title}
                    </div>
                    {doc.error_message && (
                      <div className="text-xs text-red-600 mt-1 max-w-xs truncate">
                        {doc.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(doc.doc_type)}`}
                    >
                      {doc.doc_type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(doc.processing_status)}`}
                    >
                      {doc.processing_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    <div className="space-y-1">
                      {doc.doi && <div>DOI: {doc.doi}</div>}
                      {doc.patent_no && <div>Patent: {doc.patent_no}</div>}
                      {doc.arxiv_id && <div>arXiv: {doc.arxiv_id}</div>}
                      {doc.file_size && (
                        <div>Size: {formatFileSize(doc.file_size)}</div>
                      )}
                      {doc.published_date && (
                        <div>Published: {formatDate(doc.published_date)}</div>
                      )}
                      <div>Chunks: {doc.document_chunks?.[0]?.count || 0}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    <div>{formatDate(doc.created_at)}</div>
                    {doc.processed_at && (
                      <div className="text-green-600">
                        Processed: {formatDate(doc.processed_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      {doc.processing_status === 'failed' && (
                        <Button
                          onClick={() => reprocessDocument(doc.id)}
                          variant="outline"
                          className="text-xs px-2 py-1"
                        >
                          Retry
                        </Button>
                      )}
                      <Button
                        onClick={() => deleteDocument(doc.id)}
                        variant="outline"
                        className="text-xs px-2 py-1 text-red-600 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {documents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-lg font-medium mb-2">No documents found</div>
            <div className="text-sm">
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Upload your first document to get started'}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
