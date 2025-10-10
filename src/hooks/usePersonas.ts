/**
 * Hook for fetching personas from API
 */

import { useState, useEffect } from 'react';

export interface Persona {
  slug: string;
  name: string;
  persona_type?: string;
  expertise?: string;
  is_active?: boolean;
}

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        // Use admin endpoint to fetch ALL personas (including inactive ones)
        const response = await fetch('/api/admin/personas');
        if (!response.ok) {
          throw new Error('Failed to fetch personas');
        }
        const data = await response.json();
        // Admin API returns { success: true, personas: [...] }
        if (data.personas) {
          setPersonas(data.personas.map((p: any) => ({
            slug: p.slug,
            name: p.name,
            persona_type: p.persona_type,
            expertise: p.expertise,
            is_active: p.is_active,
          })));
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

  const mutate = async () => {
    setIsLoading(true);
    try {
      // Use admin endpoint to fetch ALL personas (including inactive ones)
      const response = await fetch('/api/admin/personas');
      if (!response.ok) {
        throw new Error('Failed to fetch personas');
      }
      const data = await response.json();
      if (data.personas) {
        setPersonas(data.personas.map((p: any) => ({
          slug: p.slug,
          name: p.name,
          persona_type: p.persona_type,
          expertise: p.expertise,
          is_active: p.is_active,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch personas');
    } finally {
      setIsLoading(false);
    }
  };

  return { personas, isLoading, error, mutate };
}
