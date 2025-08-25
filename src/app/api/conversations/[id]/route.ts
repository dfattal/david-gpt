import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// export const runtime = 'edge' // Disabled due to cookie handling issues

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/conversations/[id] - Rename conversation
export async function PATCH(
  request: NextRequest, 
  { params }: RouteParams
): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title } = body
    const { id } = await params

    if (!title || typeof title !== 'string') {
      return Response.json({ error: 'title is required and must be a string' }, { status: 400 })
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', id)
      .eq('owner', user.id)
      .select('id, title')
      .single()

    if (error) {
      console.error('Failed to update conversation:', error)
      return Response.json({ error: 'Failed to update conversation' }, { status: 500 })
    }

    return Response.json(conversation)

  } catch (error) {
    console.error('Conversation PATCH API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/conversations/[id] - Soft delete conversation
export async function DELETE(
  request: NextRequest, 
  { params }: RouteParams
): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    
    // First verify the conversation exists and belongs to the user
    const { data: existingConversation, error: fetchError } = await supabase
      .from('conversations')
      .select('id, owner, title')
      .eq('id', id)
      .eq('owner', user.id)
      .single()

    if (fetchError || !existingConversation) {
      return Response.json({ error: 'Conversation not found or unauthorized' }, { status: 404 })
    }
    
    // Use database function to avoid Supabase client RLS conflicts
    const { error } = await supabase
      .rpc('soft_delete_conversation', {
        conversation_id: id,
        user_id: user.id
      })

    if (error) {
      console.error('Failed to delete conversation:', error)
      return Response.json({ error: 'Failed to delete conversation' }, { status: 500 })
    }

    return Response.json({ success: true })

  } catch (error) {
    console.error('Conversation DELETE API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
