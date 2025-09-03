# Mini-KG Specification

**Approach**: Pragmatic structured data using Postgres tables + thin edges table  
**Goal**: Boost retrieval quality without full knowledge graph complexity

## Database Schema

### Core Tables

```sql
-- Entity types: person, org, product, algorithm, material
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

- **author_of**: person → paper
- **inventor_of**: person → patent  
- **assignee_of**: org → patent
- **implements**: doc → algorithm
- **used_in**: algorithm/material → product
- **supersedes**: doc → doc

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

## Implementation Priority
1. Design and create database schema
2. Build entity extraction pipeline for document ingestion
3. Implement relationship detection and edge creation
4. Enhance hybrid search with mini-KG filters/boosts
5. Add response mode logic to chat API