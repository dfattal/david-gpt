# David-GPT MCP Server

> **Expose the David-GPT RAG bot as a Model Context Protocol (MCP) server for use with Claude Code, Cursor, and other MCP clients.**

## Overview

The David-GPT MCP server exposes the full RAG (Retrieval-Augmented Generation) capabilities of David-GPT as MCP tools that can be invoked by any MCP-compatible client. This enables:

- **Multi-turn conversations** with full context retention (last 6 messages)
- **RAG-powered responses** with hybrid search (vector + BM25)
- **Transparent citations** with source URLs and document metadata
- **Persona-aware responses** using curated knowledge bases
- **Persistent conversation history** stored in Supabase

## Architecture

The MCP server follows the proven Slack integration pattern:

```
MCP Client (Claude Code/Cursor)
    ↓ stdio transport
MCP Server (src/mcp-server/index.ts)
    ↓ HTTP
Chat API (/api/chat)
    ↓ Supabase (service role)
RAG System (hybrid search + reranking)
```

**Key Components:**

1. **MCP Server** (`src/mcp-server/index.ts`) - Handles MCP protocol and tool registration
2. **Conversation Utilities** (`src/lib/mcp/conversation.ts`) - Manages conversation persistence
3. **Chat Service** (`src/lib/mcp/chat-service.ts`) - Calls chat API and streams responses
4. **MCP System User** - Dedicated system user (UUID: `00000000-0000-0000-0000-000000000002`) for bypassing RLS
5. **Session Tracking** - `mcp_session_id` column in conversations table

## Available Tools

### 1. `new_conversation`

**Description:** Start a new conversation with the David-GPT RAG bot.

**Input:**
```json
{
  "message": "What is DLB technology?",
  "persona": "david"  // optional, defaults to "david"
}
```

**Output:**
```json
{
  "conversation_id": "uuid",
  "session_id": "uuid",
  "response": "Markdown formatted response with citations...",
  "citations_count": 3
}
```

**Example Usage:**
```
Use the new_conversation tool to ask David-GPT about DLB technology.
```

---

### 2. `reply_to_conversation`

**Description:** Continue an existing conversation with full context.

**Input:**
```json
{
  "conversation_id": "uuid",  // from new_conversation
  "message": "Can you elaborate on the multibeam approach?"
}
```

**Output:**
```json
{
  "response": "Markdown formatted response with citations...",
  "citations_count": 2,
  "context_messages": 4
}
```

**Example Usage:**
```
Use the reply_to_conversation tool with conversation ID "abc-123" to ask a follow-up question.
```

---

### 3. `list_conversations`

**Description:** List recent MCP conversations.

**Input:**
```json
{
  "limit": 10  // optional, defaults to 10
}
```

**Output:**
```json
{
  "conversations": [
    {
      "conversation_id": "uuid",
      "session_id": "uuid",
      "title": "Conversation about DLB",
      "last_message_at": "2025-10-14T12:00:00Z",
      "persona": "david"
    }
  ],
  "count": 5
}
```

## Installation & Setup

### Prerequisites

- Node.js 20+ with pnpm
- Running Next.js development server (`pnpm dev`)
- Supabase project with required environment variables

### Step 1: Install Dependencies

Dependencies are already installed (completed during setup):

```bash
pnpm add @modelcontextprotocol/sdk
```

### Step 2: Configure Environment Variables

Ensure these variables are set in your `.env.local`:

