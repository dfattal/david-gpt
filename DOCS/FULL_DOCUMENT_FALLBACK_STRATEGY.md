# Full Document Fallback Strategy for RAG Quality Preservation

## Problem Statement

With the new intelligent content stratification approach, some documents use strategic extraction (summaries) instead of complete content extraction. While this improves processing efficiency, there are scenarios where strategic extracts lack sufficient detail to properly answer user queries, potentially degrading RAG quality.

## Fallback Strategy Overview

Implement intelligent fallback mechanisms that detect when strategic extracts are insufficient and seamlessly route queries to full document content while maintaining response quality and system efficiency.

### Phase 3.3: Full Document Fallback Implementation

#### 1. Insufficient Content Detection
```typescript
interface ContentSufficiencyAnalysis {
  trigger_conditions: {
    low_confidence_threshold: number; // < 0.6 confidence in initial results
    insufficient_detail_detected: boolean; // Query requires specifics not in summary
    user_requests_detail: boolean; // Explicit request for more detail
    technical_specification_needed: boolean; // Query requires technical specs
    citation_detail_required: boolean; // Query needs specific citations/references
  };

  content_quality_metrics: {
    information_density: number; // 0-1 scale of how much detail is available
    query_coverage: number; // 0-1 scale of how well summary covers query
    technical_depth: number; // 0-1 scale of technical detail available
    citation_completeness: number; // 0-1 scale of citation detail preserved
  };

  fallback_recommendation: {
    should_fallback: boolean;
    fallback_type: 'full_document' | 'targeted_sections' | 'hybrid_approach';
    confidence: number;
    reasoning: string[];
  };
}

// Detect when strategic extracts are insufficient
function analyzeContentSufficiency(
  query: string,
  initialResults: SearchResult[],
  userIntent: QueryIntent
): ContentSufficiencyAnalysis {

  // 1. Analyze query complexity and detail requirements
  const queryComplexity = analyzeQueryComplexity(query, userIntent);

  // 2. Assess available content quality in results
  const contentQuality = assessAvailableContentQuality(initialResults);

  // 3. Check for explicit detail requirements
  const detailRequirements = detectDetailRequirements(query, userIntent);

  // 4. Evaluate result confidence and coverage
  const resultQuality = evaluateResultQuality(initialResults, query);

  return {
    trigger_conditions: {
      low_confidence_threshold: resultQuality.averageConfidence < 0.6,
      insufficient_detail_detected: queryComplexity.detailLevel > contentQuality.detailLevel,
      user_requests_detail: detailRequirements.explicitDetailRequest,
      technical_specification_needed: detailRequirements.technicalSpecs,
      citation_detail_required: detailRequirements.citationDetails
    },
    content_quality_metrics: {
      information_density: contentQuality.informationDensity,
      query_coverage: calculateQueryCoverage(query, initialResults),
      technical_depth: contentQuality.technicalDepth,
      citation_completeness: contentQuality.citationCompleteness
    },
    fallback_recommendation: generateFallbackRecommendation(
      queryComplexity,
      contentQuality,
      detailRequirements,
      resultQuality
    )
  };
}
```

#### 2. Smart Fallback Routing
```typescript
interface FallbackStrategy {
  // Full document access
  full_document_access: {
    source_url: string;
    extraction_method: 'stored_full_content' | 'dynamic_reextraction' | 'original_source';
    content_location: 'database' | 'file_storage' | 'external_api';
    access_priority: number; // 1-3, lower is higher priority
  };

  // Targeted section retrieval
  targeted_sections: {
    required_sections: string[]; // Specific sections needed for query
    section_priorities: Record<string, number>; // Section importance for this query
    extraction_depth: 'complete' | 'enhanced_summary' | 'key_excerpts';
  };

  // Hybrid approach
  hybrid_strategy: {
    summary_context: boolean; // Keep summary for context
    detailed_sections: string[]; // Add full sections for specific areas
    citation_enhancement: boolean; // Add complete citations
    technical_detail_boost: boolean; // Enhance technical specifications
  };
}

// Smart routing to appropriate fallback strategy
async function executeFallbackStrategy(
  query: string,
  initialResults: SearchResult[],
  sufficiencyAnalysis: ContentSufficiencyAnalysis,
  supabaseClient: SupabaseClient
): Promise<FallbackSearchResult> {

  const fallbackType = sufficiencyAnalysis.fallback_recommendation.fallback_type;

  switch (fallbackType) {
    case 'full_document':
      return await executeFullDocumentFallback(query, initialResults, supabaseClient);

    case 'targeted_sections':
      return await executeTargetedSectionFallback(query, initialResults, supabaseClient);

    case 'hybrid_approach':
      return await executeHybridFallback(query, initialResults, supabaseClient);

    default:
      return {
        success: false,
        message: 'Unknown fallback strategy',
        results: initialResults,
        fallback_used: false
      };
  }
}
```

