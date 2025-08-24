# Title Generation System

The David-GPT application includes intelligent conversation title generation using AI.

## How It Works

1. **Automatic Trigger**: After the first user message and assistant response (2 total messages)
2. **Background Processing**: Title generation runs asynchronously without blocking chat
3. **David Fattal Persona**: Specialized prompts generate titles relevant to technical domains
4. **Smart Formatting**: Titles are automatically cleaned and formatted as 3-6 words in Title Case
5. **Error Handling**: Graceful fallbacks and retry mechanisms for AI service failures

## API Endpoints

### POST /api/conversations/[id]/title
Generates a smart title from the first exchange in a conversation.

**Process:**
- Fetches first 4 messages from conversation
- Uses David Fattal-specific AI prompt
- Generates 3-6 word Title Case title
- Updates conversation `title` and `title_status='ready'`
- Handles errors by setting `title_status='error'`

## Frontend Integration

### Hooks
- `useConversations()` - Auto-refreshes when titles are pending
- `useTitleGeneration()` - Manages title generation state

### Components
- `<TitleStatus />` - Shows loading/error states with retry option

### State Management
- `title_status`: 'pending' → 'ready' | 'error'
- Auto-polling for conversations with pending titles
- React Query integration for efficient updates

## Title Generation Flow

```
1. User sends first message
   ↓
2. Assistant responds (chat API)
   ↓
3. Message count = 2, title_status = 'pending'
   ↓ 
4. Trigger background title generation
   ↓
5. AI generates title from conversation context
   ↓
6. Update title_status = 'ready'
   ↓
7. Frontend refreshes and displays new title
```

## David Fattal Specialized Prompts

Title generation is tuned for David's expertise areas:
- Quantum computing and nanophotonics
- Light field displays and 3D technology 
- Spatial AI and computer vision
- Immersive holographic systems
- Advanced materials science

**Example Generated Titles:**
- "Quantum Light Field Physics"
- "3D Display Manufacturing Challenges"
- "Spatial AI Algorithm Design"
- "Holographic Data Storage Methods"
- "Nanophotonic Device Fabrication"

## Error Handling

**Rate Limits**: Title status stays 'pending' for automatic retry
**API Failures**: Status changes to 'error' with manual retry option
**Malformed Output**: Falls back to 'New Chat' with proper formatting
**Network Issues**: Silent failures don't impact user chat experience

## Implementation Files

- `src/lib/title-generation.ts` - Core utilities and prompts
- `src/app/api/conversations/[id]/title/route.ts` - Title generation endpoint
- `src/app/api/chat/route.ts` - Auto-trigger after first response
- `src/lib/hooks/use-title-generation.ts` - React hook for UI integration
- `src/components/ui/title-status.tsx` - Title status UI component

## Database Schema

```sql
conversations (
  title text not null default 'New chat',
  title_status text not null default 'pending' -- pending|ready|error
)
```

The system is designed to be non-blocking and graceful, ensuring that title generation enhances the user experience without ever impacting core chat functionality.