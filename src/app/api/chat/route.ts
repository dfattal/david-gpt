import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { type UIMessage } from '@/lib/supabase'
import { DAVID_FATTAL_SYSTEM_PROMPT } from '@/lib/persona'
import { triggerTitleGeneration } from '@/lib/title-generation'
import { trackDatabaseQuery } from '@/lib/performance'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

interface ChatRequest {
  conversationId?: string
  uiMessages: UIMessage[]
}


export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as ChatRequest
    const { conversationId, uiMessages } = body

    if (!uiMessages || !Array.isArray(uiMessages)) {
      return Response.json({ error: 'Invalid uiMessages format' }, { status: 400 })
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY environment variable')
      return Response.json({ error: 'AI service unavailable' }, { status: 500 })
    }

    // Convert UIMessages to format expected by AI SDK v5
    const messages = uiMessages.map(msg => {
      const textContent = msg.parts
        .filter(part => part.type === 'text')
        .map(part => part.text || '')
        .join(' ')
      
      if (msg.role === 'user') {
        return { role: 'user' as const, content: textContent }
      } else if (msg.role === 'assistant') {
        return { role: 'assistant' as const, content: textContent }
      } else {
        // Default to user for other roles
        return { role: 'user' as const, content: textContent }
      }
    })

    // Create streaming response
    const result = streamText({
      model: openai('gpt-4o'),
      system: DAVID_FATTAL_SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
      onFinish: async (result) => {
        // Persist messages to database after streaming completes
        await persistMessagesAfterStreaming(conversationId, uiMessages, {
          text: result.text,
          id: result.response?.id,
          usage: result.usage
        }, user.id)
      }
    })

    return result.toTextStreamResponse()

  } catch (error) {
    console.error('Chat API error:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        return Response.json({ error: 'API rate limit exceeded. Please try again later.' }, { status: 429 })
      }
      if (error.message.includes('authentication') || error.message.includes('API key')) {
        return Response.json({ error: 'AI service authentication failed' }, { status: 401 })
      }
    }
    
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Persist conversation and messages after streaming completes
async function persistMessagesAfterStreaming(
  conversationId: string | undefined, 
  userMessages: UIMessage[], 
  aiResult: { text: string; id?: string; usage?: unknown },
  userId: string
) {
  try {
    let actualConversationId = conversationId
    
    // Create new conversation if none provided
    if (!actualConversationId) {
      const supabase = await createClient()
      const startTime = performance.now()
      
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          title: 'New chat',
          title_status: 'pending',
          owner: userId
        })
        .select('id')
        .single()
      
      trackDatabaseQuery('conversation-create', startTime)
      
      if (convError) {
        console.error('Failed to create conversation:', convError)
        return
      }
      
      actualConversationId = conversation.id
    }

    // Persist user messages (usually just the latest one)
    const userMessagesToSave = userMessages.filter(msg => msg.role === 'user')
    if (userMessagesToSave.length > 0) {
      const userMessageInserts = userMessagesToSave.map(msg => ({
        conversation_id: actualConversationId,
        role: msg.role,
        parts: msg.parts,
        provider_message_id: msg.id
      }))

      const supabaseForMessages = await createClient()
      const startTime = performance.now()
      
      const { error: userMsgError } = await supabaseForMessages
        .from('messages')
        .insert(userMessageInserts)
      
      trackDatabaseQuery('message-insert', startTime)
      
      if (userMsgError) {
        console.error('Failed to save user messages:', userMsgError)
      }
    }

    // Persist assistant response
    if (aiResult.text) {
      const assistantMessage = {
        conversation_id: actualConversationId,
        role: 'assistant' as const,
        parts: [{ type: 'text', text: aiResult.text }],
        provider_message_id: aiResult.id || null
      }

      const supabaseForAssistant = await createClient()
      const startTime = performance.now()
      
      const { error: assistantMsgError } = await supabaseForAssistant
        .from('messages')
        .insert([assistantMessage])
      
      trackDatabaseQuery('message-insert', startTime)
      
      if (assistantMsgError) {
        console.error('Failed to save assistant message:', assistantMsgError)
      } else if (actualConversationId) {
        // Check if we should trigger title generation after first assistant response
        await checkAndTriggerTitleGeneration(actualConversationId)
      }
    }

  } catch (error) {
    console.error('Failed to persist messages:', error)
    // Don't throw - streaming already completed successfully for user
  }
}

// Check if title generation should be triggered and do so in background
async function checkAndTriggerTitleGeneration(conversationId: string) {
  try {
    const supabase = await createClient()
    
    // Get conversation and message count
    const [conversationResult, messageCountResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('title_status')
        .eq('id', conversationId)
        .single(),
      supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('conversation_id', conversationId)
    ])
    
    if (conversationResult.error || messageCountResult.error) {
      return // Silently fail title generation checks
    }
    
    const conversation = conversationResult.data
    const messageCount = messageCountResult.count || 0
    
    // Trigger title generation if:
    // 1. Title status is 'pending'
    // 2. We have exactly 2 messages (first user message + first assistant response)
    if (conversation.title_status === 'pending' && messageCount === 2) {
      // Fire and forget - don't block the response
      triggerTitleGeneration(conversationId)
    }
  } catch (error) {
    // Silently fail title generation - it's not critical for user experience
    console.warn('Title generation check failed:', error)
  }
}
