# David-GPT Product Requirements Document

## 1. Executive Summary

### Vision
David-GPT is a personal, citation-first RAG chatbot that answers in David's voice and draws on a curated corpus of papers, patents, and notes. It emphasizes fact accuracy, transparent citations, and intelligent retrieval through a **three-tier hybrid retrieval system** combining semantic search, keyword search, and advanced reranking. The system is supported by a comprehensive validation framework and advanced document processing pipelines to ensure corpus quality and relevance.

### Key Differentiators
- **Citation-first approach**: Every answer includes transparent, inline citations.
- **Three-Tier Hybrid Retrieval**: Combines semantic search (embeddings), keyword search (BM25), and Cohere reranking for relevance optimization.
- **Comprehensive Validation**: CLI and real-time UI tools for document and persona validation with quality scoring.
- **Advanced Document Processing**: Specialized pipelines for patents and articles, with metadata injection for enhanced retrieval.
- **Enhanced Persona Management**: An integrated admin system for creating, managing, and testing personas in real-time.
- **Admin-friendly corpus management**: Simple tools for document ingestion and knowledge graph maintenance.

### Target Users
- **Admins**: Manage corpus ingestion, personas, metadata, and knowledge graph inspection.
- **Members**: Invited users who can chat, save, rename, and delete conversations.
- **Guests**: Can try the bot with a limited corpus but cannot save conversations.


## 2. User Personas & Use Cases

### Admin Persona
**Primary Goals**: Maintain an accurate, up-to-date, and high-quality knowledge corpus and conversational personas.
**Key Workflows**:
- Ingest new documents (PDFs, DOIs, patents, notes) via single or batch uploads.
- Validate documents and personas using CLI tools and real-time UI feedback.
- Create, edit, and manage system personas through a dedicated admin interface.
- Review and correct extracted metadata.
- Monitor system performance and usage.

### Member Persona
**Primary Goals**: Get accurate, cited answers to research questions.
**Key Workflows**:
- Ask questions about papers, patents, or topics.
- Navigate conversation history.
- Save and organize important conversations.
- Follow citation trails for deeper research.

### Guest Persona
**Primary Goals**: Evaluate the system before committing.
**Key Workflows**:
- Try the chatbot with limited corpus access.
- Experience the citation quality.
- Cannot save conversations or access full corpus.

## 3. Core Functional Requirements

### 3.1 Chat Experience

#### Main Chat Interface
- **Layout**: Conversation list (left panel) + chat pane (main area).
- **Input**: Natural language questions.
- **Output**: Answers with inline citations in format: `[1]`, `[2]`, etc.
- **Citation Details**: Expandable right drawer showing full citation information.

#### Citation Format
```
Q: Who authored the switchable LC patent?

A: The switchable LC patent was authored by Fetze Pijlman and Jan Van Der Horst [1].
[1] Switchable-LC patent US11281020 (2021-03-23)
```

#### Multi-turn Context Management
- **Smart Context Routing**: Classify each turn as `related` vs `unrelated`.
- **Related Questions**: Include context from recent turns.
- **Unrelated Questions**: Start fresh to avoid context pollution.

#### Fallback Behavior
- **No Relevant Content**: Return a generic LLM answer with a clear disclaimer.
- **Low Confidence**: Surface uncertainty and provide alternative interpretations.

### 3.2 Conversation Management

#### Conversation Lifecycle
- **Creation**: Conversation record created on first user message.
- **Auto-titling**: Generate a concise title automatically.
- **Management**: Rename/delete via a simple menu.
- **Search**: Full-text search over conversations.

### 3.3 Document Ingestion & Management

#### Supported Input Types
- **PDFs**: Direct upload.
- **Academic Papers**: DOI/arXiv links.
- **Patents**: Patent number + jurisdiction or Google Patents URL.
- **Press Articles**: URLs for extraction and processing.
- **Notes**: Markdown text.

#### Advanced Document Processing
- **Chunking Strategy**: 800-1200 token windows with overlap. Special handling for titles, abstracts, and claims.
- **Metadata Injection**: Key metadata (e.g., publication date, authors, patent status) is injected directly into document chunks to improve retrieval accuracy and enable metadata-aware filtering.
- **Patent-Specific Processing**: A dedicated pipeline extracts and structures patent metadata, including inventors, assignees, dates, and legal status. It also handles the specific structure of patent documents (abstract, claims, description).
- **Press Article Extraction**: A process for fetching, cleaning, and converting web articles into a standardized Markdown format for ingestion.
- **Batch Upload**: Admins can upload multiple documents at once, with validation performed on each file in the batch.

#### Comprehensive Validation System
- **YAML Frontmatter Validation**: Ensures all documents contain valid and complete frontmatter before ingestion.
- **Document Type Detection**: Automatically identifies the type of document (e.g., patent, paper, article) to apply the correct processing and validation rules.
- **CLI Validation Tools**: Scripts available for developers and admins to validate documents and personas locally before uploading (`validate-document`, `validate-persona`).
- **Real-time UI Validation**: The admin interface provides immediate feedback during document and persona creation/uploads, highlighting errors and providing quality scores with actionable suggestions for improvement.

