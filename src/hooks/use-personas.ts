import { useQuery } from '@tanstack/react-query';

export interface PersonaData {
  id: string;
  slug: string;
  name: string;
  description: string;
  expertise_domains: string[];
  expertise?: string;
  example_questions?: string[];
  avatar_url?: string;
  is_active: boolean;
  metadata?: {
    title?: string;
    description?: string;
  };
  stats?: {
    conversations: number;
    documents: number;
    last_active?: string;
  };
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