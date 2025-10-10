/**
 * Unified Persona Editor Component
 * Edit all aspects of a persona: identity, system prompt, search config, metadata
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Save, X, Plus, Upload, User } from 'lucide-react';
import { getPersonaAvatar, getLocalAvatarPath } from '@/lib/avatar-utils';

interface Topic {
  id: string;
  aliases: string[];
}

interface PersonaData {
  slug: string;
  name: string;
  persona_type: 'real_person' | 'fictional_character';
  expertise: string;
  content: string; // System prompt
  example_questions: string[];
  avatar_url: string | null;
  search: {
    vector_threshold: number;
  };
  topics: Topic[];
  frontmatter?: {
    title: string;
    version: string;
    last_updated: string;
    persona_id: string;
    description: string;
    author: string | null;
    tags: string[];
  };
}

interface PersonaEditorProps {
  personaSlug: string;
  onSave?: () => void;
  onCancel?: () => void;
}

export function PersonaEditor({ personaSlug, onSave, onCancel }: PersonaEditorProps) {
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [newExampleQuestion, setNewExampleQuestion] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [newTopicAlias, setNewTopicAlias] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadPersona();
  }, [personaSlug]);

  const loadPersona = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/personas/${personaSlug}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load persona');
      }

      // Transform API response to editor format
      setPersona({
        slug: data.config.slug,
        name: data.config.display_name,
        persona_type: data.config.persona_type || 'fictional_character',
        expertise: data.config.expertise,
        content: data.config.content || '',
        example_questions: data.config.example_questions || [],
        avatar_url: data.config.avatar_url || null,
        search: data.config.search,
        topics: data.config.topics,
        frontmatter: data.config.frontmatter,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load persona',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!persona) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/personas/${personaSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: persona.slug,
          display_name: persona.name,
          persona_type: persona.persona_type,
          expertise: persona.expertise,
          content: persona.content,
          example_questions: persona.example_questions,
          search: persona.search,
          topics: persona.topics,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save persona');
      }

      toast({
        title: 'Success',
        description: 'Persona updated successfully',
      });

      onSave?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save persona',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !persona) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slug', persona.slug);

      const response = await fetch(`/api/admin/personas/${persona.slug}/avatar`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload avatar');
      }

      setPersona({
        ...persona,
        avatar_url: data.avatar_url,
      });

      toast({
        title: 'Success',
        description: 'Avatar uploaded successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload avatar',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddExampleQuestion = () => {
    if (!persona || !newExampleQuestion.trim()) return;

    setPersona({
      ...persona,
      example_questions: [...persona.example_questions, newExampleQuestion.trim()],
    });
    setNewExampleQuestion('');
  };

  const handleRemoveExampleQuestion = (index: number) => {
    if (!persona) return;

    setPersona({
      ...persona,
      example_questions: persona.example_questions.filter((_, i) => i !== index),
    });
  };

  const handleAddTopic = () => {
    if (!persona || !newTopicId.trim()) return;

    setPersona({
      ...persona,
      topics: [...persona.topics, { id: newTopicId.trim(), aliases: [] }],
    });
    setNewTopicId('');
  };

  const handleRemoveTopic = (topicId: string) => {
    if (!persona) return;

    setPersona({
      ...persona,
      topics: persona.topics.filter((t) => t.id !== topicId),
    });
  };

  const handleAddAlias = (topicId: string) => {
    if (!persona || !newTopicAlias.trim()) return;

    setPersona({
      ...persona,
      topics: persona.topics.map((topic) =>
        topic.id === topicId
          ? { ...topic, aliases: [...topic.aliases, newTopicAlias.trim()] }
          : topic
      ),
    });
    setNewTopicAlias('');
  };

  const handleRemoveAlias = (topicId: string, alias: string) => {
    if (!persona) return;

    setPersona({
      ...persona,
      topics: persona.topics.map((topic) =>
        topic.id === topicId
          ? { ...topic, aliases: topic.aliases.filter((a) => a !== alias) }
          : topic
      ),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Loading persona...</div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-destructive">Failed to load persona</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Edit Persona</h2>
          <p className="text-muted-foreground">
            Modify all aspects of {persona.name || personaSlug}
          </p>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Tabbed interface */}
      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="search">Search Config</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        {/* Identity Tab */}
        <TabsContent value="identity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Persona Identity</CardTitle>
              <CardDescription>
                Basic information about the persona
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar Upload */}
              <div className="space-y-2">
                <Label>Avatar Image</Label>
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <img
                      src={getPersonaAvatar({
                        slug: persona.slug,
                        name: persona.name,
                        avatar_url: persona.avatar_url,
                        is_active: true,
                        description: '',
                        expertise_domains: []
                      })}
                      alt={persona.name}
                      className="w-24 h-24 rounded-full object-cover border-2 border-border"
                      onError={(e) => {
                        // Fallback to local avatar or default if Supabase URL fails
                        const localPath = getLocalAvatarPath(persona.slug);
                        if (localPath && e.currentTarget.src !== localPath) {
                          e.currentTarget.src = localPath;
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploadingAvatar}
                        onClick={() => document.getElementById('avatar-upload')?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                      </Button>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended: Square image, 128x128px or larger. Max 2MB.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    value={persona.name}
                    onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                    placeholder="Enter display name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (Read-only)</Label>
                  <Input
                    id="slug"
                    value={persona.slug}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona_type">Persona Type</Label>
                <Select
                  value={persona.persona_type}
                  onValueChange={(value: 'real_person' | 'fictional_character') =>
                    setPersona({ ...persona, persona_type: value })
                  }
                >
                  <SelectTrigger id="persona_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="real_person">Real Person</SelectItem>
                    <SelectItem value="fictional_character">Fictional Character</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {persona.persona_type === 'real_person'
                    ? 'Uses first-person perspective, references actual work'
                    : 'Role-playing AI assistant, transparent about being AI'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expertise">Expertise Summary</Label>
                <Textarea
                  id="expertise"
                  value={persona.expertise}
                  onChange={(e) => setPersona({ ...persona, expertise: e.target.value })}
                  placeholder="Short description for UI display"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt Tab */}
        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>LLM System Prompt</CardTitle>
              <CardDescription>
                Instructions that control how the LLM behaves as this persona
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={persona.content}
                onChange={(e) => setPersona({ ...persona, content: e.target.value })}
                placeholder="Enter system prompt instructions..."
                rows={20}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground mt-2">
                This is the base system prompt sent to the LLM. Be specific about tone, expertise, and citation behavior.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Config Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vector Search Threshold</CardTitle>
              <CardDescription>
                Minimum similarity score (0-1) for vector search results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { value: 0.50, label: 'Very Strict', description: 'Only nearly-exact semantic matches' },
                  { value: 0.40, label: 'Strict', description: 'High relevance required' },
                  { value: 0.35, label: 'Balanced', description: 'Good mix of precision and recall (recommended)', recommended: true },
                  { value: 0.25, label: 'Broad', description: 'Include tangentially related content' },
                  { value: 0.15, label: 'Very Broad', description: 'Cast a wide net, may include false positives' },
                ].map((preset) => {
                  const isSelected = Math.abs(persona.search.vector_threshold - preset.value) < 0.01;

                  return (
                    <label
                      key={preset.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="threshold"
                        checked={isSelected}
                        onChange={() =>
                          setPersona({
                            ...persona,
                            search: { ...persona.search, vector_threshold: preset.value },
                          })
                        }
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{preset.label}</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            ({preset.value.toFixed(2)})
                          </span>
                          {preset.recommended && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {preset.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topics & Aliases</CardTitle>
              <CardDescription>
                Topic definitions for tag-based boosting (7.5% boost by default)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new topic */}
              <div className="flex gap-2">
                <Input
                  value={newTopicId}
                  onChange={(e) => setNewTopicId(e.target.value)}
                  placeholder="New topic ID (e.g., 'machine-learning')"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTopic();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddTopic} variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* List topics */}
              {persona.topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">No topics defined yet</p>
              ) : (
                <div className="space-y-3">
                  {persona.topics.map((topic) => (
                    <div key={topic.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono">{topic.id}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTopic(topic.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Aliases */}
                      <div className="space-y-2">
                        <Label className="text-xs">Aliases:</Label>
                        <div className="flex gap-2 flex-wrap">
                          {topic.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="px-2 py-1 bg-primary/10 text-primary text-sm rounded flex items-center gap-1"
                            >
                              {alias}
                              <button
                                onClick={() => handleRemoveAlias(topic.id, alias)}
                                className="hover:text-primary/70"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add alias */}
                        <div className="flex gap-2">
                          <Input
                            value={newTopicAlias}
                            onChange={(e) => setNewTopicAlias(e.target.value)}
                            placeholder="Add alias..."
                            size={1}
                            className="h-8 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddAlias(topic.id);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            onClick={() => handleAddAlias(topic.id)}
                            variant="outline"
                            size="sm"
                            className="h-8"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata" className="space-y-4">
          {/* Frontmatter Metadata (Read-only) */}
          {persona.frontmatter && (
            <Card>
              <CardHeader>
                <CardTitle>Persona Metadata</CardTitle>
                <CardDescription>
                  Informational metadata from persona configuration (read-only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <p className="text-sm font-mono">{persona.frontmatter.title}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Version</Label>
                    <p className="text-sm font-mono">{persona.frontmatter.version}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Last Updated</Label>
                    <p className="text-sm font-mono">{persona.frontmatter.last_updated}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Persona ID</Label>
                    <p className="text-sm font-mono">{persona.frontmatter.persona_id}</p>
                  </div>
                  {persona.frontmatter.author && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Author</Label>
                      <p className="text-sm font-mono">{persona.frontmatter.author}</p>
                    </div>
                  )}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <p className="text-sm">{persona.frontmatter.description}</p>
                  </div>
                  {persona.frontmatter.tags.length > 0 && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Tags</Label>
                      <div className="flex flex-wrap gap-1">
                        {persona.frontmatter.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Example Questions</CardTitle>
              <CardDescription>
                Sample questions shown in the chat interface
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new question */}
              <div className="flex gap-2">
                <Input
                  value={newExampleQuestion}
                  onChange={(e) => setNewExampleQuestion(e.target.value)}
                  placeholder="Add example question..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExampleQuestion();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddExampleQuestion} variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* List questions */}
              <div className="space-y-2">
                {persona.example_questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No example questions yet</p>
                ) : (
                  persona.example_questions.map((question, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border rounded-lg"
                    >
                      <span className="text-sm">{question}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveExampleQuestion(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
