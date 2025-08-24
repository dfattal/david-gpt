import * as React from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { type UIMessage } from '@/lib/supabase'

interface MessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const textContent = message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text || '')
    .join(' ')

  return (
    <div className={cn(
      'flex w-full gap-3 px-4 py-6',
      isUser ? 'bg-background' : 'bg-muted/30'
    )}>
      <div className="flex-shrink-0">
        <Avatar className="size-8">
          <AvatarFallback className={cn(
            'text-xs font-medium',
            isUser 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-emerald-600 text-white'
          )}>
            {isUser ? 'U' : 'DF'}
          </AvatarFallback>
        </Avatar>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm max-w-none break-words text-foreground">
          {textContent}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}