### 3.4 Enhanced Persona Management System

- **Admin Interface**: A dedicated section in the admin panel for full CRUD (Create, Read, Update, Delete) operations on personas.
- **Real-time Validation**: As an admin creates or edits a persona, the system provides real-time validation against a parser, checking for compatibility and adherence to schema.
- **Quality Scoring**: Personas are given a quality score based on completeness, clarity, and compatibility, with suggestions for improvement.
- **Status Management**: Admins can set personas as "active" or "inactive," allowing for safe testing of new personas without affecting the live chatbot.
- **Export Functionality**: Personas can be exported in a standardized format (e.g., YAML or JSON) for backup or transfer.

### 3.5 Knowledge Graph Management

#### Entity & Relationship Types
- **Entities**: People, Organizations, Products, Documents.
- **Relationships**: `author_of`, `inventor_of`, `affiliated_with`, `implements`.

#### Admin Tools
- **KG Inspector**: View connections, merge duplicates, and edit entities.
- **Corpus Browser**: Filter documents by type, status, year, etc.

## 4. Technical Architecture

### 4.1 System Overview
```
User Interface (Next.js)
    ↓
API Routes (Vercel AI SDK 5)
    ↓
Retrieval Engine (Three-Tier RAG)
    ↓
LLM Generation (OpenAI GPT-4 via Vercel AI SDK)
    ↓
Database (Supabase PostgreSQL + Vector Store)
```

### 4.2 Three-Tier RAG Retrieval
The retrieval process is designed for high relevance and accuracy through a multi-stage pipeline:
1.  **Candidate Generation (Tier 1 & 2)**:
    - **Semantic Search**: Uses `text-embedding-3-large` to find semantically similar chunks (k=80).
    - **Keyword Search**: Uses BM25 to find chunks with exact keyword matches (k=60).
    - **Hybrid Scoring**: Results from both searches are fused using Reciprocal Rank Fusion (RRF) to create a preliminary candidate list.
2.  **Reranking (Tier 3)**:
    - The top 30-50 candidates from the fused list are passed to **Cohere Rerank 3.5**.
    - The reranker re-evaluates the relevance of each chunk in the context of the specific query, producing a final, highly relevant, and optimized list.
3.  **Context Assembly**:
    - The top 5 reranked chunks are used as the final context for the LLM to generate the answer.

### 4.3 API Architecture
- **Framework**: Next.js 14+ with App Router.
- **AI SDK**: Vercel AI SDK 5 for streaming and tool calling.
- **API Routes**: `/api/chat`, `/api/ingest`, `/api/admin`.

## 5. User Management & Authentication

- **Provider**: Supabase Auth with email/password and Google OAuth.
- **Access Control**: Role-based access (Admin, Member, Guest) enforced by Row Level Security (RLS).

## 6. Performance & Scalability

- **Targets**: < 3s chat response; ingestion complete in < 5 mins.
- **Scale**: Designed to handle 10,000+ documents and 100+ concurrent users.

## 7. Security & Compliance

- **Data Security**: Documents in private Supabase buckets, accessed via signed URLs. All data encrypted at rest and in transit.
- **Privacy**: Minimal PII collection, with a 30-day retention policy for deleted items.

## 8. Observability & Monitoring

- **Metrics**: Dashboards for performance (latency, cost), quality (recall, MRR), and usage.
- **Logging**: Detailed per-turn traces and ingestion logs.

## 9. MVP Acceptance Criteria
- [ ] **Persona**: Admin can create, validate, and activate a new persona.
- [ ] **Validation**: CLI tool successfully validates a local document and rejects an invalid one.
- [ ] **Document Upload**: Batch upload of 3 documents (1 patent, 1 article, 1 paper) succeeds with validation.
- [ ] **Retrieval**: A query successfully passes through all three tiers of the RAG system.
- [ ] **Chat**: A chat response correctly uses a non-default persona set by the admin.

## 10. Implementation Roadmap

### Phase 1: Core Chat & Retrieval (MVP)
- Next.js app with Vercel AI SDK 5.
- **Three-tier RAG retrieval pipeline**.
- Basic chat interface and conversation management.
- PDF and DOI ingestion.

### Phase 2: Admin & Validation
- **Enhanced Persona Management system**.
- **Comprehensive Validation System** (CLI and UI).
- **Advanced document processing** for patents and articles.
- Knowledge graph basics and admin inspector.

### Phase 3: Scale & Polish
- Guest mode implementation.
- Advanced admin dashboards (e.g., search analytics).
- Performance optimization and caching.

## 11. Risk Assessment & Mitigation
- **Technical Risks**: Metadata quality (mitigated by validation), latency (mitigated by caching and optimization).
- **Business Risks**: API costs (mitigated by monitoring), data rights (mitigated by clear policy).

## 12. Success Metrics
- **User Engagement**: Daily active users, session length, citation click-through rate.
- **System Performance**: Response time, citation accuracy, ingestion success rate.
- **Quality**: Admin and user satisfaction scores, KG completeness.