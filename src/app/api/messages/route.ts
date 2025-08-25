import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// export const runtime = 'edge' // Disabled due to cookie handling issues

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 })
    }

    // Fetch messages for the conversation (RLS will ensure user owns the conversation)
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch messages:', error)
      return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return Response.json({ messages })

  } catch (error) {
    console.error('Messages API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
