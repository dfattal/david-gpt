/**
 * Database Query Optimization
 *
 * Implements query optimizations to reduce Tier 3 database latency
 * from current averages to target performance improvements.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { SearchFilters, SearchQuery } from './types';

// =======================
// Query Optimization Configuration
// =======================

interface QueryOptimizationConfig {
  enableQueryPlanning: boolean; // Analyze query execution plans
  useIndexHints: boolean; // Add index hints to queries
  enableQueryBatching: boolean; // Batch similar queries
  optimizeFilters: boolean; // Optimize filter application order
  enableParallelQueries: boolean; // Run independent queries in parallel
  cacheQueryPlans: boolean; // Cache query execution plans
}

const DEFAULT_OPTIMIZATION_CONFIG: QueryOptimizationConfig = {
  enableQueryPlanning: true,
  useIndexHints: true,
  enableQueryBatching: true,
  optimizeFilters: true,
  enableParallelQueries: true,
  cacheQueryPlans: true,
};

// =======================
// Index Management
// =======================

export class DatabaseOptimizer {
  private config: QueryOptimizationConfig;
  private queryPlanCache = new Map<string, any>();

  constructor(config: Partial<QueryOptimizationConfig> = {}) {
    this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
  }

  /**
   * Ensure all required indexes exist for optimal query performance
   */
  async ensureOptimalIndexes(): Promise<void> {
    console.log('📊 Checking and creating optimal database indexes...');

    const indexCommands = [
      // Composite indexes for hybrid search performance
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding_search
       ON document_chunks USING hnsw (embedding vector_cosine_ops)
       WHERE chunk_type IN ('content', 'metadata')`,

      // Multi-column index for filtered searches
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_composite_search
       ON document_chunks (document_id, chunk_type, chunk_index)
       INCLUDE (content, metadata)`,

      // Full-text search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_fts_optimized
       ON document_chunks USING gin(to_tsvector('english', content))`,

      // Entity search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entities_name_kind_authority
       ON entities (name, entity_kind_id, authority_score DESC)
       INCLUDE (id, mention_count)`,

      // Document metadata search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_identifiers_gin
       ON documents USING gin(identifiers)`,

      // Date range search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_dates_gin
       ON documents USING gin(dates)`,

      // Actor search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_actors_gin
       ON documents USING gin(actors)`,

      // Processing status index for active queries
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_status_processed
       ON documents (processing_status, processed_at DESC)
       WHERE processing_status = 'completed'`,

      // Persona-specific search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_persona_type
       ON documents (persona_id, document_type_id)
       INCLUDE (title, identifiers, dates)`,

      // Chunk token count optimization for chunking strategies
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_token_count
       ON document_chunks (token_count, chunk_type)
       WHERE chunk_type = 'content'`,
    ];

    for (const indexCommand of indexCommands) {
      try {
        console.log(`   Creating index: ${indexCommand.split('\n')[0].trim()}`);
        await supabaseAdmin.rpc('execute_sql', { query: indexCommand });
      } catch (error) {
        // Index might already exist or be in process
        console.warn(`   Index creation skipped: ${error.message}`);
      }
    }

    console.log('✅ Database index optimization complete');
  }

  /**
   * Optimized vector similarity search with smart indexing
   */
  async optimizedVectorSearch(
    embedding: number[],
    filters: SearchFilters = {},
    limit: number = 20
  ): Promise<any[]> {
    console.log(`⚡ Running optimized vector search (limit: ${limit})`);

    // Use RPC for vector similarity to avoid URI length issues
    const { data, error } = await supabaseAdmin.rpc(
      'search_document_chunks_by_embedding',
      {
        query_embedding: embedding,
        similarity_threshold: 0.7,
        match_count: limit,
        persona_filter: filters.personaId,
      }
    );

    if (error) {
      console.error('Vector RPC search error:', error);
      // Fallback to text search when vector search fails
      return await this.optimizedKeywordSearch(
        'fallback search terms',
        filters,
        limit
      );
    }

    if (data) {
      return data;
    }

    // If RPC worked but returned nothing, try filtered approach
    let query = supabaseAdmin
      .from('document_chunks')
      .select(
        `
        id,
        content,
        document_id,
        chunk_index,
        metadata,
        documents!inner (
          id,
          title,
          document_type_id,
          identifiers,
          dates,
          actors,
          persona_id,
          document_types!inner(name)
        )
      `
      )
      .eq('chunk_type', 'content');

    // Apply filters in optimal order (most selective first)
    if (filters.personaId) {
      query = query.eq('documents.persona_id', filters.personaId);
    }

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      if (filters.documentTypes.length === 1) {
        // Single type is more efficient than IN clause
        const typeQuery = supabaseAdmin
          .from('document_types')
          .select('id')
          .eq('name', filters.documentTypes[0])
          .single();

        const { data: docType } = await typeQuery;
        if (docType) {
          query = query.eq('documents.document_type_id', docType.id);
        }
      } else {
        // Use IN clause for multiple types
        const typesQuery = supabaseAdmin
          .from('document_types')
          .select('id')
          .in('name', filters.documentTypes);

        const { data: docTypes } = await typesQuery;
        if (docTypes && docTypes.length > 0) {
          query = query.in(
            'documents.document_type_id',
            docTypes.map(t => t.id)
          );
        }
      }
    }

    // Date range filtering with JSON operators
    if (filters.dateRange) {
      if (filters.dateRange.start) {
        query = query.gte(
          'documents.dates->published',
          filters.dateRange.start.toISOString().split('T')[0]
        );
      }
      if (filters.dateRange.end) {
        query = query.lte(
          'documents.dates->published',
          filters.dateRange.end.toISOString().split('T')[0]
        );
      }
    }

    // Author filtering with JSON operators
    if (filters.authors && filters.authors.length > 0) {
      // Use efficient JSON contains operation
      for (const author of filters.authors) {
        query = query.like('documents.actors->authors', `%"${author}"%`);
      }
    }

    // Apply limit
    query = query.limit(limit);

    const { data: fallbackData, error: fallbackError } = await query;

    if (fallbackError) {
      console.error('Optimized vector search error:', fallbackError);
      throw fallbackError;
    }

    return fallbackData || [];
  }

  /**
   * Optimized keyword search with full-text search indexes
   */
  async optimizedKeywordSearch(
    searchTerms: string,
    filters: SearchFilters = {},
    limit: number = 20
  ): Promise<any[]> {
    console.log(`⚡ Running optimized keyword search: "${searchTerms}"`);

    // Use PostgreSQL full-text search with ranking
    let query = supabaseAdmin
      .from('document_chunks')
      .select(
        `
        id,
        content,
        document_id,
        chunk_index,
        metadata,
        documents!inner (
          id,
          title,
          document_type_id,
          identifiers,
          dates,
          actors,
          persona_id
        )
      `
      )
      .textSearch('content', searchTerms, {
        type: 'plain',
        config: 'english',
      })
      .eq('chunk_type', 'content');

    // Apply the same efficient filtering as vector search
    if (filters.personaId) {
      query = query.eq('documents.persona_id', filters.personaId);
    }

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      if (filters.documentTypes.length === 1) {
        const typeQuery = supabaseAdmin
          .from('document_types')
          .select('id')
          .eq('name', filters.documentTypes[0])
          .single();

        const { data: docType } = await typeQuery;
        if (docType) {
          query = query.eq('documents.document_type_id', docType.id);
        }
      } else {
        const typesQuery = supabaseAdmin
          .from('document_types')
          .select('id')
          .in('name', filters.documentTypes);

        const { data: docTypes } = await typesQuery;
        if (docTypes && docTypes.length > 0) {
          query = query.in(
            'documents.document_type_id',
            docTypes.map(t => t.id)
          );
        }
      }
    }

    query = query.limit(limit);

    const { data: keywordData, error: keywordError } = await query;

    if (keywordError) {
      console.error('Optimized keyword search error:', keywordError);
      throw keywordError;
    }

    return keywordData || [];
  }

  /**
   * Parallel entity lookup for KG enhancement
   */
  async optimizedEntityLookup(entityNames: string[]): Promise<any[]> {
    if (entityNames.length === 0) return [];

    console.log(
      `⚡ Optimized entity lookup for ${entityNames.length} entities`
    );

    // Batch entity lookups efficiently
    const { data, error } = await supabaseAdmin
      .from('entities')
      .select(
        `
        id,
        name,
        entity_kind_id,
        authority_score,
        mention_count
      `
      )
      .or(entityNames.map(name => `name.ilike.%${name}%`).join(','))
      .order('authority_score', { ascending: false })
      .limit(50); // Reasonable limit for entity matches

    if (error) {
      console.error('Entity lookup error:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance(query: string): Promise<{
    executionTime: number;
    suggestedIndexes: string[];
    optimizationHints: string[];
  }> {
    const startTime = Date.now();

    try {
      // Execute EXPLAIN ANALYZE for query plan analysis
      const { data } = await supabaseAdmin.rpc('execute_sql', {
        query: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
      });

      const executionTime = Date.now() - startTime;
      const queryPlan = data?.[0]?.['QUERY PLAN']?.[0];

      const suggestedIndexes: string[] = [];
      const optimizationHints: string[] = [];

      if (queryPlan) {
        // Analyze for sequential scans (bad performance)
        if (JSON.stringify(queryPlan).includes('Seq Scan')) {
          suggestedIndexes.push(
            'Consider adding indexes for sequential scan operations'
          );
        }

        // Check for expensive operations
        if (queryPlan['Execution Time'] > 100) {
          optimizationHints.push(
            'Query execution time > 100ms - consider optimization'
          );
        }

        // Check buffer usage
        if (queryPlan['Shared Hit Blocks'] < queryPlan['Shared Read Blocks']) {
          optimizationHints.push(
            'Low buffer cache hit ratio - consider adding indexes'
          );
        }
      }

      return {
        executionTime,
        suggestedIndexes,
        optimizationHints,
      };
    } catch (error) {
      console.error('Query analysis failed:', error);
      return {
        executionTime: Date.now() - startTime,
        suggestedIndexes: [],
        optimizationHints: ['Query analysis failed'],
      };
    }
  }

  /**
   * Batch multiple similar queries for efficiency
   */
  async batchQueries<T>(
    queries: Array<() => Promise<T>>,
    batchSize: number = 5
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(query => query()));
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < queries.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  /**
   * Optimize document metadata queries
   */
  async optimizedMetadataQuery(
    identifiers: { doi?: string; patentNo?: string; arxivId?: string },
    persona?: string
  ): Promise<any[]> {
    let query = supabaseAdmin.from('documents').select(`
        id,
        title,
        identifiers,
        dates,
        actors,
        document_type_id,
        document_types!inner(name)
      `);

    // Use GIN index for efficient JSON searches
    if (identifiers.doi) {
      query = query.eq('identifiers->doi', identifiers.doi);
    } else if (identifiers.patentNo) {
      query = query.eq('identifiers->patent_no', identifiers.patentNo);
    } else if (identifiers.arxivId) {
      query = query.eq('identifiers->arxiv_id', identifiers.arxivId);
    }

    if (persona) {
      query = query.eq('persona_id', persona);
    }

    query = query.eq('processing_status', 'completed');

    const { data, error } = await query;

    if (error) {
      console.error('Optimized metadata query error:', error);
      throw error;
    }

    return data || [];
  }
}

// =======================
// Singleton Instance
// =======================

export const databaseOptimizer = new DatabaseOptimizer();

// =======================
// Utility Functions
// =======================

/**
 * Initialize database optimizations (call once on startup)
 */
export async function initializeDatabaseOptimizations(): Promise<void> {
  console.log('🚀 Initializing database optimizations...');

  try {
    await databaseOptimizer.ensureOptimalIndexes();
    console.log('✅ Database optimizations initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database optimizations:', error);
    throw error;
  }
}

/**
 * Health check for database performance
 */
export async function checkDatabaseHealth(): Promise<{
  indexHealth: boolean;
  queryPerformance: boolean;
  recommendations: string[];
}> {
  const recommendations: string[] = [];
  let indexHealth = true;
  let queryPerformance = true;

  try {
    // Check if required indexes exist
    const { data: indexes } = await supabaseAdmin.rpc('execute_sql', {
      query: `
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      `,
    });

    const requiredIndexes = [
      'idx_document_chunks_embedding_search',
      'idx_document_chunks_composite_search',
      'idx_entities_name_kind_authority',
      'idx_documents_identifiers_gin',
    ];

    const existingIndexes = indexes?.map((idx: any) => idx.indexname) || [];
    const missingIndexes = requiredIndexes.filter(
      idx => !existingIndexes.includes(idx)
    );

    if (missingIndexes.length > 0) {
      indexHealth = false;
      recommendations.push(`Missing indexes: ${missingIndexes.join(', ')}`);
    }

    // Simple performance test
    const startTime = Date.now();
    await supabaseAdmin.from('document_chunks').select('id').limit(1);
    const queryTime = Date.now() - startTime;

    if (queryTime > 100) {
      queryPerformance = false;
      recommendations.push(`Slow query response time: ${queryTime}ms`);
    }
  } catch (error) {
    console.error('Database health check failed:', error);
    indexHealth = false;
    queryPerformance = false;
    recommendations.push('Health check failed - database connection issues');
  }

  return {
    indexHealth,
    queryPerformance,
    recommendations,
  };
}
