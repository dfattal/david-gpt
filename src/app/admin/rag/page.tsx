/**
 * Admin RAG Document Management Page
 * Allows admins to view, upload, edit, and delete documents
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DocumentList } from '@/components/admin/DocumentList';
import { DocumentUpload } from '@/components/admin/DocumentUpload';
import { PdfExtraction } from '@/components/admin/PdfExtraction';
import { UrlExtraction } from '@/components/admin/UrlExtraction';
import { MarkdownExtraction } from '@/components/admin/MarkdownExtraction';
import { PersonaSelectorBar } from '@/components/admin/PersonaSelectorBar';
import { Button } from '@/components/ui/button';
import { Upload, RefreshCw, FileText, Link as LinkIcon, FileEdit, ArrowLeft, Home } from 'lucide-react';

type UploadMode = 'markdown-upload' | 'markdown-extract' | 'pdf' | 'url';

export default function AdminRAGPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [showUpload, setShowUpload] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>('url');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  // Initialize persona from URL on mount
  useEffect(() => {
    const personaParam = searchParams.get('persona');
    if (personaParam) {
      setSelectedPersona(personaParam);
    }
  }, [searchParams]);

  // Update URL when persona changes
  const handlePersonaChange = (slug: string | null) => {
    setSelectedPersona(slug);

    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    if (slug) {
      params.set('persona', slug);
    } else {
      params.delete('persona');
    }
    router.push(`/admin/rag?${params.toString()}`, { scroll: false });
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    setRefreshTrigger((prev) => prev + 1); // Trigger document list refresh
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Persona Selector Bar */}
      <PersonaSelectorBar
        selectedSlug={selectedPersona}
        onChange={handlePersonaChange}
      />

      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </Button>
          <span className="text-muted-foreground">/</span>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Admin Dashboard
            </Link>
          </Button>
        </div>

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
          <div className="mb-8 space-y-4">
            {/* Upload Mode Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setUploadMode('url')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  uploadMode === 'url'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <LinkIcon className="h-4 w-4 inline mr-2" />
                URL Extraction
              </button>
              <button
                onClick={() => setUploadMode('pdf')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  uploadMode === 'pdf'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-4 w-4 inline mr-2" />
                PDF Extraction
              </button>
              <button
                onClick={() => setUploadMode('markdown-extract')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  uploadMode === 'markdown-extract'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileEdit className="h-4 w-4 inline mr-2" />
                RAW Markdown
              </button>
              <button
                onClick={() => setUploadMode('markdown-upload')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  uploadMode === 'markdown-upload'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="h-4 w-4 inline mr-2" />
                Formatted Markdown
              </button>
            </div>

            {/* Upload Interface */}
            {uploadMode === 'url' ? (
              <UrlExtraction
                onSuccess={handleUploadSuccess}
                defaultPersonaSlugs={selectedPersona ? [selectedPersona] : undefined}
              />
            ) : uploadMode === 'pdf' ? (
              <PdfExtraction
                onSuccess={handleUploadSuccess}
                defaultPersonaSlugs={selectedPersona ? [selectedPersona] : undefined}
              />
            ) : uploadMode === 'markdown-extract' ? (
              <MarkdownExtraction
                onSuccess={handleUploadSuccess}
                defaultPersonaSlugs={selectedPersona ? [selectedPersona] : undefined}
              />
            ) : (
              <DocumentUpload
                onSuccess={handleUploadSuccess}
                defaultPersonaSlugs={selectedPersona ? [selectedPersona] : undefined}
              />
            )}
          </div>
        )}

        {/* Document List */}
        <DocumentList
          refreshTrigger={refreshTrigger}
          defaultPersonaFilter={selectedPersona || undefined}
        />
      </div>
    </div>
  );
}
