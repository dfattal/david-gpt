# Document Hierarchy Awareness Enhancement for RAG Retrieval

## Current State Analysis

The existing three-tier search system (`three-tier-search.ts`, `search-tools.ts`) provides good basic retrieval but lacks comprehensive document hierarchy awareness that would significantly improve result relevance and citation accuracy.

### Current Capabilities:
- ✅ Three-tier search (SQL, Vector, Content)
- ✅ Basic document type filtering
- ✅ Section title awareness in chunks
- ✅ Document-level metadata filtering

### Missing Hierarchy Awareness:
- ❌ Section-level retrieval and ranking
- ❌ Document structure understanding
- ❌ Hierarchical result organization
- ❌ Cross-document relationship awareness
- ❌ Strategic extraction chunk handling

## Enhanced Document Hierarchy Awareness Strategy

### Phase 3.2: Core Document Hierarchy Improvements

#### 1. Enhanced Chunk Metadata with Hierarchy Information
```typescript
interface HierarchicalChunkMetadata {
  // Document hierarchy
  document_structure: {
    total_sections: number;
    section_depth: number;
    section_path: string[]; // ["Introduction", "3D Display Technology", "Lenticular Arrays"]
    section_index: number;
    is_abstract: boolean;
    is_conclusion: boolean;
    is_methodology: boolean;
  };

  // Content hierarchy
  content_hierarchy: {
    chunk_type: 'content' | 'metadata' | 'summary' | 'strategic_extract';
    extraction_strategy: 'complete' | 'structured' | 'strategic';
    content_completeness: 'full' | 'summary' | 'highlight';
    original_section_length?: number; // For strategic extracts
  };

  // Cross-document relationships
  cross_references: {
    cited_by: string[]; // Document IDs that cite this content
    cites: string[]; // Document IDs this content cites
    related_patents: string[]; // Related patent families
    author_works: string[]; // Other works by same authors
  };

  // Technical hierarchy
  technical_context: {
    technology_stack: string[]; // ["3D Display", "Lenticular", "Eye Tracking"]
    product_family: string[]; // ["Samsung Odyssey", "3D Monitor", "Gaming Display"]
    chronological_position: number; // 0-1 scale within document timeline
  };
}
```

#### 2. Section-Aware Retrieval Enhancement
```typescript
interface SectionAwareSearchResult extends SearchResult {
  section_hierarchy: {
    section_title: string;
    section_type: 'abstract' | 'introduction' | 'methods' | 'results' | 'claims' | 'references';
    section_depth: number;
    section_path: string[];
    section_completeness: 'full' | 'partial' | 'summary';
  };

  document_context: {
    total_document_relevance: number; // How relevant is the entire document
    section_relevance: number; // How relevant is this specific section
    cross_section_matches: number; // How many other sections in doc match query
  };

  hierarchy_score: {
    content_authority: number; // Is this from a key section (abstract, conclusion)?
    extraction_quality: number; // Complete vs strategic vs summary
    structural_importance: number; // Position and type importance in document
  };
}
```

#### 3. Hierarchical Query Routing Enhancement
```typescript
// Enhanced query classification with hierarchy awareness
function classifyHierarchicalQuery(query: string): HierarchicalQueryClassification {
  const classification = classifySearchQuery(query); // Existing classification

  // Add section-specific routing
  const sectionTargeting = detectSectionTargeting(query);
  const documentStructureNeeds = analyzeStructureNeeds(query);
  const hierarchyRequirements = determineHierarchyRequirements(query);

  return {
    ...classification,
    hierarchy_intent: {
      target_sections: sectionTargeting.sections,
      structure_preference: documentStructureNeeds.preference,
      cross_document_relationships: hierarchyRequirements.relationships,
      extraction_depth_required: hierarchyRequirements.depth
    }
  };
}

function detectSectionTargeting(query: string): { sections: string[], confidence: number } {
  const sectionPatterns = {
    abstract: /\b(abstract|summary|overview)\b/i,
    methodology: /\b(method|approach|implementation|procedure|technique)\b/i,
    results: /\b(result|finding|data|analysis|measurement|performance)\b/i,
    claims: /\b(claim|patent claim|invention)\b/i,
    conclusion: /\b(conclusion|discussion|implication|future work)\b/i,
    technical: /\b(specification|technical detail|parameter|formula)\b/i
  };

  const targetSections: string[] = [];
  let totalConfidence = 0;

  for (const [section, pattern] of Object.entries(sectionPatterns)) {
    if (pattern.test(query)) {
      targetSections.push(section);
      totalConfidence += 0.8;
    }
  }

  return {
    sections: targetSections,
    confidence: Math.min(totalConfidence, 1.0)
  };
}
```

