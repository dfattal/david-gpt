# Source URL Flow Documentation

## Overview
This document explains how `source_url` is extracted, stored, and retrieved throughout the RAG system for citations.

## 1. Extraction Phase

### Raw Markdown Batch Upload (`rawMarkdownFormatter.ts`)
**Extraction Method**: Gemini AI + Regex Fallback
```typescript
// Gemini prompt asks for sourceUrl from markdown links like:
// "Source: [text](URL)" → extracts URL from parentheses
// Fallback regex patterns if Gemini fails:
- /\*Source:\s*\[([^\]]+)\]\(([^)]+)\)/i
- /Source:\s*\[([^\]]+)\]\(([^)]+)\)/i
```
**Storage in Frontmatter**: `identifiers.source_url`

### URL Extraction (`genericArticleExtractor.ts` → `documentAssembler.ts`)
**Extraction Method**: URL parameter passed directly
```typescript
// URL is known from the extraction request
article.metadata.source_url = originalUrl
```
**Storage in Frontmatter**: `identifiers.source_url`

### PDF Extraction (`pdfExtractor.ts` → `documentAssembler.ts`)
**Extraction Method**: Not extracted (PDFs don't inherently have URLs)
**Storage in Frontmatter**: Only if provided via API parameter
- Patent PDFs: Google Patents URL passed as parameter → `identifiers.source_url`
- ArXiv PDFs: Constructed from arxiv_id → `identifiers.source_url`

### ArXiv Extraction (`arxivHtmlExtractor.ts` → `arxivMarkdownFormatter.ts`)
**Extraction Method**: Constructed from arxiv_id
```typescript
source_url = `https://arxiv.org/abs/${arxivId}`
html_url = `https://arxiv.org/html/${arxivId}`
```
**Storage in Frontmatter**:
- `identifiers.source_url`: abs URL
- `identifiers.html_url`: HTML URL

### Patent Extraction (`patentGeminiExtractor.ts` → `patentGeminiFormatter.ts`)
**Extraction Method**: Google Patents URL passed as parameter
```typescript
sourceUrl = "https://patents.google.com/patent/US10838134B2"
```
**Storage in Frontmatter**: `identifiers.source_url`

## 2. Storage Phase (`documentStorage.ts`)

### Frontmatter to Database
**Code Location**: `src/lib/rag/storage/documentStorage.ts:88-120`

```typescript
// Extract from structured fields with fallback to old top-level
const primarySourceUrl = frontmatter.identifiers?.source_url ||
                        frontmatter.source_url ||
                        null;

// Store in BOTH locations:
await supabase.from('docs').upsert({
  source_url: primarySourceUrl,        // Top-level column (for queries)
  identifiers: frontmatter.identifiers, // JSONB (for full metadata)
  // ... other fields
});
```

### Database Schema
**Table**: `docs`
- **`source_url`**: `text` (nullable) - Top-level column for fast queries
- **`identifiers`**: `jsonb` (nullable) - Structured metadata including `source_url`

**Why Both?**
- Top-level `source_url`: Fast indexed queries, used by search functions
- `identifiers.source_url`: Part of structured metadata, preserved in raw_content

## 3. Retrieval Phase (Search & Citations)

### Vector Search (`vector_search_chunks` function)
**SQL Query**:
```sql
SELECT
  c.id as chunk_id,
  c.doc_id,
  c.section_path,
  c.text,
  d.title as doc_title,
  d.type as doc_type,
  d.source_url  -- ← Reads from top-level column
FROM chunks c
INNER JOIN docs d ON c.doc_id = d.id
WHERE d.personas @> to_jsonb(persona_slug::text)
```

### BM25 Search (`bm25_search_chunks` function)
**Similar SQL**: Also reads from `d.source_url` (top-level column)

### Search Result Structure
```typescript
interface SearchResult {
  chunkId: string;
  docId: string;
  sectionPath: string;
  text: string;
  score: number;
  docTitle?: string;
  docType?: string;
  sourceUrl?: string;  // ← Populated from d.source_url
}
```

### Citation Generation
**Code Location**: `src/lib/rag/citations/saveCitations.ts`

When saving citations, `sourceUrl` from search results is stored in the `message_citations` table for later display in the UI.

## 4. Display Phase (Chat Interface)

### Citation Display
**Component**: `src/components/chat/message-bubble.tsx`

Citations are rendered with clickable links that use the stored `sourceUrl`.

## Summary Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ EXTRACTION                                                   │
├─────────────────────────────────────────────────────────────┤
│ Raw MD: Gemini extracts from [text](URL) patterns          │
│ URL: Passed as parameter (known source)                     │
│ PDF: Passed as parameter (Google Patents, ArXiv)            │
│ ArXiv: Constructed from arxiv_id                            │
│ Patent: Passed as Google Patents URL                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTMATTER (Structured Format)                             │
├─────────────────────────────────────────────────────────────┤
│ identifiers:                                                 │
│   source_url: "https://..."  ← Primary storage location    │
│   arxiv_id: "2501.11841"                                    │
│   patent_number: "US10838134"                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ DATABASE (Dual Storage)                                      │
├─────────────────────────────────────────────────────────────┤
│ docs.source_url: text (indexed, for queries)               │
│ docs.identifiers: jsonb (full metadata)                     │
│                                                              │
│ Extracted via:                                               │
│   frontmatter.identifiers?.source_url || frontmatter.source_url
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ SEARCH (Vector + BM25)                                       │
├─────────────────────────────────────────────────────────────┤
│ SELECT d.source_url FROM docs d  ← Reads top-level column  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ CITATIONS                                                    │
├─────────────────────────────────────────────────────────────┤
│ SearchResult.sourceUrl → message_citations table            │
│ → Displayed as clickable link in chat UI                    │
└─────────────────────────────────────────────────────────────┘
```

## Backward Compatibility

The system supports both old and new formats:

### Reading (documentStorage.ts)
```typescript
// New format (structured)
frontmatter.identifiers?.source_url

// Old format (top-level) - fallback
frontmatter.source_url
```

### Writing (All formatters)
- **New documents**: Only write to `identifiers.source_url`
- **Database storage**: Extracts to both `source_url` column and `identifiers` JSONB
- **Search functions**: Read from `docs.source_url` column

## Migration Status

✅ **Extraction**: All formatters now write to structured format
✅ **Storage**: Dual storage (top-level + structured) for compatibility
✅ **Retrieval**: Search functions use top-level column (no changes needed)
✅ **Display**: Citations use sourceUrl from search results (no changes needed)

No breaking changes - system works with both old and new format documents.
