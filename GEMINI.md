# GEMINI.md - Project Overview

This document provides a comprehensive overview of the `david-gpt` project, intended as a guide for AI-powered development assistants.

## Project Overview

`david-gpt` is a full-stack Next.js application that implements a personal RAG (Retrieval-Augmented Generation) chatbot. The application is designed to ingest, process, and index a variety of documents to provide context for a conversational AI.

### Key Technologies

*   **Frontend:** Next.js, React, TypeScript, Tailwind CSS
*   **Backend:** Next.js API Routes, Supabase (for authentication and database)
*   **AI/RAG:** `@ai-sdk/openai`, `cohere-ai`, and a custom document processing pipeline using libraries like `pdf-parse` and external APIs such as Crossref, GROBID, and Exa.
*   **Styling:** Shadcn/ui components, `lucide-react` for icons.

### Architecture

The application is structured as a monorepo with a clear separation of concerns:

*   `src/app`: Contains the main application routes and UI components, following Next.js App Router conventions.
*   `src/components`: Reusable React components, organized by feature (e.g., `auth`, `chat`, `admin`).
*   `src/lib`: Core application logic, including database interactions, RAG pipeline, and other utilities.
    *   `src/lib/rag`: This is the heart of the RAG system, containing the document processing pipeline, chunking logic, and integrations with various AI services.
*   `scripts`: Utility scripts for tasks like cleaning markdown and processing documents.

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
