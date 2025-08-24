import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Conversation } from '@/lib/supabase'
import { needsTitleGeneration } from '@/lib/title-generation'

const CONVERSATIONS_QUERY_KEY = ['conversations']

async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

export function useConversations() {
  const queryClient = useQueryClient()
  
  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
  })

  const createMutation = useMutation({
    mutationFn: async (): Promise<Conversation> => {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          title: 'New chat',
          title_status: 'pending'
        })
        .select()
        .single()
      
      if (error) throw error
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
      const { data, error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data as Conversation
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
      const { error } = await supabase
        .from('conversations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      
      if (error) throw error
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
    } catch {
      // Error handled by React Query
    }
  }, [deleteMutation])

  const renameConversation = React.useCallback(async (id: string, title: string) => {
    return updateConversation(id, { title })
  }, [updateConversation])

  // Auto-refresh conversations when title generation might be in progress
  React.useEffect(() => {
    const hasPendingTitles = conversations.some(conv => needsTitleGeneration(conv.title_status))
    
    if (hasPendingTitles) {
      // Poll for title updates every 5 seconds when there are pending titles
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
      }, 5000)
      
      return () => clearInterval(interval)
    }
  }, [conversations, queryClient])

  // Check if any conversations have pending title generation
  const pendingTitleCount = conversations.filter(conv => needsTitleGeneration(conv.title_status)).length

  return {
    conversations,
    isLoading,
    error: error?.message || null,
    createConversation,
    updateConversation,
    deleteConversation,
    renameConversation,
    pendingTitleCount, // Expose count of conversations awaiting title generation
    refetch: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
  }
}