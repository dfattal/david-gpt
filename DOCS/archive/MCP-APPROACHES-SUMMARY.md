# David-GPT MCP Integration - Complete Summary

This document summarizes all three approaches for accessing the David-GPT RAG system, explaining when to use each one.

## Three Ways to Access David-GPT

### 1. Local MCP Server (stdio) ✅ Already Working

**What:** MCP server using stdin/stdout transport
**For:** Local development tools (Claude Code, Cursor, etc.)
**Deployment:** Runs on your local machine
**Cost:** Free

**How to use:**
```bash
# Start the MCP server
pnpm mcp-server

# Configure in .cursor/mcp.json or .mcp.json
{
  "mcpServers": {
    "david-gpt": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["mcp-server"]
    }
  }
}
```

**Status:** ✅ Production ready

---

### 2. HTTP API Bridge (REST) ✅ Already Deployed

**What:** RESTful HTTP API exposing MCP functionality
**For:** Programmatic access (Python/JavaScript applications)
**Deployment:** Vercel serverless (already deployed)
**Cost:** Free (Hobby plan)

**How to use:**
```python
import requests
from anthropic import Anthropic

# Call the HTTP API
response = requests.post(
    "https://david-gpt-orpin.vercel.app/api/mcp-bridge",
    json={
        "action": "new_conversation",
        "message": "What is Leia technology?",
        "persona": "david"
    }
)

# Use with Claude API tool calling
client = Anthropic(api_key="sk-ant-...")
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    tools=[...],  # Define ask_david_gpt tool
    messages=[...]
)
```

**Status:** ✅ Production ready
**Docs:** `DOCS/CLAUDE-AI-INTEGRATION.md`, `DOCS/MCP-BRIDGE-API.md`
**Example:** `examples/claude-api-integration.py`

---

### 3. MCP SSE Server (Railway) 🆕 Ready to Deploy

**What:** MCP server using Server-Sent Events (SSE) transport
**For:** Claude.ai web interface (custom connectors)
**Deployment:** Railway (alongside your existing workers)
**Cost:** ~$5/month (Railway Hobby plan)

**How to deploy:**
```bash
# 1. Push code to GitHub
git push origin main

# 2. In Railway dashboard:
#    - Add new service from your repo
#    - Use railway-mcp.json configuration
#    - Copy environment variables from workers

# 3. In Claude.ai:
#    - Settings → Connectors → Add Custom Connector
#    - Server URL: https://your-service.railway.app/sse
#    - Enable "David-GPT RAG" connector
```

**Status:** 🆕 Code ready, needs deployment
**Docs:** `DOCS/RAILWAY-MCP-DEPLOYMENT.md`
**Code:** `src/mcp-server/sse-server.ts`

---

## Quick Comparison

| Feature | Local MCP (stdio) | HTTP API | Railway MCP (SSE) |
|---------|------------------|----------|-------------------|
| **Use in Claude Code** | ✅ Yes | ❌ No | ❌ No |
| **Use in Claude.ai** | ❌ No | ❌ No | ✅ Yes |
| **Use in Python/JS** | ❌ No | ✅ Yes | ❌ No |
| **Deployment** | Local machine | Vercel | Railway |
| **Cost** | Free | Free | ~$5/month |
| **Setup** | Easy | Easy | Moderate |
| **Status** | ✅ Working | ✅ Working | 🆕 Ready |

## Which Approach Should You Use?

### For Development (Claude Code, Cursor)
→ **Use Local MCP (stdio)**
- Already configured and working
- No deployment needed
- Perfect for local development

### For Applications (Python, JavaScript, etc.)
→ **Use HTTP API**
- Already deployed to Vercel
- Simple REST API
- Full programmatic control
- Complete examples provided

### For Claude.ai Web Interface
→ **Use Railway MCP (SSE)**
- Enables custom connectors in Claude.ai
- No coding required for end users
- Leverages existing Railway infrastructure
- Follow deployment guide

### Deploy All Three?
→ **Yes! They complement each other**
- All share the same Supabase database
- All use the same RAG knowledge base
- All support multi-turn conversations
- All return cited responses

