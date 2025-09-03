"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MessageBubble } from "./message-bubble";
import { useAuth } from "@/components/auth/auth-provider";
import { Send } from "lucide-react";
import type { Conversation } from "@/lib/types";

interface ChatInterfaceProps {
  conversation?: Conversation;
  onConversationUpdate?: (conversation: Conversation) => void;
}

export function ChatInterface({
  conversation,
  onConversationUpdate,
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI SDK v5 pattern: manage input state manually, use append or sendMessage
  const [input, setInput] = useState("");
  const chatHook = useChat({
    api: "/api/chat",
    streamProtocol: "text", // Match backend toTextStreamResponse()
    body: {
      conversationId: conversation?.id,
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
          console.error("Failed to update conversation:", error);
        }
      }
    },
    onError: (error) => {
      console.error("Chat streaming error:", error);
    },
  });

  // Destructure the hook result (append is the correct function in v1.0.0)
  const { messages, isLoading, error, append } = chatHook;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const messageContent = input.trim();
    setInput(""); // Clear input immediately (v5 pattern)

    // Send message immediately - no blocking conversation creation
    append({ role: "user", content: messageContent });

    // Create conversation in background for authenticated users (non-blocking)
    if (!conversation && user) {
      // Don't await - let this happen in background
      fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstMessage: messageContent }),
      })
        .then(async (response) => {
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
        .catch((error) => {
          console.error("Failed to create conversation:", error);
        });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(e);
    }
  };

  const isGuest = !user;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Card className="max-w-2xl mx-auto border-0 shadow-none bg-transparent">
                <CardContent className="flex flex-col items-center text-center space-y-6 py-12">
                  {/* David's Profile Image */}
                  <Avatar className="w-32 h-32 border-4 border-border shadow-lg">
                    <AvatarImage
                      src="/David_pic_128.jpg"
                      alt="David Fattal"
                      className="object-cover"
                    />
                    <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      DF
                    </AvatarFallback>
                  </Avatar>

                  {/* Welcome Section */}
                  <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">
                      Welcome to David-GPT
                    </h1>

                    <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                      I&apos;m David Fattal, a technology entrepreneur and
                      Spatial AI enthusiast. Ask me anything about AI, Immersive
                      Tech, or just chat!
                    </p>

                    <Separator className="my-6" />

                    <p className="text-sm text-muted-foreground">
                      {isGuest
                        ? "You&apos;re browsing as a guest with limited corpus access. Start a conversation below."
                        : "Start a conversation by typing a message below."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-6 py-6 px-4 max-w-4xl mx-auto">
              {messages
                .filter(
                  (message) =>
                    message.role === "user" || message.role === "assistant"
                )
                .map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={{
                      id: message.id,
                      role: message.role as "user" | "assistant",
                      content: message.content,
                      created_at: message.createdAt?.toISOString(),
                    }}
                    user={user}
                  />
                ))}

              {isLoading && (
                <div className="flex items-center justify-center space-x-3 py-4">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src="/David_pic_128.jpg" alt="David Fattal" />
                    <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      DF
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    </div>
                    <span className="text-sm">David is thinking...</span>
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
        <div className="max-w-4xl mx-auto p-4">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-end space-x-3"
          >
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Start a new conversation with David..."
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
            <span className="font-medium">David-GPT • Powered by GPT-4</span>
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
