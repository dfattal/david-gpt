"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Search,
  Tag,
  Network,
  Settings,
  Download,
  Upload,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CanonicalEntityDefinition {
  description: string;
  aliases: string[];
  priority: number;
  domain?: string;
}

interface CanonicalRelationshipDefinition {
  from: string;
  relation: string;
  to: string;
  confidence: number;
  context?: string;
}

interface CanonicalEntitiesConfig {
  [entityKind: string]: {
    [canonicalName: string]: CanonicalEntityDefinition;
  };
}

interface PersonaCanonicalData {
  persona_id: string;
  canonical_entities: CanonicalEntitiesConfig;
  canonical_relationships: CanonicalRelationshipDefinition[];
}

export function CanonicalEntityManager() {
  const [selectedPersona, setSelectedPersona] = useState<string>('david');
  const [canonicalData, setCanonicalData] = useState<PersonaCanonicalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntityKind, setSelectedEntityKind] = useState('technology');
  const [editingEntity, setEditingEntity] = useState<{
    kind: string;
    name: string;
    definition: CanonicalEntityDefinition;
  } | null>(null);
  const [editingRelationship, setEditingRelationship] = useState<CanonicalRelationshipDefinition | null>(null);
  const [showEntityDialog, setShowEntityDialog] = useState(false);
  const [showRelationshipDialog, setShowRelationshipDialog] = useState(false);
  const { toast } = useToast();

  const entityKinds = ['technology', 'component', 'person', 'organization', 'product'];
  const relationTypes = ['enables', 'enhances', 'implements', 'uses', 'part_of', 'alternative_to', 'evolved_to'];

  useEffect(() => {
    loadCanonicalData();
  }, [selectedPersona]);

  const loadCanonicalData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/personas/${selectedPersona}/canonical-entities`);
      if (response.ok) {
        const data = await response.json();
        setCanonicalData(data);
      } else {
        // Initialize empty data if none exists
        setCanonicalData({
          persona_id: selectedPersona,
          canonical_entities: {},
          canonical_relationships: []
        });
      }
    } catch (error) {
      console.error('Error loading canonical data:', error);
      toast({
        title: "Error",
        description: "Failed to load canonical entities",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveCanonicalData = async () => {
    if (!canonicalData) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/personas/${selectedPersona}/canonical-entities`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(canonicalData)
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Canonical entities saved successfully"
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving canonical data:', error);
      toast({
        title: "Error",
        description: "Failed to save canonical entities",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddEntity = () => {
    setEditingEntity({
      kind: selectedEntityKind,
      name: '',
      definition: {
        description: '',
        aliases: [],
        priority: 5,
        domain: 'spatial_computing'
      }
    });
    setShowEntityDialog(true);
  };

  const handleEditEntity = (kind: string, name: string) => {
    const definition = canonicalData?.canonical_entities[kind]?.[name];
    if (definition) {
      setEditingEntity({ kind, name, definition });
      setShowEntityDialog(true);
    }
  };

  const handleSaveEntity = () => {
    if (!editingEntity || !canonicalData) return;

    const updatedData = { ...canonicalData };
    if (!updatedData.canonical_entities[editingEntity.kind]) {
      updatedData.canonical_entities[editingEntity.kind] = {};
    }
    updatedData.canonical_entities[editingEntity.kind][editingEntity.name] = editingEntity.definition;

    setCanonicalData(updatedData);
    setShowEntityDialog(false);
    setEditingEntity(null);
  };

  const handleDeleteEntity = (kind: string, name: string) => {
    if (!canonicalData) return;

    const updatedData = { ...canonicalData };
    delete updatedData.canonical_entities[kind][name];

    // Clean up empty categories
    if (Object.keys(updatedData.canonical_entities[kind]).length === 0) {
      delete updatedData.canonical_entities[kind];
    }

    setCanonicalData(updatedData);
  };

  const handleAddRelationship = () => {
    setEditingRelationship({
      from: '',
      relation: 'enables',
      to: '',
      confidence: 0.9,
      context: ''
    });
    setShowRelationshipDialog(true);
  };

  const handleEditRelationship = (index: number) => {
    const relationship = canonicalData?.canonical_relationships[index];
    if (relationship) {
      setEditingRelationship({ ...relationship });
      setShowRelationshipDialog(true);
    }
  };

  const handleSaveRelationship = () => {
    if (!editingRelationship || !canonicalData) return;

    const updatedData = { ...canonicalData };
    const existingIndex = updatedData.canonical_relationships.findIndex(
      rel => rel.from === editingRelationship.from &&
             rel.relation === editingRelationship.relation &&
             rel.to === editingRelationship.to
    );

    if (existingIndex >= 0) {
      updatedData.canonical_relationships[existingIndex] = editingRelationship;
    } else {
      updatedData.canonical_relationships.push(editingRelationship);
    }

    setCanonicalData(updatedData);
    setShowRelationshipDialog(false);
    setEditingRelationship(null);
  };

  const handleDeleteRelationship = (index: number) => {
    if (!canonicalData) return;

    const updatedData = { ...canonicalData };
    updatedData.canonical_relationships.splice(index, 1);
    setCanonicalData(updatedData);
  };

  const getFilteredEntities = () => {
    if (!canonicalData?.canonical_entities[selectedEntityKind]) return [];

    const entities = canonicalData.canonical_entities[selectedEntityKind];
    if (!searchTerm) return Object.entries(entities);

    return Object.entries(entities).filter(([name, definition]) =>
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      definition.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      definition.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  const getAllCanonicalNames = (): string[] => {
    if (!canonicalData?.canonical_entities) return [];

    const names: string[] = [];
    Object.values(canonicalData.canonical_entities).forEach(entities => {
      names.push(...Object.keys(entities));
    });
    return names;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Canonical Entity Management</h1>
          <p className="text-gray-600 mt-2">
            Define canonical entities and their aliases for consistent knowledge representation
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="david">David Persona</option>
            <option value="legal">Legal Persona</option>
          </select>

          <Button onClick={saveCanonicalData} disabled={saving}>
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="entities" className="space-y-6">
        <TabsList>
          <TabsTrigger value="entities" className="flex items-center">
            <Tag className="w-4 h-4 mr-2" />
            Canonical Entities
          </TabsTrigger>
          <TabsTrigger value="relationships" className="flex items-center">
            <Network className="w-4 h-4 mr-2" />
            Relationships
          </TabsTrigger>
          <TabsTrigger value="import-export" className="flex items-center">
            <Settings className="w-4 h-4 mr-2" />
            Import/Export
          </TabsTrigger>
        </TabsList>

        {/* Entities Tab */}
        <TabsContent value="entities" className="space-y-6">
          {/* Entity Kind Selector and Search */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Entity Management</CardTitle>
                <Button onClick={handleAddEntity}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Entity
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 mb-6">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Entity Kind:</label>
                  <select
                    value={selectedEntityKind}
                    onChange={(e) => setSelectedEntityKind(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {entityKinds.map(kind => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search entities, descriptions, or aliases..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {/* Entity List */}
              <div className="space-y-4">
                {getFilteredEntities().map(([name, definition]) => (
                  <Card key={name} className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-gray-900">{name}</h3>
                            <Badge variant="outline">Priority: {definition.priority}</Badge>
                            {definition.domain && (
                              <Badge variant="secondary">{definition.domain}</Badge>
                            )}
                          </div>

                          <p className="text-gray-600 text-sm mb-3">{definition.description}</p>

                          <div className="flex flex-wrap gap-2">
                            {definition.aliases.map((alias, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditEntity(selectedEntityKind, name)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteEntity(selectedEntityKind, name)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {getFilteredEntities().length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No entities found for "{selectedEntityKind}"
                    {searchTerm && ` matching "${searchTerm}"`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Entity Relationships</CardTitle>
                <Button onClick={handleAddRelationship}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Relationship
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {canonicalData?.canonical_relationships.map((relationship, index) => (
                  <Card key={index} className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="font-medium">{relationship.from}</span>
                            <span className="text-gray-400">→</span>
                            <Badge variant="outline">{relationship.relation}</Badge>
                            <span className="text-gray-400">→</span>
                            <span className="font-medium">{relationship.to}</span>
                            <Badge variant="secondary">
                              {Math.round(relationship.confidence * 100)}%
                            </Badge>
                          </div>
                          {relationship.context && (
                            <p className="text-sm text-gray-600">{relationship.context}</p>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRelationship(index)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteRelationship(index)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {(!canonicalData?.canonical_relationships || canonicalData.canonical_relationships.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    No relationships defined
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import/Export Tab */}
        <TabsContent value="import-export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import/Export Canonical Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-4">
                <Button variant="outline">
                  <Upload className="w-4 h-4 mr-2" />
                  Import from JSON
                </Button>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export to JSON
                </Button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                  <div className="text-sm text-yellow-700">
                    <p className="font-medium">Import/Export functionality</p>
                    <p>This feature allows bulk import/export of canonical entities for backup or migration purposes.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Entity Edit Dialog */}
      <Dialog open={showEntityDialog} onOpenChange={setShowEntityDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntity?.name ? 'Edit Entity' : 'Add Entity'}
            </DialogTitle>
          </DialogHeader>

          {editingEntity && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entity Name
                </label>
                <Input
                  value={editingEntity.name}
                  onChange={(e) => setEditingEntity({
                    ...editingEntity,
                    name: e.target.value
                  })}
                  placeholder="Enter canonical entity name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <Textarea
                  value={editingEntity.definition.description}
                  onChange={(e) => setEditingEntity({
                    ...editingEntity,
                    definition: {
                      ...editingEntity.definition,
                      description: e.target.value
                    }
                  })}
                  placeholder="Describe this entity"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aliases (comma-separated)
                </label>
                <Input
                  value={editingEntity.definition.aliases.join(', ')}
                  onChange={(e) => setEditingEntity({
                    ...editingEntity,
                    definition: {
                      ...editingEntity.definition,
                      aliases: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    }
                  })}
                  placeholder="alias1, alias2, alias3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority (1-10)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={editingEntity.definition.priority}
                    onChange={(e) => setEditingEntity({
                      ...editingEntity,
                      definition: {
                        ...editingEntity.definition,
                        priority: parseInt(e.target.value) || 5
                      }
                    })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Domain
                  </label>
                  <Input
                    value={editingEntity.definition.domain || ''}
                    onChange={(e) => setEditingEntity({
                      ...editingEntity,
                      definition: {
                        ...editingEntity.definition,
                        domain: e.target.value
                      }
                    })}
                    placeholder="e.g., spatial_computing"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntityDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEntity}>
              Save Entity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relationship Edit Dialog */}
      <Dialog open={showRelationshipDialog} onOpenChange={setShowRelationshipDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRelationship ? 'Edit Relationship' : 'Add Relationship'}
            </DialogTitle>
          </DialogHeader>

          {editingRelationship && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Entity
                </label>
                <select
                  value={editingRelationship.from}
                  onChange={(e) => setEditingRelationship({
                    ...editingRelationship,
                    from: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select entity...</option>
                  {getAllCanonicalNames().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship Type
                </label>
                <select
                  value={editingRelationship.relation}
                  onChange={(e) => setEditingRelationship({
                    ...editingRelationship,
                    relation: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {relationTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Entity
                </label>
                <select
                  value={editingRelationship.to}
                  onChange={(e) => setEditingRelationship({
                    ...editingRelationship,
                    to: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select entity...</option>
                  {getAllCanonicalNames().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confidence (0-1)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={editingRelationship.confidence}
                  onChange={(e) => setEditingRelationship({
                    ...editingRelationship,
                    confidence: parseFloat(e.target.value) || 0.9
                  })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Context (optional)
                </label>
                <Input
                  value={editingRelationship.context || ''}
                  onChange={(e) => setEditingRelationship({
                    ...editingRelationship,
                    context: e.target.value
                  })}
                  placeholder="Additional context for this relationship"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelationshipDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRelationship}>
              Save Relationship
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}