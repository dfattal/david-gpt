/**
 * Document Actions Component
 * Action buttons for document operations (edit, reingest, delete, download)
 */

'use client';

import { useState } from 'react';
import { DocumentMetadataEditor } from '@/components/admin/DocumentMetadataEditor';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MoreVertical, Edit, RefreshCw, Download, Trash2 } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  type: string;
  tags: string[];
  chunk_count?: number;
}

interface DocumentActionsProps {
  document: Document & { raw_content?: string };
  onDeleted: (docId: string) => void;
  onUpdated: () => void;
}

export function DocumentActions({
  document,
  onDeleted,
  onUpdated,
}: DocumentActionsProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReingestDialog, setShowReingestDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullDocument, setFullDocument] = useState<any>(null);

  const handleEdit = async () => {
    // Fetch full document details if not already loaded
    if (!document.raw_content) {
      try {
        const response = await fetch(`/api/admin/documents/${document.id}`);
        if (!response.ok) throw new Error('Failed to fetch document');
        const data = await response.json();
        setFullDocument(data.document);
        setShowEditor(true);
      } catch (err) {
        setError('Failed to load document');
      }
    } else {
      setFullDocument(document);
      setShowEditor(true);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/admin/documents/${document.id}/download`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (err) {
      setError('Download failed');
    }
  };

  const handleReingest = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch(`/api/admin/documents/${document.id}/reingest`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Reingest failed');
      }

      setShowReingestDialog(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reingest failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch(`/api/admin/documents/${document.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Delete failed');
      }

      setShowDeleteDialog(false);
      onDeleted(document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Metadata
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowReingestDialog(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-ingest
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Metadata Editor Dialog */}
      {fullDocument && (
        <DocumentMetadataEditor
          document={fullDocument}
          isOpen={showEditor}
          onClose={() => setShowEditor(false)}
          onSuccess={onUpdated}
        />
      )}

      {/* Reingest Confirmation Dialog */}
      <Dialog open={showReingestDialog} onOpenChange={setShowReingestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-ingest Document?</DialogTitle>
            <DialogDescription>
              This will delete all existing chunks ({document.chunk_count || 0}) and
              re-run the chunking, contextual retrieval, and embedding process for
              &quot;{document.title}&quot;.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReingestDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleReingest} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Re-ingest'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{document.title}&quot; and all associated data:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{document.chunk_count || 0} chunks</li>
                <li>Document metadata</li>
                <li>Storage file</li>
              </ul>
              <p className="mt-3 font-medium text-red-600">
                This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isProcessing}
            >
              {isProcessing ? 'Deleting...' : 'Delete Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
