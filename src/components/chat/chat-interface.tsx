'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MessageBubble } from './message-bubble';
import { useAuth } from '@/components/auth/auth-provider';
import { formatDate } from '@/lib/utils';
import { getPersonaAvatar } from '@/lib/avatar-utils';
import { Send, Settings, User } from 'lucide-react';
import type { Conversation } from '@/lib/types';
import type { PersonaOption } from './persona-selector';

interface ChatInterfaceProps {
  conversation?: Conversation;
  onConversationUpdate?: (conversation: Conversation) => void;
  selectedPersona?: PersonaOption | null;
  onPersonaSelect?: () => void;
}

export function ChatInterface({
  conversation,
  onConversationUpdate,
  selectedPersona,
  onPersonaSelect,
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  // AI SDK pattern: manage input state manually, use append
  const [input, setInput] = useState('');
  const chatHook = useChat({
    api: '/api/chat',
    streamProtocol: 'text', // Match backend toTextStreamResponse()
    body: {
      conversationId: conversation?.id,
      personaId: selectedPersona?.persona_id,
    },
    onFinish: async () => {
      // After a successful response, update conversation if needed
      if (conversation && onConversationUpdate) {
        try {
          const response = await fetch(`/api/conversations/${conversation.id}`);
          if (response.ok) {
            const { conversation: updatedConversation } = await response.json();
            onConversationUpdate(updatedConversation);
          }
        } catch (error) {
          console.error('Failed to update conversation:', error);
        }
      }
    },
    onError: error => {
      console.error('Chat streaming error:', error);
    },
  });

  // Destructure the hook result
  const { messages, isLoading, error, append, setMessages } = chatHook;

  // Load conversation messages when conversation changes
  useEffect(() => {
    const loadConversationMessages = async () => {
      const newConversationId = conversation?.id || null;

      if (!newConversationId) {
        // Clear messages when no conversation is selected (new chat)
        setMessages([]);
        setCurrentConversationId(null);
        return;
      }

      // Only show loading if this is actually a different conversation
      // This prevents the flash when the conversation object gets updated after sending a message
      const isNewConversation = currentConversationId !== newConversationId;

      // Show loading when switching to a different conversation, but not during active generation
      if (isNewConversation && !isLoading) {
        setLoadingMessages(true);
      }

      try {
        const response = await fetch(`/api/conversations/${newConversationId}`);
        if (response.ok) {
          const { messages: conversationMessages } = await response.json();

          // Convert database messages to chat hook format
          const formattedMessages = conversationMessages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: new Date(msg.created_at),
          }));

          // Update messages when switching to a different conversation
          // Only skip if we're in an active generation (isLoading) to prevent overwriting streaming messages
          if (isNewConversation && !isLoading) {
            setMessages(formattedMessages);
          }

          setCurrentConversationId(newConversationId);
        } else {
          console.error('Failed to load conversation messages');
        }
      } catch (error) {
        console.error('Error loading conversation messages:', error);
      } finally {
        if (isNewConversation && !isLoading) {
          setLoadingMessages(false);
        }
      }
    };

    loadConversationMessages();
  }, [conversation?.id, setMessages, currentConversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const messageContent = input.trim();
    setInput(''); // Clear input immediately (v5 pattern)

    // Send message immediately - no blocking conversation creation
    append({ role: 'user', content: messageContent });

    // Create conversation in background for authenticated users (non-blocking)
    if (!conversation && user) {
      // Don't await - let this happen in background
      fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstMessage: messageContent }),
      })
        .then(async response => {
          if (response.ok) {
            const { conversation: newConversation } = await response.json();
            onConversationUpdate?.(newConversation);

            // Note: Title generation is happening in the background
            // The sidebar will automatically refresh to show the updated title
            console.log(
              `✅ Created conversation: ${newConversation.id} with title: "${newConversation.title}"`
            );
            console.log(`🔄 Triggering immediate sidebar refresh`);
          }
        })
        .catch(error => {
          console.error('Failed to create conversation:', error);
        });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(e);
    }
  };

  const isGuest = !user;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Persona indicator */}
            {selectedPersona ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPersonaSelect}
                className="flex items-center space-x-2 px-3"
              >
                <Avatar className="w-6 h-6">
                  <AvatarImage
                    src={getPersonaAvatar(selectedPersona)}
                    alt={selectedPersona.name}
                  />
                  <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {selectedPersona.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {selectedPersona.name}
                </span>
                <Settings className="w-3 h-3 opacity-60" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onPersonaSelect}>
                <User className="w-4 h-4 mr-2" />
                Select Assistant
              </Button>
            )}

            <div className="h-6 w-px bg-border" />

            <h2 className="font-semibold text-lg truncate">
              {conversation ? conversation.title || 'New Chat' : 'New Chat'}
            </h2>
          </div>

          <div className="flex items-center space-x-3">
            {conversation && (
              <div className="text-xs text-muted-foreground">
                {formatDate(conversation.created_at)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center space-x-3 text-muted-foreground">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                </div>
                <span className="text-sm">Loading conversation...</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {selectedPersona ? (
                <Card className="max-w-2xl mx-auto border-0 shadow-none bg-transparent">
                  <CardContent className="flex flex-col items-center text-center space-y-6 py-12">
                    {/* Persona Profile Image */}
                    <Avatar className="w-32 h-32 border-4 border-border shadow-lg">
                      <AvatarImage
                        src={getPersonaAvatar(selectedPersona)}
                        alt={selectedPersona.name}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                        {selectedPersona.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Welcome Section */}
                    <div className="space-y-4">
                      <h1 className="text-4xl font-bold tracking-tight">
                        Welcome to {selectedPersona.name}
                      </h1>

                      <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                        {selectedPersona.description}
                      </p>

                      {/* Expertise badges */}
                      {selectedPersona.expertise_domains.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center">
                          {selectedPersona.expertise_domains
                            .slice(0, 4)
                            .map(domain => (
                              <Badge
                                key={domain}
                                variant="secondary"
                                className="text-sm"
                              >
                                {domain}
                              </Badge>
                            ))}
                          {selectedPersona.expertise_domains.length > 4 && (
                            <Badge variant="outline" className="text-sm">
                              +{selectedPersona.expertise_domains.length - 4}{' '}
                              more
                            </Badge>
                          )}
                        </div>
                      )}

                      <Separator className="my-6" />

                      <p className="text-sm text-muted-foreground">
                        {isGuest
                          ? "You're browsing as a guest with limited access. Start a conversation below."
                          : `Ask me anything about ${selectedPersona.expertise_domains.slice(0, 2).join(' or ')} - or just chat!`}
                      </p>

                      {/* Switch persona button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onPersonaSelect}
                      >
                        <User className="w-4 h-4 mr-2" />
                        Switch Assistant
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="max-w-2xl mx-auto border-0 shadow-none bg-transparent">
                  <CardContent className="flex flex-col items-center text-center space-y-6 py-12">
                    <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-16 h-16 text-muted-foreground" />
                    </div>
                    <div className="space-y-4">
                      <h1 className="text-4xl font-bold tracking-tight">
                        Welcome to Multi-GPT
                      </h1>
                      <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                        Select an AI assistant to start your conversation
                      </p>
                      <Button
                        onClick={onPersonaSelect}
                        size="lg"
                        className="mt-4"
                      >
                        <User className="w-4 h-4 mr-2" />
                        Choose Your Assistant
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="space-y-6 py-6 px-4 max-w-4xl mx-auto">
              {messages
                .filter(
                  message =>
                    message.role === 'user' || message.role === 'assistant'
                )
                .map(message => (
                  <MessageBubble
                    key={message.id}
                    message={{
                      id: message.id,
                      role: message.role as 'user' | 'assistant',
                      content: message.content,
                      created_at: message.createdAt?.toISOString(),
                    }}
                    user={user}
                  />
                ))}

              {isLoading && (
                <div className="flex items-center justify-center space-x-3 py-4">
                  <Avatar className="w-8 h-8">
                    <AvatarImage
                      src={getPersonaAvatar(selectedPersona)}
                      alt={selectedPersona?.name}
                    />
                    <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      {selectedPersona?.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .slice(0, 2) || 'AI'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    </div>
                    <span className="text-sm">
                      {selectedPersona?.name || 'AI'} is thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Input area */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-4">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-end space-x-3"
          >
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !conversation && messages.length === 0
                    ? `Start a new conversation with ${selectedPersona?.name || 'your AI assistant'}...`
                    : 'Continue conversation...'
                }
                className="min-h-[52px] max-h-32 resize-none border-2 focus:border-primary transition-colors"
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              className="h-[52px] w-[52px] shrink-0"
              disabled={!input.trim() || isLoading}
            >
              <Send className="w-5 h-5" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>

          <div className="flex justify-between items-center text-xs text-muted-foreground mt-3 px-1">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span className="font-medium">
              {selectedPersona?.name || 'Multi-GPT'} • Powered by GPT-4
            </span>
          </div>

          {error && (
            <Card className="mt-3 border-destructive/50 bg-destructive/5">
              <CardContent className="py-3">
                <div className="text-destructive text-sm">
                  <strong>Error:</strong> {error.message}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
