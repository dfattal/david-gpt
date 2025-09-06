# Comprehensive E2E Multi-Turn Chat Testing Plan

## Test Strategy Overview

**Objective**: Validate context management, sequential RAG retrieval, and KG-enhanced search across complex multi-turn conversations without relying on pre-trained knowledge.

**Validation Points**:
- Context carry-over and decay (3-turn TTL)
- Relationship-aware query expansion
- Citation accuracy and persistence
- Turn classification (new-topic, drill-down, compare, same-sources)
- Response modes (FACT, EXPLAIN, CONFLICTS)
- No hallucination - only corpus-backed answers

## Test Suite Design

### Phase 1: Foundation Validation
**Goal**: Verify basic RAG functionality and citation accuracy

#### Test Case 1.1: Single-Turn Citation Accuracy
**Query**: "Who are the inventors of the multi-view display patent?"
**Expected**:
- RAG search triggered
- Patent-specific search with structured metadata
- Precise inventor names with [A1] citations
- No pre-trained knowledge used

#### Test Case 1.2: Relationship-Aware Enhancement  
**Query**: "Tell me about Leia technology"
**Expected**:
- Entity detection: "Leia Inc"
- Query expansion: "Leia technology OR lightfield OR head tracking"
- Results include both direct and relationship-connected documents
- Higher relevance for "Multi-view display with head tracking" patent

#### Test Case 1.3: Knowledge Graph Boundary Testing
**Query**: "What is iPhone?" (outside corpus)
**Expected**:
- No RAG trigger (no corpus match)
- LLM general knowledge response with uncertainty acknowledgment
- No citations or confident claims

### Phase 2: Multi-Turn Context Management
**Goal**: Validate context carry-over, decay, and turn classification

#### Test Case 2.1: Drill-Down Conversation
```
Turn 1: "What is lightfield technology?"
Expected: new-topic, comprehensive EXPLAIN mode, establish context sources

Turn 2: "How does Leia implement this?"
Expected: drill-down, carry-over sources, relationship traversal to Leia Inc

Turn 3: "What devices use this technology?"
Expected: same-sources, Android connection via KG relationships

Turn 4: "Tell me about CAT3D paper"
Expected: new-topic, context reset, fresh sources
```

#### Test Case 2.2: Comparison Testing
```
Turn 1: "Explain head tracking in displays"
Expected: Sources from multi-view display patent + notes

Turn 2: "How is this different from traditional 3D displays?"
Expected: compare mode, contrast head tracking vs traditional methods

Turn 3: "Which approach is better?"
Expected: CONFLICTS mode if multiple sources, authority-based ranking
```

#### Test Case 2.3: Source Decay Validation
```
Turn 1: "What is Leia Image Format?"
Turn 2: "How does it relate to video format?" (drill-down)
Turn 3: "What compression does it use?" (drill-down)
Turn 4: "Tell me about Android displays" (new-topic)
Expected: Sources from turns 1-3 should decay, turn 4 gets fresh sources
```

### Phase 3: Knowledge Graph Enhanced Retrieval
**Goal**: Validate relationship traversal and entity-based search enhancement

#### Test Case 3.1: Multi-Hop Relationship Traversal
```
Turn 1: "What technologies does Leia Inc develop?"
Expected: Direct "implements" relationships → lightfield, head tracking

Turn 2: "What products use these technologies?"
Expected: 2-hop traversal → Android via lightfield/OLED connections

Turn 3: "How do these connect to 3D reconstruction?"
Expected: head tracking → 3D reconstruction relationship
```

#### Test Case 3.2: Entity Disambiguation
```
Turn 1: "Tell me about Android displays"
Expected: Entity resolution, product context from corpus

Turn 2: "How do OLED displays work in Android?"
Expected: OLED + Android relationship context, technical details from corpus
```

#### Test Case 3.3: Timeline and Authority Ranking
```
Turn 1: "When was the multi-view display patent filed?"
Expected: Structured metadata query, exact dates with citations

Turn 2: "What came after this patent?"
Expected: Timeline queries, supersede relationships if available
```

### Phase 4: Response Mode Validation
**Goal**: Test FACT, EXPLAIN, and CONFLICTS modes with appropriate source handling

#### Test Case 4.1: FACT Mode Testing
```
Query: "What is the patent number for Leia's head tracking display?"
Expected:
- FACT mode activation
- Structured metadata query
- Precise patent number with [A1] citation
- No explanatory context
```

#### Test Case 4.2: EXPLAIN Mode Testing  
```
Query: "How does lightfield display technology work?"
Expected:
- EXPLAIN mode with 8-10 chunks
- Technical depth from corpus documents
- Supporting evidence from multiple sources
- Relationship context if available
```

#### Test Case 4.3: CONFLICTS Mode Testing
```
Query: "What are the different approaches to 3D displays?"
Expected:
- Multiple source comparison
- Authority ranking (patents > notes)
- Clear source attribution for each approach
- No synthesis beyond corpus content
```

### Phase 5: Edge Cases and Robustness
**Goal**: Validate system behavior at boundaries and error conditions

#### Test Case 5.1: Out-of-Corpus Queries
```
Turn 1: "What is quantum computing?" (outside corpus)
Expected: General knowledge response, uncertainty acknowledgment

Turn 2: "How does this relate to Leia displays?" (mixed)
Expected: No false connections, acknowledge lack of corpus evidence
```

#### Test Case 5.2: Ambiguous Entity References
```
Turn 1: "Tell me about the display patent"
Expected: Disambiguation request or best-match with confidence level

Turn 2: "The one with head tracking"
Expected: Context resolution to correct patent
```

#### Test Case 5.3: Citation Persistence Validation
```
Long conversation (5+ turns) with multiple source transitions
Validation:
- Citation IDs remain stable within conversation
- Database persistence of message_citations
- Accurate fact summaries for each citation
```

## Success Criteria

### Context Management
✅ **Pass**: Sources carry over appropriately for drill-down/same-sources turns
✅ **Pass**: Context resets for new-topic turns
✅ **Pass**: Source decay after 3 turns for non-pinned sources
✅ **Pass**: Turn classification accuracy >90%

### RAG Retrieval Quality
✅ **Pass**: Citations provide exact source attribution
✅ **Pass**: No hallucinations - only corpus-supported claims
✅ **Pass**: Relationship expansion improves result relevance
✅ **Pass**: Response mode selection matches query intent

### Knowledge Graph Enhancement
✅ **Pass**: Entity detection and query expansion working
✅ **Pass**: Relationship traversal provides contextual enrichment
✅ **Pass**: Authority ranking respects source reliability
✅ **Pass**: Timeline queries return accurate temporal information

### Robustness
✅ **Pass**: Graceful handling of out-of-corpus queries
✅ **Pass**: No false knowledge connections
✅ **Pass**: Consistent citation behavior across long conversations
✅ **Pass**: Performance <3s per turn including KG enhancement

## Testing Implementation Strategy

1. **Automated Test Harness**: Scripts that execute conversation flows via API
2. **Validation Framework**: Assert citation accuracy, context carry-over, KG enhancement
3. **Performance Monitoring**: Response times, search quality metrics
4. **Manual Verification**: Human review of complex multi-turn scenarios

This plan ensures comprehensive validation without relying on external knowledge while thoroughly testing the sophisticated RAG + KG system in realistic conversation scenarios.