/**
 * Context Post-Processing and Compression System
 * 
 * Intelligent context selection, ranking, compression, and optimization
 * for high-quality response generation from large result sets.
 */

import { cosineSimilarity, generateQueryEmbedding } from './embeddings';
import type { SearchResult, QueryIntent } from './types';

// ===========================
// Context Processing Types
// ===========================

export interface ContextProcessingConfig {
  maxContextTokens: number;           // Maximum tokens for final context
  compressionRatio: number;           // Target compression ratio (0.3 = 70% reduction)
  redundancyThreshold: number;        // Similarity threshold for redundancy detection
  diversityWeight: number;            // Weight for diversity in selection
  relevanceWeight: number;            // Weight for relevance in selection
  recencyWeight: number;              // Weight for recency in selection
  authorityWeight: number;            // Weight for source authority
  enableSummarization: boolean;       // Enable content summarization
  preserveCitations: boolean;         // Preserve citation links
  coherenceOptimization: boolean;     // Optimize for coherent flow
}

export interface ProcessedContext {
  content: string;
  tokenCount: number;
  compressionRatio: number;
  sourceCount: number;
  citations: Citation[];
  qualityMetrics: ContextQualityMetrics;
  processingSteps: ProcessingStep[];
  citationRelevance: CitationRelevanceMetrics;
  debugInfo?: {
    originalTokenCount: number;
    redundantChunksRemoved: number;
    summarizedChunks: number;
    reorderedForCoherence: boolean;
    citationsFiltered: number;
    citationRelevanceScores: number[];
  };
}

export interface CitationRelevanceMetrics {
  totalCitations: number;
  relevantCitations: number;
  averageRelevance: number;
  filteredCitations: number;
  confidenceScore: number;
}

export interface Citation {
  id: string;
  title: string;
  docType: string;
  relevanceScore: number;
  chunkIndex: number;
  extractedContent: string;
  url?: string;
  authors?: string[];
  publishedDate?: string;
}

export interface ContextQualityMetrics {
  relevanceScore: number;       // Average relevance to query
  diversityScore: number;       // Content diversity measure
  coherenceScore: number;       // Logical flow and coherence
  completenessScore: number;    // Coverage of query aspects
  authorityScore: number;       // Source authority average
  overallQuality: number;       // Weighted combination
}

export interface ProcessingStep {
  step: string;
  description: string;
  inputCount: number;
  outputCount: number;
  tokensReduced: number;
  executionTime: number;
}

export interface ContentSegment {
  content: string;
  tokenCount: number;
  relevanceScore: number;
  importance: number;
  sourceResult: SearchResult;
  redundancyGroup?: number;
  summary?: string;
}

// ===========================
// Default Configuration
// ===========================

const DEFAULT_CONTEXT_CONFIG: ContextProcessingConfig = {
  maxContextTokens: 4000,        // Conservative limit for most LLMs
  compressionRatio: 0.4,         // Target 60% reduction
  redundancyThreshold: 0.7,      // 70% similarity = redundant
  diversityWeight: 0.3,          // Balance diversity
  relevanceWeight: 0.4,          // Prioritize relevance
  recencyWeight: 0.1,            // Slight recency preference
  authorityWeight: 0.2,          // Consider source authority
  enableSummarization: true,     // Summarize when needed
  preserveCitations: true,       // Always preserve citations
  coherenceOptimization: true    // Optimize for coherent flow
};

// ===========================
// Context Post-Processing Engine
// ===========================

export class ContextPostProcessor {
  private config: ContextProcessingConfig;
  
  constructor(config: Partial<ContextProcessingConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }
  
