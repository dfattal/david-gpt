# Developer Onboarding Guide

This document provides a comprehensive guide for developers joining the project. It includes information on getting started, the development workflow, and how to use the validation tools.

## 1. Getting Started

# David-GPT RAG + Persona System: Complete Onboarding Guide

Welcome to the David-GPT RAG + Persona System! This guide will walk you through everything you need to know to set up your own expert persona and prepare documents for ingestion.

## 🎯 What You'll Learn

By the end of this guide, you'll be able to:
- Create your own expert persona with authentic voice and domain expertise
- Format documents correctly for optimal RAG performance
- Use the admin interface to upload and manage your corpus
- Troubleshoot common issues and optimize your setup

## 📋 Prerequisites

- Admin access to the David-GPT system
- Basic understanding of markdown formatting
- Domain expertise in your chosen area
- Documents ready for ingestion (PDFs, markdown files, URLs)

---

## 🚀 Quick Setup Overview

Here's what we'll do in order:

1. **Create Your Persona** - Define your expert identity and knowledge domains
2. **Prepare Your Documents** - Format them for optimal search and citations
3. **Upload and Test** - Use the admin interface to add your content
4. **Optimize Performance** - Fine-tune based on initial results

---

## Step 1: Understanding the Persona System

### What is a Persona?

A persona in David-GPT is an expert identity that:
- **Defines expertise domains** - What areas you're an expert in
- **Shapes chat responses** - How the AI should communicate in your voice
- **Guides document processing** - What entities and concepts to focus on
- **Influences search results** - Which content gets prioritized

### Persona Components

Your persona consists of:

#### Core Identity
- Who you are professionally
- Your key achievements and background
- What makes you unique as an expert

#### Expertise Domains
- 2-4 main areas of specialization
- Keywords and concepts in each domain
- How domains connect to each other

#### Communication Style
- Tone of voice (formal/casual, confident/humble)
- Technical depth preferences
- How you balance different aspects of your expertise

#### Document Preferences
- What types of documents are most relevant
- Which metadata fields matter most
- How search results should be prioritized

---

## Step 2: Creating Your Persona File

### Using the Persona Template

Start with our standardized template (see the template in `DOCS/CONTENT_GUIDE.md` Section 5). Here's how to adapt it:

#### 2.1 Fill Out Core Identity

Replace the template placeholders with your information:

```markdown
## Core Identity

Dr. Sarah Chen is a leading AI researcher and practicing data scientist, recognized globally as a pioneer in machine learning interpretability and ethical AI systems. She serves as Chief AI Officer at TechCorp, where she bridges cutting-edge research with real-world applications. She is both a researcher who developed novel explainability frameworks and a practitioner who has deployed AI systems used by millions of users worldwide.

She thrives at the intersection of technical innovation and ethical responsibility—equally comfortable debugging neural networks, presenting to executives, or speaking at conferences about AI safety.
```

**Tips:**
- Be specific about achievements and recognition
- Mention concrete numbers where possible (patents, papers, users, etc.)
- Show the balance between different aspects of your expertise
- Use active voice and confident language

#### 2.2 Define Your Expertise Domains

Break your expertise into 2-4 clear domains:

```markdown
### 1. Machine Learning & AI Systems
Expert in deep learning architectures, model optimization, and scalable AI deployment with contributions to interpretability research.

* PhD in Computer Science from MIT, specializing in neural network interpretability
* Author of 50+ peer-reviewed papers on explainable AI and model transparency
* Developer of the LIME framework for local interpretability
* Experience with PyTorch, TensorFlow, distributed training, and MLOps pipelines
* Technical expertise: transformer architectures, attention mechanisms, gradient-based explanations, adversarial robustness

### 2. Ethical AI & Responsible Innovation
Thought leader in AI ethics, bias detection, and responsible AI deployment with real-world impact.

* Founding member of the Partnership on AI ethics committee
* Led development of AI fairness auditing tools used by Fortune 500 companies
* Expert in bias detection, algorithmic accountability, and AI governance frameworks
* Published "Ethical AI in Practice" (MIT Press, 2023) - industry standard reference
* Strategic expertise: AI policy development, stakeholder engagement, regulatory compliance
```

**Tips:**
- Each domain should have a clear description
- Include specific technical terms and keywords
- Mention tools, frameworks, and methodologies
- Add concrete achievements and quantifiable impact
- End each domain with key expertise keywords

#### 2.3 Communication Style

