# RAG Product Requirements Document

> **Project**: david-gpt – Multi-persona RAG Platform
> **Scope**: Persona-aware retrieval-augmented generation (RAG) for scalable ingestion and reliable, cited answers.
> **Last Updated**: 2025-10-03

---

## 1. Goals

- Allow each persona (e.g. david) to answer questions using its own curated knowledge base.
- Keep persona profile and RAG docs in sync in one folder:
  ```
  /personas/<slug>/
  ├ persona.md – natural-language profile
  ├ persona.config.json – manually curated config for routing
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
      /RAG                       # processed markdown docs ready for ingestion
         doc1.md                 # formatted *.md with frontmatter
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
type: blog|press|spec|tech_memo|faq|slide|email|patent|arxiv # optional
personas: [<slug>]                 # auto-set from folder location
tags: [simple, string, tags]       # simplified from complex topics
summary: "One-sentence abstract"   # manual curation
license: public|cc-by|proprietary  # optional
identifiers:                       # structured identifiers
  arxiv_id: "2501.11841"          # for ArXiv papers
  doi: "10.48550/..."             # when available
  patent_number: "US11281020"     # for patents
dates:                             # structured dates
  submitted: "YYYY-MM-DD"         # ArXiv submission
  filing: "YYYY-MM-DD"            # patent filing
  granted: "YYYY-MM-DD"           # patent grant
actors:                            # people/organizations
  - name: "Author/Inventor Name"
    role: "author|inventor|assignee"
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

Free-form natural language describing the persona's expertise.

### 4.2 persona.config.json

**Manually curated** configuration that directly influences RAG retrieval performance:

```json
{
  "slug": "david",
  "display_name": "David (Leia/Immersity)",
  "version": "1.0.0",
  "last_updated": "2025-09-24",
  "topics": [
    {
      "id": "glasses-free-3d",
      "aliases": ["autostereoscopic", "lightfield display", "spatial display"]
    },
    {
      "id": "2d3d-conversion",
      "aliases": ["Immersity", "Neural Depth", "NeurD", "monocular depth estimation"]
    }
  ],
  "router": {
    "vector_threshold": 0.35,
    "bm25_keywords": ["Leia", "Immersity", "3D Cell", "LC lens", "DLB"],
    "bm25_keywords_min_hits": 1,
    "min_supporting_docs": 2,
    "fallback": "handoff"
  }
}
```

**Configuration Fields**:

**Critical (Affects Retrieval)**:
- `topics[]` - Topic objects with `id` and `aliases[]` for tag boosting (+7.5% default)
- `router.vector_threshold` - Minimum cosine similarity for vector search (0.0-1.0)
- `router.bm25_keywords` - Keywords for query routing decisions
- `router.bm25_keywords_min_hits` - Minimum keyword matches required
- `router.min_supporting_docs` - Minimum documents for valid RAG response

**Informational (Metadata)**:
- `slug` - Persona identifier (used for filtering)
- `display_name` - UI display name
- `version`, `last_updated` - Versioning info
- `in_scope_examples`, `out_of_scope_examples` - Documentation/training data

### 4.3 Admin UI for Persona Configuration

**Location**: `/admin/rag` → "Persona Config" tab

**Features**:
- Select persona from dropdown (fetched from database)
- **Search Sensitivity Presets** - User-friendly radio buttons instead of technical slider
- Manage BM25 keywords with tag input
- Add/edit/remove topics and their aliases
- Save changes directly to database (`personas.config_json`)

**Search Sensitivity Presets** (replaces technical threshold slider):
- **Very Strict (0.50)** - Only nearly-exact semantic matches
- **Strict (0.40)** - High relevance required
- **Balanced (0.35)** - Good mix of precision and recall (recommended) ⭐ Default
- **Broad (0.25)** - Include tangentially related content
- **Very Broad (0.15)** - Cast a wide net, may include false positives

**Workflow**:
1. Navigate to `/admin/rag`
2. Click "Upload Documents" → Select "Persona Config" tab
3. Choose persona from dropdown
4. Edit configuration:
   - Search Sensitivity (5 preset options with descriptions)
   - BM25 Keywords (add/remove)
   - Min Hits & Supporting Docs (number inputs)
   - Topics & Aliases (nested editor)
5. Click "Save Configuration"
6. Changes take effect immediately on next RAG query

**API Endpoints**:
- `GET /api/admin/personas` - List all personas
- `GET /api/admin/personas/[slug]` - Fetch specific persona config
- `PATCH /api/admin/personas/[slug]` - Update persona config

---

## 5. Document Extraction & Ingestion

### 5.1 Extraction Methods

David-GPT supports four extraction methods:

#### **A. PDF Extraction** (Admin UI)
- Upload PDF via `/admin/rag` → "URL Extraction" → "Single URL" mode
- Automatic extraction using 7-step pipeline:
  1. PDF text extraction (pdf-parse)
  2. Text normalization (heuristics)
  3. Document type detection (ArXiv, patent, general)
  4. Web metadata fetching (dates, authors, identifiers)
  5. Content chunking (~2-3k chars with page anchors)
  6. Gemini API formatting (sequential with rate limiting)
  7. Document assembly (frontmatter + validation)
- Stores extracted markdown in database (`ingestion_status = 'extracted'`)
- Returns docId for preview/edit before ingestion

#### **B. URL Extraction** (Admin UI)
**Supported URLs**:
- **Patents**: Google Patents URLs or patent numbers (e.g., `US10838134B2`)
- **ArXiv Papers**: ArXiv URLs or identifiers (e.g., `arxiv:2405.10314`)

**Single URL Mode**:
- Input URL/identifier → Extract → Store in DB → Preview/edit → Ingest

**Batch URL Mode** (with metadata injection):
```markdown
# URL List Format
## Section Name (optional)
- URL | key_term1, key_term2 | aka: Alternative Name
```

Example:
```markdown
## Core Patents
- US10838134B2 | multibeam, light guide | aka: Core Backlight Patent
- arxiv:2405.10314 | holography, neural networks
```

**Features**:
- Parses markdown URL lists with metadata
- Merges user-provided key terms with AI-extracted terms
- **Auto-generates structured metadata** (identifiers, dates, actors) specific to document type:
  - Patents: patent_number, application_number, filing/granted dates, inventors/assignees
  - ArXiv: arxiv_id, doi, submitted/updated dates, authors with affiliations
  - Articles: article_id, url, published/updated dates, authors
- Stores all extractions in database with structured metadata immediately available
- Download all as ZIP or preview individually

#### **C. RAW Markdown Extraction** (Admin UI)
**Purpose**: Convert unstructured RAW markdown files into RAG-formatted markdown with auto-generated frontmatter.

**Supported Modes**:
- **Single File**: Upload one RAW markdown file
- **Batch Files**: Upload multiple RAW markdown files

**Process**:
1. Upload RAW markdown (e.g., `/personas/david/RAW-DOCS/LIF.md`)
2. Gemini AI analyzes content and extracts:
   - Document type (technical_memo, spec, faq, blog, article, guide)
   - Key terms (5-10 technical terms/concepts)
   - Also Known As (synonyms/acronyms)
   - Summary (one-sentence)
   - Detected dates and authors
   - **Structured metadata**: identifiers, dates, actors
3. Auto-generates YAML frontmatter with structured metadata
4. Stores formatted markdown in database (`ingestion_status = 'extracted'`)
5. **Structured metadata is immediately available in metadata editor** for review/edit before ingestion
6. Returns docId for preview/edit before ingestion

**Example Input** (`/personas/david/RAW-DOCS/LIF.md`):
```markdown
# Leia Image Format (LIF)

