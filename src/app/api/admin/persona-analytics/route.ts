import { NextRequest, NextResponse } from 'next/server';
import { createOptimizedAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createOptimizedAdminClient();

    // Use the optimized database function to get all analytics
    const { data: analyticsData, error } = await supabase.rpc(
      'get_persona_analytics'
    );

    if (error) {
      console.error('Database error loading persona analytics:', error);
      return NextResponse.json(
        {
          error: 'Failed to load persona analytics',
          details: error.message,
        },
        { status: 500 }
      );
    }

    // Transform the data to match the expected interface
    const analytics = analyticsData.map((data: any) => ({
      persona_id: data.persona_identifier, // Use the text identifier
      conversations: Number(data.conversations),
      total_messages: Number(data.total_messages),
      documents: Number(data.documents),
      kg_entities: Number(data.kg_entities),
      kg_relationships: Number(data.kg_relationships),
      avg_rating: 0, // TODO: Implement rating system
      last_active: data.last_active,
      weekly_conversations: Number(data.weekly_conversations),
      monthly_conversations: Number(data.monthly_conversations),
    }));

    return NextResponse.json({
      success: true,
      analytics,
      total: analytics.length,
    });
  } catch (error) {
    console.error('Error in admin/persona-analytics endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
