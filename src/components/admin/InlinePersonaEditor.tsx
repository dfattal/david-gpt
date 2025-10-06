/**
 * Inline Persona Editor Component
 * Click on persona badges to open a popover and reassign document personas
 */

'use client';

import { useState } from 'react';
import { Check, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePersonas } from '@/hooks/usePersonas';
import { useToast } from '@/hooks/use-toast';

interface InlinePersonaEditorProps {
  docId: string;
  currentPersonas: string[];
  onUpdate?: () => void;
}

export function InlinePersonaEditor({
  docId,
  currentPersonas,
  onUpdate,
}: InlinePersonaEditorProps) {
  const [open, setOpen] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(currentPersonas);
  const [isSaving, setIsSaving] = useState(false);
  const { personas, isLoading } = usePersonas();
  const { toast } = useToast();

  const handleTogglePersona = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  };

  const handleSave = async () => {
    if (selectedSlugs.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one persona must be selected',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/documents/${docId}/personas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaSlugs: selectedSlugs }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update personas');
      }

      toast({
        title: 'Success',
        description: `Persona assignments updated: ${selectedSlugs.join(', ')}`,
      });

      setOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update personas:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update personas',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedSlugs(currentPersonas);
    setOpen(false);
  };

  const hasChanges =
    selectedSlugs.length !== currentPersonas.length ||
    !selectedSlugs.every((slug) => currentPersonas.includes(slug));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="group flex items-center gap-1 hover:opacity-80 transition-opacity">
          <span className="text-sm">{currentPersonas.join(', ')}</span>
          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Assign to Personas</h4>
            <p className="text-xs text-muted-foreground">
              Select which personas can access this document
            </p>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading personas...</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {personas.map((persona) => (
                <label
                  key={persona.slug}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedSlugs.includes(persona.slug)}
                      onChange={() => handleTogglePersona(persona.slug)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${
                        selectedSlugs.includes(persona.slug)
                          ? 'bg-primary border-primary'
                          : 'border-input'
                      }`}
                    >
                      {selectedSlugs.includes(persona.slug) && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm">{persona.name}</span>
                </label>
              ))}
            </div>
          )}

          {selectedSlugs.length === 0 && (
            <p className="text-xs text-red-600">
              At least one persona must be selected
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || selectedSlugs.length === 0 || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
