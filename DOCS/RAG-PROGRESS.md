# RAG Implementation Progress

**Project**: david-gpt Multi-Persona RAG System
**Started**: 2025-09-29
**Status**: Planning Phase

---

## Implementation Roadmap

### Phase 1: Database Schema & Infrastructure (FOUNDATION)
**Goal**: Establish core data model for personas, documents, and embeddings

#### Milestone 1.1: Core Tables Setup
- [ ] Create `personas` table update
  - Add `config_json` field for persona.config.json storage
  - Add `slug` field (unique identifier)
- [ ] Create `docs` table
  - `id` (uuid, primary key)
  - `title` (text)
  - `date` (date, nullable)
  - `source_url` (text, nullable)
  - `type` (enum: blog, press, spec, tech_memo, faq, slide, email)
  - `summary` (text, nullable)
  - `license` (enum: public, cc-by, proprietary)
  - `personas` (jsonb array - references persona slugs)
  - `tags` (jsonb array - search hint tags)
  - `raw_content` (text - full markdown content)
  - `created_at`, `updated_at` (timestamptz)
- [ ] Create `chunks` table
  - `id` (uuid, primary key)
  - `doc_id` (uuid, foreign key → docs.id)
  - `section_path` (text - heading hierarchy like "Introduction > Background")
  - `text` (text - chunk content)
  - `token_count` (integer)
  - `embeddings` (vector(3072) - OpenAI text-embedding-3-large)
  - `created_at` (timestamptz)

**Test**: Run migration, verify tables exist with `mcp__supabase__list_tables`

#### Milestone 1.2: Indexes & Performance
- [ ] Create HNSW vector index on `chunks.embeddings`
  ```sql
  CREATE INDEX chunks_embeddings_idx ON chunks
  USING hnsw (embeddings vector_cosine_ops);
  ```
- [ ] Create GIN indexes on JSONB arrays
  ```sql
  CREATE INDEX docs_personas_idx ON docs USING gin(personas);
  CREATE INDEX docs_tags_idx ON docs USING gin(tags);
  ```
- [ ] Create full-text search index for BM25
  ```sql
  CREATE INDEX chunks_text_fts_idx ON chunks
  USING gin(to_tsvector('english', text));
  ```

**Test**: Query execution plans show index usage

#### Milestone 1.3: RLS Policies
- [ ] Admin can read/write all docs and chunks
- [ ] Members can read docs for active personas only
- [ ] Guests have no direct access to corpus tables

**Test**: Verify policies with different user roles

---

### Phase 2: Document Processing Pipeline (INGESTION)
**Goal**: Convert raw content into structured RAG-ready markdown

#### Milestone 2.1: Ingestion Scripts Setup
- [ ] Create `src/lib/rag/ingestion/` directory structure
- [ ] Implement `extractText()` utility
  - PDF extraction using `pdf-parse`
  - HTML extraction using `trafilatura` or similar
  - Plain text/markdown passthrough
- [ ] Implement `generateFrontmatter()` utility
  - Auto-generate `id` from filename (kebab-case)
  - Extract `title` from first H1 or filename
  - Detect `personas` from folder path
  - Parse `date`, `source_url`, `type` when obvious
  - Leave `summary` and `tags` for manual curation

**Test**: Process sample PDF/HTML → verify clean markdown output with frontmatter

#### Milestone 2.2: Markdown Processing
- [ ] Implement `processMarkdown()` utility
  - Normalize heading structure
  - Clean formatting (remove extra whitespace, fix code blocks)
  - Preserve logical document structure
  - Extract section hierarchy for chunk metadata
- [ ] Save processed files to `/personas/<slug>/RAG/`

**Test**: Process `personas/sample-doc.md` → verify output structure

#### Milestone 2.3: Batch Processing CLI
- [ ] Create `scripts/ingest-docs.ts` CLI tool
  - Scan `/personas/<slug>/RAW-DOCS/` for new files
  - Process each file → RAG markdown
  - Log success/errors
- [ ] Add npm script: `pnpm ingest:docs [persona-slug]`

**Test**: Run full ingestion on `personas/david/RAW-DOCS/` → verify RAG output

---

### Phase 3: Chunking & Embedding (VECTORIZATION)
**Goal**: Split documents into semantic chunks and generate embeddings

#### Milestone 3.1: Smart Chunking Algorithm
- [ ] Implement `chunkDocument()` utility
  - Target: 800-1200 tokens per chunk
  - Overlap: 15-20% (120-240 tokens)
  - Split on heading boundaries when possible
  - Track section path (e.g., "Introduction > Background > Early Work")
  - Use `tiktoken` for accurate token counting
- [ ] Implement `extractSectionPath()` helper
  - Parse markdown headings to build hierarchy

**Test**: Chunk sample doc → verify token counts, overlap, section paths

#### Milestone 3.2: Embedding Generation
- [ ] Implement `generateEmbeddings()` utility
  - Use OpenAI `text-embedding-3-large` (3072 dimensions)
  - Batch requests (max 100 chunks per API call)
  - Add retry logic with exponential backoff
  - Track API costs
- [ ] Create embedding queue for rate limiting

**Test**: Generate embeddings for 10 sample chunks → verify vector dimensions

#### Milestone 3.3: Database Ingestion
- [ ] Implement `ingestToDatabase()` utility
  - Insert/update `docs` table
  - Batch insert `chunks` with embeddings
  - Handle duplicates (upsert by doc id)
  - Transaction safety
- [ ] Add `pnpm ingest:db [persona-slug]` script

**Test**: Ingest processed docs → verify database records with correct embeddings

---

