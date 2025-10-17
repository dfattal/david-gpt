# Third-Party Integration Guide

**How external users can access David-GPT RAG system remotely**

---

## Quick Start for Third Parties

### For Claude Code / Cursor / Windsurf Users

Add this to your `.mcp.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "david-gpt": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp-server-production-6a46.up.railway.app/sse"
      ]
    }
  }
}
```

**Restart Claude Code/Cursor** and you're done! ✅

---

## What You Get

- **Access to David's knowledge base** about 3D displays, Leia technology, computer vision, AI
- **Three tools:**
  - `new_conversation` - Start new conversation
  - `reply_to_conversation` - Continue with context (last 6 messages)
  - `list_conversations` - View recent conversations
- **Cited responses** with source URLs and document references
- **Multi-turn context** - The bot remembers your conversation

---

## How It Works

```
Your Claude Code (local)
    ↓ stdio
mcp-remote (runs locally via npx)
    ↓ SSE over HTTPS
David-GPT MCP Server (Railway)
    ↓ HTTP
David-GPT Chat API (Vercel)
    ↓
RAG System (Supabase + OpenAI)
    ↓
Cited Response
```

**Behind the scenes:**
1. You ask a question in Claude Code
2. `mcp-remote` forwards it to David-GPT Railway server
3. Railway server queries the RAG knowledge base
4. Response with citations comes back through the chain
5. You see it in Claude Code

---

## Example Usage

### In Claude Code:

**You:** "What is Leia technology?"

**Claude Code (using David-GPT tool):**
```
Using david-gpt → new_conversation

Response:
Leia technology refers to a revolutionary approach to glasses-free 3D displays
developed by Leia Inc. The core innovation is Directional Light Backlight (DLB),
which uses diffractive elements to create multiview 3D experiences[^doc_1:Introduction].

The system employs a 3D Cell technology that combines a backlight, a display panel,
and proprietary optics to deliver autostereoscopic 3D without requiring special
glasses[^doc_2:Technical Overview]...

Sources:
1. [Core Backlight Patent](https://patents.google.com/patent/US10838134B2)
2. [Leia 3D Display Whitepaper](https://...)
```

### Follow-up (with context):

**You:** "How does the multiview approach work?"

**Claude Code:**
```
Using david-gpt → reply_to_conversation (with conversation context)

Response:
Building on the DLB technology mentioned earlier, the multiview approach works by...
[maintains context from previous question]
```

---

## Integration Methods

### Method 1: mcp-remote (Recommended for Devtools)

**Best for:** Claude Code, Cursor, Windsurf, Gemini CLI

```json
{
  "mcpServers": {
    "david-gpt": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp-server-production-6a46.up.railway.app/sse"]
    }
  }
}
```

**Pros:**
- ✅ One-line setup
- ✅ Works in all MCP-compatible tools
- ✅ Automatic updates (npx fetches latest)
- ✅ No authentication needed (currently open)

---

### Method 2: HTTP API (For Programmatic Access)

**Best for:** Python/JavaScript applications

**Endpoint:** `https://david-gpt-orpin.vercel.app/api/mcp-bridge`

**Example (Python):**
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

# Follow-up with context
response = requests.post(
    "https://david-gpt-orpin.vercel.app/api/mcp-bridge",
    json={
        "action": "reply_to_conversation",
        "conversation_id": data["conversation_id"],
        "message": "Tell me more"
    }
)
```

**Example (JavaScript):**
```javascript
// New conversation
const response = await fetch('https://david-gpt-orpin.vercel.app/api/mcp-bridge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'new_conversation',
    message: 'What is Leia technology?',
    persona: 'david'
  })
});

const data = await response.json();
console.log(data.response);
console.log(`Citations: ${data.citations_count}`);
```

**Pros:**
- ✅ Direct HTTP access
- ✅ No MCP client needed
- ✅ CORS enabled
- ✅ Works anywhere

---

### Method 3: Claude.ai Custom Connector

**Best for:** Claude.ai web users (Pro/Team/Enterprise)

**Setup:**
1. Go to https://claude.ai/settings/connectors
2. Click "Add Custom Connector"
3. Configure:
   - **Name:** David-GPT RAG
   - **Description:** Query David's knowledge base about 3D displays, AI, and computer vision
   - **Server URL:** `https://mcp-server-production-6a46.up.railway.app/sse`
