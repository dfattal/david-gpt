# Reminders

- ✅ **RESOLVED**: RAG thresholds ARE used. Fixed bug in vectorSearch.ts where code looked for `config.retrieval.vector_threshold` instead of `config.router.vector_threshold`
- ✅ **RESOLVED**: persona.config.json IS actively used throughout the system:
  - Stored in `personas.config_json` (database JSONB column)
  - Used by Admin UI (PersonaConfigEditor) for router settings, topics, BM25 keywords
  - Used by RAG search pipeline (vector threshold, tag boosting via topics/aliases)
  - Relationship: `persona.md` = human-readable expertise docs, `persona.config.json` = machine-readable RAG config
- ✅ **CLEANUP**: Removed unused `getBM25MinScore()` function - BM25 min score is always 0.1, not persona-configurable
- Admin function to ADD persona (via uploading persona.md -- maybe without the thresholds)
  