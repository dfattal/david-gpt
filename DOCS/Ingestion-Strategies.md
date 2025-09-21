# David-GPT Ingestion Strategies

**Version:** 1.0
**Date:** 2025-09-20

## 1. Executive Summary

This document outlines the comprehensive document ingestion strategies implemented in the David-GPT system. The system is designed to process a wide variety of document sources, including file uploads, web URLs, DOIs, arXiv IDs, and patent numbers, through both single and batch ingestion endpoints.

The core of the ingestion pipeline is a unified service that intelligently analyzes, processes, chunks, and enriches documents. It leverages a suite of external APIs for metadata extraction and content enhancement, incorporates robust fallback mechanisms to ensure high success rates, and follows a structured workflow to populate the knowledge graph and vector database. The ultimate goal is to transform raw data into a structured, searchable, and context-rich format suitable for advanced RAG applications.

## 2. Core Processing Strategies

The system utilizes a `UnifiedIngestionService` that acts as the central orchestrator for all ingestion tasks. It exposes two primary endpoints: one for single documents and one for batch processing.

### 2.1. Single Document Ingestion

- **Endpoint:** `POST /api/documents/ingest`
- **Handler:** `src/app/api/documents/ingest/route.ts`
- **Workflow:**
    1.  Accepts `multipart/form-data` (for file uploads) or `application/json`.
    2.  Handles various inputs: direct content, file buffer, URL, patent URL, or DOI.
    3.  **URL List Expansion**: Automatically detects if a provided URL or file content (e.g., a `.md` file) is a list of URLs. If so, it transparently converts the single request into a batch ingestion process.
    4.  A `processing_jobs` record is created to track the task.
    5.  A `documents` record is created in the database.
    6.  The actual processing is offloaded to a background task (`processDocumentBackground`).

### 2.2. Batch Document Ingestion

- **Endpoint:** `POST /api/documents/batch-ingest`
- **Handler:** `src/app/api/documents/batch-ingest/route.ts`
- **Workflow:**
    1.  Accepts a JSON array of `documents` to be processed. Can also handle `multipart/form-data` where files are mapped to documents via a `fileKey`.
    2.  A single `processing_jobs` record is created for the entire batch.
    3.  **URL List Expansion**: Iterates through each document in the batch and expands any that are identified as URL lists.
    4.  Processing is offloaded to `processBatchBackground`, which processes documents concurrently (with limits) or sequentially if URLs are present to avoid rate-limiting.
    5.  A `BatchProgressTracker` updates the overall progress of the batch.

## 3. API Integration Patterns

The system relies on several external services to enrich documents. These are primarily managed by the `DocumentProcessor` class in `src/lib/rag/document-processors.ts`.

| API             | Client Class      | Purpose                                                                                             |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| **Crossref**    | `CrossrefClient`  | Resolves Digital Object Identifiers (DOIs) to fetch rich academic metadata (title, authors, abstract).  |
| **GROBID**      | `GROBIDClient`    | Parses academic PDFs to extract structured data, including title, authors, affiliations, abstract, full text, sections, and references. Uses a queue for sequential processing. |
| **USPTO / EPO** | `PatentProcessor` | Fetches patent metadata from the USPTO and EPO patent office APIs.                                  |
| **Exa AI**      | `exaClient`       | The primary tool for high-quality content extraction from any given URL. It is the first choice for URL processing due to its robustness against anti-scraping measures. |
| **arXiv**       | `CrossrefClient`  | The `resolveArxiv` method fetches metadata directly from the arXiv API.                               |

## 4. Fallback Mechanisms

To maximize reliability, the ingestion pipeline incorporates several layers of fallbacks.

1.  **URL Processing**:
    - **Primary**: `exaClient` is used first.
    - **Secondary**: If Exa fails or times out, the system falls back to a standard `fetch` request with a browser-like User-Agent.
    - **Tertiary**: If a `fetch` request is blocked (e.g., HTTP 403), the system forces another attempt with `exaClient`.
    - **Final**: If all else fails and a partial result from Exa exists, that partial result is used.

2.  **PDF Processing (Academic Papers)**:
    - **Primary**: `GROBIDClient` is used to get structured text and metadata.
    - **Secondary**: If GROBID fails or returns poor-quality data, the system falls back to using `pdf-parse` to extract the raw text content.
    - **Hybrid**: If GROBID provides good metadata but no full text, the system combines the GROBID metadata with the raw text from `pdf-parse`.

3.  **DOI/arXiv PDF Download**:
    - The system attempts to construct publisher-specific PDF URLs to download the full paper.
    - If PDF download and processing (via GROBID/pdf-parse) fails, the system gracefully falls back to using only the metadata (title, abstract) fetched from Crossref or arXiv.

4.  **Content Validation**:
    - After extraction, the `validateExtractedContent` function checks if the content is meaningful (i.e., not empty, not just a URL, and not an error message).
    - If validation fails, the job is marked as failed, preventing bad data from entering the system.
    - If content is valid but short, `attemptFallbackExtraction` is triggered to try and improve it.

## 5. Data Processing Workflows

This section details the end-to-end process for different document types.

### Workflow: File Upload (PDF)

1.  User uploads a PDF file to `/api/documents/ingest`.
2.  `ingestion-service` receives the file buffer.
3.  `processDocumentBackground` is invoked.
4.  `DocumentProcessor.processPDFFile` is called.
5.  **GROBID** attempts to parse the PDF.
6.  If GROBID is successful, its structured output (title, authors, abstract, full text) is used.
7.  If not, `pdf-parse` is used as a fallback for raw text extraction.
8.  The extracted content is chunked using `createSemanticChunks`.
9.  Embeddings are generated for each chunk via `embeddingService`.
10. Entities and relationships are extracted for the knowledge graph.
11. The document metadata, processing status, and chunks are saved to the database.

