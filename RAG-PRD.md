# PRD: RAG + KG for Leia Chat System (Finalized with Decisions)

## 1. Overview

### Extend Leia’s chat system (Vercel AI SDK streaming + Supabase persistence) with a state- of- the- art RAG layer:
- Ingestion: text, URLs, PDFs, DOCX.
- Chunking + embeddings with hybrid retrieval (vector + BM25).
- Contextual retrieval & reranking (multi-query, HyDE, cross-encoder).
- Knowledge Graph (KG): entities + relations auto-extracted at ingestion.
- Labels/tags: governance, filtering, faceting, boosts.
- Product subtyping: differentiate internal Leia tech vs partner-branded products.
- Time metadata: doc_date required to resolve discrepancies.
- Admin panel: correct labels, tags, entities, relations.
- Streaming answers with citations.

## 2. Goals
- Deliver accurate, explainable answers with citations and dates.
- Improve retrieval precision/recall via KG expansion + reranking.
- Allow tagging and governance (verified, restricted, etc).
- Provide admin curation tools to maintain quality.

## 3. User Stories

### End-user
- Query KB and get streaming answers with citations and dates.
- Upload docs of multiple formats.
- Filter/search by product, partner, team, status.

### Admin
- Edit tags, labels, entities, relations.
- Merge duplicate entities.
- Approve or reject relations (but only when necessary).
- Mark docs as verified/restricted/draft.

## 4. Functional Requirements

### Ingestion
- Accept text/URL/PDF/DOCX.
- Parse, chunk (200–300 tokens with overlap).
- Embed (pgvector).
- Extract entities + relations with LLM → populate KG tables.
- Auto-assign tags/labels (type, product, partner, team, status, confidentiality, lang).
- doc_date mandatory: must be captured; fallback = ingestion timestamp.
- Store ingestion job status (queued|processing|done|error).

### Retrieval
1.	Query rewrite (multi-query, HyDE).
2.	Hybrid retrieval (vector + BM25).
3.	KG expansion (entities + neighbors).
4.	RRF merge.
5.	Cross-encoder rerank.
6.	Pack top K chunks with dates + citations.
7.	Stream answer via Vercel AI SDK.

### Labels/Tags
- tags[] + labels jsonb.
- Editable in admin UI.
- Indexed for filtering.

### KG
- Entities: canonical names, aliases, types.
- Relations: controlled vocabulary (partnered_with, launched_by, uses_technology, etc).
- Confidence + provenance (evidence_chunk_id).
- Provisional edges allowed: edges with low confidence are queryable, admins may curate later.

### Admin Panel
- CRUD tags, labels, entities, relations.
- Merge entities, edit aliases.
- Monitor ingestion jobs.
- Dashboard with stats (volume, cost, errors).

## 5. Non- Functional Requirements
- Retrieval + rerank <1s P95 pre-stream.
- Scale: >100k chunks, thousands of entities.
- RLS: strict per-user/tenant doc isolation.
- Provenance: citations must include doc_id + doc_date.

## 6. Schema Extensions

### Documents

```sql
CREATE TABLE rag_documents (
  id uuid PRIMARY KEY,
  owner uuid,
  source_type text,       -- text|url|pdf|docx
  source_uri text,
  title text,
  doc_date date NOT NULL, -- mandatory, fallback=ingestion date
  tags text[],
  labels jsonb,
  created_at timestamptz
);
```

### Chunks

```sql
CREATE TABLE rag_chunks (
  id bigserial PRIMARY KEY,
  doc_id uuid REFERENCES rag_documents(id),
  chunk_index int,
  content text,
  embedding vector(1536),
  fts tsvector,
  chunk_date date,        -- optional override if different from doc_date
  tags text[],
  labels jsonb,
  created_at timestamptz
);
```

### Entities & Relations

```sql
CREATE TABLE rag_entities (
  id bigserial PRIMARY KEY,
  canonical_name text,
  type text,              -- company|product|tech|team|person|event|publication
  aliases text[],
  metadata jsonb
);
```

```sql
CREATE TABLE rag_relations (
  id bigserial PRIMARY KEY,
  head_id bigint REFERENCES rag_entities(id),
  relation text,
  tail_id bigint REFERENCES rag_entities(id),
  evidence_chunk_id bigint REFERENCES rag_chunks(id),
  confidence numeric
);
```

```sql
CREATE TABLE rag_chunk_entities (
  chunk_id bigint REFERENCES rag_chunks(id),
  entity_id bigint REFERENCES rag_entities(id),
  mention text,
  confidence numeric,
  PRIMARY KEY(chunk_id, entity_id)
);
```

### Ingestion Jobs

```sql
CREATE TABLE rag_ingest_jobs (
  id uuid PRIMARY KEY,
  owner uuid,
  payload jsonb,
  status text,
  error text,
  created_at timestamptz,
  updated_at timestamptz
);
```

## 7. Metadata Guidelines

### Dates
- doc_date mandatory; ingestion timestamp only used as fallback.
- chunk_date optional; for chunks tied to specific events.
- Retrieval layer prefers newer chunks when conflicting facts exist.

### Product Taxonomy
- Generic node type: Product.
- Subtypes:
- internal → Leia technologies (LeiaSR Runtime/SDK, NeurD Runtime/SDK, Unity/Unreal Plugins).
- partner → OEM devices powered by Leia (Acer SpatialLabs, Samsung Odyssey 3D, Nubia Pad 3D II).
- Origin: Leia | Samsung | Acer | Lenovo | ZTE | …

## 8. Suggested Tags & Labels

### Tags (facets):
- type: spec | faq | blog | press | deck | meeting-notes
- product: Odyssey-3D | Nubia Pad 3D II | SpatialLabs | LeiaSR Runtime | NeurD SDK
- partner: Samsung-VD | Acer | Lenovo | Himax | BOE
- team: runtime | tracking | plugins | SDK | content
- status: verified | draft | deprecated
- confidentiality: public | internal | restricted
- lang: en | zh | fr | ko
- version: v1.0 | v2.1

### Labels (structured):

```json
{
  "status": "verified",
  "confidentiality": "internal",
  "recency": "2024-12-15",
  "lang": "en"
}
```

## 9. KG Node Types & Relation Types

### Nodes:
- Company/Partner
- Product (with subtype/origin labels)
- Technology/Component
- Team/Org Unit
- Person
- Event
- Publication

### Relations:
- partnered_with
- developed_by / developed
- launched_by / launched
- uses_technology
- funded_by
- led_by
- competitor_of
- acquired

## 10. Remarks
- doc_date is mandatory at ingestion, falling back to ingestion timestamp if source date not found.
- Internal products remain Product nodes with subtype=internal. No separate Technology node required.
- Admins do not need to approve all KG edges before queryable use; provisional edges with low confidence are allowed and can be curated later.
- use text-embedding-3-small as embedding model and gpt-4-mini as cross-encoder (via prompt)

