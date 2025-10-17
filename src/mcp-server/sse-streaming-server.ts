#!/usr/bin/env node
/**
 * MCP Server with SSE Transport + Streaming Support
 *
 * Enables real-time streaming responses for ChatGPT custom connectors.
 * As the RAG system generates responses, they're streamed incrementally to the client.
 */

// Load environment variables FIRST
import './env.js';

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import {
  getOrCreateMcpConversation,
  getMcpConversationHistory,
  storeMcpMessage,
  updateConversationTitle,
  listMcpConversations,
} from '../lib/mcp/conversation.js';
import {
  callChatApiStreaming,
  formatCitations,
} from '../lib/mcp/chat-service-streaming.js';
import { generateConversationTitle } from '../lib/mcp/chat-service.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'David-GPT MCP SSE Server (Streaming)',
    transport: 'SSE',
    streaming: true,
    timestamp: new Date().toISOString(),
  });
});

// CORS middleware for ChatGPT/Claude
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Store active sessions
const sessions = new Map<string, { server: McpServer; transport: SSEServerTransport }>();

// Initialize MCP Server with streaming support
function createMcpServer(sseResponse: express.Response): McpServer {
  const server = new McpServer(
    {
      name: 'david-gpt-rag-streaming',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Helper to send SSE progress events
  function sendProgressEvent(type: 'start' | 'token' | 'citation' | 'complete' | 'error', data: any) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    // Send as SSE event
    sseResponse.write(`event: progress\n`);
    sseResponse.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Tool: new_conversation with streaming
  server.tool(
    'new_conversation',
    'Start a new conversation with the David-GPT RAG bot. Returns a streaming cited response from the knowledge base about 3D displays, Leia technology, computer vision, AI, and related technical topics. Responses stream in real-time as they are generated.',
    {
      message: z.string().describe('Your initial message or question for the bot'),
      persona: z.string().describe('Persona to use for the conversation').default('david').optional(),
    },
    async ({ message, persona = 'david' }) => {
      console.error(`[MCP SSE Streaming] Tool called: new_conversation`);

      try {
        // Generate unique session ID
        const sessionId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        console.error(`[MCP SSE Streaming] Creating conversation, session: ${sessionId}`);

        // Create conversation
        const conversationId = await getOrCreateMcpConversation(sessionId, persona);
        await storeMcpMessage(conversationId, 'user', message);

        // Generate title
        const title = generateConversationTitle(message);
        await updateConversationTitle(conversationId, title);

        // Send start event
        sendProgressEvent('start', {
          conversation_id: conversationId,
          session_id: sessionId,
        });

        // Stream the response
        let fullResponse = '';
        const citations: any[] = [];

        await callChatApiStreaming(
          [{ role: 'user', content: message }],
          conversationId,
          persona,
          {
            onToken: (token) => {
              fullResponse += token;
              sendProgressEvent('token', { token });
            },
            onCitation: (citation) => {
              citations.push(citation);
              sendProgressEvent('citation', citation);
            },
            onComplete: async (response, cites) => {
              await storeMcpMessage(conversationId, 'assistant', response);
              const formattedResponse = response + formatCitations(cites);
              sendProgressEvent('complete', {
                response: formattedResponse,
                citations_count: cites.length,
              });
            },
          }
        );

        // Return final result
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  conversation_id: conversationId,
                  session_id: sessionId,
                  response: fullResponse + formatCitations(citations),
                  citations_count: citations.length,
                  streaming: true,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error(`[MCP SSE Streaming] Tool call failed:`, error);
        sendProgressEvent('error', { error: String(error) });
        throw error;
      }
    }
  );

  // Tool: reply_to_conversation with streaming
  server.tool(
    'reply_to_conversation',
    'Continue an existing conversation with the David-GPT RAG bot. Maintains context from previous messages (last 6 messages) and returns streaming cited responses from the knowledge base.',
    {
      conversation_id: z.string().describe('Conversation ID from new_conversation'),
      message: z.string().describe('Your follow-up message or question'),
    },
    async ({ conversation_id, message }) => {
      console.error(`[MCP SSE Streaming] Tool called: reply_to_conversation`);
      console.error(`[MCP SSE Streaming] Replying to conversation: ${conversation_id}`);

      try {
        // Get conversation history
        const history = await getMcpConversationHistory(conversation_id, 6);
        await storeMcpMessage(conversation_id, 'user', message);

        // Send start event
        sendProgressEvent('start', { conversation_id });

        // Build messages with history
        const messages = [...history, { role: 'user' as const, content: message }];

        // Stream the response
        let fullResponse = '';
        const citations: any[] = [];

        await callChatApiStreaming(messages, conversation_id, 'david', {
          onToken: (token) => {
            fullResponse += token;
            sendProgressEvent('token', { token });
          },
          onCitation: (citation) => {
            citations.push(citation);
            sendProgressEvent('citation', citation);
          },
          onComplete: async (response, cites) => {
            await storeMcpMessage(conversation_id, 'assistant', response);
            const formattedResponse = response + formatCitations(cites);
            sendProgressEvent('complete', {
              response: formattedResponse,
              citations_count: cites.length,
              context_messages: history.length,
            });
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  response: fullResponse + formatCitations(citations),
                  citations_count: citations.length,
                  context_messages: history.length,
                  streaming: true,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error(`[MCP SSE Streaming] Tool call failed:`, error);
        sendProgressEvent('error', { error: String(error) });
        throw error;
      }
    }
  );

  // Tool: list_conversations
  server.tool(
    'list_conversations',
    'List recent MCP conversations. Returns up to 10 most recent conversations with their IDs, titles, and last message timestamps.',
    {
      limit: z.number().describe('Maximum number of conversations to return').default(10).optional(),
    },
    async ({ limit = 10 }) => {
      console.error(`[MCP SSE Streaming] Tool called: list_conversations, limit: ${limit}`);

      const conversations = await listMcpConversations(limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                conversations: conversations.map((c) => ({
                  conversation_id: c.id,
                  session_id: c.mcp_session_id,
                  title: c.title,
                  last_message_at: c.last_message_at,
                  persona: c.persona_slug || 'david',
                })),
                count: conversations.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

// SSE endpoint for MCP clients
app.get('/sse', async (req, res) => {
  console.error('[MCP SSE Streaming] New SSE connection');

  try {
    // Create MCP server with streaming support
    // Note: SSEServerTransport.start() (called by server.connect()) sets headers automatically
    const server = createMcpServer(res);
    const transport = new SSEServerTransport('/message', res);

    // Connect server to transport (this initializes transport.sessionId and sets headers)
    await server.connect(transport);

    // Store session using transport's auto-generated sessionId
    const sessionId = transport.sessionId;
    sessions.set(sessionId, { server, transport });

    console.error('[MCP SSE Streaming] Client connected:', sessionId);

    // Clean up on disconnect
    req.on('close', () => {
      console.error('[MCP SSE Streaming] Client disconnected:', sessionId);
      sessions.delete(sessionId);
    });
  } catch (error) {
    console.error('[MCP SSE Streaming] Connection error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection', details: String(error) });
    }
  }
});

// Message endpoint for MCP clients to send requests
app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  console.error('[MCP SSE Streaming] Received message for session:', sessionId);

  try {
    const session = sessions.get(sessionId);

    if (!session) {
      res.status(400).json({ error: 'No transport found for sessionId' });
      return;
    }

    // Delegate message handling to the transport
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('[MCP SSE Streaming] Message handling error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.error(`[MCP SSE Streaming] Server listening on port ${PORT}`);
  console.error(`[MCP SSE Streaming] SSE endpoint: http://localhost:${PORT}/sse`);
  console.error(`[MCP SSE Streaming] Health check: http://localhost:${PORT}/health`);
  console.error(`[MCP SSE Streaming] Streaming: ENABLED`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('[MCP SSE Streaming] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[MCP SSE Streaming] SIGINT received, shutting down gracefully');
  process.exit(0);
});