LIF is a format designed to enable users to capture, create, and experience immersive 3D imagery...
```

**Example Output** (formatted with frontmatter):
```markdown
---
id: lif
title: "Leia Image Format (LIF)"
type: technical_memo
personas: [david]
tags: ["3D imagery", "LIF", "depth maps", "view synthesis"]
summary: "Technical specification for Leia Image Format enabling 3D content capture and display"
identifiers:
  document_id: "lif"
  filename: "LIF.md"
dates:
  created: "2024-01-15"
actors:
  - name: "David Fattal"
    role: "author"
---

**Key Terms**: 3D imagery, LIF, depth maps, view synthesis, XR, stereo rendering
**Also Known As**: Leia Image Format

# Leia Image Format (LIF)
...
```

#### **D. Formatted Markdown Upload** (Admin UI)
- Direct upload of pre-formatted `.md` files with frontmatter
- Batch upload support (multiple files)
- Immediate or deferred ingestion
- **Note**: This is INGESTION, not EXTRACTION

### 5.2 Document Lifecycle

```
1. EXTRACTION (PDF/URL/RAW Markdown) → docs.ingestion_status = 'extracted'
   ├─ Markdown stored in docs.raw_content
   ├─ File uploaded to storage bucket
   └─ Extraction metadata preserved

2. PREVIEW & EDIT (Admin UI)
   ├─ View rendered markdown or source
   ├─ Edit metadata, key terms, AKA
   └─ Save changes without re-ingestion

