# Claude AI Integration Guide

This guide explains how to integrate David-GPT RAG system with Claude AI using two different approaches.

## Understanding the Two Approaches

### Approach 1: HTTP API with Tool Calling (✅ Currently Available)

**What we have**: REST API at `/api/mcp-bridge` that can be called programmatically

**Use case**: Building applications that use Claude API with tool calling
- Python/JavaScript applications
- Custom workflows and automations
- Integration into your own applications
- Full programmatic control

**Deployment**: Already works on Vercel serverless (deployed now)

**Status**: ✅ **Production ready and tested**

---

### Approach 2: Custom Connectors (Remote MCP Server)

**What this needs**: Remote MCP server using SSE (Server-Sent Events) transport

**Use case**: Direct integration with Claude.ai web interface
- No coding required
- Add as connector in Claude.ai settings
- Works in Claude Pro/Max/Team/Enterprise plans
- Users interact directly through Claude.ai

**Deployment**: Requires always-on server (Railway, Fly.io, or VPS) - not Vercel serverless

**Status**: ⚠️ **Not yet implemented** (would require additional development)

---

## Approach 1: Using HTTP API with Claude Tool Calling (Recommended)

This approach works **today** and is already deployed to Vercel.

### Prerequisites

- Claude API key from https://console.anthropic.com/
- Python 3.8+ or Node.js 18+ (depending on your language)
- Access to your deployed API: `https://david-gpt-orpin.vercel.app/api/mcp-bridge`

### Step 1: Install Dependencies

**Python:**
```bash
pip install anthropic requests
```

**JavaScript/TypeScript:**
```bash
npm install @anthropic-ai/sdk node-fetch
```

### Step 2: Set Your API Key

```bash
# Add to your environment
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Step 3: Define the Tool for Claude

**Python:**
```python
from anthropic import Anthropic
import requests

# Initialize Claude client
client = Anthropic(api_key="sk-ant-...")

