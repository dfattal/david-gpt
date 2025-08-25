import * as React from 'react'
import { Pencil, Trash2, Check, X, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TitleStatus } from '@/components/ui/title-status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { retryTitleGeneration } from '@/lib/title-generation'
import type { Conversation } from '@/lib/supabase'

interface ConversationItemProps {
  conversation: Conversation
  isActive?: boolean
  onClick: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => Promise<boolean>
  onTitleRefresh?: () => void // Callback to refresh conversations list after title generation
}

export function ConversationItem({
  conversation,
  isActive = false,
  onClick,
  onRename,
  onDelete,
  onTitleRefresh
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState(conversation.title)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isRetryingTitle, setIsRetryingTitle] = React.useState(false)
  
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleStartEdit = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditTitle(conversation.title)
  }, [conversation.title])

  const handleSaveEdit = React.useCallback(async () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      await onRename(conversation.id, editTitle.trim())
    }
    setIsEditing(false)
  }, [editTitle, conversation.id, conversation.title, onRename])

  const handleCancelEdit = React.useCallback(() => {
    setIsEditing(false)
    setEditTitle(conversation.title)
  }, [conversation.title])

  const handleDelete = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDeleting(true)
    try {
      const success = await onDelete(conversation.id)
      if (!success) {
        setIsDeleting(false)
      }
    } catch {
      setIsDeleting(false)
    }
  }, [conversation.id, onDelete])

  const handleRetryTitle = React.useCallback(async (conversationId: string) => {
    setIsRetryingTitle(true)
    try {
      const success = await retryTitleGeneration(conversationId)
      if (success && onTitleRefresh) {
        // Refresh the conversations list to show the updated title
        setTimeout(() => {
          onTitleRefresh()
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to retry title generation:', error)
    } finally {
      setIsRetryingTitle(false)
    }
  }, [onTitleRefresh])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }, [handleSaveEdit, handleCancelEdit])

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  if (isDeleting) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
        Deleting...
      </div>
    )
  }

  return (
    <div
      onClick={isEditing ? undefined : onClick}
      className={cn(
        'group relative flex items-center rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors min-h-[44px] mx-2 max-w-[232px] overflow-hidden',
        isActive 
          ? 'bg-accent text-accent-foreground' 
          : 'hover:bg-accent/50 text-foreground/80 hover:text-foreground',
        isEditing && 'bg-accent'
      )}
      style={{ touchAction: 'manipulation' }}
    >
      
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <Input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm border-none bg-transparent px-0 focus-visible:ring-1 min-w-0"
            onBlur={handleSaveEdit}
            style={{ minHeight: '32px' }}
          />
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-green-600 hover:text-green-700 touch-manipulation"
              onClick={handleSaveEdit}
              style={{ minHeight: '32px', minWidth: '32px' }}
              aria-label="Save changes"
            >
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground touch-manipulation"
              onClick={handleCancelEdit}
              style={{ minHeight: '32px', minWidth: '32px' }}
              aria-label="Cancel editing"
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0 py-1 pr-2 overflow-hidden">
            <TitleStatus 
              conversation={conversation}
              onRetry={!isRetryingTitle ? handleRetryTitle : undefined}
              className="text-sm"
            />
          </div>
          <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 relative z-10 ml-auto flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground touch-manipulation relative z-20"
                  disabled={isRetryingTitle}
                  style={{ minHeight: '32px', minWidth: '32px' }}
                  aria-label="More options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStartEdit(e)
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <Pencil className="size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(e)
                  }}
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </div>
  )
}