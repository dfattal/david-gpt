/**
 * Three-Tier Search System
 *
 * Implements the new three-tier search strategy:
 * - Tier 1 (SQL): Exact identifier/date lookups
 * - Tier 2 (Vector): Semantic metadata queries
 * - Tier 3 (Content): Technical/content questions
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchQuery, SearchResult, HybridSearchResult } from './types';
import { hybridSearchEngine } from './hybrid-search';
import { getDocumentType, classifyQueryByDocumentType } from './document-type-registry';

// =======================
// Types
// =======================

export interface TieredSearchQuery extends SearchQuery {
  tier?: 'sql' | 'vector' | 'content' | 'auto';
  identifierLookup?: {
    type: string;
    value: string;
  };
  dateRange?: {
    field: string;
    start?: string;
    end?: string;
  };
}

export interface TieredSearchResult extends HybridSearchResult {
  tier: 'sql' | 'vector' | 'content';
  fallbackTier?: 'sql' | 'vector' | 'content';
  executionStrategy: string;
  queryClassification: {
    intent: string;
    confidence: number;
    documentTypes: string[];
  };
}

export interface QueryClassification {
  tier: 'sql' | 'vector' | 'content';
  intent: 'exact_lookup' | 'metadata_semantic' | 'content_search';
  confidence: number;
  reasoning: string;
  documentTypes?: string[];
  identifierLookup?: {
    type: string;
    value: string;
  };
  dateQuery?: {
    field: string;
    operation: 'equals' | 'range' | 'before' | 'after';
  };
}

// =======================
// Query Classification
// =======================

export function classifySearchQuery(query: string): QueryClassification {
  const lowerQuery = query.toLowerCase().trim();

  // Tier 1 (SQL): Exact identifier patterns
  const identifierPatterns = [
    { pattern: /\b(patent\s+)?(us|ep|wo|jp|cn)?(\s*)?(\d{6,10}[a-z]?\d?)\b/i, type: 'patent_no' },
    { pattern: /\b(doi\s*:?\s*)?10\.\d{4,}\/[^\s]+/i, type: 'doi' },
    { pattern: /\barxiv\s*:?\s*\d{4}\.\d{4,5}/i, type: 'arxiv_id' },
    { pattern: /\bisbn\s*:?\s*(?:97[89])?\d{9,13}/i, type: 'isbn' },
    { pattern: /\bcase\s+(no|number)\s*:?\s*[\w-]+/i, type: 'case_no' },
    { pattern: /\bpmid\s*:?\s*\d{7,8}/i, type: 'pmid' }
  ];

  for (const { pattern, type } of identifierPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      return {
        tier: 'sql',
        intent: 'exact_lookup',
        confidence: 0.95,
        reasoning: `Direct identifier lookup detected: ${type}`,
        identifierLookup: {
          type,
          value: match[0].trim()
        }
      };
    }
  }

  // Tier 1 (SQL): Exact date queries
  const datePatterns = [
    { pattern: /\b(filed|granted|published|created)\s+(in\s+|on\s+|during\s+)?(\d{4})\b/i, field: 'dates', operation: 'equals' as const },
    { pattern: /\b(from|after|since)\s+(\d{4})\s+(to|until|before)\s+(\d{4})\b/i, field: 'dates', operation: 'range' as const },
    { pattern: /\b(before|until)\s+(\d{4})\b/i, field: 'dates', operation: 'before' as const },
    { pattern: /\b(after|since)\s+(\d{4})\b/i, field: 'dates', operation: 'after' as const }
  ];

  for (const { pattern, field, operation } of datePatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        tier: 'sql',
        intent: 'exact_lookup',
        confidence: 0.85,
        reasoning: `Structured date query detected: ${operation}`,
        dateQuery: { field, operation }
      };
    }
  }

  // Tier 2 (Vector): Metadata semantic queries
  const metadataPatterns = [
    /\b(who\s+(are|is)\s+)?(inventor|author|creator)s?\s+of\b/i,
    /\b(who\s+(invented|created|wrote|developed))\b/i,
    /\b(what\s+(company|organization|assignee))\b/i,
    /\b(which\s+(patents|papers|articles)\s+(by|from))\b/i,
    /\b(david\s+fattal'?s?\s+(patents|papers|work))\b/i,
    /\b(list\s+(all\s+)?(patents|papers)\s+(by|from))\b/i,
    /\b(find\s+(documents|papers|patents)\s+(about|on|related\s+to))\b/i
  ];

  for (const pattern of metadataPatterns) {
    if (pattern.test(lowerQuery)) {
      const docTypeClassification = classifyQueryByDocumentType(query);
      return {
        tier: 'vector',
        intent: 'metadata_semantic',
        confidence: Math.min(0.8, 0.6 + docTypeClassification.confidence),
        reasoning: 'Semantic metadata query - best served by metadata chunks',
        documentTypes: docTypeClassification.documentTypes
      };
    }
  }

  // Tier 3 (Content): Technical/explanatory queries
  const contentPatterns = [
    /\b(how\s+(does|do|can|is))\b/i,
    /\b(what\s+(is|are)\s+(the\s+)?(principle|method|approach|algorithm))\b/i,
    /\b(explain|describe|detail)\b/i,
    /\b(implement|build|create|design)\b/i,
    /\b(compare|difference|versus|vs)\b/i,
    /\b(advantage|benefit|limitation|problem)\b/i,
    /\b(work|function|operate|perform)\b/i
  ];

  for (const pattern of contentPatterns) {
    if (pattern.test(lowerQuery)) {
      const docTypeClassification = classifyQueryByDocumentType(query);
      return {
        tier: 'content',
        intent: 'content_search',
        confidence: Math.min(0.75, 0.5 + docTypeClassification.confidence),
        reasoning: 'Technical/explanatory query - best served by content chunks',
        documentTypes: docTypeClassification.documentTypes
      };
    }
  }

  // Default fallback: Tier 2 (Vector) for general queries
  const docTypeClassification = classifyQueryByDocumentType(query);
  return {
    tier: 'vector',
    intent: 'metadata_semantic',
    confidence: Math.max(0.3, docTypeClassification.confidence),
    reasoning: 'General query - defaulting to semantic search across metadata and content',
    documentTypes: docTypeClassification.documentTypes
  };
}

// =======================
// Three-Tier Search Engine
// =======================

export class ThreeTierSearchEngine {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Main search method with automatic tier selection
   */
  async search(query: TieredSearchQuery): Promise<TieredSearchResult> {
    const startTime = Date.now();

    // Classify query to determine search tier
    const classification = query.tier === 'auto' || !query.tier
      ? classifySearchQuery(query.query)
      : { tier: query.tier, intent: 'content_search', confidence: 1.0, reasoning: 'Manual tier selection' };

    console.log(`🔍 Three-tier search: ${query.query}`);
    console.log(`📊 Classification: Tier ${classification.tier.toUpperCase()} (${classification.intent}) - Confidence: ${classification.confidence.toFixed(2)}`);
    console.log(`💭 Reasoning: ${classification.reasoning}`);

    let searchResult: HybridSearchResult;
    let tier: 'sql' | 'vector' | 'content' = classification.tier;
    let fallbackTier: 'sql' | 'vector' | 'content' | undefined;

    try {
      switch (classification.tier) {
        case 'sql':
          searchResult = await this.executeSqlTierSearch(query, classification);
          break;

        case 'vector':
          searchResult = await this.executeVectorTierSearch(query, classification);
          break;

        case 'content':
          searchResult = await this.executeContentTierSearch(query, classification);
          break;

        default:
          throw new Error(`Unknown search tier: ${classification.tier}`);
      }

      // Fallback strategy if primary tier returns insufficient results
      if (searchResult.results.length < 3 && classification.confidence < 0.8) {
        console.log(`⚡ Low results (${searchResult.results.length}) and confidence - attempting fallback`);

        const fallbackClassification = this.determineFallbackTier(classification);
        if (fallbackClassification) {
          console.log(`🔄 Falling back to Tier ${fallbackClassification.tier.toUpperCase()}`);

          const fallbackResults = await this.executeFallbackSearch(query, fallbackClassification);
          if (fallbackResults.results.length > searchResult.results.length) {
            fallbackTier = tier;
            tier = fallbackClassification.tier;
            searchResult = fallbackResults;
          }
        }
      }

    } catch (error) {
      console.error(`❌ Search failed on Tier ${classification.tier}:`, error);

      // Emergency fallback to hybrid search
      console.log(`🚨 Emergency fallback to hybrid search`);
      tier = 'content';
      searchResult = await hybridSearchEngine.search(query);
    }

    const executionTime = Date.now() - startTime;

    return {
      ...searchResult,
      tier,
      fallbackTier,
      executionStrategy: this.getExecutionStrategy(tier, fallbackTier),
      queryClassification: {
        intent: classification.intent,
        confidence: classification.confidence,
        documentTypes: classification.documentTypes || []
      },
      executionTime
    };
  }

  /**
   * Tier 1: SQL-based exact lookups
   */
  private async executeSqlTierSearch(
    query: TieredSearchQuery,
    classification: QueryClassification
  ): Promise<HybridSearchResult> {
    console.log(`🗄️ Executing SQL tier search`);

    let sqlQuery = this.supabase
      .from('documents')
      .select(`
        id, title, doc_type, identifiers, dates, abstract,
        inventors, assignees, authors_affiliations, venue,
        publication_year, created_at
      `);

    // Apply identifier lookup
    if (classification.identifierLookup) {
      const { type, value } = classification.identifierLookup;
      console.log(`🎯 Identifier lookup: ${type} = ${value}`);

      sqlQuery = sqlQuery.contains('identifiers', { [type]: value });
    }

    // Apply date filters
    if (classification.dateQuery) {
      const { field, operation } = classification.dateQuery;
      console.log(`📅 Date query: ${field} ${operation}`);

      // This would need more sophisticated date parsing
      // For now, implement basic year filtering
      const yearMatch = query.query.match(/\b(\d{4})\b/);
      if (yearMatch) {
        const year = yearMatch[1];
        sqlQuery = sqlQuery.or(
          `dates->>'filed' LIKE '%${year}%',dates->>'granted' LIKE '%${year}%',dates->>'published' LIKE '%${year}%'`
        );
      }
    }

    // Apply document type filters if classified
    if (classification.documentTypes && classification.documentTypes.length > 0) {
      sqlQuery = sqlQuery.in('doc_type', classification.documentTypes);
    }

    const { data: documents, error } = await sqlQuery.limit(query.limit || 10);

    if (error) {
      throw new Error(`SQL search failed: ${error.message}`);
    }

    console.log(`✅ SQL search returned ${documents?.length || 0} documents`);

    // Convert documents to search results format
    const results: SearchResult[] = (documents || []).map((doc, index) => ({
      documentId: doc.id,
      chunkId: null,
      score: 1.0 - (index * 0.1), // Higher score for exact matches
      content: doc.abstract || `${doc.title} - Document metadata available`,
      title: doc.title,
      docType: doc.doc_type,
      pageRange: `Document ${index + 1}`,
      sectionTitle: 'Metadata',
      metadata: doc
    }));

    return {
      results,
      totalCount: results.length,
      semanticResults: [],
      keywordResults: results,
      query,
      executionTime: 0 // Will be calculated by parent
    };
  }

  /**
   * Tier 2: Vector search focusing on metadata chunks
   */
  private async executeVectorTierSearch(
    query: TieredSearchQuery,
    classification: QueryClassification
  ): Promise<HybridSearchResult> {
    console.log(`🎯 Executing vector tier search (metadata-focused)`);

    // Modify search query to prioritize metadata chunks
    const enhancedQuery: SearchQuery = {
      ...query,
      filters: {
        ...query.filters,
        // Add filter for metadata chunks + content chunks
        // This would require enhancing the hybrid search to support chunk type filtering
        documentTypes: classification.documentTypes
      }
    };

    // Use hybrid search but with metadata emphasis
    const result = await hybridSearchEngine.search(enhancedQuery);

    console.log(`✅ Vector search returned ${result.results.length} results`);

    // Boost metadata chunk results
    const boostedResults = result.results.map(r => ({
      ...r,
      score: r.sectionTitle?.includes('Metadata') ? r.score * 1.5 : r.score
    })).sort((a, b) => b.score - a.score);

    return {
      ...result,
      results: boostedResults
    };
  }

  /**
   * Tier 3: Content-focused search
   */
  private async executeContentTierSearch(
    query: TieredSearchQuery,
    classification: QueryClassification
  ): Promise<HybridSearchResult> {
    console.log(`📖 Executing content tier search`);

    // Use standard hybrid search
    const result = await hybridSearchEngine.search(query);

    console.log(`✅ Content search returned ${result.results.length} results`);

    // De-prioritize metadata chunks for content queries
    const adjustedResults = result.results.map(r => ({
      ...r,
      score: r.sectionTitle?.includes('Metadata') ? r.score * 0.7 : r.score
    })).sort((a, b) => b.score - a.score);

    return {
      ...result,
      results: adjustedResults
    };
  }

  /**
   * Execute fallback search with different tier
   */
  private async executeFallbackSearch(
    query: TieredSearchQuery,
    classification: QueryClassification
  ): Promise<HybridSearchResult> {
    switch (classification.tier) {
      case 'sql':
        return this.executeSqlTierSearch(query, classification);
      case 'vector':
        return this.executeVectorTierSearch(query, classification);
      case 'content':
        return this.executeContentTierSearch(query, classification);
      default:
        throw new Error(`Invalid fallback tier: ${classification.tier}`);
    }
  }

  /**
   * Determine appropriate fallback tier
   */
  private determineFallbackTier(primary: QueryClassification): QueryClassification | null {
    switch (primary.tier) {
      case 'sql':
        // SQL -> Vector (try semantic metadata search)
        return {
          tier: 'vector',
          intent: 'metadata_semantic',
          confidence: 0.6,
          reasoning: 'Fallback from exact lookup to semantic metadata search'
        };

      case 'vector':
        // Vector -> Content (expand to full content search)
        return {
          tier: 'content',
          intent: 'content_search',
          confidence: 0.5,
          reasoning: 'Fallback from metadata search to full content search'
        };

      case 'content':
        // Content -> Vector (try more focused metadata search)
        return {
          tier: 'vector',
          intent: 'metadata_semantic',
          confidence: 0.4,
          reasoning: 'Fallback from content search to metadata search'
        };

      default:
        return null;
    }
  }

  /**
   * Generate execution strategy description
   */
  private getExecutionStrategy(
    tier: 'sql' | 'vector' | 'content',
    fallbackTier?: 'sql' | 'vector' | 'content'
  ): string {
    const tierNames = {
      sql: 'SQL (exact lookups)',
      vector: 'Vector (semantic metadata)',
      content: 'Content (hybrid search)'
    };

    if (fallbackTier) {
      return `${tierNames[tier]} with fallback to ${tierNames[fallbackTier]}`;
    }

    return tierNames[tier];
  }
}

// =======================
// Convenience Functions
// =======================

/**
 * Create three-tier search engine instance
 */
export function createThreeTierSearchEngine(supabase: SupabaseClient): ThreeTierSearchEngine {
  return new ThreeTierSearchEngine(supabase);
}

/**
 * Quick three-tier search
 */
export async function threeTierSearch(
  query: string,
  supabase: SupabaseClient,
  options: Partial<TieredSearchQuery> = {}
): Promise<TieredSearchResult> {
  const engine = createThreeTierSearchEngine(supabase);

  return engine.search({
    query,
    tier: 'auto',
    limit: 10,
    ...options
  });
}