# Events Contract (v1)
frozen@2025-01-27T08:30:00.000Z

## Client-Server Event Flow

### Chat Stream Events (POST /api/chat)
```typescript
// Client sends
type ChatRequest = {
  conversationId?: string
  messages: UIMessage[]
}

// Server streams back
type StreamEvent = 
  | { type: 'text-delta', content: string }
  | { type: 'tool-call', toolCall: ToolCall }
  | { type: 'tool-result', toolResult: ToolResult }
  | { type: 'error', error: string }
  | { type: 'done', message: UIMessage }
```

### UI State Events
```typescript
// Conversation lifecycle
type ConversationEvent =
  | { type: 'conversation-created', conversation: Conversation }
  | { type: 'conversation-updated', id: string, changes: Partial<Conversation> }
  | { type: 'conversation-deleted', id: string }

// Message events
type MessageEvent =
  | { type: 'message-added', message: StoredMessage }
  | { type: 'streaming-started', conversationId: string }
  | { type: 'streaming-completed', conversationId: string, message: StoredMessage }
  | { type: 'streaming-error', conversationId: string, error: string }

// Title generation
type TitleEvent =
  | { type: 'title-generating', conversationId: string }
  | { type: 'title-generated', conversationId: string, title: string }
  | { type: 'title-error', conversationId: string, error: string }
```

### Data Types
```typescript
type UIMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  parts: MessagePart[]
}

type StoredMessage = UIMessage & {
  conversationId: string
  createdAt: string
  providerMessageId?: string
}

type Conversation = {
  id: string
  title: string
  titleStatus: 'pending' | 'ready' | 'error'
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}
```

## Real-time Updates
- Use React Query for optimistic updates
- Stream events update UI immediately
- Background sync with database for persistence
- Retry logic for failed operations