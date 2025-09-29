import { useQuery } from '@tanstack/react-query';

export interface PersonaData {
  id: string;
  persona_id: string;
  metadata: {
    title: string;
    description: string;
  };
  is_active: boolean;
}

// Simple personas hook that fetches from our API
export function useActivePersonas() {
  return useQuery<PersonaData[]>({
    queryKey: ['personas'],
    queryFn: async () => {
      const response = await fetch('/api/personas');
      if (!response.ok) {
        throw new Error('Failed to fetch personas');
      }
      const data = await response.json();
      return data.personas || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}