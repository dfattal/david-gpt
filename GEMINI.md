# GEMINI.md - Project Overview

This document provides a comprehensive overview of the `david-gpt` project, intended as a guide for AI-powered development assistants.

## Project Overview

`david-gpt` is a full-stack Next.js application that implements a **multi-persona** RAG (Retrieval-Augmented Generation) platform. The application allows each persona to answer questions using its own curated knowledge base, providing reliable, cited answers.

### Key Technologies

*   **Frontend:** Next.js, React, TypeScript, Tailwind CSS
*   **Backend:** Next.js API Routes, Supabase (for authentication and database)
*   **AI/RAG:** `@ai-sdk/openai`, `cohere-ai`, and a custom document processing pipeline using libraries like `pdf-parse` and external APIs such as Crossref, GROBID, and Exa.
*   **Styling:** Shadcn/ui components, `lucide-react` for icons.

### Architecture

The application is structured with a clear separation of concerns, with persona-specific assets co-located.

*   `personas/<slug>/`: The core of the multi-persona system. Each persona has its own directory containing:
    *   `persona.md`: A natural-language profile of the persona.
    *   `persona.config.json`: LLM-generated configuration for topics, aliases, and routing rules.
    *   `RAG/`: A directory containing all Markdown documents for that persona's knowledge base.
*   `src/app`: Contains the main application routes and UI components, following Next.js App Router conventions.
*   `src/components`: Reusable React components, organized by feature (e.g., `auth`, `chat`, `admin`).
*   `src/lib`: Core application logic, including database interactions, RAG pipeline, and other utilities.
    *   `src/lib/rag`: This is the heart of the RAG system, containing the document processing pipeline, chunking logic, and integrations with various AI services.
*   `scripts`: Utility scripts for tasks like cleaning markdown and processing documents.

### RAG Workflow Overview

The project follows a specific RAG workflow as defined in the `DOCS/RAG-PRD.md`.

*   **Document Format**: All knowledge base documents are Markdown files with a specific YAML frontmatter including fields like `id`, `title`, `source_url`, `personas`, and `topics`.
*   **Ingestion**: A two-step process:
    1.  Raw content (PDF, URL, etc.) is converted to clean Markdown.
    2.  An LLM generates the final, structured Markdown document with the required frontmatter.
*   **Retrieval Strategy**: A hybrid approach is used:
    1.  A **Router** first determines if a query is in-scope for RAG.
    2.  If in-scope, a hybrid search (Vector + BM25) is performed.
    3.  Results are re-ranked to find the most relevant chunks.
*   **Citations**: Answers are generated with inline citations in the format `[^doc_id:section]`, which link to the source documents.

## Building and Running

### Prerequisites

*   Node.js and pnpm
*   Supabase account and project credentials (configured via environment variables)

### Development

To run the development server:

```bash
pnpm dev
```

This will start the application on `http://localhost:3000`.

### Building for Production

To build the application for production:

```bash
pnpm build
```

### Running in Production

To start the application in production mode:

```bash
pnpm start
```

## Development Conventions

### API and Library Documentation

When you need up-to-date documentation for APIs, libraries, or frameworks, use the `context7 mcp` tool. This should be your primary source for resolving questions about library usage, function signatures, and best practices.

- **Workflow:**
- 1.  Use `resolve-library-id` to find the correct Context7-compatible library ID.
- 2.  Use `get-library-docs` with the obtained ID and a specific topic to retrieve relevant documentation.

**Examples:**

*   **Vercel AI SDK:** To understand text streaming, you would first resolve `Vercel AI SDK` and then get docs for the topic "text streaming".
*   **Supabase:** To learn about authentication, resolve `Supabase` and then get docs for "authentication".
*   **Next.js:** To find information on the App Router, resolve `Next.js` and then get docs for "App Router".
*   **Cohere AI:** To check the parameters for the embed API, resolve `Cohere` and then get docs for "embed".

### Testing

Use Playwright MCP to perform tests directly in browser. 

### Linting

The project uses ESLint for code linting. To run the linter:

```bash
pnpm lint
```

### Validation

The project includes scripts for validating documents and personas:

*   `pnpm validate`: Runs all validation scripts.
*   `pnpm validate:docs`: Validates documents.
*   `pnpm validate:personas`: Validates personas.

### Ingestion

To ingest articles, use the following script:

```bash
pnpm ingest:articles
```

This will run the `batch-ingest-articles.ts` script.