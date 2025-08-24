import { cn } from '@/lib/utils'
import { getTitleDisplayInfo } from '@/lib/title-generation'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { type Conversation } from '@/lib/supabase'

interface TitleStatusProps {
  conversation: Conversation
  onRetry?: (conversationId: string) => void
  className?: string
}

export function TitleStatus({ conversation, onRetry, className }: TitleStatusProps) {
  const displayInfo = getTitleDisplayInfo(conversation.title, conversation.title_status)
  
  if (displayInfo.isReady || (!displayInfo.showLoading && !displayInfo.showError)) {
    return (
      <span className={cn('truncate', className)}>
        {displayInfo.displayTitle}
      </span>
    )
  }
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="truncate">{displayInfo.displayTitle}</span>
      
      {displayInfo.showLoading && (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating title...
        </Badge>
      )}
      
      {displayInfo.showError && (
        <Badge variant="destructive" className="text-xs flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Title failed
          {onRetry && (
            <button
              onClick={() => onRetry(conversation.id)}
              className="ml-1 hover:bg-destructive/80 p-0.5 rounded"
              title="Retry title generation"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </button>
          )}
        </Badge>
      )}
    </div>
  )
}