### Workflow: URL Ingestion

1.  User submits a URL to `/api/documents/ingest`.
2.  `ingestion-service` invokes `processDocumentBackground`.
3.  `DocumentProcessor.processURL` is called.
4.  **Special URL Detection**:
    - If it's a known patent URL, it's routed to the patent workflow.
    - If it's an academic URL with a DOI, it's routed to the DOI workflow for enhanced PDF extraction.
5.  **Exa AI** attempts to extract the main content from the URL.
6.  If Exa fails, the system falls back to a direct `fetch`.
7.  The extracted HTML is cleaned, and text content is extracted.
8.  The content is chunked, embedded, and stored, following the same final steps as the PDF workflow.

### Workflow: URL List Ingestion (e.g., `article-list.md`)

1.  User uploads a markdown file or provides text containing a list of URLs.
2.  `preprocessUrlList` in `ingestion-service` detects that the content is a URL list with a high confidence score.
3.  The single request is converted into a `BatchIngestionRequest`. Each URL from the list becomes a separate document in the batch, with its title extracted from the markdown.
4.  The `processBatchBackground` function is invoked.
5.  Because the batch contains URLs, the documents are processed **sequentially** with a small delay to avoid rate-limiting from external sites.
6.  Each URL is processed individually using the standard URL Ingestion workflow.

## 6. Metadata Extraction

Metadata is a critical component of the ingestion pipeline and is handled at multiple stages.

1.  **Initial Extraction**: The `DocumentProcessor` uses external APIs (Crossref, GROBID, etc.) to fetch initial metadata like `title`, `authors`, `doi`, `patentNumber`, `publishedDate`, etc.

2.  **Actor Extraction**: The `extractActors` function in `ingestion-service` standardizes extracted people and organizations (authors, inventors, assignees) into a consistent `actors` JSONB object.

3.  **Metadata Chunk**: A special, non-content chunk with `chunk_type: 'metadata'` is generated by `generateMetadataChunk`. This chunk contains a human-readable summary of the most important metadata (title, actors, dates, abstract) and is embedded alongside content chunks to improve retrieval for metadata-related queries.

4.  **Final Database Structure**: The `buildDocumentUpdate` function assembles the final metadata into a generic schema for the `documents` table, utilizing JSONB columns for maximum flexibility:
    - `identifiers`: Stores unique IDs like `doi`, `patent_no`, `arxiv_id`.
    - `dates`: Stores important dates like `filed`, `granted`, `published`.
    - `actors`: Stores arrays of people and organizations involved with the document.

## 7. Implementation Details

| Class / Module                      | File Path                                       | Responsibility                                                                                             |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **UnifiedIngestionService**         | `src/lib/rag/ingestion-service.ts`              | Central orchestrator for single and batch ingestion. Manages jobs, background processing, and database records. |
| **DocumentProcessor**               | `src/lib/rag/document-processors.ts`            | Handles the specifics of processing different document types by calling the appropriate external API clients.  |
| **ingest/route**                    | `src/app/api/documents/ingest/route.ts`         | API route for single document ingestion.                                                                   |
| **batch-ingest/route**              | `src/app/api/documents/batch-ingest/route.ts`   | API route for batch document ingestion.                                                                    |
| **urlListParser**                   | `src/lib/rag/url-list-parser.ts`                | Analyzes content to detect and parse lists of URLs, enabling automatic batch conversion.                   |
| **chunking / semantic-chunking**    | `src/lib/rag/chunking.ts` / `semantic-chunking.ts` | Responsible for splitting document content into smaller, semantically meaningful chunks for embedding.       |
| **embeddingService**                | `src/lib/rag/embeddings.ts`                     | Generates vector embeddings for document chunks using the configured provider (e.g., OpenAI).              |
| **entity-extraction**               | `src/lib/rag/entity-extraction.ts`              | Extracts entities and relationships from chunks to build the knowledge graph.                              |

## 8. Future Agent Integration

The existing ingestion infrastructure is well-suited for integration with autonomous agents. An agent can leverage these strategies by making calls to the existing HTTP endpoints.

**Proposed Agent-Facing Functions:**

An agent could be equipped with tools that wrap these API calls:

1.  **`ingest_single_document`**: A function that takes a source type (`url`, `doi`, `file`) and an identifier or content.

    ```python
    # Example agent tool
    def ingest_single_document(source_type: str, identifier: str, title: str = None, file_content_b64: str = None):
        """
        Ingests a single document into the knowledge base.

        :param source_type: Type of the source, e.g., 'url', 'doi', 'patent', 'file'.
        :param identifier: The URL, DOI, patent number, or file name.
        :param title: Optional title for the document.
        :param file_content_b64: Base64-encoded content if source_type is 'file'.
        """
        # ... constructs and sends a POST request to /api/documents/ingest
        pass
    ```

2.  **`ingest_document_batch`**: A function that takes a list of documents to ingest.

    ```python
    # Example agent tool
    def ingest_document_batch(documents: list, batch_description: str):
        """
        Ingests a batch of documents.

        :param documents: A list of dictionaries, where each dict represents a document
                          (e.g., {'title': 'My Doc', 'metadata': {'sourceUrl': 'http://...'}}).
        :param batch_description: A description for the batch job.
        """
        # ... constructs and sends a POST request to /api/documents/batch-ingest
        pass
    ```

By using this documentation, a future agent can understand the parameters required for these functions and the underlying workflows that will be triggered, allowing it to intelligently add new knowledge to the David-GPT system.