import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

    // Get real-time analytics data using database functions for optimal performance
    const [
      personasResult,
      conversationsResult,
      messagesResult,
      documentsResult,
      recentActivityResult
    ] = await Promise.all([
      // Total and active personas
      supabase.rpc('get_persona_counts'),

      // Conversation metrics
      supabase.rpc('get_conversation_metrics'),

      // Message metrics
      supabase.rpc('get_message_metrics'),

      // Document metrics
      supabase.rpc('get_document_metrics'),

      // Recent activity metrics
      supabase.rpc('get_recent_activity_metrics')
    ]);

    // Construct response
    const analytics = {
      totalPersonas: personasResult.data?.[0]?.total_personas || 0,
      activePersonas: personasResult.data?.[0]?.active_personas || 0,
      totalConversations: conversationsResult.data?.[0]?.total_conversations || 0,
      totalMessages: messagesResult.data?.[0]?.total_messages || 0,
      totalDocuments: documentsResult.data?.[0]?.total_documents || 0,
      activeUsers: recentActivityResult.data?.[0]?.active_users_today || 0,
      messagesLastHour: messagesResult.data?.[0]?.messages_last_hour || 0,
      conversationsToday: conversationsResult.data?.[0]?.conversations_today || 0,
      documentsThisWeek: documentsResult.data?.[0]?.documents_this_week || 0,
      systemHealth: determineSystemHealth(
        messagesResult.data?.[0]?.avg_response_time || 0,
        recentActivityResult.data?.[0]?.error_rate || 0
      ),
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('❌ Realtime analytics error:', error);
    return handleApiError(error);
  }
}

function determineSystemHealth(avgResponseTime: number, errorRate: number): 'healthy' | 'degraded' | 'down' {
  if (errorRate > 0.1 || avgResponseTime > 10000) {
    return 'down';
  } else if (errorRate > 0.05 || avgResponseTime > 5000) {
    return 'degraded';
  }
  return 'healthy';
}