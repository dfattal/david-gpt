'use client'

import * as React from 'react'
import { VirtualMessageListWithMonitoring } from './virtual-message-list'
import { MessageInput } from './message-input'
import { StreamingIndicator } from './streaming-indicator'
import { useMessages } from '@/lib/hooks/use-messages'
import { useChat } from '@/lib/hooks/use-chat'
import { type UIMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useStreamingPerformance, useRenderOptimization, useMemoryMonitor, useThrottle } from '@/lib/performance-client'

interface ChatInterfaceProps {
  conversationId?: string
  className?: string
}

export const ChatInterface = React.memo(function ChatInterface({ conversationId, className }: ChatInterfaceProps) {
  useRenderOptimization('ChatInterface')
  useMemoryMonitor()
  
  const { messages, addMessage, updateLastMessage, clearMessages } = useMessages(conversationId)
  const [streamingMessage, setStreamingMessage] = React.useState('')
  const [isAssistantTyping, setIsAssistantTyping] = React.useState(false)
  
  const { trackStreamStart, trackFirstToken } = useStreamingPerformance()

  // Throttle streaming message updates to reduce render frequency
  const streamingUpdateRef = React.useRef<string>('')
  const throttledSetStreamingMessage = useThrottle((message: string) => {
    streamingUpdateRef.current = message
    setStreamingMessage(message)
  }, 50)
  const throttledUpdateLastMessage = useThrottle(updateLastMessage, 100)

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
          
          // Throttle UI updates to reduce render frequency
          throttledSetStreamingMessage(fullResponse)
          throttledUpdateLastMessage(fullResponse)
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      // TODO: Show error state in UI
    }
  }, [messages, addMessage, conversationId, chat, trackStreamStart, trackFirstToken, throttledSetStreamingMessage, throttledUpdateLastMessage])


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
          conversationId && messages.length > 0
            ? "Continue the conversation..." 
            : "Start a new conversation with David..."
        }
      />
    </div>
  )
})