#### 3. Full Document Retrieval Implementation
```typescript
interface FullDocumentRetrieval {
  // Document access methods
  access_methods: {
    database_full_content: boolean; // Full content stored in database
    file_storage_access: boolean; // Original files in storage
    dynamic_reextraction: boolean; // Re-extract using MCP tools
    source_url_access: boolean; // Access original source
  };

  // Content enhancement
  content_processing: {
    maintain_chunk_boundaries: boolean; // Keep chunk structure for citations
    enhance_with_metadata: boolean; // Add complete metadata context
    preserve_extraction_quality: boolean; // Mark as full vs strategic extract
    citation_link_preservation: boolean; // Maintain all citation links
  };

  // Performance optimization
  optimization: {
    cache_full_content: boolean; // Cache for future queries
    selective_retrieval: boolean; // Only retrieve needed sections
    parallel_processing: boolean; // Process multiple documents in parallel
    response_streaming: boolean; // Stream results as they become available
  };
}

// Execute full document fallback
async function executeFullDocumentFallback(
  query: string,
  initialResults: SearchResult[],
  supabaseClient: SupabaseClient
): Promise<FallbackSearchResult> {

  console.log(`🔄 Executing full document fallback for ${initialResults.length} documents`);

  const enhancedResults: SearchResult[] = [];
  const fallbackMetrics = {
    documents_enhanced: 0,
    content_expansion_ratio: 0,
    processing_time: 0,
    access_methods_used: []
  };

  const startTime = Date.now();

  for (const result of initialResults) {
    try {
      // 1. Determine best access method for full content
      const accessMethod = await determineFullContentAccessMethod(
        result.documentId,
        supabaseClient
      );

      // 2. Retrieve full document content
      const fullContent = await retrieveFullDocumentContent(
        result.documentId,
        accessMethod,
        supabaseClient
      );

      if (fullContent.success) {
        // 3. Find relevant sections within full content
        const relevantSections = await findRelevantSectionsInFullDocument(
          query,
          fullContent.content,
          fullContent.structure
        );

        // 4. Enhance result with full content context
        const enhancedResult = await enhanceResultWithFullContent(
          result,
          relevantSections,
          fullContent.metadata
        );

        enhancedResults.push(enhancedResult);
        fallbackMetrics.documents_enhanced++;
        fallbackMetrics.access_methods_used.push(accessMethod.type);

        console.log(`✅ Enhanced result for ${result.title} using ${accessMethod.type}`);
      } else {
        // Fallback failed, keep original result
        enhancedResults.push({
          ...result,
          fallback_status: 'failed',
          fallback_error: fullContent.error
        });
        console.log(`❌ Full content fallback failed for ${result.title}: ${fullContent.error}`);
      }

    } catch (error) {
      console.error(`Error in full document fallback for ${result.documentId}:`, error);
      enhancedResults.push({
        ...result,
        fallback_status: 'error',
        fallback_error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  fallbackMetrics.processing_time = Date.now() - startTime;
  fallbackMetrics.content_expansion_ratio = calculateContentExpansionRatio(
    initialResults,
    enhancedResults
  );

  return {
    success: true,
    message: `Enhanced ${fallbackMetrics.documents_enhanced}/${initialResults.length} documents with full content`,
    results: enhancedResults,
    fallback_used: true,
    fallback_type: 'full_document',
    fallback_metrics: fallbackMetrics
  };
}
```

