# David-GPT System Architecture

**Version**: 2.0
**Last Updated**: 2025-09-20

## 1. Overview

This document provides a comprehensive technical overview of the David-GPT system architecture. The system is a sophisticated RAG (Retrieval-Augmented Generation) platform designed for high-quality, context-aware responses with a focus on technical and domain-specific knowledge.

The architecture is built on three core pillars:
1.  **A Multi-Path Document Ingestion Pipeline**: Specialized processing for different document types (patents, academic papers, press articles) to ensure high-quality data extraction.
2.  **A Three-Tier Hybrid RAG System**: An intelligent retrieval system combining SQL, vector, and full-text search for optimal speed and relevance.
3.  **An LLM-Powered Knowledge Graph (KG)**: A unified system for entity and relationship extraction, canonicalization, and cross-document linking.

## 2. Document Ingestion Pipeline

The ingestion pipeline is designed to handle diverse document types with specialized, domain-aware processing.

### 2.1. Processing Paths

-   **Patent Documents (`patent`)**: Uses USPTO/EPO APIs for metadata and employs section-aware chunking for claims, abstract, and descriptions.
-   **Academic Articles (`paper`, `pdf`)**: Integrates with the GROBID API for parsing and CrossRef/arXiv for metadata enrichment. Chunking is aware of academic structures (abstract, methodology, results).
-   **Press Articles (`press-article`)**: Uses the EXA client for content extraction with specialized logic to identify products, technologies, and market data.
-   **Generic Documents**: A fallback path uses paragraph-based chunking for any other document type.

### 2.2. Unified LLM-Powered Entity & Relationship Extraction

The system has migrated from a complex, pattern-based approach to a single, unified LLM-powered extraction pipeline (`unified-llm-entity-extractor.ts`).

-   **Core Technology**: Uses OpenAI GPT-4o with `generateObject` and Zod schema validation to extract entities, aliases, and relationships in a single API call.
-   **Configuration System (`extraction-configs.ts`)**: Selects domain-specific extraction configurations (e.g., `Leia_Technology`, `Computer_Vision`, `Business_Press`) based on document type and content. This allows for tailored extraction without code changes.
-   **Canonical Normalization (`canonical-normalizer.ts`)**: A crucial component that prevents entity drift. It normalizes entity names by handling case, punctuation, Unicode variations, and organization/person-specific suffixes (e.g., "Inc.", "Dr."). It uses Levenshtein distance for fuzzy matching to detect and merge duplicates.
-   **Deduplication**: Extracted entities are checked against the existing database. If a canonical match is found, the `mention_count` is incremented; otherwise, a new entity is created.

## 3. RAG System Architecture

The system employs a three-tier hybrid search architecture to provide fast and accurate retrieval, intelligently routing queries based on their patterns.

### 3.1. Three-Tier Search

1.  **Tier 1: SQL (Exact Lookups)**
    -   **Purpose**: Fast, precise lookups for identifiers and dates.
    -   **Queries**: `Patent US12345`, `DOI 10.1038/...`, `filed in 2023`
    -   **Technology**: Direct SQL queries on indexed `jsonb` fields (`identifiers`, `dates`).
    -   **Performance**: < 100ms.

2.  **Tier 2: Vector (Semantic Metadata Search)**
    -   **Purpose**: Semantic search over rich, human-readable metadata chunks.
    -   **Queries**: `Who invented lightfield displays?`, `Patents by David Fattal`
    -   **Technology**: `pgvector` HNSW index on dedicated `metadata` chunks.
    -   **Performance**: ~500ms.

3.  **Tier 3: Content (Technical & Explanatory Search)**
    -   **Purpose**: Deep content search for technical questions.
    -   **Queries**: `How do lightfield displays work?`, `Compare OLED and lightfield`
    -   **Technology**: Hybrid search (BM25 + pgvector) on `content` chunks, followed by Cohere Reranking.
    -   **Performance**: ~1000ms.

