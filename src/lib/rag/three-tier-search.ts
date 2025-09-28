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
import {
  getDocumentType,
  classifyQueryByDocumentType,
} from './document-type-registry';

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

  // Tier 1 (SQL): Exact identifier patterns (order matters - more specific first)
  const identifierPatterns = [
    { pattern: /\b(doi\s*:?\s*)?10\.\d{4,}\/[^\s]+/i, type: 'doi' },
    {
      pattern: /\b(arxiv\s*:?\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/i,
      type: 'arxiv_id',
    },
    {
      pattern: /\b(patent\s+)?(us|ep|wo|jp|cn)?(\s*)?(\d{6,10}[a-z]?\d?)\b/i,
      type: 'patent_no',
    },
    { pattern: /\bisbn\s*:?\s*(?:97[89])?\d{9,13}/i, type: 'isbn' },
    { pattern: /\bcase\s+(no|number)\s*:?\s*[\w-]+/i, type: 'case_no' },
    { pattern: /\bpmid\s*:?\s*\d{7,8}/i, type: 'pmid' },
  ];

  for (const { pattern, type } of identifierPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      // Extract the clean identifier value based on type
      let cleanValue = match[0].trim();

      if (type === 'arxiv_id') {
        // Extract just the arxiv ID number (group 2 in the pattern)
        cleanValue =
          match[2] ||
          match[0].replace(/^.*?(\d{4}\.\d{4,5}(?:v\d+)?).*$/, '$1');
      } else if (type === 'patent_no') {
        // Extract just the patent number (group 4 in the pattern)
        cleanValue =
          match[4] || match[0].replace(/^.*?(\d{6,10}[a-z]?\d?).*$/, '$1');
      } else if (type === 'doi') {
        // Extract DOI without prefix
        cleanValue = match[0].replace(/^.*?(10\.\d{4,}\/[^\s]+).*$/, '$1');
      }

      return {
        tier: 'sql',
        intent: 'exact_lookup',
        confidence: 0.95,
        reasoning: `Direct identifier lookup detected: ${type}`,
        identifierLookup: {
          type,
          value: cleanValue,
        },
      };
    }
  }

  // Tier 1 (SQL): Exact date queries
  const datePatterns = [
    {
      pattern:
        /\b(filed|granted|published|created)\s+(in\s+|on\s+|during\s+)?(\d{4})\b/i,
      field: 'dates',
      operation: 'equals' as const,
    },
    {
      pattern:
        /\b(from|after|since)\s+(\d{4})\s+(to|until|before)\s+(\d{4})\b/i,
      field: 'dates',
      operation: 'range' as const,
    },
    {
      pattern: /\b(before|until)\s+(\d{4})\b/i,
      field: 'dates',
      operation: 'before' as const,
    },
    {
      pattern: /\b(after|since)\s+(\d{4})\b/i,
      field: 'dates',
      operation: 'after' as const,
    },
  ];

  for (const { pattern, field, operation } of datePatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        tier: 'sql',
        intent: 'exact_lookup',
        confidence: 0.85,
        reasoning: `Structured date query detected: ${operation}`,
        dateQuery: { field, operation },
      };
    }
  }

  // Tier 2 (Vector): Metadata semantic queries (order matters - more specific first)
  const metadataPatterns = [
    // Specific entity patterns - very high confidence (most specific first)
    {
      pattern: /\b(david\s+fattal'?s?\s+(patents|papers|work))\b/i,
      confidence: 0.95,
      type: 'specific_author',
    },
    {
      pattern: /\b(leia\s+(inc|company)'?s?\s+(patents|work))\b/i,
      confidence: 0.95,
      type: 'specific_company',
    },

    // Company/assignee queries - high confidence (before general author patterns)
    {
      pattern:
        /\b(patents|work)\s+(by|from|assigned\s+to)\s+([a-z\s]+\s+(inc|corp|ltd|llc|company))\b/i,
      confidence: 0.9,
      type: 'company',
    },
    {
      pattern:
        /\b([a-z\s]+\s+(inc|corp|ltd|llc|company))'?s?\s+(patents|work)\b/i,
      confidence: 0.9,
      type: 'company',
    },
    {
      pattern: /\b(what\s+(company|organization|assignee))\b/i,
      confidence: 0.7,
      type: 'company',
    },

    // Author/inventor queries - high confidence
    {
      pattern:
        /\b(papers|patents|documents|work)\s+(by|from|authored\s+by)\s+([a-z\s]+)\b/i,
      confidence: 0.9,
      type: 'author',
    },
    {
      pattern: /\b([a-z\s]+)'?s\s+(papers|patents|documents|work)\b/i,
      confidence: 0.85,
      type: 'author',
    },
    {
      pattern: /\b(who\s+(are|is)\s+)?(inventor|author|creator)s?\s+of\b/i,
      confidence: 0.8,
      type: 'author',
    },
    {
      pattern: /\b(who\s+(invented|created|wrote|developed))\b/i,
      confidence: 0.8,
      type: 'inventor',
    },

    // General metadata queries - medium confidence
    {
      pattern: /\b(which\s+(patents|papers|articles)\s+(by|from))\b/i,
      confidence: 0.7,
      type: 'general',
    },
    {
      pattern: /\b(list\s+(all\s+)?(patents|papers)\s+(by|from))\b/i,
      confidence: 0.75,
      type: 'general',
    },
    {
      pattern:
        /\b(find\s+(documents|papers|patents)\s+(about|on|related\s+to))\b/i,
      confidence: 0.6,
      type: 'general',
    },
  ];

  for (const { pattern, confidence, type } of metadataPatterns) {
    if (pattern.test(lowerQuery)) {
      const docTypeClassification = classifyQueryByDocumentType(query);
      return {
        tier: 'vector',
        intent: 'metadata_semantic',
        confidence: Math.min(
          confidence,
          confidence + docTypeClassification.confidence * 0.1
        ),
        reasoning: `${type} metadata query detected - best served by entity and metadata search`,
        documentTypes: docTypeClassification.documentTypes,
      };
    }
  }

  // Tier 3 (Content): Technical/explanatory queries
  const contentPatterns = [
    // High confidence technical questions
    {
      pattern: /\b(how\s+(does|do|can|is|are))\b/i,
      confidence: 0.85,
      type: 'explanation',
    },
    {
      pattern:
        /\b(what\s+(is|are)\s+(the\s+)?(principle|method|approach|algorithm|technology|mechanism))\b/i,
      confidence: 0.9,
      type: 'definition',
    },
    {
      pattern: /\b(explain|describe|detail|clarify)\b/i,
      confidence: 0.8,
      type: 'explanation',
    },

    // Medium confidence implementation questions
    {
      pattern: /\b(implement|build|create|design|develop)\b/i,
      confidence: 0.7,
      type: 'implementation',
    },
    {
      pattern: /\b(compare|comparison|difference|versus|vs|contrast)\b/i,
      confidence: 0.75,
      type: 'comparison',
    },

    // Lower confidence general questions
    {
      pattern: /\b(advantage|benefit|limitation|problem|issue|challenge)\b/i,
      confidence: 0.65,
      type: 'analysis',
    },
    {
      pattern: /\b(work|function|operate|perform|behave)\b/i,
      confidence: 0.6,
      type: 'function',
    },
  ];

  for (const { pattern, confidence, type } of contentPatterns) {
    if (pattern.test(lowerQuery)) {
      const docTypeClassification = classifyQueryByDocumentType(query);
      return {
        tier: 'content',
        intent: 'content_search',
        confidence: Math.min(
          confidence,
          confidence + docTypeClassification.confidence * 0.1
        ),
        reasoning: `${type} content query detected - best served by detailed technical content`,
        documentTypes: docTypeClassification.documentTypes,
      };
    }
  }

  // Default fallback: Tier 2 (Vector) for general queries
  const docTypeClassification = classifyQueryByDocumentType(query);
  return {
    tier: 'vector',
    intent: 'metadata_semantic',
    confidence: Math.max(0.3, docTypeClassification.confidence),
    reasoning:
      'General query - defaulting to semantic search across metadata and content',
    documentTypes: docTypeClassification.documentTypes,
  };
}

// =======================
// Three-Tier Search Engine
// =======================

export class ThreeTierSearchEngine {
  private supabase: SupabaseClient;
  private personaCache = new Map<string, string>(); // Cache persona_id -> UUID mappings

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Convert persona string ID to UUID
   * Caches results to avoid repeated database lookups
   */
  private async getPersonaUUID(personaId: string): Promise<string | null> {
    // Check cache first
    if (this.personaCache.has(personaId)) {
      return this.personaCache.get(personaId)!;
    }

    try {
      const { data, error } = await this.supabase
        .from('personas')
        .select('id')
        .eq('persona_id', personaId)
        .single();

      if (error || !data) {
        console.warn(`⚠️ Persona '${personaId}' not found in database`);
        return null;
      }

      // Cache the result
      this.personaCache.set(personaId, data.id);
      console.log(`✅ Persona '${personaId}' resolved to UUID: ${data.id}`);
      return data.id;
    } catch (error) {
      console.error(`❌ Error looking up persona '${personaId}':`, error);
      return null;
    }
  }

  /**
   * Main search method with automatic tier selection
   */
  async search(query: TieredSearchQuery): Promise<TieredSearchResult> {
    const startTime = Date.now();

    // Classify query to determine search tier
    const classification =
      query.tier === 'auto' || !query.tier
        ? classifySearchQuery(query.query)
        : {
            tier: query.tier,
            intent: 'content_search',
            confidence: 1.0,
            reasoning: 'Manual tier selection',
          };

    console.log(`🔍 Three-tier search: ${query.query}`);
    console.log(
      `📊 Classification: Tier ${classification.tier.toUpperCase()} (${classification.intent}) - Confidence: ${classification.confidence.toFixed(2)}`
    );
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
          searchResult = await this.executeVectorTierSearch(
            query,
            classification
          );
          break;

        case 'content':
          searchResult = await this.executeContentTierSearch(
            query,
            classification
          );
          break;

        default:
          throw new Error(`Unknown search tier: ${classification.tier}`);
      }

      // Fallback strategy if primary tier returns insufficient results
      if (searchResult.results.length < 3 && classification.confidence < 0.8) {
        console.log(
          `⚡ Low results (${searchResult.results.length}) and confidence - attempting fallback`
        );

        const fallbackClassification =
          this.determineFallbackTier(classification);
        if (fallbackClassification) {
          console.log(
            `🔄 Falling back to Tier ${fallbackClassification.tier.toUpperCase()}`
          );

          const fallbackResults = await this.executeFallbackSearch(
            query,
            fallbackClassification
          );
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
        documentTypes: classification.documentTypes || [],
      },
      executionTime,
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

    let sqlQuery = this.supabase.from('documents').select(`
        id, title, identifiers, dates, actors,
        document_type_id, persona_id, created_at,
        document_types!inner(name)
      `);

    // Apply identifier lookup
    if (classification.identifierLookup) {
      const { type, value } = classification.identifierLookup;
      console.log(`🎯 Identifier lookup: ${type} = ${value}`);

      // Handle different identifier storage formats with comprehensive searching
      if (type === 'arxiv_id') {
        // Check multiple possible fields where arXiv ID might be stored
        sqlQuery = sqlQuery.or(
          `identifiers->>'arxiv_id' = '${value}',identifiers->>'url' LIKE '%${value}%',identifiers @> '{"arxiv_id": "${value}"}',title ILIKE '%${value}%'`
        );
      } else if (type === 'patent_no') {
        // Check multiple patent number formats and fields
        sqlQuery = sqlQuery.or(
          `identifiers->>'patent_no' = '${value}',identifiers->>'patent_number' = '${value}',identifiers->>'url' LIKE '%${value}%',identifiers @> '{"patent_no": "${value}"}',title ILIKE '%${value}%'`
        );
      } else if (type === 'doi') {
        // Check DOI in various formats
        sqlQuery = sqlQuery.or(
          `identifiers->>'doi' = '${value}',identifiers->>'url' LIKE '%${value}%',identifiers @> '{"doi": "${value}"}',title ILIKE '%${value}%'`
        );
      } else {
        // Generic identifier search with broader matching
        sqlQuery = sqlQuery.or(
          `identifiers @> '{"${type}": "${value}"}',identifiers->>'${type}' = '${value}',identifiers->>'url' LIKE '%${value}%'`
        );
      }
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
    if (
      classification.documentTypes &&
      classification.documentTypes.length > 0
    ) {
      sqlQuery = sqlQuery.in(
        'document_types.name',
        classification.documentTypes
      );
    }

    // Filter by persona if specified (convert string to UUID)
    if (query.personaId) {
      const personaUUID = await this.getPersonaUUID(query.personaId);
      if (personaUUID) {
        sqlQuery = sqlQuery.eq('persona_id', personaUUID);
        console.log(
          `🎯 Applied persona filter: ${query.personaId} -> ${personaUUID}`
        );
      } else {
        console.warn(
          `⚠️ Skipping persona filter - persona '${query.personaId}' not found`
        );
        // Continue without persona filter rather than failing
      }
    }

    const { data: documents, error } = await sqlQuery.limit(query.limit || 10);

    if (error) {
      throw new Error(`SQL search failed: ${error.message}`);
    }

    console.log(`✅ SQL search returned ${documents?.length || 0} documents`);

    // Convert documents to search results format
    const results: SearchResult[] = (documents || []).map((doc, index) => {
      // Extract abstract from actors if available, or create summary
      const abstract =
        doc.actors?.abstract ||
        `${doc.title} - ${doc.document_types?.name || 'Document'} from ${doc.dates?.published || 'unknown date'}`;

      return {
        documentId: doc.id,
        chunkId: null,
        score: 1.0 - index * 0.1, // Higher score for exact matches
        content: abstract,
        title: doc.title,
        docType: doc.document_types?.name || 'unknown',
        pageRange: `Document ${index + 1}`,
        sectionTitle: 'Metadata',
        metadata: {
          ...doc,
          identifiers: doc.identifiers,
          dates: doc.dates,
          actors: doc.actors,
        },
      };
    });

    return {
      results,
      totalCount: results.length,
      semanticResults: [],
      keywordResults: results,
      query,
      executionTime: 0, // Will be calculated by parent
    };
  }

  /**
   * Tier 2: Vector search focusing on entity and metadata queries
   */
  private async executeVectorTierSearch(
    query: TieredSearchQuery,
    classification: QueryClassification
  ): Promise<HybridSearchResult> {
    console.log(`🎯 Executing vector tier search (entity/metadata-focused)`);

    // First, try direct entity search
    const entityResults = await this.searchByEntityName(query.query);

    if (entityResults.length > 0) {
      console.log(
        `✅ Found ${entityResults.length} documents via entity search`
      );
      return this.formatEntitySearchResults(entityResults, query);
    }

    // Fallback to actor/author search in documents
    const actorResults = await this.searchByActorName(query.query);

    if (actorResults.length > 0) {
      console.log(`✅ Found ${actorResults.length} documents via actor search`);
      return this.formatEntitySearchResults(actorResults, query);
    }

    // Final fallback: enhanced semantic search with metadata emphasis
    console.log(`🔄 Falling back to semantic search with metadata emphasis`);
    const enhancedQuery: SearchQuery = {
      ...query,
      filters: {
        ...query.filters,
        documentTypes: classification.documentTypes,
      },
    };

    const result = await hybridSearchEngine.search(enhancedQuery);

    // Boost metadata chunk results
    const boostedResults = result.results
      .map(r => ({
        ...r,
        score: r.sectionTitle?.includes('Metadata') ? r.score * 1.5 : r.score,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      ...result,
      results: boostedResults,
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
    const adjustedResults = result.results
      .map(r => ({
        ...r,
        score: r.sectionTitle?.includes('Metadata') ? r.score * 0.7 : r.score,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      ...result,
      results: adjustedResults,
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
  private determineFallbackTier(
    primary: QueryClassification
  ): QueryClassification | null {
    // Only fallback if confidence is low enough to justify it
    if (primary.confidence > 0.85) {
      return null; // High confidence, don't fallback
    }

    switch (primary.tier) {
      case 'sql':
        // SQL -> Vector (try semantic metadata search with broader matching)
        return {
          tier: 'vector',
          intent: 'metadata_semantic',
          confidence: Math.max(0.6, primary.confidence * 0.8),
          reasoning:
            'Fallback from exact identifier lookup to broader semantic metadata search',
          documentTypes: primary.documentTypes,
        };

      case 'vector':
        // Vector -> Content (expand to full content search for broader matches)
        return {
          tier: 'content',
          intent: 'content_search',
          confidence: Math.max(0.5, primary.confidence * 0.7),
          reasoning:
            'Fallback from metadata search to comprehensive content search',
          documentTypes: primary.documentTypes,
        };

      case 'content':
        // Content -> Vector (try more focused metadata search if content seems unfocused)
        if (primary.confidence < 0.6) {
          return {
            tier: 'vector',
            intent: 'metadata_semantic',
            confidence: Math.max(0.4, primary.confidence * 0.6),
            reasoning:
              'Fallback from content search to focused metadata search',
            documentTypes: primary.documentTypes,
          };
        }
        return null; // Don't fallback for content queries with decent confidence

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
      content: 'Content (hybrid search)',
    };

    if (fallbackTier) {
      return `${tierNames[tier]} with fallback to ${tierNames[fallbackTier]}`;
    }

    return tierNames[tier];
  }

  /**
   * Search for documents by entity name in the knowledge graph
   */
  private async searchByEntityName(query: string): Promise<any[]> {
    console.log(`🔍 Searching entities for: ${query}`);

    // Extract potential names from query
    const namePatterns = [
      /(?:papers by|patents by|work by|authored by)\s+([A-Z][a-z]+ [A-Z][a-z]+)/i,
      /([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /([A-Z][A-Za-z0-9]+(?:\s+Inc\.?|\s+Corp\.?|\s+Ltd\.?|\s+LLC)?)/g,
    ];

    const extractedNames: string[] = [];

    for (const pattern of namePatterns) {
      const matches = query.match(pattern);
      if (matches) {
        if (pattern.flags.includes('g')) {
          extractedNames.push(...matches.filter(name => name.length > 3));
        } else {
          extractedNames.push(matches[1] || matches[0]);
        }
      }
    }

    if (extractedNames.length === 0) {
      return [];
    }

    console.log(`🎯 Extracted names: ${extractedNames.join(', ')}`);

    // Search entities table
    const entityQuery = this.supabase
      .from('entities')
      .select('id, name, entity_kind_id, authority_score');

    // Build OR conditions for name matching
    const nameConditions = extractedNames
      .map(name => `name.ilike.%${name.trim()}%`)
      .join(',');

    const { data: entities, error } = await entityQuery
      .or(nameConditions)
      .order('authority_score', { ascending: false })
      .limit(10);

    if (error || !entities || entities.length === 0) {
      console.log(`📭 No entities found`);
      return [];
    }

    console.log(`👥 Found ${entities.length} matching entities`);

    // For now, return empty array as we'd need to implement entity-document relationships
    // This is a placeholder for entity-based document retrieval
    return [];
  }

  /**
   * Search for documents by actor names in the actors JSONB field
   */
  private async searchByActorName(query: string): Promise<any[]> {
    console.log(`🎭 Searching actors for: ${query}`);

    // Extract potential names from query
    const namePatterns = [
      /(?:papers by|patents by|work by|authored by)\s+([A-Z][a-z]+ [A-Z][a-z]+)/i,
      /([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /([A-Z][A-Za-z0-9]+(?:\s+Inc\.?|\s+Corp\.?|\s+Ltd\.?|\s+LLC)?)/g,
    ];

    const extractedNames: string[] = [];

    for (const pattern of namePatterns) {
      const matches = query.match(pattern);
      if (matches) {
        if (pattern.flags.includes('g')) {
          extractedNames.push(...matches.filter(name => name.length > 3));
        } else {
          extractedNames.push(matches[1] || matches[0]);
        }
      }
    }

    if (extractedNames.length === 0) {
      return [];
    }

    console.log(`🎯 Searching for actors: ${extractedNames.join(', ')}`);

    // Search documents by actor names in JSONB
    const actorQuery = this.supabase.from('documents').select(`
        id, title, actors, dates, identifiers,
        document_type_id, persona_id,
        document_types!inner(name)
      `);

    // Build OR conditions for actor name matching
    const actorConditions = extractedNames
      .flatMap(name => [
        `actors->'authors'->0->>'name' ILIKE '%${name.trim()}%'`,
        `actors->'inventors'->0->>'name' ILIKE '%${name.trim()}%'`,
        `actors->'assignees'->0->>'name' ILIKE '%${name.trim()}%'`,
      ])
      .join(',');

    const { data: documents, error } = await actorQuery
      .or(actorConditions)
      .limit(10);

    if (error) {
      console.error(`❌ Actor search error:`, error);
      return [];
    }

    console.log(`📄 Found ${documents?.length || 0} documents by actor search`);
    return documents || [];
  }

  /**
   * Format entity/actor search results into SearchResult format
   */
  private formatEntitySearchResults(
    documents: any[],
    query: TieredSearchQuery
  ): HybridSearchResult {
    const results: SearchResult[] = documents.map((doc, index) => {
      // Create content from document metadata
      const actors = doc.actors || {};
      const authors = actors.authors || [];
      const inventors = actors.inventors || [];
      const assignees = actors.assignees || [];

      const actorSummary = [
        authors.length > 0
          ? `Authors: ${authors.map((a: any) => a.name).join(', ')}`
          : '',
        inventors.length > 0
          ? `Inventors: ${inventors.map((i: any) => i.name).join(', ')}`
          : '',
        assignees.length > 0
          ? `Assignees: ${assignees.map((a: any) => a.name).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('. ');

      const content =
        actorSummary ||
        `${doc.title} - ${doc.document_types?.name || 'Document'}`;

      return {
        documentId: doc.id,
        chunkId: null,
        score: 0.9 - index * 0.1, // High score for entity matches
        content,
        title: doc.title,
        docType: doc.document_types?.name || 'unknown',
        pageRange: `Document ${index + 1}`,
        sectionTitle: 'Entity Match',
        metadata: {
          ...doc,
          matchType: 'entity_search',
        },
      };
    });

    return {
      results,
      totalCount: results.length,
      semanticResults: results,
      keywordResults: [],
      query,
      executionTime: 0,
    };
  }
}

// =======================
// Convenience Functions
// =======================

/**
 * Create three-tier search engine instance
 */
export function createThreeTierSearchEngine(
  supabase: SupabaseClient
): ThreeTierSearchEngine {
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
    ...options,
  });
}
