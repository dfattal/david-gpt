'use client'

import * as React from 'react'
import { ConversationSidebar } from './conversation-sidebar'
import { ChatInterface } from './chat-interface'
import { useConversations } from '@/lib/hooks/use-conversations'
import { cn } from '@/lib/utils'

interface ChatLayoutProps {
  className?: string
}

export function ChatLayout({ className }: ChatLayoutProps) {
  const {
    conversations,
    isLoading,
    isCreating,
    createConversation,
    renameConversation,
    deleteConversation,
    refetch
  } = useConversations()

  const [activeConversationId, setActiveConversationId] = React.useState<string>()

  const handleNewConversation = React.useCallback(async () => {
    const newConversation = await createConversation()
    if (newConversation) {
      setActiveConversationId(newConversation.id)
    }
  }, [createConversation])

  const handleSelectConversation = React.useCallback((id: string) => {
    setActiveConversationId(id)
  }, [])

  const handleRenameConversation = React.useCallback(async (id: string, title: string) => {
    await renameConversation(id, title)
  }, [renameConversation])

  const handleDeleteConversation = React.useCallback(async (id: string): Promise<boolean> => {
    const success = await deleteConversation(id)
    
    // If we deleted the active conversation, clear selection
    if (success && id === activeConversationId) {
      setActiveConversationId(undefined)
    }
    
    return success
  }, [deleteConversation, activeConversationId])

  return (
    <div className={cn('relative flex h-screen bg-background', className)}>
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onTitleRefresh={refetch}
        isLoading={isLoading}
        isCreating={isCreating}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header - only visible on mobile, provides space for hamburger menu */}
        <div className="md:hidden h-16 flex items-center justify-center border-b bg-background relative">
          <h1 className="text-lg font-semibold text-foreground">David-GPT</h1>
          <div className="absolute left-4 top-4 w-11 h-11" /> {/* Space reserved for hamburger menu */}
        </div>
        
        <ChatInterface
          conversationId={activeConversationId}
          className="flex-1"
        />
      </div>
    </div>
  )
}