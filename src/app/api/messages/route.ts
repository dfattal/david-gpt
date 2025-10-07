import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AppError, handleApiError } from '@/lib/utils'
import { saveCitations, CitationMetadata } from '@/lib/rag/citations/saveCitations'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError('Authentication required', 401)
    }

    const {
      conversationId,
      role,
      content,
      turnType,
      responseMode,
      citationMetadata
    }: {
      conversationId: string
      role: 'user' | 'assistant'
      content: string
      turnType?: 'new-topic' | 'drill-down' | 'compare' | 'same-sources'
      responseMode?: 'FACT' | 'EXPLAIN' | 'CONFLICTS'
      citationMetadata?: CitationMetadata[]
    } = await req.json()

    if (!conversationId || !role || !content?.trim()) {
      throw new AppError('Missing required fields', 400)
    }

    // Verify user owns the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      throw new AppError('Conversation not found', 404)
    }

    // Create the message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role,
        content: content.trim(),
        turn_type: turnType || null,
        response_mode: responseMode || null,
        metadata: citationMetadata && citationMetadata.length > 0
          ? { citationMetadata }
          : {}
      })
      .select()
      .single()

    if (msgError) {
      console.error('Failed to create message:', msgError)
      throw new AppError('Failed to create message', 500)
    }

    // Update conversation's last message time
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)

    // Save citations if this is an assistant message with citation metadata
    if (role === 'assistant' && citationMetadata && citationMetadata.length > 0) {
      console.log(`💾 Saving citations for message ${message.id}, metadata count: ${citationMetadata.length}`);
      await saveCitations(message.id, content, citationMetadata, supabase);
    } else if (role === 'assistant') {
      console.log(`ℹ️ No citation metadata for assistant message ${message.id}`);
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}