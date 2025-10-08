import { useEffect, useRef, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface UseSSEProps {
  user: User | null;
  onTitleUpdate: (conversationId: string, title: string) => void;
  fetchConversations: () => void;
}

export function useSSE({
  user,
  onTitleUpdate,
  fetchConversations,
}: UseSSEProps) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);

  // Use a ref to hold the fetchConversations function to avoid stale closures
  const fetchConversationsRef = useRef(fetchConversations);
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  const setupSSEConnection = useCallback(() => {
    if (!user) {
      console.log("⏭️ Skipping SSE setup - no user authenticated");
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      isConnectedRef.current = false;
    }

    console.log(
      `🔗 Setting up SSE connection for user: ${user.id} (Development resilient)`
    );

    const eventSource = new EventSource("/api/conversations/title-updates", {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("✅ SSE connection established successfully");
      isConnectedRef.current = true;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📡 Received SSE event:", data);

        if (data.type === "title-update") {
          console.log(
            `🏷️ Received title update for conversation ${data.conversationId}: "${data.title}"`
          );
          onTitleUpdate(data.conversationId, data.title);
        } else if (data.type === "connected") {
          console.log(`🤝 SSE connection confirmed for user: ${data.userId}`);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ SSE connection error:", error);
      console.error("📊 EventSource readyState:", eventSource.readyState);

      isConnectedRef.current = false;

      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("🔄 SSE connection closed, setting up fallback");

        const fallbackInterval = setInterval(() => {
          console.log(
            "🔄 Fallback: Refreshing conversations for title updates"
          );
          // Use the ref to get the latest fetchConversations function
          if (fetchConversationsRef.current) {
            fetchConversationsRef.current();
          }
        }, 5000);

        (eventSource as any)._fallbackInterval = fallbackInterval;

        if (process.env.NODE_ENV === "development") {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Attempting SSE reconnection...");
            setupSSEConnection();
          }, 3000);
        }
      }
    };

    return eventSource;
  }, [user, onTitleUpdate]); // fetchConversations is removed from dependencies

  const cleanup = useCallback(() => {
    console.log("🧹 Cleaning up SSE connection");

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      if ((eventSourceRef.current as any)._fallbackInterval) {
        clearInterval((eventSourceRef.current as any)._fallbackInterval);
      }

      eventSourceRef.current.close();
      eventSourceRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      cleanup();
      return;
    }

    // Increase delay to ensure auth session is properly established on server
    const setupTimeout = setTimeout(() => {
      setupSSEConnection();
    }, 500);

    return () => {
      clearTimeout(setupTimeout);
      cleanup();
    };
  }, [user?.id, setupSSEConnection]); // Dependency on setupSSEConnection

  return {
    isConnected: isConnectedRef.current,
    reconnect: setupSSEConnection,
    cleanup,
  };
}
