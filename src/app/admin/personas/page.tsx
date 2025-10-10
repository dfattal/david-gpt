/**
 * Persona Management Page
 * Create, edit, and manage AI personas
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PersonaList } from '@/components/admin/PersonaList';
import { PersonaEditor } from '@/components/admin/PersonaEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, ArrowLeft, Users, Plus, Home } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type View = 'list' | 'edit' | 'create';

export default function AdminPersonasPage() {
  const [view, setView] = useState<View>('list');
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();

  const handleEdit = (slug: string) => {
    setSelectedPersona(slug);
    setView('edit');
  };

  const handleCreateFromFile = async () => {
    if (!uploadFile) return;

    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await fetch('/api/admin/personas/create', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create persona');
      }

      toast({
        title: 'Persona Created',
        description: `${data.slug} has been created successfully`,
      });

      setUploadFile(null);
      setView('list');
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create persona',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEdit = () => {
    setView('list');
    setSelectedPersona(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleCancelEdit = () => {
    setView('list');
    setSelectedPersona(null);
  };

  return (
    <div className="min-h-screen bg-background">
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
          <div className="flex items-center gap-4">
            {view !== 'list' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView('list');
                  setSelectedPersona(null);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Users className="h-8 w-8" />
                Persona Management
              </h1>
              <p className="text-muted-foreground mt-2">
                {view === 'list' && 'Create and manage AI personas'}
                {view === 'edit' && 'Edit persona configuration'}
                {view === 'create' && 'Upload persona definition file'}
              </p>
            </div>
          </div>

          {view === 'list' && (
            <Button onClick={() => setView('create')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Persona
            </Button>
          )}
        </div>

        {/* Main Content */}
        {view === 'list' && (
          <PersonaList
            key={refreshTrigger}
            onEdit={handleEdit}
            onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
          />
        )}

        {view === 'edit' && selectedPersona && (
          <PersonaEditor
            personaSlug={selectedPersona}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
          />
        )}

        {view === 'create' && (
          <Card>
            <CardHeader>
              <CardTitle>Create New Persona</CardTitle>
              <CardDescription>
                Upload a persona.md file to create a new persona. The file will be processed
                to extract metadata and generate the system prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="persona-file">Persona Definition File</Label>
                  <Input
                    id="persona-file"
                    type="file"
                    accept=".md,.markdown"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Upload a persona.md file following the template format. The file should
                    include frontmatter with metadata and sections for expertise, topics, and
                    system prompt instructions.
                  </p>
                </div>

                {uploadFile && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-1">Selected File:</p>
                    <p className="text-sm text-muted-foreground">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(uploadFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCreateFromFile}
                  disabled={!uploadFile || isCreating}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isCreating ? 'Creating...' : 'Create Persona'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setView('list');
                    setUploadFile(null);
                  }}
                >
                  Cancel
                </Button>
              </div>

              {/* Template download link */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Need a template?</p>
                <p className="text-sm text-muted-foreground">
                  Download the{' '}
                  <a
                    href="/personas/persona_template.md"
                    download
                    className="text-primary hover:underline"
                  >
                    persona template
                  </a>{' '}
                  to get started.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
