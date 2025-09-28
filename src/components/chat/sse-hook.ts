import { useEffect, useRef, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Conversation } from '@/lib/types';

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

  const setupSSEConnection = useCallback(() => {
    if (!user) {
      console.log('⏭️ Skipping SSE setup - no user authenticated');
      return;
    }

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      isConnectedRef.current = false;
    }

    console.log(
      `🔗 Setting up SSE connection for user: ${user.id} (Development resilient)`
    );

    const eventSource = new EventSource('/api/conversations/title-updates', {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('✅ SSE connection established successfully');
      isConnectedRef.current = true;
    };

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        console.log('📡 Received SSE event:', data);

        if (data.type === 'title-update') {
          console.log(
            `🏷️ Received title update for conversation ${data.conversationId}: "${data.title}"`
          );
          onTitleUpdate(data.conversationId, data.title);
        } else if (data.type === 'connected') {
          console.log(`🤝 SSE connection confirmed for user: ${data.userId}`);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = error => {
      console.error('❌ SSE connection error:', error);
      console.error('📊 EventSource readyState:', eventSource.readyState);

      isConnectedRef.current = false;

      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔄 SSE connection closed, setting up fallback');

        // Set up fallback polling
        const fallbackInterval = setInterval(() => {
          console.log(
            '🔄 Fallback: Refreshing conversations for title updates'
          );
          fetchConversations();
        }, 5000);

        // Store for cleanup
        (eventSource as any)._fallbackInterval = fallbackInterval;

        // Try to reconnect in development mode
        if (process.env.NODE_ENV === 'development') {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting SSE reconnection...');
            setupSSEConnection();
          }, 3000);
        }
      }
    };

    return eventSource;
  }, [user, onTitleUpdate, fetchConversations]);

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up SSE connection');

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      // Clean up fallback interval if it exists
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

    // Delay setup slightly to handle React Strict Mode double invocation
    const setupTimeout = setTimeout(() => {
      setupSSEConnection();
    }, 50);

    return () => {
      clearTimeout(setupTimeout);
      cleanup();
    };
  }, [user?.id]); // Only depend on user ID to avoid unnecessary reconnections

  return {
    isConnected: isConnectedRef.current,
    reconnect: setupSSEConnection,
    cleanup,
  };
}
