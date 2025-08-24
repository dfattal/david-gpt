#!/usr/bin/env bash
set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; fi

write_file() {
  local path="$1"
  local content="$2"
  if [[ -e "$path" && $FORCE -eq 0 ]]; then
    echo "SKIP  $path (exists)"
  else
    mkdir -p "$(dirname "$path")"
    printf "%s" "$content" > "$path"
    echo "WRITE $path"
  fi
}

# Dirs
AGENTS_DIR=".claude/agents"
CONTRACTS_DIR=".claude/contracts"
TICKETS_DIR=".claude/tickets"
DOCS_DIR="docs"
SQL_DIR="sql"
BUDGETS_DIR="budgets"
mkdir -p "$AGENTS_DIR" "$CONTRACTS_DIR" "$TICKETS_DIR" "$DOCS_DIR" "$SQL_DIR" "$BUDGETS_DIR"

# Master plan
write_file ".claude/master_plan.md" "$(cat <<EOF
# Master Plan: ChatGPT-style App (Next.js + Vercel AI SDK v5 + Supabase + shadcn)

## Scope
- Realtime streaming chat
- Supabase Auth + RLS
- Persisted messages (user + assistant)
- Smart auto titles; rename/delete conversations

## Milestones
- M1 Contracts Frozen (DB v1, API v1)
- M2 Backend API Streaming
- M3 Frontend UI & State
- M4 Title Generation
- M5 QA E2E Green
- M6 Perf Budgets Met
- M7 Release

## Live Status Log
- [seed] project initialized

## Open Risks
- Provider rate limits
- SSE proxy quirks
- RLS regressions
EOF
)"

# Contracts
write_file "$CONTRACTS_DIR/api.md" "$(cat <<EOF
# API Contract (v1)

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
Derives 3-6 word Title Case from first exchange; updates { title, title_status=ready }
EOF
)"

write_file "$CONTRACTS_DIR/db.md" "$(cat <<EOF
# DB Contract (v1) - Supabase (Postgres)

Tables:

conversations (
  id uuid pk default uuid_generate_v4(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default \'New chat\',
  title_status text not null default \'pending\', -- pending|ready|error
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz
)

messages (
  id bigserial pk,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in (\'user\',\'assistant\',\'system\',\'tool\')),
  parts jsonb not null,             -- AI SDK v5 UIMessage parts
  provider_message_id text,
  created_at timestamptz not null default now()
)

Indexes:
- conv_owner_updated_idx on conversations(owner, updated_at desc)
- msg_conv_created_idx on messages(conversation_id, created_at)

Trigger:
- messages_touch_conv: updates conversations.updated_at & last_message_at on insert

RLS:
- conversations: owner can select/insert/update; select filters deleted_at is null
- messages: select/insert allowed if belongs to owner's conversation (not deleted)
EOF
)"

write_file "$CONTRACTS_DIR/events.md" "$(cat <<EOF
# Events Contract (v1)

Events:
- app_open
- convo_create, convo_rename, convo_delete
- message_send, message_stream_start, message_stream_chunk, message_stream_end
- error_client, error_server

PII Policy:
- Redact message text in analytics unless debug=true AND env=development
EOF
)"

# SQL schema
write_file "$SQL_DIR/001_init.sql" "$(cat <<EOF
create extension if not exists "uuid-ossp";

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default \'New chat\',
  title_status text not null default \'pending\',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists conv_owner_updated_idx on public.conversations(owner, updated_at desc);

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in (\'user\',\'assistant\',\'system\',\'tool\')),
  parts jsonb not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists msg_conv_created_idx on public.messages(conversation_id, created_at);

create or replace function touch_conversation() returns trigger as $$
begin
  update public.conversations
  set updated_at = now(),
      last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;
  return new;
end; $$ language plpgsql;

drop trigger if exists messages_touch_conv on public.messages;
create trigger messages_touch_conv after insert on public.messages
for each row execute function touch_conversation();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists conv_select_owner on public.conversations;
create policy conv_select_owner
on public.conversations for select
using (owner = auth.uid() and deleted_at is null);

drop policy if exists conv_ins_owner on public.conversations;
create policy conv_ins_owner
on public.conversations for insert
with check (owner = auth.uid());

drop policy if exists conv_update_owner on public.conversations;
create policy conv_update_owner
on public.conversations for update
using (owner = auth.uid());

drop policy if exists msg_select_by_owner on public.messages;
create policy msg_select_by_owner
on public.messages for select
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner = auth.uid() and c.deleted_at is null
  )
);