#### 4. Strategic Extract Handling
```typescript
interface StrategyAwareRetrievalConfig {
  // Handle chunks from strategic extraction differently
  strategic_chunk_boosting: {
    key_sections_boost: number; // 1.5x for abstract, conclusion
    summary_quality_boost: number; // 1.3x for high-quality summaries
    citation_preservation_boost: number; // 1.4x for chunks with citations
  };

  // Fallback to full document when needed
  fallback_triggers: {
    insufficient_strategic_content: boolean;
    low_confidence_threshold: number; // 0.6
    user_requests_detail: boolean;
  };

  // Cross-reference enhancement
  relationship_awareness: {
    author_network_boosting: boolean;
    patent_family_linking: boolean;
    temporal_sequence_awareness: boolean;
    technology_genealogy_tracking: boolean;
  };
}

// Enhanced retrieval with strategic extract awareness
async function hierarchyAwareRetrieval(
  query: string,
  hierarchyConfig: StrategyAwareRetrievalConfig
): Promise<HierarchicalSearchResult> {

  // 1. Classify query for hierarchy requirements
  const queryClassification = classifyHierarchicalQuery(query);

  // 2. Execute tiered search with hierarchy awareness
  const baseResults = await threeTierSearch(query, supabaseClient, {
    hierarchy_aware: true,
    section_targeting: queryClassification.hierarchy_intent.target_sections,
    extraction_quality_preference: queryClassification.hierarchy_intent.extraction_depth_required
  });

  // 3. Apply hierarchy-aware result enhancement
  const enhancedResults = await enhanceResultsWithHierarchy(
    baseResults.results,
    queryClassification,
    hierarchyConfig
  );

  // 4. Apply strategic extract handling
  const strategyAwareResults = await handleStrategicExtracts(
    enhancedResults,
    queryClassification,
    hierarchyConfig
  );

  // 5. Generate hierarchy-aware citations
  const hierarchicalCitations = generateHierarchicalCitations(strategyAwareResults);

  return {
    ...baseResults,
    results: strategyAwareResults,
    hierarchy_metadata: {
      section_coverage: calculateSectionCoverage(strategyAwareResults),
      document_structure_alignment: assessStructureAlignment(strategyAwareResults),
      cross_document_relationships: identifyRelationships(strategyAwareResults),
      extraction_quality_distribution: analyzeExtractionQuality(strategyAwareResults)
    },
    citations: hierarchicalCitations
  };
}
```

#### 5. Cross-Document Relationship Enhancement
```typescript
interface CrossDocumentRelationships {
  // Citation networks
  citation_graph: {
    incoming_citations: Array<{
      source_document_id: string;
      source_section: string;
      citation_context: string;
      citation_strength: number;
    }>;
    outgoing_citations: Array<{
      target_document_id: string;
      target_section: string;
      citation_context: string;
    }>;
  };

  // Author networks
  author_connections: {
    collaborative_works: string[];
    individual_works: string[];
    author_authority_score: number;
  };

  // Technology genealogy
  technology_evolution: {
    predecessor_technologies: string[];
    successor_technologies: string[];
    parallel_developments: string[];
    technology_maturity_score: number;
  };

  // Patent families
  patent_relationships: {
    parent_patents: string[];
    continuation_patents: string[];
    divisional_patents: string[];
    related_applications: string[];
  };
}

// Implementation for cross-document relationship enhancement
async function enhanceWithCrossDocumentRelationships(
  results: SearchResult[],
  supabaseClient: SupabaseClient
): Promise<SearchResult[]> {

  const enhancedResults: SearchResult[] = [];

  for (const result of results) {
    // 1. Fetch citation relationships
    const citationRelationships = await fetchCitationRelationships(
      result.documentId,
      supabaseClient
    );

    // 2. Identify author networks
    const authorConnections = await identifyAuthorNetworks(
      result.documentId,
      supabaseClient
    );

    // 3. Map technology evolution
    const technologyContext = await mapTechnologyEvolution(
      result.documentId,
      result.content,
      supabaseClient
    );

    // 4. Link patent families
    const patentRelationships = await linkPatentFamilies(
      result.documentId,
      supabaseClient
    );

    enhancedResults.push({
      ...result,
      cross_document_relationships: {
        citation_graph: citationRelationships,
        author_connections: authorConnections,
        technology_evolution: technologyContext,
        patent_relationships: patentRelationships
      },
      hierarchy_score: calculateHierarchyScore(result, {
        citationRelationships,
        authorConnections,
        technologyContext,
        patentRelationships
      })
    });
  }

  return enhancedResults;
}
```