Define how you communicate:

```markdown
## Personality & Tone

* **Tone of Voice:** Analytical and precise, yet accessible. Prefers clear explanations with concrete examples. Balanced between technical rigor and practical applicability.
* **Style:** Combines academic depth with industry pragmatism. Authoritative but collaborative, always considering ethical implications.
* **Presence:** Inspires confidence through expertise while remaining approachable. Known for making complex AI concepts understandable.
```

#### 2.4 Document Types and Preferences

Specify what content matters most:

```markdown
## Document Types and Metadata Preferences

### Primary Document Types
- paper: Research publications on AI, ML, and ethics
- technical-spec: AI system documentation and API references
- book: Technical books and industry reports
- press-article: AI industry news and ethical AI coverage
- note: Research notes, meeting summaries, and insights

### Key Metadata Fields
- authors: Critical for academic collaboration networks
- venue: Important for understanding research impact
- ethicsApproval: Essential for responsible AI considerations
- aiMethod: Specific to AI/ML technique categorization
- datasetUsed: Important for reproducibility and bias analysis

### Search Priorities
- ethicsApproval: High relevance for responsible AI analysis
- aiMethod: Important for technical method comparison
- impactFactor: Valuable for research quality assessment
```

### 2.5 Save Your Persona File

Save your completed persona as `DOCS/YourName-Persona.md` following the template structure exactly (see template in `DOCS/CONTENT_GUIDE.md`).

---

## Step 3: Understanding Document Formatting

### Why Proper Formatting Matters

The RAG system needs properly formatted documents to:
- **Extract accurate metadata** for search and citations
- **Generate quality embeddings** for semantic search
- **Create proper citations** with page numbers and sources
- **Enable entity extraction** for knowledge graph building

### Required Document Structure

Every document must have:

#### 3.1 YAML Frontmatter

Complete metadata in YAML format at the top of each file:

```yaml
---
title: "Document Title Here"
docType: "paper"  # See document types below
persona: "sarah"  # Your persona identifier
url: "https://source-url.com"
scraped_at: "2025-01-20T15:30:00.000Z"
word_count: 5200
extraction_quality: "high"

# Document-specific metadata
authorsAffiliations:
  - name: "Sarah Chen"
    affiliation: "MIT"
  - name: "John Smith"
    affiliation: "Stanford"
venue: "Nature Machine Intelligence"
doi: "10.1038/s42256-023-12345-6"
abstract: "Brief summary of the paper content..."
---
```

#### 3.2 Markdown Content

Clean, well-structured markdown with:

```markdown
# Document Title

Brief introduction paragraph.

## Abstract

Detailed abstract or summary...

## Main Content

### Subsection 1

Content with proper formatting...

### Subsection 2

More structured content...

## Conclusion

Summary and key takeaways...

## References

[1] Citation format
[2] Another citation
```

### Document Types by Domain

Choose the right document type for your content:

#### Technical/AI Domain
- `paper` - Academic research papers
- `technical-spec` - API docs, system specifications
- `api-doc` - API documentation
- `book` - Technical books and chapters
- `note` - Research notes and insights

#### Legal Domain
- `legal-doc` - Court documents, contracts
- `case-law` - Legal precedents
- `statute` - Laws and regulations
- `legal-brief` - Legal briefs and motions

#### Medical Domain
- `medical-paper` - Medical research
- `clinical-trial` - Clinical trial reports
- `medical-guideline` - Treatment protocols
- `case-report` - Medical case studies

#### Universal Types
- `press-article` - News articles and press releases
- `url` - Web articles and blog posts
- `book` - Books and chapters
- `note` - Personal notes and documentation

---

## Step 4: Preparing Your Document Corpus

### 4.1 Inventory Your Content

Create a list of all documents you want to include:

```
Documents to Include:
□ Research papers (20 papers)
□ Technical specifications (5 specs)
□ Industry reports (10 reports)
□ News articles (30 articles)
□ Personal notes (15 notes)
```

### 4.2 Organize by Document Type

Group your documents by type for batch processing:

```
/my-corpus/
├── papers/
│   ├── chen-2023-explainable-ai.md
│   ├── smith-2024-bias-detection.md
│   └── ...
├── specs/
│   ├── ai-ethics-framework.md
│   ├── model-auditing-protocol.md
│   └── ...
├── articles/
│   ├── techcrunch-ai-ethics-2024.md
│   ├── wired-algorithmic-bias.md
│   └── ...
└── notes/
    ├── ethics-committee-meeting-2024-01.md
    ├── responsible-ai-checklist.md
    └── ...
```

