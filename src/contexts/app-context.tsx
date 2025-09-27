'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { PersonaOption } from '@/components/chat/persona-selector';
import type { Conversation } from '@/lib/types';

interface AppState {
  // Persona state
  selectedPersona: PersonaOption | null;
  isPersonaSelectorOpen: boolean;

  // Conversation state
  currentConversation: Conversation | null;

  // UI state
  sidebarOpen: boolean;
}

interface AppActions {
  // Persona actions
  setSelectedPersona: (persona: PersonaOption | null) => void;
  setPersonaSelectorOpen: (open: boolean) => void;

  // Conversation actions
  setCurrentConversation: (conversation: Conversation | null) => void;

  // UI actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [selectedPersona, setSelectedPersona] = useState<PersonaOption | null>(null);
  const [isPersonaSelectorOpen, setIsPersonaSelectorOpen] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const setPersonaSelectorOpen = useCallback((open: boolean) => {
    setIsPersonaSelectorOpen(open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const contextValue: AppContextType = {
    // State
    selectedPersona,
    isPersonaSelectorOpen,
    currentConversation,
    sidebarOpen,

    // Actions
    setSelectedPersona,
    setPersonaSelectorOpen,
    setCurrentConversation,
    setSidebarOpen,
    toggleSidebar,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

// Convenience hooks for specific parts of the state
export function usePersonaState() {
  const { selectedPersona, isPersonaSelectorOpen, setSelectedPersona, setPersonaSelectorOpen } = useAppContext();
  return {
    selectedPersona,
    isPersonaSelectorOpen,
    setSelectedPersona,
    setPersonaSelectorOpen,
  };
}

export function useConversationState() {
  const { currentConversation, setCurrentConversation } = useAppContext();
  return {
    currentConversation,
    setCurrentConversation,
  };
}

export function useSidebarState() {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useAppContext();
  return {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
  };
}