/**
 * Admin Analytics API
 * Returns per-persona analytics data for RAG quality insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get persona_slug from query params
    const { searchParams } = new URL(request.url);
    const personaSlug = searchParams.get('persona_slug');

    if (!personaSlug) {
      return NextResponse.json(
        { success: false, error: 'persona_slug query parameter is required' },
        { status: 400 }
      );
    }

    // Get persona ID
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('id, slug, name, expertise, content, config_json')
      .eq('slug', personaSlug)
      .single();

    if (personaError || !persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Get persona statistics
    const { data: statsData, error: statsError } = await supabase.rpc('get_persona_analytics_stats', {
      p_persona_id: persona.id,
    });

    // If RPC doesn't exist, fall back to manual query
    let stats;
    if (statsError) {
      console.warn('RPC get_persona_analytics_stats not found, using fallback query');

      const { data: conversations } = await supabase
        .from('conversations')
        .select(`
          id,
          messages!inner (
            id,
            role,
            rag_weight,
            message_citations (id)
          )
        `)
        .eq('persona_id', persona.id);

      if (conversations) {
        const allMessages = conversations.flatMap((c: any) => c.messages || []);
        const assistantMessages = allMessages.filter((m: any) => m.role === 'assistant');
        const ragWeights = assistantMessages.map((m: any) => m.rag_weight).filter((w: any) => w !== null);
        const citationCounts = assistantMessages.map((m: any) => m.message_citations?.length || 0);

        stats = {
          total_conversations: conversations.length,
          avg_rag_weight: ragWeights.length > 0
            ? ragWeights.reduce((sum: number, w: number) => sum + w, 0) / ragWeights.length
            : null,
          total_citations: citationCounts.reduce((sum: number, c: number) => sum + c, 0),
          low_rag_messages: ragWeights.filter((w: number) => w < 0.4).length,
          total_assistant_messages: assistantMessages.length,
        };
      } else {
        stats = {
          total_conversations: 0,
          avg_rag_weight: null,
          total_citations: 0,
          low_rag_messages: 0,
          total_assistant_messages: 0,
        };
      }
    } else {
      stats = statsData;
    }

    // Get low RAG weight conversations
    const { data: lowRagConversations, error: conversationsError } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        created_at,
        messages (
          id,
          role,
          content,
          rag_weight,
          created_at,
          message_citations (id)
        )
      `)
      .eq('persona_id', persona.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (conversationsError) {
      console.error('Error fetching conversations:', conversationsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }

    // Filter conversations that have at least one low RAG weight message
    const filteredConversations = (lowRagConversations || [])
      .map((conv: any) => {
        const messages = conv.messages || [];
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        const ragWeights = assistantMessages
          .map((m: any) => m.rag_weight)
          .filter((w: any) => w !== null);

        const avgRagWeight = ragWeights.length > 0
          ? ragWeights.reduce((sum: number, w: number) => sum + w, 0) / ragWeights.length
          : null;

        const totalCitations = assistantMessages.reduce(
          (sum: number, m: any) => sum + (m.message_citations?.length || 0),
          0
        );

        const hasLowRagWeight = ragWeights.some((w: number) => w < 0.4);

        return {
          id: conv.id,
          title: conv.title,
          created_at: conv.created_at,
          messages: messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            rag_weight: m.rag_weight,
            created_at: m.created_at,
            citation_count: m.message_citations?.length || 0,
          })),
          avg_rag_weight: avgRagWeight,
          total_citations: totalCitations,
          has_low_rag_weight: hasLowRagWeight,
        };
      })
      .filter((conv: any) => conv.has_low_rag_weight)
      .sort((a: any, b: any) => {
        // Sort by avg_rag_weight ascending (lowest first)
        if (a.avg_rag_weight === null && b.avg_rag_weight === null) return 0;
        if (a.avg_rag_weight === null) return 1;
        if (b.avg_rag_weight === null) return -1;
        return a.avg_rag_weight - b.avg_rag_weight;
      })
      .slice(0, 50);

    // Get document count and types for persona
    // Use filter with cs (contains) operator for JSONB array matching
    const { data: docs, error: docsError } = await supabase
      .from('docs')
      .select('id, type')
      .filter('personas', 'cs', JSON.stringify([personaSlug]));

    if (docsError) {
      console.error('Error fetching documents for persona:', docsError);
    }

    console.log(`📚 Found ${docs?.length || 0} documents for persona ${personaSlug}`);

    const documentStats = {
      count: docs?.length || 0,
      types: [...new Set(docs?.map((d: any) => d.type) || [])],
    };

    return NextResponse.json({
      success: true,
      data: {
        persona: {
          slug: persona.slug,
          name: persona.name,
          expertise: persona.expertise,
          content: persona.content,
          config_json: persona.config_json,
        },
        stats: {
          total_conversations: stats.total_conversations || 0,
          avg_rag_weight: stats.avg_rag_weight,
          total_citations: stats.total_citations || 0,
          low_rag_messages: stats.low_rag_messages || 0,
          total_assistant_messages: stats.total_assistant_messages || 0,
          citation_rate: stats.total_assistant_messages > 0
            ? (stats.total_citations / stats.total_assistant_messages) * 100
            : 0,
        },
        conversations: filteredConversations,
        documents: documentStats,
      },
    });
  } catch (error) {
    console.error('Error in analytics API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
