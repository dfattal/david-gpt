# RAG Product Requirements Document

> **Project**: david-gpt – Multi-persona RAG Platform
> **Scope**: Persona-aware retrieval-augmented generation (RAG) for scalable ingestion and reliable, cited answers.

---

## 1. Goals

- Allow each persona (e.g. david) to answer questions using its own curated knowledge base.
- Keep persona profile and RAG docs in sync in one folder:
  ```
  /personas/<slug>/
  ├ persona.md – natural-language profile
  ├ persona.config.json – manually curated config for routing
  ├ RAW-DOCS/ – input documents (PDFs, URLs, text)
  └ RAG/ – processed markdown docs for ingestion
  ```
- Simple ingestion pipeline that requires minimal human curation.
- Provide trustworthy citations in final answers.
- **MVP Focus**: Prioritize simplicity over advanced features for faster delivery.

---

## 2. Folder & File Layout

```
/personas
    persona_template.md
    sample-doc.md
    README.md  
   /<slug>
      persona.md
      persona.config.json        # manually curated config
      /RAW-DOCS                  # input documents (any format)
        2025-odyssey-press.pdf
        leia-runtime-blog.html
        tracking-notes.md
        samsung-links-list.md      # URL list
      /RAG                       # processed markdown docs ready for ingestion
         doc1.md                # script-generated *.md with frontmatter
         doc2.md
```

All assets that define a persona stay together, ensuring profile ↔ RAG sync.

---

## 3. Document Format for RAG

Each RAG document is a single Markdown file:

```yaml
---
id: unique-stable-slug              # auto-generated from filename
title: Document Title               # extracted from first H1 or filename
date: YYYY-MM-DD                   # optional
source_url: https://original/source # optional
type: blog|press|spec|tech_memo|faq|slide|email # optional
personas: [<slug>]                 # auto-set from folder location
tags: [simple, string, tags]       # simplified from complex topics
summary: "One-sentence abstract"   # manual curation
license: public|cc-by|proprietary  # optional
---

**Key Terms**: Related terminology, aliases, alternative names, foundational concepts
**Also Known As**: Direct synonyms and interchangeable names for the main topic

# Body in Markdown
…
```

**Purpose of Key Terms and Also Known As**:
These fields are placed in the document body (not frontmatter) to become part of the chunked and indexed content. This serves two critical retrieval functions:

1. **Lexical Search (BM25)**: Direct keyword matches on aliases (e.g., searching "DLB" matches documents mentioning "Directional Light Backlight")
2. **Semantic Search (Vector)**: Aliases embedded in context enrich the chunk's embedding vector, teaching the model semantic relationships

**Distinction**:
- `Key Terms`: Broader "See Also" concepts - related technologies, foundational terms, and contextual vocabulary (e.g., for "neural depth": monocular depth, AI, 3D, light field)
- `Also Known As`: Specific direct synonyms - acronyms, alternative names, and exact substitutes (e.g., for "Directional Light Backlight": DLB, diffractive backlighting)

Frontmatter is mostly auto-generated with minimal manual curation needed.

---

## 4. Persona Configuration

### 4.1 persona.md

Free-form natural language describing the persona’s expertise.

### 4.2 persona.config.json

**Manually curated** configuration (LLM can suggest, human finalizes):

```json
{
  "slug": "<slug>",
  "display_name": "...",
  "tags": ["LC lens", "DLB", "3D cell", "switchable display", "monocular depth", "neural depth"],
  "retrieval": {
    "vector_threshold": 0.35,
    "bm25_min_score": 0.1,
    "max_chunks": 12
  }
}
```

This JSON drives retrieval parameters and tag validation.

**Tag Strategy**: Tags serve dual purpose:
1. Document organization and filtering
2. **Persona-level search boosting** - globally important aliases and domain terms that apply across multiple documents

**Two-Layer Alias Strategy**:
The system uses a complementary two-layer approach to handle terminology variations:

