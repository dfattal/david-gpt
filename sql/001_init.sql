-- Database Schema Initialization for David-GPT
-- Based on frozen contract db.md@2025-01-27T08:30:00.000Z
-- 
-- This script creates:
-- 1. conversations table with soft delete support
-- 2. messages table with AI SDK v5 parts structure
-- 3. Performance indexes
-- 4. Trigger function to update conversation timestamps
-- 5. Row Level Security policies for data isolation

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Create conversations table
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  title_status text not null default 'pending' check (title_status in ('pending', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Create messages table
create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  parts jsonb not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

-- Create performance indexes
create index if not exists conv_owner_updated_idx on public.conversations(owner, updated_at desc);
create index if not exists msg_conv_created_idx on public.messages(conversation_id, created_at);

-- Create trigger function to update conversation timestamps when messages are inserted
create or replace function touch_conversation() returns trigger as $$
begin
  update public.conversations
  set updated_at = now(),
      last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;
  return new;
end; $$ language plpgsql;

-- Create trigger
drop trigger if exists messages_touch_conv on public.messages;
create trigger messages_touch_conv after insert on public.messages
for each row execute function touch_conversation();

-- Enable Row Level Security on both tables
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- RLS Policy: conversations - SELECT (users can only see their own non-deleted conversations)
drop policy if exists conv_select_owner on public.conversations;
create policy conv_select_owner
on public.conversations for select
using (owner = auth.uid() and deleted_at is null);

-- RLS Policy: conversations - INSERT (users can only create conversations for themselves)
drop policy if exists conv_ins_owner on public.conversations;
create policy conv_ins_owner
on public.conversations for insert
with check (owner = auth.uid());

-- RLS Policy: conversations - UPDATE (users can only update their own conversations)
drop policy if exists conv_update_owner on public.conversations;
create policy conv_update_owner
on public.conversations for update
using (owner = auth.uid());

-- RLS Policy: messages - SELECT (users can only see messages from their own non-deleted conversations)
drop policy if exists msg_select_by_owner on public.messages;
create policy msg_select_by_owner
on public.messages for select
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner = auth.uid() and c.deleted_at is null
  )
);

-- RLS Policy: messages - INSERT (users can only insert messages into their own non-deleted conversations)
drop policy if exists msg_insert_by_owner on public.messages;
create policy msg_insert_by_owner
on public.messages for insert
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner = auth.uid() and c.deleted_at is null
  )
);

-- Comments for documentation
comment on table public.conversations is 'Chat conversations owned by authenticated users with soft delete support';
comment on table public.messages is 'Messages within conversations, structured for Vercel AI SDK v5 compatibility';
comment on column public.messages.parts is 'JSONB array of message parts compatible with AI SDK v5 UIMessage structure';
comment on function touch_conversation() is 'Updates conversation timestamps when new messages are added';