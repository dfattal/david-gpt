import { NextRequest, NextResponse } from 'next/server';
import { createOptimizedAdminClient } from '@/lib/supabase/server';
import type { PersonaOption } from '@/components/chat/persona-selector';

export async function GET(request: NextRequest) {
  try {
    const supabase = createOptimizedAdminClient();

    // Use the optimized database function to get all active personas with stats in one query
    const { data: personasData, error } = await supabase.rpc(
      'get_active_personas_with_stats'
    );

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        {
          error: 'Failed to load active personas',
          details: error.message,
        },
        { status: 500 }
      );
    }

    // Transform the database result to match the PersonaOption interface
    const personasWithStats: PersonaOption[] = personasData.map(
      (persona: any) => ({
        persona_id: persona.persona_id,
        name: persona.name,
        description: persona.description,
        expertise_domains: persona.expertise_domains || [],
        avatar_url: persona.avatar_url,
        is_active: persona.is_active,
        stats: {
          conversations: Number(persona.conversations),
          documents: Number(persona.documents),
          last_active: persona.last_active,
        },
      })
    );

    return NextResponse.json({
      success: true,
      personas: personasWithStats,
      total: personasWithStats.length,
    });
  } catch (error) {
    console.error('Error in personas/active endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
