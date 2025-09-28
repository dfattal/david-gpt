'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertCircle,
  CheckCircle2,
  Search,
  ArrowRight,
  Plus,
  Edit,
} from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  kind: string;
  description?: string;
}

interface Relationship {
  id: string;
  src_id: string;
  src_type: string;
  rel: string;
  dst_id: string;
  dst_type: string;
  weight: number;
  evidence_text?: string;
  evidence_doc_id?: string;
  src_entity?: Entity;
  dst_entity?: Entity;
}

interface RelationshipEditorDialogProps {
  open: boolean;
  onClose: () => void;
  relationship?: Relationship | null;
  onSave: () => void;
}

const RELATION_TYPES = [
  'author_of',
  'inventor_of',
  'assignee_of',
  'cites',
  'supersedes',
  'implements',
  'used_in',
  'similar_to',
  'enables_3d',
  'uses_component',
  'competing_with',
  'integrates_with',
  'can_use',
  'enhances',
  'evolved_to',
  'alternative_to',
];

const KIND_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-800',
  organization: 'bg-green-100 text-green-800',
  product: 'bg-purple-100 text-purple-800',
  technology: 'bg-orange-100 text-orange-800',
  component: 'bg-red-100 text-red-800',
  document: 'bg-gray-100 text-gray-800',
};

