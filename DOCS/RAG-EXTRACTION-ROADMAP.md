# RAG Document Extraction Roadmap

**Last Updated**: 2025-10-01

---

## Current State (MVP - Phase 8 Complete)

### ✅ EXTRACTION Pipeline (Local CLI)
**Command**: `pnpm ingest:docs <persona-slug> --use-gemini`

**Two-Stage Deterministic Approach**:
1. **Stage 1 - Text Extraction** (30s timeout):
   - PDFs → `pdftotext` command-line tool
   - DOCX → `mammoth` library
   - Other formats → Direct Gemini CLI handling

2. **Stage 2 - Gemini Formatting** (5min timeout):
   - Takes pre-extracted text as input
   - Document-type-specific structuring
   - Auto-generates frontmatter + Key Terms + Also Known As
   - Outputs production-ready formatted markdown

**Output**: `/personas/<slug>/RAG/*.md` files ready for ingestion

**Tested**: Successfully processed 508KB PDF with 1,106 lines (28 versions)

---

### ✅ INGESTION Pipeline (Admin UI)
**Location**: `/admin/rag` page

**Features** (Phase 8.1 Complete):
- Drag-drop upload for formatted markdown files
- Batch upload support (multiple files at once)
- Auto-triggers upon upload:
  - Chunking (800-1200 tokens with overlap)
  - Contextual retrieval (OpenAI GPT-4 Mini)
  - Embedding generation (OpenAI text-embedding-3-large)
  - Database storage (docs + chunks tables)
- Metadata editing (frontmatter + Key Terms + AKA)
- Re-ingestion trigger (manual)
- Document download
- Document deletion

**Status**: Fully functional, all 7 API routes + 5 UI components working

---

## Phase 10: RAW Document Extraction via Admin UI

### Goal
Enable end-to-end RAW document processing through web interface (no local CLI needed)

### Scope
**EXTRACTION pipeline only** - INGESTION pipeline already exists ✅

### Current Workflow (MVP)
```
RAW Documents (local)
    ↓ pnpm ingest:docs (CLI)
Formatted Markdown (local /personas/<slug>/RAG/)
    ↓ Admin UI upload
Database (Supabase)
```

### Future Workflow (Phase 10)
```
RAW Documents (upload via Admin UI)
    ↓ Server-side EXTRACTION (async queue)
Formatted Markdown (Supabase Storage)
    ↓ Review/approve in Admin UI
Database (auto-INGESTION via existing pipeline)
```

---

## Phase 10 Implementation Plan

### Milestone 10.1: Storage Infrastructure
- [ ] Create `raw-documents/` Supabase Storage bucket
- [ ] Set up RLS policies (admin: full access, members: none)
- [ ] Create `raw_document_files` table
  - Fields: `id`, `doc_id`, `persona_slug`, `storage_path`, `file_size`, `content_hash`, `uploaded_at`, `uploaded_by`
- [ ] Create `extraction_history` table
  - Fields: `id`, `raw_doc_id`, `formatted_doc_id`, `extraction_version`, `status`, `started_at`, `completed_at`, `error_message`

### Milestone 10.2: Server-Side Extraction API
- [ ] Install server dependencies:
  - `poppler-utils` for `pdftotext` command
  - Gemini CLI in server environment
  - Redis for job queue
- [ ] Create `/api/admin/documents/upload-raw` endpoint
  - Accepts: PDFs, DOCX, MD, HTML
  - Stores in `raw-documents/` bucket
  - Creates `raw_document_files` record
  - Triggers async extraction job
- [ ] Implement two-stage extraction service
  - Stage 1: Deterministic text extraction (`extractPdfText()`, etc.)
  - Stage 2: Gemini formatting with pre-extracted text
  - Save formatted markdown to `formatted-documents/` bucket
  - Create `extraction_history` record

### Milestone 10.3: Queue System
- [ ] Set up BullMQ with Redis
- [ ] Create extraction job queue with 3 jobs:
  1. `extract-text` - Run pdftotext/mammoth
  2. `format-with-gemini` - Structure with Gemini CLI
  3. `auto-ingest` - Trigger existing INGESTION pipeline
