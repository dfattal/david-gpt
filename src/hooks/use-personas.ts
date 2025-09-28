'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonaOption } from '@/components/chat/persona-selector';

// Query keys
export const personaKeys = {
  all: ['personas'] as const,
  active: () => [...personaKeys.all, 'active'] as const,
  analytics: () => [...personaKeys.all, 'analytics'] as const,
  detail: (id: string) => [...personaKeys.all, 'detail', id] as const,
} as const;

// API functions
async function fetchActivePersonas(): Promise<PersonaOption[]> {
  const response = await fetch('/api/personas/active');
  if (!response.ok) {
    throw new Error(`Failed to fetch personas: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch personas');
  }
  return data.personas;
}

interface PersonaAnalytics {
  persona_id: string;
  conversations: number;
  total_messages: number;
  documents: number;
  kg_entities: number;
  kg_relationships: number;
  avg_rating: number;
  last_active: string | null;
  weekly_conversations: number;
  monthly_conversations: number;
}

async function fetchPersonaAnalytics(): Promise<PersonaAnalytics[]> {
  const response = await fetch('/api/admin/persona-analytics');
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch analytics');
  }
  return data.analytics;
}

// Custom hooks
export function useActivePersonas() {
  return useQuery({
    queryKey: personaKeys.active(),
    queryFn: fetchActivePersonas,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function usePersonaAnalytics() {
  return useQuery({
    queryKey: personaKeys.analytics(),
    queryFn: fetchPersonaAnalytics,
    staleTime: 2 * 60 * 1000, // 2 minutes for analytics
  });
}

// Persona mutations (for admin operations)
export function useCreatePersona() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { personaId: string; content: string }) => {
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create persona');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch personas
      queryClient.invalidateQueries({ queryKey: personaKeys.all });
    },
  });
}

export function useUpdatePersona() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; content: string }) => {
      const response = await fetch(`/api/personas/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: data.content }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update persona');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate affected queries
      queryClient.invalidateQueries({ queryKey: personaKeys.all });
      queryClient.invalidateQueries({
        queryKey: personaKeys.detail(variables.id),
      });
    },
  });
}

export function useDeletePersona() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/personas/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete persona');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all persona queries
      queryClient.invalidateQueries({ queryKey: personaKeys.all });
    },
  });
}
