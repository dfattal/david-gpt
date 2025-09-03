"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";

interface MessageBubbleProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at?: string;
  };
  user?: User | null;
  isStreaming?: boolean;
}

export const MessageBubble = React.memo(
  function MessageBubble({
    message,
    user,
    isStreaming = false,
  }: MessageBubbleProps) {
    const isUser = message.role === "user";
    const textContent = message.content;

    if (isUser) {
      // Get user profile information for avatar
      const googleIdentity = user?.identities?.find(
        (identity) => identity.provider === "google"
      );
      const avatarUrl =
        user?.user_metadata?.avatar_url ||
        user?.user_metadata?.picture ||
        googleIdentity?.identity_data?.picture;
      const fullName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        googleIdentity?.identity_data?.name;
      const fallbackInitials = fullName
        ? fullName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || "U";

      // User messages: right-aligned with compact styling
      return (
        <div className="flex w-full justify-end mb-4">
          <div className="flex items-start space-x-3 max-w-[80%]">
            <div className="bg-primary text-primary-foreground rounded-lg shadow-sm px-3 py-2">
              <div className="text-sm leading-relaxed break-words">
                {textContent}
              </div>
            </div>
            <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt={fullName || user?.email || "User"}
                  className="object-cover"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.retried) {
                      img.dataset.retried = "true";
                      img.crossOrigin = "";
                      img.referrerPolicy = "";
                      img.src = avatarUrl;
                      return;
                    }
                    img.style.display = "none";
                    const fallback = img.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "block";
                  }}
                />
              ) : null}
              <AvatarFallback
                className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-medium"
                style={{ display: avatarUrl ? "none" : "block" }}
              >
                {fallbackInitials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      );
    }

    // Assistant messages: left-aligned with David's avatar and clean styling
    return (
      <div className="flex w-full mb-6">
        <div className="flex items-start space-x-4 w-full">
          <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm shrink-0 mt-1">
            <AvatarImage
              src="/David_pic_128.jpg"
              alt="David Fattal"
              className="object-cover"
            />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-medium">
              DF
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <span className="text-sm font-medium text-foreground">
                David Fattal
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                AI Assistant
              </span>
            </div>

            <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-p:leading-relaxed prose-p:mb-3 prose-ul:mb-3 prose-ol:mb-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom components for better styling
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <Card className="my-3 border bg-muted/30">
                        <CardContent className="p-4">
                          <pre className="overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        </CardContent>
                      </Card>
                    ) : (
                      <code
                        className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  // Enhanced links with better styling
                  a({ href, children, ...props }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  // Better table styling with Card component
                  table({ children, ...props }) {
                    return (
                      <Card className="my-4 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full" {...props}>
                            {children}
                          </table>
                        </div>
                      </Card>
                    );
                  },
                  th({ children, ...props }) {
                    return (
                      <th
                        className="border-b px-4 py-3 bg-muted/50 font-medium text-left text-sm"
                        {...props}
                      >
                        {children}
                      </th>
                    );
                  },
                  td({ children, ...props }) {
                    return (
                      <td className="border-b px-4 py-3 text-sm" {...props}>
                        {children}
                      </td>
                    );
                  },
                  // Enhanced blockquotes
                  blockquote({ children, ...props }) {
                    return (
                      <Card className="my-4 border-l-4 border-l-primary bg-muted/20">
                        <CardContent className="py-3 px-4">
                          <blockquote className="text-sm italic" {...props}>
                            {children}
                          </blockquote>
                        </CardContent>
                      </Card>
                    );
                  },
                }}
              >
                {textContent}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 ml-1 bg-current animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if message content, streaming state, or user changes
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.user?.id === nextProps.user?.id
    );
  }
);
