'use client'

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import { type UIMessage } from '@/lib/supabase'
import { useVirtualScrolling, useRenderOptimization } from '@/lib/performance-client'
import { cn } from '@/lib/utils'

interface VirtualMessageListProps {
  messages: UIMessage[]
  isStreaming?: boolean
  streamingMessage?: string
  className?: string
  onScroll?: (scrollTop: number) => void
}

const ITEM_HEIGHT = 120 // Approximate height per message
const CONTAINER_HEIGHT = 600 // Default container height

export function VirtualMessageList({
  messages,
  isStreaming = false,
  streamingMessage = '',
  className,
  onScroll
}: VirtualMessageListProps) {
  useRenderOptimization('VirtualMessageList')
  
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [containerHeight, setContainerHeight] = React.useState(CONTAINER_HEIGHT)
  
  // Use virtual scrolling for large message lists
  const shouldVirtualize = messages.length > 50
  
  const virtualScrolling = useVirtualScrolling({
    itemCount: messages.length,
    itemHeight: ITEM_HEIGHT,
    containerHeight
  })
  
  // Handle scroll events
  const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement
    const newScrollTop = target.scrollTop
    setScrollTop(newScrollTop)
    virtualScrolling.setScrollTop(newScrollTop)
    onScroll?.(newScrollTop)
  }, [virtualScrolling, onScroll])
  
  // Auto-scroll to bottom for new messages
  const scrollToBottom = React.useCallback(() => {
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight
    }
  }, [])
  
  // Auto-scroll when messages change (only if near bottom)
  React.useEffect(() => {
    if (messages.length === 0) return
    
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollArea) return
    
    const isNearBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 100
    
    if (isNearBottom) {
      const timer = setTimeout(scrollToBottom, 50)
      return () => clearTimeout(timer)
    }
  }, [messages.length, streamingMessage, scrollToBottom])
  
  // Render normal messages for small lists
  const renderNormalMessages = () => (
    <div className="space-y-0">
      {messages.map((message, index) => (
        <MessageBubble
          key={`${message.id}-${index}`}
          message={message}
          isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}
    </div>
  )
  
  return (
    <ScrollArea 
      ref={scrollAreaRef} 
      className={cn('flex-1', className)}
    >
      <div className="min-h-full">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto p-8">
              <h1 className="text-3xl font-bold mb-2">
                Welcome to David-GPT
              </h1>
              <p className="text-muted-foreground mb-8">
                I'm David Fattal, a technology entrepreneur and AI enthusiast. 
                Ask me anything about AI, startups, product development, or just chat!
              </p>
              <div className="text-sm text-muted-foreground">
                Start a conversation by typing a message below.
              </div>
            </div>
          </div>
        ) : (
          renderNormalMessages()
        )}
      </div>
    </ScrollArea>
  )
}

// Performance monitoring wrapper
export const VirtualMessageListWithMonitoring = React.memo(VirtualMessageList, (prevProps, nextProps) => {
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