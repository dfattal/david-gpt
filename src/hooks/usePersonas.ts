/**
 * Hook for fetching personas from API
 */

import { useState, useEffect } from 'react';

export interface Persona {
  slug: string;
  name: string;
}

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const response = await fetch('/api/personas');
        if (!response.ok) {
          throw new Error('Failed to fetch personas');
        }
        const data = await response.json();
        // Public API returns { personas: [...] } directly
        if (data.personas) {
          setPersonas(data.personas.map((p: any) => ({ slug: p.slug, name: p.name })));
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch personas');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  return { personas, isLoading, error };
}
