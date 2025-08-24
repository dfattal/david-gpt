import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type StoredMessage, type UIMessage } from '@/lib/supabase'

function getMessagesQueryKey(conversationId?: string) {
  return ['messages', conversationId]
}

async function fetchMessages(conversationId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  
  // Convert StoredMessage[] to UIMessage[]
  return (data as StoredMessage[]).map(msg => ({
    id: msg.provider_message_id || msg.id.toString(),
    role: msg.role,
    parts: msg.parts,
    createdAt: new Date(msg.created_at)
  }))
}

export function useMessages(conversationId?: string) {
  const queryClient = useQueryClient()
  
  const { data: messages = [], isLoading, error } = useQuery({
    queryKey: getMessagesQueryKey(conversationId),
    queryFn: () => conversationId ? fetchMessages(conversationId) : Promise.resolve([]),
    enabled: !!conversationId,
  })

  const addMessage = React.useCallback((message: UIMessage) => {
    queryClient.setQueryData<UIMessage[]>(getMessagesQueryKey(conversationId), (old) => 
      [...(old || []), message]
    )
  }, [conversationId, queryClient])

  const updateLastMessage = React.useCallback((content: string) => {
    queryClient.setQueryData<UIMessage[]>(getMessagesQueryKey(conversationId), (old) => {
      if (!old || old.length === 0) return old
      
      const lastMessage = old[old.length - 1]
      if (lastMessage.role !== 'assistant') return old
      
      const updatedMessage: UIMessage = {
        ...lastMessage,
        parts: [{ type: 'text', text: content }]
      }
      
      return [...old.slice(0, -1), updatedMessage]
    })
  }, [conversationId, queryClient])

  const clearMessages = React.useCallback(() => {
    queryClient.setQueryData<UIMessage[]>(getMessagesQueryKey(conversationId), [])
  }, [conversationId, queryClient])

  return {
    messages,
    isLoading,
    error: error?.message || null,
    addMessage,
    updateLastMessage,
    clearMessages,
    refetch: () => queryClient.invalidateQueries({ queryKey: getMessagesQueryKey(conversationId) })
  }
}