### 3.2. Knowledge Graph-Enhanced Retrieval

The Knowledge Graph is used to enhance query understanding and expand search context.

-   **Query Expansion**: The system performs a 1-hop traversal on the KG. For a query like "Leia technology," it expands the search to include related entities like "lightfield" and "head tracking."
-   **Disambiguation**: The `aliases` table is used to resolve different names for the same entity.
-   **Filtering & Boosting**: Search results can be filtered or boosted based on the presence of specific entities.

## 4. Knowledge Graph Architecture

The KG is implemented as a set of relational tables in PostgreSQL, designed for pragmatic and efficient relationship tracking.

-   **Entity Extraction**: Handled by the unified LLM extractor, which identifies entities, generates descriptions, and assigns a confidence score.
-   **Relationship Extraction**: The LLM also extracts relationships (e.g., `develops`, `uses_component`, `inventor_of`) and captures the evidence text from the source document.
-   **Canonicalization**: The `canonical-normalizer.ts` ensures that entities like "Leia Inc." and "Leia, Inc." are resolved to a single canonical entry, preventing duplicates and strengthening the graph.

## 5. Database Schema

The PostgreSQL database is the foundation of the system, with 13 core tables supporting ingestion, RAG, and the Knowledge Graph.

### 5.1. Key Tables

-   `documents`: Stores document metadata. Uses two `jsonb` columns, `identifiers` and `dates`, for generic, extensible storage of document-specific IDs (patent numbers, DOIs) and dates (filed, published).
-   `document_chunks`: Contains the text chunks for retrieval. A `chunk_type` column distinguishes between `content` chunks (clean text) and `metadata` chunks (rich, searchable metadata summaries). Embeddings are stored here using `pgvector`.
-   `entities`: The core table for the KG, storing canonical entities with their name, kind, description, and an `authority_score`.
-   `entity_aliases`: Stores alternative names for entities, linking back to the canonical entry.
-   `entity_edges`: Represents the relationships between entities, storing the source entity, destination entity, relation type, and confidence.
-   `conversations`, `messages`, `message_citations`: Manage multi-turn chat context, ensuring accurate and transparent citation.
-   `processing_jobs`: A queue for managing asynchronous document ingestion tasks.

## 6. API Architecture

The backend is built as a set of API routes within a Next.js application.

### 6.1. Core Endpoints

-   `/api/chat`: The main endpoint for user interaction. It uses a **Sequential RAG Architecture**:
    1.  RAG tools (`search_corpus`, `lookup_facts`) are pre-executed based on the query.
    2.  The results are injected into the system prompt.
    3.  The final response is streamed to the user without further tool calls, resolving common streaming issues.
-   `/api/rag/process`: Endpoints for initiating document ingestion and processing.
-   `/api/admin/...`: A set of endpoints for managing the knowledge graph, monitoring ingestion, and viewing system analytics.

### 6.2. Multi-Turn Context Management

The system uses a "fresh-first, carry-smart, summarize-always" strategy.
-   **Turn Classification**: Turns are classified as `new-topic`, `drill-down`, or `compare`.
-   **Context Carry-Over**: Sources from previous turns are re-scored with a decay factor (x0.7) and are kept for a maximum of 3 turns unless pinned.

## 7. Performance & Scalability

-   **Optimized Search**: The three-tier search architecture ensures that simple queries are handled extremely quickly (<100ms) while complex queries still benefit from powerful semantic search.
-   **Asynchronous Ingestion**: Document processing is handled via a background job queue (`processing_jobs` table), preventing API timeouts and allowing for robust, retryable ingestion.
-   **Indexing**: The database is heavily indexed, with GIN indexes on `jsonb` metadata, HNSW indexes for vector search, and GIN indexes for full-text search.
-   **LLM Usage**: The unified LLM extractor is optimized to extract entities, aliases, and relationships in a single API call, reducing token consumption and latency.