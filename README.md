# David-GPT

A multi-persona, citation-first RAG (Retrieval-Augmented Generation) platform built with Next.js. Allows different personas to answer questions using their own curated knowledge bases, with transparent citations and a sophisticated hybrid retrieval strategy.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev

# Start the background worker (REQUIRED for document ingestion)
./dev-worker.sh start

# Check worker status
./dev-worker.sh status

# View worker logs
./dev-worker.sh logs
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## ⚠️ Background Worker - IMPORTANT

The application uses **BullMQ** for asynchronous job processing (document extraction, ingestion, etc.). **The worker MUST be running** for these jobs to be processed.

### Worker Commands

```bash
./dev-worker.sh start    # Start worker in background
./dev-worker.sh stop     # Stop the worker
./dev-worker.sh restart  # Restart the worker
./dev-worker.sh status   # Check if running
./dev-worker.sh logs     # Tail the logs
```

### What Happens Without the Worker?

- ❌ Document ingestion jobs will be queued but never processed
- ❌ Re-ingestion requests will hang in "pending" status
- ❌ Batch URL/PDF uploads won't complete
- ✅ Chat functionality continues to work normally

**ALWAYS start the worker when developing!**

### Production Deployment

For production, use a process manager like **PM2** or **systemd** to ensure the worker stays running:

```bash
# Using PM2
pm2 start pnpm --name "david-gpt-worker" -- worker
pm2 save
pm2 startup  # Enable auto-start on boot

# Using systemd (create /etc/systemd/system/david-gpt-worker.service)
[Unit]
Description=David-GPT Background Worker
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/david-gpt
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pnpm worker
Restart=always

[Install]
WantedBy=multi-user.target
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL with pgvector)
- **AI**: Vercel AI SDK 5, OpenAI GPT-4
- **Search**: Hybrid retrieval (embeddings + BM25) with Cohere reranking
- **Authentication**: Supabase Auth with Google OAuth
- **Job Queue**: BullMQ + Redis

### Key Features
- **Multi-Persona System**: Each persona has dedicated knowledge base
- **Citation-First Responses**: All claims linked to source documents
- **Hybrid Search**: Semantic + keyword search with reranking
- **Async Processing**: Background workers for document ingestion
- **Real-Time Progress**: SSE for job status updates

## Development Scripts

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm worker           # Run background worker (foreground)

# Testing
pnpm test:performance  # Performance tests
pnpm test:quality      # Search quality tests
pnpm test:search       # Hybrid search tests

# Validation
pnpm validate:docs     # Validate document format
pnpm validate:personas # Validate persona configs

# Document Processing
pnpm process:docs      # Process documents
pnpm ingest:db         # Ingest to database
```

## Environment Variables

Create `.env.local` with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Cohere (for reranking)
COHERE_API_KEY=your_cohere_key

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Project Structure

```
├── personas/               # Persona-specific assets
│   └── <slug>/
│       ├── persona.md      # Persona profile
│       ├── persona.config.json
│       └── RAG/            # Markdown docs for ingestion
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── api/           # API routes
│   │   ├── admin/         # Admin interface
│   │   └── auth/          # Authentication
│   ├── components/        # React components
│   ├── lib/
│   │   ├── rag/           # RAG system
│   │   ├── queue/         # Job queue (BullMQ)
│   │   └── supabase/      # Supabase clients
│   └── globals.css
├── dev-worker.sh          # Worker management script
└── package.json
```

## Documentation

- [RAG PRD](DOCS/RAG-PRD.md) - Product requirements
- [CLAUDE.md](CLAUDE.md) - Development guidance

## License

Private project - All rights reserved
