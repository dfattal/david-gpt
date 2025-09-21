"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, Upload, Download, Eye, Edit, Trash2, AlertCircle, CheckCircle, FileText, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { validatePersona } from '@/lib/validation/persona-validator';
import { parsePersona } from '@/lib/personas/persona-parser';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface PersonaRecord {
  id: string;
  persona_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  validation_status: 'valid' | 'invalid' | 'warning' | null;
  validation_errors: string[];
  metadata?: any;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  qualityScore: number;
  persona?: any;
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<PersonaRecord | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editPersonaId, setEditPersonaId] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPersonas(data || []);
    } catch (error) {
      console.error('Error loading personas:', error);
    } finally {
      setLoading(false);
    }
  };

  const validatePersonaContent = (content: string, personaId: string): ValidationResult => {
    try {
      const validation = validatePersona(content, personaId);
      return validation;
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        suggestions: [],
        qualityScore: 0,
      };
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith('.md')) {
      alert('Please select a markdown (.md) file');
      return;
    }

    setUploading(true);
    try {
      const content = await file.text();
      const personaId = file.name.replace('.md', '');

      // Validate before upload
      const validation = validatePersonaContent(content, personaId);

      if (!validation.valid && validation.errors.length > 0) {
        alert(`Validation failed:\n${validation.errors.join('\n')}`);
        return;
      }

      // Parse persona
      let parsedPersona;
      try {
        parsedPersona = parsePersona(content, personaId);
      } catch (error) {
        console.warn('Parser failed, but validation passed:', error);
      }

      // Save to database
      const { error } = await supabase
        .from('personas')
        .upsert({
          persona_id: personaId,
          content,
          validation_status: validation.valid ? 'valid' : 'warning',
          validation_errors: validation.errors,
          metadata: parsedPersona ? {
            name: parsedPersona.name,
            expertiseDomains: parsedPersona.expertiseDomains?.length || 0,
            qualityScore: validation.qualityScore,
          } : null,
          is_active: true,
        });

      if (error) throw error;

      await loadPersonas();
      alert('Persona uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleCreatePersona = async () => {
    if (!editPersonaId.trim() || !editContent.trim()) {
      alert('Please provide both persona ID and content');
      return;
    }

    setUploading(true);
    try {
      // Validate content
      const validation = validatePersonaContent(editContent, editPersonaId);

      if (!validation.valid && validation.errors.length > 0) {
        setValidationResult(validation);
        setUploading(false);
        return;
      }

      // Parse persona
      let parsedPersona;
      try {
        parsedPersona = parsePersona(editContent, editPersonaId);
      } catch (error) {
        console.warn('Parser failed:', error);
      }

      // Save to database
      const { error } = await supabase
        .from('personas')
        .insert({
          persona_id: editPersonaId,
          content: editContent,
          validation_status: validation.valid ? 'valid' : 'warning',
          validation_errors: validation.errors,
          metadata: parsedPersona ? {
            name: parsedPersona.name,
            expertiseDomains: parsedPersona.expertiseDomains?.length || 0,
            qualityScore: validation.qualityScore,
          } : null,
          is_active: true,
        });

      if (error) throw error;

      await loadPersonas();
      setIsCreateDialogOpen(false);
      setEditContent('');
      setEditPersonaId('');
      setValidationResult(null);
    } catch (error) {
      console.error('Create error:', error);
      alert('Create failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleEditPersona = async () => {
    if (!selectedPersona || !editContent.trim()) return;

    setUploading(true);
    try {
      // Validate content
      const validation = validatePersonaContent(editContent, selectedPersona.persona_id);

      if (!validation.valid && validation.errors.length > 0) {
        setValidationResult(validation);
        setUploading(false);
        return;
      }

      // Parse persona
      let parsedPersona;
      try {
        parsedPersona = parsePersona(editContent, selectedPersona.persona_id);
      } catch (error) {
        console.warn('Parser failed:', error);
      }

      // Update database
      const { error } = await supabase
        .from('personas')
        .update({
          content: editContent,
          validation_status: validation.valid ? 'valid' : 'warning',
          validation_errors: validation.errors,
          metadata: parsedPersona ? {
            name: parsedPersona.name,
            expertiseDomains: parsedPersona.expertiseDomains?.length || 0,
            qualityScore: validation.qualityScore,
          } : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPersona.id);

      if (error) throw error;

      await loadPersonas();
      setIsEditDialogOpen(false);
      setValidationResult(null);
    } catch (error) {
      console.error('Edit error:', error);
      alert('Edit failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePersona = async (persona: PersonaRecord) => {
    if (!confirm(`Are you sure you want to delete persona "${persona.persona_id}"?`)) return;

    try {
      const { error } = await supabase
        .from('personas')
        .delete()
        .eq('id', persona.id);

      if (error) throw error;
      await loadPersonas();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Delete failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleToggleActive = async (persona: PersonaRecord) => {
    try {
      const { error } = await supabase
        .from('personas')
        .update({ is_active: !persona.is_active })
        .eq('id', persona.id);

      if (error) throw error;
      await loadPersonas();
    } catch (error) {
      console.error('Toggle error:', error);
      alert('Toggle failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const exportPersona = (persona: PersonaRecord) => {
    const blob = new Blob([persona.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${persona.persona_id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openViewDialog = (persona: PersonaRecord) => {
    setSelectedPersona(persona);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (persona: PersonaRecord) => {
    setSelectedPersona(persona);
    setEditContent(persona.content);
    setEditPersonaId(persona.persona_id);
    setValidationResult(null);
    setIsEditDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditContent('');
    setEditPersonaId('');
    setValidationResult(null);
    setIsCreateDialogOpen(true);
  };

  const getStatusBadge = (persona: PersonaRecord) => {
    if (!persona.validation_status) {
      return <Badge variant="secondary">Unknown</Badge>;
    }

    switch (persona.validation_status) {
      case 'valid':
        return <Badge variant="default" className="bg-green-100 text-green-800">Valid</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const renderValidationResult = (result: ValidationResult) => {
    if (!result) return null;

    return (
      <div className="mt-4 p-4 border rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          {result.valid ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="font-medium">
            Validation {result.valid ? 'Passed' : 'Failed'}
          </span>
          <span className="text-sm text-gray-500">
            (Score: {result.qualityScore}/100)
          </span>
        </div>

        {result.errors.length > 0 && (
          <div className="mb-2">
            <div className="text-sm font-medium text-red-600 mb-1">Errors:</div>
            <ul className="text-sm text-red-600 list-disc list-inside">
              {result.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="mb-2">
            <div className="text-sm font-medium text-yellow-600 mb-1">Warnings:</div>
            <ul className="text-sm text-yellow-600 list-disc list-inside">
              {result.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div>
            <div className="text-sm font-medium text-blue-600 mb-1">Suggestions:</div>
            <ul className="text-sm text-blue-600 list-disc list-inside">
              {result.suggestions.map((suggestion, i) => (
                <li key={i}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading personas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Persona Management</h1>
          <p className="text-gray-600">Create and manage AI personas for the chat system</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreateDialog} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Persona
          </Button>
          <div className="relative">
            <input
              type="file"
              accept=".md"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <Button disabled={uploading} className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload .md'}
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Personas</p>
              <p className="text-2xl font-bold">{personas.length}</p>
            </div>
            <User className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {personas.filter(p => p.is_active).length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Valid</p>
              <p className="text-2xl font-bold text-green-600">
                {personas.filter(p => p.validation_status === 'valid').length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Issues</p>
              <p className="text-2xl font-bold text-red-600">
                {personas.filter(p => p.validation_status === 'invalid' || p.validation_errors.length > 0).length}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Personas List */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Personas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Persona
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quality
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {personas.map((persona) => (
                <tr key={persona.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {persona.persona_id}
                        </div>
                        <div className="text-sm text-gray-500">
                          {persona.metadata?.name || 'No name parsed'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(persona)}
                      {!persona.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {persona.metadata?.qualityScore || 0}/100
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(persona.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openViewDialog(persona)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(persona)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportPersona(persona)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(persona)}
                        className={persona.is_active ? 'text-yellow-600' : 'text-green-600'}
                      >
                        {persona.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePersona(persona)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View Persona: {selectedPersona?.persona_id}</DialogTitle>
          </DialogHeader>
          {selectedPersona && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {getStatusBadge(selectedPersona)}
                <span className="text-sm text-gray-500">
                  Quality Score: {selectedPersona.metadata?.qualityScore || 0}/100
                </span>
              </div>
              {selectedPersona.validation_errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-sm font-medium text-red-800 mb-1">Validation Errors:</div>
                  <ul className="text-sm text-red-700 list-disc list-inside">
                    {selectedPersona.validation_errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="bg-gray-50 p-4 rounded border">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {selectedPersona.content}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Persona: {selectedPersona?.persona_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                // Clear validation when content changes
                setValidationResult(null);
              }}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Paste persona markdown content here..."
            />

            {validationResult && renderValidationResult(validationResult)}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  const validation = validatePersonaContent(editContent, selectedPersona?.persona_id || '');
                  setValidationResult(validation);
                }}
              >
                Validate
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEditPersona} disabled={uploading}>
                  {uploading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Persona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={editPersonaId}
              onChange={(e) => setEditPersonaId(e.target.value)}
              placeholder="Persona ID (e.g., financial-expert)"
              className="font-mono"
            />
            <Textarea
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                setValidationResult(null);
              }}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Paste persona markdown content here..."
            />

            {validationResult && renderValidationResult(validationResult)}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  if (!editPersonaId.trim()) {
                    alert('Please enter a persona ID first');
                    return;
                  }
                  const validation = validatePersonaContent(editContent, editPersonaId);
                  setValidationResult(validation);
                }}
              >
                Validate
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreatePersona} disabled={uploading}>
                  {uploading ? 'Creating...' : 'Create Persona'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}