'use client'

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import { type UIMessage } from '@/lib/supabase'
import { useRenderOptimization } from '@/lib/performance-client'
import { cn } from '@/lib/utils'

interface VirtualMessageListProps {
  messages: UIMessage[]
  isStreaming?: boolean
  streamingMessage?: string
  className?: string
}


export function VirtualMessageList({
  messages,
  isStreaming = false,
  streamingMessage = '',
  className
}: VirtualMessageListProps) {
  useRenderOptimization('VirtualMessageList')
  
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  
  // Auto-scroll to bottom for new messages
  const scrollToBottom = React.useCallback(() => {
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight
    }
  }, [])
  
  // Auto-scroll when messages change (only if near bottom) - throttled for performance
  const streamingMessageChunkCount = React.useMemo(() => Math.floor(streamingMessage.length / 50), [streamingMessage.length])
  
  React.useEffect(() => {
    if (messages.length === 0) return
    
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollArea) return
    
    const isNearBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 100
    
    if (isNearBottom) {
      const timer = setTimeout(scrollToBottom, 100) // Increased delay to reduce scroll frequency
      return () => clearTimeout(timer)
    }
  }, [messages.length, streamingMessageChunkCount, scrollToBottom])
  
  // Render normal messages for small lists - memoized
  const renderNormalMessages = React.useMemo(() => (
    <div className="space-y-0">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}
    </div>
  ), [messages, isStreaming])
  
  return (
    <ScrollArea 
      ref={scrollAreaRef} 
      className={cn('flex-1', className)}
    >
      <div className="min-h-full">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto p-8">
              <div className="mb-6">
                <img 
                  src="/David_smaller_pic.jpg" 
                  alt="David Fattal" 
                  className="w-32 h-32 rounded-full mx-auto mb-4 object-cover shadow-lg ring-2 ring-border"
                />
                <h1 className="text-3xl font-bold mb-2">
                  Welcome to David-GPT
                </h1>
              </div>
              <p className="text-muted-foreground mb-8">
                I&apos;m David Fattal, a technology entrepreneur and Spatial AI enthusiast. 
                Ask me anything about AI, Immersive Tech, or just chat!
              </p>
              <div className="text-sm text-muted-foreground">
                Start a conversation by typing a message below.
              </div>
            </div>
          </div>
        ) : (
          renderNormalMessages
        )}
      </div>
    </ScrollArea>
  )
}

// Performance monitoring wrapper - optimized comparison
export const VirtualMessageListWithMonitoring = React.memo(VirtualMessageList, (prevProps, nextProps) => {
  // Fast shallow comparison first
  if (prevProps.messages === nextProps.messages &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.streamingMessage === nextProps.streamingMessage) {
    return true;
  }
  
  // If streaming and only the streaming message changed, allow limited re-renders
  if (prevProps.isStreaming && nextProps.isStreaming &&
      prevProps.messages === nextProps.messages) {
    // Only update if streaming message changed significantly (every ~10 chars)
    const prevLength = prevProps.streamingMessage?.length || 0;
    const nextLength = nextProps.streamingMessage?.length || 0;
    return Math.floor(prevLength / 10) === Math.floor(nextLength / 10);
  }
  
  // Custom memoization logic for better performance
  const messagesEqual = 
    prevProps.messages.length === nextProps.messages.length &&
    prevProps.messages.every((msg, index) => {
      const nextMsg = nextProps.messages[index]
      return msg.id === nextMsg.id && 
             msg.parts[0]?.text === nextMsg.parts[0]?.text
    })
  
  return messagesEqual &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.streamingMessage === nextProps.streamingMessage
})