1. **Document-Level (Key Terms + Also Known As)** - *Precision Layer*
   - Placed in document body, becomes part of chunked and indexed content
   - Improves both BM25 (keyword matching) and vector search (semantic enrichment)
   - Context-specific aliases tightly bound to the document
   - **Primary mechanism** for ensuring document discovery via aliases

2. **Persona-Level (config tags)** - *Relevance Layer*
   - Lightweight score boost (+5-10%) during retrieval
   - Handles globally important terms for the persona's domain
   - Nudges retrieval towards persona-relevant documents
   - Especially useful for ambiguous queries

**Why Both?**: This avoids maintaining a separate glossary database while ensuring:
- Document-level precision for context-specific aliases
- Persona-level hints for domain-wide terminology
- Resilient search that works even with unfamiliar terminology

---

## 5. Ingestion Workflow

### 5.1 Preparing RAW content

RAW could be a PDF, URL, Markdown, slides, or text.
Steps:
1. Extract clean text – e.g. pandoc, trafilatura, pdftotext, OCR if needed.
2. Normalise to Markdown – keep logical headings, short paragraphs.

### 5.2 Gemini-first document processing (Two-Stage Deterministic)

**Primary workflow** (`pnpm ingest:docs <persona-slug> --use-gemini`):

Uses a **two-stage deterministic approach** to avoid circular dependencies and ensure reliable extraction:

**Stage 1: Deterministic Text Extraction** (Fast, Reliable)
- **PDFs**: Use `pdftotext` command-line tool for raw text extraction (30s timeout)
- **DOCX**: Use `mammoth` library for content extraction
- **Other formats**: Gemini CLI handles directly (MD, HTML, etc.)
- **Benefits**: Fast, no LLM overhead, avoids circular dependency issues

**Stage 2: LLM-Based Structuring** (Gemini 2.0 Flash)
- Takes pre-extracted text and structures it with document-type-specific formatting
- Longer timeout (5 minutes) since only formatting, not extracting
- Generates complete markdown with proper structure

**Key Implementation Details**:

1. **Document type detection and formatting**:
   - Auto-detects document type (patent, release_notes, spec, blog, press, faq, arxiv, technical_note, other)
   - Applies document-type-specific formatting rules
   - Text extraction → Gemini structuring pipeline

2. **Web metadata enrichment** (for patents and arxiv papers):
   - **Patents**: Fetches from Google Patents (patent numbers, filing/granted/expiration dates, inventors, assignees including reassignments)
   - **Arxiv Papers**: Fetches from arxiv.org (arxiv ID, DOI, submission/publication dates, authors)
   - Enriched metadata incorporated into frontmatter during processing
   - Falls back gracefully if web fetch times out (uses document content only)

