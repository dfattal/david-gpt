import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { type UIMessage } from '@/lib/supabase'
import { DAVID_FATTAL_SYSTEM_PROMPT } from '@/lib/persona'
import { trackDatabaseQuery } from '@/lib/performance'
import { buildRAGContext, buildEnhancedSystemPrompt, shouldUseRAG, formatCitations } from '@/lib/rag/context'
import { NextRequest } from 'next/server'

// export const runtime = 'edge' // Disabled due to cookie handling issues

interface ChatRequest {
  conversationId?: string
  uiMessages: UIMessage[]
  clientRequestId?: string // For idempotency
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
    const { conversationId, uiMessages, clientRequestId } = body

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

    // Get the latest user message for RAG context
    const latestUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]
    let enhancedSystemPrompt = DAVID_FATTAL_SYSTEM_PROMPT
    let ragCitations = ''

    // Check if we should use RAG for this query
    if (latestUserMessage && shouldUseRAG(latestUserMessage.content)) {
      try {
        console.log('Building RAG context for user query:', latestUserMessage.content.substring(0, 100))
        
        // Build RAG context
        const ragContext = await buildRAGContext(
          latestUserMessage.content,
          user.id,
          {
            maxChunks: 5,
            minSimilarity: 0.3,
            includeDates: true,
            includeMetadata: true,
            deduplicate: true
          }
        )

        console.log(`RAG context built: ${ragContext.chunks.length} chunks, avg similarity: ${ragContext.stats.averageSimilarity.toFixed(2)}`)

        // Enhance system prompt with RAG context
        if (ragContext.hasRelevantContent) {
          enhancedSystemPrompt = buildEnhancedSystemPrompt(DAVID_FATTAL_SYSTEM_PROMPT, ragContext)
          ragCitations = formatCitations(ragContext.chunks)
          
          console.log(`Enhanced system prompt with ${ragContext.chunks.length} chunks from ${ragContext.stats.sources.length} sources`)
        }
      } catch (ragError) {
        // Don't fail the entire request if RAG fails - just log and continue
        console.warn('RAG context building failed, continuing without RAG:', ragError)
      }
    }

    // Create streaming response
    const result = streamText({
      model: openai('gpt-4o'),
      system: enhancedSystemPrompt,
      messages,
      temperature: 0.7,
      onFinish: async (result) => {
        // Add citations to response if we have them
        const finalResponseText = ragCitations ? result.text + ragCitations : result.text
        
        // Persist messages to database after streaming completes
        await persistMessagesAfterStreaming(conversationId, uiMessages, {
          text: finalResponseText,
          id: result.response?.id,
          usage: result.usage
        }, user.id, clientRequestId)
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
  userId: string,
  clientRequestId?: string
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
        provider_message_id: msg.id || clientRequestId
      }))

      const supabaseForMessages = await createClient()
      const startTime = performance.now()
      
      const { error: userMsgError } = await supabaseForMessages
        .from('messages')
        .insert(userMessageInserts)
      
      trackDatabaseQuery('message-insert', startTime)
      
      if (userMsgError) {
        // Check if it's a duplicate key error (idempotency)
        if (userMsgError.code === '23505' && userMsgError.message?.includes('provider_message_id')) {
          console.log('User message already exists (idempotency check passed)')
        } else {
          console.error('Failed to save user messages:', userMsgError)
        }
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
        // Check if it's a duplicate key error (idempotency)
        if (assistantMsgError.code === '23505' && assistantMsgError.message?.includes('provider_message_id')) {
          console.log('Assistant message already exists (idempotency check passed)')
          // Still try title generation since this might be a retry
          if (actualConversationId) {
            await generateTitleInline(actualConversationId)
          }
        } else {
          console.error('Failed to save assistant message:', assistantMsgError)
        }
      } else if (actualConversationId) {
        // Generate title inline after assistant message is persisted
        await generateTitleInline(actualConversationId)
      }
    }

  } catch (error) {
    console.error('Failed to persist messages:', error)
    // Don't throw - streaming already completed successfully for user
  }
}

