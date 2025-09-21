"use client";

import { useState, useCallback, useRef, ChangeEvent, FC } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { validateDocument } from "@/lib/validation/document-format-validator";
import { validatePersona } from "@/lib/validation/persona-validator";
import { AlertCircle, CheckCircle, AlertTriangle, Eye, FileText, Folder as FolderIcon, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IngestionProgressVisualizer } from "./ingestion-progress-visualizer";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Type Definitions ---

interface ValidationResult {
  isValid: boolean;
  valid: boolean;
  errors: Array<{ type: string; field?: string; message: string; severity: string }>;
  warnings: Array<{ type: string; field?: string; message: string; suggestion: string }>;
  suggestions: string[];
  qualityScore: number;
  type: 'document' | 'persona';
}

interface UploadFile {
  file: File;
  path: string;
  status: 'pending' | 'validating' | 'validated' | 'error';
  validation?: ValidationResult;
}

interface Folder {
  name: string;
  path: string;
  files: UploadFile[];
  subfolders: Map<string, Folder>;
  fileCount: number;
  isOpen: boolean;
}

interface ModernBatchFolderUploadProps {
  onUploadComplete?: () => void;
}

// --- Helper Functions & Components ---

const isPersonaFile = (filename: string): boolean => {
  const name = filename.toLowerCase();
  return name.includes('persona') || name.includes('expert') || name.includes('character');
};

