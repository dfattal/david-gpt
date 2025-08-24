# Ticket: API-CHAT-STREAM
Owner: backend-developer
DependsOn: DB-V1, API-V1
Deliverables:
- app/api/chat/route.ts with AI SDK v5 UIMessage stream
- Post-stream persistence of assistant parts[]
- Unit tests for SSE edge cases
Acceptance:
- Streaming visible in UI
- On refresh, both roles render from DB (ordered asc)
Status: todo