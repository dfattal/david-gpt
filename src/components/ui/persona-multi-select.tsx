/**
 * PersonaMultiSelect Component
 * Multi-select checkbox list for assigning documents to multiple personas
 */

'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { usePersonas } from '@/hooks/usePersonas';
import { Loader2 } from 'lucide-react';

interface PersonaMultiSelectProps {
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
  disabled?: boolean;
  label?: string;
  showError?: boolean;
}

export function PersonaMultiSelect({
  selectedSlugs,
  onChange,
  disabled = false,
  label = 'Assigned Personas',
  showError = true,
}: PersonaMultiSelectProps) {
  const { personas, isLoading } = usePersonas();

  const handleToggle = (slug: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedSlugs, slug]);
    } else {
      onChange(selectedSlugs.filter((s) => s !== slug));
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">
        {label}
        {showError && selectedSlugs.length === 0 && (
          <span className="text-red-500 ml-1">*</span>
        )}
      </label>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading personas...
        </div>
      ) : personas.length === 0 ? (
        <div className="text-sm text-muted-foreground p-3 border rounded">
          No personas available
        </div>
      ) : (
        <div className="space-y-2 border rounded p-3 bg-card">
          {personas.map((persona) => (
            <div key={persona.slug} className="flex items-center gap-2">
              <Checkbox
                id={`persona-${persona.slug}`}
                checked={selectedSlugs.includes(persona.slug)}
                onCheckedChange={(checked) =>
                  handleToggle(persona.slug, checked as boolean)
                }
                disabled={disabled}
              />
              <label
                htmlFor={`persona-${persona.slug}`}
                className="text-sm cursor-pointer flex-1 select-none"
              >
                {persona.name}
              </label>
            </div>
          ))}
        </div>
      )}

      {showError && selectedSlugs.length === 0 && !isLoading && (
        <p className="text-xs text-red-600">
          At least one persona must be selected
        </p>
      )}

      {selectedSlugs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedSlugs.length} persona{selectedSlugs.length !== 1 ? 's' : ''}{' '}
          selected
        </p>
      )}
    </div>
  );
}