4. Enable the connector

**Use in conversation:**
- Click the "Tools" icon
- Enable "David-GPT RAG"
- Ask your question

**Pros:**
- ✅ No setup (just configure once)
- ✅ Works directly in Claude.ai
- ✅ No coding required

---

## API Reference

### Tool: `new_conversation`

Start a new conversation with the RAG bot.

**Input:**
```json
{
  "message": "Your question",
  "persona": "david"  // optional, defaults to "david"
}
```

**Output:**
```json
{
  "conversation_id": "uuid",
  "session_id": "uuid",
  "response": "Cited response text...",
  "citations_count": 5
}
```

---

### Tool: `reply_to_conversation`

Continue existing conversation with context.

**Input:**
```json
{
  "conversation_id": "uuid-from-new-conversation",
  "message": "Follow-up question"
}
```

**Output:**
```json
{
  "response": "Contextual cited response...",
  "citations_count": 3,
  "context_messages": 6  // Number of previous messages used for context
}
```

---

### Tool: `list_conversations`

List recent conversations.

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
      "title": "Conversation about Leia technology",
      "last_message_at": "2025-10-17T12:00:00Z",
      "persona": "david"
    }
  ],
  "count": 5
}
```

---

## Advanced Usage

### Using with Claude API (Tool Calling)

```python
from anthropic import Anthropic
import requests

client = Anthropic(api_key="sk-ant-...")

# Define David-GPT as a tool
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

# Conversation loop
conversation_id = None

def call_david_gpt(message):
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

# Use with Claude
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    tools=tools,
    messages=[{"role": "user", "content": "What is Leia technology?"}]
)

# Handle tool calls
for block in response.content:
    if block.type == "tool_use" and block.name == "ask_david_gpt":
        result = call_david_gpt(block.input["message"])
        print(result)
```

---

## Troubleshooting

### Issue: "Failed to connect to MCP server"

**Check:**
1. Verify Railway server is running: `curl https://mcp-server-production-6a46.up.railway.app/health`
2. Check your internet connection
3. Try updating mcp-remote: `npx -y mcp-remote@latest ...`

---

### Issue: "No tools available"

**Solution:**
1. Restart Claude Code/Cursor after updating `.mcp.json`
2. Check the server is accessible with curl
3. Look for errors in Claude Code console

---

### Issue: "Timeout errors"

**Causes:**
- Complex queries may take 5-15 seconds
- Network latency

**Solution:**
- Wait a bit longer
- Simplify your query
- Check Railway server logs

---

## Security & Usage

### Current Configuration
- ✅ Open access (no authentication required)
- ✅ HTTPS encrypted
- ✅ Hosted on Railway (always-on)
- ✅ Rate limiting: TBD (unlimited for now)

### Future Enhancements
- API key authentication
- Usage quotas
- Request rate limiting
- OAuth support

---

## Support & Feedback

### Resources
- **Main Documentation:** [MCP-INTEGRATION-GUIDE.md](MCP-INTEGRATION-GUIDE.md)
- **API Reference:** [HTTP API](#method-2-http-api-for-programmatic-access)
- **Health Check:** https://mcp-server-production-6a46.up.railway.app/health

### Questions?
- Check if server is running: `curl https://mcp-server-production-6a46.up.railway.app/health`
- Test HTTP API: `curl -X POST https://david-gpt-orpin.vercel.app/api/mcp-bridge -H "Content-Type: application/json" -d '{"action":"new_conversation","message":"test"}'`

---

## Quick Reference

### Endpoints

| Type | URL | Use For |
|------|-----|---------|
| **SSE MCP** | `https://mcp-server-production-6a46.up.railway.app/sse` | mcp-remote, Claude.ai |
| **HTTP API** | `https://david-gpt-orpin.vercel.app/api/mcp-bridge` | Python/JS apps |
| **Health** | `https://mcp-server-production-6a46.up.railway.app/health` | Status check |

### Tools

| Tool | Description | Required Fields |
|------|-------------|-----------------|
| `new_conversation` | Start new conversation | `message` |
| `reply_to_conversation` | Continue with context | `conversation_id`, `message` |
| `list_conversations` | List recent chats | `limit` (optional) |

---

**Ready to use David-GPT? Just add the config above and start asking questions!** 🚀
