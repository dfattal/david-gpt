#!/usr/bin/env node
/**
 * MCP Server with SSE Transport for Claude AI Custom Connectors
 *
 * This server exposes MCP tools over SSE (Server-Sent Events) for integration
 * with Claude.ai web interface via custom connectors.
 *
 * Deploy to Railway alongside your existing workers.
 */

// Load environment variables FIRST
import './env.js';

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  getOrCreateMcpConversation,
  getMcpConversationHistory,
  storeMcpMessage,
  updateConversationTitle,
  listMcpConversations,
} from '../lib/mcp/conversation.js';
import {
  callChatApi,
  formatCitations,
  generateConversationTitle,
} from '../lib/mcp/chat-service.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'David-GPT MCP SSE Server',
    transport: 'SSE',
    timestamp: new Date().toISOString(),
  });
});

// CORS middleware for Claude.ai
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, restrict to Claude.ai domains
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Store active sessions
const sessions = new Map<string, { server: Server; transport: SSEServerTransport }>();

// Initialize MCP Server
function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'david-gpt-rag',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'new_conversation',
        description:
          'Start a new conversation with the David-GPT RAG bot. Returns a cited response from the knowledge base about 3D displays, Leia technology, computer vision, AI, and related technical topics.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Your initial message or question for the bot',
            },
            persona: {
              type: 'string',
              description: 'Persona to use for the conversation (default: "david")',
              default: 'david',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'reply_to_conversation',
        description:
          'Continue an existing conversation with the David-GPT RAG bot. Maintains context from previous messages (last 6 messages) and returns cited responses from the knowledge base.',
        inputSchema: {
          type: 'object',
          properties: {
            conversation_id: {
              type: 'string',
              description: 'Conversation ID from new_conversation',
            },
            message: {
              type: 'string',
              description: 'Your follow-up message or question',
            },
          },
          required: ['conversation_id', 'message'],
        },
      },
      {
        name: 'list_conversations',
        description:
          'List recent MCP conversations. Returns up to 10 most recent conversations with their IDs, titles, and last message timestamps.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of conversations to return (default: 10)',
              default: 10,
            },
          },
        },
      },
    ],
  }));

  // Tool call handlers
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;

    console.error(`[MCP SSE] Tool called: ${name}`, args);

    try {
      switch (name) {
        case 'new_conversation': {
          const { message, persona = 'david' } = args as {
            message: string;
            persona?: string;
          };

          if (!message || typeof message !== 'string') {
            throw new Error('message must be a non-empty string');
          }

          // Generate unique session ID
          const sessionId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          console.error(`[MCP SSE] Creating conversation, session: ${sessionId}`);

          // Create conversation
          const conversationId = await getOrCreateMcpConversation(sessionId, persona);

          // Store user message
          await storeMcpMessage(conversationId, 'user', message);

          // Generate title
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

          console.error(`[MCP SSE] Conversation created: ${conversationId}`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    conversation_id: conversationId,
                    session_id: sessionId,
                    response: formattedResponse,
                    citations_count: chatResponse.citations.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'reply_to_conversation': {
          const { conversation_id, message } = args as {
            conversation_id: string;
            message: string;
          };

          if (!conversation_id || typeof conversation_id !== 'string') {
            throw new Error('conversation_id must be a valid UUID string');
          }

          if (!message || typeof message !== 'string') {
            throw new Error('message must be a non-empty string');
          }

          console.error(`[MCP SSE] Replying to conversation: ${conversation_id}`);

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

          console.error(`[MCP SSE] Reply completed`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    response: formattedResponse,
                    citations_count: chatResponse.citations.length,
                    context_messages: history.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'list_conversations': {
          const { limit = 10 } = args as { limit?: number };

          console.error(`[MCP SSE] Listing conversations, limit: ${limit}`);

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

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[MCP SSE] Tool call failed:`, error);
      throw error;
    }
  });

  return server;
}

// SSE endpoint for MCP clients
app.get('/sse', async (req, res) => {
  console.error('[MCP SSE] New SSE connection');

  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create MCP server and transport
    const server = createMcpServer();
    const transport = new SSEServerTransport('/message', res);

    // Store session
    const sessionId = `session-${Date.now()}`;
    sessions.set(sessionId, { server, transport });

    // Connect server to transport
    await server.connect(transport);

    console.error('[MCP SSE] Client connected:', sessionId);

    // Clean up on disconnect
    req.on('close', () => {
      console.error('[MCP SSE] Client disconnected:', sessionId);
      sessions.delete(sessionId);
    });
  } catch (error) {
    console.error('[MCP SSE] Connection error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection', details: String(error) });
    }
  }
});

// Message endpoint for MCP clients to send requests
app.post('/message', async (req, res) => {
  console.error('[MCP SSE] Received message:', req.body);

  try {
    // Handle incoming message
    // The SSE transport will handle routing this to the appropriate handler
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('[MCP SSE] Message handling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.error(`[MCP SSE] Server listening on port ${PORT}`);
  console.error(`[MCP SSE] SSE endpoint: http://localhost:${PORT}/sse`);
  console.error(`[MCP SSE] Health check: http://localhost:${PORT}/health`);
  console.error(`[MCP SSE] Environment:`);
  console.error(`  - NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30)}...`);
  console.error(`  - SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '[SET]' : '[MISSING]'}`);
  console.error(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '[SET]' : '[MISSING]'}`);
  console.error(`  - NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('[MCP SSE] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[MCP SSE] SIGINT received, shutting down gracefully');
  process.exit(0);
});
