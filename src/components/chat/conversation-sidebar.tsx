import * as React from 'react'
import { Plus, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ConversationItem } from './conversation-item'
import { UserProfile } from '@/components/auth/user-profile'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/supabase'

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeConversationId?: string
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => Promise<boolean>
  onTitleRefresh?: () => void // Callback to refresh conversations list after title generation
  isLoading?: boolean
  isCreating?: boolean
  className?: string
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onTitleRefresh,
  isLoading = false,
  isCreating = false,
  className
}: ConversationSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)
  
  // Close mobile menu on escape key
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false)
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isMobileOpen])

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 flex-shrink-0">
        <h2 className="text-lg font-semibold truncate">Conversations</h2>
        <Button
          onClick={onNewConversation}
          size="sm"
          variant="outline"
          disabled={isCreating}
          className="gap-1.5 flex-shrink-0"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>

      <Separator className="flex-shrink-0" />

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-2 min-h-0">
        <div className="space-y-1 py-2">
          {conversations.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No conversations yet.
              <br />
              Start a new chat to get going!
            </div>
          ) : (
            conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => {
                  onSelectConversation(conversation.id)
                  setIsMobileOpen(false)
                }}
                onRename={onRenameConversation}
                onDelete={onDeleteConversation}
                onTitleRefresh={onTitleRefresh}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <Separator className="flex-shrink-0" />
      <div className="p-4 space-y-3 flex-shrink-0 min-h-0">
        <div className="min-w-0">
          <UserProfile />
        </div>
        <div className="text-xs text-muted-foreground text-center truncate">
          David-GPT • Powered by GPT-4
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={cn(
        'hidden md:flex w-64 border-r bg-muted/30 max-h-screen overflow-hidden',
        className
      )}>
        {sidebarContent}
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed top-4 left-4 z-[60] bg-background/95 border-2 border-border shadow-xl hover:bg-accent hover:text-accent-foreground backdrop-blur-sm transition-all duration-200 active:scale-95 touch-manipulation"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <Menu className="size-6" />
            <span className="sr-only">Open conversations menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0 max-w-[85vw] z-[55]">
          <div className="flex h-full flex-col overflow-hidden">
            {/* Mobile Header */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold truncate">Conversations</h2>
              <Button
                onClick={onNewConversation}
                size="sm"
                variant="outline"
                disabled={isCreating}
                className="gap-1.5 flex-shrink-0 touch-manipulation"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <Plus className="size-4" />
                <span>New</span>
              </Button>
            </div>

            <Separator className="mt-0 flex-shrink-0" />

            {/* Conversations List */}
            <ScrollArea className="flex-1 px-2 min-h-0">
              <div className="space-y-1 py-2">
                {conversations.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No conversations yet.
                    <br />
                    Start a new chat to get going!
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={conversation.id === activeConversationId}
                      onClick={() => {
                        onSelectConversation(conversation.id)
                        setIsMobileOpen(false) // Close mobile menu when selecting
                      }}
                      onRename={onRenameConversation}
                      onDelete={onDeleteConversation}
                      onTitleRefresh={onTitleRefresh}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <Separator className="flex-shrink-0" />
            <div className="p-4 space-y-3 flex-shrink-0 min-h-0">
              <div className="min-w-0">
                <UserProfile />
              </div>
              <div className="text-xs text-muted-foreground text-center truncate">
                David-GPT • Powered by GPT-4
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}