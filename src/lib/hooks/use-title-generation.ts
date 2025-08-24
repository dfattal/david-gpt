import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { needsTitleGeneration, triggerTitleGeneration } from '@/lib/title-generation'
import { type Conversation } from '@/lib/supabase'

/**
 * Hook for managing conversation title generation
 */
export function useTitleGeneration() {
  const queryClient = useQueryClient()

  // Manual trigger for title generation (if needed)
  const generateTitle = React.useCallback(async (conversationId: string) => {
    await triggerTitleGeneration(conversationId)
    
    // Refresh conversations after triggering
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }, 1000)
  }, [queryClient])

  // Check if a conversation needs title generation
  const checkTitleStatus = React.useCallback((conversation: Conversation) => {
    return {
      needsGeneration: needsTitleGeneration(conversation.title_status),
      status: conversation.title_status,
      isReady: conversation.title_status === 'ready',
      hasError: conversation.title_status === 'error'
    }
  }, [])

  // Get title display info for UI
  const getTitleDisplay = React.useCallback((conversation: Conversation) => {
    const status = checkTitleStatus(conversation)
    
    return {
      title: conversation.title,
      isLoading: status.needsGeneration,
      showLoadingState: status.needsGeneration && conversation.title === 'New chat',
      hasError: status.hasError
    }
  }, [checkTitleStatus])

  return {
    generateTitle,
    checkTitleStatus,
    getTitleDisplay
  }
}