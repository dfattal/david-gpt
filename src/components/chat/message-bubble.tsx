"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";
import { parseCitations } from "@/lib/rag/citations/parser";
import { CitationsList } from "./citations-list";

// Import KaTeX CSS
import "katex/dist/katex.min.css";

interface MessageBubbleProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at?: string;
  };
  user?: User | null;
  isStreaming?: boolean;
  citationMetadata?: Map<string, { sourceUrl?: string; docTitle?: string }>;
}

export const MessageBubble = React.memo(
  function MessageBubble({
    message,
    user,
    isStreaming = false,
    citationMetadata,
  }: MessageBubbleProps) {
    const isUser = message.role === "user";

    // Parse citations for assistant messages
    const parsedContent = React.useMemo(() => {
      if (isUser || !message.content) {
        return { content: message.content, citations: [] };
      }

      return parseCitations(message.content, citationMetadata);
    }, [message.content, isUser, citationMetadata]);

    const textContent = parsedContent.content;

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
              <div className="text-sm leading-relaxed break-words prose prose-sm prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  onError={(error) => console.error('ReactMarkdown error:', error)}
                >
                  {textContent}
                </ReactMarkdown>
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

            <div
              className="prose prose-sm max-w-none break-words text-foreground
              prose-strong:text-foreground prose-strong:font-semibold
              prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border
              prose-p:leading-relaxed prose-p:mb-3 prose-p:text-sm
              prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:my-4
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-table:text-sm"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                onError={(error) => console.error('ReactMarkdown error:', error)}
                components={{
                  // Custom components for better styling
                  // Enhanced headings with proper styling
                  h2({ children, ...props }) {
                    return (
                      <h2
                        className="text-lg font-semibold mt-6 mb-4 pb-2 border-b border-border first:mt-0 text-foreground"
                        {...props}
                      >
                        {children}
                      </h2>
                    );
                  },
                  h3({ children, ...props }) {
                    return (
                      <h3
                        className="text-lg font-bold mt-6 mb-4 first:mt-0 text-foreground"
                        {...props}
                      >
                        {children}
                      </h3>
                    );
                  },
                  // Enhanced list components for proper formatting
                  ul({ children, ...props }) {
                    return (
                      <ul
                        className="list-disc list-outside mb-4 space-y-2 pl-6 ml-0"
                        {...props}
                      >
                        {children}
                      </ul>
                    );
                  },
                  ol({ children, ...props }) {
                    return (
                      <ol
                        className="list-decimal list-outside mb-4 space-y-2 pl-6 ml-0"
                        {...props}
                      >
                        {children}
                      </ol>
                    );
                  },
                  li({ children, ...props }) {
                    return (
                      <li
                        className="text-sm leading-relaxed text-foreground"
                        {...props}
                      >
                        {children}
                      </li>
                    );
                  },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <Card className="my-4 overflow-hidden border border-border bg-zinc-950 dark:bg-zinc-900">
                        <CardContent className="p-0">
                          <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
                            <code className={`${className} font-mono text-zinc-100`} {...props}>
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

            {/* Citations list for assistant messages with citations */}
            {!isStreaming && parsedContent.citations.length > 0 && (
              <CitationsList citations={parsedContent.citations} />
            )}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if message content, streaming state, citation metadata, or user changes
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.user?.id === nextProps.user?.id &&
      prevProps.citationMetadata === nextProps.citationMetadata
    );
  }
);
