"use client";

import { useEffect, useRef, useCallback } from "react";
import { ChatInterface } from "./chat-interface";
import { ConversationSidebar } from "./conversation-sidebar";
import { PersonaSelector } from "./persona-selector";
import { useAuth } from "@/components/auth/auth-provider";
import { useSSE } from "./sse-hook";
import {
  usePersonaState,
  useConversationState,
  useSidebarState,
} from "@/contexts/app-context";
import { useActivePersonas } from "@/hooks/use-personas";
import type { Conversation } from "@/lib/types";

export function ChatLayout() {
  const { user } = useAuth();
  const { currentConversation, setCurrentConversation } = useConversationState();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useSidebarState();
  const {
    selectedPersona,
    isPersonaSelectorOpen,
    setSelectedPersona,
    setPersonaSelectorOpen,
  } = usePersonaState();
  const { data: personas = [], isLoading: personasLoading } =
    useActivePersonas();

  const sidebarRef = useRef<{
    refreshConversations: () => void;
    setTitleGenerating: (conversationId: string, isGenerating: boolean) => void;
  } | null>(null);

  const handleTitleUpdate = useCallback(
    (conversationId: string, title: string) => {
      console.log(
        `[ChatLayout] Handling title update for ${conversationId}: "${title}"`
      );

      // Update the title of the current conversation if it matches
      if (currentConversation?.id === conversationId) {
        console.log(
          `[ChatLayout] Updating current conversation title to "${title}"`
        );
        setCurrentConversation({ ...currentConversation, title });
      }

      // Refresh the sidebar to show the updated title in the list
      sidebarRef.current?.refreshConversations();
      sidebarRef.current?.setTitleGenerating(conversationId, false);
    },
    [currentConversation, setCurrentConversation]
  );

  // Setup SSE connection for real-time title updates
  useSSE({
    user,
    onTitleUpdate: handleTitleUpdate,
    fetchConversations: () => sidebarRef.current?.refreshConversations(),
  });

  // Auto-select David persona on initial load if no persona selected
  useEffect(() => {
    if (user && !selectedPersona && !personasLoading && personas.length > 0) {
      const davidPersona = personas.find((p) => p.slug === "david");
      if (davidPersona) {
        setSelectedPersona(davidPersona);
      } else {
        setPersonaSelectorOpen(true);
      }
    }
  }, [
    user,
    selectedPersona,
    personasLoading,
    personas,
    setSelectedPersona,
    setPersonaSelectorOpen,
  ]);

  // Reset conversation when user changes or persona changes
  useEffect(() => {
    if (!user) {
      setCurrentConversation(null);
      setSelectedPersona(null);
    }
  }, [user, setCurrentConversation, setSelectedPersona]);

  useEffect(() => {
    // Reset conversation when switching personas
    if (selectedPersona) {
      setCurrentConversation(null);
    }
  }, [selectedPersona?.slug, setCurrentConversation]);

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
        onClick={toggleSidebar}
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
          selectedPersona={selectedPersona}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
          onConversationUpdate={handleConversationUpdate}
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
          selectedPersona={selectedPersona}
          onPersonaSelect={() => setPersonaSelectorOpen(true)}
        />
      </div>

      {/* Persona Selector Modal */}
      <PersonaSelector
        personas={personas}
        selectedPersona={selectedPersona}
        onPersonaSelect={(persona) => {
          setSelectedPersona(persona);
          setPersonaSelectorOpen(false);
        }}
        isOpen={isPersonaSelectorOpen}
        onClose={() => setPersonaSelectorOpen(false)}
        loading={personasLoading}
      />
    </div>
  );
}
