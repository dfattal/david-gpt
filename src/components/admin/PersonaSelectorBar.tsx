/**
 * PersonaSelectorBar Component
 * Sticky header bar for selecting active persona context in admin RAG page
 */

'use client';

import { usePersonas } from '@/hooks/usePersonas';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Loader2, User } from 'lucide-react';

interface PersonaSelectorBarProps {
  selectedSlug: string | null;
  onChange: (slug: string | null) => void;
}

export function PersonaSelectorBar({ selectedSlug, onChange }: PersonaSelectorBarProps) {
  const { personas, isLoading } = usePersonas();

  const selectedPersona = personas.find(p => p.slug === selectedSlug);

  return (
    <div className="sticky top-0 z-10 bg-background border-b shadow-sm">
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Active Persona:</span>
          </div>

          <div className="flex-1 max-w-xs">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <Select
                value={selectedSlug || 'all'}
                onValueChange={(value) => onChange(value === 'all' ? null : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Personas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Personas</SelectItem>
                  {personas.map((persona) => (
                    <SelectItem key={persona.slug} value={persona.slug}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedSlug && (
            <>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-md border border-primary/20">
                  Filtering by: <strong>{selectedPersona?.name || selectedSlug}</strong>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                className="ml-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filter
              </Button>
            </>
          )}
        </div>

        {selectedSlug && (
          <div className="mt-2 text-xs text-muted-foreground">
            All documents and extractions will be scoped to this persona
          </div>
        )}
      </div>
    </div>
  );
}
