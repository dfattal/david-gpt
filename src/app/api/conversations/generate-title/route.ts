import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { generateConversationTitle } from '@/lib/title-generation';

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const { conversationId, firstMessage } = await req.json();

    if (!conversationId || !firstMessage) {
      return NextResponse.json(
        { error: 'Conversation ID and first message are required' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Verify the conversation belongs to the user
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (conversationError || !conversation) {
      throw new AppError('Conversation not found', 404);
    }

    // Use the shared title generation function
    const result = await generateConversationTitle(
      conversationId,
      firstMessage,
      user.id
    );

    if (!result.success) {
      throw new AppError(result.error || 'Title generation failed', 500);
    }

    return NextResponse.json({
      success: true,
      title: result.title,
      conversationId,
    });
  } catch (error) {
    console.error('Title generation error:', error);
    return handleApiError(error);
  }
}
