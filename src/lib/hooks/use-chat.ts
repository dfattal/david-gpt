import * as React from 'react'
import { type UIMessage } from '@/lib/supabase'
import { refreshConversationsFromOutside } from './use-conversations'

interface UseChatOptions {
  onResponse?: (response: string) => void
  onError?: (error: string) => void
}

export function useChat(options: UseChatOptions = {}) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sendMessage = React.useCallback(async (
    messages: UIMessage[],
    conversationId?: string,
    onChunk?: (chunk: string) => void
  ) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uiMessages: messages,
          conversationId
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          fullResponse += chunk
          
          if (onChunk) {
            onChunk(chunk)
          }
        }
      } finally {
        reader.releaseLock()
      }

      if (options.onResponse) {
        options.onResponse(fullResponse)
      }

      // Trigger conversation refresh after streaming completes
      // Use a delay to allow backend title generation to finish
      setTimeout(() => {
        refreshConversationsFromOutside()
      }, 2000) // 2 second delay for title generation to complete

      return fullResponse
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      if (options.onError) {
        options.onError(errorMessage)
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [options])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  return {
    sendMessage,
    isLoading,
    error,
    clearError
  }
}