#### 4. Dynamic Content Re-extraction
```typescript
interface DynamicReextractionConfig {
  // MCP tool configuration
  extraction_tools: {
    gemini_mcp: {
      enabled: boolean;
      model: 'gemini-2.5-pro';
      extraction_strategy: 'complete' | 'targeted';
      max_retries: number;
    };
    exa_mcp: {
      enabled: boolean;
      max_characters: number;
      fallback_enabled: boolean;
    };
  };

  // Content targeting
  content_focus: {
    query_specific_sections: boolean; // Target sections relevant to query
    technical_detail_enhancement: boolean; // Focus on technical specifications
    citation_preservation: boolean; // Ensure all citations are extracted
    methodology_detail: boolean; // Include detailed methodology if needed
  };

  // Quality assurance
  quality_validation: {
    minimum_content_threshold: number; // Minimum content length required
    technical_accuracy_check: boolean; // Validate technical content
    citation_integrity_check: boolean; // Verify citation completeness
    comparison_with_summary: boolean; // Compare with existing summary
  };
}

// Dynamic re-extraction using MCP tools
async function performDynamicReextraction(
  documentId: string,
  sourceUrl: string,
  query: string,
  config: DynamicReextractionConfig
): Promise<ReextractionResult> {

  console.log(`🔄 Performing dynamic re-extraction for document ${documentId}`);

  try {
    // 1. Determine extraction strategy based on query needs
    const extractionStrategy = determineExtractionStrategy(query, config);

    // 2. Choose best MCP tool for re-extraction
    const toolChoice = selectOptimalMCPTool(sourceUrl, extractionStrategy, config);

    // 3. Execute targeted re-extraction
    let reextractionResult: MCPExtractionResult;

    if (toolChoice.tool === 'gemini_mcp') {
      reextractionResult = await executeGeminiReextraction(
        sourceUrl,
        query,
        extractionStrategy,
        config
      );
    } else {
      reextractionResult = await executeExaReextraction(
        sourceUrl,
        query,
        extractionStrategy,
        config
      );
    }

    // 4. Validate and enhance extracted content
    const validatedContent = await validateReextractedContent(
      reextractionResult,
      query,
      config
    );

    // 5. Cache enhanced content for future queries
    if (validatedContent.quality_score > 0.8) {
      await cacheEnhancedContent(documentId, validatedContent, config);
    }

    return {
      success: true,
      enhanced_content: validatedContent.content,
      extraction_quality: validatedContent.quality_score,
      tool_used: toolChoice.tool,
      processing_time: validatedContent.processing_time,
      cache_status: validatedContent.quality_score > 0.8 ? 'cached' : 'not_cached'
    };

  } catch (error) {
    console.error(`Dynamic re-extraction failed for ${documentId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback_available: await checkStaticContentAvailability(documentId)
    };
  }
}
```

#### 5. Targeted Section Fallback
```typescript
interface TargetedSectionFallback {
  // Section identification
  section_targeting: {
    query_relevant_sections: string[]; // Sections most relevant to query
    technical_sections: string[]; // Sections with technical details
    citation_heavy_sections: string[]; // Sections with many citations
    methodology_sections: string[]; // Implementation/methodology sections
  };

  // Content enhancement
  enhancement_strategy: {
    preserve_summary_context: boolean; // Keep summary as context
    add_detailed_sections: boolean; // Add full content for key sections
    enhance_citations: boolean; // Add complete citation details
    include_cross_references: boolean; // Add cross-references between sections
  };

  // Performance optimization
  optimization: {
    parallel_section_retrieval: boolean; // Retrieve sections in parallel
    section_caching: boolean; // Cache retrieved sections
    incremental_enhancement: boolean; // Add sections incrementally
  };
}

