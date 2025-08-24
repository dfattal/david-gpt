import * as React from 'react'
import { Plus, Menu, X } from 'lucide-react'
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
  onDeleteConversation: (id: string) => void
  isLoading?: boolean
  className?: string
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  isLoading = false,
  className
}: ConversationSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Button
          onClick={onNewConversation}
          size="sm"
          variant="outline"
          disabled={isLoading}
        >
          <Plus className="size-4" />
          New
        </Button>
      </div>

      <Separator />

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-2">
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
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <Separator />
      <div className="p-4 space-y-3">
        <UserProfile />
        <div className="text-xs text-muted-foreground text-center">
          David-GPT • Powered by GPT-4
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={cn(
        'hidden md:flex w-64 border-r bg-muted/30',
        className
      )}>
        {sidebarContent}
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-4 left-4 z-40"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Conversations</h2>
            <Button
              onClick={() => setIsMobileOpen(false)}
              variant="ghost"
              size="icon"
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}