drop policy if exists msg_insert_by_owner on public.messages;
create policy msg_insert_by_owner
on public.messages for insert
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner = auth.uid() and c.deleted_at is null
  )
);
EOF
)"

# Perf budget
write_file "$BUDGETS_DIR/perf.json" "$(cat <<EOF
{
  "lighthouse": { "minScore": 0.9 },
  "cwv": { "LCP_ms": 2500, "FID_ms": 100, "CLS": 0.1 },
  "bundle": { "initial_gzip_kb": 200 }
}
EOF
)"

# Tickets
write_file "$TICKETS_DIR/API-CHAT-STREAM.md" "$(cat <<EOF
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
EOF
)"

write_file "$TICKETS_DIR/DB-SCHEMA-V1.md" "$(cat <<EOF
# Ticket: DB-SCHEMA-V1
Owner: db-architect
DependsOn: -
Deliverables:
- sql/001_init.sql with tables, indexes, trigger, RLS
- docs: brief RLS note
Acceptance:
- Authenticated user sees only own data
Status: in-progress
EOF
)"

# Agent files (all use literal heredocs; tools list includes your connected MCP servers)
write_file "$AGENTS_DIR/backend-developer.md" "$(cat <<EOF
---
name: backend-developer
description: Next.js route handlers + Vercel AI SDK v5 streaming specialist. Builds fast, resilient APIs on Vercel.
tools: Read, Write, MultiEdit, Bash, magic, context7, vercel, supabase, github
---

You implement server routes for chat streaming and CRUD with strict contracts.

Scope:
- /api/chat (POST): streamText → UIMessage stream, post-hoc persistence
- /api/conversations (GET/POST): list/create
- /api/conversations/[id] (PATCH/DELETE): rename/soft-delete
- /api/messages (GET): by conversationId
- /api/conversations/[id]/title (POST): smart title generation

Protocol:
1) Pull .claude/contracts/api.md + .claude/contracts/db.md (frozen).
2) Implement handlers with Edge runtime when beneficial.
3) Add smoke tests and typed return shapes.

Progress JSON (append to master_plan.md):
{ "agent":"backend-developer","update_type":"progress","ticket":"API-CHAT-STREAM","completed":["..."],"next":["..."] }
EOF
)"

write_file "$AGENTS_DIR/db-architect.md" "$(cat <<EOF
---
name: db-architect
description: Supabase schema/RLS/indexes with migration safety.
tools: Read, Write, MultiEdit, Bash, context7, supabase, github
---

Deliver:
- sql/001_init.sql (conversations, messages, triggers, RLS, indexes)
- sql/seed.sql (optional)
- docs: RLS policies, auth.uid() behavior

Freeze schema version in .claude/contracts/db.md.
EOF
)"

write_file "$AGENTS_DIR/auth-security.md" "$(cat <<EOF
---
name: auth-security
description: Auth flows, SSR session, RLS verification, CSP.
tools: Read, Write, MultiEdit, Bash, context7, supabase, playwright, github
---

Deliver:
- Auth pages + SSR Supabase client (cookies)
- Middleware to protect routes
- Threat model + CSP
- Playwright login helpers
EOF
)"

