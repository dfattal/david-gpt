# RAG Starter (Persona: david)

Drop Markdown files in <slug>/RAG. Each file **must** start with YAML frontmatter like:

```yaml
---
id: unique-stable-slug
title: Document Title
date: YYYY-MM-DD
source_url: https://original/source
type: blog|press|spec|tech_memo|faq|slide|email
personas: [david]
topics: [switchable-2d3d, predictive-tracking]
summary: "One-sentence abstract"
license: public|cc-by|proprietary
---
```

Then the body in Markdown.

## Ingestion checklist
- ✅ Frontmatter present (id, title, personas, at least one topic, summary).
- ✅ Topics are from `persona.config.json` (ids) or reasonable aliases.
- ✅ Clean headings, remove boilerplate, keep key figures as references if needed.
- ✅ Save as `*.md` in this folder. Run your ingester.

## Tips
- Keep chunks readable (short paragraphs, headings).
- Prefer concise sections over walls of text.
- Use `source_url` so citations can link back.
