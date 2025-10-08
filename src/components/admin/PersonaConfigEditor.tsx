/**
 * Persona Configuration Editor Component
 * Allows editing of persona metadata that influences RAG retrieval
 */

'use client';

import { useState, useEffect } from 'react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { X, Plus, Save, AlertCircle } from 'lucide-react';

interface Topic {
  id: string;
  aliases: string[];
}

interface RouterConfig {
  vector_threshold: number;
  bm25_keywords: string[];
  bm25_keywords_min_hits: number;
  min_supporting_docs: number;
  fallback: string;
}

interface PersonaConfig {
  slug: string;
  display_name: string;
  expertise: string;
  version: string;
  last_updated: string;
  topics: Topic[];
  router: RouterConfig;
}

interface PersonaConfigEditorProps {
  personaSlug?: string;
  onSuccess?: () => void;
}

export function PersonaConfigEditor({
  personaSlug: initialPersonaSlug,
  onSuccess,
}: PersonaConfigEditorProps) {
  const [personas, setPersonas] = useState<Array<{ slug: string; name: string }>>([]);
  const [selectedPersonaSlug, setSelectedPersonaSlug] = useState<string | null>(
    initialPersonaSlug || null
  );
  const [config, setConfig] = useState<PersonaConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Topic editing state
  const [newTopicId, setNewTopicId] = useState('');
  const [newTopicAlias, setNewTopicAlias] = useState('');
  const [editingTopicIndex, setEditingTopicIndex] = useState<number | null>(null);

  // BM25 keyword editing state
  const [newBm25Keyword, setNewBm25Keyword] = useState('');

  // Load personas list on mount
  useEffect(() => {
    loadPersonas();
  }, []);

  // Load config when persona selected
  useEffect(() => {
    if (selectedPersonaSlug) {
      loadPersonaConfig(selectedPersonaSlug);
    }
  }, [selectedPersonaSlug]);

  const loadPersonas = async () => {
    try {
      const response = await fetch('/api/admin/personas');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load personas');
      }

      setPersonas(data.personas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personas');
    }
  };

  const loadPersonaConfig = async (slug: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/personas/${slug}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load persona config');
      }

      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPersonaSlug || !config) return;

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/admin/personas/${selectedPersonaSlug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save config');
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Topic management
  const handleAddTopic = () => {
    if (!newTopicId.trim() || !config) return;

    const newTopic: Topic = {
      id: newTopicId.trim(),
      aliases: [],
    };

    setConfig({
      ...config,
      topics: [...config.topics, newTopic],
    });

    setNewTopicId('');
  };

  const handleRemoveTopic = (index: number) => {
    if (!config) return;

    setConfig({
      ...config,
      topics: config.topics.filter((_, i) => i !== index),
    });
  };

  const handleAddAlias = (topicIndex: number) => {
    if (!newTopicAlias.trim() || !config) return;

    const updatedTopics = [...config.topics];
    const topic = updatedTopics[topicIndex];

    if (!topic.aliases.includes(newTopicAlias.trim())) {
      topic.aliases.push(newTopicAlias.trim());
      setConfig({ ...config, topics: updatedTopics });
      setNewTopicAlias('');
    }
  };

  const handleRemoveAlias = (topicIndex: number, alias: string) => {
    if (!config) return;

    const updatedTopics = [...config.topics];
    updatedTopics[topicIndex].aliases = updatedTopics[topicIndex].aliases.filter(
      (a) => a !== alias
    );

    setConfig({ ...config, topics: updatedTopics });
  };

  // BM25 keyword management
  const handleAddBm25Keyword = () => {
    if (!newBm25Keyword.trim() || !config) return;

    const currentKeywords = config.router?.bm25_keywords ?? [];
    if (!currentKeywords.includes(newBm25Keyword.trim())) {
      setConfig({
        ...config,
        router: {
          ...config.router,
          bm25_keywords: [...currentKeywords, newBm25Keyword.trim()],
        },
      });
      setNewBm25Keyword('');
    }
  };

  const handleRemoveBm25Keyword = (keyword: string) => {
    if (!config) return;

    setConfig({
      ...config,
      router: {
        ...config.router,
        bm25_keywords: (config.router?.bm25_keywords ?? []).filter((k) => k !== keyword),
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Loading persona config...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Persona Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Persona</CardTitle>
          <CardDescription>
            Choose a persona to view and edit its configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedPersonaSlug || ''}
            onValueChange={setSelectedPersonaSlug}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a persona..." />
            </SelectTrigger>
            <SelectContent>
              {personas.map((persona) => (
                <SelectItem key={persona.slug} value={persona.slug}>
                  {persona.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1 text-sm text-red-600">{error}</div>
        </div>
      )}

      {config && (
        <>
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Core persona metadata
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Slug</Label>
                  <Input value={config.slug} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input
                    value={config.display_name}
                    onChange={(e) =>
                      setConfig({ ...config, display_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Expertise</Label>
                <Textarea
                  value={config.expertise}
                  onChange={(e) =>
                    setConfig({ ...config, expertise: e.target.value })
                  }
                  placeholder="Short description of persona expertise for welcome screen display"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Version</Label>
                  <Input
                    value={config.version}
                    onChange={(e) =>
                      setConfig({ ...config, version: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Last Updated</Label>
                  <Input
                    type="date"
                    value={config.last_updated}
                    onChange={(e) =>
                      setConfig({ ...config, last_updated: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Retrieval Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Retrieval Configuration</CardTitle>
              <CardDescription>
                Settings that directly affect RAG search performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search Sensitivity */}
              <div>
                <div className="mb-3">
                  <Label className="text-base">Search Sensitivity</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose how strictly to match search results
                  </p>
                </div>
                <div className="space-y-3">
                  {[
                    { value: 0.50, label: 'Very Strict', description: 'Only nearly-exact semantic matches' },
                    { value: 0.40, label: 'Strict', description: 'High relevance required' },
                    { value: 0.35, label: 'Balanced', description: 'Good mix of precision and recall (recommended)', recommended: true },
                    { value: 0.25, label: 'Broad', description: 'Include tangentially related content' },
                    { value: 0.15, label: 'Very Broad', description: 'Cast a wide net, may include false positives' },
                  ].map((preset) => {
                    const currentThreshold = config.router?.vector_threshold ?? 0.35;
                    const isSelected = Math.abs(currentThreshold - preset.value) < 0.01;

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
                          name="sensitivity"
                          checked={isSelected}
                          onChange={() =>
                            setConfig({
                              ...config,
                              router: { ...config.router, vector_threshold: preset.value },
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
              </div>

              {/* BM25 Keywords */}
              <div>
                <Label>BM25 Keywords</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Keywords used for query routing and lexical search
                </p>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newBm25Keyword}
                    onChange={(e) => setNewBm25Keyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBm25Keyword();
                      }
                    }}
                    placeholder="Add keyword..."
                  />
                  <Button
                    type="button"
                    onClick={handleAddBm25Keyword}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(config.router?.bm25_keywords ?? []).map((keyword) => (
                    <span
                      key={keyword}
                      className="px-3 py-1 bg-primary/10 text-primary rounded flex items-center gap-2"
                    >
                      {keyword}
                      <button
                        onClick={() => handleRemoveBm25Keyword(keyword)}
                        className="hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Min Hits and Supporting Docs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>BM25 Minimum Keyword Hits</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.router?.bm25_keywords_min_hits ?? 1}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        router: {
                          ...config.router,
                          bm25_keywords_min_hits: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Minimum Supporting Documents</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.router?.min_supporting_docs ?? 2}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        router: {
                          ...config.router,
                          min_supporting_docs: parseInt(e.target.value) || 2,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Topics & Aliases */}
          <Card>
            <CardHeader>
              <CardTitle>Topics & Aliases</CardTitle>
              <CardDescription>
                Topic definitions used for tag-based boosting (7.5% boost by default)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add New Topic */}
              <div className="flex gap-2">
                <Input
                  value={newTopicId}
                  onChange={(e) => setNewTopicId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTopic();
                    }
                  }}
                  placeholder="New topic ID (e.g., 'glasses-free-3d')..."
                />
                <Button
                  type="button"
                  onClick={handleAddTopic}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Topic
                </Button>
              </div>

              {/* Topic List */}
              <div className="space-y-4">
                {(config.topics ?? []).map((topic, topicIndex) => (
                  <div
                    key={topicIndex}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{topic.id}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTopic(topicIndex)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Aliases */}
                    <div>
                      <Label className="text-xs">Aliases</Label>
                      <div className="flex gap-2 mt-1 mb-2">
                        <Input
                          value={
                            editingTopicIndex === topicIndex
                              ? newTopicAlias
                              : ''
                          }
                          onChange={(e) => setNewTopicAlias(e.target.value)}
                          onFocus={() => setEditingTopicIndex(topicIndex)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAlias(topicIndex);
                            }
                          }}
                          placeholder="Add alias..."
                          className="text-sm"
                        />
                        <Button
                          type="button"
                          onClick={() => handleAddAlias(topicIndex)}
                          variant="outline"
                          size="sm"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {topic.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1"
                          >
                            {alias}
                            <button
                              onClick={() =>
                                handleRemoveAlias(topicIndex, alias)
                              }
                              className="hover:text-blue-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="lg"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
