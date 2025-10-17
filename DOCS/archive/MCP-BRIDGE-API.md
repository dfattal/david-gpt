# MCP Bridge HTTP API

HTTP API wrapper for the David-GPT MCP server functionality. This allows cloud-based clients (like Claude AI) to access the RAG system over HTTP.

## Base URL

- **Local Development**: `http://localhost:3000/api/mcp-bridge`
- **Production**: `https://david-gpt-orpin.vercel.app/api/mcp-bridge`

## Authentication

Currently no authentication required. For production, consider adding:
- API key authentication
- Rate limiting
- CORS configuration

## Endpoints

### GET /api/mcp-bridge

Get API information and available endpoints.

**Response:**
```json
{
  "service": "David-GPT MCP Bridge",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

### POST /api/mcp-bridge

Execute MCP actions via HTTP.

## Actions

### 1. New Conversation

Start a new conversation with the RAG bot.

**Request:**
```json
{
  "action": "new_conversation",
  "message": "What is Leia technology and how does it work?",
  "persona": "david"
}
```

**Response:**
```json
{
  "conversation_id": "uuid-here",
  "session_id": "uuid-here",
  "response": "Leia technology is...[^doc_1:Introduction]",
  "citations": [
    {
      "docRef": "doc_1",
      "sourceUrl": "https://...",
      "docTitle": "Document Title",
      "docId": "doc-id"
    }
  ],
  "citations_count": 5
}
```

### 2. Reply to Conversation

Continue an existing conversation with context.

**Request:**
```json
{
  "action": "reply_to_conversation",
  "conversation_id": "uuid-from-new-conversation",
  "message": "Tell me more about the 3D Cell technology"
}
```

**Response:**
```json
{
  "response": "The 3D Cell technology...[^doc_2:Main Content]",
  "citations": [...],
  "citations_count": 3,
  "context_messages": 6
}
```

### 3. List Conversations

List recent MCP conversations.

**Request:**
```json
{
  "action": "list_conversations",
  "limit": 10
}
```

**Response:**
```json
{
  "conversations": [
    {
      "conversation_id": "uuid",
      "session_id": "uuid",
      "title": "What is Leia technology",
      "last_message_at": "2025-10-15T12:00:00Z",
      "persona": "david"
    }
  ],
  "count": 5
}
```

## Usage Examples

### cURL

```bash
# New conversation
curl -X POST http://localhost:3000/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{
    "action": "new_conversation",
    "message": "What is Leia technology?",
    "persona": "david"
  }'

# Reply to conversation
curl -X POST http://localhost:3000/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{
    "action": "reply_to_conversation",
    "conversation_id": "your-conversation-id",
    "message": "Tell me more"
  }'

# List conversations
curl -X POST http://localhost:3000/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list_conversations",
    "limit": 5
  }'
```

### Python

```python
import requests

# New conversation
response = requests.post(
    "http://localhost:3000/api/mcp-bridge",
    json={
        "action": "new_conversation",
        "message": "What is Leia technology?",
        "persona": "david"
    }
)
data = response.json()
conversation_id = data["conversation_id"]
print(data["response"])

# Reply to conversation
response = requests.post(
    "http://localhost:3000/api/mcp-bridge",
    json={
        "action": "reply_to_conversation",
        "conversation_id": conversation_id,
        "message": "Tell me more about 3D Cell"
    }
)
print(response.json()["response"])
```

### JavaScript/TypeScript

```typescript
// New conversation
const response = await fetch('http://localhost:3000/api/mcp-bridge', {
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
console.log('Citations:', data.citations);
```

## Claude AI Integration

### Using Claude API with Tool Calling

```python
from anthropic import Anthropic

client = Anthropic(api_key="your-api-key")

# Define the tool
tools = [{
    "name": "ask_david_gpt",
    "description": "Ask David's RAG knowledge base about 3D displays, Leia technology, AI, and related topics. Returns cited responses from technical documents and patents.",
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Question or query for the RAG system"
            },
            "conversation_id": {
                "type": "string",
                "description": "Optional conversation ID for follow-up questions"
            }
        },
        "required": ["message"]
    }
}]

# Use in conversation
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    tools=tools,
    messages=[{
        "role": "user",
        "content": "What is Leia's 3D display technology?"
    }]
)

# Handle tool calls
for block in response.content:
    if block.type == "tool_use" and block.name == "ask_david_gpt":
        # Call your API
        result = requests.post(
            "http://localhost:3000/api/mcp-bridge",
            json={
                "action": "new_conversation",
                "message": block.input["message"]
            }
        )
        # Return result to Claude
        # ... continue conversation with tool result
```

## Error Handling

### Error Response Format

```json
{
  "error": "Error message here"
}
```

### Common Error Codes

- **400 Bad Request**: Invalid action or missing required fields
- **500 Internal Server Error**: Server-side error (check logs)

### Example Error Responses

```json
// Missing required field
{
  "error": "message must be a non-empty string"
}

// Invalid conversation ID
{
  "error": "conversation_id must be a valid UUID string"
}

// Unknown action
{
  "error": "Unknown action: invalid_action"
}
```

## Rate Limiting (Recommended for Production)

Consider implementing rate limiting:

```typescript
// Add to route.ts
import { ratelimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.ip ?? 'anonymous';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }
  // ... rest of handler
}
```

## Security Considerations

### For Production Deployment

1. **Add API Key Authentication**
   ```typescript
   const apiKey = req.headers.get('x-api-key');
   if (apiKey !== process.env.MCP_BRIDGE_API_KEY) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```

2. **Configure CORS**
   ```typescript
   export async function OPTIONS() {
     return new NextResponse(null, {
       headers: {
         'Access-Control-Allow-Origin': 'https://your-allowed-domain.com',
         'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
         'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
       },
     });
   }
   ```

3. **Add Rate Limiting**
   - Use Upstash Redis or Vercel KV
   - Implement per-IP or per-API-key limits

4. **Validate Input**
   - Already implemented basic validation
   - Consider using Zod for schema validation

5. **Monitor Usage**
   - Log all requests
   - Track API key usage
   - Alert on anomalies

## Deployment

### Vercel

1. Push code to GitHub
2. Deploy to Vercel (automatic for connected repos)
3. Set environment variables in Vercel dashboard
4. API will be available at `https://your-app.vercel.app/api/mcp-bridge`

### Environment Variables Required

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Testing

Test the API using the provided test script:

```bash
# Test all endpoints
node scripts/test-mcp-bridge.js

# Or use curl
curl http://localhost:3000/api/mcp-bridge
```

## Differences from MCP Server

| Feature | MCP Server (stdio) | HTTP Bridge |
|---------|-------------------|-------------|
| Transport | stdin/stdout | HTTP/REST |
| Client | Local (Claude Code, Cursor) | Any HTTP client |
| Latency | Very low | Low-Medium |
| Deployment | Local only | Can deploy to cloud |
| Authentication | Not needed | Recommended |
| Use Case | Dev tools | Production APIs |

## Next Steps

1. ✅ API created and documented
2. Test locally with curl/Postman
3. Add authentication for production
4. Deploy to Vercel
5. Configure Claude AI to use the API
6. Add rate limiting and monitoring
