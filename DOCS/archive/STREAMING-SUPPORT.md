# Streaming Support for MCP Servers

This document explains streaming support in David-GPT MCP servers, specifically for ChatGPT and Claude custom connectors.

## Overview

We support **three modes** of MCP server operation:

| Mode | Transport | Streaming | Best For |
|------|-----------|-----------|----------|
| **HTTP API** | HTTP POST | ❌ Buffered | Programmatic access, simple integrations |
| **SSE (Standard)** | Server-Sent Events | ❌ Buffered | Basic custom connectors |
| **SSE (Streaming)** | Server-Sent Events | ✅ Real-time | ChatGPT custom connectors, live updates |

## HTTP vs SSE: Key Differences

### HTTP Mode (REST API)
**File:** `src/app/api/mcp-bridge/route.ts`
**Already deployed:** Vercel

```
Request → Full Response → Connection Closes
```

- **Pros:** Simple, stateless, works anywhere
- **Cons:** No streaming, requires full round trip per request
- **Use for:** Python/JavaScript apps, serverless environments

### SSE Mode (Standard)
**File:** `src/mcp-server/sse-server.ts`
**Deploy to:** Railway

```
Long-lived Connection → Buffered Response → Send at Once
```

- **Pros:** MCP protocol compliance, persistent connection
- **Cons:** No streaming (buffers entire response)
- **Use for:** Basic custom connectors without streaming needs

### SSE Mode (Streaming) ✨ **NEW**
**File:** `src/mcp-server/sse-streaming-server.ts`
**Deploy to:** Railway

```
Long-lived Connection → Stream Tokens as Generated → Real-time Updates
```

- **Pros:** Real-time streaming, progressive display, better UX
- **Cons:** Slightly more complex, needs always-on server
- **Use for:** ChatGPT custom connectors, Claude custom connectors

## How Streaming Works

### Current Flow (Buffered)
```
ChatGPT → SSE Server → Chat API (streams) → [Buffer All] → Send Complete Response
                                                  ↓
                                           Wait for full response
```

### Streaming Flow ✨
```
ChatGPT → SSE Server → Chat API (streams) → [Stream Events] → Display Progressive Tokens
                                                  ↓
                                           token → token → token → complete
                                                  ↓
                                           "Leia" → " technology" → " uses" → " diffractive..." → [DONE]
```

## SSE Event Types

The streaming server emits real-time SSE events:

### 1. **Start Event**
Sent when tool execution begins:
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

### 2. **Token Event**
Sent for each chunk of generated text:
```json
{
  "type": "token",
  "timestamp": "2025-10-16T...",
  "data": {
    "token": "Leia technology "
  }
}
```

### 3. **Citation Event**
Sent when a citation is found:
```json
{
  "type": "citation",
  "timestamp": "2025-10-16T...",
  "data": {
    "docRef": "[^doc_123:section]",
    "title": "Leia Display Whitepaper",
    "url": "..."
  }
}
```

### 4. **Complete Event**
Sent when response generation finishes:
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

### 5. **Error Event**
Sent if an error occurs:
```json
{
  "type": "error",
  "timestamp": "2025-10-16T...",
  "data": {
    "error": "Error message"
  }
}
```

## ChatGPT Integration

ChatGPT custom connectors automatically handle SSE events:

```
User: "What is Leia technology?"
       ↓
ChatGPT calls: new_conversation
       ↓
SSE Server streams:
  event: progress (start)
  event: progress (token: "Leia")
  event: progress (token: " technology")
  event: progress (token: " is a")
  ...
  event: progress (complete)
       ↓
ChatGPT displays: Progressive text appearing in real-time
```

### Example User Experience

**Without Streaming (Buffered):**
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

## Deployment Options

### Option 1: Standard SSE (No Streaming)
```bash
# Railway deployment
pnpm mcp-sse-server

# Benefits:
✓ Simpler implementation
✓ Works for basic use cases
✓ Lower complexity

# Drawbacks:
✗ No progressive display
✗ User sees loading spinner until complete
```

### Option 2: Streaming SSE ✨ (Recommended)
```bash
# Railway deployment
pnpm mcp-sse-streaming

# Benefits:
✓ Real-time progressive display
✓ Better user experience
✓ Feels more responsive
✓ Shows partial results immediately

# Drawbacks:
✗ Slightly more complex code
```

## Railway Deployment for Streaming

### Update railway-mcp.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm mcp-sse-streaming",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Deploy Steps

1. **Update start command in Railway dashboard:**
   - Go to mcp-server service → Settings
   - Set Custom Start Command: `pnpm mcp-sse-streaming`
   - Or use: `railway variables --set "RAILWAY_START_COMMAND=pnpm mcp-sse-streaming"`

2. **Redeploy:**
   ```bash
   git push origin main
   ```

3. **Test streaming:**
   ```bash
   # Connect to SSE endpoint
   curl -N https://your-mcp-service.railway.app/sse

   # Should show streaming events in real-time
   ```

4. **Configure in ChatGPT:**
   - Go to ChatGPT custom connectors
   - Add: `https://your-mcp-service.railway.app/sse`
   - Test with a query - you should see tokens appear progressively