### 4.3 Convert Documents to Markdown

For each document type:

#### PDFs → Markdown
1. Extract text using OCR or PDF tools
2. Clean up formatting issues
3. Add proper YAML frontmatter
4. Structure with clear headings

#### Web Articles → Markdown
1. Copy article text
2. Remove ads and navigation
3. Format with proper headings
4. Add complete metadata

#### Research Papers → Markdown
1. Extract full text
2. Preserve section structure
3. Include abstract and references
4. Add author affiliations and venue

### 4.4 Add Complete Metadata

For each document, ensure you have:

#### Required Fields (All Documents)
```yaml
title: "Exact document title"
docType: "appropriate-type"
persona: "your-persona-id"
url: "source-url-if-available"
scraped_at: "2025-01-20T15:30:00.000Z"
word_count: 1500  # approximate word count
extraction_quality: "high|medium|low"
```

#### Domain-Specific Fields

**Research Papers:**
```yaml
authorsAffiliations:
  - name: "Author Name"
    affiliation: "Institution"
venue: "Journal or Conference"
publicationYear: 2024
doi: "10.1000/journal.2024.123456"
abstract: "Full abstract text..."
keywords: ["AI", "ethics", "bias"]
```

**Technical Specifications:**
```yaml
apiVersion: "v2.1"
framework: "TensorFlow"
language: "Python"
repository: "https://github.com/org/repo"
documentation: "https://docs.example.com"
```

**Press Articles:**
```yaml
author: "Journalist Name"
outlet: "Publication Name"
published_date: "2024-01-15T00:00:00.000Z"
domain: "techcrunch.com"
category: "Technology"
```

---

## Step 5: Using the Admin Interface

### 5.1 Accessing Admin Panel

1. Navigate to `/admin` in your browser
2. Log in with admin credentials
3. You'll see the document management dashboard

### 5.2 Upload Your Persona

1. Go to the **Personas** tab
2. Click **Upload Persona**
3. Select your `YourName-Persona.md` file
4. Review the validation results
5. Click **Load Persona** if validation passes

### 5.3 Upload Documents

#### Single Document Upload
1. Go to **Upload Documents** tab
2. Drag and drop your markdown file
3. Review detected metadata
4. Select your persona from dropdown
5. Click **Upload**

#### Batch Upload
1. Go to **Batch Upload** tab
2. Select your organized corpus folder
3. Review validation results for all files
4. Fix any validation errors
5. Click **Process Batch**

### 5.4 Monitor Processing

1. Go to **Processing Status** tab
2. Watch document processing progress
3. Check for any failed documents
4. Review processing logs for issues

---

## Step 6: Testing Your Setup

### 6.1 Test Chat Responses

1. Go to the main chat interface
2. Select your persona from the dropdown
3. Ask questions in your domain area
4. Verify the AI responds in your voice and style

Example test questions:
```
"What are the latest developments in explainable AI?"
"How do you approach bias detection in machine learning models?"
"What ethical considerations are important when deploying AI systems?"
```

### 6.2 Verify Search Performance

Test that your documents are being found:
```
"Show me papers by Sarah Chen on AI interpretability"
"What frameworks exist for AI ethics auditing?"
"Find technical specifications for bias detection tools"
```

### 6.3 Check Citations

Verify that citations are accurate:
- Do cited documents actually contain the claimed information?
- Are page numbers and sections correct?
- Are author names and venues properly formatted?

---

## Step 7: Optimization and Maintenance

### 7.1 Improve Document Quality

Based on initial testing:

**Low Search Performance?**
- Add more keywords to metadata
- Improve document titles
- Add more detailed abstracts

**Poor Citations?**
- Ensure proper section headings
- Add page number references
- Include more structured metadata

**Weak Entity Extraction?**
- Add more domain-specific terms
- Include company/organization names
- Add technical terminology

### 7.2 Refine Your Persona

**Chat Voice Issues?**
- Adjust communication style guidelines
- Refine expertise domain descriptions
- Update response guidelines

**Wrong Document Focus?**
- Adjust document type priorities
- Update search boost weights
- Refine metadata field importance

### 7.3 Expand Your Corpus

