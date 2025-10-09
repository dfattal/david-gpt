# Reminders

- ✅ **RESOLVED**: RAG thresholds ARE used. Fixed bug in vectorSearch.ts where code looked for `config.retrieval.vector_threshold` instead of `config.router.vector_threshold`
- ✅ **RESOLVED**: persona.config.json IS actively used throughout the system:
  - Stored in `personas.config_json` (database JSONB column)
  - Used by Admin UI (PersonaConfigEditor) for search settings and topic configuration
  - Used by RAG search pipeline (vector threshold, tag boosting via topics/aliases)
  - Relationship: `persona.md` = human-readable expertise docs, `persona.config.json` = machine-readable RAG config
- ✅ **CLEANUP**: Removed unused `getBM25MinScore()` function - BM25 min score is always 0.1, not persona-configurable
- ✅ **CLEANUP**: Removing dead "router" config fields - query routing was never implemented:
  - Removing: `router.bm25_keywords`, `router.bm25_keywords_min_hits`, `router.min_supporting_docs`, `router.fallback`
  - Keeping: `search.vector_threshold` (used for filtering), `topics[]` (used for tag boosting)
  - RAG is always invoked - no smart routing to bypass it for general knowledge queries
- Admin function to ADD persona (via uploading persona.md -- maybe without the thresholds)
  