const validateFileContent = async (file: File, content: string): Promise<ValidationResult> => {
  try {
    const filename = file.name;
    if (isPersonaFile(filename)) {
      const personaId = filename.replace('.md', '').replace(/^.*\//, '');
      const result = validatePersona(content, personaId as any, filename);
      return {
        ...result,
        type: 'persona',
        valid: result.isValid,
        errors: result.errors.map(e => ({ type: 'validation', message: e.message, severity: 'error' })),
        warnings: result.warnings.map(w => ({ type: 'validation', message: w.message, suggestion: w.suggestion }))
      };
    } else {
      const result = validateDocument(content, filename);
      return {
        ...result,
        type: 'document',
        valid: result.isValid
      };
    }
  } catch (error) {
    return {
      isValid: false,
      valid: false,
      errors: [{ type: 'validation', message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, severity: 'error' }],
      warnings: [],
      suggestions: [],
      qualityScore: 0,
      type: 'document',
    };
  }
};

const getValidationBadge = (validation?: ValidationResult, validating?: boolean) => {
  if (validating) {
    return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Spinner className="w-3 h-3 mr-1" />Validating...</Badge>;
  }
  if (!validation) {
    return <Badge variant="secondary">Not Validated</Badge>;
  }
  if (validation.valid) {
    return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Valid ({validation.qualityScore}/100)</Badge>;
  }
  if (validation.errors.length > 0) {
    return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Errors ({validation.qualityScore}/100)</Badge>;
  }
  return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3 mr-1" />Warnings ({validation.qualityScore}/100)</Badge>;
};

const FolderTree: FC<{ folder: Folder; onFileClick: (file: UploadFile) => void; onToggle: (path: string) => void; }> = ({ folder, onFileClick, onToggle }) => {
  return (
    <div className="pl-4">
      <div className="flex items-center cursor-pointer py-1" onClick={() => onToggle(folder.path)}>
        <FolderIcon className="w-5 h-5 mr-2 text-yellow-500" />
        <span className="font-medium text-gray-800">{folder.name}</span>
        <span className="ml-2 text-sm text-gray-500">({folder.fileCount} files)</span>
      </div>
      {folder.isOpen && (
        <div>
          {Array.from(folder.subfolders.values()).map(subfolder => (
            <FolderTree key={subfolder.path} folder={subfolder} onFileClick={onFileClick} onToggle={onToggle} />
          ))}
          {folder.files.map(file => (
            <div key={file.path} className="flex items-center justify-between pl-6 pr-2 py-1.5 border-l border-gray-200 ml-2">
              <div className="flex items-center truncate">
                <FileText className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate" title={file.file.name}>{file.file.name}</span>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                {getValidationBadge(file.validation, file.status === 'validating')}
                <Button size="sm" variant="ghost" onClick={() => onFileClick(file)} className="h-7 w-7 p-0">
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

export function BatchFolderUpload({ onUploadComplete }: ModernBatchFolderUploadProps) {
  const [rootFolder, setRootFolder] = useState<Folder | null>(null);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchDescription, setBatchDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    setValidating(true);
    setRootFolder(null);
    addToast(`Analyzing folder...`, 'info');

    const newRootFolder: Folder = { name: 'root', path: 'root', files: [], subfolders: new Map(), fileCount: 0, isOpen: true };
    const markdownFiles: UploadFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.md') || !file.webkitRelativePath) continue;

      const pathParts = file.webkitRelativePath.split('/').slice(0, -1);
      let currentFolder = newRootFolder;
      let currentPath = 'root';

      for (const part of pathParts) {
        currentPath = `${currentPath}/${part}`;
        if (!currentFolder.subfolders.has(part)) {
          currentFolder.subfolders.set(part, { name: part, path: currentPath, files: [], subfolders: new Map(), fileCount: 0, isOpen: true });
        }
        currentFolder = currentFolder.subfolders.get(part)!;
      }

      const uploadFile: UploadFile = { file, path: file.webkitRelativePath, status: 'validating' };
      currentFolder.files.push(uploadFile);
      markdownFiles.push(uploadFile);
    }

    const updateFileCounts = (folder: Folder): number => {
      let count = folder.files.length;
      folder.subfolders.forEach(sub => count += updateFileCounts(sub));
      folder.fileCount = count;
      return count;
    };
    updateFileCounts(newRootFolder);

    setRootFolder(newRootFolder);
    addToast(`Found ${markdownFiles.length} markdown files. Starting validation...`, 'info');

    await Promise.all(markdownFiles.map(async (uploadFile) => {
      try {
        const content = await uploadFile.file.text();
        const validation = await validateFileContent(uploadFile.file, content);
        uploadFile.validation = validation;
        uploadFile.status = !validation.isValid ? 'error' : 'validated';
      } catch (e) {
        uploadFile.status = 'error';
        uploadFile.validation = {
          isValid: false,
          valid: false,
          errors: [{ type: 'validation', message: `Failed to read/validate: ${e instanceof Error ? e.message : 'Unknown'}`, severity: 'error' }],
          warnings: [],
          suggestions: [],
          qualityScore: 0,
          type: 'document'
        };
      }
      setRootFolder(prev => prev ? { ...prev } : null);
    }));

    setValidating(false);
    addToast('Validation complete.', 'success');
  };

  const handleUpload = async () => {
    if (!rootFolder || rootFolder.fileCount === 0) {
      addToast('No files to upload.', 'error');
      return;
    }

    const getAllFiles = (folder: Folder): UploadFile[] => [
      ...folder.files,
      ...Array.from(folder.subfolders.values()).flatMap(getAllFiles)
    ];

    const allFiles = getAllFiles(rootFolder);
    const filesToUpload = allFiles.filter(f => f.status !== 'error');
    const invalidFileCount = allFiles.length - filesToUpload.length;

    if (filesToUpload.length === 0) {
      addToast('No valid files to upload.', 'warning');
      return;
    }

    if (invalidFileCount > 0) {
      if (!window.confirm(`${invalidFileCount} files have validation errors and will be skipped. Continue?`)) return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('batchDescription', batchDescription);

    // Add files with proper naming for the API
    filesToUpload.forEach((uploadFile, index) => {
      formData.append(`file_${index}`, uploadFile.file, uploadFile.path);
    });

    try {
      const response = await fetch('/api/documents/folder-ingest', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setBatchId(result.batchId);
        addToast(`Upload complete! Starting ingestion for ${filesToUpload.length} files.`, 'success');
      } else {
        addToast(result.error || result.message || 'Upload failed', 'error');
        setUploading(false);
      }
    } catch (error) {
      addToast(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      setUploading(false);
    }
  };

  const openViewDialog = (file: UploadFile) => {
    setSelectedFile(file);
    setIsViewDialogOpen(true);
  };

  const toggleFolder = (path: string) => {
    if (!rootFolder) return;
    const findAndToggle = (folder: Folder): boolean => {
      if (folder.path === path) {
        folder.isOpen = !folder.isOpen;
        return true;
      }
      for (const sub of folder.subfolders.values()) {
        if (findAndToggle(sub)) return true;
      }
      return false;
    };
    findAndToggle(rootFolder);
    setRootFolder({ ...rootFolder });
  };

  const getValidationStats = () => {
    if (!rootFolder) return { valid: 0, warning: 0, error: 0, total: 0 };
    const allFiles = (function getAll(folder: Folder): UploadFile[] {
      return [...folder.files, ...Array.from(folder.subfolders.values()).flatMap(getAll)];
    })(rootFolder);

    return {
      valid: allFiles.filter(f => f.validation?.valid).length,
      warning: allFiles.filter(f => f.validation && f.validation.isValid && f.validation.warnings.length > 0).length,
      error: allFiles.filter(f => f.validation && !f.validation.isValid).length,
      total: allFiles.length
    };
  };

  const stats = getValidationStats();

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Folder-Based Document Ingestion</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload your entire `/my-corpus` folder structure. Only markdown files (.md) will be processed.
        </p>
        <div className="space-y-4">
          <Input
            value={batchDescription}
            onChange={(e) => setBatchDescription(e.target.value)}
            placeholder="Batch description (e.g., 'Q4 2024 research corpus')"
          />

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
            {...({ webkitdirectory: "", directory: "" } as any)}
            multiple
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 bg-gray-50 hover:bg-blue-50 transition-colors"
          >
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-700">Click to select a folder</p>
            <p className="text-xs text-gray-500">Upload and validate an entire corpus of markdown files with folder structure preservation.</p>
          </div>
        </div>
      </Card>

      {rootFolder && rootFolder.fileCount > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Folder Preview ({rootFolder.fileCount} files)</h3>
            <div className="flex space-x-2">
              <Button onClick={() => setRootFolder(null)} variant="outline" disabled={uploading}>Clear</Button>
              <Button onClick={handleUpload} disabled={uploading || validating} className="min-w-32">
                {uploading ? <><Spinner className="w-4 h-4 mr-2" />Uploading...</> : `Upload Valid Files`}
              </Button>
            </div>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Validation Status:</span>
              <div className="flex space-x-4">
                <span className="text-green-600">✓ {stats.valid} Valid</span>
                <span className="text-yellow-600">⚠ {stats.warning} Warnings</span>
                <span className="text-red-600">✗ {stats.error} Errors</span>
              </div>
            </div>
          </div>

          {uploading && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 my-4">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}

          <ScrollArea className="h-96">
            <FolderTree folder={rootFolder} onFileClick={openViewDialog} onToggle={toggleFolder} />
          </ScrollArea>
        </Card>
      )}

      {batchId && (
        <IngestionProgressVisualizer
          batchId={batchId}
          onComplete={(results: any) => {
            setUploading(false);
            setBatchId(null);
            setRootFolder(null);
            onUploadComplete?.();
            const completed = results?.completedDocuments || 0;
            const failed = results?.failedDocuments || 0;
            addToast(`Batch completed! ${completed} successful, ${failed} failed`, failed > 0 ? 'error' : 'success');
          }}
        />
      )}

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Validation Details: {selectedFile?.file.name}</DialogTitle></DialogHeader>
          {selectedFile && (
            <ScrollArea className="max-h-[70vh] pr-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {getValidationBadge(selectedFile.validation)}
                </div>
                {selectedFile.validation?.errors && selectedFile.validation.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <h4 className="text-sm font-medium text-red-800 mb-1">Errors:</h4>
                    <ul className="text-sm text-red-700 list-disc list-inside">
                      {selectedFile.validation.errors.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message}</li>)}
                    </ul>
                  </div>
                )}
                {selectedFile.validation?.warnings && selectedFile.validation.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="text-sm font-medium text-yellow-800 mb-1">Warnings:</h4>
                    <ul className="text-sm text-yellow-700 list-disc list-inside">
                      {selectedFile.validation.warnings.map((w, i) => <li key={i}>{typeof w === 'string' ? w : w.message}</li>)}
                    </ul>
                  </div>
                )}
                {selectedFile.validation?.suggestions && selectedFile.validation.suggestions.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <h4 className="text-sm font-medium text-blue-800 mb-1">Suggestions:</h4>
                    <ul className="text-sm text-blue-700 list-disc list-inside">
                      {selectedFile.validation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}