- [ ] Add progress tracking via job status
- [ ] Implement retry logic with exponential backoff (3 retries max)
- [ ] Create webhook endpoint for job completion notifications

### Milestone 10.4: Admin UI - RAW Upload
- [ ] Add RAW document upload section to `/admin/rag` page
- [ ] Create drag-drop zone for RAW files (PDFs, DOCX, etc.)
- [ ] Display upload progress with per-file status
- [ ] Show extraction queue status (queued → extracting → formatting → complete)
- [ ] Add processing history view with status badges
- [ ] Implement batch RAW upload support

### Milestone 10.5: Review & Approval Flow
- [ ] Create formatted markdown preview modal
- [ ] Add "Approve for Ingestion" button
- [ ] Add "Re-extract" button for failed/outdated conversions
- [ ] Show diff view between extraction versions
- [ ] Enable metadata editing before ingestion approval

---

## Infrastructure Requirements

### Server-Side Dependencies
- **poppler-utils**: For `pdftotext` command
- **Gemini CLI**: Installed and accessible in PATH
- **Redis**: For BullMQ job queue
- **Node.js**: For `child_process.exec()` to call CLI tools

### Deployment Considerations
- Increase server timeout for long-running extraction jobs (5+ minutes)
- Configure webhook endpoints for job notifications
- Set up Redis connection pooling for queue workers
- Monitor extraction costs (Gemini API usage)

---

## Testing Strategy

### Phase 10 Testing
- [ ] Test RAW upload with various file types (PDFs, DOCX, MD)
- [ ] Test large document processing (500KB+ PDFs)
- [ ] Test multi-version documents (release notes with 20+ versions)
- [ ] Test extraction failure scenarios (timeout, invalid format)
- [ ] Test retry logic with exponential backoff
- [ ] Test queue performance under load (10+ concurrent extractions)
- [ ] Test webhook notifications and status updates
- [ ] E2E test: RAW upload → extraction → approval → ingestion

### Validation Criteria
- ✅ 95%+ extraction success rate for common file types
- ✅ <10 minutes processing time for 95th percentile
- ✅ Graceful handling of extraction failures (retry + fallback)
- ✅ Accurate progress tracking and status updates
- ✅ No data loss on server restart (queue persistence)

---

## Success Metrics

### MVP (Current State)
- ✅ 100% ingestion success rate for formatted markdown
- ✅ <3s upload time for typical formatted documents
- ✅ Batch upload support (tested with 4 files)

### Phase 10 (Future State)
- 🎯 End-to-end RAW → DB pipeline via web UI
- 🎯 No local CLI dependency for document processing
- 🎯 Extraction history and versioning
- 🎯 Re-process capability for improved extraction quality
- 🎯 Admin oversight and approval workflow

---

## Timeline Estimate

**Phase 10 Total**: 4-6 weeks (post-MVP)

- **Week 1-2**: Storage infrastructure + API routes (Milestones 10.1-10.2)
- **Week 3**: Queue system + job processing (Milestone 10.3)
- **Week 4**: Admin UI for RAW upload (Milestone 10.4)
- **Week 5**: Review & approval flow (Milestone 10.5)
- **Week 6**: Testing, bug fixes, deployment

---

## Notes

**Why Phase 10 is Post-MVP**:
- ✅ Core RAG functionality complete (search, citations, multi-turn context)
- ✅ Admin tools for formatted documents working (upload, metadata editing, re-ingestion)
- ✅ Local CLI extraction workflow is functional and reliable
- 🎯 Phase 10 adds convenience (web UI) but isn't blocking for MVP deployment
- 🎯 Server-side infrastructure requirements (Redis, Gemini CLI) add complexity

**Current CLI Workflow is Acceptable Because**:
- Fast and reliable (two-stage deterministic approach)
- No circular dependencies
- Handles large documents (tested with 1,106-line PDFs)
- Produces production-ready output
- Low barrier to entry (requires poppler-utils + Gemini CLI locally)

**Phase 10 Provides Value For**:
- Non-technical users who can't run CLI commands
- Bulk document processing at scale
- Audit trail and versioning of extraction process
- Centralized document management (all files in cloud storage)
