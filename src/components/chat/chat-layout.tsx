"use client";

import { useState, useEffect, useRef } from "react";
import { ChatInterface } from "./chat-interface";
import { ConversationSidebar } from "./conversation-sidebar";
import { useAuth } from "@/components/auth/auth-provider";
import type { Conversation } from "@/lib/types";

export function ChatLayout() {
  const { user } = useAuth();
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarRef = useRef<{
    refreshConversations: () => void;
    setTitleGenerating: (conversationId: string, isGenerating: boolean) => void;
  } | null>(null);

  // Reset conversation when user changes
  useEffect(() => {
    if (!user) {
      setCurrentConversation(null);
    }
  }, [user]);

  const handleConversationSelect = (conversation: Conversation | null) => {
    setCurrentConversation(conversation);
  };

  const handleNewConversation = () => {
    setCurrentConversation(null);
  };

  const handleConversationUpdate = (conversation: Conversation) => {
    setCurrentConversation(conversation);
    // Immediately refresh the sidebar to show the new conversation
    sidebarRef.current?.refreshConversations();
    // Start title generation loading state for new conversations with "New Chat" title
    if (conversation.title === "New Chat") {
      sidebarRef.current?.setTitleGenerating(conversation.id, true);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar toggle - hidden on desktop */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-background border shadow-sm"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Sidebar */}
      <div
        className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 transition-transform duration-300 ease-in-out
        fixed lg:relative inset-y-0 left-0 z-40 lg:z-0
      `}
      >
        <ConversationSidebar
          ref={sidebarRef}
          currentConversation={currentConversation}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface
          conversation={currentConversation}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>
    </div>
  );
}