  /**
   * Main context processing method
   */
  async processContext(
    query: string,
    searchResults: SearchResult[],
    queryIntent?: QueryIntent,
    targetTokens?: number
  ): Promise<ProcessedContext> {
    
    const startTime = Date.now();
    const maxTokens = targetTokens || this.config.maxContextTokens;
    
    console.log(`🔄 Processing context: ${searchResults.length} results → max ${maxTokens} tokens`);
    
    const processingSteps: ProcessingStep[] = [];
    let currentResults = [...searchResults];
    
    // Step 1: Initial segmentation and analysis
    const stepStart1 = Date.now();
    const segments = await this.createContentSegments(query, currentResults);
    const initialTokens = segments.reduce((sum, seg) => sum + seg.tokenCount, 0);
    
    processingSteps.push({
      step: 'segmentation',
      description: 'Created content segments with relevance scoring',
      inputCount: currentResults.length,
      outputCount: segments.length,
      tokensReduced: 0,
      executionTime: Date.now() - stepStart1
    });
    
    console.log(`📊 Initial analysis: ${segments.length} segments, ${initialTokens} tokens`);
    
    // Step 2: Redundancy detection and removal
    const stepStart2 = Date.now();
    const deduplicatedSegments = await this.removeRedundancy(segments);
    const tokensAfterDedup = deduplicatedSegments.reduce((sum, seg) => sum + seg.tokenCount, 0);
    
    processingSteps.push({
      step: 'deduplication',
      description: 'Removed redundant and overlapping content',
      inputCount: segments.length,
      outputCount: deduplicatedSegments.length,
      tokensReduced: initialTokens - tokensAfterDedup,
      executionTime: Date.now() - stepStart2
    });
    
    console.log(`🔄 After deduplication: ${deduplicatedSegments.length} segments, ${tokensAfterDedup} tokens`);
    
    // Step 3: Intelligent selection based on query intent
    const stepStart3 = Date.now();
    const selectedSegments = await this.selectOptimalSegments(
      deduplicatedSegments, 
      maxTokens, 
      queryIntent
    );
    const tokensAfterSelection = selectedSegments.reduce((sum, seg) => sum + seg.tokenCount, 0);
    
    processingSteps.push({
      step: 'selection',
      description: 'Selected optimal segments based on relevance and diversity',
      inputCount: deduplicatedSegments.length,
      outputCount: selectedSegments.length,
      tokensReduced: tokensAfterDedup - tokensAfterSelection,
      executionTime: Date.now() - stepStart3
    });
    
    // Step 4: Compression if still over limit
    let finalSegments = selectedSegments;
    if (tokensAfterSelection > maxTokens && this.config.enableSummarization) {
      const stepStart4 = Date.now();
      finalSegments = await this.compressSegments(selectedSegments, maxTokens);
      const tokensAfterCompression = finalSegments.reduce((sum, seg) => sum + seg.tokenCount, 0);
      
      processingSteps.push({
        step: 'compression',
        description: 'Compressed content through summarization',
        inputCount: selectedSegments.length,
        outputCount: finalSegments.length,
        tokensReduced: tokensAfterSelection - tokensAfterCompression,
        executionTime: Date.now() - stepStart4
      });
      
      console.log(`📝 After compression: ${finalSegments.length} segments, ${tokensAfterCompression} tokens`);
    }
    
    // Step 5: Coherence optimization and assembly
    const stepStart5 = Date.now();
    const { content, citations } = await this.assembleContext(finalSegments, queryIntent);
    const finalTokens = this.estimateTokens(content);
    
    processingSteps.push({
      step: 'assembly',
      description: 'Assembled final context with coherence optimization',
      inputCount: finalSegments.length,
      outputCount: 1,
      tokensReduced: 0,
      executionTime: Date.now() - stepStart5
    });
    
    // Step 6: Calculate quality metrics and citation relevance
    const qualityMetrics = await this.calculateQualityMetrics(
      query, 
      finalSegments, 
      queryIntent
    );
    
    // Calculate citation relevance metrics
    const citationRelevance = this.calculateCitationRelevanceMetrics(
      citations,
      query,
      content
    );
    
    const compressionRatio = initialTokens > 0 ? finalTokens / initialTokens : 1.0;
    
    const debugInfo = {
      originalTokenCount: initialTokens,
      redundantChunksRemoved: segments.length - deduplicatedSegments.length,
      summarizedChunks: selectedSegments.length - finalSegments.length,
      reorderedForCoherence: this.config.coherenceOptimization,
      citationsFiltered: 0,
      citationRelevanceScores: citations.map(c => c.relevanceScore)
    };
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Context processing completed in ${totalTime}ms`);
    console.log(`   ${initialTokens} → ${finalTokens} tokens (${Math.round(compressionRatio * 100)}% of original)`);
    console.log(`   Quality score: ${qualityMetrics.overallQuality.toFixed(3)}`);
    
    return {
      content,
      tokenCount: finalTokens,
      compressionRatio,
      sourceCount: new Set(finalSegments.map(s => s.sourceResult.documentId)).size,
      citations,
      qualityMetrics,
      processingSteps,
      citationRelevance,
      debugInfo
    };
  }
  
  /**
   * Create content segments with relevance scoring
   */
  private async createContentSegments(
    query: string, 
    results: SearchResult[]
  ): Promise<ContentSegment[]> {
    
    const segments: ContentSegment[] = [];
    
    for (const result of results) {
      const tokenCount = this.estimateTokens(result.content);
      const relevanceScore = result.score || result.rerankScore || 0.5;
      
      // Calculate importance based on multiple factors
      const recencyScore = this.calculateRecencyScore(result);
      const authorityScore = this.calculateAuthorityScore(result);
      
      const importance = 
        relevanceScore * this.config.relevanceWeight +
        recencyScore * this.config.recencyWeight +
        authorityScore * this.config.authorityWeight;
      
      segments.push({
        content: result.content,
        tokenCount,
        relevanceScore,
        importance,
        sourceResult: result
      });
    }
    
    // Sort by importance for better processing
    return segments.sort((a, b) => b.importance - a.importance);
  }
  
  /**
   * Remove redundant and overlapping content
   */
  private async removeRedundancy(segments: ContentSegment[]): Promise<ContentSegment[]> {
    const deduplicated: ContentSegment[] = [];
    const redundancyGroups: ContentSegment[][] = [];
    
    for (const segment of segments) {
      let isRedundant = false;
      let groupIndex = -1;
      
      // Check against existing segments
      for (let i = 0; i < deduplicated.length; i++) {
        const similarity = this.calculateTextSimilarity(
          segment.content, 
          deduplicated[i].content
        );
        
        if (similarity >= this.config.redundancyThreshold) {
          isRedundant = true;
          groupIndex = i;
          break;
        }
      }
      
      if (isRedundant && groupIndex >= 0) {
        // Add to redundancy group, keep the most important one
        if (!redundancyGroups[groupIndex]) {
          redundancyGroups[groupIndex] = [deduplicated[groupIndex]];
        }
        redundancyGroups[groupIndex].push(segment);
        
        // Replace with most important segment in group
        const mostImportant = redundancyGroups[groupIndex].reduce((best, current) =>
          current.importance > best.importance ? current : best
        );
        
        if (mostImportant !== deduplicated[groupIndex]) {
          deduplicated[groupIndex] = mostImportant;
        }
      } else {
        deduplicated.push(segment);
        redundancyGroups.push([segment]);
      }
    }
    
    return deduplicated;
  }
  
  /**
   * Select optimal segments based on token budget and query intent
   */
  private async selectOptimalSegments(
    segments: ContentSegment[],
    maxTokens: number,
    queryIntent?: QueryIntent
  ): Promise<ContentSegment[]> {
    
    const selected: ContentSegment[] = [];
    let currentTokens = 0;
    
    // Apply query-specific selection strategy
    const sortedSegments = this.applySortingStrategy(segments, queryIntent);
    
    for (const segment of sortedSegments) {
      if (currentTokens + segment.tokenCount <= maxTokens) {
        selected.push(segment);
        currentTokens += segment.tokenCount;
      } else if (selected.length === 0) {
        // Include at least one segment, even if it exceeds limit
        selected.push(segment);
        break;
      }
    }
    
    // Apply diversity check - ensure we have diverse sources
    return this.ensureDiversity(selected, maxTokens);
  }
  
  /**
   * Apply sorting strategy based on query intent
   */
  private applySortingStrategy(
    segments: ContentSegment[],
    queryIntent?: QueryIntent
  ): ContentSegment[] {
    
    if (!queryIntent) {
      return segments; // Already sorted by importance
    }
    
    switch (queryIntent.type) {
      case 'comparative':
        // Ensure we get different perspectives
        return this.sortForComparison(segments);
        
      case 'temporal':
        // Prioritize by recency/date relevance
        return segments.sort((a, b) => {
          const aRecency = this.calculateRecencyScore(a.sourceResult);
          const bRecency = this.calculateRecencyScore(b.sourceResult);
          return bRecency - aRecency;
        });
        
      case 'factual':
        // Prioritize high-authority sources
        return segments.sort((a, b) => {
          const aAuthority = this.calculateAuthorityScore(a.sourceResult);
          const bAuthority = this.calculateAuthorityScore(b.sourceResult);
          return bAuthority - aAuthority;
        });
        
      case 'exploratory':
        // Prioritize diversity
        return this.sortForDiversity(segments);
        
      default:
        return segments;
    }
  }
  
  /**
   * Sort segments for comparative analysis
   */
  private sortForComparison(segments: ContentSegment[]): ContentSegment[] {
    // Group by document type and select best from each
    const byDocType = new Map<string, ContentSegment[]>();
    
    for (const segment of segments) {
      const docType = segment.sourceResult.docType;
      if (!byDocType.has(docType)) {
        byDocType.set(docType, []);
      }
      byDocType.get(docType)!.push(segment);
    }
    
    // Select top segments from each document type
    const balanced: ContentSegment[] = [];
    const maxPerType = Math.max(1, Math.floor(segments.length / byDocType.size));
    
    for (const [docType, typeSegments] of byDocType) {
      const sorted = typeSegments.sort((a, b) => b.importance - a.importance);
      balanced.push(...sorted.slice(0, maxPerType));
    }
    
    return balanced.sort((a, b) => b.importance - a.importance);
  }
  
  /**
   * Sort segments for maximum diversity
   */
  private sortForDiversity(segments: ContentSegment[]): ContentSegment[] {
    const diverseSegments: ContentSegment[] = [];
    const remaining = [...segments];
    
    // Start with most important
    if (remaining.length > 0) {
      const first = remaining.splice(0, 1)[0];
      diverseSegments.push(first);
    }
    
    // Select remaining based on diversity from already selected
    while (remaining.length > 0 && diverseSegments.length < segments.length) {
      let bestSegment: ContentSegment | null = null;
      let bestScore = -1;
      let bestIndex = -1;
      
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        
        // Calculate average similarity to already selected
        let avgSimilarity = 0;
        for (const selected of diverseSegments) {
          avgSimilarity += this.calculateTextSimilarity(
            candidate.content, 
            selected.content
          );
        }
        avgSimilarity /= diverseSegments.length;
        
        // Diversity score (lower similarity = higher diversity)
        const diversityScore = 1 - avgSimilarity;
        const combinedScore = candidate.importance * 0.7 + diversityScore * 0.3;
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestSegment = candidate;
          bestIndex = i;
        }
      }
      
      if (bestSegment && bestIndex >= 0) {
        diverseSegments.push(bestSegment);
        remaining.splice(bestIndex, 1);
      } else {
        break;
      }
    }
    
    return diverseSegments;
  }
  
  /**
   * Ensure diversity in selected segments
   */
  private ensureDiversity(
    segments: ContentSegment[],
    maxTokens: number
  ): ContentSegment[] {
    
    if (segments.length <= 3) {
      return segments; // Too few to optimize for diversity
    }
    
    const sourceTypes = new Set(segments.map(s => s.sourceResult.docType));
    
    // If we have good source type diversity, keep as is
    if (sourceTypes.size >= Math.min(3, segments.length / 2)) {
      return segments;
    }
    
    // Otherwise, try to balance source types
    return this.balanceSourceTypes(segments, maxTokens);
  }
  
  /**
   * Balance source types in selection
   */
  private balanceSourceTypes(
    segments: ContentSegment[],
    maxTokens: number
  ): ContentSegment[] {
    
    const byType = new Map<string, ContentSegment[]>();
    
    for (const segment of segments) {
      const type = segment.sourceResult.docType;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(segment);
    }
    
    // Sort each type by importance
    for (const [type, typeSegments] of byType) {
      typeSegments.sort((a, b) => b.importance - a.importance);
    }
    
    // Round-robin selection
    const balanced: ContentSegment[] = [];
    let currentTokens = 0;
    const typeArrays = Array.from(byType.values());
    const typeIndices = new Array(typeArrays.length).fill(0);
    
    let typeIndex = 0;
    while (currentTokens < maxTokens && typeArrays.some((arr, i) => typeIndices[i] < arr.length)) {
      const currentTypeArray = typeArrays[typeIndex];
      const currentTypeIndex = typeIndices[typeIndex];
      
      if (currentTypeIndex < currentTypeArray.length) {
        const segment = currentTypeArray[currentTypeIndex];
        if (currentTokens + segment.tokenCount <= maxTokens) {
          balanced.push(segment);
          currentTokens += segment.tokenCount;
        }
        typeIndices[typeIndex]++;
      }
      
      typeIndex = (typeIndex + 1) % typeArrays.length;
    }
    
    return balanced;
  }
  
  /**
   * Compress segments through summarization
   */
  private async compressSegments(
    segments: ContentSegment[],
    maxTokens: number
  ): Promise<ContentSegment[]> {
    
    // Simple compression strategy: keep most important segments and summarize others
    const compressed: ContentSegment[] = [];
    let currentTokens = 0;
    
    for (const segment of segments) {
      if (currentTokens + segment.tokenCount <= maxTokens) {
        compressed.push(segment);
        currentTokens += segment.tokenCount;
      } else {
        // Summarize remaining content if possible
        const summary = this.createSummary(segment.content);
        const summaryTokens = this.estimateTokens(summary);
        
        if (currentTokens + summaryTokens <= maxTokens) {
          compressed.push({
            ...segment,
            content: summary,
            tokenCount: summaryTokens,
            summary: summary
          });
          currentTokens += summaryTokens;
        }
      }
    }
    
    return compressed;
  }
  
  /**
   * Create summary of content (simplified implementation)
   */
  private createSummary(content: string): string {
    // Simple extractive summarization - take first and key sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 2) {
      return content; // Already short
    }
    
    // Take first sentence and one key sentence
    const firstSentence = sentences[0].trim() + '.';
    const keyWords = ['important', 'significant', 'result', 'conclusion', 'finding', 'shows', 'demonstrates'];
    
    let keySentence = '';
    for (const sentence of sentences.slice(1)) {
      if (keyWords.some(word => sentence.toLowerCase().includes(word))) {
        keySentence = sentence.trim() + '.';
        break;
      }
    }
    
    return keySentence ? `${firstSentence} ${keySentence}` : firstSentence;
  }
  
  /**
   * Assemble final context with coherent flow and citation validation
   */
  private async assembleContext(
    segments: ContentSegment[],
    queryIntent?: QueryIntent
  ): Promise<{ content: string; citations: Citation[] }> {
    
    const citations: Citation[] = [];
    const contentParts: string[] = [];
    
    // Reorder for coherent flow if enabled
    const orderedSegments = this.config.coherenceOptimization 
      ? this.optimizeCoherentFlow(segments, queryIntent)
      : segments;
    
    // First, assemble all content to analyze citation relevance
    const allContent = orderedSegments.map(seg => seg.content).join('\n\n');
    
    for (let i = 0; i < orderedSegments.length; i++) {
      const segment = orderedSegments[i];
      const citationId = `[${i + 1}]`;
      
      // Calculate citation relevance score
      const citationRelevance = this.calculateCitationRelevance(
        segment, 
        allContent, 
        queryIntent
      );
      
      // Add content with citation
      const contentWithCitation = this.config.preserveCitations 
        ? `${segment.content} ${citationId}`
        : segment.content;
      
      contentParts.push(contentWithCitation);
      
      // Create citation with relevance score
      citations.push({
        id: citationId,
        title: segment.sourceResult.title,
        docType: segment.sourceResult.docType,
        relevanceScore: citationRelevance,
        chunkIndex: segment.sourceResult.chunkIndex || 0,
        extractedContent: segment.summary || segment.content.substring(0, 150) + '...',
        url: segment.sourceResult.url,
        authors: this.extractAuthors(segment.sourceResult),
        publishedDate: segment.sourceResult.publishedDate
      });
    }
    
    const content = contentParts.join('\n\n');
    return { content, citations };
  }
  
  /**
   * Optimize content flow for coherence
   */
  private optimizeCoherentFlow(
    segments: ContentSegment[],
    queryIntent?: QueryIntent
  ): ContentSegment[] {
    
    if (segments.length <= 2) {
      return segments; // Too few to reorder meaningfully
    }
    
    // Strategy based on query intent
    switch (queryIntent?.type) {
      case 'temporal':
        return this.orderByTime(segments);
      case 'comparative':
        return this.orderForComparison(segments);
      case 'causal':
        return this.orderByCausality(segments);
      default:
        return this.orderByRelevance(segments);
    }
  }
  
  /**
   * Order segments by temporal relevance
   */
  private orderByTime(segments: ContentSegment[]): ContentSegment[] {
    return segments.sort((a, b) => {
      const aDate = new Date(a.sourceResult.publishedDate || '1900-01-01');
      const bDate = new Date(b.sourceResult.publishedDate || '1900-01-01');
      return aDate.getTime() - bDate.getTime(); // Chronological order
    });
  }
  
  /**
   * Order segments for comparative analysis
   */
  private orderForComparison(segments: ContentSegment[]): ContentSegment[] {
    // Group by document type and interleave
    const byType = new Map<string, ContentSegment[]>();
    
    for (const segment of segments) {
      const type = segment.sourceResult.docType;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(segment);
    }
    
    // Interleave different types
    const interleaved: ContentSegment[] = [];
    const typeArrays = Array.from(byType.values());
    const maxLength = Math.max(...typeArrays.map(arr => arr.length));
    
    for (let i = 0; i < maxLength; i++) {
      for (const typeArray of typeArrays) {
        if (i < typeArray.length) {
          interleaved.push(typeArray[i]);
        }
      }
    }
    
    return interleaved;
  }
  
  /**
   * Order by causality (cause before effect)
   */
  private orderByCausality(segments: ContentSegment[]): ContentSegment[] {
    // Simple heuristic: content mentioning causes first
    const causalWords = ['because', 'due to', 'caused by', 'reason', 'leads to', 'results in'];
    const effectWords = ['therefore', 'consequently', 'result', 'effect', 'outcome'];
    
    return segments.sort((a, b) => {
      const aCausal = causalWords.some(word => a.content.toLowerCase().includes(word));
      const aEffect = effectWords.some(word => a.content.toLowerCase().includes(word));
      const bCausal = causalWords.some(word => b.content.toLowerCase().includes(word));
      const bEffect = effectWords.some(word => b.content.toLowerCase().includes(word));
      
      if (aCausal && !bCausal) return -1; // Causes first
      if (!aCausal && bCausal) return 1;
      if (aEffect && !bEffect) return 1;  // Effects last
      if (!aEffect && bEffect) return -1;
      
      return b.importance - a.importance; // Fall back to importance
    });
  }
  
  /**
   * Order by relevance (default)
   */
  private orderByRelevance(segments: ContentSegment[]): ContentSegment[] {
    return segments.sort((a, b) => b.importance - a.importance);
  }
  
  /**
   * Calculate quality metrics for processed context
   */
  private async calculateQualityMetrics(
    query: string,
    segments: ContentSegment[],
    queryIntent?: QueryIntent
  ): Promise<ContextQualityMetrics> {
    
    const relevanceScore = segments.length > 0 
      ? segments.reduce((sum, seg) => sum + seg.relevanceScore, 0) / segments.length
      : 0;
    
    const diversityScore = this.calculateDiversityScore(segments);
    const authorityScore = this.calculateAverageAuthority(segments);
    const coherenceScore = this.calculateCoherenceScore(segments);
    const completenessScore = this.calculateCompletenessScore(query, segments, queryIntent);
    
    // Weighted combination
    const overallQuality = 
      relevanceScore * 0.3 +
      diversityScore * 0.2 +
      authorityScore * 0.2 +
      coherenceScore * 0.15 +
      completenessScore * 0.15;
    
    return {
      relevanceScore,
      diversityScore,
      coherenceScore,
      completenessScore,
      authorityScore,
      overallQuality
    };
  }
  
  /**
   * Helper methods for calculations
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough approximation
  }
  
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  private calculateRecencyScore(result: SearchResult): number {
    if (!result.publishedDate) return 0.5;
    
    const publishDate = new Date(result.publishedDate);
    const now = new Date();
    const ageInDays = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Score decreases with age, but levels off
    return Math.max(0.1, 1 - (ageInDays / 3650)); // 10-year decay
  }
  
  private calculateAuthorityScore(result: SearchResult): number {
    // Simple authority scoring based on document type and source
    const typeScores = {
      'paper': 0.9,
      'patent': 0.8,
      'book': 0.85,
      'pdf': 0.7,
      'url': 0.5,
      'note': 0.6
    };
    
    return typeScores[result.docType as keyof typeof typeScores] || 0.5;
  }
  
  private calculateDiversityScore(segments: ContentSegment[]): number {
    if (segments.length <= 1) return 1.0;
    
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < segments.length - 1; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        totalSimilarity += this.calculateTextSimilarity(
          segments[i].content,
          segments[j].content
        );
        pairCount++;
      }
    }
    
    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;
    return 1 - avgSimilarity; // Higher diversity = lower average similarity
  }
  
  private calculateAverageAuthority(segments: ContentSegment[]): number {
    if (segments.length === 0) return 0;
    
    const totalAuthority = segments.reduce(
      (sum, seg) => sum + this.calculateAuthorityScore(seg.sourceResult), 
      0
    );
    
    return totalAuthority / segments.length;
  }
  
  private calculateCoherenceScore(segments: ContentSegment[]): number {
    // Simple coherence measure based on content flow
    if (segments.length <= 1) return 1.0;
    
    let coherenceSum = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      // Check for logical connection between adjacent segments
      const similarity = this.calculateTextSimilarity(
        segments[i].content,
        segments[i + 1].content
      );
      
      // Moderate similarity indicates good flow (not too similar, not too different)
      const flowScore = similarity > 0.7 ? 0.5 : (similarity < 0.1 ? 0.3 : 1.0);
      coherenceSum += flowScore;
    }
    
    return coherenceSum / (segments.length - 1);
  }
  
  private calculateCompletenessScore(
    query: string,
    segments: ContentSegment[],
    queryIntent?: QueryIntent
  ): number {
    // Check if key query terms are covered
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const allContent = segments.map(s => s.content.toLowerCase()).join(' ');
    
    const coveredWords = queryWords.filter(word => allContent.includes(word));
    const wordCoverage = queryWords.length > 0 ? coveredWords.length / queryWords.length : 1;
    
    // Check source diversity
    const uniqueSources = new Set(segments.map(s => s.sourceResult.documentId)).size;
    const sourceDiversity = Math.min(1, uniqueSources / 3); // Optimal around 3 sources
    
    return (wordCoverage + sourceDiversity) / 2;
  }
  
  private extractAuthors(result: SearchResult): string[] | undefined {
    // Try to extract authors from different metadata fields
    if (result.authors) return result.authors;
    if (result.inventors) return result.inventors;
    
    // Could implement text extraction of author names
    return undefined;
  }

  /**
   * Calculate citation relevance score for a segment
   */
  private calculateCitationRelevance(
    segment: ContentSegment,
    allContent: string,
    queryIntent?: QueryIntent
  ): number {
    const content = segment.content.toLowerCase();
    const fullContent = allContent.toLowerCase();
    
    // 1. Content overlap score - how much of the citation content appears in response
    const contentWords = new Set(content.split(/\s+/).filter(w => w.length > 3));
    const responseWords = new Set(fullContent.split(/\s+/).filter(w => w.length > 3));
    const overlap = new Set([...contentWords].filter(word => responseWords.has(word)));
    const overlapScore = contentWords.size > 0 ? overlap.size / contentWords.size : 0;
    
    // 2. Key concept alignment - check for domain-specific terms
    const keyConcepts = this.extractKeyConcepts(content);
    const responseHasKeyConcepts = keyConcepts.some(concept => 
      fullContent.includes(concept.toLowerCase())
    );
    const conceptScore = responseHasKeyConcepts ? 1.0 : 0.3;
    
    // 3. Document type relevance - some types are more authoritative
    const typeRelevance = this.getDocumentTypeRelevance(segment.sourceResult.docType);
    
    // 4. Title-content alignment - title should relate to the response
    const titleRelevance = this.calculateTitleRelevance(
      segment.sourceResult.title,
      fullContent
    );
    
    // 5. Temporal relevance - newer content might be more relevant
    const temporalRelevance = this.calculateRecencyScore(segment.sourceResult);
    
    // Weighted combination
    const relevanceScore = 
      overlapScore * 0.4 +        // Content overlap is most important
      conceptScore * 0.3 +        // Key concepts are critical
      typeRelevance * 0.15 +      // Document authority matters
      titleRelevance * 0.1 +      // Title alignment
      temporalRelevance * 0.05;   // Recency is least important
    
    return Math.min(1.0, Math.max(0.0, relevanceScore));
  }

  /**
   * Extract key concepts from content
   */
  private extractKeyConcepts(content: string): string[] {
    const concepts: string[] = [];
    
    // Look for technical terms, proper nouns, and important phrases
    const technicalPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,  // Proper nouns
      /\b\d+D\b/g,                             // 3D, 2D, etc.
      /\b[A-Z]{2,}\b/g,                        // Acronyms
      /\b\w+(?:AI|ML|VR|AR|XR)\b/g,           // AI/tech terms
      /\b(?:patent|invention|technology|method|system|device|apparatus)\b/gi
    ];
    
    for (const pattern of technicalPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        concepts.push(...matches);
      }
    }
    
    return [...new Set(concepts)]; // Remove duplicates
  }

  /**
   * Calculate document type relevance
   */
  private getDocumentTypeRelevance(docType: string): number {
    const typeScores = {
      'paper': 0.9,     // Academic papers are highly relevant
      'patent': 0.8,    // Patents are technical and specific
      'book': 0.85,     // Books are authoritative
      'pdf': 0.7,       // PDFs vary in quality
      'url': 0.5,       // Web content is less reliable
      'note': 0.6       // Notes are contextual
    };
    
    return typeScores[docType as keyof typeof typeScores] || 0.5;
  }

  /**
   * Calculate title relevance to content
   */
  private calculateTitleRelevance(title: string, content: string): number {
    if (!title) return 0.5;
    
    const titleWords = new Set(
      title.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3 && !['the', 'and', 'for', 'with', 'from'].includes(w))
    );
    
    const contentLower = content.toLowerCase();
    const relevantWords = [...titleWords].filter(word => contentLower.includes(word));
    
    return titleWords.size > 0 ? relevantWords.length / titleWords.size : 0.5;
  }

  /**
   * Calculate citation relevance metrics for the entire set
   */
  private calculateCitationRelevanceMetrics(
    citations: Citation[],
    query: string,
    content: string
  ): CitationRelevanceMetrics {
    
    const relevanceThreshold = 0.6; // Citations below this are considered irrelevant
    const relevantCitations = citations.filter(c => c.relevanceScore >= relevanceThreshold);
    
    const totalCitations = citations.length;
    const relevantCount = relevantCitations.length;
    const averageRelevance = totalCitations > 0 
      ? citations.reduce((sum, c) => sum + c.relevanceScore, 0) / totalCitations 
      : 0;
    
    const filteredCitations = totalCitations - relevantCount;
    
    // Confidence score based on how many citations meet the threshold
    const confidenceScore = totalCitations > 0 ? relevantCount / totalCitations : 1.0;
    
    return {
      totalCitations,
      relevantCitations: relevantCount,
      averageRelevance,
      filteredCitations,
      confidenceScore
    };
  }
}

// Export singleton instance
export const contextPostProcessor = new ContextPostProcessor();

/**
 * Convenience function for context processing
 */
export async function processSearchContext(
  query: string,
  searchResults: SearchResult[],
  queryIntent?: QueryIntent,
  maxTokens?: number
): Promise<ProcessedContext> {
  return await contextPostProcessor.processContext(query, searchResults, queryIntent, maxTokens);
}