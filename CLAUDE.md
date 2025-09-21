# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

David-GPT is a personal, citation-first RAG (Retrieval-Augmented Generation) chatbot built with Next.js. It answers questions in David's voice using a curated corpus of papers, patents, and notes with transparent citations and hybrid retrieval combining embeddings and BM25 search.

## Development Commands

- **Development server**: `pnpm dev` (uses Turbopack for faster builds)
- **Production build**: `pnpm build` (also uses Turbopack)
- **Start production**: `pnpm start`  
- **Linting**: `pnpm lint`

Note: No test commands are currently configured in package.json.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL with pgvector for embeddings)
- **AI Integration**: Vercel AI SDK 5, OpenAI GPT-4
- **Search**: Hybrid retrieval (embeddings + BM25) with Cohere reranking
- **Authentication**: Supabase Auth with Google OAuth support

### Key Directory Structure
```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API endpoints for chat, documents, admin
│   ├── admin/             # Admin interface pages
│   ├── auth/              # Authentication pages
│   ├── layout.tsx         # Root layout with Geist fonts
│   └── page.tsx           # Landing page
├── components/            # React components
│   ├── admin/             # Admin-specific components
│   ├── chat/              # Chat interface components
│   └── ui/                # Reusable UI components
├── lib/                   # Core utilities and business logic
│   └── rag/               # RAG system & document processing
└── globals.css           # Global styles
```

### Current State
David-GPT is in active development with substantial functionality implemented:
- **Frontend**: Chat interface, admin components, authentication flows
- **Backend**: API routes, RAG system, document processing
- **Core Achievement**: Advanced RAG metadata injection system for improved query accuracy
- **Database**: Supabase integration with pgvector for embeddings

## Key Features (From PRD)

### Core Functionality
- **Chat Interface**: Streaming responses with inline citations `[1]`, `[2]`
- **Document Ingestion**: PDFs, DOI/arXiv links, patent numbers, Google Patents URLs
- **Hybrid Search**: Combines semantic (embeddings) with keyword (BM25) search
- **Knowledge Graph**: Entity extraction and relationship management
- **Multi-turn Context**: Smart context routing for related vs unrelated queries

### User Roles
- **Admin**: Full corpus and knowledge graph management
- **Member**: Read-only corpus access, conversation management  
- **Guest**: Limited corpus access, no saved conversations

### Document Processing
- **Chunking**: 800-1200 tokens with 15-20% overlap
- **Libraries**: pdf-parse, GROBID (via public API), Crossref API, USPTO/EPO APIs
- **Metadata**: Structured extraction of authors, dates, patent info, etc.

## Supabase Integration

The project uses Supabase with MCP (Model Context Protocol) server integration:
- Project reference: `mnjrwjtzfjfixdjrerke`
- Access token configured in `.env.local`
- Uses `@supabase/mcp-server-supabase` for database operations

## Development Notes

### Path Aliases
- `@/*` maps to `./src/*` for cleaner imports

### TypeScript Configuration
- Target: ES2017 with strict mode enabled
- Module resolution: bundler (for Next.js compatibility)
- JSX: preserve (handled by Next.js)

### AI SDK Integration
The PRD specifies using Vercel AI SDK 5 with:
- `streamText()` for chat responses
- Tool calling for retrieval (`search_corpus`, `lookup_facts`, `get_timeline`)
- OpenAI GPT-4 as the primary LLM

### Performance Targets
- Document ingestion: searchable within 5 minutes
- Chat response: < 3 seconds for typical queries
- Citation accuracy: > 95% for structured facts
- Support for 100+ concurrent users, 10,000+ documents

## Important Considerations

### Security
- All documents stored in private Supabase buckets with signed URLs
- Row Level Security (RLS) policies for user access control
- No sensitive information should be committed to the repository

### Data Processing
- Cohere Rerank 3.5 for result reranking
- pgvector with HNSW indexing for embeddings (3072 dimensions)

## Documentation Reference
- **`DOCS/PRD.md`** - Product requirements and architectural decisions
- **`DOCS/SYSTEM_ARCHITECTURE.md`** - Technical system architecture and implementation
- **`DOCS/CONTENT_GUIDE.md`** - Document and persona creation guide
- **`DOCS/DEVELOPER_ONBOARDING.md`** - Developer setup and workflow guide
- **`DOCS/PROJECT_STATUS.md`** - Current project status and implementation details

## MCP Server Integration

This project integrates with several MCP (Model Context Protocol) servers to enhance development workflows:

### Supabase MCP
- **Primary database operations**: Use Supabase MCP tools for applying migrations and inspecting the database
- **Available tools**: `apply_migration`, `execute_sql`, `list_tables`, `get_logs`, etc.
- **Configuration**: Configured in `.cursor/mcp.json` with project reference `mnjrwjtzfjfixdjrerke`

### Context7 MCP  
- **Documentation retrieval**: Use Context7 MCP to pull up-to-date documentation for APIs and libraries
- **Primary use cases**: 
  - Vercel AI SDK 5 documentation and examples
  - Next.js App Router patterns
  - Supabase client library usage
- **Workflow**: Always call `resolve-library-id` first, then `get-library-docs` for implementation guidance

### Playwright MCP
- **E2E testing**: Use Playwright MCP for browser automation and end-to-end testing
- **Available tools**: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.
- **Session Management**: Not using `--isolated` feature to preserve Google Auth credentials across sessions
- **Troubleshooting**: If Playwright MCP gets stuck (cannot spin independent sessions):
  ```bash
  # Kill dev servers on common ports
  lsof -ti:3000,3001,3002 | xargs -r kill -9
  
  # Close browser windows manually or restart browser
  # Then restart development server
  pnpm dev
  ```
### gemini-cli MCP
- use gemini-cli MCP with model 2.5 pro to read and analyze large files (but it won't write to file system) 