// Execute targeted section fallback
async function executeTargetedSectionFallback(
  query: string,
  initialResults: SearchResult[],
  supabaseClient: SupabaseClient
): Promise<FallbackSearchResult> {

  console.log(`🎯 Executing targeted section fallback for query: "${query}"`);

  const enhancedResults: SearchResult[] = [];
  const sectionMetrics = {
    sections_retrieved: 0,
    average_enhancement_ratio: 0,
    most_valuable_sections: []
  };

  for (const result of initialResults) {
    try {
      // 1. Identify sections most relevant to query
      const targetSections = await identifyTargetSections(
        query,
        result.documentId,
        result.content,
        supabaseClient
      );

      // 2. Retrieve full content for targeted sections
      const sectionContent = await retrieveTargetedSections(
        result.documentId,
        targetSections.sections,
        supabaseClient
      );

      // 3. Merge summary with detailed sections
      const mergedContent = await mergeContentWithSections(
        result.content, // Original summary
        sectionContent.sections,
        targetSections.integration_strategy
      );

      // 4. Enhance result with targeted content
      const enhancedResult: SearchResult = {
        ...result,
        content: mergedContent.content,
        enhanced_sections: sectionContent.sections.map(s => s.title),
        fallback_type: 'targeted_sections',
        enhancement_ratio: mergedContent.enhancement_ratio,
        section_details: sectionContent.sections
      };

      enhancedResults.push(enhancedResult);
      sectionMetrics.sections_retrieved += sectionContent.sections.length;
      sectionMetrics.most_valuable_sections.push(...targetSections.sections);

    } catch (error) {
      console.error(`Targeted section fallback failed for ${result.documentId}:`, error);
      enhancedResults.push({
        ...result,
        fallback_status: 'partial_failure',
        fallback_error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  sectionMetrics.average_enhancement_ratio =
    enhancedResults.reduce((sum, r) => sum + (r.enhancement_ratio || 1), 0) / enhancedResults.length;

  return {
    success: true,
    message: `Enhanced results with ${sectionMetrics.sections_retrieved} targeted sections`,
    results: enhancedResults,
    fallback_used: true,
    fallback_type: 'targeted_sections',
    section_metrics: sectionMetrics
  };
}
```

#### 6. Performance and Caching Strategy
```typescript
interface FallbackPerformanceConfig {
  // Caching strategy
  caching: {
    full_content_cache_duration: number; // 24 hours in milliseconds
    section_cache_duration: number; // 6 hours in milliseconds
    reextraction_cache_duration: number; // 12 hours in milliseconds
    cache_invalidation_triggers: string[]; // Events that invalidate cache
  };

  // Performance optimization
  performance: {
    max_concurrent_fallbacks: number; // 3 concurrent fallback operations
    fallback_timeout: number; // 30 seconds timeout
    streaming_response: boolean; // Stream results as they become available
    progressive_enhancement: boolean; // Show initial results, then enhance
  };

  // Quality thresholds
  quality_gates: {
    minimum_fallback_quality: number; // 0.7 - don't fallback if quality < 0.7
    content_expansion_threshold: number; // 2.0x - fallback must add significant content
    processing_time_limit: number; // 30 seconds - max time for fallback
  };
}

// Implement smart caching for fallback content
class FallbackContentCache {
  private cache = new Map<string, CachedFallbackContent>();

  async getCachedContent(
    documentId: string,
    fallbackType: 'full_document' | 'targeted_sections' | 'reextraction',
    query?: string
  ): Promise<CachedFallbackContent | null> {

    const cacheKey = this.generateCacheKey(documentId, fallbackType, query);
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isCacheExpired(cached)) {
      console.log(`💾 Cache hit for ${fallbackType} fallback: ${documentId}`);
      return cached;
    }

    return null;
  }

  async setCachedContent(
    documentId: string,
    fallbackType: 'full_document' | 'targeted_sections' | 'reextraction',
    content: any,
    query?: string
  ): Promise<void> {

    const cacheKey = this.generateCacheKey(documentId, fallbackType, query);
    const cachedContent: CachedFallbackContent = {
      content,
      timestamp: Date.now(),
      fallbackType,
      documentId,
      query: query || null,
      accessCount: 0
    };

    this.cache.set(cacheKey, cachedContent);
    console.log(`💾 Cached ${fallbackType} content for ${documentId}`);
  }

  private generateCacheKey(
    documentId: string,
    fallbackType: string,
    query?: string
  ): string {
    const queryHash = query ? this.hashQuery(query) : 'general';
    return `${documentId}_${fallbackType}_${queryHash}`;
  }

  private hashQuery(query: string): string {
    // Simple hash function for query caching
    return Buffer.from(query.toLowerCase().trim()).toString('base64').substring(0, 8);
  }
}
```

### Expected Benefits

#### 1. Quality Preservation
- **Maintain >95% citation accuracy** even with strategic extraction
- **Ensure technical detail availability** when needed for complex queries
- **Preserve user experience** with seamless fallback to detailed content

#### 2. Intelligent Resource Usage
- **Cache frequently accessed content** to avoid repeated re-extraction
- **Targeted enhancement** only when needed, not blanket full content retrieval
- **Progressive loading** shows initial results while enhancing in background

#### 3. User Experience Enhancement
- **Transparent fallback** - users get better answers without knowing about complexity
- **Response time optimization** - show initial results, enhance progressively
- **Quality indicators** - clearly mark when full vs summary content is used

### Implementation Priority

1. **Phase 3.3a**: Content sufficiency detection and analysis
2. **Phase 3.3b**: Full document retrieval and caching system
3. **Phase 3.3c**: Dynamic re-extraction using MCP tools
4. **Phase 3.3d**: Targeted section fallback implementation
5. **Phase 3.3e**: Performance optimization and quality metrics

This fallback strategy ensures that the intelligent content stratification approach never compromises answer quality while maintaining the efficiency benefits of strategic extraction.