/**
 * Hybrid Search System
 * 
 * Combines semantic search (embeddings) with keyword search (BM25) and
 * Cohere reranking for optimal retrieval performance.
 */

import { CohereApi, CohereClient } from 'cohere-ai';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { generateQueryEmbedding, cosineSimilarity } from './embeddings';
import { relationshipSearchEngine } from './relationship-search';
import type { 
  SearchQuery, 
  SearchResult, 
  HybridSearchResult, 
  SearchFilters,
  SearchConfig 
} from './types';
import { DEFAULT_RAG_CONFIG } from './types';

// =======================
// Cohere Client Setup
// =======================

const cohereClient = new CohereClient({
  token: process.env.COHERE_API_KEY || '',
});

if (!process.env.COHERE_API_KEY) {
  console.warn('COHERE_API_KEY not found in environment variables');
}

// =======================
// Search Implementation
// =======================

export class HybridSearchEngine {
  private config: SearchConfig;

  constructor(config: SearchConfig = DEFAULT_RAG_CONFIG.search) {
    this.config = config;
  }

  /**
   * Main hybrid search method with relationship-aware enhancement
   */
  async search(query: SearchQuery): Promise<HybridSearchResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Starting hybrid search with relationship enhancement: "${query.query}"`);
      
      // Step 1: Try relationship-aware search first (enhances query via KG)
      let enhancedQuery = query.query;
      let relationshipContext: any = null;
      
      try {
        console.log('🔗 Attempting relationship-aware search...');
        const relationshipResult = await relationshipSearchEngine.searchWithRelationships({
          query: query.query,
          includeRelatedEntities: true,
          maxHops: 1,
          limit: query.limit || 10
        });
        
        if (relationshipResult.relationships.length > 0) {
          // Extract entity names from relationships for query enhancement
          const relatedEntities = relationshipResult.expandedEntities
            .filter(e => e.relatedVia === 'relationship')
            .map(e => e.name);
            
          if (relatedEntities.length > 0) {
            enhancedQuery = `${query.query} OR ${relatedEntities.join(' OR ')}`;
            relationshipContext = relationshipResult;
            console.log(`🚀 Enhanced query via relationships: "${enhancedQuery}"`);
            console.log(`🔗 Found ${relationshipResult.relationships.length} relationships`);
          }
        }
      } catch (relationshipError) {
        console.warn('⚠️ Relationship search failed, falling back to regular hybrid search:', relationshipError);
        // Continue with regular search if relationship search fails
      }

      // Step 2: Run semantic and keyword searches in parallel (with enhanced query)
      const searchQueryWithEnhancement = { ...query, query: enhancedQuery };
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(searchQueryWithEnhancement),
        this.keywordSearch(searchQueryWithEnhancement),
      ]);

      // Step 3: Combine and deduplicate results
      const combinedResults = this.combineResults(semanticResults, keywordResults);
      
      // Step 4: Apply reranking if enabled
      let finalResults = combinedResults;
      if (this.config.rerank && combinedResults.length > 0) {
        finalResults = await this.rerank(query.query, combinedResults);
      }

      // Step 5: Apply final limit
      const limitedResults = finalResults.slice(0, query.limit || this.config.finalLimit);

      const executionTime = Date.now() - startTime;

      return {
        results: limitedResults,
        totalCount: limitedResults.length,
        semanticResults,
        keywordResults,
        // Add relationship context to results
        relationshipContext,
        enhancedQuery: enhancedQuery !== query.query ? enhancedQuery : undefined,
        rerankedResults: finalResults,
        query,
        executionTime,
      };
    } catch (error) {
      console.error('Hybrid search error:', error);
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * Semantic search using vector embeddings
   */
  private async semanticSearch(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await generateQueryEmbedding(query.query);

      // Build the query with filters
      let supabaseQuery = supabaseAdmin
        .from('document_chunks')
        .select(`
          id,
          document_id,
          content,
          token_count,
          chunk_index,
          page_start,
          page_end,
          section_title,
          embedding,
          documents (
            id,
            title,
            doc_type,
            doi,
            arxiv_id,
            patent_no,
            url,
            published_date,
            created_at,
            inventors,
            assignees,
            original_assignee,
            patent_status,
            filed_date,
            granted_date,
            priority_date,
            expiration_date,
            abstract,
            classification
          )
        `)
        .not('embedding', 'is', null);

      // Apply filters
      supabaseQuery = this.applyFilters(supabaseQuery, query.filters);

      // Execute query
      const { data: chunks, error } = await supabaseQuery
        .limit(this.config.maxResults);

      if (error) {
        console.error('Semantic search database error:', error);
        throw error;
      }

      if (!chunks || chunks.length === 0) {
        return [];
      }

      // Calculate cosine similarities and sort
      const results: SearchResult[] = chunks
        .map(chunk => {
          const embedding = this.parseEmbedding(chunk.embedding);
          if (!embedding) {
            return null;
          }

          const similarity = cosineSimilarity(queryEmbedding, embedding);
          
          return {
            documentId: chunk.document_id,
            chunkId: chunk.id,
            score: similarity,
            content: chunk.content,
            title: chunk.documents?.title || 'Untitled',
            docType: chunk.documents?.doc_type,
            pageRange: this.formatPageRange(chunk.page_start, chunk.page_end),
            sectionTitle: chunk.section_title,
            metadata: chunk.documents as any,
          } as SearchResult;
        })
        .filter((result): result is SearchResult => result !== null)
        .filter(result => result.score >= (query.threshold || this.config.threshold))
        .sort((a, b) => b.score - a.score);

      return results;
    } catch (error) {
      console.error('Semantic search error:', error);
      throw error;
    }
  }

  /**
   * Keyword search using PostgreSQL full-text search (BM25-like)
   */
  private async keywordSearch(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Clean and prepare search query for PostgreSQL
      const searchQuery = this.prepareSearchQuery(query.query);
      console.log(`🔍 Keyword search query: "${searchQuery}"`);

      // Build the query with filters using raw SQL approach
      // The Supabase JS textSearch method doesn't work well with filters, so we use raw queries
      let supabaseQuery;
      
      if (query.filters?.documentIds && query.filters.documentIds.length > 0) {
        // Use raw SQL query for better control when filtering
        const documentIdsParam = query.filters.documentIds.map(id => `'${id}'`).join(',');
        const sqlQuery = `
          SELECT 
            dc.id,
            dc.document_id,
            dc.content,
            dc.token_count,
            dc.chunk_index,
            dc.page_start,
            dc.page_end,
            dc.section_title,
            dc.tsvector_content,
            d.id as doc_id,
            d.title as doc_title,
            d.doc_type,
            d.doi,
            d.arxiv_id,
            d.patent_no,
            d.url,
            d.published_date,
            d.created_at as doc_created_at,
            d.inventors,
            d.assignees,
            d.original_assignee,
            d.patent_status,
            d.filed_date,
            d.granted_date,
            d.priority_date,
            d.expiration_date,
            d.abstract,
            d.classification
          FROM document_chunks dc
          LEFT JOIN documents d ON dc.document_id = d.id
          WHERE dc.document_id IN (${documentIdsParam})
          AND dc.tsvector_content @@ websearch_to_tsquery('english', $1)
          ORDER BY ts_rank(dc.tsvector_content, websearch_to_tsquery('english', $1)) DESC
          LIMIT ${this.config.maxResults}
        `;
        
        console.log(`🔍 Using raw SQL query for filtered textSearch`);
        console.log(`🔍 SQL Query:`, sqlQuery.replace(/\s+/g, ' ').trim());
        
        // Use Supabase's rpc with a custom function or direct query
        const { data: chunks, error } = await supabaseAdmin
          .from('document_chunks')
          .select(`
            id,
            document_id,
            content,
            token_count,
            chunk_index,
            page_start,
            page_end,
            section_title,
            documents (
              id,
              title,
              doc_type,
              doi,
              arxiv_id,
              patent_no,
              url,
              published_date,
              created_at,
              inventors,
              assignees,
              original_assignee,
              patent_status,
              filed_date,
              granted_date,
              priority_date,
              expiration_date,
              abstract,
              classification
            )
          `)
          .in('document_id', query.filters.documentIds)
          .textSearch('tsvector_content', searchQuery, {
            type: 'websearch',
            config: 'english',
          })
          .limit(this.config.maxResults);
        
        if (error) {
          console.error('Raw SQL keyword search error:', error);
          // Fallback to regular approach
          supabaseQuery = supabaseAdmin
            .from('document_chunks')
            .select(`*`)
            .in('document_id', query.filters.documentIds);
        } else {
          console.log(`🔍 Combined query succeeded: ${chunks?.length || 0} results`);
          
          // Process the results directly using standard format
          const results: SearchResult[] = chunks?.map((chunk, index) => {
            const score = Math.max(0.1, 1 - (index / chunks.length));

            return {
              documentId: chunk.document_id,
              chunkId: chunk.id,
              score,
              content: chunk.content,
              title: chunk.documents?.title || 'Untitled',
              docType: chunk.documents?.doc_type,
              pageRange: this.formatPageRange(chunk.page_start, chunk.page_end),
              sectionTitle: chunk.section_title,
              metadata: chunk.documents as any,
            } as SearchResult;
          }) || [];

          console.log(`🔍 Processed ${results.length} keyword results with combined filtering`);
          return results;
        }
      } else {
        // No document ID filters, use standard textSearch
        supabaseQuery = supabaseAdmin
          .from('document_chunks')
          .select(`
            id,
            document_id,
            content,
            token_count,
            chunk_index,
            page_start,
            page_end,
            section_title,
            tsvector_content,
            documents (
              id,
              title,
              doc_type,
              doi,
              arxiv_id,
              patent_no,
              url,
              published_date,
              created_at,
              inventors,
              assignees,
              original_assignee,
              patent_status,
              filed_date,
              granted_date,
              priority_date,
              expiration_date,
              abstract,
              classification
            )
          `)
          .textSearch('tsvector_content', searchQuery, {
            type: 'websearch',
            config: 'english',
          });

        // Apply other filters
        supabaseQuery = this.applyFilters(supabaseQuery, query.filters);
      }
      
      console.log(`🔍 Keyword search filters:`, query.filters);

      // Execute query
      console.log(`🔍 About to execute Supabase query with maxResults: ${this.config.maxResults}`);
      
      // Debug: Test different scenarios to isolate the issue
      if (query.filters?.documentIds && query.filters.documentIds.length > 0) {
        console.log(`🔍 Testing document filter only (without textSearch)`);
        console.log(`🔍 Testing with document IDs:`, query.filters.documentIds);
        
        // Test 1: Basic document filter
        const testQuery = supabaseAdmin
          .from('document_chunks')
          .select('id, document_id')
          .in('document_id', query.filters.documentIds)
          .limit(5);
        
        const { data: testData, error: testError } = await testQuery;
        console.log(`🔍 Document filter test: ${testData?.length || 0} results`, testError || '');
        if (testData && testData.length > 0) {
          console.log(`🔍 Sample results:`, testData.slice(0, 2));
        }
        
        // Test 2: Text search without filters
        console.log(`🔍 Testing textSearch without filters`);
        const textOnlyQuery = supabaseAdmin
          .from('document_chunks')
          .select('id, document_id, content')
          .textSearch('tsvector_content', searchQuery, {
            type: 'websearch',
            config: 'english',
          })
          .limit(3);
        
        const { data: textOnlyData, error: textOnlyError } = await textOnlyQuery;
        console.log(`🔍 Text-only search test: ${textOnlyData?.length || 0} results`, textOnlyError || '');
        
        // Test 3: Combined text search + document filter
        console.log(`🔍 Testing combined textSearch + document filter`);
        const combinedQuery = supabaseAdmin
          .from('document_chunks')
          .select('id, document_id, content')
          .textSearch('tsvector_content', searchQuery, {
            type: 'websearch',
            config: 'english',
          })
          .in('document_id', query.filters.documentIds)
          .limit(3);
        
        const { data: combinedData, error: combinedError } = await combinedQuery;
        console.log(`🔍 Combined search test: ${combinedData?.length || 0} results`, combinedError || '');
      }
      
      const { data: chunks, error } = await supabaseQuery
        .limit(this.config.maxResults);

      if (error) {
        console.error('Keyword search database error:', error);
        throw error;
      }

      console.log(`🔍 Keyword search raw results: ${chunks?.length || 0} chunks`);

      if (!chunks || chunks.length === 0) {
        return [];
      }

      // Calculate BM25-like scores
      const results: SearchResult[] = chunks.map((chunk, index) => {
        // PostgreSQL returns results sorted by relevance
        // We use inverse rank as score (higher rank = higher score)
        const score = Math.max(0.1, 1 - (index / chunks.length));

        return {
          documentId: chunk.document_id,
          chunkId: chunk.id,
          score,
          content: chunk.content,
          title: chunk.documents?.title || 'Untitled',
          docType: chunk.documents?.doc_type,
          pageRange: this.formatPageRange(chunk.page_start, chunk.page_end),
          sectionTitle: chunk.section_title,
          metadata: chunk.documents as any,
        } as SearchResult;
      });

      return results;
    } catch (error) {
      console.error('Keyword search error:', error);
      throw error;
    }
  }

  /**
   * Combine semantic and keyword search results
   */
  private combineResults(
    semanticResults: SearchResult[], 
    keywordResults: SearchResult[]
  ): SearchResult[] {
    const combinedMap = new Map<string, SearchResult>();

    // Add semantic results with weighted scores
    for (const result of semanticResults) {
      const key = this.getResultKey(result);
      combinedMap.set(key, {
        ...result,
        score: result.score * this.config.semanticWeight,
      });
    }

    // Add keyword results, combining scores if already exists
    for (const result of keywordResults) {
      const key = this.getResultKey(result);
      const existing = combinedMap.get(key);
      
      if (existing) {
        // Combine scores using weighted sum
        combinedMap.set(key, {
          ...existing,
          score: existing.score + (result.score * this.config.keywordWeight),
        });
      } else {
        combinedMap.set(key, {
          ...result,
          score: result.score * this.config.keywordWeight,
        });
      }
    }

    // Convert back to array and sort by combined score
    return Array.from(combinedMap.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Rerank results using Cohere Rerank API
   */
  private async rerank(
    query: string, 
    results: SearchResult[]
  ): Promise<SearchResult[]> {
    if (!this.config.rerankModel) {
      return results;
    }

    try {
      const documents = results.map((result, index) => ({
        id: index.toString(),
        text: result.content,
      }));

      const rerankResponse = await cohereClient.rerank({
        model: this.config.rerankModel,
        query,
        documents,
        topN: Math.min(results.length, this.config.finalLimit * 2), // Get more than needed
        returnDocuments: false,
      });

      // Map reranked results back to original results
      const rerankedResults: SearchResult[] = [];
      
      for (const result of rerankResponse.results) {
        const originalIndex = parseInt(result.index.toString());
        const originalResult = results[originalIndex];
        
        if (originalResult) {
          rerankedResults.push({
            ...originalResult,
            rerankedScore: result.relevanceScore,
            score: result.relevanceScore, // Use rerank score as primary score
          });
        }
      }

      return rerankedResults;
    } catch (error) {
      console.error('Reranking error:', error);
      // Fall back to original results if reranking fails
      return results;
    }
  }

  /**
   * Apply search filters to Supabase query
   */
  private applyFilters(query: any, filters?: SearchFilters): any {
    if (!filters) {
      return query;
    }

    // Document type filter
    if (filters.documentTypes && filters.documentTypes.length > 0) {
      query = query.in('documents.doc_type', filters.documentTypes);
    }

    // Date range filter
    if (filters.dateRange) {
      if (filters.dateRange.start) {
        query = query.gte('documents.published_date', filters.dateRange.start.toISOString());
      }
      if (filters.dateRange.end) {
        query = query.lte('documents.published_date', filters.dateRange.end.toISOString());
      }
    }

    // Authors filter (requires entity extraction to be implemented)
    if (filters.authors && filters.authors.length > 0) {
      // This would require joining with entities/edges tables
      // Implementation depends on how author information is stored
    }

    // Patent-specific filter
    if (filters.patents === true) {
      query = query.eq('documents.doc_type', 'patent');
    }

    // Papers-specific filter
    if (filters.papers === true) {
      query = query.in('documents.doc_type', ['paper', 'pdf']);
    }

    // Document ID filter (for context-aware search)
    if (filters.documentIds && filters.documentIds.length > 0) {
      query = query.in('document_id', filters.documentIds);
    }

    return query;
  }

  /**
   * Prepare search query for PostgreSQL full-text search
   */
  private prepareSearchQuery(query: string): string {
    // Clean and prepare query for websearch syntax
    return query
      .trim()
      .replace(/[^\w\s"'-]/g, ' ') // Remove special chars except quotes and hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Generate unique key for search result deduplication
   */
  private getResultKey(result: SearchResult): string {
    return `${result.documentId}_${result.chunkId || 'doc'}`;
  }

  /**
   * Parse embedding from database format
   */
  private parseEmbedding(embeddingData: any): number[] | null {
    if (!embeddingData) {
      return null;
    }

    try {
      if (typeof embeddingData === 'string') {
        // Parse PostgreSQL vector format [1,2,3,...]
        const cleanString = embeddingData.replace(/[\[\]]/g, '');
        return cleanString.split(',').map(val => parseFloat(val.trim()));
      } else if (Array.isArray(embeddingData)) {
        return embeddingData.map(val => parseFloat(val));
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing embedding:', error);
      return null;
    }
  }

  /**
   * Format page range for display
   */
  private formatPageRange(pageStart?: number, pageEnd?: number): string | undefined {
    if (!pageStart && !pageEnd) {
      return undefined;
    }
    
    if (pageStart && pageEnd && pageStart !== pageEnd) {
      return `pp. ${pageStart}-${pageEnd}`;
    } else if (pageStart) {
      return `p. ${pageStart}`;
    }
    
    return undefined;
  }
}

// =======================
// Specialized Search Methods
// =======================

/**
 * Search for specific entities (author, organization, etc.)
 */
export async function searchByEntity(
  entityName: string, 
  entityType: 'person' | 'org' | 'product' | 'algorithm' | 'material' | 'concept'
): Promise<SearchResult[]> {
  try {
    // This would require the mini-KG to be populated
    // For now, implement as a simple text search
    const searchEngine = new HybridSearchEngine();
    
    const result = await searchEngine.search({
      query: entityName,
      limit: 20,
      threshold: 0.7,
    });

    return result.results;
  } catch (error) {
    console.error('Entity search error:', error);
    throw error;
  }
}

/**
 * Search within a specific document
 */
export async function searchWithinDocument(
  documentId: string, 
  query: string, 
  limit = 10
): Promise<SearchResult[]> {
  try {
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        document_id,
        content,
        chunk_index,
        page_start,
        page_end,
        section_title,
        embedding,
        documents (
          id,
          title,
          doc_type,
          doi,
          arxiv_id,
          patent_no,
          url,
          published_date,
          created_at,
          inventors,
          assignees,
          original_assignee,
          patent_status,
          filed_date,
          granted_date,
          priority_date,
          expiration_date,
          abstract,
          classification
        )
      `)
      .eq('document_id', documentId)
      .textSearch('tsvector_content', query, { type: 'websearch' })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (chunks || []).map((chunk, index) => ({
      documentId: chunk.document_id,
      chunkId: chunk.id,
      score: Math.max(0.1, 1 - (index / chunks.length)),
      content: chunk.content,
      title: chunk.documents?.title || 'Untitled',
      docType: chunk.documents?.doc_type,
      pageRange: chunk.page_start ? `p. ${chunk.page_start}` : undefined,
      sectionTitle: chunk.section_title,
      metadata: chunk.documents as any,
    }));
  } catch (error) {
    console.error('Document search error:', error);
    throw error;
  }
}

