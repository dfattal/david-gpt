import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type Conversation } from '@/lib/supabase'
import { needsTitleGeneration } from '@/lib/title-generation'

const CONVERSATIONS_QUERY_KEY = ['conversations']

async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`)
  }
  
  const data = await response.json()
  return data.conversations || []
}

// Global function to refresh conversations from anywhere
let globalRefreshConversations: (() => void) | null = null

export function refreshConversationsFromOutside() {
  if (globalRefreshConversations) {
    console.log('[use-conversations] External refresh triggered')
    globalRefreshConversations()
  }
}

export function useConversations() {
  const queryClient = useQueryClient()
  
  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false, // Disable automatic refetching - we control it manually
  })

  const createMutation = useMutation({
    mutationFn: async (): Promise<Conversation> => {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error(`Failed to create conversation: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data as Conversation
    },
    onSuccess: (newConversation) => {
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_QUERY_KEY, (old) => 
        [newConversation, ...(old || [])]
      )
    },
  })
  
  const createConversation = React.useCallback(async (): Promise<Conversation | null> => {
    try {
      return await createMutation.mutateAsync()
    } catch {
      return null
    }
  }, [createMutation])

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: Partial<Conversation> }) => {
      // For now, only support title updates (rename functionality)
      if ('title' in updates && updates.title) {
        const response = await fetch(`/api/conversations/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: updates.title }),
        })
        
        if (!response.ok) {
          throw new Error(`Failed to update conversation: ${response.statusText}`)
        }
        
        const data = await response.json()
        return data as Conversation
      }
      
      throw new Error('Unsupported update operation')
    },
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_QUERY_KEY, (old) =>
        old?.map(conv => conv.id === updatedConversation.id ? updatedConversation : conv) || []
      )
    },
  })
  
  const updateConversation = React.useCallback(async (id: string, updates: Partial<Conversation>) => {
    try {
      return await updateMutation.mutateAsync({ id, updates })
    } catch {
      return null
    }
  }, [updateMutation])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.statusText}`)
      }
      
      return id
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_QUERY_KEY, (old) =>
        old?.filter(conv => conv.id !== deletedId) || []
      )
    },
  })
  
  const deleteConversation = React.useCallback(async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      return true
    } catch (error) {
      console.error('Delete conversation failed:', error)
      return false
    }
  }, [deleteMutation])

  const renameConversation = React.useCallback(async (id: string, title: string) => {
    return updateConversation(id, { title })
  }, [updateConversation])

  // No polling needed - title generation triggers UI updates via mutations

  // Check if any conversations have pending title generation
  const pendingTitleCount = conversations.filter(conv => needsTitleGeneration(conv.title_status)).length

  // Set up global refresh function
  const refetch = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
  }, [queryClient])

  React.useEffect(() => {
    globalRefreshConversations = refetch
    return () => {
      globalRefreshConversations = null
    }
  }, [refetch])

  return {
    conversations,
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error: error?.message || null,
    createConversation,
    updateConversation,
    deleteConversation,
    renameConversation,
    pendingTitleCount, // Expose count of conversations awaiting title generation
    refetch
  }
}