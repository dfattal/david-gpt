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

**Key Terms**: Related terminology, aliases, alternative names
**Also Known As**: Additional synonyms and technical terms

# Body in Markdown
…
```

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
2. Search boosting hints - include aliases, synonyms, and related technical terms that users might query with

---

## 5. Ingestion Workflow

### 5.1 Preparing RAW content

RAW could be a PDF, URL, Markdown, slides, or text.
Steps:
1. Extract clean text – e.g. pandoc, trafilatura, pdftotext, OCR if needed.
2. Normalise to Markdown – keep logical headings, short paragraphs.

### 5.2 Script-based document generation

**Automated processing script**:

1. **Auto-generate frontmatter**:
   - `id`: kebab-case from filename
   - `title`: extract from first H1 or use filename
   - `personas`: set from folder location (`/personas/<slug>/RAG/`)
   - `date`, `source_url`, `type`: extract if obvious, otherwise leave blank

2. **Content processing**:
   - Clean and normalize markdown formatting
   - Preserve logical heading structure
   - Handle PDF/HTML extraction using existing tools

3. **Manual curation** (optional):
   - Add `summary` and `tags` fields
   - Review and adjust extracted content

Save processed files in `/personas/<slug>/RAG/`.

---

## 6. Database Schema (simplified)

**Core tables**:
- `personas(slug, display_name, config_json)`
- `docs(id, title, date, source_url, type, summary, license, personas jsonb, tags jsonb)`
- `chunks(id, doc_id, section_path, text, token_count, embeddings vector)`

**Indexes**:
- Vector index on `chunks.embeddings` (HNSW)
- GIN index on `docs.personas` and `docs.tags`
- Full-text search index on `chunks.text` for BM25

**Benefits**: Eliminates junction tables, reduces JOINs, uses JSONB for flexibility.

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

### 7.2 Simplified RAG retrieval pipeline

Filter by `persona_slug`.
1. **Hybrid search**
   - Vector search on chunk embeddings (top-20)
   - BM25 lexical search on chunk text (top-20)
   - Fuse with Reciprocal Rank Fusion (RRF) → top-12
2. **Tag boosting** (lightweight):
   - Apply small score boost (+5-10%) to chunks from documents containing persona tags
   - Helps surface relevant documents when query uses aliases or related terms
3. **De-duplicate by doc**, prefer 2–3 best chunks per document

**Removed**: Cross-encoder reranking (eliminates Cohere dependency)
**Benefits**: Faster retrieval, fewer service dependencies, good baseline quality

**Handling Aliases**: Combination of semantic search, persona tags for boosting, and embedded Key Terms in documents naturally handles terminology variations without complex query expansion.

---

### 7.3 Prompt to LLM for answer with citations

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
> [doc {doc_id} §{section_path}]
> {text}
> ```

Post-process bracket cites into footnotes linking `source_url` + heading anchor.

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

### MVP Simplifications (Phase 1)
- **Routing**: Always run RAG (no complex classification)
- **Retrieval**: Vector + BM25 + RRF with lightweight tag boosting (no reranking)
- **Alias Handling**: Embedded Key Terms in documents + persona tags for boosting
- **Config**: Manual persona.config.json curation with search-hint tags
- **Ingestion**: Script-based frontmatter generation
- **Schema**: JSONB arrays (no junction tables)
- **File Structure**: RAW-DOCS + RAG only (no QA-QUEUE)

### Future Enhancements (Phase 2+)
- Smart routing with LLM classification
- Cross-encoder reranking for improved precision
- LLM-based query expansion for complex alias handling
- Auto-generated persona configs
- Time-decay ranking for freshness
- Answer caching for frequently asked questions
- Automated quality checks and validation

---

## 11. Out-of-Scope Handling

When router outputs `OUT_OF_SCOPE`:
- Return a polite deferral:
  > “This question is outside `<display_name>`’s expertise; switching to the general assistant.”
- Forward query to a general LLM.