**Add New Document Types:**
```typescript
// Register custom document type
registerDocumentType('research-proposal', {
  persona: 'sarah',
  requiredFields: ['fundingAgency', 'proposalType', 'budget'],
  optionalFields: ['collaborators', 'timeline'],
  metadataTemplate: 'research-proposal-template'
});
```

**Create New Metadata Templates:**
```typescript
// Define metadata injection for new type
registerMetadataTemplate('research-proposal-template', (metadata) => {
  return `${metadata.proposalType} proposal for ${metadata.fundingAgency} - Budget: ${metadata.budget}`;
});
```

---

## 🎯 Success Checklist

Before considering your setup complete:

### Persona Setup ✅
- [ ] Persona file follows template structure exactly
- [ ] All expertise domains have clear descriptions and keywords
- [ ] Communication style is well-defined
- [ ] Document preferences are specified
- [ ] Persona loads without validation errors

### Document Corpus ✅
- [ ] All documents have complete YAML frontmatter
- [ ] Document types are correctly assigned
- [ ] Metadata fields are complete and accurate
- [ ] Content is well-structured with clear headings
- [ ] Search keywords are included in metadata

### System Integration ✅
- [ ] Persona uploads successfully to admin interface
- [ ] Documents upload and process without errors
- [ ] Chat responses reflect your expertise and voice
- [ ] Search finds relevant documents accurately
- [ ] Citations are accurate and properly formatted

### Performance Optimization ✅
- [ ] Search results are relevant and well-ranked
- [ ] Entity extraction focuses on your domain
- [ ] Response quality meets your standards
- [ ] Processing time is acceptable
- [ ] No recurring errors in logs

---

## 🆘 Common Issues and Solutions

### Persona Not Loading
**Problem:** Persona validation fails
**Solution:** Check template structure, ensure all required sections exist

### Documents Not Found in Search
**Problem:** Uploaded documents don't appear in search results
**Solution:** Check metadata completeness, verify document type assignment

### Poor Chat Voice
**Problem:** AI doesn't sound like your expertise/style
**Solution:** Refine communication guidelines, add more voice characteristics

### Slow Processing
**Problem:** Document processing takes too long
**Solution:** Check document sizes, simplify complex formatting

### Inaccurate Citations
**Problem:** Citations reference wrong information
**Solution:** Improve document structure, add more precise metadata

---

## 📞 Getting Help

### Documentation Resources
- **[Persona Creation Guide](PERSONA-CREATION-GUIDE.md)** - Detailed persona development
- **[Document Formatting Guide](DOCUMENT-FORMATTING-GUIDE.md)** - Complete formatting reference
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common problems and solutions

### Support Channels
- **System Logs:** Check `/admin/monitoring` for processing errors
- **Validation Tools:** Use built-in format checkers before upload
- **Community:** Share experiences with other persona creators

### Advanced Topics
- **Custom Document Types:** Adding new types for specialized content
- **Entity Extraction:** Optimizing knowledge graph building
- **Search Optimization:** Fine-tuning search weights and boosts
- **Performance Tuning:** Optimizing processing speed and accuracy

---

## 🎉 Congratulations!

You've successfully set up your expert persona and document corpus in the David-GPT RAG system. Your AI assistant now has:

- **Your expertise and voice** for authentic responses
- **Your document knowledge** for accurate, cited answers
- **Your domain focus** for relevant entity extraction
- **Your preferences** for optimal search results

Welcome to the community of expert AI assistants! 🚀

## 2. Development Environment

# David-GPT Development Guide

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm package manager
- Supabase account and project

### Setup
1. Clone repository and install dependencies:
   ```bash
   git clone <repository>
   cd david-gpt
   pnpm install
   ```

2. Configure environment variables (see `.env.example`)

3. Start development server:
   ```bash
   pnpm dev
   ```

## Development Commands

- `pnpm dev` - Development server with Turbopack
- `pnpm build` - Production build
- `pnpm start` - Start production server
- `pnpm lint` - ESLint checking

## Architecture Overview

### Core Technologies
- **Frontend**: Next.js 15 + App Router + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: Vercel AI SDK 5 + OpenAI GPT-4
- **Search**: Hybrid (embeddings + BM25) + Cohere reranking

### Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (chat, documents, admin)
│   ├── admin/             # Admin pages
│   ├── auth/              # Authentication pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── admin/             # Admin-specific components
│   ├── chat/              # Chat interface components
│   └── ui/                # Reusable UI components
└── lib/                   # Core business logic
    └── rag/               # RAG system implementation
