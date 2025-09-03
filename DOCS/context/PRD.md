# David-GPT Product Requirements Document

## 1. Executive Summary

### Vision
David-GPT is a personal, citation-first RAG chatbot that answers in David's voice and draws on a curated corpus of papers, patents, and notes. It emphasizes fact accuracy, transparent citations, and intelligent retrieval through a hybrid approach combining embeddings, BM25, and advanced reranking.

### Key Differentiators
- **Citation-first approach**: Every answer includes transparent, inline citations
- **Hybrid retrieval**: Combines semantic search (embeddings) with keyword search (BM25) for comprehensive coverage
- **Structured metadata priority**: Uses authoritative structured data (authors, dates, patent status) as primary source
- **Smart multi-turn context**: Intelligently manages conversation context to avoid irrelevant information carryover
- **Admin-friendly corpus management**: Simple tools for document ingestion and knowledge graph maintenance

### Target Users
- **Admins**: Manage corpus ingestion, metadata, and knowledge graph inspection
- **Members**: Invited users who can chat, save, rename, and delete conversations
- **Guests**: Can try the bot with a limited corpus but cannot save conversations


## 2. User Personas & Use Cases

### Admin Persona
**Primary Goals**: Maintain accurate, up-to-date knowledge corpus
**Key Workflows**:
- Ingest new documents (PDFs, DOIs, patents, notes)
- Review and correct extracted metadata
- Manage knowledge graph entities and relationships
- Resolve conflicting information
- Monitor system performance and usage

### Member Persona
**Primary Goals**: Get accurate, cited answers to research questions
**Key Workflows**:
- Ask questions about papers, patents, or topics
- Navigate conversation history
- Save and organize important conversations
- Follow citation trails for deeper research

### Guest Persona
**Primary Goals**: Evaluate the system before committing
**Key Workflows**:
- Try the chatbot with limited corpus access
- Experience the citation quality
- Cannot save conversations or access full corpus

## 3. Core Functional Requirements

### 3.1 Chat Experience

#### Main Chat Interface
- **Layout**: Conversation list (left panel) + chat pane (main area)
- **Input**: Natural language questions
- **Output**: Answers with inline citations in format: `[1]`, `[2]`, etc.
- **Citation Details**: Expandable right drawer showing full citation information

#### Citation Format
```
Q: Who authored the switchable LC patent?

A: The switchable LC patent was authored by Fetze Pijlman and Jan Van Der Horst [1].
[1] Switchable-LC patent US11281020 (2021-03-23)
```

#### Multi-turn Context Management
- **Smart Context Routing**: Classify each turn as `related` vs `unrelated` using last 3 user turns + current query
- **Related Questions**: Include up to last 2 assistant messages' evidence IDs as soft-boosts
- **Unrelated Questions**: Clear working set and start fresh
- **Context Pinning**: Users can pin specific citations for next N turns (default 3)

#### Fallback Behavior
- **No Relevant Content**: Return generic LLM answer with banner "No matching sources found — generic model answer (not cited)"
- **Low Confidence**: Surface uncertainty and provide alternative interpretations

### 3.2 Conversation Management

#### Conversation Lifecycle
- **Creation**: Conversation record created on first user message
- **Auto-titling**: Generate title after 2 assistant chunks or 10 seconds (≤ 45 chars)
- **Management**: Rename/delete via three-dot menu
- **Deletion**: Soft delete for 30 days with restore option in "Trash"
- **Search**: Full-text search over user messages, titles, and content

#### Real-time Updates
- Left panel reflects conversation updates immediately
- Conversation list updates when new conversations are created
- Title updates appear in real-time

### 3.3 Document Ingestion & Management

#### Supported Input Types
- **PDFs**: Direct upload
- **Academic Papers**: DOI/arXiv links
- **Patents**: Patent number + jurisdiction
- **Google Patents URL**: Direct URL to a Google Patents page for parsing official metadata and full text.
- **Notes**: Markdown text

#### Metadata Extraction
- **Papers**: Title, authors, affiliations, venue, DOI, publication date, abstract
- **Patents**:  
  - Identifiers: patent number (e.g., US11281020B2), application/publication/grant/priority numbers; jurisdiction  
  - Parties: inventors (array), assignee, original assignee, current assignee (if present)  
  - Dates: filing date, grant date, priority date(s); normalized ISO and raw strings  
  - Status: current legal status (as shown), with `authority='GooglePatents'` and `is_authoritative=false`  
  - Expiration: `expirationDate` if present; if missing, compute estimated expiry (20y from earliest non‑provisional) and set `is_estimate=true`  
  - Text bodies: abstract, description (full), and claims (full, numbered) for retrieval
