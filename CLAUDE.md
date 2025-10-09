# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

David-GPT is a **multi-persona**, citation-first RAG (Retrieval-Augmented Generation) platform built with Next.js. It allows different personas to answer questions using their own curated knowledge bases, with transparent citations and a sophisticated hybrid retrieval strategy.

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
personas/
└── <slug>/                 # Persona-specific assets
    ├── persona.md          # Natural-language profile
    ├── persona.config.json # Generated config for topics & routing
    └── RAG/                # Markdown docs for ingestion
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

## Key Features (From `DOCS/RAG-PRD.md`)

### Core Functionality
- **Multi-Persona Architecture**: Each persona has a dedicated knowledge base and configuration (`/personas/<slug>`).
- **Chat Interface**: Streaming responses with inline, source-linked citations in the format `[^doc_id:section]`.
- **Document Ingestion**: A pipeline to convert raw content (PDFs, URLs, text) into structured Markdown files with YAML frontmatter for the RAG knowledge base.
- **Hybrid Search**: Combines semantic (embeddings) with keyword (BM25) search, followed by a re-ranking step.
- **Always-On RAG**: RAG is invoked for every query (no smart routing implemented - all queries hit the knowledge base).

### User Roles
- **Admin**: Full corpus
- **Member**: Read-only corpus access, conversation management  

### Document Processing
- **Chunking**: 800-1200 tokens with 15-20% overlap
- **Libraries**: pdf-parse

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

## Important Considerations

### Security
- All documents stored in private Supabase buckets with signed URLs
- Row Level Security (RLS) policies for user access control
- No sensitive information should be committed to the repository

### Data Processing
- Cohere Rerank 3.5 for result reranking
- pgvector with HNSW indexing for embeddings (3072 dimensions)

## Documentation Reference
- **`DOCS/RAG-PRD.md`** - Product requirements and architectural decisions

## API and Library Documentation

When you need up-to-date documentation for APIs, libraries, or frameworks, use the Gemini CLI.

- **Primary Method**: Use the Gemini CLI to get up-to-date documentation.
- **Workflow**:
  1. Construct a prompt for the Gemini CLI that clearly states the library and the topic you need information on.
  2. **Crucially, instruct Gemini within the prompt to use its `context7 mcp` tool to find the answer.** This ensures you get structured, accurate documentation.
  3. Execute the command in non-interactive mode: `gemini -y '[Your prompt here]'`
- **Example Prompt**: `gemini -y 'Use context7 mcp to get documentation on text streaming in the Vercel AI SDK.'`
- **Primary use cases**:
  - Vercel AI SDK 5 documentation and examples
  - Next.js App Router patterns
  - Supabase client library usage

## MCP Server Integration

This project integrates with several MCP (Model Context Protocol) servers to enhance development workflows:

### Supabase MCP
- **Primary database operations**: Use Supabase MCP tools for applying migrations and inspecting the database
- **Available tools**: `apply_migration`, `execute_sql`, `list_tables`, `get_logs`, etc.
- **Configuration**: Configured in `.cursor/mcp.json` with project reference `mnjrwjtzfjfixdjrerke`

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
### Gemini CLI Direct Integration
- **Primary AI tool**: Use direct gemini CLI with non-interactive mode: `gemini -y '[prompt]'`
- **File system access**: The `-y` option enables non-interactive mode while preserving file system write capabilities
- **Use cases**: PDF analysis, large document extraction, technical content processing, file writing operations, document analysis
- **Advantages**: Full file system access, better performance than MCP, handles large files efficiently
- **IMPORTANT**: gemini CLI will timeout after 2min so plan your tasks accordingly, break them down as needed
