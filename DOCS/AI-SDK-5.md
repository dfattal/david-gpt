# AI SDK 5 Chat Streaming Guide

Here's the essential guide to AI SDK 5 chat streaming—the key features you'll actually use, plus the "gotchas" if you've migrated from older SDKs.

## Key Features (v5 Architecture)

### Import Changes
- **UI hooks moved**: `import { useChat } from '@ai-sdk/react'` (not `ai/react`)
- **Separate package**: Install `@ai-sdk/react` or you'll get missing exports

### Server Streaming with `streamText`
- Build Route Handlers that return streaming responses
- Works with any provider (OpenAI, Anthropic, Gemini, Groq, etc.)
- Pipe directly to response; client renders progressively

### Client Chat with `useChat`
- Uses transport layer under the hood
- **You handle your own input state** (no more managed input)
- Call `sendMessage` to post messages

### Type Safety
- **Typed messages end-to-end**: Define custom `UIMessage` shape once
- Strong types flow server ↔ client
- Great for tool calls, metadata, reasoning parts

### Files & Tools
- File uploads are `files`, tool calls are modeled as `parts`
- Not separate arrays anymore
- Easier to stream partial tool outputs

## Minimal v5 Implementation Pattern

### Server (Next.js Route Handler)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json(); // your UIMessage[]
  const result = await streamText({
    model: openai('gpt-4o'),
    messages,
  });
  return result.toAIStreamResponse(); // streams chunks to client
}
```

### Client (React)

```typescript
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, isLoading, error } = useChat({
    api: '/api/chat',
  });
  const [input, setInput] = useState('');

  return (
    <form onSubmit={(e) => {
      e.preventDefault(); 
      sendMessage({ content: input }); 
      setInput('');
    }}>
      {/* render messages; last assistant message will stream in */}
      <input 
        value={input} 
        onChange={(e) => setInput(e.target.value)} 
      />
      <button disabled={isLoading}>Send</button>
      {error && <p>{String(error)}</p>}
    </form>
  );
}
```

### Documentation References
- **Streaming Cookbook**: Official streaming implementation patterns
- **useChat Reference**: Complete hook API documentation

## Migration Pitfalls (v4 → v5)

⚠️ **Common issues when upgrading from earlier SDK versions**

### 1. Hook Import + API Moved
- **Old**: `import { useChat } from 'ai/react'`
- **New**: `@ai-sdk/react` (separate package)
- **Fix**: Install `@ai-sdk/react` or you'll get missing exports

### 2. No Built-in Input State
- **v4 had**: `{ input, handleInputChange, handleSubmit }`
- **v5**: You manage `<input>` yourself; call `sendMessage` manually
- **Issue**: Easy to miss during upgrades

### 3. Renamed / Removed Props
- `experimental_attachments` → `files`
- `reload` → `regenerate`
- `onResponse` is gone—use transport events or handle server-side

### 4. Message Shape Changed
- **v4**: `content` string + separate `toolInvocations`
- **v5**: `parts[]` (text, tool input/output, reasoning, etc.)
- **Migration**: You'll need a transformer when reading old DB rows

### 5. Streaming Utilities Changed
- **v4**: Helpers like `processDataStream` don't map 1:1
- **v5**: UI-message stream/transport layer with some internals not public
- **Impact**: If you manually consume streams, plan for a small rewrite

### 6. IDs and Persistence
- **Issue**: During streaming, the last message/part IDs can shift
- **Solution**: Don't assume stable IDs mid-stream; generate your own when persisting

### 7. Downgrade Incompatibility
- **Warning**: Data saved in v5 format (parts/tool parts) won't round-trip to v4
- **Recommendation**: Keep backups before migrating

### 8. Separate Frontends
- **Requirement**: `useChat` expects an API route using v5 transport
- **Multi-domain**: If UI is on different domain/app, expose compatible endpoint or roll your own SSE reader with `streamText()` server→client

## Additional Features & Resources

### Advanced Capabilities
- **Customizable UIMessage**: Define custom message shapes for your use case
- **Full-stack Types**: Strong typing flows seamlessly server ↔ client
- **Better Transports**: Improved streaming and transport layer architecture

### Ecosystem Integrations
- **AI Gateway**: Model routing/metrics without juggling API keys
- **AI Elements**: Prebuilt chat UI components that work with v5

### Learning Resources
- **Blog Overview**: Comprehensive "what's new" documentation
- **Streaming Cookbook**: Practical implementation patterns
- **API Reference**: Complete hook and function documentation

---

*This guide covers the essential AI SDK 5 features for building production-ready chat applications with streaming responses.*