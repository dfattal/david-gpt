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
      
      // Step 3.5: Apply document type relevance scoring
      const typeAdjustedResults = this.applyDocumentTypeScoring(query.query, combinedResults);
      
      // Step 4: Apply advanced reranking if enabled
      let finalResults = typeAdjustedResults;
      let rerankMetrics = undefined;
      
      if (this.config.rerank && typeAdjustedResults.length > 0) {
        const { advancedRerank, QueryIntent } = await import('./advanced-reranking');
        
        // Use query transformation intent if available
        let queryIntent: any = undefined;
        try {
          const { analyzeQuery } = await import('./query-transformation');
          queryIntent = await analyzeQuery(query.query);
        } catch (error) {
          console.warn('Could not analyze query intent for reranking:', error);
        }
        
        const targetCount = query.limit || this.config.finalLimit;
        const rerankResult = await advancedRerank(
          query, 
          typeAdjustedResults, 
          queryIntent, 
          targetCount
        );
        
        finalResults = rerankResult.results;
        rerankMetrics = rerankResult.metrics;
        
        console.log(`🎯 Advanced reranking: ${rerankResult.strategy} strategy`);
        console.log(`   Avg relevance: ${rerankResult.metrics.averageRelevance.toFixed(3)}`);
        console.log(`   Diversity: ${rerankResult.metrics.diversityScore.toFixed(3)}`);
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
        rerankMetrics, // Include advanced reranking metrics
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
            url,
            created_at,
            identifiers,
            dates,
            actors
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
            d.url,
            d.created_at as doc_created_at,
            d.identifiers,
            d.dates,
            d.actors
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
              url,
              created_at,
              identifiers,
              dates,
              actors
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
              url,
              created_at,
              identifiers,
              dates,
              actors
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
   * Apply document type relevance scoring based on query intent
   */
  private applyDocumentTypeScoring(query: string, results: SearchResult[]): SearchResult[] {
    const queryIntent = this.classifyQueryIntent(query);
    
    return results.map(result => {
      const docTypeBoost = this.calculateDocumentTypeBoost(queryIntent, result.docType, result.metadata);
      const recencyBoost = this.calculateRecencyBoost(queryIntent, result.docType, result.metadata);
      const productNameBoost = this.calculateProductNameBoost(query, result);
      
      const totalBoost = docTypeBoost * recencyBoost * productNameBoost;
      const adjustedScore = result.score * totalBoost;
      
      if (totalBoost !== 1.0) {
        console.log(`📊 Document type scoring: ${result.title.substring(0, 50)}... - ${result.docType} - Boost: ${totalBoost.toFixed(2)} (${result.score.toFixed(3)} → ${adjustedScore.toFixed(3)})`);
      }
      
      return {
        ...result,
        score: adjustedScore,
        typeBoost: totalBoost,
      };
    }).sort((a, b) => b.score - a.score); // Re-sort by adjusted scores
  }

  /**
   * Classify query intent to determine document type preferences
   */
  private classifyQueryIntent(query: string): 'product' | 'technical' | 'academic' | 'general' {
    const lowerQuery = query.toLowerCase();
    
    // Product/Launch queries - favor press articles and recent content
    const productIndicators = [
      'launch', 'announce', 'release', 'new', 'latest', 'product', 'device',
      'monitor', 'display', 'gaming', 'smartphone', 'tablet', 'tv',
      'odyssey', 'galaxy', 'iphone', 'samsung', 'apple', 'specs', 'features',
      'price', 'availability', 'review'
    ];
    
    // Technical/Invention queries - favor patents and technical papers
    const technicalIndicators = [
      'patent', 'invention', 'method', 'system', 'apparatus', 'algorithm',
      'implementation', 'architecture', 'design', 'mechanism', 'process',
      'technique', 'approach', 'solution', 'technology behind', 'how does',
      'principle', 'theory'
    ];
    
    // Academic queries - favor papers and academic content
    const academicIndicators = [
      'research', 'study', 'paper', 'publication', 'journal', 'conference',
      'analysis', 'evaluation', 'comparison', 'survey', 'review',
      'experiment', 'results', 'findings', 'conclusion'
    ];
    
    const productScore = productIndicators.filter(indicator => lowerQuery.includes(indicator)).length;
    const technicalScore = technicalIndicators.filter(indicator => lowerQuery.includes(indicator)).length;
    const academicScore = academicIndicators.filter(indicator => lowerQuery.includes(indicator)).length;
    
    if (productScore > technicalScore && productScore > academicScore) {
      return 'product';
    } else if (technicalScore > academicScore) {
      return 'technical';
    } else if (academicScore > 0) {
      return 'academic';
    } else {
      return 'general';
    }
  }

  /**
   * Calculate document type relevance boost based on query intent
   */
  private calculateDocumentTypeBoost(intent: string, docType: string, metadata: any): number {
    const boosts: Record<string, Record<string, number>> = {
      'product': {
        'url': 1.4,      // Press articles get big boost for product queries
        'paper': 0.9,    // Academic papers less relevant for product info
        'patent': 0.7,   // Patents much less relevant for current products
        'pdf': 1.0,      // Neutral
        'note': 1.1,     // Personal notes slightly favored
        'book': 0.8      // Books less current
      },
      'technical': {
        'patent': 1.3,   // Patents highly relevant for technical details
        'paper': 1.2,    // Academic papers also good for technical info
        'url': 0.9,      // Press articles less technical depth
        'pdf': 1.1,      // Technical PDFs relevant
        'note': 1.0,     // Neutral
        'book': 1.0      // Technical books relevant
      },
      'academic': {
        'paper': 1.3,    // Academic papers most relevant
        'pdf': 1.2,      // Academic PDFs relevant
        'patent': 1.0,   // Patents can be relevant for academic work
        'url': 0.8,      // Press articles less academic
        'note': 0.9,     // Personal notes less authoritative
        'book': 1.1      // Academic books relevant
      },
      'general': {
        'url': 1.0,      // No bias for general queries
        'paper': 1.0,
        'patent': 1.0,
        'pdf': 1.0,
        'note': 1.0,
        'book': 1.0
      }
    };
    
    return boosts[intent]?.[docType] || 1.0;
  }

  /**
   * Calculate recency boost for time-sensitive content types
   */
  private calculateRecencyBoost(intent: string, docType: string, metadata: any): number {
    // Only apply recency boost for product queries and press articles
    if (intent !== 'product' || docType !== 'url') {
      return 1.0;
    }
    
    const publishedDate = metadata?.dates?.published || metadata?.dates?.created || metadata?.created_at;
    if (!publishedDate) {
      return 1.0;
    }
    
    const now = new Date();
    const docDate = new Date(publishedDate);
    const ageInDays = (now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Boost recent press articles for product queries
    if (ageInDays < 30) {
      return 1.2; // 20% boost for very recent articles
    } else if (ageInDays < 365) {
      return 1.1; // 10% boost for articles within a year
    } else if (ageInDays < 730) {
      return 1.0; // No boost for 1-2 year old articles
    } else {
      return 0.9; // Slight penalty for older articles
    }
  }

  /**
   * Calculate product name boost for exact product matches
   */
  private calculateProductNameBoost(query: string, result: SearchResult): number {
    const lowerQuery = query.toLowerCase();
    const fullText = `${result.title} ${result.content}`.toLowerCase();
    
    // Extract specific product names from common queries
    const productPatterns = [
      // Samsung products
      { pattern: /samsung\s+odyssey\s+3d/i, boost: 3.0, name: 'Samsung Odyssey 3D' },
      { pattern: /odyssey\s+3d/i, boost: 2.5, name: 'Odyssey 3D' },
      { pattern: /samsung\s+odyssey/i, boost: 2.0, name: 'Samsung Odyssey' },
      
      // Apple products
      { pattern: /iphone\s+\d+(\s+pro)?/i, boost: 2.5, name: 'iPhone' },
      { pattern: /ipad(\s+pro)?/i, boost: 2.5, name: 'iPad' },
      { pattern: /macbook(\s+pro)?/i, boost: 2.5, name: 'MacBook' },
      
      // Generic products
      { pattern: /gaming\s+monitor/i, boost: 1.5, name: 'Gaming Monitor' },
      { pattern: /3d\s+display/i, boost: 1.5, name: '3D Display' },
      { pattern: /lightfield\s+display/i, boost: 1.8, name: 'Lightfield Display' },
      
      // Company names for product queries
      { pattern: /leia\s+technology/i, boost: 1.7, name: 'Leia Technology' },
      { pattern: /leia\s+inc/i, boost: 1.7, name: 'Leia Inc' },
    ];
    
    let maxBoost = 1.0;
    let matchedProduct = '';
    
    // Check for product name matches in both query and document
    for (const { pattern, boost, name } of productPatterns) {
      const queryMatches = pattern.test(lowerQuery);
      const docMatches = pattern.test(fullText);
      
      if (queryMatches && docMatches) {
        if (boost > maxBoost) {
          maxBoost = boost;
          matchedProduct = name;
        }
      }
    }
    
    // Additional boost for exact title matches
    if (maxBoost > 1.0) {
      // Check if the title contains a very close match
      const titleMatch = productPatterns.some(({ pattern }) => 
        pattern.test(result.title.toLowerCase()) && pattern.test(lowerQuery)
      );
      
      if (titleMatch) {
        maxBoost *= 1.2; // 20% additional boost for title matches
      }
    }
    
    if (maxBoost > 1.0) {
      console.log(`🎯 Product name boost: ${result.title.substring(0, 50)}... - Matched "${matchedProduct}" - Boost: ${maxBoost.toFixed(2)}`);
    }
    
    return maxBoost;
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

    // Date range filter (using JSONB dates field)
    if (filters.dateRange) {
      if (filters.dateRange.start) {
        query = query.gte('documents.dates->published', filters.dateRange.start.toISOString().split('T')[0]);
      }
      if (filters.dateRange.end) {
        query = query.lte('documents.dates->published', filters.dateRange.end.toISOString().split('T')[0]);
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
          url,
          created_at,
          identifiers,
          dates,
          actors
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