// Generate title inline after first assistant response
async function generateTitleInline(conversationId: string) {
  try {
    const supabase = await createClient()
    
    // Check if this is the first exchange (exactly 1 user message) and title is still pending
    const [conversationResult, userMessageCountResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('title_status')
        .eq('id', conversationId)
        .single(),
      supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('conversation_id', conversationId)
        .eq('role', 'user')
    ])
    
    if (conversationResult.error || userMessageCountResult.error) {
      return // Silently fail title generation checks
    }
    
    const conversation = conversationResult.data
    const userMessageCount = userMessageCountResult.count || 0
    
    console.log(`[Title Generation Check] Conversation ${conversationId}: status=${conversation.title_status}, userMessageCount=${userMessageCount}`)
    
    // Only generate title if:
    // 1. Title status is 'pending'
    // 2. We have exactly 1 user message (first exchange)
    if (conversation.title_status === 'pending' && userMessageCount === 1) {
      console.log(`[Title Generation] Generating title inline for conversation ${conversationId}`)
      await generateAndSaveTitle(conversationId)
    } else {
      console.log(`[Title Generation] Skipping title generation: status=${conversation.title_status}, userMessageCount=${userMessageCount} (need pending status and exactly 1 user message)`)
    }
  } catch (error) {
    // Silently fail title generation - it's not critical for user experience
    console.warn('Inline title generation failed:', error)
  }
}

// Generate and save title using the first exchange
async function generateAndSaveTitle(conversationId: string) {
  try {
    const supabase = await createClient()
    
    // Get the first user message for context
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, parts')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(2) // User + assistant messages

    if (messagesError || !messages || messages.length === 0) {
      console.warn(`[Title Generation] No messages found for conversation ${conversationId}`)
      return
    }

    // Build conversation context
    const conversationContext = messages
      .map(msg => {
        const textContent = msg.parts
          .filter((part: { type: string; text?: string }) => part.type === 'text')
          .map((part: { text?: string }) => part.text || '')
          .join(' ')
        return `${msg.role}: ${textContent}`
      })
      .join('\n\n')

    // Import the title generation utilities
    const { DAVID_FATTAL_TITLE_PROMPT } = await import('@/lib/title-generation')
    
    // Generate title using AI
    const result = await streamText({
      model: openai('gpt-4o'),
      system: DAVID_FATTAL_TITLE_PROMPT,
      messages: [{ role: 'user' as const, content: conversationContext }],
      temperature: 0.2 // Low temperature for consistent titles
    })

    let generatedTitle = ''
    for await (const chunk of result.textStream) {
      generatedTitle += chunk
    }

    // Clean up the generated title
    generatedTitle = generatedTitle.trim().replace(/["'`]/g, '')
    generatedTitle = generatedTitle.replace(/^Title:\s*/i, '')
    generatedTitle = generatedTitle.replace(/\.$/, '') // Remove trailing period
    
    // Validate title
    const wordCount = generatedTitle.split(/\s+/).filter(word => word.length > 0).length
    if (wordCount < 2 || wordCount > 8 || generatedTitle.length < 5) {
      generatedTitle = 'New Chat'
    }
    
    if (generatedTitle.length > 50) {
      generatedTitle = generatedTitle.substring(0, 50).trim()
    }

    // Race-safe update: only update if title_status is still 'pending'
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ 
        title: generatedTitle,
        title_status: 'ready'
      })
      .eq('id', conversationId)
      .eq('title_status', 'pending') // Race-safe: only update if still pending

    if (updateError) {
      console.warn(`[Title Generation] Failed to update title for conversation ${conversationId}:`, updateError)
    } else {
      console.log(`[Title Generation] Successfully generated title for conversation ${conversationId}: "${generatedTitle}"`)
    }

  } catch (error) {
    console.warn('Title generation failed:', error)
    
    // Mark as error only if it's still pending
    try {
      const errorSupabase = await createClient()
      await errorSupabase
        .from('conversations')
        .update({ title_status: 'error' })
        .eq('id', conversationId)
        .eq('title_status', 'pending')
    } catch (cleanupError) {
      console.warn('Failed to update error status:', cleanupError)
    }
  }
}
