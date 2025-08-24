# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development**: `pnpm dev` (uses Turbopack for faster builds)
- **Build**: `pnpm build` (production build with Turbopack)
- **Start**: `pnpm start` (start production server)
- **Lint**: `pnpm lint` (ESLint with Next.js TypeScript config)
- **E2E Tests**: `pnpm test:e2e` (Playwright end-to-end tests)

## Architecture Overview

This is a Next.js application using the App Router pattern with the following key technologies:

- **Framework**: Next.js 15.5.0 with App Router
- **Runtime**: React 19.1.0
- **AI Integration**: Vercel AI SDK v5 for streaming with OpenAI provider
- **Database**: Supabase (Auth + Postgres + RLS)
- **UI Library**: shadcn/ui components based on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables
- **Forms**: React Hook Form with Zod validation
- **Icons**: Lucide React
- **Testing**: Playwright for E2E tests

## Project Structure

- **`src/app/`**: Next.js App Router pages and layouts
- **`src/components/ui/`**: shadcn/ui components (Avatar, Badge, Button, Card, Dialog, etc.)
- **`src/lib/`**: Shared utilities (`utils.ts` contains the `cn()` utility for class merging)
- **`docs/`**: Architecture and setup documentation
- **`budgets/`**: Performance budget configuration

## Key Configuration

- **TypeScript**: Configured with strict mode, path aliases (`@/*` maps to `src/*`)
- **shadcn/ui**: New York style, RSC-enabled, with CSS variables for theming
- **ESLint**: Next.js core-web-vitals and TypeScript rules
- **Fonts**: Geist Sans and Geist Mono from Google Fonts

## Environment Setup

Required environment variables (see `docs/setup.md`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 
- `OPENAI_API_KEY`

## Development Workflow

1. Run `pnpm dev` for development with Turbopack
2. Use the contracts-first workflow (api.md, db.md, events.md as mentioned in architecture)
3. Follow shadcn/ui patterns for new components
4. Ensure RLS (Row Level Security) access is properly configured for Supabase
5. Run linting and E2E tests before deployment

## Orchestration Protocol

1. **Start-up Context**
   - Always read `.claude/contracts/*.md`, `.claude/tickets/*.md`, `.claude/master_plan.md` before acting
   - Use `context7` for design/system references instead of asking the user
   - Check contract status - work may only proceed against **frozen** contracts

2. **Contracts-First Workflow**
   - All contracts must be frozen with `frozen@timestamp` header before downstream work begins
   - Current contracts: `api.md`, `db.md`, `events.md`
   - If a contract is missing or draft, assign the appropriate sub-agent to propose/freeze it
   - Contract changes require re-freezing with new timestamp

3. **Sub-Agent Delegation**
   - Available agents in `.claude/agents/`: ai-integrations, auth-security, backend-developer, db-architect, devops-release, docs-writer, frontend-developer, performance-engineer, qa-expert, telemetry-analytics
   - Assign tickets from `.claude/tickets/*.md` to the correct specialized agent
   - Pass only relevant frozen contracts + specific deliverables to agents
   - Agents must append progress JSON to `.claude/master_plan.md` for every meaningful update

4. **Progress Logging (Required Format)**
   All agents must append JSON progress logs to master_plan.md:
   ```json
   {
     "timestamp": "2025-01-27T10:30:00.000Z",
     "agent": "backend-developer", 
     "update_type": "progress|blocked|completed",
     "ticket": "API-CHAT-STREAM",
     "completed": ["route scaffolded", "streaming implemented"],
     "next": ["message persistence", "error handling"],
     "blocked_on": ["DB-SCHEMA-V1 completion"]
   }
   ```

5. **Current Ticket Queue**
   - `DB-SCHEMA-V1` (db-architect) - in-progress
   - `API-CHAT-STREAM` (backend-developer) - blocked on DB completion
   - `FRONTEND-CHAT-UI` (frontend-developer) - todo
   - `AUTH-SUPABASE-INTEGRATION` (auth-security) - todo  
   - `TITLE-GENERATION` (ai-integrations) - todo
   - `QA-E2E-TESTS` (qa-expert) - todo
   - `PERFORMANCE-OPTIMIZATION` (performance-engineer) - todo
   - `DEPLOYMENT-VERCEL` (devops-release) - todo