3. INGESTION (Manual trigger)
   ├─ Click "Ingest Now" in preview modal
   ├─ Chunks created with embeddings
   ├─ docs.ingestion_status = 'ingested'
   └─ Document ready for RAG queries
```

**Extraction vs Ingestion**:
- **EXTRACTION** (RAW → FORMATTED): Converting unstructured documents to RAG-formatted markdown
  - PDF Extraction
  - URL Extraction
  - RAW Markdown Extraction
- **INGESTION** (FORMATTED → CHUNKS): Chunking and embedding formatted markdown
  - Formatted Markdown Upload

### 5.3 Chunking & Embedding

- **Chunking**: 800-1200 tokens with 17.5% overlap
- **Contextual Retrieval**: LLM-generated 1-2 sentence context for each chunk (OpenAI GPT-4 Mini)
- **Embeddings**: OpenAI text-embedding-3-large (3072 dimensions)
- **Code-Aware**: Detects and extracts code blocks as separate reference chunks

---

## 6. Retrieval Strategy

### 6.1 Hybrid Search

Combines three methods:
1. **Vector Search**: Semantic similarity using pgvector cosine distance
2. **BM25 Search**: Lexical keyword matching using PostgreSQL full-text
3. **RRF Fusion**: Reciprocal Rank Fusion combines results

### 6.2 Boosting Mechanisms

- **Tag Boosting** (+7.5%): Matches query terms against `persona.config.json` topic aliases
  - Configured per-persona in admin UI
  - Applied during RRF fusion step
  - Boosts chunks from documents with matching tags
- **Citation Boosting** (+15%): Recently cited documents in conversation
- **Document Deduplication**: Max 3 chunks per document (configurable)

### 6.3 Multi-Turn Context

- **Query Reformulation**: Resolves pronouns and implicit references using conversation history
- **Citation-Based Boosting**: Documents cited in last 2 messages receive priority
- **Cost**: ~$0.0001 per query (GPT-4o-mini)

---

## 7. Citations

### 7.1 Format

Inline citations: `[^doc_id:section]`

Example: "The system uses diffractive gratings[^us10838134:background]..."

### 7.2 Rendering

- **Inline**: Superscript clickable numbers
- **Sources List**: Bottom of message with document titles, sections, URLs
- **Database**: Persisted in `message_citations` table for boosting

---

## 7.5 Persona Display in Chat UI

### 7.5.1 Requirements

Assistant messages must display the correct persona information dynamically based on the conversation context:

- **Persona Name**: Display actual persona name (e.g., "Albert Einstein" not hardcoded "David Fattal")
- **Persona Expertise**: Show persona-specific expertise description (from `personas.expertise` field)
- **Persona Avatar**: Use persona-specific avatar image (from local avatars or Supabase Storage)
- **Fallback Behavior**: Default to David Fattal if persona information unavailable

### 7.5.2 Implementation

**MessageBubble Component** (`src/components/chat/message-bubble.tsx`):
- Accepts optional `persona` prop with persona details (`id`, `persona_id`, `name`, `expertise`, `avatar_url`)
- Uses `getPersonaAvatar()` and `getPersonaInitials()` from avatar-utils
- Dynamically renders persona name, expertise, and avatar for assistant messages

**ChatInterface Component** (`src/components/chat/chat-interface.tsx`):
- Passes `selectedPersona` to MessageBubble for all assistant messages
- Maintains single persona per conversation (stored in `conversations.persona_id`)

**Database Schema**:
- `personas.name` - Display name (e.g., "David (Leia/Immersity)")
- `personas.expertise` - Short description for UI display (e.g., "Expert Legal Advisor")
- `personas.avatar_url` - Avatar image URL in Supabase Storage
- `personas.persona_id` - Slug for local avatar fallback (e.g., "david", "legal")

### 7.5.3 Multi-Turn Behavior

**Same Persona**: All messages in conversation display same persona (multi-turn works)

**Persona Switching**: User switching personas creates new conversation (clean separation of context)

**Future Enhancement**: Per-message persona tracking for mid-conversation switching (deferred)

---

## 7.6 Conversation Filtering by Persona

### 7.6.1 Requirements

The conversation sidebar must filter conversations based on the currently selected persona:

- **Persona-Based Filtering**: Only show conversations for the active persona
- **Dynamic Title**: Update sidebar title to "Conversations with [Persona Name]"
- **Empty State**: Persona-aware messaging when no conversations exist
- **Backward Compatibility**: Handle old conversations with null persona_id gracefully

### 7.6.2 Implementation

**ConversationSidebar Component** (`src/components/chat/conversation-sidebar.tsx`):
- Accepts `selectedPersona` prop from ChatLayout
- Client-side filtering: `conversations.filter(c => !selectedPersona || c.persona_id === selectedPersona.id)`
- Dynamic title rendering: `"Conversations" + (selectedPersona ? ` with ${selectedPersona.name}` : "")`
- Persona-aware empty state: `"No conversations yet" + (selectedPersona ? ` with ${selectedPersona.name}` : "")`

**ChatLayout Component** (`src/components/chat/chat-layout.tsx`):
- Passes `selectedPersona` prop to ConversationSidebar
- No API changes required (filtering happens client-side)

**Database Schema**:
- `conversations.persona_id` - Foreign key to personas.id (nullable for backward compatibility)
- Populated on conversation creation when persona is selected

### 7.6.3 Persona Assignment on Creation

**Bug Fix** (Phase 16): Conversations were not saving persona_id correctly

**Root Cause**: ChatInterface was using `selectedPersona?.slug` but PersonaOption interface has `persona_id` field

**Fix Applied** (`src/components/chat/chat-interface.tsx`):
```typescript
// Before (Bug):
personaSlug: selectedPersona?.slug