## Your Current Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│ LOCAL MACHINE                                           │
│  • MCP stdio server (Claude Code/Cursor)               │
│  • Development environment                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ VERCEL (Currently Deployed)                             │
│  • Next.js frontend                                     │
│  • HTTP API Bridge (/api/mcp-bridge)                    │
│  • Chat API (/api/chat)                                 │
│  • Admin interface                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ RAILWAY (Currently Deployed)                            │
│  • Document extraction workers                          │
│  • Redis server (BullMQ)                                │
│  • Background job processing                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │ NEW: MCP SSE Server (Ready to Deploy)            │  │
│  │  • SSE transport for Claude.ai                   │  │
│  │  • Shares Redis and environment                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SUPABASE (Shared by All)                                │
│  • PostgreSQL + pgvector                                │
│  • RAG documents and chunks                             │
│  • Conversations and messages                           │
│  • User data and personas                               │
└─────────────────────────────────────────────────────────┘
```

## Architecture Benefits

### Shared Database
All approaches use the same Supabase database:
- Conversations are synchronized across all clients
- Same RAG knowledge base for consistent answers
- Citations work the same everywhere

### Independent Deployments
Each approach is independently deployable:
- Local MCP: No deployment needed
- HTTP API: Already on Vercel
- SSE MCP: Deploy to Railway when needed

### Complementary Use Cases
Each serves a different audience:
- **Developers**: Use HTTP API for applications
- **Claude Code users**: Use local stdio MCP
- **Claude.ai users**: Use Railway SSE MCP

## Next Steps

### Option 1: Keep Current Setup (HTTP API Only)
If you only need programmatic access (Python/JS apps):
- ✅ Already working on Vercel
- ✅ No additional deployment needed
- ✅ No additional costs
- Use examples in `DOCS/CLAUDE-AI-INTEGRATION.md`

### Option 2: Deploy Railway MCP (Add Claude.ai Support)
If you want Claude.ai custom connector support:
1. Follow `DOCS/RAILWAY-MCP-DEPLOYMENT.md`
2. Deploy to Railway (~10 minutes)
3. Configure custom connector in Claude.ai
4. Cost: ~$5/month

### Option 3: Deploy Both (Recommended)
Deploy Railway MCP alongside existing HTTP API:
- ✅ Maximum flexibility
- ✅ Serves all use cases
- ✅ Leverages existing infrastructure
- ✅ Minimal additional cost

## Testing Your Setup

### Test Local MCP (stdio)
```bash
# In Claude Code
Ask: "What is Leia technology?"
# Should query David-GPT via local MCP server
```

### Test HTTP API
```bash
# Direct API call
curl -X POST https://david-gpt-orpin.vercel.app/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{"action": "new_conversation", "message": "What is Leia technology?", "persona": "david"}'

# Or run Python example
python examples/claude-api-integration.py
```

### Test Railway MCP (SSE) - After Deployment
```bash
# Health check
curl https://your-service.railway.app/health

# Test in Claude.ai
# Enable "David-GPT RAG" connector
# Ask: "What is Leia technology?"
```

## Documentation Reference

- **HTTP API Guide**: `DOCS/CLAUDE-AI-INTEGRATION.md`
- **HTTP API Reference**: `DOCS/MCP-BRIDGE-API.md`
- **Railway Deployment**: `DOCS/RAILWAY-MCP-DEPLOYMENT.md`
- **MCP Server Code**: `src/mcp-server/`
- **Python Example**: `examples/claude-api-integration.py`
- **Test Script**: `scripts/test-mcp-bridge.js`

## Questions?

### Can I use the HTTP API instead of Railway for Claude.ai?
No. Claude.ai custom connectors specifically require MCP protocol over SSE transport. The HTTP API is for programmatic access only.

### Do I need to deploy both HTTP API and Railway MCP?
No, but it's recommended if you want both programmatic access (HTTP API) and Claude.ai web interface support (Railway MCP).

### Can the Railway MCP server share resources with existing workers?
Yes! They can share the same Railway project, Redis server, and environment variables.

### What's the total cost?
- Local MCP: Free
- HTTP API (Vercel): Free (Hobby plan)
- Railway MCP: ~$5/month (Hobby plan)
- **Total with all three: ~$5/month**

### Which should I prioritize?
1. **HTTP API** (already deployed) - for programmatic access
2. **Railway MCP** (deploy if needed) - for Claude.ai web users
3. **Local MCP** (already working) - for development tools

---

**Summary:** You now have complete flexibility to access David-GPT RAG system from any client - local tools, custom applications, or Claude.ai web interface. All approaches are production-ready and share the same knowledge base.