## Implementation Details

### Streaming Service (`chat-service-streaming.ts`)

The streaming service provides callbacks for progressive updates:

```typescript
await callChatApiStreaming(
  messages,
  conversationId,
  persona,
  {
    // Called for each token chunk
    onToken: (token) => {
      sendProgressEvent('token', { token });
    },

    // Called when citations are found
    onCitation: (citation) => {
      sendProgressEvent('citation', citation);
    },

    // Called when complete
    onComplete: (response, citations) => {
      sendProgressEvent('complete', {
        response,
        citations_count: citations.length
      });
    },
  }
);
```

### SSE Event Emission

The streaming server sends SSE events using Express response:

```typescript
function sendProgressEvent(type: string, data: any) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };

  // Send as SSE event
  res.write(`event: progress\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

## Testing Streaming Locally

### 1. Start the streaming server:
```bash
pnpm mcp-sse-streaming
```

### 2. Test with curl:
```bash
# Open SSE connection
curl -N http://localhost:3001/sse

# In another terminal, send a test message via MCP protocol
# (or use ChatGPT custom connector pointing to localhost)
```

### 3. Watch for events:
You should see events stream in real-time:
```
event: progress
data: {"type":"start","timestamp":"...","data":{...}}

event: progress
data: {"type":"token","timestamp":"...","data":{"token":"Leia"}}

event: progress
data: {"type":"token","timestamp":"...","data":{"token":" technology"}}

...

event: progress
data: {"type":"complete","timestamp":"...","data":{...}}
```

## Performance Considerations

### Latency
- **Buffered:** User waits for entire response (2-5 seconds)
- **Streaming:** User sees first token in ~200-500ms

### Bandwidth
- **Buffered:** Single large payload at end
- **Streaming:** Many small events throughout

### Server Load
- **Buffered:** Short-lived connections
- **Streaming:** Long-lived connections (keep-alive)

### Recommendation
Use **streaming** for user-facing ChatGPT connectors where UX matters.
Use **buffered** for programmatic APIs or when simplicity is preferred.

## Migration Guide

### From Standard SSE to Streaming SSE

**Step 1:** Update Railway start command:
```bash
# Old
pnpm mcp-sse-server

# New
pnpm mcp-sse-streaming
```

**Step 2:** Redeploy:
```bash
git push origin main
```

**Step 3:** No client changes needed!
- ChatGPT custom connectors automatically handle SSE events
- Existing integrations continue to work
- Streaming events are additional enhancements

### From HTTP to Streaming SSE

If you currently use the HTTP API and want streaming:

**Step 1:** Deploy streaming SSE server to Railway (see above)

**Step 2:** Update ChatGPT custom connector URL:
```
Old: https://your-app.vercel.app/api/mcp-bridge (HTTP)
New: https://your-mcp.railway.app/sse (SSE Streaming)
```

**Step 3:** Enjoy progressive responses! ✨

## Comparison Table

| Feature | HTTP API | SSE Standard | SSE Streaming |
|---------|----------|--------------|---------------|
| **Progressive Display** | ❌ | ❌ | ✅ |
| **Real-time Events** | ❌ | ❌ | ✅ |
| **Deployment** | Vercel (serverless) | Railway (always-on) | Railway (always-on) |
| **Complexity** | Low | Medium | Medium |
| **User Experience** | Basic | Basic | Excellent |
| **Cost** | Free | ~$5/mo | ~$5/mo |
| **Best For** | APIs | Basic connectors | ChatGPT/Claude |

## Troubleshooting

### Issue: No streaming events appear

**Check:**
1. Verify Railway start command: `pnpm mcp-sse-streaming`
2. Check health endpoint: `curl https://your-mcp.railway.app/health`
   - Should show `"streaming": true`
3. Test SSE connection: `curl -N https://your-mcp.railway.app/sse`
4. Check Railway logs for errors

### Issue: Tokens arrive slowly

**Check:**
1. Vercel chat API latency
2. Network between Railway and Vercel
3. Supabase query performance
4. Consider upgrading Railway plan

### Issue: Connection drops

**Check:**
1. Railway timeout settings
2. Proxy/gateway timeouts
3. Add keep-alive header: `X-Accel-Buffering: no`

## Future Enhancements

Potential improvements for streaming:

1. **Partial Citation Display:** Show citations as they're found
2. **Progress Indicators:** Token count, estimated completion
3. **Cancellation:** Allow user to stop generation mid-stream
4. **Retry Logic:** Auto-reconnect on connection drop
5. **Rate Limiting:** Throttle token emission for smoother display

## Resources

- **Streaming Server:** `src/mcp-server/sse-streaming-server.ts`
- **Streaming Service:** `src/lib/mcp/chat-service-streaming.ts`
- **Standard SSE Server:** `src/mcp-server/sse-server.ts` (for comparison)
- **HTTP API:** `src/app/api/mcp-bridge/route.ts` (for comparison)

---

**Summary:** Streaming support transforms the user experience by displaying responses progressively instead of waiting for the complete answer. It's ideal for ChatGPT custom connectors and other interactive use cases.
