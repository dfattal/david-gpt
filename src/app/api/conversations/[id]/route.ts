import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

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
    
    const { error } = await supabase
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

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
