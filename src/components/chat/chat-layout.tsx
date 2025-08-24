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
    createConversation,
    renameConversation,
    deleteConversation
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

  const handleDeleteConversation = React.useCallback(async (id: string) => {
    await deleteConversation(id)
    
    // If we deleted the active conversation, clear selection
    if (id === activeConversationId) {
      setActiveConversationId(undefined)
    }
  }, [deleteConversation, activeConversationId])

  return (
    <div className={cn('flex h-screen bg-background', className)}>
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        isLoading={isLoading}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface
          conversationId={activeConversationId}
          className="h-full"
        />
      </div>
    </div>
  )
}