'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SmartTagInput } from '@/components/ui/smart-tag-input'
import { Upload, FileText, Globe, FileImage, AlertCircle, CheckCircle, X } from 'lucide-react'

interface FileUploadProps {
  onUploadComplete?: (result: any) => void
  onUploadError?: (error: string) => void
}

interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error'
  progress: number
  message: string
  result?: any
}

const SUPPORTED_FORMATS = {
  'application/pdf': { name: 'PDF', icon: FileText, color: 'bg-red-100 text-red-700' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { name: 'DOCX', icon: FileText, color: 'bg-blue-100 text-blue-700' },
  'text/plain': { name: 'TXT', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  'text/markdown': { name: 'MD', icon: FileText, color: 'bg-purple-100 text-purple-700' }
}

export function FileUpload({ onUploadComplete, onUploadError }: FileUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  })
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [uploadMode, setUploadMode] = useState<'file' | 'url' | 'text'>('file')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = useCallback(() => {
    setSelectedFile(null)
    setUrlInput('')
    setTextInput('')
    setTitleInput('')
    setTags([])
    setUploadState({ status: 'idle', progress: 0, message: '' })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const maxSize = 50 * 1024 * 1024 // 50MB
      if (file.size > maxSize) {
        setUploadState({
          status: 'error',
          progress: 0,
          message: 'File size must be less than 50MB'
        })
        return
      }
      
      setSelectedFile(file)
      setUploadState({ status: 'idle', progress: 0, message: '' })
      
      // Auto-fill title if not provided
      if (!titleInput) {
        const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '')
        setTitleInput(nameWithoutExtension)
      }
    }
  }, [titleInput])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    const file = event.dataTransfer.files[0]
    if (file && fileInputRef.current) {
      // Create a new FileList with the dropped file
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInputRef.current.files = dataTransfer.files
      
      handleFileSelect({ target: { files: dataTransfer.files } } as any)
    }
  }, [handleFileSelect])

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const uploadDocument = async () => {
    setUploadState({ status: 'uploading', progress: 10, message: 'Starting upload...' })

    try {
      const payload: any = {
        title: titleInput.trim() || undefined,
        tags: tags,
        auto_extract_metadata: true,
        processing_options: {
          preserve_formatting: true,
          extract_images: false,
          max_pages: 1000
        }
      }

      if (uploadMode === 'file' && selectedFile) {
        setUploadState({ status: 'processing', progress: 30, message: 'Processing file...' })
        const fileData = await convertFileToBase64(selectedFile)
        payload.file_data = fileData
        
      } else if (uploadMode === 'url' && urlInput.trim()) {
        setUploadState({ status: 'processing', progress: 30, message: 'Fetching URL content...' })
        payload.url = urlInput.trim()
        
      } else if (uploadMode === 'text' && textInput.trim()) {
        setUploadState({ status: 'processing', progress: 30, message: 'Processing text...' })
        payload.content = textInput.trim()
        
      } else {
        throw new Error('Please select a file, enter a URL, or provide text content')
      }

      setUploadState({ status: 'processing', progress: 60, message: 'Analyzing content...' })

      const response = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Upload failed with status ${response.status}`)
      }

      setUploadState({ 
        status: 'success', 
        progress: 100, 
        message: result.message || 'Document uploaded successfully!',
        result
      })

      onUploadComplete?.(result)
      
      // Reset form after success
      setTimeout(resetForm, 2000)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setUploadState({
        status: 'error',
        progress: 0,
        message: errorMessage
      })
      onUploadError?.(errorMessage)
    }
  }

  const getFileTypeInfo = (file: File) => {
    const fileType = SUPPORTED_FORMATS[file.type as keyof typeof SUPPORTED_FORMATS] || {
      name: 'FILE',
      icon: FileImage,
      color: 'bg-gray-100 text-gray-700'
    }
    return fileType
  }

  const isValid = () => {
    if (uploadMode === 'file') return selectedFile !== null
    if (uploadMode === 'url') return urlInput.trim().length > 0
    if (uploadMode === 'text') return textInput.trim().length > 0
    return false
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Document
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Mode Selection */}
        <div className="flex gap-2">
          <Button
            variant={uploadMode === 'file' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUploadMode('file')}
          >
            <FileText className="h-4 w-4 mr-2" />
            File
          </Button>
          <Button
            variant={uploadMode === 'url' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUploadMode('url')}
          >
            <Globe className="h-4 w-4 mr-2" />
            URL
          </Button>
          <Button
            variant={uploadMode === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUploadMode('text')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Text
          </Button>
        </div>

        {/* File Upload */}
        {uploadMode === 'file' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    {(() => {
                      const fileType = getFileTypeInfo(selectedFile)
                      const Icon = fileType.icon
                      return (
                        <div className={`px-2 py-1 rounded-md text-sm font-medium ${fileType.color}`}>
                          <Icon className="h-4 w-4 inline mr-1" />
                          {fileType.name}
                        </div>
                      )
                    })()}
                  </div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-gray-400" />
                  <p className="text-sm font-medium">Drop a file here or click to browse</p>
                  <p className="text-xs text-gray-500">
                    Supports PDF, DOCX, TXT, MD files up to 50MB
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* URL Input */}
        {uploadMode === 'url' && (
          <div className="space-y-2">
            <Label htmlFor="url-input">URL</Label>
            <Input
              id="url-input"
              type="url"
              placeholder="https://example.com/document"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Enter a URL to scrape content from a webpage
            </p>
          </div>
        )}

        {/* Text Input */}
        {uploadMode === 'text' && (
          <div className="space-y-2">
            <Label htmlFor="text-input">Text Content</Label>
            <Textarea
              id="text-input"
              placeholder="Paste or type your text content here..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={8}
            />
            <p className="text-xs text-gray-500">
              Paste text content directly
            </p>
          </div>
        )}

        {/* Metadata Inputs */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title-input">Title (optional)</Label>
            <Input
              id="title-input"
              placeholder="Document title..."
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags-input">Tags (optional)</Label>
            <SmartTagInput
              value={tags}
              onChange={setTags}
              content={uploadMode === 'text' ? textInput : undefined}
              placeholder="Enter tags..."
              maxTags={15}
              className="w-full"
            />
          </div>
        </div>

        {/* Upload Progress */}
        {uploadState.status !== 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {uploadState.status === 'success' && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              {uploadState.status === 'error' && (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${
                uploadState.status === 'success' ? 'text-green-700' : 
                uploadState.status === 'error' ? 'text-red-700' : 
                'text-gray-700'
              }`}>
                {uploadState.message}
              </span>
            </div>
            
            {uploadState.status === 'uploading' || uploadState.status === 'processing' ? (
              <Progress value={uploadState.progress} className="w-full" />
            ) : null}

            {uploadState.status === 'success' && uploadState.result?.extracted_metadata && (
              <div className="mt-4 p-3 bg-green-50 rounded-md">
                <p className="text-sm font-medium text-green-700 mb-2">Metadata Extracted:</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-green-600">
                  {uploadState.result.extracted_metadata.format && (
                    <div>Format: {uploadState.result.extracted_metadata.format.toUpperCase()}</div>
                  )}
                  {uploadState.result.extracted_metadata.word_count && (
                    <div>Words: {uploadState.result.extracted_metadata.word_count}</div>
                  )}
                  {uploadState.result.extracted_metadata.page_count && (
                    <div>Pages: {uploadState.result.extracted_metadata.page_count}</div>
                  )}
                  {uploadState.result.extracted_metadata.language && (
                    <div>Language: {uploadState.result.extracted_metadata.language}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Button */}
        <Button
          onClick={uploadDocument}
          disabled={!isValid() || uploadState.status === 'uploading' || uploadState.status === 'processing'}
          className="w-full"
        >
          {uploadState.status === 'uploading' || uploadState.status === 'processing' ? 'Processing...' : 'Upload Document'}
        </Button>
      </CardContent>
    </Card>
  )
}