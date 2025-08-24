# DB Contract (v1) - Supabase (Postgres)
frozen@2025-01-27T08:30:00.000Z

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
- messages: select/insert allowed if belongs to owner's conversation (not deleted);

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

create or replace function touch_conversation() returns trigger as 92489
begin
  update public.conversations
  set updated_at = now(),
      last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;
  return new;
end; 92489 language plpgsql;

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
)