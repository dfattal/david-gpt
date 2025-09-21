# Multi-Turn Conversation Context Strategy

**Goal**: Fresh-first, carry-smart, summarize-always  
**Principle**: Maintain intelligent context across conversation turns without degrading accuracy

## Turn Classification & Retrieval Flow

### 1. Intent Classification (Cheap)
Classify each turn as:
- **new-topic**: Fresh subject, clear context
- **drill-down**: Deeper into current topic  
- **compare**: Comparing entities/concepts
- **same-sources**: Continuing with established sources

### 2. Fresh Retrieval Every Turn
- Always perform fresh BM25 + vector search
- Retrieve N=40 candidates from full corpus
- Don't rely solely on carried context

### 3. Selective Carry-Over Strategy
- Re-score previous turn's sources against current query
- Keep sources with score ≥ threshold (τ) OR pinned sources
- Apply decay to carry scores per turn (multiply by 0.7)
- Drop sources after 3 inactive turns

### 4. Mini-KG Expansion (Optional)
- If entities repeat across turns, pull 1-hop neighbors
- Keep expansion small and capped to avoid noise
- Use edges table for targeted relationship traversal

### 5. Deduplication Before Rerank
- **Canonicalize**: (doc_id, normalized_page_range)
- **Drop twins**: Remove exact duplicates
- **Collapse adjacent**: Merge adjacent chunks from same doc, keep stronger one

### 6. Late & Small Reranking
- Apply RRF (Reciprocal Rank Fusion) to combined results
- Rerank top 40 candidates with cross-encoder
- Final selection: top 8-10 sources for response

### 7. Fact Summarization
- Extract 2 key bullets per source
- Add date + stable citation IDs (e.g., [A1], [B2])
- Create per-message fact sheet for next turn reuse
- Store compact summaries, not full text

### 8. Pin & TTL Management
- Allow user to pin important sources
- Auto-decay unpinned sources (score × 0.7 per turn)
- Remove sources after 3 turns of inactivity
- Maintain conversation-level source memory

### 9. Render & Persist
- Stream response with live citation markers
- Store normalized citations for auditing
- Maintain conversation history with source tracking

## Database Schema Requirements

### Conversation Source Tracking
```sql
conversation_sources(
  conversation_id, 
  doc_id, 
  last_used_at, 
  carry_score, 
  pinned boolean
)
```

### Message Citation Storage  
```sql
message_citations(
  message_id, 
  doc_id, 
  chunk_id, 
  marker, -- e.g., [A1], [B2]
  fact_summary
)
```

### Document Identity Normalization
- Canonical URL for web sources
- Stable storage path for uploaded docs  
- Document version tracking for updates

## Implementation Priority
1. Build turn classification logic
2. Implement carry-over scoring system
3. Create conversation source tracking tables
4. Add deduplication and collapse logic
5. Integrate with existing hybrid search pipeline
6. Build fact summarization and citation persistence