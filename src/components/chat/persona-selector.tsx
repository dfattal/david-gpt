"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Check, User, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivePersonas } from "@/hooks/use-personas";
import { getPersonaAvatar } from "@/lib/avatar-utils";

export interface PersonaOption {
  persona_id: string;
  name: string;
  description: string;
  expertise_domains: string[];
  expertise?: string;
  example_questions?: string[];
  avatar_url?: string;
  is_active: boolean;
  stats?: {
    conversations: number;
    documents: number;
    last_active?: string;
  };
}

interface PersonaSelectorProps {
  personas: PersonaOption[];
  selectedPersona: PersonaOption | null;
  onPersonaSelect: (persona: PersonaOption) => void;
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
}

export function PersonaSelector({
  personas,
  selectedPersona,
  onPersonaSelect,
  isOpen,
  onClose,
  loading = false
}: PersonaSelectorProps) {
  const [hoveredPersona, setHoveredPersona] = useState<string | null>(null);

  const handlePersonaClick = (persona: PersonaOption) => {
    if (!persona.is_active) return;
    onPersonaSelect(persona);
  };


  const getPersonaFallback = (persona: PersonaOption) => {
    if (!persona.name || typeof persona.name !== 'string') {
      return persona.persona_id?.slice(0, 2).toUpperCase() || 'AI';
    }
    return persona.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPersonaTheme = (personaId: string) => {
    const themes: Record<string, string> = {
      'david': 'from-blue-500 to-purple-600',
      'legal': 'from-blue-600 to-indigo-700',
      'medical': 'from-green-500 to-teal-600',
      'financial': 'from-yellow-500 to-orange-600',
      'technical': 'from-gray-600 to-slate-700',
    };
    return themes[personaId] || 'from-gray-500 to-gray-600';
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Your AI Assistant</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3 text-muted-foreground">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
              </div>
              <span className="text-sm">Loading personas...</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl">Choose Your AI Expert</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Select a specialized assistant for your questions
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="px-6 pb-6">
          {personas.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No personas available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {personas.map((persona) => (
                <Card
                  key={persona.persona_id}
                  className={cn(
                    "relative overflow-hidden transition-all duration-200 cursor-pointer group",
                    {
                      "ring-2 ring-primary shadow-lg": selectedPersona?.persona_id === persona.persona_id,
                      "hover:shadow-md hover:scale-[1.02]": persona.is_active,
                      "opacity-60 cursor-not-allowed": !persona.is_active,
                      "bg-muted/20": hoveredPersona === persona.persona_id
                    }
                  )}
                  onClick={() => handlePersonaClick(persona)}
                  onMouseEnter={() => setHoveredPersona(persona.persona_id)}
                  onMouseLeave={() => setHoveredPersona(null)}
                >
                  {/* Background gradient */}
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-5",
                      getPersonaTheme(persona.persona_id)
                    )}
                  />

                  {/* Selection indicator */}
                  {selectedPersona?.persona_id === persona.persona_id && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}

                  {/* Inactive overlay */}
                  {!persona.is_active && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Badge variant="secondary" className="pointer-events-none">
                        Inactive
                      </Badge>
                    </div>
                  )}

                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      {/* Avatar */}
                      <Avatar className="w-16 h-16 border-2 border-border shadow-sm">
                        <AvatarImage
                          src={getPersonaAvatar(persona)}
                          alt={persona.name}
                          className="object-cover"
                        />
                        <AvatarFallback
                          className={cn(
                            "text-white font-semibold bg-gradient-to-br",
                            getPersonaTheme(persona.persona_id)
                          )}
                        >
                          {getPersonaFallback(persona)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name and Description */}
                      <div className="space-y-2 min-h-[4rem]">
                        <h3 className="font-semibold text-base leading-tight">
                          {persona.name}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {persona.description}
                        </p>
                      </div>

                      {/* Expertise Domains */}
                      <div className="flex flex-wrap gap-1 justify-center min-h-[2rem]">
                        {persona.expertise_domains?.slice(0, 3).map((domain) => (
                          <Badge
                            key={domain}
                            variant="secondary"
                            className="text-xs px-2 py-0.5"
                          >
                            {domain}
                          </Badge>
                        ))}
                        {(persona.expertise_domains?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-xs px-2 py-0.5">
                            +{(persona.expertise_domains?.length || 0) - 3}
                          </Badge>
                        )}
                      </div>

                      {/* Stats */}
                      {persona.stats && (
                        <div className="flex items-center justify-center space-x-4 text-xs text-muted-foreground pt-2">
                          {persona.stats.conversations > 0 && (
                            <span>{persona.stats.conversations} chats</span>
                          )}
                          {persona.stats.documents > 0 && (
                            <span>{persona.stats.documents} docs</span>
                          )}
                        </div>
                      )}

                      {/* Action indicator */}
                      {persona.is_active && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pt-2">
                          <div className="flex items-center text-xs text-primary">
                            <span>Start chatting</span>
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Current selection summary */}
          {selectedPersona && (
            <>
              <Separator className="my-6" />
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage
                      src={getPersonaAvatar(selectedPersona)}
                      alt={selectedPersona.name}
                    />
                    <AvatarFallback
                      className={cn(
                        "text-white text-xs bg-gradient-to-br",
                        getPersonaTheme(selectedPersona.persona_id)
                      )}
                    >
                      {getPersonaFallback(selectedPersona)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{selectedPersona.name}</p>
                    <p className="text-xs text-muted-foreground">Selected assistant</p>
                  </div>
                </div>
                <Button onClick={onClose} size="sm">
                  Start Conversation
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Hook for managing persona selector state
export function usePersonaSelector() {
  const [selectedPersona, setSelectedPersona] = useState<PersonaOption | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Use React Query to fetch personas
  const { data: personas = [], isLoading: loading, error } = useActivePersonas();

  // Auto-select first active persona if none selected
  useEffect(() => {
    if (!selectedPersona && personas.length > 0) {
      const firstActive = personas.find((p: PersonaOption) => p.is_active);
      if (firstActive) {
        setSelectedPersona(firstActive);
      }
    }
  }, [personas, selectedPersona]);

  const loadPersonas = () => {
    // React Query handles refetching automatically
    // This function is kept for compatibility but does nothing
  };

  return {
    personas,
    selectedPersona,
    setSelectedPersona,
    isOpen,
    setIsOpen,
    loading,
    loadPersonas,
    error
  };
}