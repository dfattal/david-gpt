# David-GPT MCP Integration Guide

**Complete guide to accessing David-GPT RAG system via Model Context Protocol (MCP)**

---

## Table of Contents

- [Overview](#overview)
- [Quick Decision Matrix](#quick-decision-matrix)
- [Transport Protocols](#transport-protocols)
  - [1. stdio (Local)](#1-stdio-local)
  - [2. HTTP API](#2-http-api)
  - [3. SSE (Server-Sent Events)](#3-sse-server-sent-events)
- [Streaming Support](#streaming-support)
- [Deployment Architecture](#deployment-architecture)
- [Usage Examples](#usage-examples)
- [Comparison Tables](#comparison-tables)
- [Troubleshooting](#troubleshooting)

---

## Overview

The David-GPT RAG system is accessible through **four different integration methods**, each optimized for specific use cases:

| Method | Transport | Streaming | Best For | Hosting |
|--------|-----------|-----------|----------|---------|
| **stdio MCP** | stdin/stdout | ❌ | Local dev tools (Claude Code, Cursor) | Local machine |
| **HTTP API** | REST | ❌ | Programmatic access (Python/JS apps) | Vercel (serverless) |
| **SSE MCP** | Server-Sent Events | ❌ | Claude AI / ChatGPT connectors | Railway (always-on) |
| **SSE Streaming MCP** | Server-Sent Events | ✅ | Claude AI / ChatGPT connectors (with real-time streaming) | Railway (always-on) |

**All methods share:**
- Same Supabase database
- Same RAG knowledge base
- Same multi-turn conversation support
- Same citation system
- Same 3 core tools: `new_conversation`, `reply_to_conversation`, `list_conversations`

---

## Quick Decision Matrix

### I want to use David-GPT in...

| Use Case | Choose This | Already Deployed? |
|----------|-------------|-------------------|
| **Claude Code / Cursor** | stdio MCP | ✅ Yes |
| **Python/JavaScript app** | HTTP API | ✅ Yes |
| **Claude.ai web (no streaming)** | SSE MCP | ✅ Yes |
| **Claude.ai web (with streaming)** | SSE Streaming MCP | ✅ Yes |
| **ChatGPT custom GPT** | HTTP API or SSE MCP | ✅ Yes |
| **ChatGPT custom GPT (streaming)** | SSE Streaming MCP | ✅ Yes |

---

## Transport Protocols

### 1. stdio (Local)

**What:** MCP server using standard input/output streams
**For:** Local development tools (Claude Code, Cursor, etc.)
**Hosting:** Your local machine
**Cost:** Free

#### Configuration

**File:** `.cursor/mcp.json` or `.mcp.json`

```json
{
  "mcpServers": {
    "david-gpt": {
      "type": "stdio",
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

#### Usage

```bash
# Start Next.js dev server (required)
pnpm dev

# In Claude Code or Cursor, simply ask:
# "What is Leia technology?"
# The MCP server is invoked automatically
```

#### Status
- ✅ Production ready
- ✅ Already configured
- ✅ No deployment needed

---

### 2. HTTP API

**What:** RESTful API exposing MCP functionality
**For:** Programmatic access from any application
**Hosting:** Vercel (serverless)
**Cost:** Free (Hobby plan)

#### Endpoints

**Base URL:** `https://david-gpt-orpin.vercel.app/api/mcp-bridge`

**Available Actions:**
- `new_conversation` - Start new conversation
- `reply_to_conversation` - Continue existing conversation
- `list_conversations` - List recent conversations

#### Usage Example (Python)

```python
import requests

# New conversation
response = requests.post(
    "https://david-gpt-orpin.vercel.app/api/mcp-bridge",
    json={
        "action": "new_conversation",
        "message": "What is Leia technology?",
        "persona": "david"
    }
)

data = response.json()
print(data["response"])  # Cited response
print(f"Citations: {data['citations_count']}")

# Follow-up (maintains context)
response = requests.post(
    "https://david-gpt-orpin.vercel.app/api/mcp-bridge",
    json={
        "action": "reply_to_conversation",
        "conversation_id": data["conversation_id"],
        "message": "Tell me more about 3D Cell"
    }
)
```

#### Usage with Claude API

```python
from anthropic import Anthropic

client = Anthropic(api_key="sk-ant-...")

# Define tool
tools = [{
    "name": "ask_david_gpt",
    "description": "Query David's RAG knowledge base about 3D displays, Leia technology, AI, and computer vision",
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {"type": "string", "description": "Question for the RAG system"}
        },
        "required": ["message"]
    }
}]

# Use in conversation
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    tools=tools,
    messages=[{"role": "user", "content": "What is Leia technology?"}]
)
```

#### CORS Headers
✅ Fully configured for cross-origin requests:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

#### Status
- ✅ Production ready
- ✅ Deployed to Vercel
- ✅ CORS enabled
- 📚 Full example: `examples/claude-api-integration.py`

---

### 3. SSE (Server-Sent Events)

**What:** MCP server using SSE transport for persistent connections
**For:** Claude AI and ChatGPT custom connectors
**Hosting:** Railway (always-on server)
**Cost:** ~$5/month

#### Endpoints

**Base URL:** `https://mcp-server-production-6a46.up.railway.app`

- **SSE Endpoint:** `/sse` - Long-lived connection for MCP protocol
- **Message Endpoint:** `/message` - Handles incoming MCP messages
- **Health Check:** `/health` - Service status

#### Available Modes

**Standard Mode (No Streaming):**
```bash
# Start command
pnpm mcp-sse-server

# Behavior: Buffers entire response, sends when complete
```

**Streaming Mode (Real-time):**
```bash
# Start command
pnpm mcp-sse-streaming

# Behavior: Streams tokens as they're generated
```

#### Configuration for Claude AI

1. **Go to:** https://claude.ai/settings/connectors
2. **Add Custom Connector:**
   - **Name:** David-GPT RAG
   - **Description:** Query David's knowledge base about 3D displays, Leia technology, AI, and computer vision
   - **Server URL:** `https://mcp-server-production-6a46.up.railway.app/sse`
   - **Authentication:** None (or add OAuth if implemented)

3. **Enable connector** and test with: "What is Leia technology?"

#### Configuration for ChatGPT

ChatGPT supports both HTTP and SSE for custom GPTs:

**Using SSE (Recommended for Streaming):**
1. Create Custom GPT
2. Add Action:
   - **Server URL:** `https://mcp-server-production-6a46.up.railway.app/sse`
   - **Method:** SSE
   - **Tools:** Auto-detected from MCP server

**Using HTTP (Simpler):**
1. Create Custom GPT
2. Add Action:
   - **URL:** `https://david-gpt-orpin.vercel.app/api/mcp-bridge`
   - **Method:** POST
   - **Schema:** (see HTTP API section)

#### Status
- ✅ Production ready
- ✅ Deployed to Railway
- ✅ Standard + Streaming modes available
- ✅ CORS configured

---

## Streaming Support

### How Streaming Works

**Standard (Buffered):**
```
Client → SSE Server → Chat API → [Buffer Complete Response] → Send All At Once
                                          ↓
                                   User waits 2-5 seconds
```

**Streaming (Progressive):**
```
Client → SSE Server → Chat API → [Stream Token Events] → Display Progressive Text
                                          ↓
                                   token → token → token → complete
                                          ↓
                                   First token in ~200-500ms
```

### SSE Event Types (Streaming Mode Only)

#### 1. Start Event
```json
{
  "type": "start",
  "timestamp": "2025-10-16T...",
  "data": {
    "conversation_id": "uuid",
    "session_id": "sse-..."
  }
}
```

#### 2. Token Event (Real-time)
```json
{
  "type": "token",
  "timestamp": "2025-10-16T...",
  "data": {
    "token": "Leia technology "
  }
}
```

#### 3. Citation Event
```json
{
  "type": "citation",
  "timestamp": "2025-10-16T...",
  "data": {
    "docRef": "[^doc_123:section]",
    "title": "Leia Display Whitepaper",
    "url": "https://..."
  }
}
```

#### 4. Complete Event
```json
{
  "type": "complete",
  "timestamp": "2025-10-16T...",
  "data": {
    "response": "Full response text...",
    "citations_count": 5
  }
}
```

### User Experience Comparison

**Without Streaming (Standard):**
```
User: What is Leia technology?
[3 second wait]
Assistant: [Full 500 word response appears at once]
```

**With Streaming:**
```
User: What is Leia technology?
Assistant: Leia▊
Assistant: Leia technology▊
Assistant: Leia technology is a▊
Assistant: Leia technology is a revolutionary▊
...
[Text appears progressively, like typing]
```

### When to Use Streaming

| Use Case | Recommendation |
|----------|---------------|
| **ChatGPT Custom GPT** | ✅ Use streaming for better UX |
| **Claude AI Custom Connector** | ✅ Use streaming for better UX |
| **Python/JavaScript App** | ⚠️ Use HTTP API (simpler) |
| **Local Development** | ⚠️ Use stdio (no streaming needed) |

---

## Deployment Architecture

### Current Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│ LOCAL MACHINE                                           │
│  • stdio MCP server (Claude Code/Cursor)               │
│  • pnpm mcp-server                                      │
│  • Calls: http://localhost:3000/api/chat               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ VERCEL (Serverless)                                     │
│  • Next.js frontend                                     │
│  • HTTP API Bridge: /api/mcp-bridge                     │
│  • Chat API: /api/chat                                  │
│  • URL: https://david-gpt-orpin.vercel.app             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ RAILWAY (Always-On)                                     │
│  • SSE MCP Server (Standard): pnpm mcp-sse-server      │
│  • SSE MCP Server (Streaming): pnpm mcp-sse-streaming  │
│  • Document extraction workers                          │
│  • Redis server (BullMQ)                                │
│  • URL: https://mcp-server-production-6a46.up.railway.app │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SUPABASE (Shared Database)                              │
│  • PostgreSQL + pgvector                                │
│  • RAG documents and chunks                             │
│  • Conversations and messages                           │
│  • User profiles and personas                           │
└─────────────────────────────────────────────────────────┘
```

### Request Flow

**Local Development (stdio):**
```
Claude Code → stdio MCP → localhost:3000/api/chat → Supabase
```

**Programmatic Access (HTTP API):**
```
Python/JS App → Vercel HTTP API → Supabase
```

**Claude AI Custom Connector (SSE):**
```
Claude.ai → Railway SSE MCP → Vercel /api/chat → Supabase
```

**ChatGPT Custom GPT (SSE Streaming):**
```
ChatGPT → Railway SSE Streaming MCP → Vercel /api/chat → Supabase
                    ↓
          [Streams tokens in real-time]
```

---

## Usage Examples

### Example 1: Local Development (stdio)

```bash
# 1. Start Next.js dev server
pnpm dev

# 2. In Claude Code, ask:
# "What is Leia technology?"

# Behind the scenes:
# Claude Code → stdio MCP → http://localhost:3000/api/chat → Response with citations
```

### Example 2: Python Application (HTTP API)

```python
import requests

conversation_id = None

def ask_david_gpt(message):
    global conversation_id

    response = requests.post(
        "https://david-gpt-orpin.vercel.app/api/mcp-bridge",
        json={
            "action": "reply_to_conversation" if conversation_id else "new_conversation",
            "conversation_id": conversation_id,
            "message": message,
            "persona": "david"
        }
    )

    data = response.json()
    if "conversation_id" in data:
        conversation_id = data["conversation_id"]

    return data["response"]

# Multi-turn conversation
print(ask_david_gpt("What is Leia technology?"))
print(ask_david_gpt("How does 3D Cell work?"))
print(ask_david_gpt("What are the advantages?"))
```

### Example 3: Claude AI Custom Connector (SSE)

```
1. Configure connector in Claude.ai:
   - Name: David-GPT RAG
   - URL: https://mcp-server-production-6a46.up.railway.app/sse

2. Enable connector in chat

3. Ask: "What is Leia technology?"

4. Claude automatically:
   - Detects it needs domain knowledge
   - Calls SSE MCP server via new_conversation tool
   - Receives cited response from RAG system
   - Presents answer to user with sources
```

### Example 4: ChatGPT Custom GPT with Streaming (SSE)

```
1. Create Custom GPT in ChatGPT

2. Add Action:
   - Type: Server-Sent Events
   - URL: https://mcp-server-production-6a46.up.railway.app/sse
   - Tools: Auto-discovered (new_conversation, reply_to_conversation, list_conversations)

3. User asks: "What is Leia technology?"

4. ChatGPT:
   - Calls SSE streaming MCP server
   - Receives tokens in real-time
   - Displays progressive response: "Leia..." → "Leia technology..." → [full answer]
   - Shows citations when complete
```

---

## Comparison Tables

### By Transport Protocol

| Feature | stdio | HTTP API | SSE (Standard) | SSE (Streaming) |
|---------|-------|----------|----------------|-----------------|
| **Real-time Streaming** | ❌ | ❌ | ❌ | ✅ |
| **Multi-turn Context** | ✅ | ✅ | ✅ | ✅ |
| **Citations** | ✅ | ✅ | ✅ | ✅ |
| **Deployment** | Local | Vercel | Railway | Railway |
| **Cost** | Free | Free | ~$5/mo | ~$5/mo |
| **Setup Complexity** | Low | Low | Medium | Medium |
| **Best For** | Dev tools | Apps | Basic connectors | Advanced connectors |

### By Client Platform

| Platform | Recommended Method | Alternative | Streaming? |
|----------|-------------------|-------------|------------|
| **Claude Code** | stdio MCP | N/A | ❌ |
| **Cursor** | stdio MCP | N/A | ❌ |
| **Claude.ai** | SSE Streaming MCP | SSE Standard MCP | ✅ |
| **ChatGPT** | SSE Streaming MCP | HTTP API | ✅ |
| **Python App** | HTTP API | N/A | ❌ |
| **JavaScript App** | HTTP API | N/A | ❌ |
| **Custom UI** | HTTP API | N/A | ❌ |

### By Hosting Platform

| Platform | Services | Cost | Best For |
|----------|----------|------|----------|
| **Local Machine** | stdio MCP | Free | Development |
| **Vercel** | HTTP API, Chat API | Free | Programmatic access |
| **Railway** | SSE MCP (Standard + Streaming) | ~$5/mo | AI assistants |
| **Supabase** | Database (shared by all) | Free/Paid | Data storage |

---

## Troubleshooting

### stdio MCP Issues

**Problem:** MCP server won't start in Claude Code
```bash
# Solution 1: Check Next.js is running
pnpm dev

# Solution 2: Test MCP server directly
pnpm mcp-server

# Solution 3: Check environment variables
cat .env.local | grep SUPABASE
```

---

### HTTP API Issues

**Problem:** CORS errors when calling from browser
```bash
# Solution: CORS is already configured
# Verify headers:
curl -X OPTIONS https://david-gpt-orpin.vercel.app/api/mcp-bridge -i

# Should show:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, OPTIONS
```

**Problem:** 500 Internal Server Error
```bash
# Check Vercel logs
vercel logs --follow

# Verify environment variables in Vercel dashboard
# Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
```

---

### SSE MCP Issues

**Problem:** Claude.ai can't connect to connector
```bash
# Test SSE endpoint
curl -N https://mcp-server-production-6a46.up.railway.app/sse

# Check Railway logs
railway logs --service mcp-server --follow

# Verify environment variables
railway variables --service mcp-server
```

**Problem:** No streaming (tokens appear all at once)
```bash
# Check start command in Railway
# Should be: pnpm mcp-sse-streaming (NOT pnpm mcp-sse-server)

# Update via Railway CLI:
railway variables set START_COMMAND="pnpm mcp-sse-streaming" --service mcp-server

# Or update start.sh to route to streaming server
```

---

### General Issues

**Problem:** No citations in responses
```sql
-- Check documents exist for persona
SELECT COUNT(*) FROM docs WHERE personas @> '["david"]';

-- Check chunks exist
SELECT COUNT(*) FROM chunks WHERE doc_id IN (
  SELECT id FROM docs WHERE personas @> '["david"]'
);
```

**Problem:** Slow responses (>10 seconds)
```bash
# Check Supabase query performance
# Check Vercel function timeout (60s on Hobby, 300s on Pro)
# Consider upgrading Vercel plan for longer timeout
```

---

## Quick Start Checklist

### For Local Development (stdio)
- [x] stdio MCP configured in `.cursor/mcp.json`
- [x] Next.js dev server running (`pnpm dev`)
- [x] Ask question in Claude Code
- [x] Verify response includes citations

### For Programmatic Access (HTTP API)
- [x] HTTP API deployed to Vercel
- [x] Test endpoint with curl or Postman
- [x] Copy example code from `examples/claude-api-integration.py`
- [x] Run and verify responses

### For Claude AI (SSE)
- [x] SSE MCP deployed to Railway
- [x] Health check passes
- [x] Custom connector configured in Claude.ai
- [x] Test with sample query
- [x] Verify citations appear

### For ChatGPT (SSE Streaming)
- [x] SSE Streaming MCP deployed to Railway
- [x] Custom GPT created
- [x] Action configured with SSE endpoint
- [x] Test query shows progressive streaming
- [x] Verify citations in final response

---

## Resources

### Documentation
- **This Guide:** `DOCS/MCP-INTEGRATION-GUIDE.md`
- **stdio MCP:** `.cursor/mcp.json`
- **HTTP API Code:** `src/app/api/mcp-bridge/route.ts`
- **SSE MCP Code:** `src/mcp-server/sse-server.ts`
- **SSE Streaming Code:** `src/mcp-server/sse-streaming-server.ts`
- **Python Example:** `examples/claude-api-integration.py`

### Endpoints
- **HTTP API:** `https://david-gpt-orpin.vercel.app/api/mcp-bridge`
- **SSE MCP:** `https://mcp-server-production-6a46.up.railway.app/sse`
- **Health Check:** `https://mcp-server-production-6a46.up.railway.app/health`

### External Resources
- **MCP Specification:** https://modelcontextprotocol.io/
- **Claude Custom Connectors:** https://support.claude.com/en/articles/11175166
- **ChatGPT Custom GPTs:** https://help.openai.com/en/articles/8554407
- **Railway Docs:** https://docs.railway.app/
- **Vercel Docs:** https://vercel.com/docs

---

## Summary

David-GPT MCP integration provides **four ways** to access the RAG system:

1. **stdio MCP** (Local) - For Claude Code, Cursor → `pnpm mcp-server`
2. **HTTP API** (Vercel) - For Python/JS apps → `POST /api/mcp-bridge`
3. **SSE MCP** (Railway) - For Claude AI, ChatGPT → `/sse`
4. **SSE Streaming MCP** (Railway) - For real-time streaming → `/sse` with `pnpm mcp-sse-streaming`

All methods:
- ✅ Share same Supabase database
- ✅ Support multi-turn conversations
- ✅ Return cited responses
- ✅ Use same 3 core tools
- ✅ Production ready and deployed

Choose based on your use case - local development, programmatic access, or AI assistant integration.
