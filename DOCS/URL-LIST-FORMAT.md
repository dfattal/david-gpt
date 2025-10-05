# URL List Format for Batch Extraction

This document describes the markdown format for URL list files used in batch extraction.

## Overview

The URL list format is a lightweight, flexible markdown format that allows you to specify:
- URLs or identifiers to extract
- Optional key terms for metadata injection
- Optional "also known as" names for documents
- Organizational sections for human readability

## Format Specification

### Basic Structure

```
# Document Collection Title (optional)

Brief description (optional)

## Section Name (optional)

- URL_OR_IDENTIFIER [| key_term1, key_term2, ...] [| aka: Alternative Name]
- URL_OR_IDENTIFIER | aka: Alternative Name (key terms optional)
- URL_OR_IDENTIFIER (both optional - AI will extract everything)
```

### Elements

1. **URL/Identifier** (required)
   - Full URLs, patent numbers, ArXiv IDs, or shorthand identifiers
   - Examples:
     - `US10838134B2`
     - `https://patents.google.com/patent/US10838134B2`
     - `arxiv:2405.10314`
     - `2501.11841`
     - `https://arxiv.org/abs/2405.10314`

2. **Key Terms** (optional)
   - Pipe-separated list after first `|`
   - Format: `| term1, term2, term3`
   - **Can be omitted entirely** - AI will extract key terms automatically
   - Merged with AI-extracted key terms in final markdown

3. **Also Known As** (optional)
   - Alternative name after `| aka:`
   - Format: `| aka: Alternative Name`
   - **Can be used without key terms**: `- URL | aka: Name`
   - Added to document metadata

4. **Sections** (optional)
   - `## Section Name` for organization
   - Not stored in metadata, for human readers only

5. **Comments** (optional)
   - Lines starting with `>` or `<!-- -->`
   - Ignored during parsing

## Examples

### Valid Format Variations

All these formats are valid:

```
# Different ways to format entries

## Just URLs (AI extracts everything)
- US11281020
- arxiv:2405.10314

## URL + AKA only (no key terms)
- US11281020 | aka: Switchable LC Patent
- arxiv:2405.10314 | aka: Neural Holography Paper

## URL + Key Terms only (no AKA)
- US11281020 | switchable LC, directional backlight
- arxiv:2405.10314 | holography, neural networks

## URL + Key Terms + AKA (full format)
- US11281020 | switchable LC, directional backlight | aka: Switchable LC Patent
- arxiv:2405.10314 | holography, neural networks | aka: Neural Holography Paper
```

### Minimal Format

```
# Patent List
- US11281020
- US7903332B2
- US10838134B2
- WO2024145265A1

# Paper List
- arxiv:2405.10314
- 2501.11841
```

### Enhanced Format with Metadata

```
# Leia 3D Display Patents

High-priority patents for backlight and display technology.

## Core Backlight Technology
- US10838134B2 | multibeam elements, light guide, diffraction grating | aka: Multibeam Backlight Patent
- US10830939B2 | directional backlight, HDTV, angular resolution | aka: Angular Resolution Patent

## Eye Tracking Systems
- WO2024145265A1 | eye tracking, gaze detection, privacy | aka: Privacy Eye Tracking

# Holographic Display Papers

## Computational Methods
- arxiv:2405.10314 | holography, neural networks, phase retrieval
- arxiv:2501.11841 | diffraction, wave optics, CGH | aka: Wave Optics Survey

> Note: Add US7903332B2 once we get access
```

### Full Example with All Features

```
# David's Research Collection

A curated list of patents and papers for 3D display research.

## High-Priority Patents
- US10838134B2 | multibeam, light guide, sub-pixel grating | aka: Core Backlight Patent
- US11281020B2 | directional pixels, slanted gratings | aka: Slanted Grating Patent
- https://patents.google.com/patent/US7903332B2 | optical coupling, waveguide

## Related ArXiv Papers
- 2405.10314 | holographic displays, CGH, neural rendering | aka: Neural Holography Survey
- https://arxiv.org/abs/2501.11841 | diffraction theory, wave optics | aka: Wave Optics Paper

## General Articles
- https://example.com/article | display technology, innovation

<!-- TODO: Add more patents from the patent family -->
> Note: US7903332B2 is foundational - review carefully
```

## Supported Document Types

### Patents
- **Formats**: `US10838134B2`, `WO2024145265A1`, full Google Patents URLs
- **Extractor**: Gemini-based patent extraction
- **Output**: Markdown with patent-specific frontmatter

### ArXiv Papers
- **Formats**: `2405.10314`, `arxiv:2405.10314`, full ArXiv URLs
- **Extractor**: HTML-based ArXiv extraction
- **Output**: Markdown with academic paper frontmatter

### Future Support
- General web articles
- Technical documentation
- News articles

## Usage in Admin Panel

1. Navigate to **Admin > RAG Management**
2. Click **Upload Documents**
3. Select **URL Extraction** tab
4. Choose **Batch URLs** mode
5. Either:
   - Upload a `.md` or `.txt` file with URL list
   - Paste URL list content directly
6. Click **Extract Batch**

The system will:
- Parse the URL list
- Detect document types automatically
- Extract content and metadata
- Merge user-provided key terms and AKA names
- Generate formatted markdown files
- Provide download as ZIP

## Metadata Injection

User-provided metadata is **merged** with AI-extracted metadata:

### Key Terms
- AI extracts key terms from document content
- User-provided terms are **appended** to AI terms
- Final format in markdown: `**Key Terms**: ai_term1,ai_term2,user_term1,user_term2`

### Also Known As
- User-provided AKA name replaces any empty/default AKA
- Final format in markdown: `**Also Known As**: User Provided Name`

## Best Practices

1. **Use sections** to organize large lists by topic or priority
2. **Add key terms** for domain-specific terminology not in the document
3. **Use AKA names** for commonly-used shorthand or alternative titles
4. **Keep lists under 50 URLs** per batch for optimal performance
5. **Add comments** for notes about document relevance or TODO items
6. **Use consistent formatting** for easier parsing and maintenance

## Error Handling

- Invalid URLs are skipped with error messages
- Duplicate URLs trigger warnings but process once
- Failed extractions don't stop batch processing
- Download includes only successful extractions
- Detailed error log provided in UI

## File Naming Conventions

For saving extracted markdown locally:

- **Patents**: `{patent_number}.md` (e.g., `us10838134b2.md`)
- **ArXiv**: `{arxiv_id}.md` (e.g., `2405-10314.md`)
- **Generic**: `{domain-path}.md` (e.g., `example-com-article.md`)

All filenames are lowercase with hyphens replacing special characters.
