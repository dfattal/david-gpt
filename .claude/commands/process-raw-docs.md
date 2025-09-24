# Process RAG Raw Documents

Orchestrates the conversion of raw documents from RAG-RAW-DOCS/ into properly formatted markdown files in my-corpus/ following the INGESTION-FORMAT.md specification.

## Usage

```
/process-raw-docs [options]
```

**IMPORTANT**: This command now uses the enhanced TypeScript processing pipeline at `/scripts/process-documents.ts` which includes:
- arXiv API integration for academic papers
- Direct EXA API calls with 50K character limits
- Improved error handling and rate limiting
- Consistent YAML frontmatter formatting per INGESTION-FORMAT.md

### Options

- `--force` - Reprocess all documents, even if they exist in my-corpus/
- `--type <doc-type>` - Process only specific document type (paper, patent, press-article, url, note)
- `--source <file>` - Process only specific source file from RAG-RAW-DOCS/
- `--dry-run` - Show what would be processed without actually doing it
- `--batch-size <n>` - Process documents in batches of n (default: 5)
- `--skip-parser` - Skip the `rag-doc-parser` sub-agent and directly move to processing the comprehensive manifest.

### Examples

```bash
/process-raw-docs                           # Process all new documents
/process-raw-docs --force                   # Reprocess everything
/process-raw-docs --type paper              # Process only academic papers
/process-raw-docs --source article-list.md # Process only articles
/process-raw-docs --dry-run                 # Preview what would be processed
/process-raw-docs --skip-parser             # Skip parser and use existing comprehensive manifest (with validation)
```

## Manifest Validation (--skip-parser)

When using the `--skip-parser` option, the following comprehensive validation is performed before proceeding to Phase 2:

### File Existence Check
1. **Primary Requirement**: Check for `rag-processing-manifest-comprehensive.json`
2. **Error Handling**: If comprehensive manifest doesn't exist, display:
   ```
   ❌ Comprehensive manifest not found.
   Run without --skip-parser to generate rag-processing-manifest-comprehensive.json
   ```

### JSON Structure Validation
Validate manifest has required structure using `jq` commands:

```bash
# Required top-level keys validation:
jq -e 'has("processing_session_metadata") and
       has("document_count_summaries") and
       has("documents_to_process") and
       has("incremental_processing_status") and
       has("estimated_processing_time_seconds")' manifest.json

# Data type validation:
jq -e '.document_count_summaries.total_documents | type == "number"' manifest.json
jq -e '.documents_to_process | type == "array"' manifest.json
```

### Content Quality Validation
1. **Document Count Check**: `document_count_summaries.total_documents > 0`
2. **Documents Array**: `documents_to_process` array has entries matching total count
3. **Required Document Fields**: Each document must have:
   - `source_uri` (string)
   - `document_type` (valid enum value)
   - `extraction_tool` (valid enum value)
   - `extraction_strategy` (valid enum value)
   - `status` (string)
   - `metadata_enhancements` (array)

4. **Valid Enumerations**:
   - **Document Types**: `press_article`, `technical_paper`, `patent`, `blog_post`, `direct_markdown`, `pdf`
   - **Extraction Tools**: `exa_mcp`, `gemini_direct`
   - **Extraction Strategies**: `complete`, `structured`, `strategic`

### Freshness Validation
1. **Timestamp Check**: `processing_session_metadata.timestamp` within last 7 days
2. **Source Comparison**: Compare manifest timestamp with RAG-RAW-DOCS modification time
3. **Staleness Warning**: If manifest appears stale:
   ```
   ⚠️  Manifest is 5 days old and RAG-RAW-DOCS was modified 2 days ago.
   Consider regenerating manifest for latest content.
   Proceed anyway? (y/n)
   ```

### Validation Results Report
Display comprehensive validation summary:

```
✅ Manifest Validation Results:
   📄 File: rag-processing-manifest-comprehensive.json (11.2KB)
   📊 Documents: 34 total (13 articles, 5 papers, 4 patents, 4 blogs, 8 other)
   🔧 Processing Strategy: 17 EXA MCP, 17 Gemini Direct
   ⏱️  Estimated Time: 21 minutes
   📅 Generated: 2025-09-21 (2 days ago)
   🎯 Status: Ready for processing

✅ All validation checks passed. Proceeding to Phase 2...
```

### Validation Failure Handling
For each validation failure, provide specific error and recovery suggestion:

```bash
❌ JSON Structure Error: Missing 'documents_to_process' array
   → Run: /process-raw-docs (without --skip-parser) to regenerate

❌ Content Quality Error: 5 documents missing 'extraction_tool' field
   → Manual fix required or regenerate manifest

❌ Freshness Error: Manifest is 10 days old
   → Run: /process-raw-docs --force to regenerate with latest content
```

## Processing Pipeline

### Phase 1: Document Analysis & Manifest Creation

1. **Initialize Processing Session**
   - Create TodoWrite tracking for progress
   - Parse command-line options and validate parameters
   - Set up processing scope and constraints

2. **Launch rag-doc-parser Agent**
   - Scan `/Users/david.fattal/Documents/GitHub/david-gpt/RAG-RAW-DOCS/` for all files and URL lists
   - Analyze persona requirements from `/Users/david.fattal/Documents/GitHub/david-gpt/DOCS/Persona.md`
   - Classify documents by type (paper, patent, press-article, url, note)
   - Create processing manifest with metadata enhancement patterns
   - Handle incremental processing (skip existing unless --force)
   - Report document counts, types, and processing priorities

3. **Review & Approve Manifest**
   - Present structured manifest to user for review
   - Show document counts by type and processing scope
   - Confirm target locations and file naming conventions
   - Handle any user refinements or adjustments

