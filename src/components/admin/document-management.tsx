'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileUpload } from '@/components/rag/file-upload'
import { ArrowLeft, FileText, Upload, Calendar, Tag, ExternalLink, Trash2, Eye, Cog, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  title: string
  source_type: string
  source_uri?: string
  doc_date: string
  tags: string[]
  labels: Record<string, any>
  created_at: string
  updated_at: string
  processing_status?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed'
  processed_at?: string
  chunk_count?: number
}

export function DocumentManagement() {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [processingDoc, setProcessingDoc] = useState<string | null>(null)

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/rag/documents')
      if (!response.ok) {
        throw new Error('Failed to load documents')
      }
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const handleUploadComplete = (result: any) => {
    console.log('Upload completed:', result)
    // Refresh documents list
    loadDocuments()
    // Hide upload form
    setShowUpload(false)
  }

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error)
  }

  const handleProcessDocument = async (documentId: string) => {
    try {
      setProcessingDoc(documentId)
      
      const response = await fetch('/api/rag/test-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ document_id: documentId })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Processing failed')
      }

      console.log('Processing completed:', result)
      alert(`Processing completed! Created ${result.results?.chunks_created || 0} chunks.`)
      
      // Refresh documents to show updated status
      await loadDocuments()
    } catch (error) {
      console.error('Processing error:', error)
      alert(error instanceof Error ? error.message : 'Failed to process document')
    } finally {
      setProcessingDoc(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getSourceTypeIcon = (sourceType: string) => {
    switch (sourceType.toLowerCase()) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-600" />
      case 'docx':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'url':
        return <ExternalLink className="h-4 w-4 text-green-600" />
      case 'text':
        return <FileText className="h-4 w-4 text-gray-600" />
      case 'markdown':
      case 'md':
        return <FileText className="h-4 w-4 text-purple-600" />
      default:
        return <FileText className="h-4 w-4 text-gray-600" />
    }
  }

  const getSourceTypeBadgeColor = (sourceType: string) => {
    switch (sourceType.toLowerCase()) {
      case 'pdf':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'docx':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'url':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'text':
        return 'bg-gray-100 text-gray-700 border-gray-200'
      case 'markdown':
      case 'md':
        return 'bg-purple-100 text-purple-700 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getProcessingStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing':
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Cog className="h-4 w-4 text-gray-400" />
    }
  }

  const getProcessingStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'processing':
      case 'queued':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  if (showUpload) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => setShowUpload(false)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
        </div>
        
        <div className="max-w-2xl mx-auto">
          <FileUpload 
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button 
              variant="ghost" 
              onClick={() => router.push('/admin')}
              className="p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">Document Management</h1>
          </div>
          <p className="text-gray-600">
            Upload and manage documents for RAG processing
          </p>
        </div>
        
        <Button onClick={() => setShowUpload(true)} className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
              <p className="text-gray-500 mb-4">
                Upload your first document to get started with RAG processing
              </p>
              <Button onClick={() => setShowUpload(true)} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Document
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div key={doc.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {getSourceTypeIcon(doc.source_type)}
                        <h3 className="font-medium text-gray-900 truncate">
                          {doc.title}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={getSourceTypeBadgeColor(doc.source_type)}
                        >
                          {doc.source_type.toUpperCase()}
                        </Badge>
                        {doc.labels?.processing_status && (
                          <div className="flex items-center gap-1">
                            {getProcessingStatusIcon(doc.labels.processing_status)}
                            <Badge 
                              variant="outline" 
                              className={getProcessingStatusColor(doc.labels.processing_status)}
                            >
                              {doc.labels.processing_status.toUpperCase()}
                            </Badge>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Document Date: {formatDate(doc.doc_date)}
                        </div>
                        <div>
                          Uploaded: {formatDate(doc.created_at)}
                        </div>
                        {doc.labels?.processed_at && (
                          <div>
                            Processed: {formatDate(doc.labels.processed_at)}
                          </div>
                        )}
                        {doc.labels?.chunk_count && (
                          <div>
                            Chunks: {doc.labels.chunk_count}
                          </div>
                        )}
                      </div>

                      {doc.source_uri && (
                        <div className="text-sm text-gray-600 mb-2">
                          Source: <span className="font-mono text-xs">{doc.source_uri}</span>
                        </div>
                      )}

                      {doc.tags.length > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="h-4 w-4 text-gray-400" />
                          <div className="flex flex-wrap gap-1">
                            {doc.tags.map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {doc.labels.extracted_metadata && (
                        <div className="text-xs text-gray-500 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {doc.labels.extracted_metadata.word_count && (
                            <div>Words: {doc.labels.extracted_metadata.word_count.toLocaleString()}</div>
                          )}
                          {doc.labels.extracted_metadata.page_count && (
                            <div>Pages: {doc.labels.extracted_metadata.page_count}</div>
                          )}
                          {doc.labels.extracted_metadata.language && (
                            <div>Language: {doc.labels.extracted_metadata.language}</div>
                          )}
                          {doc.labels.extracted_metadata.format && (
                            <div>Format: {doc.labels.extracted_metadata.format.toUpperCase()}</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {(!doc.labels?.processing_status || doc.labels.processing_status === 'failed') && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleProcessDocument(doc.id)}
                          disabled={processingDoc === doc.id}
                        >
                          <Cog className={`h-4 w-4 mr-1 ${processingDoc === doc.id ? 'animate-spin' : ''}`} />
                          {processingDoc === doc.id ? 'Processing...' : 'Process'}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}