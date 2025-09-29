"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  AlertTriangle, 
  Merge, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  kind: string;
  description?: string;
  authority_score: number;
  mention_count: number;
  created_at: string;
  updated_at: string;
}

interface DuplicateGroup {
  entities: Entity[];
  similarity: number;
}

interface EntityMergeDialogProps {
  open: boolean;
  onClose: () => void;
  selectedEntities: Entity[];
  onMergeComplete: () => void;
}

const KIND_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-800',
  organization: 'bg-green-100 text-green-800',
  product: 'bg-purple-100 text-purple-800',
  technology: 'bg-orange-100 text-orange-800',
  component: 'bg-red-100 text-red-800',
  document: 'bg-gray-100 text-gray-800',
};

export function EntityMergeDialog({ 
  open, 
  onClose, 
  selectedEntities, 
  onMergeComplete 
}: EntityMergeDialogProps) {
  const [targetEntityId, setTargetEntityId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [createAliases, setCreateAliases] = useState<boolean>(true);
  const [promoteToCanonical, setPromoteToCanonical] = useState<boolean>(false);
  const [canonicalDomain, setCanonicalDomain] = useState<string>('spatial_computing');
  const [canonicalPriority, setCanonicalPriority] = useState<number>(5);
  const [canonicalDescription, setCanonicalDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [availableCanonicals, setAvailableCanonicals] = useState<string[]>([]);
  const [loadingCanonicals, setLoadingCanonicals] = useState(false);

  // Calculate string similarity using Levenshtein distance
  const calculateSimilarity = (str1: string, str2: string): number => {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2;
    if (len2 === 0) return len1;
    
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return (maxLen - distance) / maxLen;
  };

  // Find potential duplicates in selected entities
  const findDuplicates = () => {
    if (selectedEntities.length < 2) return;

    setLoadingDuplicates(true);
    const duplicateGroups: DuplicateGroup[] = [];

    // Group entities by kind for more accurate comparison
    const entitiesByKind = selectedEntities.reduce((acc: any, entity) => {
      if (!acc[entity.kind]) acc[entity.kind] = [];
      acc[entity.kind].push(entity);
      return acc;
    }, {});

    // Find potential duplicates within each kind
    Object.values(entitiesByKind).forEach((entities: any) => {
      for (let i = 0; i < entities.length - 1; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const similarity = calculateSimilarity(
            entities[i].name.toLowerCase(),
            entities[j].name.toLowerCase()
          );

          if (similarity > 0.6) { // 60% similarity threshold
            duplicateGroups.push({
              entities: [entities[i], entities[j]],
              similarity: Math.round(similarity * 100) / 100
            });
          }
        }
      }
    });

    // Sort by similarity (highest first)
    duplicateGroups.sort((a, b) => b.similarity - a.similarity);
    setDuplicates(duplicateGroups);
    setLoadingDuplicates(false);
  };

  useEffect(() => {
    if (open && selectedEntities.length > 0) {
      // Reset form
      setTargetEntityId('');
      setNewName('');
      setNewDescription('');
      setCreateAliases(true);
      setError(null);
      setSuccess(false);
      setDuplicates([]);

      // Auto-select the entity with highest authority score as target
      const bestEntity = selectedEntities.reduce((best, current) => 
        current.authority_score > best.authority_score ? current : best
      );
      setTargetEntityId(bestEntity.id);
      setNewName(bestEntity.name);
      setNewDescription(bestEntity.description || '');

      // Find duplicates
      findDuplicates();
    }
  }, [open, selectedEntities]);

  // Load available canonical entities for suggestion
  const loadCanonicalEntities = async () => {
    if (selectedEntities.length === 0) return;

    setLoadingCanonicals(true);
    try {
      const entityKind = selectedEntities[0].kind;
      const response = await fetch(`/api/admin/personas/david/canonical-entities`);

      if (response.ok) {
        const data = await response.json();
        const canonicalsForKind = data.canonical_entities?.[entityKind] || {};
        setAvailableCanonicals(Object.keys(canonicalsForKind));
      }
    } catch (error) {
      console.error('Error loading canonical entities:', error);
    } finally {
      setLoadingCanonicals(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadCanonicalEntities();
    }
  }, [open, selectedEntities]);

  const handleMerge = async () => {
    if (!targetEntityId || selectedEntities.length < 2) {
      setError('Please select a target entity and at least one source entity');
      return;
    }

    const sourceEntityIds = selectedEntities
      .filter(e => e.id !== targetEntityId)
      .map(e => e.id);

    if (sourceEntityIds.length === 0) {
      setError('Need at least one source entity to merge');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/entities/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`
        },
        body: JSON.stringify({
          targetEntityId,
          sourceEntityIds,
          newName: newName.trim() || undefined,
          newDescription: newDescription.trim() || undefined,
          createAliases,
          promoteToCanonical,
          canonicalOptions: promoteToCanonical ? {
            domain: canonicalDomain,
            priority: canonicalPriority,
            description: canonicalDescription.trim()
          } : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to merge entities');
      }

      const result = await response.json();
      console.log('Merge successful:', result);
      
      setSuccess(true);
      setTimeout(() => {
        onMergeComplete();
        onClose();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge entities');
      console.error('Error merging entities:', err);
    } finally {
      setLoading(false);
    }
  };

  const cannotMerge = selectedEntities.length < 2 || 
    new Set(selectedEntities.map(e => e.kind)).size > 1;

  const sourceEntities = selectedEntities.filter(e => e.id !== targetEntityId);

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center space-y-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                Entities Merged Successfully
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {sourceEntities.length} entities have been merged into the target entity
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Merge className="w-5 h-5 mr-2" />
            Merge Entities
          </DialogTitle>
        </DialogHeader>

        {cannotMerge ? (
          <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Cannot merge selected entities
              </p>
              <p className="text-sm text-yellow-700">
                {selectedEntities.length < 2 
                  ? 'Select at least 2 entities to merge'
                  : 'Selected entities must be of the same kind (person, organization, etc.)'
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Duplicate Detection Results */}
            {loadingDuplicates ? (
              <div className="flex items-center justify-center p-4">
                <Spinner className="w-6 h-6 mr-2" />
                <span className="text-sm text-gray-600">Analyzing for duplicates...</span>
              </div>
            ) : duplicates.length > 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">
                  Potential Duplicates Detected
                </h4>
                <div className="space-y-2">
                  {duplicates.map((group, index) => (
                    <div key={index} className="flex items-center text-sm">
                      <span className="font-medium text-blue-800">
                        {Math.round(group.similarity * 100)}%
                      </span>
                      <span className="mx-2 text-blue-700">similarity:</span>
                      <span className="text-blue-900">
                        &quot;{group.entities[0].name}&quot; ↔ &quot;{group.entities[1].name}&quot;
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Target Entity Selection */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Select Target Entity</h4>
              <p className="text-sm text-gray-600 mb-4">
                Choose which entity will be kept. All other entities will be merged into this one.
              </p>
              <div className="grid gap-3">
                {selectedEntities.map((entity) => (
                  <div
                    key={entity.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      targetEntityId === entity.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setTargetEntityId(entity.id);
                      setNewName(entity.name);
                      setNewDescription(entity.description || '');
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        targetEntityId === entity.id 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-300'
                      }`}>
                        {targetEntityId === entity.id && (
                          <div className="w-full h-full rounded-full bg-white scale-50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{entity.name}</span>
                          <Badge className={KIND_COLORS[entity.kind] || 'bg-gray-100 text-gray-800'}>
                            {entity.kind}
                          </Badge>
                        </div>
                        {entity.description && (
                          <p className="text-sm text-gray-600 mt-1">{entity.description}</p>
                        )}
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>Authority: {Math.round(entity.authority_score * 100)}%</span>
                          <span>Mentions: {entity.mention_count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Entities Preview */}
            {sourceEntities.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-3">
                  Entities to be Merged ({sourceEntities.length})
                </h4>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {sourceEntities.map((entity) => (
                      <div key={entity.id} className="flex items-center space-x-2 bg-white px-3 py-1 rounded-md border">
                        <span className="text-sm text-gray-900">{entity.name}</span>
                        <Badge className={KIND_COLORS[entity.kind] || 'bg-gray-100 text-gray-800'}>
                          {entity.kind}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center mt-3 text-sm text-gray-600">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    These entities will be deleted and their relationships transferred to the target entity
                  </div>
                </div>
              </div>
            )}

            {/* Merge Options */}
            <div className="space-y-4">
              <div>
                <label htmlFor="newName" className="block text-sm font-medium text-gray-700 mb-1">
                  Entity Name (optional - leave blank to keep target entity name)
                </label>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter new name for merged entity"
                />
              </div>

              <div>
                <label htmlFor="newDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <Textarea
                  id="newDescription"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Enter description for merged entity"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="createAliases"
                  checked={createAliases}
                  onCheckedChange={setCreateAliases}
                />
                <label htmlFor="createAliases" className="text-sm font-medium text-gray-700">
                  Create aliases from source entity names
                </label>
              </div>

              {/* Canonicalization Options */}
              <div className="border-t pt-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox
                    id="promoteToCanonical"
                    checked={promoteToCanonical}
                    onCheckedChange={setPromoteToCanonical}
                  />
                  <label htmlFor="promoteToCanonical" className="text-sm font-medium text-gray-700">
                    Promote to canonical entity
                  </label>
                </div>

                {promoteToCanonical && (
                  <div className="ml-6 space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700 mb-3">
                      This will create a canonical entity definition that can be used for future entity consolidation.
                    </p>

                    {/* Show existing canonical entities */}
                    {availableCanonicals.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-blue-800 mb-2">
                          Existing canonical entities for {selectedEntities[0]?.kind}:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {availableCanonicals.map((canonical) => (
                            <Badge key={canonical} variant="outline" className="text-xs">
                              {canonical}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="canonicalDescription" className="block text-sm font-medium text-blue-700 mb-1">
                        Canonical Description
                      </label>
                      <Textarea
                        id="canonicalDescription"
                        value={canonicalDescription}
                        onChange={(e) => setCanonicalDescription(e.target.value)}
                        placeholder="Describe this canonical entity for future reference"
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="canonicalPriority" className="block text-sm font-medium text-blue-700 mb-1">
                          Priority (1-10)
                        </label>
                        <Input
                          id="canonicalPriority"
                          type="number"
                          min={1}
                          max={10}
                          value={canonicalPriority}
                          onChange={(e) => setCanonicalPriority(parseInt(e.target.value) || 5)}
                        />
                      </div>

                      <div>
                        <label htmlFor="canonicalDomain" className="block text-sm font-medium text-blue-700 mb-1">
                          Domain
                        </label>
                        <Input
                          id="canonicalDomain"
                          value={canonicalDomain}
                          onChange={(e) => setCanonicalDomain(e.target.value)}
                          placeholder="e.g., spatial_computing"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleMerge} 
            disabled={cannotMerge || loading}
          >
            {loading ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Merging...
              </>
            ) : (
              <>
                <Merge className="w-4 h-4 mr-2" />
                Merge {sourceEntities.length} Entities
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}