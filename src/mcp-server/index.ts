#!/usr/bin/env node

/**
 * David-GPT MCP Server
 * Exposes the RAG bot as Model Context Protocol tools for use with Claude Code, Cursor, etc.
 */

// CRITICAL: Load environment variables FIRST, before any other imports
// This ensures dotenv runs before modules try to access process.env
import './env.js';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

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
import { logToFile } from '../lib/mcp/file-logger.js';
import { validateEnv } from './env.js';

// Get package version
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let packageVersion = '1.0.0';
try {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf-8')
  );
  packageVersion = packageJson.version;
} catch (error) {
  console.error('[MCP Server] Failed to read package.json version:', error);
}

// Define available tools
const TOOLS: Tool[] = [
  {
    name: 'new_conversation',
    description:
      'Start a new conversation with the David-GPT RAG bot. Creates a new conversation thread and returns the bot\'s response to the initial message. The bot has access to a knowledge base about 3D displays, AI, computer vision, and related technical topics.',
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
      'Continue an existing conversation with the David-GPT RAG bot. Sends a follow-up message and maintains conversation context (last 6 messages). Use the conversation_id returned from new_conversation.',
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
];

// Create MCP server instance
const server = new Server(
  {
    name: 'david-gpt',
    version: packageVersion,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[MCP Server] Listing available tools');
  return {
    tools: TOOLS,
  };
});

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP Server] Tool called: ${name}`);
  console.error(`[MCP Server] Arguments:`, JSON.stringify(args, null, 2));

  try {
    switch (name) {
      case 'new_conversation': {
        const { message, persona = 'david' } = args as {
          message: string;
          persona?: string;
        };

        logToFile('[MCP Server] === NEW_CONVERSATION TOOL CALLED ===');
        logToFile('[MCP Server] Message:', message);
        logToFile('[MCP Server] Persona:', persona);

        if (!message || typeof message !== 'string') {
          throw new Error('message must be a non-empty string');
        }

        // Generate unique session ID for this conversation
        const sessionId = uuidv4();

        logToFile('[MCP Server] Creating new conversation');
        logToFile('[MCP Server] Session ID:', sessionId);
        logToFile('[MCP Server] Persona:', persona);

        // Create conversation
        logToFile('[MCP Server] About to create conversation');
        const conversationId = await getOrCreateMcpConversation(sessionId, persona);
        logToFile('[MCP Server] Conversation created:', conversationId);

        // Store user message
        logToFile('[MCP Server] About to store user message');
        await storeMcpMessage(conversationId, 'user', message);
        logToFile('[MCP Server] User message stored');

        // Generate title from first message
        const title = generateConversationTitle(message);
        logToFile('[MCP Server] Generated title:', title);
        await updateConversationTitle(conversationId, title);
        logToFile('[MCP Server] Title updated');

        // Call chat API
        logToFile('[MCP Server] About to call chat API');
        logToFile('[MCP Server] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
        logToFile('[MCP Server] Conversation ID:', conversationId);
        logToFile('[MCP Server] Persona:', persona);

        const chatResponse = await callChatApi(
          [{ role: 'user', content: message }],
          conversationId,
          persona
        );

        logToFile('[MCP Server] Chat API call completed successfully');

        console.error('[MCP Server] Chat API call completed successfully');

        // Store assistant response
        await storeMcpMessage(conversationId, 'assistant', chatResponse.content);

        // Format response with citations
        const formattedResponse =
          chatResponse.content + formatCitations(chatResponse.citations);

        console.error('[MCP Server] Conversation created successfully');
        console.error('[MCP Server] Conversation ID:', conversationId);

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

        console.error('[MCP Server] Replying to conversation:', conversation_id);

        // Get conversation history
        const history = await getMcpConversationHistory(conversation_id, 6);

        // Store user message
        await storeMcpMessage(conversation_id, 'user', message);

        // Build messages array with history
        const messages = [...history, { role: 'user' as const, content: message }];

        console.error('[MCP Server] Retrieved history:', history.length, 'messages');

        // Call chat API with context
        const chatResponse = await callChatApi(messages, conversation_id, 'david');

        // Store assistant response
        await storeMcpMessage(conversation_id, 'assistant', chatResponse.content);

        // Format response with citations
        const formattedResponse =
          chatResponse.content + formatCitations(chatResponse.citations);

        console.error('[MCP Server] Reply completed successfully');

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

        console.error('[MCP Server] Listing conversations, limit:', limit);

        const conversations = await listMcpConversations(limit);

        console.error('[MCP Server] Found', conversations.length, 'conversations');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  conversations: conversations.map(c => ({
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
    logToFile('[MCP Server] !!!!! ERROR CAUGHT !!!!!');
    logToFile('[MCP Server] Error executing tool:', error);
    logToFile('[MCP Server] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[MCP Server] Error executing tool:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: errorMessage,
              tool: name,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  console.error('[MCP Server] Starting David-GPT MCP Server v' + packageVersion);
  console.error('[MCP Server] Environment:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing');
  console.error(
    '  - SUPABASE_SERVICE_ROLE_KEY:',
    process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing'
  );
  console.error('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'set' : 'missing');
  console.error(
    '  - NEXT_PUBLIC_APP_URL:',
    process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000 (default)'
  );

  // Validate required environment variables
  validateEnv();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] Server started successfully');
  console.error('[MCP Server] Available tools:', TOOLS.map(t => t.name).join(', '));
  console.error('[MCP Server] Waiting for requests...');
}

main().catch(error => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
