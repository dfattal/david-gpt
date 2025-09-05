# Mini-KG Specification

**Approach**: Pragmatic structured data using Postgres tables + thin edges table  
**Goal**: Boost retrieval quality without full knowledge graph complexity

## Database Schema

### Core Tables

```sql
-- Entity types: person, organization, product, technology, component, document, dataset
entities(id, name, kind)

-- Handle name variations (e.g., "J. K. Rowling" vs "Joanne Rowling")
aliases(entity_id, alias)

-- Document metadata with authoritative IDs
documents(id, title, doc_type, doi, patent_no, grant_no, raw_date, iso_date, status, canonical_of, superseded_by)

-- Timeline events for temporal queries
events(doc_id, type, date, authority)
-- Types: filed, published, granted, expires, product_launch

-- Relationship edges (the "mini" in mini-KG)
edges(src_id, src_type, rel, dst_id, dst_type, weight)
```

### Relationship Types

- **author_of**: person → document
- **inventor_of**: person → document(type=patent)
- **assignee_of**: organization → document(type=patent)
- **contributor_to**: person → document (general purpose, non-author roles)
- **affiliated_with**: person → organization
- **belongs_to**: person → organization (team membership)
- **implements**: technology → product
- **uses_component**: product → component (replaces prior "used_in")
- **part_of**: component → product
- **documents**: document → (product | technology | component) (specs, design docs, app notes)
- **cites**: document → document
- **supersedes**: document → document
- **uses_dataset**: (document | technology) → dataset
- **owned_by**: dataset → organization

## Enhanced Retrieval Strategy

### Filter/Boost
- Exact author/inventor/assignee matches get priority
- Prefer newest documents via `supersedes` relationships
- Journal publications > preprints (authority-based ranking)

### Disambiguation
- Resolve entity names through `aliases` table
- Constrain searches by entity `kind` (person vs org vs product)

### Query Expansion
- **Product queries**: Pull linked technology papers and patents
- **Algorithm queries**: Pull related products and implementation patents
- **Person queries**: Include all their authored/invented works

### Timeline Queries
- Answer temporal questions from `events` table first
- Cite the governing document as source
- Handle patent lifecycle: filed → published → granted → expires

## Response Generation Modes

### FACT Mode
1. Check structured fields first: authors, dates, patent numbers, status
2. Only fallback to text chunks if structured data missing
3. Prioritize authoritative metadata over extracted text

### EXPLAIN Mode  
1. Use top 3-5 reranked text chunks for detailed explanations
2. Add 1-hop supporting context from `edges` table
3. Example: "This paper's method → used in Product X" via relationship traversal

### CONFLICTS Mode
1. Sort conflicting information by authority and date
2. Surface both versions to user
3. Pick newest/most authoritative with clear explanation
4. Example: "Patent superseded by newer filing in 2023"

## Document Processing Strategy

### Google Patents URL Processing
- **Input**: Google Patents URLs (e.g., https://patents.google.com/patent/US11281020)
- **Extraction Method**: JSON-LD structured data parsing (no PDF downloads)
- **Benefits**: Rich metadata including inventors, assignees, claims, related patents
- **Data Extracted**: Patent number, title, abstract, filing/publication dates, inventor names, assignee organizations

### Document Types Supported
1. **Academic Papers**: PDFs, DOI/arXiv links
2. **Patents**: Google Patents URLs (JSON-LD extraction)
3. **Documents**: Markdown files, notes
4. **Web Sources**: URLs with metadata extraction

## Implementation Priority
1. Design and create database schema ✅ COMPLETED
2. Update entity types to 7-type taxonomy (person, organization, product, technology, component, document, dataset)
3. Implement Google Patents JSON-LD extraction pipeline
4. Build entity extraction pipeline for document ingestion
5. Implement relationship detection and edge creation
6. Enhance hybrid search with mini-KG filters/boosts
7. Add response mode logic to chat API