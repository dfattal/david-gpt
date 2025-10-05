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

- **Tag Boosting** (+7.5%): Matches query terms against persona.config.json tags
- **Citation Boosting** (+15%): Recently cited documents in conversation
- **Document Deduplication**: Max 3 chunks per document

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

## 8. Admin Tools

### 8.1 Document Management (`/admin/rag`)

**Extraction Modes** (4 tabs):
1. **URL Extraction**: Single or batch URL extraction with metadata (patents, ArXiv)
2. **PDF Extraction**: Upload PDF → auto-extract → preview → ingest
3. **RAW Markdown**: Single or batch RAW markdown extraction with auto-generated frontmatter
4. **Formatted Markdown**: Direct upload of pre-formatted .md files (ingestion)

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

- **Database**: `docs` table with `raw_content`, `ingestion_status`, `extraction_metadata`
- **Storage**: `formatted-documents` bucket in Supabase Storage
- **Tracking**: `document_files` table with content hashes

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