### Phase 2: Content Extraction & Formatting

4. **Execute Enhanced Processing Pipeline**
   - Run `/Users/david.fattal/Documents/GitHub/david-gpt/scripts/process-documents.ts` with comprehensive manifest
   - **ENHANCED FEATURES**:
     - arXiv API integration for academic papers (metadata + full PDF extraction)
     - Direct EXA API calls with 50K character limits (not MCP)
     - Smart fallback chains: arXiv API → EXA → Gemini → WebFetch
     - Rate limiting with 3-second delays between requests
     - Automatic markdown code fence cleanup
   - Apply correct YAML frontmatter per INGESTION-FORMAT.md specification
   - Auto-populate metadata using enhancement patterns from manifest
   - Write formatted files to `/Users/david.fattal/Documents/GitHub/david-gpt/my-corpus/` subdirectories
   - Automatically create missing corpus folders (articles/, papers/, patents/, notes/, books/, urls/)
   - Track progress with TodoWrite for each document processed

5. **Validation & Reporting**
   - Validate output files against INGESTION-FORMAT.md requirements
   - Check YAML frontmatter completeness and markdown structure
   - Report processing statistics (success/failure rates, extraction quality)
   - List any errors, warnings, or accessibility issues
   - Update TodoWrite with completion status and metrics

## Key Features

### Smart Document Detection
- Parse existing document lists (article-list.md, paper-list.md, patent-url-list.md)
- Detect and process PDF files with appropriate extraction methods
- Handle mixed content types in single processing run
- Validate URL accessibility before processing

### Metadata Enhancement
- **OEM Detection**: Samsung, Acer, Lenovo, ZTE, RED, Apple → auto-populate `oem` field
- **Product Models**: "Odyssey 3D", "Nubia Pad", "Vision Pro" → auto-populate `model` field
- **Technology Keywords**: "lightfield", "lenticular", "eye tracking" → auto-populate `leiaFeature` array
- **Venue Patterns**: arxiv.org → extract arXiv ID, patents.google.com → extract patent numbers
- **Author/Inventor Patterns**: David Fattal and collaborators → proper attribution

### Incremental Processing
- Check existing files in my-corpus/ against source URLs/titles
- Skip processing if file exists and source hasn't changed
- Support force flag (`--force`) to reprocess all documents
- Track last modification dates for smart updates

### Quality Assurance
- Validate output against INGESTION-FORMAT.md requirements
- Ensure YAML frontmatter completeness for each document type
- Verify markdown structure and content quality standards
- Integration with existing validation tools (`pnpm validate:docs`)

## Error Handling & Recovery

- **Graceful URL Failures**: Handle inaccessible URLs with detailed error reporting
- **Retry Mechanisms**: Implement retry logic for transient network errors
- **Processing Recovery**: Ability to resume interrupted batch processing
- **Quality Validation**: Flag incomplete extractions for manual review
- **Detailed Logging**: Comprehensive error tracking for pipeline improvement

## Integration Points

- **TodoWrite Tool**: Progress tracking throughout the pipeline
- **Enhanced Processing Script**: `/scripts/process-documents.ts` with multiple extraction methods
- **arXiv API**: Direct integration for academic paper metadata and content
- **EXA API**: Direct API calls (not MCP) with 50K character limits
- **Gemini CLI**: Full PDF processing and content formatting
- **File System Operations**: Direct reading/writing for document processing
- **Validation Tools**: Post-processing quality checks and compliance verification

## Agent Coordination

### rag-doc-parser Agent
- Provides comprehensive document analysis and classification
- Generates metadata enhancement patterns for automatic population
- Handles incremental processing logic and duplicate detection
- Reports processing priorities and complexity assessments

### Enhanced TypeScript Processing Pipeline
- **PRIMARY**: Uses enhanced scripts/process-documents.ts with multiple extraction strategies
- **arXiv Papers**: arXiv API for metadata + Gemini CLI for full PDF content extraction
- **Web Articles**: Direct EXA API with 50,000 character limits (not MCP)
- **Patents**: EXA API primary, Gemini CLI fallback for complex extractions
- **Local Files**: Gemini CLI direct processing with proper error handling
- Extracts complete document content (never summaries)
- Applies structured YAML frontmatter based on document types with format validation
- Implements automatic metadata enhancement using detected patterns
- Manages file output to appropriate my-corpus/ subdirectories with smart directory mapping

## Expected Output Structure

```
my-corpus/
├── articles/           # Press articles and news (docType: press-article)
├── papers/            # Academic papers and research (docType: paper)
├── patents/           # Patent documents (docType: patent)
├── notes/             # Personal notes and documentation (docType: note)
└── [future-folders]/  # Additional folders as persona evolves
```

## Success Metrics

- **Coverage**: Process all documents in RAG-RAW-DOCS/ (no skipping)
- **Accuracy**: >95% correct document type classification
- **Quality**: >90% high-quality content extraction using enhanced multi-strategy pipeline
- **Metadata**: >95% accurate auto-population of enhancement patterns
- **Compliance**: 100% valid YAML frontmatter and markdown structure
- **Efficiency**: Intelligent incremental processing with change detection

## Execution Command

When using `--skip-parser`, the command will execute:

```bash
npx tsx /Users/david.fattal/Documents/GitHub/david-gpt/scripts/process-documents.ts /Users/david.fattal/Documents/GitHub/david-gpt/rag-processing-manifest-comprehensive.json
```

This leverages the enhanced processing pipeline with all the latest improvements for optimal document extraction and formatting.

Start the RAG document processing pipeline following this comprehensive workflow.