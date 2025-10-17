import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateMcpConversation,
  getMcpConversationHistory,
  storeMcpMessage,
  updateConversationTitle,
  listMcpConversations,
} from '@/lib/mcp/conversation';
import {
  callChatApi,
  formatCitations,
  generateConversationTitle,
} from '@/lib/mcp/chat-service';
import { v4 as uuidv4 } from 'uuid';

/**
 * HTTP API Bridge for MCP Server Functionality
 *
 * This endpoint exposes MCP server tools over HTTP, allowing cloud-based
 * clients (like Claude AI) to access the RAG system.
 *
 * Available actions:
 * - new_conversation: Start a new conversation
 * - reply_to_conversation: Continue an existing conversation
 * - list_conversations: List recent conversations
 */

interface NewConversationRequest {
  action: 'new_conversation';
  message: string;
  persona?: string;
}

interface ReplyToConversationRequest {
  action: 'reply_to_conversation';
  conversation_id: string;
  message: string;
}

interface ListConversationsRequest {
  action: 'list_conversations';
  limit?: number;
}

type MCPBridgeRequest = NewConversationRequest | ReplyToConversationRequest | ListConversationsRequest;

// CORS headers for Claude AI and other clients
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as MCPBridgeRequest;
    const { action } = body;

    console.log('[MCP Bridge] Received request:', action);

    switch (action) {
      case 'new_conversation': {
        const { message, persona = 'david' } = body as NewConversationRequest;

        if (!message || typeof message !== 'string') {
          return NextResponse.json(
            { error: 'message must be a non-empty string' },
            { status: 400, headers: corsHeaders }
          );
        }

        // Generate unique session ID for this conversation
        const sessionId = uuidv4();
        console.log('[MCP Bridge] Creating new conversation, session:', sessionId);

        // Create conversation
        const conversationId = await getOrCreateMcpConversation(sessionId, persona);

        // Store user message
        await storeMcpMessage(conversationId, 'user', message);

        // Generate title from first message
        const title = generateConversationTitle(message);
        await updateConversationTitle(conversationId, title);

        // Call chat API
        const chatResponse = await callChatApi(
          [{ role: 'user', content: message }],
          conversationId,
          persona
        );

        // Store assistant response
        await storeMcpMessage(conversationId, 'assistant', chatResponse.content);

        // Format response with citations
        const formattedResponse =
          chatResponse.content + formatCitations(chatResponse.citations);

        console.log('[MCP Bridge] Conversation created:', conversationId);

        return NextResponse.json({
          conversation_id: conversationId,
          session_id: sessionId,
          response: formattedResponse,
          citations: chatResponse.citations,
          citations_count: chatResponse.citations.length,
        }, { headers: corsHeaders });
      }

      case 'reply_to_conversation': {
        const { conversation_id, message } = body as ReplyToConversationRequest;

        if (!conversation_id || typeof conversation_id !== 'string') {
          return NextResponse.json(
            { error: 'conversation_id must be a valid UUID string' },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!message || typeof message !== 'string') {
          return NextResponse.json(
            { error: 'message must be a non-empty string' },
            { status: 400, headers: corsHeaders }
          );
        }

        console.log('[MCP Bridge] Replying to conversation:', conversation_id);

        // Get conversation history (last 6 messages)
        const history = await getMcpConversationHistory(conversation_id, 6);

        // Store user message
        await storeMcpMessage(conversation_id, 'user', message);

        // Build messages array with history
        const messages = [...history, { role: 'user' as const, content: message }];

        // Call chat API with context
        const chatResponse = await callChatApi(messages, conversation_id, 'david');

        // Store assistant response
        await storeMcpMessage(conversation_id, 'assistant', chatResponse.content);

        // Format response with citations
        const formattedResponse =
          chatResponse.content + formatCitations(chatResponse.citations);

        console.log('[MCP Bridge] Reply completed successfully');

        return NextResponse.json({
          response: formattedResponse,
          citations: chatResponse.citations,
          citations_count: chatResponse.citations.length,
          context_messages: history.length,
        }, { headers: corsHeaders });
      }

      case 'list_conversations': {
        const { limit = 10 } = body as ListConversationsRequest;

        console.log('[MCP Bridge] Listing conversations, limit:', limit);

        const conversations = await listMcpConversations(limit);

        console.log('[MCP Bridge] Found', conversations.length, 'conversations');

        return NextResponse.json({
          conversations: conversations.map(c => ({
            conversation_id: c.id,
            session_id: c.mcp_session_id,
            title: c.title,
            last_message_at: c.last_message_at,
            persona: c.persona_slug || 'david',
          })),
          count: conversations.length,
        }, { headers: corsHeaders });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400, headers: corsHeaders }
        );
    }
  } catch (error) {
    console.error('[MCP Bridge] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Optional: Support GET for basic info/health check
export async function GET() {
  return NextResponse.json({
    service: 'David-GPT MCP Bridge',
    version: '1.0.0',
    description: 'HTTP API wrapper for MCP server functionality',
    endpoints: {
      POST: {
        new_conversation: {
          action: 'new_conversation',
          required: ['message'],
          optional: ['persona'],
        },
        reply_to_conversation: {
          action: 'reply_to_conversation',
          required: ['conversation_id', 'message'],
        },
        list_conversations: {
          action: 'list_conversations',
          optional: ['limit'],
        },
      },
    },
    example: {
      new_conversation: {
        action: 'new_conversation',
        message: 'What is Leia technology?',
        persona: 'david',
      },
    },
  }, { headers: corsHeaders });
}