- **Notes**: Author, creation date, tags

#### Ingestion Workflow
1. **Identify**: Upload file or provide identifier
2. **Review**: Show extracted metadata and entities for admin review/editing
3. **Publish**: Embed, index, and make searchable

#### Patent Ingestion via Google Patents URL
When a Google Patents URL is provided, the system will:
1. Fetch page HTML (server-side) and parse structured data (prefer `application/ld+json` blocks; fallback to DOM).
2. Extract metadata into the following structure, persisting both raw and normalized forms:

```json
{
  "patentNumber": "US11281020B2",
  "inventors": ["Fetze Pijlman", "Jan Van Der Horst"],
  "assignee": "Leia Inc",
  "originalAssignee": "Koninklijke Philips NV",
  "filingDate": "2019-10-09",
  "grantDate": "2022-03-22",
  "priorityDate": "2010-09-22",
  "status": "Active",
  "expirationDate": "2031-12-31"
}
```

3. Extract **abstract**, **description**, and **claims** text into dedicated fields/chunks for retrieval.
4. Create/attach entities (persons/orgs) and edges: `inventor_of`, `assignee_of`, and `supersedes` if applicable.
5. Register events: `filed`, `published` (if available), `granted`, and `expires` (estimated or explicit).

*Authority & refresh policy:* Google Patents is treated as a convenient source for parsing. **USPTO/EPO remain the source of truth** for status and dates. A nightly job revalidates status/dates against USPTO/EPO (see Retrieval & Answering Configuration / Conflict Policy).

#### Document Processing
- **Chunking**: 800-1200 token windows with 15-20% overlap
- **Special Chunks**: Tiny chunks for titles, abstracts, claims, captions
- **Deduplication**: Content hash-based; link preprint↔journal versions
- **Indexing**: Embed chunks and build full-text search vectors

#### Processing Libraries
- **PDFs**: `pdf-parse` for text extraction and basic metadata
- **Academic Papers**: GROBID (Docker) for structured parsing, Crossref API for metadata
- **Patents**: USPTO/EPO APIs for official data, `pdf-parse` for document text
- **Web URLs**: `cheerio` for DOI/arXiv link processing
- **Notes**: `react-markdown` for Markdown rendering and processing
- **Fallback**: Generic text processor for unsupported formats
- **Patent pages**: Parse `application/ld+json` and DOM with `cheerio`; normalize dates with `luxon`
- **HTTP**: Use server-side fetch with robust retry/backoff; identify with custom UA string