```

## Key Systems

### RAG & Document Processing

#### Metadata Enhancement System ⭐
**Latest Major Feature** - Dramatically improves query accuracy for author/inventor searches:

- **`metadata-templates.ts`** - Standardized metadata injection templates
- **`patent-chunking.ts`** - Patent processing with inventor/assignee injection
- **`article-chunking.ts`** - Academic paper processing with author/venue injection
- **`metadata-migration.ts`** - Batch migration for existing documents

**How it works:**
```typescript
// Before: Abstract chunk only contained abstract text
"A multi-view display is switchable between single view and multi-view modes..."

// After: Abstract chunk includes searchable metadata
"A multi-view display is switchable between single view and multi-view modes...

Patent US11281020B2 - Inventors: Fetze Pijlman, Jan Van Der Horst - Assignee: Leia Inc"
```

#### Document Chunking Strategy
- **Patents**: Title, abstract (with metadata), independent claims, dependent claims grouped, description sections
- **Papers**: Title, abstract (with metadata), introduction, methodology, results, discussion, conclusion
- **Token Limits**: 800-1200 tokens per chunk with 15-20% overlap

### Database Schema

#### Core Tables
- **documents** - Document metadata and status
- **document_chunks** - Chunked content with embeddings
- **conversations** - Chat conversation records
- **messages** - Individual chat messages
- **message_citations** - Citation tracking

### API Design

#### Key Endpoints
- `POST /api/chat` - Streaming chat with RAG
- `POST /api/documents/ingest` - Document ingestion
- `GET /api/documents` - Document listing and management
- `POST /api/auth/login` - Authentication

#### Response Patterns
- **Streaming**: Chat responses use Server-Sent Events
- **Error Handling**: Consistent error response format
- **Citations**: Inline `[1]`, `[2]` format with detailed source info

## Development Workflow

### Adding New Document Types
1. Create chunking strategy in `src/lib/rag/`
2. Add metadata template in `metadata-templates.ts`
3. Update ingestion API in `src/app/api/documents/ingest/`
4. Test with migration script

### Extending RAG Capabilities
1. Modify search logic in `src/lib/rag/search-tools.ts`
2. Update citation persistence in conversation APIs
3. Test query accuracy and performance

### UI Component Development
- Follow existing patterns in `src/components/ui/`
- Use Tailwind CSS for styling
- Ensure accessibility and responsive design
- Integrate with existing chat and admin interfaces

## Testing & Quality

### Current Testing
- ESLint for code quality
- TypeScript for type safety
- Manual testing of RAG accuracy

### Recommended Testing Additions
- Unit tests for RAG components
- Integration tests for document processing
- E2E tests for chat functionality

## Performance Considerations

### RAG Optimization
- **Hybrid Search**: Combines semantic and keyword search for comprehensive coverage
- **Cohere Reranking**: Improves result relevance
- **Metadata Injection**: Reduces hallucination by making metadata searchable

### Database Optimization
- pgvector for efficient embedding storage
- Proper indexing on frequently queried fields
- Connection pooling for concurrent requests

## Common Development Tasks

### Adding a New Citation Format
1. Update `metadata-templates.ts` with new template
2. Modify chunking logic to inject metadata
3. Test with existing and new documents

### Debugging RAG Issues
1. Check document chunk content in database
2. Verify embedding generation and storage
3. Test search queries directly against database
4. Review citation extraction and persistence

### Admin Interface Development
1. Create components in `src/components/admin/`
2. Add API routes in `src/app/api/admin/`
3. Implement proper authentication checks
4. Follow existing admin UI patterns

## Deployment

### Environment Setup
- Configure Supabase project and database
- Set up OpenAI API keys
- Configure authentication providers
- Set production environment variables

### Build Process
- `pnpm build` creates production build
- Static assets optimized automatically
- Database migrations handled via Supabase

## Troubleshooting

### Common Issues
- **Missing embeddings**: Check OpenAI API configuration
- **Search not working**: Verify pgvector extension enabled
- **Auth issues**: Check Supabase project settings
- **Build failures**: Verify all dependencies installed

### Performance Issues
- Monitor database query performance
- Check embedding generation latency
- Review search result quality and speed
- Analyze chat response times

## Next Development Priorities
1. Complete document ingestion pipeline
2. Enhance admin dashboard functionality
3. Implement comprehensive testing
4. Add performance monitoring
5. Begin knowledge graph implementation

## 3. Validation Tools

# CLI Validation Guide

This guide explains how to use the command-line validation tools to check documents and personas before uploading them to David-GPT.

## Quick Start

```bash
# Check all documents and personas in current directory
pnpm validate:all

