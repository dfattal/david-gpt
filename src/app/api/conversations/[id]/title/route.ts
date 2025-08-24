import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { DAVID_FATTAL_TITLE_PROMPT } from '@/lib/title-generation'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Using the David Fattal-specific title prompt from title-generation.ts

// POST /api/conversations/[id]/title - Generate smart title from first exchange
export async function POST(
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
    
    // Fetch the first few messages from this conversation
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, parts')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(4) // First user message + assistant response should be enough

    if (messagesError) {
      console.error('Failed to fetch messages for title generation:', messagesError)
      return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No messages found for title generation' }, { status: 400 })
    }

    // Build conversation context for title generation
    const conversationContext = messages
      .map(msg => {
        const textContent = msg.parts
          .filter((part: { type: string; text?: string }) => part.type === 'text')
          .map((part: { text?: string }) => part.text || '')
          .join(' ')
        return `${msg.role}: ${textContent}`
      })
      .join('\n\n')

    // Generate title using AI with David Fattal-specific prompt
    const result = await streamText({
      model: openai('gpt-4o'),
      system: DAVID_FATTAL_TITLE_PROMPT,
      messages: [{ role: 'user' as const, content: conversationContext }],
      temperature: 0.2 // Very low temperature for consistent, focused titles
    })

    let generatedTitle = ''
    for await (const chunk of result.textStream) {
      generatedTitle += chunk
    }

    // Clean up the generated title
    generatedTitle = generatedTitle.trim().replace(/["'`]/g, '')
    
    // Additional cleanup for common AI output issues
    generatedTitle = generatedTitle.replace(/^Title:\s*/i, '')
    generatedTitle = generatedTitle.replace(/\.$/, '') // Remove trailing period
    
    // Validate title length and content
    const wordCount = generatedTitle.split(/\s+/).filter(word => word.length > 0).length
    if (wordCount < 2 || wordCount > 8 || generatedTitle.length < 5) {
      generatedTitle = 'New Chat'
    }
    
    // Ensure title doesn't exceed reasonable length
    if (generatedTitle.length > 50) {
      generatedTitle = generatedTitle.substring(0, 50).trim()
    }

    // Update conversation with the generated title
    const { data: conversation, error: updateError } = await supabase
      .from('conversations')
      .update({ 
        title: generatedTitle,
        title_status: 'ready'
      })
      .eq('id', id)
      .select('id, title')
      .single()

    if (updateError) {
      console.error('Failed to update conversation title:', updateError)
      // Mark title generation as failed
      await supabase
        .from('conversations')
        .update({ title_status: 'error' })
        .eq('id', id)
      
      return Response.json({ error: 'Failed to update conversation title' }, { status: 500 })
    }

    return Response.json(conversation)

  } catch (error) {
    console.error('Title generation API error:', error)
    
    // Mark title generation as failed with specific error handling
    try {
      const supabaseError = await createClient()
      const { id: errorId } = await params
      
      // Different error handling based on error type
      let errorStatus = 'error'
      if (error instanceof Error) {
        if (error.message.includes('rate limit') || error.message.includes('quota')) {
          // For rate limits, we might retry later
          errorStatus = 'pending'
        } else if (error.message.includes('authentication')) {
          errorStatus = 'error'
        }
      }
      
      await supabaseError
        .from('conversations')
        .update({ title_status: errorStatus })
        .eq('id', errorId)
    } catch (cleanupError) {
      console.warn('Failed to update error status:', cleanupError)
    }
    
    // Return appropriate error response
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        return Response.json({ error: 'Rate limit exceeded. Title generation will retry automatically.' }, { status: 429 })
      }
      if (error.message.includes('authentication')) {
        return Response.json({ error: 'AI service authentication failed' }, { status: 401 })
      }
    }
    
    return Response.json({ error: 'Title generation failed' }, { status: 500 })
  }
}