// After (Fixed):
personaSlug: selectedPersona?.persona_id
```

**API Flow** (`/api/conversations/route.ts`):
1. Receives `personaSlug` from frontend
2. Looks up persona UUID from slug: `SELECT id FROM personas WHERE slug = personaSlug`
3. Stores UUID in `conversations.persona_id`

### 7.6.4 Filtering Behavior

**Active Persona Filter**:
- Shows only conversations where `persona_id` matches selected persona's UUID
- Conversations with null `persona_id` are hidden (pre-persona conversations)
- Client-side filtering (no additional API calls)

**Null Persona Handling**:
- Old conversations with null persona_id gracefully hidden from filtered view
- No data migration required
- Future: Could add "All Conversations" toggle if needed

**Performance**:
- Client-side filtering (conversations already fetched)
- Minimal re-renders (filter applied before map)
- No additional database queries

---

## 8. Admin Tools

### 8.1 Document Management (`/admin/rag`)

**Tabs** (5 modes):
1. **URL Extraction**: Single or batch URL extraction with metadata (patents, ArXiv)
2. **PDF Extraction**: Upload PDF → auto-extract → preview → ingest
3. **RAW Markdown**: Single or batch RAW markdown extraction with auto-generated frontmatter
4. **Formatted Markdown**: Direct upload of pre-formatted .md files (ingestion)
5. **Persona Config**: Edit persona retrieval settings and topic aliases

**Document Actions**:
- **Preview**: View/edit markdown with split preview/source view
- **Edit Metadata**: Update frontmatter, key terms, AKA
- **Ingest**: Trigger chunking + embeddings (for `extracted` docs)
- **Re-ingest**: Delete chunks and re-process (for `ingested` docs)
- **Download**: Export formatted markdown
- **Delete**: Remove document + chunks + storage

**Filters**:
- Ingestion status: `extracted | ingested | all`
- Persona
- Document type
- Search query

### 8.2 Storage Architecture

David-GPT uses a **three-layer storage architecture** to ensure data integrity and consistency:

1. **Primary Storage** (`docs` table):
   - `raw_content`: Complete markdown document with frontmatter
   - `ingestion_status`: Document lifecycle state (`extracted | ingested | failed`)
   - `extraction_metadata`: Extraction method and timestamps
   - `personas`: JSONB array of persona slugs
   - `tags`, `summary`, `identifiers`, `dates`, `actors`: Structured metadata

2. **File Storage** (`formatted-documents` bucket):
   - Supabase Storage bucket containing physical markdown files
   - Path format: `{persona_slug}/{doc_id}.md`
   - Publicly accessible via signed URLs

3. **Tracking Layer** (`document_files` table):
   - `content_hash`: SHA-256 hash of file content for change detection
   - `file_size`: Document size in bytes
   - `storage_path`: Location in storage bucket
   - Foreign key to `docs` table via `doc_id`

**Synchronization Guarantees**:

All three storage locations are automatically synchronized on document updates:

- **Persona Reassignment** (`PATCH /api/admin/documents/[id]/personas`):
  - Updates `docs.personas` array and `raw_content` frontmatter
  - Recalculates SHA-256 hash and updates `document_files.content_hash`
  - Uploads updated markdown to storage bucket
  - All three layers stay in sync with identical content hashes

- **Metadata Edits** (`PATCH /api/admin/documents/[id]/metadata`):
  - Updates `docs` table fields (title, tags, summary, etc.)
  - Updates `raw_content` frontmatter and inline sections (Key Terms, Also Known As)
  - Recalculates content hash and syncs to `document_files`
  - Uploads to storage bucket with upsert
  - **Auto Re-ingestion Marking**: Edits to search-critical fields (`keyTerms`, `alsoKnownAs`, `tags`, `summary`) automatically change `ingestion_status` from `'ingested'` to `'extracted'` to trigger re-embedding

- **Hash Verification**:
  ```sql
  -- Verify three-layer synchronization
  SELECT
    d.id,
    encode(sha256(d.raw_content::bytea), 'hex') AS calculated_hash,
    df.content_hash AS stored_hash,
    (encode(sha256(d.raw_content::bytea), 'hex') = df.content_hash) AS hashes_match
  FROM docs d
  JOIN document_files df ON d.id = df.doc_id
  WHERE d.id = 'doc_id_here';
  ```

**Benefits**:
- **Data Integrity**: Cryptographic hashing detects content drift
- **Storage Reliability**: Database is source of truth with storage as backup
- **Search Accuracy**: Auto re-ingestion ensures embeddings reflect current metadata
- **Audit Trail**: Content hash changes indicate document modifications

---

## 9. API Routes

### Document Management
- `GET /api/admin/documents` - List with filters
- `GET /api/admin/documents/[id]` - Get details
- `POST /api/admin/documents/upload` - Upload markdown
- `PATCH /api/admin/documents/[id]/metadata` - Update metadata
- `POST /api/admin/documents/[id]/reingest` - Re-ingest
- `DELETE /api/admin/documents/[id]` - Delete
- `GET /api/admin/documents/[id]/download` - Download

### Extraction
- `POST /api/admin/extract-pdf` - Extract from PDF
- `POST /api/admin/extract-url` - Extract single URL
- `POST /api/admin/extract-url-batch` - Extract batch URLs
- `POST /api/admin/extract-markdown` - Extract RAW markdown
- `POST /api/admin/extract-markdown-batch` - Extract batch RAW markdown

### Search & Chat
- `POST /api/rag/search` - Hybrid search
- `POST /api/chat` - RAG-enabled chat (Vercel AI SDK streamText)

---

## 10. Technology Stack

### Frontend
- Next.js 15 (App Router)
- React 19
- Tailwind CSS 4
- shadcn/ui components

### Backend
- Supabase (PostgreSQL + pgvector)
- OpenAI API (embeddings + chat)
- Vercel AI SDK 5
- Gemini API (document formatting)

### Processing
- pdf-parse (PDF extraction)
- tiktoken (token counting)
- react-markdown (preview rendering)

---

## 11. Cost Analysis

### Per Document Ingestion
- Context generation: $0.0001-0.0002 per chunk (GPT-4 Mini)
- Embeddings: $0.13 per 1M tokens (text-embedding-3-large)
- Total: ~$0.02-0.04 per document

### Per Query
- Query reformulation: $0.0001 (GPT-4o-mini)
- Embedding generation: ~$0.000013 (single query)
- Total: ~$0.0001 per query

---

## 12. Success Metrics

### Extraction Quality
- ✅ Complete content preservation (4x improvement over basic extraction)
- ✅ Accurate metadata (dates, authors, identifiers)
- ✅ Structured output optimized for RAG chunking
- ✅ 500-800 word sections with semantic coherence

### Search Performance
- ✅ <2s latency (including reformulation + embedding)
- ✅ 95%+ relevant chunks in top 10 results
- ✅ Multi-turn context preservation via citation boosting
- ✅ Tag-based relevance hints for persona-specific queries

### Admin Experience
- ✅ 3-step workflow: Extract → Preview/Edit → Ingest
- ✅ Batch processing (50+ URLs)
- ✅ Status tracking (`extracted | ingested | failed`)
- ✅ Re-ingestion without re-extraction

---

## 13. Future Enhancements

### Phase 10: Server-Side RAW Processing (Post-MVP)
- Web-based file upload for RAW documents (PDFs, DOCX)
- Async queue processing (BullMQ + Redis)
- Extraction history and versioning
- Diff view between extraction versions
- Re-process capability for improved quality

### Other Enhancements
- Quality monitoring dashboard (search analytics, citation metrics)
- E2E testing suite (Playwright)
- Performance optimization (caching, query optimization)
- Multi-language support for international papers
- Image and table extraction improvements