# Validate specific document
pnpm validate:docs paper.md

# Validate specific persona
pnpm validate:personas financial-expert.md

# Batch validate a directory
pnpm validate:batch RAG-SAMPLES/

# Preview what would be validated
pnpm validate:batch --preview .
```

## Available Commands

### 1. Document Validation

Validates markdown documents for RAG ingestion compatibility.

```bash
# Single document
tsx src/scripts/validate-document.ts paper.md

# Multiple documents with pattern
tsx src/scripts/validate-document.ts "RAG-SAMPLES/*.md"

# With verbose output
tsx src/scripts/validate-document.ts --verbose "docs/**/*.md"

# JSON output for integration
tsx src/scripts/validate-document.ts --json paper.md > results.json

# Fail on warnings (for CI/CD)
tsx src/scripts/validate-document.ts --fail-on-warnings "content/*.md"
```

**What it checks:**
- YAML frontmatter format and completeness
- Required fields for document type
- Content structure and quality
- Metadata consistency
- Document type support

### 2. Persona Validation

Validates persona markdown files for system compatibility.

```bash
# Single persona
tsx src/scripts/validate-persona.ts financial-expert.md

# Test parser compatibility
tsx src/scripts/validate-persona.ts --test-parser expert.md

# Multiple personas
tsx src/scripts/validate-persona.ts "personas/*.md"

# Detailed analysis
tsx src/scripts/validate-persona.ts --verbose --test-parser expert.md
```

**What it checks:**
- Template structure compliance
- Required sections presence
- Expertise domain completeness
- Communication style definition
- Parser compatibility
- System prompt generation

### 3. Batch Validation

Validates entire directories or file patterns at once.

```bash
# Validate directory
tsx src/scripts/batch-validate.ts RAG-SAMPLES/

# Only documents
tsx src/scripts/batch-validate.ts --docs-only content/

# Only personas
tsx src/scripts/batch-validate.ts --personas-only --test-parser personas/

# Preview mode (show what would be validated)
tsx src/scripts/batch-validate.ts --preview "**/*.md"

# Pattern matching
tsx src/scripts/batch-validate.ts "content/**/*.md"
```

**Features:**
- Automatic file type detection
- Parallel processing
- Comprehensive reporting
- Preview mode
- Filter by type

### 4. Unified Wrapper

Use the main validation wrapper for convenience:

```bash
# Show help
tsx src/scripts/validate.ts help

# Validate document
tsx src/scripts/validate.ts document paper.md

# Validate persona with parser test
tsx src/scripts/validate.ts persona --test-parser expert.md

# Batch validate with preview
tsx src/scripts/validate.ts batch --preview RAG-SAMPLES/
```

## NPM Scripts (Recommended)

For convenience, use the predefined npm scripts:

```bash
# Main validation command
pnpm validate help

# Document validation
pnpm validate:docs "RAG-SAMPLES/*.md"
pnpm validate:docs --verbose paper.md

# Persona validation
pnpm validate:personas --test-parser expert.md
pnpm validate:personas "personas/*.md"

# Batch validation
pnpm validate:batch --docs-only RAG-SAMPLES/
pnpm validate:batch --preview .

# Validate everything (verbose)
pnpm validate:all
```

## 4. Troubleshooting

### Common Issues

**"No markdown files found"**
- Check file paths and patterns
- Ensure files have `.md` extension
- Verify directory exists

**"YAML frontmatter validation failed"**
- Check YAML syntax (indentation, quotes)
- Verify all required fields present
- Ensure field types match schema

**"Persona parsing failed"**
- Check template structure compliance
- Verify all required sections exist
- Ensure proper markdown heading hierarchy

**"Unsupported document type"**
- Use supported docTypes: `paper`, `patent`, `technical-spec`, `press-article`, `book`, `url`, `note`
- Check spelling and case sensitivity

### Getting Help

**Verbose output for debugging:**
```bash
pnpm validate:batch --verbose problematic-file.md
```

**Check specific validation details:**
```bash
tsx src/scripts/validate-document.ts --verbose --json problem.md | jq '.suggestions'
```

**Preview mode to understand file detection:**
```bash
pnpm validate:batch --preview .
```

This validation system ensures high-quality content ingestion and prevents common formatting errors that could affect RAG performance.