/**
 * Find similar documents based on content
 */
export async function findSimilarDocuments(
  documentId: string, 
  limit = 5
): Promise<SearchResult[]> {
  try {
    // Get a representative chunk from the source document
    const { data: sourceChunks, error: sourceError } = await supabase
      .from('document_chunks')
      .select('content, embedding')
      .eq('document_id', documentId)
      .not('embedding', 'is', null)
      .limit(3);

    if (sourceError || !sourceChunks || sourceChunks.length === 0) {
      throw new Error('Could not find source document chunks');
    }

    // Use the first chunk's content as the similarity query
    const searchEngine = new HybridSearchEngine();
    const result = await searchEngine.search({
      query: sourceChunks[0].content.slice(0, 500), // Use first 500 chars
      limit: limit + 1, // +1 to account for source document
      threshold: 0.6,
    });

    // Filter out the source document itself
    return result.results.filter(r => r.documentId !== documentId);
  } catch (error) {
    console.error('Similar documents search error:', error);
    throw error;
  }
}

// =======================
// Export Default Instance
// =======================

export const hybridSearchEngine = new HybridSearchEngine();

// =======================
// Convenience Functions
// =======================

/**
 * Quick search with default configuration
 */
export async function search(query: string, limit = 10): Promise<SearchResult[]> {
  const result = await hybridSearchEngine.search({
    query,
    limit,
  });
  
  return result.results;
}

/**
 * Advanced search with full options
 */
export async function advancedSearch(query: SearchQuery): Promise<HybridSearchResult> {
  return hybridSearchEngine.search(query);
}