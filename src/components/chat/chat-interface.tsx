'use client'

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VirtualMessageListWithMonitoring } from './virtual-message-list'
import { MessageInput } from './message-input'
import { StreamingIndicator } from './streaming-indicator'
import { useMessages } from '@/lib/hooks/use-messages'
import { useChat } from '@/lib/hooks/use-chat'
import { type UIMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useStreamingPerformance, useRenderOptimization, useMemoryMonitor } from '@/lib/performance-client'

interface ChatInterfaceProps {
  conversationId?: string
  className?: string
}

export function ChatInterface({ conversationId, className }: ChatInterfaceProps) {
  useRenderOptimization('ChatInterface')
  useMemoryMonitor()
  
  const { messages, addMessage, updateLastMessage, clearMessages } = useMessages(conversationId)
  const [streamingMessage, setStreamingMessage] = React.useState('')
  const [isAssistantTyping, setIsAssistantTyping] = React.useState(false)
  
  const { trackStreamStart, trackFirstToken } = useStreamingPerformance()

  const chat = useChat({
    onResponse: () => {
      // Final response is complete
      setIsAssistantTyping(false)
      setStreamingMessage('')
    },
    onError: (error) => {
      console.error('Chat error:', error)
      setIsAssistantTyping(false)
      setStreamingMessage('')
    }
  })


  const handleSendMessage = React.useCallback(async (content: string) => {
    const userMessage: UIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: content }],
      createdAt: new Date()
    }

    // Add user message immediately
    addMessage(userMessage)

    // Prepare messages for API (include new user message)
    const messagesToSend = [...messages, userMessage]

    // Create placeholder assistant message
    const assistantMessage: UIMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      createdAt: new Date()
    }

    addMessage(assistantMessage)
    setIsAssistantTyping(true)
    setStreamingMessage('')

    // Track streaming performance
    trackStreamStart()

    try {
      let fullResponse = ''
      let firstTokenTracked = false

      await chat.sendMessage(
        messagesToSend,
        conversationId,
        (chunk: string) => {
          if (!firstTokenTracked) {
            trackFirstToken()
            firstTokenTracked = true
          }
          
          fullResponse += chunk
          setStreamingMessage(fullResponse)
          updateLastMessage(fullResponse)
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      // TODO: Show error state in UI
    }
  }, [messages, addMessage, updateLastMessage, conversationId, chat, trackStreamStart, trackFirstToken])


  // Clear messages when conversation changes
  React.useEffect(() => {
    clearMessages()
    setStreamingMessage('')
    setIsAssistantTyping(false)
  }, [conversationId, clearMessages])

  const displayMessages = React.useMemo(() => {
    if (!isAssistantTyping) return messages
    
    // If streaming, update the last assistant message with streaming content
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      return messages.slice(0, -1).concat([{
        ...messages[messages.length - 1],
        parts: [{ type: 'text', text: streamingMessage }]
      }])
    }
    
    return messages
  }, [messages, isAssistantTyping, streamingMessage])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Messages Area */}
      <VirtualMessageListWithMonitoring
        messages={displayMessages}
        isStreaming={isAssistantTyping}
        streamingMessage={streamingMessage}
        className="flex-1"
      />
      
      {/* Show typing indicator if assistant is responding but no content yet */}
      {isAssistantTyping && streamingMessage === '' && (
        <div className="px-4 py-2">
          <StreamingIndicator />
        </div>
      )}

      {/* Input Area */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={chat.isLoading}
        placeholder={
          conversationId 
            ? "Continue the conversation..." 
            : "Start a new conversation with David..."
        }
      />
    </div>
  )
}