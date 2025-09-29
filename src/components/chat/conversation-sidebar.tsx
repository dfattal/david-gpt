"use client";

import * as React from "react";
import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { useSSE } from "./sse-hook";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Plus,
  MessageSquare,
  MoreVertical,
  Trash2,
  Edit,
  Shield,
  Settings,
  LogOut,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import type { Conversation } from "@/lib/types";

interface ConversationSidebarProps {
  currentConversation?: Conversation;
  onConversationSelect: (conversation: Conversation | null) => void;
  onNewConversation: () => void;
}

export interface ConversationSidebarRef {
  refreshConversations: () => void;
  setTitleGenerating: (conversationId: string, isGenerating: boolean) => void;
}

export const ConversationSidebar = forwardRef<
  ConversationSidebarRef,
  ConversationSidebarProps
>(function ConversationSidebar(
  { currentConversation, onConversationSelect, onNewConversation },
  ref
) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState<Set<string>>(
    new Set()
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [renamingIds, setRenamingIds] = useState<Set<string>>(new Set());
  const { addToast } = useToast();
  const editInputRef = useRef<HTMLInputElement>(null);

  const isGuest = !user;

  const fetchConversations = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch("/api/conversations");
      if (response.ok) {
        const { conversations } = await response.json();
        setConversations(conversations);
      } else {
        // Check if it's an authentication error
        if (response.status === 401 || response.status === 403) {
          console.log("Authentication not ready, skipping conversation fetch");
          return;
        }
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }
    } catch (error) {
      // Only show error toast if it's not an auth-related error during page load
      if (
        error instanceof Error &&
        !error.message.includes("401") &&
        !error.message.includes("403")
      ) {
        console.error("Failed to fetch conversations:", error);
        addToast("Failed to load conversations", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  // Expose refresh method to parent
  useImperativeHandle(
    ref,
    () => ({
      refreshConversations: () => {
        fetchConversations();
      },
      setTitleGenerating: (conversationId: string, isGenerating: boolean) => {
        setGeneratingTitles((prev) => {
          const newSet = new Set(prev);
          if (isGenerating) {
            newSet.add(conversationId);
          } else {
            newSet.delete(conversationId);
          }
          return newSet;
        });
      },
    }),
    [fetchConversations]
  );

  useEffect(() => {
    if (user) {
      // Add a small delay to ensure authentication is fully established
      const timer = setTimeout(() => {
        fetchConversations();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [user, fetchConversations]);

  // Handle SSE title updates
  const handleTitleUpdate = useCallback(
    (conversationId: string, title: string) => {
      // Remove from generating titles set
      setGeneratingTitles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(conversationId);
        return newSet;
      });

      setConversations((prev) => {
        const updated = prev.map((conv) =>
          conv.id === conversationId ? { ...conv, title: title } : conv
        );
        console.log(
          `📋 Updated conversations state via SSE, total conversations: ${updated.length}`
        );
        return updated;
      });

      // Show success notification for title generation
      addToast(`Title updated: "${title}"`, "success", 3000);
    },
    [addToast]
  );

  // Set up SSE connection with the new hook
  useSSE({
    user,
    onTitleUpdate: handleTitleUpdate,
    fetchConversations,
  });


  const handleDeleteConversation = async (
    conversation: Conversation,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from local state
        setConversations((prev) =>
          prev.filter((c) => c.id !== conversation.id)
        );

        // If this was the current conversation, start a new chat
        if (currentConversation?.id === conversation.id) {
          onNewConversation();
        }

        addToast("Conversation deleted", "success", 2000);
      } else {
        throw new Error("Failed to delete conversation");
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      addToast("Failed to delete conversation", "error");
    }
  };

  const startRename = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title || "New Chat");
    // Focus the input field after a brief delay to ensure it's rendered
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const saveRename = async (conversationId: string) => {
    const trimmedTitle = editingTitle.trim();

    if (!trimmedTitle) {
      addToast("Title cannot be empty", "error");
      return;
    }

    if (
      trimmedTitle === conversations.find((c) => c.id === conversationId)?.title
    ) {
      // No change, just cancel
      cancelRename();
      return;
    }

    // Add to renaming set
    setRenamingIds((prev) => new Set(prev).add(conversationId));

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      if (response.ok) {
        const { conversation: updatedConversation } = await response.json();

        // Update local state
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, title: updatedConversation.title }
              : c
          )
        );

        addToast("Conversation renamed", "success", 2000);
        cancelRename();
      } else {
        throw new Error("Failed to rename conversation");
      }
    } catch (error) {
      console.error("Failed to rename conversation:", error);
      addToast("Failed to rename conversation", "error");
    } finally {
      // Remove from renaming set
      setRenamingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(conversationId);
        return newSet;
      });
    }
  };

  const handleRenameKeyDown = (
    e: React.KeyboardEvent,
    conversationId: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRename(conversationId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  const handleAdminDashboard = () => {
    router.push('/admin');
  };

  return (
    <div className="w-72 sm:w-80 lg:w-96 border-r bg-background flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 space-y-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">Conversations</h2>
        </div>

        <Button
          onClick={onNewConversation}
          className="w-full justify-start space-x-2"
          variant={!currentConversation ? "default" : "outline"}
          size="sm"
        >
          <Plus className="w-4 h-4" />
          <span>New chat</span>
        </Button>
      </div>

      <Separator className="mx-0" />

      {/* Conversations list */}
      <ScrollArea className="flex-1 px-1">
        {isGuest ? (
          <Card className="m-4 border-dashed">
            <CardContent className="p-6 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium mb-2">
                Sign in to save conversations
              </p>
              <p className="text-xs text-muted-foreground">
                Your chat history will appear here once you&apos;re logged in
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="p-4 text-center">
            <div className="animate-pulse space-y-3">
              <div className="h-12 bg-muted rounded-lg"></div>
              <div className="h-12 bg-muted rounded-lg"></div>
              <div className="h-12 bg-muted rounded-lg"></div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Loading conversations...
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <Card className="m-4 border-dashed">
            <CardContent className="p-6 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium mb-2">No conversations yet</p>
              <p className="text-xs text-muted-foreground">
                Start chatting to see your history here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-0.5 py-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group cursor-pointer transition-all duration-200 hover:bg-muted/50 rounded-lg mx-1 py-2 relative",
                  currentConversation?.id === conversation.id &&
                    "bg-primary/10 text-primary"
                )}
                onClick={() => onConversationSelect(conversation)}
              >
                <div className="flex items-start pr-10">
                  <div className="flex-1 min-w-0 px-3 pr-1">
                    <div className="flex items-center gap-2 mb-1">
                      {editingId === conversation.id ? (
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <Input
                            ref={editInputRef}
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) =>
                              handleRenameKeyDown(e, conversation.id)
                            }
                            className="text-sm h-6 px-2 py-0.5 min-w-0 flex-1"
                            size={editingTitle.length || 20}
                            maxLength={100}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-5 h-5 p-0 text-green-600 hover:text-green-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveRename(conversation.id);
                            }}
                            disabled={renamingIds.has(conversation.id)}
                          >
                            {renamingIds.has(conversation.id) ? (
                              <Spinner size="sm" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-5 h-5 p-0 text-red-600 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelRename();
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium truncate min-w-0 flex-1 overflow-hidden">
                            {conversation.title || "New Chat"}
                          </div>
                          {generatingTitles.has(conversation.id) && (
                            <Spinner size="sm" className="flex-shrink-0" />
                          )}
                        </>
                      )}
                    </div>
                    {editingId !== conversation.id && (
                      <div className="text-xs text-muted-foreground truncate">
                        {formatDate(conversation.last_message_at)}
                      </div>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-3 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-3 h-3" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        className="text-sm"
                        onClick={(e) => startRename(conversation, e)}
                      >
                        <Edit className="w-3 h-3 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-sm text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conversation, e);
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* User Profile Dropdown */}
      {user && (
        <>
          <Separator className="mx-0" />
          <div className="px-4 pt-3 pb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="border-0 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        {(() => {
                          // Try to get avatar from user_metadata first, then from Google identity
                          const googleIdentity = user.identities?.find(
                            (identity) => identity.provider === "google"
                          );
                          const avatarUrl =
                            user.user_metadata?.avatar_url ||
                            user.user_metadata?.picture ||
                            googleIdentity?.identity_data?.picture;

                          return avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={
                                user.user_metadata?.full_name ||
                                user.user_metadata?.name ||
                                googleIdentity?.identity_data?.name ||
                                user.email ||
                                "User"
                              }
                              className="w-full h-full object-cover"
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // Try without CORS attributes on fallback
                                const img = e.currentTarget;
                                if (!img.dataset.retried) {
                                  img.dataset.retried = "true";
                                  img.crossOrigin = "";
                                  img.referrerPolicy = "";
                                  img.src = avatarUrl;
                                  return;
                                }
                                // Hide image and show fallback initials
                                img.style.display = "none";
                                const fallback =
                                  img.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "block";
                              }}
                            />
                          ) : null;
                        })()}
                        <span
                          className="text-xs font-medium text-white"
                          style={{
                            display: (() => {
                              const googleIdentity = user.identities?.find(
                                (identity) => identity.provider === "google"
                              );
                              const hasAvatar =
                                user.user_metadata?.avatar_url ||
                                user.user_metadata?.picture ||
                                googleIdentity?.identity_data?.picture;
                              return hasAvatar ? "none" : "block";
                            })(),
                          }}
                        >
                          {(() => {
                            const googleIdentity = user.identities?.find(
                              (identity) => identity.provider === "google"
                            );
                            const fullName =
                              user.user_metadata?.full_name ||
                              user.user_metadata?.name ||
                              googleIdentity?.identity_data?.name;

                            return fullName
                              ? fullName
                                  .split(" ")
                                  .map((n: string) => n[0])
                                  .join("")
                                  .toUpperCase()
                              : user.email?.charAt(0).toUpperCase() || "U";
                          })()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {(() => {
                            const googleIdentity = user.identities?.find(
                              (identity) => identity.provider === "google"
                            );
                            return (
                              user.user_metadata?.full_name ||
                              user.user_metadata?.name ||
                              googleIdentity?.identity_data?.name ||
                              user.email?.split("@")[0] ||
                              "User"
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                side="top"
                className="w-64 mb-2"
                sideOffset={8}
              >
                {/* User Info Header */}
                <div className="px-3 py-2 border-b">
                  {(() => {
                    const googleIdentity = user.identities?.find(
                      (identity) => identity.provider === "google"
                    );
                    const fullName =
                      user.user_metadata?.full_name ||
                      user.user_metadata?.name ||
                      googleIdentity?.identity_data?.name;

                    return fullName ? (
                      <p className="text-sm font-medium truncate">{fullName}</p>
                    ) : null;
                  })()}
                  <p
                    className={`text-sm text-muted-foreground truncate ${(() => {
                      const googleIdentity = user.identities?.find(
                        (identity) => identity.provider === "google"
                      );
                      const hasFullName =
                        user.user_metadata?.full_name ||
                        user.user_metadata?.name ||
                        googleIdentity?.identity_data?.name;
                      return hasFullName ? "mt-1" : "";
                    })()}`}
                  >
                    {user.email}
                  </p>
                </div>

                {/* Menu Items */}
                <DropdownMenuItem 
                  className="flex items-center space-x-3 py-3 cursor-pointer"
                  onClick={handleAdminDashboard}
                >
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Admin Dashboard</span>
                </DropdownMenuItem>

                <DropdownMenuItem className="flex items-center space-x-3 py-3 cursor-pointer">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Settings</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="flex items-center space-x-3 py-3 cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => signOut()}
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </div>
  );
});