export function RelationshipEditorDialog({
  open,
  onClose,
  relationship,
  onSave,
}: RelationshipEditorDialogProps) {
  const [formData, setFormData] = useState({
    srcId: '',
    srcType: 'entity' as 'entity' | 'document',
    relation: 'similar_to',
    dstId: '',
    dstType: 'entity' as 'entity' | 'document',
    weight: 0.5,
    evidenceText: '',
    evidenceDocId: '',
  });

  const [srcEntity, setSrcEntity] = useState<Entity | null>(null);
  const [dstEntity, setDstEntity] = useState<Entity | null>(null);
  const [srcSearchQuery, setSrcSearchQuery] = useState('');
  const [dstSearchQuery, setDstSearchQuery] = useState('');
  const [srcSearchResults, setSrcSearchResults] = useState<Entity[]>([]);
  const [dstSearchResults, setDstSearchResults] = useState<Entity[]>([]);
  const [searchingEntities, setSearchingEntities] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEditing = !!relationship;

  // Initialize form data when dialog opens
  useEffect(() => {
    if (open) {
      if (relationship) {
        // Editing existing relationship
        setFormData({
          srcId: relationship.src_id,
          srcType: relationship.src_type as 'entity' | 'document',
          relation: relationship.rel,
          dstId: relationship.dst_id,
          dstType: relationship.dst_type as 'entity' | 'document',
          weight: relationship.weight,
          evidenceText: relationship.evidence_text || '',
          evidenceDocId: relationship.evidence_doc_id || '',
        });
        setSrcEntity(relationship.src_entity || null);
        setDstEntity(relationship.dst_entity || null);
      } else {
        // Creating new relationship
        setFormData({
          srcId: '',
          srcType: 'entity',
          relation: 'similar_to',
          dstId: '',
          dstType: 'entity',
          weight: 0.5,
          evidenceText: '',
          evidenceDocId: '',
        });
        setSrcEntity(null);
        setDstEntity(null);
      }
      setError(null);
      setSuccess(false);
      setSrcSearchQuery('');
      setDstSearchQuery('');
      setSrcSearchResults([]);
      setDstSearchResults([]);
    }
  }, [open, relationship]);

  // Search entities
  const searchEntities = async (query: string, target: 'src' | 'dst') => {
    if (!query.trim()) {
      if (target === 'src') setSrcSearchResults([]);
      else setDstSearchResults([]);
      return;
    }

    setSearchingEntities(true);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: '10',
      });

      const response = await fetch(`/api/admin/entities?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to search entities');
      }

      const data = await response.json();

      if (target === 'src') {
        setSrcSearchResults(data.entities || []);
      } else {
        setDstSearchResults(data.entities || []);
      }
    } catch (err) {
      console.error('Error searching entities:', err);
    } finally {
      setSearchingEntities(false);
    }
  };

  // Handle entity selection
  const selectEntity = (entity: Entity, target: 'src' | 'dst') => {
    if (target === 'src') {
      setSrcEntity(entity);
      setFormData(prev => ({ ...prev, srcId: entity.id }));
      setSrcSearchQuery(entity.name);
      setSrcSearchResults([]);
    } else {
      setDstEntity(entity);
      setFormData(prev => ({ ...prev, dstId: entity.id }));
      setDstSearchQuery(entity.name);
      setDstSearchResults([]);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!formData.srcId || !formData.dstId) {
      setError('Please select both source and destination entities');
      return;
    }

    if (formData.srcId === formData.dstId) {
      setError('Source and destination entities must be different');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/admin/relationships/${relationship!.id}`
        : '/api/admin/relationships';

      const method = isEditing ? 'PUT' : 'POST';

      const body = isEditing
        ? {
            relation: formData.relation,
            weight: formData.weight,
            evidenceText: formData.evidenceText || undefined,
            evidenceDocId: formData.evidenceDocId || undefined,
          }
        : {
            srcId: formData.srcId,
            srcType: formData.srcType,
            relation: formData.relation,
            dstId: formData.dstId,
            dstType: formData.dstType,
            weight: formData.weight,
            evidenceText: formData.evidenceText || undefined,
            evidenceDocId: formData.evidenceDocId || undefined,
          };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error ||
            `Failed to ${isEditing ? 'update' : 'create'} relationship`
        );
      }

      setSuccess(true);
      setTimeout(() => {
        onSave();
        onClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${isEditing ? 'update' : 'create'} relationship`
      );
      console.error(
        `Error ${isEditing ? 'updating' : 'creating'} relationship:`,
        err
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center space-y-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                Relationship {isEditing ? 'Updated' : 'Created'} Successfully
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                The relationship has been {isEditing ? 'updated' : 'added'} to
                the knowledge graph
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {isEditing ? (
              <>
                <Edit className="w-5 h-5 mr-2" />
                Edit Relationship
              </>
            ) : (
              <>
                <Plus className="w-5 h-5 mr-2" />
                Create New Relationship
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Source Entity Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Entity
            </label>
            {srcEntity ? (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">
                    {srcEntity.name}
                  </span>
                  <Badge
                    className={
                      KIND_COLORS[srcEntity.kind] || 'bg-gray-100 text-gray-800'
                    }
                  >
                    {srcEntity.kind}
                  </Badge>
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSrcEntity(null);
                      setFormData(prev => ({ ...prev, srcId: '' }));
                      setSrcSearchQuery('');
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search for source entity..."
                    value={srcSearchQuery}
                    onChange={e => {
                      setSrcSearchQuery(e.target.value);
                      searchEntities(e.target.value, 'src');
                    }}
                    className="pl-10"
                    disabled={isEditing}
                  />
                </div>
                {srcSearchResults.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {srcSearchResults.map(entity => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        onClick={() => selectEntity(entity, 'src')}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {entity.name}
                          </span>
                          <Badge
                            className={
                              KIND_COLORS[entity.kind] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {entity.kind}
                          </Badge>
                        </div>
                        {entity.description && (
                          <span className="text-sm text-gray-500 truncate max-w-xs">
                            {entity.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Relationship Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Relationship Type
            </label>
            <select
              value={formData.relation}
              onChange={e =>
                setFormData(prev => ({ ...prev, relation: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RELATION_TYPES.map(type => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Destination Entity Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destination Entity
            </label>
            {dstEntity ? (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">
                    {dstEntity.name}
                  </span>
                  <Badge
                    className={
                      KIND_COLORS[dstEntity.kind] || 'bg-gray-100 text-gray-800'
                    }
                  >
                    {dstEntity.kind}
                  </Badge>
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDstEntity(null);
                      setFormData(prev => ({ ...prev, dstId: '' }));
                      setDstSearchQuery('');
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search for destination entity..."
                    value={dstSearchQuery}
                    onChange={e => {
                      setDstSearchQuery(e.target.value);
                      searchEntities(e.target.value, 'dst');
                    }}
                    className="pl-10"
                    disabled={isEditing}
                  />
                </div>
                {dstSearchResults.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {dstSearchResults.map(entity => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        onClick={() => selectEntity(entity, 'dst')}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {entity.name}
                          </span>
                          <Badge
                            className={
                              KIND_COLORS[entity.kind] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {entity.kind}
                          </Badge>
                        </div>
                        {entity.description && (
                          <span className="text-sm text-gray-500 truncate max-w-xs">
                            {entity.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Relationship Preview */}
          {srcEntity && dstEntity && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">
                Relationship Preview
              </h4>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{srcEntity.name}</span>
                  <Badge className={KIND_COLORS[srcEntity.kind]}>
                    {srcEntity.kind}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="default">
                    {formData.relation.replace('_', ' ')}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{dstEntity.name}</span>
                  <Badge className={KIND_COLORS[dstEntity.kind]}>
                    {dstEntity.kind}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Relationship Weight ({Math.round(formData.weight * 100)}%)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.weight}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  weight: parseFloat(e.target.value),
                }))
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Weak (0%)</span>
              <span>Strong (100%)</span>
            </div>
          </div>

          {/* Evidence Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Evidence Text (optional)
            </label>
            <Textarea
              value={formData.evidenceText}
              onChange={e =>
                setFormData(prev => ({ ...prev, evidenceText: e.target.value }))
              }
              placeholder="Provide evidence or context for this relationship..."
              rows={3}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !formData.srcId || !formData.dstId}
          >
            {loading ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {isEditing ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Update Relationship
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Relationship
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
