import * as React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export function StreamingIndicator() {
  return (
    <div className="flex w-full gap-3 px-4 py-6 bg-muted/30">
      <div className="flex-shrink-0">
        <Avatar className="size-8">
          <AvatarFallback className="bg-emerald-600 text-white text-xs font-medium">
            DF
          </AvatarFallback>
        </Avatar>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-muted-foreground">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm ml-2">David is thinking...</span>
        </div>
      </div>
    </div>
  )
}