#### GROBID Integration
- **Deployment**: Public demo server (https://kermitt2-grobid.hf.space/) - tested and working
- **Access**: HTTP API calls from Vercel API routes
- **Processing**: Structured extraction of papers, metadata, references
- **Performance**: Suitable for development and testing; consider self-hosted for production
- **API Endpoint**: `/api/processFulltextDocument` (POST with PDF file)

### 3.4 Knowledge Graph Management

#### Entity Types
- **People**: Authors, inventors, researchers
- **Organizations**: Universities, companies, institutions
- **Products**: Technologies, algorithms, materials
- **Documents**: Papers, patents, notes

#### Relationship Types
- `author_of`, `inventor_of`, `assignee_of`
- `implements`, `used_in`, `supersedes`
- `collaborates_with`, `affiliated_with`

#### Event Management
- **Event Types**: Filed, published, granted, expires, product_launch
- **Event Properties**: Date, authority level, certainty (0-1)
- **Conflict Resolution**: Flag conflicting facts, allow manual resolution or apply "newest wins" policy

#### Admin Tools
- **KG Inspector**: View 1-hop connections, merge duplicates, edit aliases
- **Conflict Center**: List documents with conflicting information
- **Corpus Browser**: Filter by type, status, year, jurisdiction

## 4. Technical Architecture

### 4.1 System Overview
```
User Interface (Next.js)
    ↓
API Routes (Vercel AI SDK 5)
    ↓
Retrieval Engine (Hybrid: Embeddings + BM25)
    ↓
Reranking (Cohere Rerank 3.5)
    ↓
LLM Generation (OpenAI GPT-4 via Vercel AI SDK)
    ↓
Database (Supabase PostgreSQL + Vector Store)
```

### 4.2 API Architecture
- **Framework**: Next.js 14+ with App Router
- **AI SDK**: Vercel AI SDK 5 for streaming chat responses
- **API Routes**: `/api/chat` for chat endpoints, `/api/ingest` for document processing
- **Streaming**: Real-time response streaming with `streamText()` and `streamUI()`
- **Tool Calling**: Native support for retrieval and citation tools

### 4.3 Retrieval Configuration
- **Candidate Generation**: 
  - Embeddings: `text-embedding-3-large`, KNN k=80
  - BM25: k=60
  - Fusion: Reciprocal Rank Fusion (RRF)
- **Reranking**: Cohere `rerank-3.5` on top 30-50 candidates
- **Final Context**: Keep top 5 chunks for LLM context
- **Tool Integration**: Retrieval as AI SDK tools for seamless integration

### 4.4 Answering Modes
- **FACT**: Structured metadata first, rerank results as supporting context
- **EXPLAIN**: Synthesize 3-5 chunks for comprehensive explanations
- **TIMELINE**: Focus on events table for chronological information

### 4.5 Conflict Resolution Policy
- **Authority Order**: Register > Publisher > Aggregator > Notes
- **Within Authority**: Newest wins
- **Material Conflicts**: Surface both with explanation

## 5. User Management & Authentication

### 5.1 Authentication
- **Provider**: Supabase Auth
- **Methods**: Email/password + Google OAuth
- **Session**: 7-day rolling session with httpOnly refresh tokens

### 5.2 Role-Based Access Control
- **Admin**: Full access to corpus, KG, user management
- **Member**: Read-only corpus access, full conversation management
- **Guest**: Limited corpus access, no conversation saving

### 5.3 Row Level Security (RLS)
- Conversations visible only to owner/participants
- Corpus read-only to members
- Admin-only write access to corpus/KG
- Document storage in private Supabase buckets with signed URLs

## 6. Performance & Scalability

### 6.1 Performance Targets
- **Document Ingestion**: PDF searchable within 5 minutes
- **Chat Response**: < 3 seconds for typical queries
- **Citation Accuracy**: > 95% for structured facts (authors, dates, patent status)

### 6.2 Scalability Considerations
- **Concurrent Users**: Support 100+ simultaneous users
- **Corpus Size**: Handle 10,000+ documents
- **Document Size**: Support up to 50MB PDFs

### 6.3 Caching Strategy
- **Embedding Cache**: Cache document embeddings in Supabase
- **Rerank Cache**: Cache reranking results for similar queries
- **Citation Cache**: Cache citation details and metadata
- **Vercel Edge Cache**: Leverage Vercel's edge caching for API responses
- **AI SDK Cache**: Use built-in caching for LLM responses

## 7. Security & Compliance

### 7.1 Data Security
- **Storage**: All documents in private Supabase buckets
- **Access**: Signed URLs for document access
- **Encryption**: Data encrypted at rest and in transit

### 7.2 Privacy
- **PII**: Only email and name collected
- **Data Retention**: Deleted items kept in Trash for 30 days
- **Deletion**: Honor user deletion requests within 30 days

### 7.3 Compliance
- **Licensing**: Only ingest documents with proper rights
- **Paywalled Sources**: Store metadata + private fulltext only
- **Audit Trail**: Log all document access and modifications
- **Robots/ToS**: Respect Google Patents Terms of Service and robots.txt; rate-limit fetches and cache results; prefer official registers for authoritative data.


## 8. Observability & Monitoring

### 8.1 Metrics & Dashboards
- **Performance**: Latency, error rate, cost per answer
- **Quality**: Recall@k, MRR, Citation Precision, Exact Match for facts
- **Usage**: Query volume, popular documents, user engagement

### 8.2 Logging
- **Per-turn Trace**: Query → candidates → rerank → chosen chunks → citations
- **AI SDK Logging**: Built-in request/response logging via Vercel AI SDK
- **Ingestion Logs**: Document processing errors and success rates
- **Export**: JSONL format for analysis
- **Vercel Analytics**: Integration with Vercel's analytics for performance monitoring

### 8.3 Error Handling
- **Provider Errors**: Auto-retry once, fallback to smaller models
- **AI SDK Errors**: Built-in error handling and retry logic
- **Parsing Failures**: Surface errors in admin interface, allow manual entry
- **Empty Results**: Clear user messaging about no matching sources
- **Streaming Errors**: Graceful degradation when streaming fails

## 9. MVP Acceptance Criteria

### 9.1 Core Functionality
- [ ] Upload PDF → searchable within 5 minutes with correct metadata
- [ ] "Who authored <paper>?" returns exact author list with citation
- [ ] "When was patent <no> granted?" returns date + register citation
- [ ] "When does it expire?" returns estimated expiry (flagged as estimate)

### 9.2 Multi-turn Conversations
- [ ] Unrelated follow-up questions don't reuse prior context
- [ ] Related follow-up questions reuse context via evidence IDs
- [ ] Context pinning works for specified number of turns

### 9.3 Conversation Management
- [ ] Create/auto-title/rename/delete/restore all function correctly
- [ ] Left panel reflects updates in real-time
- [ ] Search conversations by content and title

### 9.4 Admin Tools
- [ ] Document ingestion wizard with review step
- [ ] KG inspector for entity management
- [ ] Conflict resolution interface
- [ ] Corpus browser with filtering

## 10. Implementation Roadmap

### Phase 1: Core Chat (MVP)
- Next.js app with Vercel AI SDK 5 integration
- Basic chat interface with streaming responses
- Document ingestion for PDFs and DOIs
- Simple retrieval (embeddings only)
- Conversation management
- Admin authentication

### Phase 2: Enhanced Retrieval
- Hybrid retrieval (embeddings + BM25)
- Cohere reranking integration via AI SDK tools
- Multi-turn context management
- Knowledge graph basics
- Advanced streaming with tool calling

### Phase 3: Advanced Features
- Patent ingestion and processing
- Advanced KG management
- Conflict resolution tools
- Performance optimization

### Phase 4: Scale & Polish
- Guest mode
- Advanced admin tools
- Comprehensive monitoring
- Mobile optimization

## 11. Risk Assessment & Mitigation

### 11.1 Technical Risks
- **Metadata Quality**: Keep raw + normalized data, show provenance, require admin review
- **Name Collisions**: Implement aliases and co-author/venue disambiguation
- **Over-boosting**: Cap KG and recency bonuses, monitor hit-rate vs quality
- **Latency Spikes**: Cap rerank N, implement caching, batch embeddings

### 11.2 Business Risks
- **API Costs**: Monitor usage, implement caching, optimize query patterns
- **Data Rights**: Clear licensing policy, audit document sources
- **User Adoption**: Start with core use cases, gather feedback early

### 11.3 Operational Risks
- **Data Loss**: Regular backups, version control for documents
- **Service Outages**: Graceful degradation, clear error messaging
- **Security Breaches**: Regular security audits, minimal data collection

## 12. Success Metrics

### 12.1 User Engagement
- Daily active users
- Average session length
- Conversation completion rate
- Citation click-through rate

### 12.2 System Performance
- Average response time
- Citation accuracy rate
- Document ingestion success rate
- System uptime

### 12.3 Content Quality
- Admin satisfaction with corpus management tools
- User satisfaction with answer quality
- Citation relevance score
- Knowledge graph completeness

---

## Appendix: Open Questions & Decisions

### Resolved Decisions
1. **Guest Mode**: Enabled at launch for testing and evaluation
2. **Patent Sources**: USPTO + EPO only (no paid providers for MVP)
3. **Conflict Policy**: Simple "newest wins" with authority ordering
4. **Conversation Sharing**: Disabled for MVP
5. **Tone Controls**: Fixed "David voice" for all outputs
6. **Data Retention**: 30-day trash retention policy


### Resolved Clarifications
1. **Vector Database:** Use Supabase `pgvector` (HNSW, cosine, 3072 dims). Revisit external vector stores only beyond ~5–10M chunks or for cross‑region ANN needs.
2. **Mobile Experience:** Fully responsive chat with left‑rail collapse; admin tools are desktop‑only for MVP. On mobile, uploads limited to links (DOI/arXiv/patent/Google Patents URL).
3. **Bulk Operations:** Support ZIP of PDFs plus a CSV manifest (`type,title,doi,arxiv,patent_no,jurisdiction,source_url,tags`). Run ingestion as async jobs with per‑file progress and partial‑success reporting.
4. **API Rate Limits & Caching:** Cap Cohere rerank candidates at 50; cache rerank results (hash of query+candIDs) for 24h. GROBID concurrency 1–2; cache TEI by content hash. USPTO/EPO lookups cached 7 days with nightly revalidation.
5. **Backup Strategy:** Enable Supabase PITR; take daily logical dumps to cold storage. Turn on storage bucket versioning with 30‑day retention. Track schema migrations in repo (no secrets committed).
6. **AI SDK Tools:** Implement three tools — `search_corpus(query, mode)`, `lookup_facts(headwords)`, and `get_timeline(ids)` — to enforce “facts from structure first.”
7. **Streaming UI:** Use `streamText()` for chat responses in MVP; reserve `streamUI()` for heavier admin visualizations if needed later.
8. **Document Formats (MVP):** Support PDFs, DOI/arXiv, Google Patents URLs, and Markdown notes. For DOCX uploads, instruct users to export to PDF.
9. **Patent Processing:** Parse from Google Patents URL; treat USPTO/EPO as the authoritative source for status/dates. Store estimated expiry (`is_estimate=true`) when not explicit; 
