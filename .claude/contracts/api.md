# API Contract (v1)
frozen@2025-01-27T08:30:00.000Z

## POST /api/chat
Body: { conversationId?: UUID, uiMessages: UIMessage[] }
Returns: UIMessage SSE stream (Vercel AI SDK v5)

## GET /api/messages?conversationId=UUID
Returns: { messages: StoredMessage[] }  // ordered asc by created_at

## GET /api/conversations
Returns: latest user conversations (not deleted), sorted by updated_at desc

## POST /api/conversations
Creates a new conversation -> { id, title }

## PATCH /api/conversations/[id]
Body: { title: string }  // rename

## DELETE /api/conversations/[id]
Soft delete (sets deleted_at)

## POST /api/conversations/[id]/title
Derives 3–6 word Title Case from first exchange; updates { title, title_status='ready' }