#### 6. Hierarchical Result Ranking Algorithm
```typescript
function calculateHierarchicalRelevanceScore(
  result: SearchResult,
  query: string,
  hierarchyConfig: StrategyAwareRetrievalConfig
): number {

  let baseScore = result.score || 0;

  // 1. Section authority boosting
  const sectionAuthorityMultiplier = getSectionAuthorityMultiplier(
    result.section_hierarchy?.section_type,
    hierarchyConfig
  );
  baseScore *= sectionAuthorityMultiplier;

  // 2. Extraction quality boosting
  const extractionQualityMultiplier = getExtractionQualityMultiplier(
    result.content_hierarchy?.extraction_strategy,
    result.content_hierarchy?.content_completeness,
    hierarchyConfig
  );
  baseScore *= extractionQualityMultiplier;

  // 3. Cross-document relationship boosting
  const relationshipScore = calculateRelationshipScore(
    result.cross_document_relationships,
    hierarchyConfig
  );
  baseScore += relationshipScore * 0.2; // 20% boost from relationships

  // 4. Document structure alignment
  const structureAlignmentScore = assessStructureAlignment(
    result,
    query,
    hierarchyConfig
  );
  baseScore += structureAlignmentScore * 0.15; // 15% boost from structure alignment

  // 5. Citation preservation bonus
  const citationPreservationBonus = calculateCitationPreservationBonus(
    result,
    hierarchyConfig
  );
  baseScore += citationPreservationBonus * 0.1; // 10% bonus for citation preservation

  return Math.min(baseScore, 1.0); // Cap at 1.0
}

function getSectionAuthorityMultiplier(
  sectionType: string | undefined,
  config: StrategyAwareRetrievalConfig
): number {
  const authorityMap = {
    'abstract': 1.5,      // High authority - document summary
    'conclusion': 1.4,    // High authority - key findings
    'results': 1.3,       // High authority - core data
    'claims': 1.3,        // High authority - for patents
    'introduction': 1.2,  // Medium authority - context
    'methods': 1.1,       // Medium authority - technical details
    'references': 1.0,    // Standard authority
    'content': 1.0        // Standard authority - general content
  };

  return authorityMap[sectionType || 'content'] || 1.0;
}
```

### Expected Improvements

#### 1. Enhanced Citation Accuracy
- **Section-specific citations**: "According to the Results section of the Nature Photonics paper..."
- **Extraction quality indication**: "From the strategic summary of the Samsung patent claims..."
- **Cross-document validation**: "This finding is supported by related work from the same research group..."

#### 2. Improved Query Routing
- **Section targeting**: Route methodology questions directly to Methods sections
- **Structure awareness**: Understand when users need complete vs summary information
- **Relationship leveraging**: Surface related documents through citation and author networks

#### 3. Better Result Quality
- **Authority-based ranking**: Prioritize authoritative sections (abstracts, conclusions)
- **Completeness awareness**: Flag when content is from strategic extraction vs complete
- **Context preservation**: Maintain document structure context in results

#### 4. Strategic Extract Integration
- **Quality indication**: Mark chunks as complete, structured, or strategic extracts
- **Fallback mechanisms**: Route to full document when strategic extract insufficient
- **Citation preservation**: Maintain reference integrity across extraction strategies

### Implementation Roadmap

1. **Phase 3.2a**: Enhanced chunk metadata with hierarchy information
2. **Phase 3.2b**: Section-aware retrieval and ranking algorithms
3. **Phase 3.2c**: Cross-document relationship mapping and enhancement
4. **Phase 3.2d**: Strategic extract handling and fallback mechanisms
5. **Phase 3.2e**: Hierarchical citation generation and quality metrics

This enhancement maintains the three-tier search architecture while adding comprehensive document hierarchy awareness that significantly improves retrieval accuracy and user experience.