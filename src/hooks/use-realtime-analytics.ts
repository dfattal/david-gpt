import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';

interface RealtimeAnalytics {
  totalPersonas: number;
  activePersonas: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  activeUsers: number;
  messagesLastHour: number;
  conversationsToday: number;
  documentsThisWeek: number;
  systemHealth: 'healthy' | 'degraded' | 'down';
  lastUpdated: string;
}

interface PersonaActivity {
  persona_id: string;
  name: string;
  conversations_last_hour: number;
  messages_last_hour: number;
  active_users: number;
  avg_response_time: number;
  status: 'active' | 'idle' | 'busy';
}

const ANALYTICS_QUERY_KEY = ['realtime-analytics'];
const PERSONA_ACTIVITY_QUERY_KEY = ['persona-activity'];

export function useRealtimeAnalytics() {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Main analytics data with aggressive refetching
  const analyticsQuery = useQuery({
    queryKey: ANALYTICS_QUERY_KEY,
    queryFn: async (): Promise<RealtimeAnalytics> => {
      const response = await fetch('/api/admin/realtime-analytics');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale
  });

  // Persona activity data
  const personaActivityQuery = useQuery({
    queryKey: PERSONA_ACTIVITY_QUERY_KEY,
    queryFn: async (): Promise<PersonaActivity[]> => {
      const response = await fetch('/api/admin/persona-activity');
      if (!response.ok) {
        throw new Error('Failed to fetch persona activity');
      }
      return response.json();
    },
    refetchInterval: 3000, // More frequent for activity data
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Server-Sent Events for real-time updates (optional enhancement)
  useEffect(() => {
    if (!window.EventSource) return;

    const connectSSE = () => {
      try {
        const eventSource = new EventSource('/api/admin/analytics-stream');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          console.log('📡 Real-time analytics connected');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'analytics') {
              // Update analytics cache with new data
              analyticsQuery.refetch();
            } else if (data.type === 'persona-activity') {
              // Update persona activity cache
              personaActivityQuery.refetch();
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          setIsConnected(false);
          eventSource.close();

          // Reconnect after 5 seconds
          setTimeout(connectSSE, 5000);
        };

      } catch (error) {
        console.error('Failed to establish SSE connection:', error);
        setIsConnected(false);
      }
    };

    // Only connect SSE in production or when explicitly enabled
    const enableSSE = process.env.NODE_ENV === 'production' ||
                     process.env.NEXT_PUBLIC_ENABLE_SSE === 'true';

    if (enableSSE) {
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, []);

  // Manual refresh function
  const refresh = () => {
    analyticsQuery.refetch();
    personaActivityQuery.refetch();
  };

  return {
    analytics: analyticsQuery.data,
    personaActivity: personaActivityQuery.data || [],
    isLoading: analyticsQuery.isLoading || personaActivityQuery.isLoading,
    error: analyticsQuery.error || personaActivityQuery.error,
    isConnected,
    refresh,
    lastUpdated: analyticsQuery.dataUpdatedAt,
  };
}