```env
# Supabase (using Next.js naming convention)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (for embeddings and chat)
OPENAI_API_KEY=sk-...

# Next.js app URL (for chat API calls)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 3: Configure MCP Client

#### For Claude Code / Cursor

The `.cursor/mcp.json` file is already configured:

```json
{
  "mcpServers": {
    "david-gpt": {
      "command": "pnpm",
      "args": ["mcp-server"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "${NEXT_PUBLIC_SUPABASE_URL}",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "NEXT_PUBLIC_APP_URL": "http://localhost:3000"
      }
    }
  }
}
```

Environment variables are automatically loaded from `.env.local`.

#### For Other MCP Clients

Use the stdio transport with the command:

```bash
pnpm mcp-server
```

### Step 4: Start Next.js Development Server

The MCP server requires the Next.js app to be running for the chat API:

```bash
pnpm dev
```

Keep this running in a separate terminal.

### Step 5: Test with MCP Inspector

Use the official MCP Inspector to test the server:

```bash
pnpm mcp-server:inspect
```

This opens a web UI at `http://localhost:5173` where you can:
- List available tools
- Test tool invocations
- View request/response payloads
- Debug server logs

## Usage Examples

### Example 1: Simple Question

**Input:**
```json
{
  "tool": "new_conversation",
  "arguments": {
    "message": "What is DLB technology?"
  }
}
```

**Output:**
```
DLB (Directional Light Backlight) is a diffractive backlighting technology developed by Leia Inc. for autostereoscopic 3D displays[^doc_1:Background]...

---
**Sources:**

1. [Core Backlight Patent](https://patents.google.com/patent/US10838134B2)
```

### Example 2: Multi-Turn Conversation

**Turn 1:**
```json
{
  "tool": "new_conversation",
  "arguments": {
    "message": "Tell me about Leia's 3D display technology."
  }
}
```

Returns `conversation_id: "abc-123"`

**Turn 2:**
```json
{
  "tool": "reply_to_conversation",
  "arguments": {
    "conversation_id": "abc-123",
    "message": "How does it differ from traditional 3D displays?"
  }
}
```

The bot now has full context from Turn 1 and provides a contextual response.

### Example 3: Persona-Specific Query

```json
{
  "tool": "new_conversation",
  "arguments": {
    "message": "Explain 2D-to-3D conversion techniques.",
    "persona": "david"
  }
}
```

Uses the "david" persona's curated knowledge base and expertise.

## How It Works

### Conversation Flow

```
1. Client calls new_conversation tool
   ↓
2. MCP server generates session ID (UUID)
   ↓
3. Creates conversation in Supabase with mcp_session_id
   ↓
4. Stores user message
   ↓
5. Calls /api/chat with message (no history yet)
   ↓
6. RAG search performs hybrid retrieval
   ↓
7. LLM generates response with citations
   ↓
8. Stores assistant message
   ↓
9. Returns response to client

---

10. Client calls reply_to_conversation tool
    ↓
11. Retrieves last 6 messages from conversation
    ↓
12. Stores new user message
    ↓
13. Calls /api/chat with full history
    ↓
14. RAG search with multi-turn context + citation boosting
    ↓
15. LLM generates contextual response
    ↓
16. Stores assistant message
    ↓
17. Returns response to client
```

### Database Schema

**MCP System User:**
```sql
-- auth.users
id: 00000000-0000-0000-0000-000000000002
email: mcp-system@davidgpt.internal

-- user_profiles
id: 00000000-0000-0000-0000-000000000002
role: guest
display_name: MCP System User
```

**Conversations:**
```sql
ALTER TABLE conversations
ADD COLUMN mcp_session_id TEXT;

CREATE UNIQUE INDEX idx_conversations_mcp_session_id
ON conversations(mcp_session_id)
WHERE mcp_session_id IS NOT NULL;
```

**Messages:**
- Standard messages table with `role` ('user' | 'assistant') and `content`
- Linked to conversations via `conversation_id`
- Ordered by `created_at` for history retrieval

## Troubleshooting

### Server Won't Start

**Error:** `Missing required environment variables`

