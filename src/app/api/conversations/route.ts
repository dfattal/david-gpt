import { createClient } from '@/lib/supabase/server'

// export const runtime = 'edge' // Disabled due to cookie handling issues

// GET /api/conversations - List user's conversations
export async function GET(): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's conversations (RLS will filter by owner automatically)
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch conversations:', error)
      return Response.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    return Response.json({ conversations })

  } catch (error) {
    console.error('Conversations API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/conversations - Create new conversation
export async function POST(): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        title: 'New chat',
        title_status: 'pending',
        owner: user.id
      })
      .select('id, title, title_status, created_at, updated_at')
      .single()

    if (error) {
      console.error('Failed to create conversation:', error)
      return Response.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    return Response.json(conversation)

  } catch (error) {
    console.error('Conversations POST API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
