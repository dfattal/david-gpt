# Ticket: TITLE-GENERATION
Owner: ai-integrations  
DependsOn: API-CHAT-STREAM
Deliverables:
- POST /api/conversations/[id]/title endpoint implementation
- AI prompt for generating 3-6 word conversation titles
- Background job processing for title generation
- Error handling and retry logic for AI failures
- UI loading states for title generation process
- Update conversation title_status field workflow
Acceptance:
- Auto-generates meaningful titles from first message exchange
- Handles AI service failures gracefully
- UI shows loading state during generation
- Generated titles follow Title Case format
Status: todo