### Phase 4: Hybrid Search Implementation (RETRIEVAL)
**Goal**: Combine vector search + BM25 for robust retrieval

#### Milestone 4.1: Vector Search
- [ ] Create `src/lib/rag/search/vectorSearch.ts`
- [ ] Implement `vectorSearch()` function
  - Generate query embedding
  - Cosine similarity search using pgvector
  - Filter by persona slug
  - Return top-20 chunks with scores
- [ ] Add configurable threshold from `persona.config.json`

**Test**: Query "lightfield displays" → verify relevant chunks returned

#### Milestone 4.2: BM25 Lexical Search
- [ ] Create `src/lib/rag/search/bm25Search.ts`
- [ ] Implement `bm25Search()` function
  - PostgreSQL full-text search using `ts_rank_cd`
  - Filter by persona slug
  - Return top-20 chunks with scores
- [ ] Add configurable min_score threshold

**Test**: Query "diffractive backlighting patents" → verify keyword-based results

#### Milestone 4.3: Reciprocal Rank Fusion (RRF)
- [ ] Create `src/lib/rag/search/fusionSearch.ts`
- [ ] Implement `rrfFusion()` function
  - Combine vector + BM25 results
  - RRF formula: `score = Σ(1 / (k + rank))` where k=60
  - Deduplicate by chunk_id
  - Return top-12 fused results

**Test**: Run hybrid search → verify fusion improves recall vs. single method

#### Milestone 4.4: Tag Boosting
- [ ] Enhance fusion to apply tag boost (+5-10%)
- [ ] Match query terms against doc tags from `persona.config.json`
- [ ] Boost chunks from matching documents

**Test**: Query using persona tag alias → verify boosted results

---

### Phase 5: RAG API Integration (BACKEND)
**Goal**: Expose RAG retrieval via API routes

#### Milestone 5.1: Search API Endpoint
- [ ] Create `/api/rag/search` route
- [ ] Input: `{ query: string, personaSlug: string, limit?: number }`
- [ ] Output: `{ chunks: Array<{doc_id, section_path, text, score}> }`
- [ ] Add authentication middleware
- [ ] Add rate limiting

**Test**: POST request → verify chunks returned with citations

#### Milestone 5.2: Chat Integration
- [ ] Update `/api/chat/route.ts` to include RAG context
- [ ] Fetch relevant chunks for persona queries
- [ ] Format context for LLM prompt:
  ```
  [doc {doc_id} §{section_path}]
  {text}
  ```
- [ ] Pass context to Vercel AI SDK `streamText()`

**Test**: Chat with persona → verify RAG context used in response

---

### Phase 6: Citations & UI (FRONTEND)
**Goal**: Display inline citations with source links

#### Milestone 6.1: Citation Parsing
- [ ] Create `src/lib/rag/citations/parser.ts`
- [ ] Parse bracket citations `[^doc_id:section]` from LLM output
- [ ] Map to source URLs and section anchors
- [ ] Generate footnote-style citations list

**Test**: Parse sample response → verify citation extraction

#### Milestone 6.2: Chat UI Updates
- [ ] Update chat component to render citations
- [ ] Show inline bracket links
- [ ] Display sources list at bottom of message
- [ ] Make citations clickable (open source doc)

**Test**: View chat message with citations → verify formatting and links

---

### Phase 7: Admin Tools (MANAGEMENT)
**Goal**: UI for managing documents and monitoring RAG quality

#### Milestone 7.1: Document Management UI
- [ ] Create `/admin/rag` page
- [ ] List all docs by persona
- [ ] Show ingestion status
- [ ] Manual re-ingestion trigger
- [ ] Delete documents

**Test**: Navigate admin page → verify doc list and actions work

#### Milestone 7.2: Quality Monitoring
- [ ] Add search quality metrics
  - Average retrieval time
  - Chunk relevance scores
  - Citation usage frequency
- [ ] Create `/admin/rag/metrics` dashboard

**Test**: View metrics after multiple searches

---

### Phase 8: Testing & Optimization (QUALITY)
**Goal**: Validate end-to-end RAG pipeline

#### Milestone 8.1: E2E Test Suite
- [ ] Test full ingestion pipeline
- [ ] Test search relevance with known queries
- [ ] Test citation accuracy
- [ ] Test multi-persona filtering

**Test**: Run E2E tests → all pass

#### Milestone 8.2: Performance Optimization
- [ ] Benchmark search latency (target <500ms)
- [ ] Optimize vector index settings
- [ ] Add caching for frequent queries
- [ ] Monitor embedding API costs

**Test**: Load test with 100 concurrent queries

---

## Current Status

**Phase**: Pre-Phase 1 (Planning Complete)
**Next Steps**:
1. Create database migration for core tables
2. Set up basic ingestion utilities
3. Process sample documents

---

## Testing Strategy

Each milestone includes specific test criteria. Use this checklist:
- [ ] Unit tests for utilities
- [ ] Integration tests for API routes
- [ ] E2E tests with Playwright MCP
- [ ] Manual QA with real persona queries
- [ ] Performance benchmarks

---

## Dependencies

### Required Libraries
- `pdf-parse` - PDF text extraction
- `tiktoken` - Token counting for chunking
- `openai` - Embedding generation
- Existing: `@supabase/supabase-js`, `@ai-sdk/openai`

### Services
- Supabase (PostgreSQL + pgvector)
- OpenAI API (embeddings + chat)

---

## Notes

- **MVP Focus**: Implementing simplified routing (always run RAG) per PRD
- **No Cohere**: Skipping cross-encoder reranking for MVP
- **Manual Config**: persona.config.json remains manually curated
- **Gemini CLI**: Use for large file processing tasks to save context