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

    // Get persona activity data
    const { data: activityData, error: activityError } = await supabase
      .rpc('get_persona_activity_realtime');

    if (activityError) {
      throw new AppError('Failed to fetch persona activity', 500);
    }

    // Transform the data to include status determination
    const personaActivity = (activityData || []).map((persona: any) => ({
      persona_id: persona.persona_id,
      name: persona.name || persona.persona_id,
      conversations_last_hour: persona.conversations_last_hour || 0,
      messages_last_hour: persona.messages_last_hour || 0,
      active_users: persona.active_users || 0,
      avg_response_time: persona.avg_response_time || 0,
      status: determinePersonaStatus(
        persona.conversations_last_hour || 0,
        persona.messages_last_hour || 0,
        persona.avg_response_time || 0
      ),
    }));

    return NextResponse.json(personaActivity, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('❌ Persona activity error:', error);
    return handleApiError(error);
  }
}

function determinePersonaStatus(
  conversationsLastHour: number,
  messagesLastHour: number,
  avgResponseTime: number
): 'active' | 'idle' | 'busy' {
  if (conversationsLastHour === 0 && messagesLastHour === 0) {
    return 'idle';
  } else if (conversationsLastHour > 10 || messagesLastHour > 50 || avgResponseTime > 5000) {
    return 'busy';
  }
  return 'active';
}