**Solution:** Ensure all required env vars are set:
```bash
# Check .env.local has:
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

---

### Chat API Connection Error

**Error:** `Chat API returned 500`

**Solution:** Ensure Next.js dev server is running:
```bash
pnpm dev
```

---

### MCP Client Can't Connect

**Error:** `Failed to start MCP server`

**Solution:** Check that `pnpm mcp-server` runs successfully:
```bash
pnpm mcp-server
# Should output: [MCP Server] Starting David-GPT MCP Server...
```

---

### No RAG Results

**Error:** Response doesn't include citations

**Possible Causes:**
1. No documents ingested for the persona
2. Query doesn't match any documents semantically
3. Vector search threshold too high

**Solution:** Check document count:
```sql
SELECT COUNT(*) FROM docs WHERE personas @> '["david"]';
```

---

### Citations Not Appearing

**Error:** Citations in response but no sources section

**Solution:** This is expected - citations are embedded inline like `[^doc_1:section]`. The formatted response includes a sources section at the bottom.

## Advanced Configuration

### Custom Persona

To use a different persona, create the persona in the database and specify it in `new_conversation`:

```json
{
  "tool": "new_conversation",
  "arguments": {
    "message": "Hello",
    "persona": "legal"
  }
}
```

### Conversation History Limit

Default: 6 messages (last 3 turns)

To change, edit `src/lib/mcp/conversation.ts`:
```typescript
export async function getMcpConversationHistory(
  conversationId: string,
  limit: number = 12  // Change to 12 messages (6 turns)
)
```

### Production Deployment

For production, update `NEXT_PUBLIC_APP_URL` to your deployed URL:

```json
{
  "mcpServers": {
    "david-gpt": {
      "env": {
        "NEXT_PUBLIC_APP_URL": "https://david-gpt-orpin.vercel.app"
      }
    }
  }
}
```

## Development

### Running with Inspector

```bash
pnpm mcp-server:inspect
```

Opens visual debugger at `http://localhost:5173`

### Viewing Logs

MCP server logs to stderr (visible in console):

```
[MCP Server] Starting David-GPT MCP Server v0.1.0
[MCP Server] Environment:
  - NEXT_PUBLIC_SUPABASE_URL: set
  - SUPABASE_SERVICE_ROLE_KEY: set
  - OPENAI_API_KEY: set
[MCP Server] Server started successfully
[MCP Server] Available tools: new_conversation, reply_to_conversation, list_conversations
[MCP Server] Waiting for requests...
```

### Database Queries

**List MCP conversations:**
```sql
SELECT id, title, mcp_session_id, last_message_at
FROM conversations
WHERE user_id = '00000000-0000-0000-0000-000000000002'
ORDER BY last_message_at DESC
LIMIT 10;
```

**Count messages in conversation:**
```sql
SELECT COUNT(*)
FROM messages
WHERE conversation_id = 'your-conversation-id';
```

## Comparison: Slack vs MCP

| Feature | Slack Integration | MCP Integration |
|---------|------------------|----------------|
| **Transport** | HTTP webhooks | stdio (stdin/stdout) |
| **System User** | `00000000-0000-0000-0000-000000000001` | `00000000-0000-0000-0000-000000000002` |
| **Session Tracking** | `slack_thread_ts` | `mcp_session_id` |
| **Client** | Slack workspace | Claude Code, Cursor, etc. |
| **Multi-turn** | ✅ Thread-based | ✅ Conversation ID-based |
| **RAG** | ✅ Full hybrid search | ✅ Full hybrid search |
| **Citations** | ✅ Formatted for Slack | ✅ Markdown formatted |
| **Personas** | ✅ Default "david" | ✅ Configurable per conversation |

## Future Enhancements

- [ ] Streaming responses (currently buffered)
- [ ] Resource exposure (documents, personas)
- [ ] Prompt templates for common queries
- [ ] Session management (list/delete sessions)
- [ ] Multi-persona switching within conversation
- [ ] RAG search debugging (show search scores)
- [ ] Conversation export (markdown/JSON)

## Support

For issues or questions:
1. Check logs with `pnpm mcp-server`
2. Test with MCP Inspector: `pnpm mcp-server:inspect`
3. Verify Next.js is running: `pnpm dev`
4. Check Supabase connection and RLS policies

## License

See main project README for license information.