3. **Document-type-specific structure**:
   - **Patents**: Abstract → Background → Summary → Detailed Description → Claims
   - **Arxiv Papers**: Abstract → Introduction → Methodology → Results → Discussion → Conclusion
   - **Technical Notes** (e.g., LIF/LVF specs): Overview → Technical Specifications → Format Details → Implementation Guidelines
   - **Release Notes**: Overview → Features (by version) → Bug Fixes → Known Issues
   - **Specs**: Logical sections with ### subsections for detailed topics
   - **Blog/Press**: Introduction → Main content sections → Conclusion
   - All types: Section sizes optimized for chunking (500-800 words per ## section)

4. **Auto-generated frontmatter**:
   - `id`: kebab-case from filename (e.g., "us11281020", "leia-sr-release-notes")
   - `title`: extracted from actual document content (accurate, max 100 chars)
   - `type`: auto-detected (patent, release_notes, spec, blog, press, faq, arxiv, technical_note, other)
   - `personas`: set from folder location
   - `date`, `source_url`: extracted if found in document
   - `summary`: one-sentence abstract generated from content
   - `identifiers`: structured document IDs (patent_number, doi, arxiv_id, etc.) - **web-enriched for patents/arxiv**
   - `dates`: structured typed dates (filing, publication, expiration, etc.) - **web-enriched for patents/arxiv**
   - `actors`: people/organizations with roles (inventors, authors, assignees) - **web-enriched for patents/arxiv**
   - **Key Terms** and **Also Known As** sections in body for search boosting

5. **Timeout strategy**:
   - Text extraction: 30s (deterministic, fast)
   - Gemini formatting: 5 minutes (handles large multi-version documents like release notes)
   - Web metadata: 90s per source (non-blocking, falls back gracefully)

6. **Fallback strategy**:
   - If Gemini formatting times out, falls back to basic markdown with minimal structure
   - Preserves all content but loses document-type-specific optimization
   - Web metadata failures are non-blocking (document processed with content-only metadata)

7. **Manual curation** (optional):
   - Review and adjust `summary` and `tags` fields
   - Add additional Key Terms for search optimization
   - Verify document type classification
   - Verify web-enriched metadata accuracy (especially for patents with reassignments)

**Output**: Files saved directly to `/personas/<slug>/RAG/` with kebab-case naming (e.g., `us11281020.md`, `leiasr-release-notes-1-34-6.md`)

**Quality**: Two-stage approach produces production-ready documents with proper structure, accurate titles, and optimized chunking. More reliable than single-pass Gemini processing.

---

## 6. Database Schema & Storage Architecture

### 6.1 Database Tables

**Core tables**:
- `personas(slug, display_name, config_json)`
- `docs(id, title, date, source_url, type, summary, license, personas jsonb, tags jsonb, identifiers jsonb, dates_structured jsonb, actors jsonb, created_at, updated_at)`
- `chunks(id, doc_id, section_path, text, token_count, embeddings vector, created_at)`
- `document_files(id, doc_id, persona_slug, storage_path, file_size, content_hash, uploaded_at, uploaded_by)` - **Phase 8**

**Enhanced Metadata Fields** (added for rich document context):
- `identifiers` (JSONB): Document identifiers as key-value pairs (e.g., `patent_number`, `application_number`, `doi`, `arxiv_id`)
- `dates_structured` (JSONB): Typed dates (e.g., `filing`, `publication`, `priority`, `expiration`, `submitted`, `accepted`)
- `actors` (JSONB): Array of people/organizations with roles (e.g., `[{name: "John Doe", role: "inventor"}]`)
  - Common roles: `inventor`, `author`, `assignee`, `current_assignee`, `publisher`
- `tags` (JSONB): Merged array containing manual frontmatter tags + auto-extracted Key Terms + auto-extracted Also Known As terms

**Indexes**:
- Vector index on `chunks.embeddings` (HNSW)
- GIN index on `docs.personas` and `docs.tags`
- Full-text search index on `chunks.text` for BM25

**Benefits**: Eliminates junction tables, reduces JOINs, uses JSONB for flexibility.

**Chunking Strategy**:
- **Smart Chunking**: 800-1200 tokens per chunk with 17.5% overlap, respecting section boundaries
- **Metadata Chunk**: First chunk of every document contains comprehensive metadata for discovery:
  - Document ID, title, type, date, summary
  - Identifiers (patent_number, doi, arxiv_id, etc.)
  - Structured dates (filing, publication, expiration, etc.)
  - Actors (inventors, authors, assignees with roles)
  - Key Terms and Also Known As (from body)
  - Tags (merged from frontmatter and auto-extracted)
- **Purpose**: Metadata chunk ensures documents are discoverable via semantic search on metadata alone
- **Example**: Query "patents by Leia Inc" retrieves metadata chunks mentioning "Leia Inc" as assignee

**Contextual Retrieval**: Chunks are embedded with LLM-generated context prepended to improve retrieval accuracy. The original chunk text is stored in the database (without context) for display, while the contextualized version is embedded. Context generation uses:
- **OpenAI GPT-4 Mini** (default) - Fast, cost-effective ($0.0001-0.0002 per chunk)
- **Gemini CLI** (alternative) - Local processing but slower due to per-chunk invocation overhead

### 6.2 Document Storage Strategy (Phase 8+)

**MVP Approach** (Phase 8):
```
Local Filesystem:                          Supabase:
/personas/<slug>/RAW-DOCS/       →        (Not stored - local only)
       ↓ (local CLI: pnpm ingest:docs)
/personas/<slug>/RAG/*.md        →        Storage: formatted-documents/<slug>/*.md
       ↓ (Admin UI upload)                         ↓
                                           Database: docs + chunks tables
```

**Storage Layers**:
1. **Local RAW documents** (`/personas/<slug>/RAW-DOCS/`): PDFs, DOCX, etc. - **Not uploaded to cloud**
2. **Local Formatted documents** (`/personas/<slug>/RAG/`): Processed markdown - **Uploaded to Supabase Storage**
3. **Database records** (`docs` + `chunks`): Metadata + search index

**Supabase Storage Buckets** (Phase 8):
- `formatted-documents/` - Stores processed markdown files
  - Path structure: `<persona-slug>/<doc-id>.md`
  - RLS policies: Admin (full), Members (read-only)
  - Enables: web-based editing, version control, backup/restore

**Why formatted docs only in MVP?**
- ✅ Simpler architecture (one storage layer vs two)
- ✅ Keep Gemini processing local (no server-side timeout issues)
- ✅ Faster implementation (no RAW file handling, no queue system)
- ✅ Sufficient for metadata editing use case
- ⏸️ Defer RAW storage to Phase 10 (post-MVP)

**Post-MVP Enhancement** (Phase 10):
Add `raw-documents/` bucket for end-to-end cloud workflow:
```
Upload RAW via Admin UI → Supabase Storage (raw-documents/)
       ↓
Server-side Gemini processing (queue-based)
       ↓
Store formatted markdown → Supabase Storage (formatted-documents/)
       ↓
Ingest to database → docs + chunks tables
```

---

## 7. Retrieval Strategy

### 7.1 Simplified Routing (MVP)

**Always run RAG retrieval** for persona queries - no complex routing logic.

**Benefits**:
- Eliminates complex heuristic gates and LLM classifiers
- Reduces latency from multi-step routing
- Let the final answer LLM ignore irrelevant context if needed
- Simpler architecture with fewer failure points

**Trade-off**: Slightly higher cost/latency, but dramatically simpler implementation.

---

### 7.2 Context-Aware RAG Retrieval Pipeline ✅ IMPLEMENTED

Filter by `persona_slug`.

**Step 0: Query Reformulation** ✅ (Phase 6 - Multi-Turn Context)
   - LLM-based query reformulation using conversation history (last 3 turns)
   - Resolves pronouns and implicit references (e.g., "it" → "DLB technology")
   - Makes incomplete questions self-contained
   - Cost: ~$0.0001 per query (GPT-4o-mini)
   - Skipped if no conversation history or no pronouns/follow-up patterns detected

**Step 1: Hybrid Search** ✅
   - Vector search on chunk embeddings (top-20) using pgvector cosine similarity
   - BM25 lexical search on chunk text (top-20) using PostgreSQL full-text search
   - Fuse with Reciprocal Rank Fusion (RRF) formula: `score = Σ(1 / (k + rank))` where k=60 → top-12

**Step 2: Citation-Based Boosting** ✅ (Phase 6 - Multi-Turn Context)
   - Query last 2 assistant messages from conversation
   - Extract document IDs from `message_citations` table
   - Apply +15% score boost to chunks from recently cited documents
   - Keeps relevant documents in focus during multi-turn conversations
   - Zero-cost (simple DB lookup)

**Step 3: Tag Boosting** ✅
   - Apply +7.5% score boost to chunks from documents containing persona tags
   - Helps surface relevant documents when query uses aliases or related terms
   - Implemented but awaits document tag metadata for full activation

**Step 4: De-duplicate by doc** ✅
   - Prefer 2–3 best chunks per document (configurable, default: 3)

**Removed**: Cross-encoder reranking (eliminates Cohere dependency)
**Benefits**: Faster retrieval (<2s), context-aware multi-turn, fewer service dependencies
**Status**: Fully implemented in Phase 4-6, all tests passing

**Multi-Turn Context Strategy**: Lightweight approach balancing simplicity and effectiveness:
- Query reformulation: Solves 80% of follow-up query problems
- Citation boosting: Keeps conversation-relevant documents prioritized
- No new database tables or complex decay scoring
- Total overhead: ~50ms per query (1 LLM call + 1 DB query)

**Handling Aliases**: The two-layer strategy (document-level Key Terms/AKA + persona-level tags) naturally handles terminology variations:
- Document body enrichment ensures aliases are indexed for both keyword and semantic search
- Persona tags provide global relevance hints across the corpus
- No need for separate glossary database or complex query expansion
- Works because aliases are embedded in context, not stored as isolated mappings

---

### 7.3 Prompt to LLM for answer with citations ✅ IMPLEMENTED

> **SYSTEM**:
> You are `<display_name>`. Use ONLY the provided context for persona-specific facts.
> - Every factual statement that depends on the context must include a bracket citation:
>   `[^doc_id:section]`.
> - If the context is insufficient, say so and suggest what doc is missing.
>
> **USER**: {query}
>
> **CONTEXT**:
> ```
> [doc_{n} §{section_path}]
> Document: {doc_title}
> Section: {section_path}
> Source: {source_url}
>
> {text}
> ```

**Implementation**: System prompt enhanced with RAG context and citation instructions in `/api/chat/route.ts`
**Status**: Context formatting implemented, citation parsing pending (Phase 6)

Post-process bracket cites into footnotes linking `source_url` + heading anchor. (Pending Phase 6)

---

## 8. Citations UX

- Inline bracket `[^doc_id:section]` inside the answer.
- Sources list at the bottom:

  `[^leia-2024-sr-runtime-overview:Tracking] Leia SR Runtime Overview (2024), §Tracking. (link)`

---

## 9. Scaling Guidelines

- **New persona**: add `persona.md` → regenerate `persona.config.json` → add RAG docs.
- **New docs**: drop into `/personas/<slug>/RAG/` and re-run ingestion.
- **Cross-persona docs**: list multiple personas in frontmatter.

---

## 10. MVP vs. Full Implementation

### MVP Implementation (Phase 1-7) ✅ COMPLETE
- **Routing**: Always run RAG (no complex classification) ✅ Implemented
- **Retrieval**: Vector + BM25 + RRF with lightweight boosting (no reranking) ✅ Implemented
- **Multi-Turn Context**: Query reformulation + citation-based boosting ✅ Implemented (Phase 6)
- **Alias Handling**: Two-layer strategy (document Key Terms/AKA + persona tags) ✅ Implemented
- **Config**: Manual persona.config.json curation with search-hint tags ✅ In use
- **Ingestion**: Gemini-first processing with document-type-specific structure ✅ Implemented (Phase 2)
- **Contextual Retrieval**: LLM-generated context prepended to chunks before embedding (OpenAI GPT-4 Mini default) ✅ Implemented (Phase 3)
- **Schema**: JSONB arrays (no junction tables) ✅ Implemented (Phase 1)
- **File Structure**: RAW-DOCS + RAG only (no QA-QUEUE) ✅ Implemented (Phase 2)
- **API Integration**: `/api/rag/search` and `/api/chat` with RAG context ✅ Implemented (Phase 5)
- **Citations**: Parsing, UI display, database persistence ✅ Implemented (Phase 7)

### Phase 8: Admin Tools (IN PROGRESS)
**Goal**: Web-based document management and quality monitoring

**Architecture Decisions**:
- **Document Storage**: Formatted markdown only in Supabase Storage (`formatted-documents/<persona-slug>/`)
  - Upload source: Admin UI uploads from local `/personas/<slug>/RAG/` directory
  - No RAW document storage in MVP (deferred to Phase 10)
- **Metadata Editing**: Frontmatter + Key Terms + Also Known As only
  - Full markdown body editing deferred to post-MVP
- **Ingestion Workflow**:
  - RAW → Formatted conversion: Local CLI (`pnpm ingest:docs <slug> --use-gemini`)
  - Formatted → Database: Admin UI upload + ingestion

**Milestone 8.1: Document Management**
- Storage infrastructure (Supabase Storage bucket + `document_files` table)
- API routes for CRUD operations (upload, list, get, update metadata, re-ingest, delete, download)
- UI components (document list, upload, metadata editor, actions)
- **Editable fields**: `title`, `type`, `date`, `source_url`, `tags`, `summary`, `license`, Key Terms, Also Known As

**Milestone 8.2: Quality Monitoring**
- `search_logs` table for query performance tracking
- Metrics API routes (search, citations, system health)
- Dashboard UI with charts (Recharts)
- Metrics: query volume, latency, citation frequency, system stats

### Future Enhancements (Post-MVP)

**Phase 9: Testing & Optimization**
- E2E test suite (ingestion, search, citations, multi-persona)
- Performance benchmarks (search latency <500ms target)
- Query caching for frequent questions
- Vector index optimization

**Phase 10: Advanced RAW Document Processing** (Post-MVP)

**Goal**: Enable end-to-end RAW document processing via Admin UI

**Current State (MVP)**:
- **EXTRACTION**: Local CLI (`pnpm ingest:docs <slug> --use-gemini`) - Two-stage: pdftotext → Gemini formatting
- **INGESTION**: Admin UI upload ✅ (Phase 8) - Formatted markdown → chunks + embeddings → database
- Workflow: RAW (local) → Formatted (CLI) → Upload to Admin UI → Auto-ingest to DB

**Important Distinction**:
- **EXTRACTION** (RAW → Formatted markdown): Currently CLI only → Phase 10 adds web UI
- **INGESTION** (Formatted markdown → Database): Already in Admin UI ✅ (Phase 8 complete)

**Phase 10 Roadmap** (EXTRACTION Pipeline only):
1. **RAW Document Storage**: Supabase Storage bucket (`raw-documents/`) with RLS policies
2. **Upload API**: `POST /api/admin/documents/upload-raw` for PDFs, DOCX, MD, HTML
3. **Server-Side EXTRACTION**: Two-stage pipeline (pdftotext → Gemini CLI)
4. **Queue System**: BullMQ for async EXTRACTION processing with progress tracking
5. **Processing History**: Track RAW → Formatted conversions with versioning
6. **Admin UI**: Drag-drop RAW upload, EXTRACTION status, formatted output review, batch support

Note: INGESTION (formatted markdown → chunks + embeddings → database) is already functional via Admin UI upload

**Infrastructure Requirements**:
- Server-side `poppler-utils` (for pdftotext)
- Gemini CLI in server environment
- Redis for job queue
- Webhook endpoints for status updates

**Low Priority:**
- Turn-type detection for dynamic search limits (drill-down, compare, new-topic)
- Time-decay ranking for freshness
- Smart routing with LLM classification
- Cross-encoder reranking for improved precision
- Auto-generated persona configs
- Automated quality checks and validation

---

## 11. Out-of-Scope Handling

When router outputs `OUT_OF_SCOPE`:
- Return a polite deferral:
  > "This question is outside `<display_name>`'s expertise; switching to the general assistant."
- Forward query to a general LLM.

---

## 12. Key Design Decisions Summary

### Alias Handling Strategy
**Decision**: Two-layer complementary approach instead of separate glossary database

**Layer 1 - Document-Level (Primary)**:
- `Key Terms`: Broader related concepts, foundational terminology, contextual vocabulary
- `Also Known As`: Direct synonyms, acronyms, exact interchangeable names
- **Mechanism**: Embedded in document body → chunked and indexed
- **Benefits**:
  - BM25 lexical search gets direct keyword matches
  - Vector embeddings capture semantic relationships in context
  - Aliases are context-specific and document-bound
  - No synchronization issues between docs and glossary

**Layer 2 - Persona-Level (Supporting)**:
- `persona.config.json` tags for globally important domain terms
- **Mechanism**: Lightweight score boost (+5-10%) during retrieval
- **Benefits**:
  - Handles ambiguous queries
  - Provides domain-wide relevance hints
  - Works across all documents in persona corpus

**Why Not a Separate Glossary?**:
1. Context matters: "DLB" in a backlight document vs. "DLB" in a different context
2. Maintenance burden: Keeping glossary synchronized with evolving documents
3. Embedding quality: Aliases embedded in content produce richer semantic vectors
4. Simplicity: One source of truth (the documents themselves)

**Trade-offs Accepted**:
- Requires slight redundancy (aliases repeated across documents)
- Manual curation of Key Terms and AKA fields
- Benefits far outweigh costs: better search quality, no sync issues, contextually accurate

This design ensures robust retrieval across terminology variations while maintaining simplicity and avoiding the pitfalls of centralized glossary management.

---

## 13. Implementation Status Summary (2025-09-30)

### ✅ COMPLETE: Core RAG System (Phases 1-5)

**Database & Infrastructure**
- PostgreSQL with pgvector extension for embeddings
- JSONB columns for flexible persona/tag arrays
- Two optimized RPC functions: `vector_search_chunks()`, `bm25_search_chunks()`
- Full-text search indexes for BM25
- HNSW vector indexes (note: 3072-dim embeddings use brute-force)

**Document Processing Pipeline**
- Gemini-first processing with document-type detection
- Smart chunking (800-1200 tokens, 17.5% overlap, code-aware)
- Contextual retrieval with OpenAI GPT-4 Mini
- OpenAI text-embedding-3-large embeddings (3072 dimensions)
- Cost: ~$0.024 per full corpus re-ingestion

**Hybrid Search Engine**
- Vector similarity search (pgvector cosine distance)
- BM25 lexical search (PostgreSQL ts_rank_cd)
- Reciprocal Rank Fusion (RRF) with k=60
- Tag boosting (+7.5% for matching documents)
- Document deduplication (max 3 chunks per doc)
- Performance: <2s latency per query

**API & Integration**
- `/api/rag/search` - Standalone search endpoint with auth
- `/api/chat` - Automatic RAG integration for all queries
- System prompt injection with citation instructions
- Graceful fallback on RAG failures
- Optional `useRag` flag for testing

**Testing & Validation**
- Comprehensive test suite: `pnpm test:search`
- 4/4 test queries passing
- All expected documents retrieved correctly
- Vector search performs excellently for semantic queries

### 🚧 PENDING: Frontend & UX (Phase 6+)

**Citation Parsing & Display**
- Parse `[^doc_id:section]` citations from LLM responses
- Render inline citation links in chat UI
- Display sources list at message bottom
- Link citations to source documents

**Admin Tools**
- Document management UI (`/admin/rag`)
- Quality monitoring dashboard
- Manual re-ingestion triggers
- Metrics tracking (latency, relevance, citations)

**Optimization & Enhancement**
- Consider text-embedding-3-small (1536 dims) for indexed vector search
- Implement answer caching for frequent queries
- Add time-decay ranking for freshness
- LLM-based query expansion for complex aliases

---

## 14. Quick Start Guide

### Running a Search Query
```bash
# Test hybrid search
pnpm test:search

# Or use the API
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "lightfield displays", "personaSlug": "david"}'
```

### Chat with RAG Context
The chat API automatically performs RAG retrieval for every query:
```typescript
// Frontend code
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'What is DLB technology?' }],
    persona: 'david',
    useRag: true // default
  })
});
```

### Ingesting New Documents
```bash
# 1. Place documents in /personas/<slug>/RAW-DOCS/
# 2. Process with Gemini
pnpm ingest:docs <persona-slug> --use-gemini

# 3. Ingest to database (with contextual retrieval)
pnpm ingest:db
```