write_file "$AGENTS_DIR/ai-integrations.md" "$(cat <<EOF
---
name: ai-integrations
description: AI SDK v5 integration + provider models + title generation prompt.
tools: Read, Write, MultiEdit, Bash, magic, context7, vercel, github
---

Deliver:
- lib/ai/model.ts (provider config)
- Title prompt + /api/conversations/[id]/title
- Message parts[] shape doc
- Safety & token budgets

Title rule:
- 3-6 words, Title Case, no quotes/emojis/punctuation.
EOF
)"

write_file "$AGENTS_DIR/qa-expert.md" "$(cat <<EOF
---
name: qa-expert
description: Playwright E2E + a11y + visual regression.
tools: Read, Write, MultiEdit, Bash, playwright, context7, github
---

Deliver:
- e2e/auth.spec.ts
- e2e/chat-stream.spec.ts
- e2e/conversation-crud.spec.ts
- a11y checks (axe)
EOF
)"

write_file "$AGENTS_DIR/performance-engineer.md" "$(cat <<EOF
---
name: performance-engineer
description: CWV, Lighthouse, bundle & DB performance.
tools: Read, Write, MultiEdit, Bash, context7, vercel, supabase, github
---

Deliver:
- budgets/perf.json
- scripts/analyze-bundle.mjs
- SQL EXPLAIN + index recommendations
- PRs for code-splitting and memoization
EOF
)"

write_file "$AGENTS_DIR/telemetry-analytics.md" "$(cat <<EOF
---
name: telemetry-analytics
description: Event schema, analytics, error logging with redaction.
tools: Read, Write, MultiEdit, Bash, context7, vercel, github
---

Deliver:
- .claude/contracts/events.md (schema)
- lib/analytics.ts
- Error boundary hooks + server logging
EOF
)"

write_file "$AGENTS_DIR/docs-writer.md" "$(cat <<EOF
---
name: docs-writer
description: Developer docs, runbooks, ADRs.
tools: Read, Write, MultiEdit, Bash, context7, github
---

Deliver:
- /docs/setup.md, /docs/architecture.md
- ADRs for key decisions
EOF
)"

write_file "$AGENTS_DIR/devops-release.md" "$(cat <<EOF
---
name: devops-release
description: Vercel project setup, env var matrix, preview deploy checks, lint/type/test gates.
tools: Read, Write, MultiEdit, Bash, vercel, github, context7
---

Deliver:
- vercel.json
- CI pipeline (lint/type/test)
- Release checklist
EOF
)"

write_file "$AGENTS_DIR/frontend-developer.md" "$(cat <<EOF
---
name: frontend-developer
description: Expert UI engineer for robust, scalable frontends. Builds shadcn-based React components with top-notch UX and a11y.
tools: Read, Write, MultiEdit, Bash, magic, context7, playwright, vercel, github
---

Scope:
- Sidebar (list/rename/delete)
- Chat pane (streamed tokens render from parts[])
- Composer (Enter submit, Shift+Enter newline)
- Optimistic UX; responsive; WCAG 2.1 AA
- Storybook docs

Protocol:
1) Pull .claude/contracts/api.md and message shape notes.
2) Implement components + tests.
3) Log progress JSON to master_plan.md.
EOF
)"

# Docs
write_file "$DOCS_DIR/architecture.md" "$(cat <<EOF
# Architecture Overview

- Next.js (App Router) on Vercel
- Vercel AI SDK v5 for streaming (UIMessage parts)
- Supabase: Auth + Postgres + RLS
- shadcn/ui for UI primitives
- Contracts-first workflow (api.md, db.md, events.md)
EOF
)"

write_file "$DOCS_DIR/setup.md" "$(cat <<EOF
# Setup

1) Create Supabase project; run sql/001_init.sql.
2) Configure env:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - OPENAI_API_KEY (or provider)
3) Vercel project + env import.
4) Run dev; confirm auth + RLS access.
EOF
)"

echo "Done."