# Define the David-GPT tool
tools = [
    {
        "name": "ask_david_gpt",
        "description": """Query David's RAG knowledge base about 3D displays, Leia technology,
        computer vision, AI, and related technical topics. Returns cited responses from
        technical documents, patents, and research papers.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Question or query for the RAG system"
                }
            },
            "required": ["message"]
        }
    }
]
```

**JavaScript/TypeScript:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const tools = [
  {
    name: "ask_david_gpt",
    description: `Query David's RAG knowledge base about 3D displays, Leia technology,
    computer vision, AI, and related technical topics. Returns cited responses from
    technical documents, patents, and research papers.`,
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Question or query for the RAG system"
        }
      },
      required: ["message"]
    }
  }
];
```

### Step 4: Implement the Tool Handler

**Python:**
```python
# Your API endpoint
API_URL = "https://david-gpt-orpin.vercel.app/api/mcp-bridge"

# Track conversation for context
conversation_id = None

def call_david_gpt_tool(message: str) -> dict:
    """Call David-GPT via HTTP API"""
    global conversation_id

    if conversation_id:
        # Continue existing conversation
        response = requests.post(API_URL, json={
            "action": "reply_to_conversation",
            "conversation_id": conversation_id,
            "message": message
        })
    else:
        # Start new conversation
        response = requests.post(API_URL, json={
            "action": "new_conversation",
            "message": message,
            "persona": "david"
        })

    response.raise_for_status()
    data = response.json()

    # Save conversation ID for follow-ups
    if "conversation_id" in data:
        conversation_id = data["conversation_id"]

    return {
        "response": data["response"],
        "citations": data.get("citations", []),
        "citations_count": data.get("citations_count", 0)
    }
```

**JavaScript/TypeScript:**
```typescript
const API_URL = "https://david-gpt-orpin.vercel.app/api/mcp-bridge";
let conversationId: string | null = null;

async function callDavidGptTool(message: string) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      conversationId
        ? {
            action: 'reply_to_conversation',
            conversation_id: conversationId,
            message
          }
        : {
            action: 'new_conversation',
            message,
            persona: 'david'
          }
    )
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.conversation_id) {
    conversationId = data.conversation_id;
  }

  return {
    response: data.response,
    citations: data.citations || [],
    citations_count: data.citations_count || 0
  };
}
```

### Step 5: Create the Conversation Loop

**Python:**
```python
def chat_with_claude(user_message: str) -> str:
    """Have a conversation with Claude that can query David-GPT"""

    messages = [{"role": "user", "content": user_message}]

    # Call Claude with tools
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2048,
        tools=tools,
        messages=messages
    )

    # Process tool calls
    while response.stop_reason == "tool_use":
        # Find the tool use block
        tool_use = next(block for block in response.content if block.type == "tool_use")

        print(f"🔧 Claude is using tool: {tool_use.name}")
        print(f"   Query: {tool_use.input['message']}\n")

        # Call David-GPT
        result = call_david_gpt_tool(tool_use.input["message"])

        print(f"📚 David-GPT Response Preview:")
        print(f"   {result['response'][:200]}...")
        print(f"   Citations: {result['citations_count']}\n")

        # Return result to Claude
        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result["response"]
            }]
        })

        # Continue conversation
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            tools=tools,
            messages=messages
        )

    # Get final response
    final_text = next(
        (block.text for block in response.content if hasattr(block, "text")),
        None
    )

    print(f"🤖 CLAUDE: {final_text}\n")
    return final_text
```

**JavaScript/TypeScript:**
```typescript
async function chatWithClaude(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage }
  ];

  let response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    tools,
    messages
  });

  while (response.stop_reason === "tool_use") {
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) break;

    console.log(`🔧 Claude is using tool: ${toolUse.name}`);
    console.log(`   Query: ${toolUse.input.message}\n`);

    const result = await callDavidGptTool(toolUse.input.message);

    console.log(`📚 David-GPT Response Preview:`);
    console.log(`   ${result.response.substring(0, 200)}...`);
    console.log(`   Citations: ${result.citations_count}\n`);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.response
      }]
    });

    response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      tools,
      messages
    });
  }

  const finalText = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  )?.text;

  console.log(`🤖 CLAUDE: ${finalText}\n`);
  return finalText || "";
}
```

### Step 6: Use It!

**Python:**
```python
if __name__ == "__main__":
    # Example conversation
    chat_with_claude("What is Leia technology and how does it work?")

    # Follow-up question (uses conversation context)
    chat_with_claude("What are the advantages of the 3D Cell approach?")

    # Ask Claude to summarize
    chat_with_claude("Can you summarize the key innovations in simple terms?")
```

**JavaScript/TypeScript:**
```typescript
async function main() {
  await chatWithClaude("What is Leia technology and how does it work?");

  // Follow-up question (uses conversation context)
  await chatWithClaude("What are the advantages of the 3D Cell approach?");

  // Ask Claude to summarize
  await chatWithClaude("Can you summarize the key innovations in simple terms?");
}

main();
```

### Example Output

```
🔧 Claude is using tool: ask_david_gpt
   Query: What is Leia technology and how does it work?

📚 David-GPT Response Preview:
   Leia technology refers to a revolutionary approach to glasses-free 3D displays...
   Citations: 5

🤖 CLAUDE: Based on my research, Leia technology represents a breakthrough in
3D display technology. The system uses diffractive lightfield backlighting to
create glasses-free 3D experiences...
```

### Testing Your Integration

1. **Test the API endpoint first:**
```bash
curl -X POST https://david-gpt-orpin.vercel.app/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{
    "action": "new_conversation",
    "message": "What is Leia technology?",
    "persona": "david"
  }'
```

2. **Run the example code** (see `examples/claude-api-integration.py`)

3. **Check for citations** in the response - they validate RAG is working

### Complete Working Example

See **`examples/claude-api-integration.py`** in the repository for a complete, tested example.

---

## Approach 2: Custom Connectors (Remote MCP Server)

⚠️ **This approach requires additional implementation work.**

### What's Needed

To support Claude AI custom connectors (claude.ai web interface), we need to:

1. **Implement MCP over SSE Transport**
   - Current MCP server uses stdio (stdin/stdout)
   - Custom connectors need SSE (Server-Sent Events) over HTTP
   - Requires persistent connections (not compatible with Vercel serverless)

2. **Deploy to Always-On Server**
   - Railway.app
   - Fly.io
   - DigitalOcean
   - AWS EC2 / GCP Compute / Azure VM

3. **Add OAuth Authentication** (optional but recommended)
   - Client ID and Client Secret
   - OAuth flow for user authorization
   - Token management

### Implementation Steps (If You Want This)

**Step 1: Extend MCP Server with SSE Transport**
```typescript
// src/mcp-server/sse.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
const server = new Server(/* tools definition */);

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

app.post('/message', async (req, res) => {
  // Handle incoming messages
});

app.listen(3001);
```

**Step 2: Deploy to Railway/Fly.io**
```bash
# railway.json or fly.toml configuration
# Deploy command: railway up or flyctl deploy
```

**Step 3: Configure in Claude.ai**
1. Go to https://claude.ai/settings/connectors
2. Click "Add Custom Connector"
3. Enter your server URL: `https://your-app.railway.app/sse`
4. (Optional) Add OAuth credentials
5. Enable the connector

### Which Approach Should You Use?

| Feature | HTTP API (Approach 1) | Custom Connector (Approach 2) |
|---------|----------------------|------------------------------|
| **Deployment** | ✅ Vercel (already done) | ❌ Needs separate server |
| **Cost** | ✅ Free/cheap | 💰 $5-20/month for hosting |
| **Use in claude.ai** | ❌ No | ✅ Yes |
| **Use in your apps** | ✅ Yes | ❌ No |
| **Programmatic access** | ✅ Full control | ❌ Limited |
| **Setup complexity** | ✅ Simple | ⚠️ Moderate |
| **Current status** | ✅ Production ready | ⚠️ Needs development |

### Recommendation

**Start with Approach 1 (HTTP API with Tool Calling)** because:
- ✅ Already implemented and tested
- ✅ More flexible and powerful
- ✅ No additional hosting costs
- ✅ Works on Vercel serverless
- ✅ Full programmatic control
- ✅ Can build custom UIs

**Consider Approach 2 (Custom Connector)** if:
- You specifically need claude.ai web interface integration
- You have users who need direct Claude.ai access
- You're willing to maintain a separate always-on server
- You need the connector UI/UX in Claude Pro/Max/Team/Enterprise

---

## Security Considerations

### For Production Deployment

**1. Add API Key Authentication**
```typescript
// src/middleware/auth.ts
export function requireApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== process.env.MCP_BRIDGE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

**2. Implement Rate Limiting**
```bash
# Install Upstash Redis
npm install @upstash/ratelimit @upstash/redis

# Add to Vercel environment variables
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

**3. Configure CORS**
```typescript
// Only allow specific domains
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'http://localhost:3000'
];
```

**4. Monitor Usage**
- Log all API calls
- Track conversation counts
- Set up alerts for anomalies
- Monitor Vercel analytics

---

## Troubleshooting

### Common Issues

**1. API Returns 401 Unauthorized**
- Check your ANTHROPIC_API_KEY is valid
- Verify API key has correct permissions
- Check Anthropic console for usage limits

**2. API Returns 500 Error**
- Check Vercel logs: `vercel logs`
- Verify Supabase credentials are set
- Check NEXT_PUBLIC_APP_URL is correct

**3. No Citations in Response**
- Verify RAG documents are ingested
- Check persona has documents in knowledge base
- Review Supabase documents table

**4. Timeout Errors**
- Vercel serverless has 60s limit (Hobby plan)
- Upgrade to Pro for 300s timeout
- Or implement response streaming

### Getting Help

- Check API logs: `vercel logs --follow`
- Test API directly: `curl https://your-app.vercel.app/api/mcp-bridge`
- Review documentation: `DOCS/MCP-BRIDGE-API.md`
- Test script: `node scripts/test-mcp-bridge.js`

---

## Next Steps

### Using HTTP API (Recommended)

1. ✅ API is already deployed to Vercel
2. Copy example code from `examples/claude-api-integration.py`
3. Add your ANTHROPIC_API_KEY
4. Run and test your integration
5. Build your application!

### Implementing Custom Connector (Optional)

If you need claude.ai web interface integration, let me know and I can:
1. Implement MCP server with SSE transport
2. Set up Railway/Fly.io deployment
3. Add OAuth authentication
4. Provide setup instructions for Claude.ai

---

## Resources

- **API Documentation**: `DOCS/MCP-BRIDGE-API.md`
- **Test Script**: `scripts/test-mcp-bridge.js`
- **Python Example**: `examples/claude-api-integration.py`
- **Claude API Docs**: https://docs.anthropic.com/claude/reference/messages_post
- **MCP Specification**: https://modelcontextprotocol.io/
- **Claude Custom Connectors**: https://support.claude.com/en/articles/11175166
