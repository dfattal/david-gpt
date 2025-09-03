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
│   ├── layout.tsx         # Root layout with Geist fonts
│   └── page.tsx           # Landing page (currently default Next.js)
├── components/            # React components (currently empty - being rebuilt)
├── lib/                   # Core utilities and business logic (currently empty)
└── globals.css           # Global styles
```

### Current State
The project appears to be in a significant refactoring phase:
- Most components and lib files have been deleted (visible in git status)
- Core infrastructure (Next.js, package.json, configs) remain
- PRD document indicates a sophisticated RAG system is planned

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
- Access token configured in `.cursor/mcp.json`
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
- GROBID integration for academic paper parsing
- Cohere Rerank 3.5 for result reranking
- pgvector with HNSW indexing for embeddings (3072 dimensions)

### PRD reference
Refer to the comprehensive PRD in `docs/PRD.md` for detailed requirements and architectural decisions.

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
- **Test account**: Use test admin account to handle login flows during testing (test@example.com,pwd=123456)
- **Available tools**: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.
- **Testing strategy**: Clear login pages by authenticating with the test admin account when needed

## Agent Orchestration System

This project uses a **Main Agent as Context Orchestrator** paradigm with two specialized sub-agents:

### Main Agent Responsibilities
- **Context Synchronization**: Maintain project state across all agents
- **Task Delegation**: Deploy sub-agents with complete context snapshots  
- **Integration Validation**: Ensure sub-agent outputs align with project goals
- **State Management**: Update context files after each agent interaction

### Context Files (Single Source of Truth)
- `docs/context/current-architecture.md` - Current project state and active components
- `docs/context/integration-status.md` - Component integration map and dependencies  
- `docs/context/rag-implementation.md` - RAG Development Specialist progress
- `docs/context/feature-status.md` - Full-Stack Integration Agent progress

### Sub-Agent Communication Protocol

**Before Delegating Tasks:**
1. Read current context files and codebase state
2. Identify integration points and dependencies
3. Provide complete context snapshot to sub-agent
4. Specify exact deliverables and validation criteria

**Task Delegation Format:**
```
Task: [Specific deliverable]
Context: [Current file states, dependencies, constraints from context docs]
Requirements: [From PRD + current request] 
Integration Points: [How this connects to existing components]
Expected Output: [Files to create/modify + success criteria]
```

**After Sub-Agent Completion:**
1. Validate changes align with project architecture
2. Update relevant context files with progress  
3. Test integration points and dependencies
4. Run validation commands (lint, build, test)
5. Document changes for future agent interactions

### Sub-Agent Guidelines
- **Always reference context files** before starting work
- **Follow existing patterns** from current codebase
- **Validate integration points** with other components
- **Return comprehensive change summaries** for main agent
- **Flag any architectural concerns** or dependencies discovered