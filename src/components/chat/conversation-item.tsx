import * as React from 'react'
import { MessageCircle, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/supabase'

interface ConversationItemProps {
  conversation: Conversation
  isActive?: boolean
  onClick: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ConversationItem({
  conversation,
  isActive = false,
  onClick,
  onRename,
  onDelete
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState(conversation.title)
  const [isDeleting, setIsDeleting] = React.useState(false)
  
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
      await onDelete(conversation.id)
    } catch {
      setIsDeleting(false)
    }
  }, [conversation.id, onDelete])

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
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
        isActive 
          ? 'bg-accent text-accent-foreground' 
          : 'hover:bg-accent/50 text-foreground/80 hover:text-foreground',
        isEditing && 'bg-accent'
      )}
    >
      <MessageCircle className="size-4 flex-shrink-0" />
      
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <Input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-6 text-sm border-none bg-transparent px-0 focus-visible:ring-1"
            onBlur={handleSaveEdit}
          />
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-green-600 hover:text-green-700"
              onClick={handleSaveEdit}
            >
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={handleCancelEdit}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{conversation.title}</span>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={handleStartEdit}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}