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
const sessions = new Map<string, { server: Server; transport: SSEServerTransport }>();

// Initialize MCP Server with streaming support
function createMcpServer(sseResponse: express.Response): Server {
  const server = new Server(
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

  // Define tools
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'new_conversation',
        description:
          'Start a new conversation with the David-GPT RAG bot. Returns a streaming cited response from the knowledge base about 3D displays, Leia technology, computer vision, AI, and related technical topics. Responses stream in real-time as they are generated.',
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
          'Continue an existing conversation with the David-GPT RAG bot. Maintains context from previous messages (last 6 messages) and returns streaming cited responses from the knowledge base.',
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

  // Helper to send SSE progress events
  function sendProgressEvent(type: 'start' | 'token' | 'citation' | 'complete', data: any) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    // Send as SSE event
    sseResponse.write(`event: progress\n`);
    sseResponse.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Tool call handlers with streaming
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;

    console.error(`[MCP SSE Streaming] Tool called: ${name}`, args);

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
                // Send token event
                sendProgressEvent('token', { token });
              },
              onCitation: (citation) => {
                citations.push(citation);
                // Send citation event
                sendProgressEvent('citation', citation);
              },
              onComplete: async (response, cites) => {
                // Store assistant response
                await storeMcpMessage(conversationId, 'assistant', response);

                // Format with citations
                const formattedResponse = response + formatCitations(cites);

                // Send complete event
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

          console.error(`[MCP SSE Streaming] Replying to conversation: ${conversation_id}`);

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
        }

        case 'list_conversations': {
          const { limit = 10 } = args as { limit?: number };

          console.error(`[MCP SSE Streaming] Listing conversations, limit: ${limit}`);

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
      console.error(`[MCP SSE Streaming] Tool call failed:`, error);

      // Send error event
      sseResponse.write(`event: error\n`);
      sseResponse.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);

      throw error;
    }
  });

  return server;
}

// SSE endpoint for MCP clients
app.get('/sse', async (req, res) => {
  console.error('[MCP SSE Streaming] New SSE connection');

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Create MCP server with streaming support
  const server = createMcpServer(res);
  const transport = new SSEServerTransport('/message', res);

  // Store session
  const sessionId = `session-${Date.now()}`;
  sessions.set(sessionId, { server, transport });

  // Connect server to transport
  await server.connect(transport);

  console.error('[MCP SSE Streaming] Client connected:', sessionId);

  // Clean up on disconnect
  req.on('close', () => {
    console.error('[MCP SSE Streaming] Client disconnected:', sessionId);
    sessions.delete(sessionId);
  });
});

// Message endpoint for MCP clients to send requests
app.post('/message', async (req, res) => {
  console.error('[MCP SSE Streaming] Received message:', req.body);

  try {
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('[MCP SSE Streaming] Message handling error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
