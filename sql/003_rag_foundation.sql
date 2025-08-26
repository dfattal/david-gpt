-- RAG Foundation Schema Migration
-- Phase 1: Database Foundation & RLS Policies
-- Date: 2025-01-27
-- 
-- This script creates:
-- 1. RAG documents table with metadata
-- 2. RAG chunks table with embeddings and full-text search
-- 3. RAG entities table for knowledge graph
-- 4. RAG relations table for entity relationships
-- 5. RAG chunk-entity linking table
-- 6. RAG ingestion jobs table for async processing
-- 7. Performance indexes
-- 8. Row Level Security policies for user isolation

-- Enable required extensions
create extension if not exists "vector"; -- pgvector for embeddings
create extension if not exists "uuid-ossp";

-- Create RAG documents table
create table if not exists public.rag_documents (
  id uuid primary key default uuid_generate_v4(),
  owner uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('text', 'url', 'pdf', 'docx')),
  source_uri text,
  title text not null,
  doc_date date not null, -- mandatory, fallback=ingestion date
  tags text[] default '{}',
  labels jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create RAG chunks table
create table if not exists public.rag_chunks (
  id bigserial primary key,
  doc_id uuid not null references public.rag_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  fts tsvector, -- Full-text search vector
  chunk_date date, -- optional override if different from doc_date
  tags text[] default '{}',
  labels jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Create RAG entities table for knowledge graph
create table if not exists public.rag_entities (
  id bigserial primary key,
  canonical_name text not null,
  type text not null check (type in ('company', 'product', 'tech', 'team', 'person', 'event', 'publication')),
  aliases text[] default '{}',
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Create RAG relations table for entity relationships
create table if not exists public.rag_relations (
  id bigserial primary key,
  head_id bigint not null references public.rag_entities(id) on delete cascade,
  relation text not null check (relation in (
    'partnered_with', 'developed_by', 'developed', 'launched_by', 'launched', 
    'uses_technology', 'funded_by', 'led_by', 'competitor_of', 'acquired'
  )),
  tail_id bigint not null references public.rag_entities(id) on delete cascade,
  evidence_chunk_id bigint references public.rag_chunks(id) on delete set null,
  confidence numeric(3,2) check (confidence >= 0.0 and confidence <= 1.0),
  created_at timestamptz not null default now(),
  unique(head_id, relation, tail_id) -- Prevent duplicate relations
);

-- Create RAG chunk-entity linking table
create table if not exists public.rag_chunk_entities (
  chunk_id bigint not null references public.rag_chunks(id) on delete cascade,
  entity_id bigint not null references public.rag_entities(id) on delete cascade,
  mention text not null, -- How the entity appears in this chunk
  confidence numeric(3,2) check (confidence >= 0.0 and confidence <= 1.0),
  created_at timestamptz not null default now(),
  primary key(chunk_id, entity_id)
);

-- Create RAG ingestion jobs table for async processing
create table if not exists public.rag_ingest_jobs (
  id uuid primary key default uuid_generate_v4(),
  owner uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create performance indexes

-- Documents indexes
create index if not exists rag_docs_owner_created_idx on public.rag_documents(owner, created_at desc);
create index if not exists rag_docs_tags_idx on public.rag_documents using gin(tags);
create index if not exists rag_docs_labels_idx on public.rag_documents using gin(labels);
create index if not exists rag_docs_doc_date_idx on public.rag_documents(doc_date desc);

-- Chunks indexes  
create index if not exists rag_chunks_doc_idx on public.rag_chunks(doc_id);
create index if not exists rag_chunks_embedding_idx on public.rag_chunks using ivfflat (embedding vector_cosine_ops);
create index if not exists rag_chunks_fts_idx on public.rag_chunks using gin(fts);
create index if not exists rag_chunks_tags_idx on public.rag_chunks using gin(tags);
create index if not exists rag_chunks_chunk_date_idx on public.rag_chunks(chunk_date desc);

-- Entities indexes
create index if not exists rag_entities_canonical_name_idx on public.rag_entities(canonical_name);
create index if not exists rag_entities_type_idx on public.rag_entities(type);
create index if not exists rag_entities_aliases_idx on public.rag_entities using gin(aliases);

-- Relations indexes
create index if not exists rag_relations_head_idx on public.rag_relations(head_id);
create index if not exists rag_relations_tail_idx on public.rag_relations(tail_id);
create index if not exists rag_relations_relation_idx on public.rag_relations(relation);
create index if not exists rag_relations_evidence_idx on public.rag_relations(evidence_chunk_id);

-- Jobs indexes
create index if not exists rag_jobs_owner_created_idx on public.rag_ingest_jobs(owner, created_at desc);
create index if not exists rag_jobs_status_idx on public.rag_ingest_jobs(status);

-- Create trigger function to update doc timestamps and maintain fts
create or replace function update_rag_timestamps() returns trigger as $$
begin
  -- Update document timestamp when chunks are added
  if tg_table_name = 'rag_chunks' then
    update public.rag_documents
    set updated_at = now()
    where id = new.doc_id;
    
    -- Auto-generate FTS vector for new chunks
    new.fts = to_tsvector('english', new.content);
  end if;
  
  -- Update job timestamp
  if tg_table_name = 'rag_ingest_jobs' then
    new.updated_at = now();
  end if;
  
  return new;
end; $$ language plpgsql;

-- Create triggers
drop trigger if exists rag_chunks_update_doc on public.rag_chunks;
create trigger rag_chunks_update_doc 
  after insert on public.rag_chunks
  for each row execute function update_rag_timestamps();

drop trigger if exists rag_jobs_timestamp on public.rag_ingest_jobs;
create trigger rag_jobs_timestamp 
  before update on public.rag_ingest_jobs
  for each row execute function update_rag_timestamps();

drop trigger if exists rag_chunks_fts on public.rag_chunks;
create trigger rag_chunks_fts 
  before insert or update on public.rag_chunks
  for each row execute function update_rag_timestamps();

-- Enable Row Level Security on all RAG tables
alter table public.rag_documents enable row level security;
alter table public.rag_chunks enable row level security;
alter table public.rag_entities enable row level security;
alter table public.rag_relations enable row level security;
alter table public.rag_chunk_entities enable row level security;
alter table public.rag_ingest_jobs enable row level security;

-- RLS Policy: rag_documents - SELECT (users can only see their own documents)
drop policy if exists rag_docs_select_owner on public.rag_documents;
create policy rag_docs_select_owner
on public.rag_documents for select
using (owner = auth.uid());

-- RLS Policy: rag_documents - INSERT (users can only create documents for themselves)
drop policy if exists rag_docs_insert_owner on public.rag_documents;
create policy rag_docs_insert_owner
on public.rag_documents for insert
with check (owner = auth.uid());

-- RLS Policy: rag_documents - UPDATE (users can only update their own documents)
drop policy if exists rag_docs_update_owner on public.rag_documents;
create policy rag_docs_update_owner
on public.rag_documents for update
using (owner = auth.uid())
with check (owner = auth.uid());

-- RLS Policy: rag_documents - DELETE (users can only delete their own documents)
drop policy if exists rag_docs_delete_owner on public.rag_documents;
create policy rag_docs_delete_owner
on public.rag_documents for delete
using (owner = auth.uid());

-- RLS Policy: rag_chunks - SELECT (users can only see chunks from their own documents)
drop policy if exists rag_chunks_select_by_owner on public.rag_chunks;
create policy rag_chunks_select_by_owner
on public.rag_chunks for select
using (
  exists (
    select 1 from public.rag_documents d
    where d.id = doc_id and d.owner = auth.uid()
  )
);

-- RLS Policy: rag_chunks - INSERT (users can only insert chunks into their own documents)
drop policy if exists rag_chunks_insert_by_owner on public.rag_chunks;
create policy rag_chunks_insert_by_owner
on public.rag_chunks for insert
with check (
  exists (
    select 1 from public.rag_documents d
    where d.id = doc_id and d.owner = auth.uid()
  )
);

-- RLS Policy: rag_chunks - UPDATE/DELETE (users can only modify chunks from their own documents)
drop policy if exists rag_chunks_update_by_owner on public.rag_chunks;
create policy rag_chunks_update_by_owner
on public.rag_chunks for update
using (
  exists (
    select 1 from public.rag_documents d
    where d.id = doc_id and d.owner = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.rag_documents d
    where d.id = doc_id and d.owner = auth.uid()
  )
);

drop policy if exists rag_chunks_delete_by_owner on public.rag_chunks;
create policy rag_chunks_delete_by_owner
on public.rag_chunks for delete
using (
  exists (
    select 1 from public.rag_documents d
    where d.id = doc_id and d.owner = auth.uid()
  )
);

-- RLS Policy: rag_entities - Global read access (entities are shared across users for now)
-- Note: In future phases, we may add tenant/org-level isolation
drop policy if exists rag_entities_select_all on public.rag_entities;
create policy rag_entities_select_all
on public.rag_entities for select
using (true);

-- RLS Policy: rag_entities - Only authenticated users can create entities
drop policy if exists rag_entities_insert_auth on public.rag_entities;
create policy rag_entities_insert_auth
on public.rag_entities for insert
with check (auth.uid() is not null);

-- RLS Policy: rag_entities - Only authenticated users can update entities
drop policy if exists rag_entities_update_auth on public.rag_entities;
create policy rag_entities_update_auth
on public.rag_entities for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- RLS Policy: rag_relations - Global read access (relations are shared)
drop policy if exists rag_relations_select_all on public.rag_relations;
create policy rag_relations_select_all
on public.rag_relations for select
using (true);

-- RLS Policy: rag_relations - Only authenticated users can create relations
drop policy if exists rag_relations_insert_auth on public.rag_relations;
create policy rag_relations_insert_auth
on public.rag_relations for insert
with check (auth.uid() is not null);

-- RLS Policy: rag_relations - Only authenticated users can update relations
drop policy if exists rag_relations_update_auth on public.rag_relations;
create policy rag_relations_update_auth
on public.rag_relations for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- RLS Policy: rag_chunk_entities - Users can only see chunk-entity links from their own chunks
drop policy if exists rag_chunk_entities_select_by_owner on public.rag_chunk_entities;
create policy rag_chunk_entities_select_by_owner
on public.rag_chunk_entities for select
using (
  exists (
    select 1 from public.rag_chunks c
    join public.rag_documents d on c.doc_id = d.id
    where c.id = chunk_id and d.owner = auth.uid()
  )
);

-- RLS Policy: rag_chunk_entities - Users can only create links for their own chunks
drop policy if exists rag_chunk_entities_insert_by_owner on public.rag_chunk_entities;
create policy rag_chunk_entities_insert_by_owner
on public.rag_chunk_entities for insert
with check (
  exists (
    select 1 from public.rag_chunks c
    join public.rag_documents d on c.doc_id = d.id
    where c.id = chunk_id and d.owner = auth.uid()
  )
);

-- RLS Policy: rag_ingest_jobs - SELECT (users can only see their own jobs)
drop policy if exists rag_jobs_select_owner on public.rag_ingest_jobs;
create policy rag_jobs_select_owner
on public.rag_ingest_jobs for select
using (owner = auth.uid());

-- RLS Policy: rag_ingest_jobs - INSERT (users can only create jobs for themselves)
drop policy if exists rag_jobs_insert_owner on public.rag_ingest_jobs;
create policy rag_jobs_insert_owner
on public.rag_ingest_jobs for insert
with check (owner = auth.uid());

-- RLS Policy: rag_ingest_jobs - UPDATE (users can only update their own jobs)
drop policy if exists rag_jobs_update_owner on public.rag_ingest_jobs;
create policy rag_jobs_update_owner
on public.rag_ingest_jobs for update
using (owner = auth.uid())
with check (owner = auth.uid());

-- Comments for documentation
comment on table public.rag_documents is 'RAG documents with metadata, tags, and mandatory doc_date';
comment on table public.rag_chunks is 'Document chunks with embeddings and full-text search vectors';
comment on table public.rag_entities is 'Knowledge graph entities with canonical names and aliases';
comment on table public.rag_relations is 'Knowledge graph relations between entities with evidence';
comment on table public.rag_chunk_entities is 'Links between chunks and entities they mention';
comment on table public.rag_ingest_jobs is 'Async ingestion job tracking with status and error handling';

comment on column public.rag_chunks.embedding is 'OpenAI text-embedding-3-small vector (1536 dimensions)';
comment on column public.rag_chunks.fts is 'Full-text search vector for hybrid retrieval';
comment on column public.rag_documents.doc_date is 'Mandatory document date, fallback to ingestion date';
comment on column public.rag_relations.confidence is 'Relation extraction confidence score (0.0-1.0)';
comment on function update_rag_timestamps() is 'Updates timestamps and maintains FTS vectors for RAG tables';