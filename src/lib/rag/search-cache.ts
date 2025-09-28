/**
 * Search Result Caching System
 *
 * Implements intelligent caching for Tier 3 content search to reduce response times
 * from 2.5s to target 1.5s. Uses in-memory LRU cache with query fingerprinting.
 */

import { createHash } from 'crypto';
import type { SearchResult, HybridSearchResult, SearchQuery } from './types';

// =======================
// Cache Configuration
// =======================

interface CacheConfig {
  maxSize: number; // Maximum number of cached queries
  ttlMs: number; // Time to live in milliseconds
  enablePrefetching: boolean; // Enable prefetching related queries
  compressionThreshold: number; // Compress results larger than this (KB)
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 500, // Cache up to 500 queries
  ttlMs: 15 * 60 * 1000, // 15 minutes TTL
  enablePrefetching: true,
  compressionThreshold: 50, // 50KB
};

interface CacheEntry {
  key: string;
  query: SearchQuery;
  results: HybridSearchResult;
  timestamp: number;
  hitCount: number;
  lastAccessed: number;
  compressed?: boolean;
  relatedQueries?: string[]; // For prefetching
}

// =======================
// LRU Cache Implementation
// =======================

class LRUCache<T> {
  private capacity: number;
  private cache = new Map<string, T>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (item) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// =======================
// Search Cache Class
// =======================

export class SearchCache {
  private cache: LRUCache<CacheEntry>;
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    compressions: 0,
    prefetches: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.cache = new LRUCache(this.config.maxSize);

    // Start cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes

    console.log(
      `🗄️ Search cache initialized: max=${this.config.maxSize}, ttl=${this.config.ttlMs}ms`
    );
  }

  /**
   * Generate cache key from query with normalization
   */
  private generateCacheKey(query: SearchQuery): string {
    // Normalize query for consistent caching
    const normalizedQuery = {
      query: query.query.toLowerCase().trim(),
      filters: query.filters ? this.normalizeFilters(query.filters) : undefined,
      limit: query.limit || 10,
      personaId: query.personaId || 'default',
    };

    const queryString = JSON.stringify(
      normalizedQuery,
      Object.keys(normalizedQuery).sort()
    );
    return createHash('sha256')
      .update(queryString)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Normalize filters for consistent caching
   */
  private normalizeFilters(filters: any): any {
    const normalized: any = {};

    if (filters.documentTypes) {
      normalized.documentTypes = Array.isArray(filters.documentTypes)
        ? filters.documentTypes.sort()
        : [filters.documentTypes];
    }

    if (filters.dateRange) {
      normalized.dateRange = filters.dateRange;
    }

    if (filters.authors) {
      normalized.authors = Array.isArray(filters.authors)
        ? filters.authors.sort()
        : [filters.authors];
    }

    return normalized;
  }

  /**
   * Check if query result is cacheable
   */
  private shouldCache(
    query: SearchQuery,
    results: HybridSearchResult
  ): boolean {
    // Don't cache very short queries (likely exploratory)
    if (query.query.length < 3) return false;

    // Don't cache empty results
    if (results.results.length === 0) return false;

    // Don't cache queries with time-sensitive filters
    if (
      query.filters?.dateRange?.end &&
      new Date(query.filters.dateRange.end) >
        new Date(Date.now() - 24 * 60 * 60 * 1000)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Compress large results if needed
   */
  private compressIfNeeded(entry: CacheEntry): CacheEntry {
    const resultSize = JSON.stringify(entry.results).length / 1024; // KB

    if (resultSize > this.config.compressionThreshold) {
      // Compress by reducing content length in results
      const compressedResults = {
        ...entry.results,
        results: entry.results.results.map(result => ({
          ...result,
          content:
            result.content.length > 500
              ? result.content.substring(0, 500) + '...[cached]'
              : result.content,
        })),
      };

      this.stats.compressions++;
      return {
        ...entry,
        results: compressedResults,
        compressed: true,
      };
    }

    return entry;
  }

  /**
   * Get cached search results
   */
  async get(query: SearchQuery): Promise<HybridSearchResult | null> {
    const key = this.generateCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.hitCount++;
    entry.lastAccessed = now;

    this.stats.hits++;

    console.log(
      `🎯 Cache hit for query: "${query.query}" (hits: ${entry.hitCount})`
    );

    // Trigger prefetching of related queries if enabled
    if (this.config.enablePrefetching && entry.relatedQueries) {
      this.prefetchRelatedQueries(entry.relatedQueries).catch(console.error);
    }

    return entry.results;
  }

  /**
   * Cache search results
   */
  async set(query: SearchQuery, results: HybridSearchResult): Promise<void> {
    if (!this.shouldCache(query, results)) {
      return;
    }

    const key = this.generateCacheKey(query);
    const now = Date.now();

    let entry: CacheEntry = {
      key,
      query,
      results,
      timestamp: now,
      hitCount: 0,
      lastAccessed: now,
      relatedQueries: this.extractRelatedQueries(query, results),
    };

    // Compress if needed
    entry = this.compressIfNeeded(entry);

    this.cache.set(key, entry);

    console.log(
      `💾 Cached query results: "${query.query}" (compressed: ${entry.compressed || false})`
    );
  }

  /**
   * Extract related queries for prefetching
   */
  private extractRelatedQueries(
    query: SearchQuery,
    results: HybridSearchResult
  ): string[] {
    const relatedQueries: Set<string> = new Set();

    // Extract entity names from top results for related queries
    results.results.slice(0, 3).forEach(result => {
      // Extract potential entity names from titles and content
      const text = `${result.title} ${result.content}`.toLowerCase();

      // Simple entity extraction - could be enhanced with NER
      const commonTerms = text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
      commonTerms.slice(0, 2).forEach(term => {
        if (term.length > 5 && !term.includes(query.query.toLowerCase())) {
          relatedQueries.add(term);
        }
      });
    });

    return Array.from(relatedQueries).slice(0, 3);
  }

  /**
   * Prefetch related queries (background operation)
   */
  private async prefetchRelatedQueries(
    relatedQueries: string[]
  ): Promise<void> {
    // This would trigger background searches for related queries
    // Implementation depends on how the search engine is integrated
    this.stats.prefetches += relatedQueries.length;
    console.log(`🔮 Prefetching ${relatedQueries.length} related queries`);
  }

  /**
   * Invalidate cache entries containing specific terms
   */
  invalidateByTerms(terms: string[]): number {
    let invalidated = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      const entry = this.cache.get(key);
      if (entry) {
        const queryText = entry.query.query.toLowerCase();
        if (terms.some(term => queryText.includes(term.toLowerCase()))) {
          keysToDelete.push(key);
          invalidated++;
        }
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (invalidated > 0) {
      console.log(
        `🗑️ Invalidated ${invalidated} cache entries containing terms: ${terms.join(', ')}`
      );
    }

    return invalidated;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const key of this.cache.keys()) {
      const entry = this.cache.get(key);
      if (entry && now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(commonQueries: string[]): Promise<void> {
    console.log(
      `🔥 Warming up cache with ${commonQueries.length} common queries`
    );

    // This would be called with a list of frequently accessed queries
    // Implementation depends on search engine integration
    for (const queryStr of commonQueries) {
      const query = { query: queryStr, limit: 10 };
      const key = this.generateCacheKey(query);

      // Mark as warmed up (placeholder - would run actual search)
      console.log(`   Warming: "${queryStr}" -> ${key}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0;

    return {
      ...this.stats,
      hitRate: parseFloat(hitRate.toFixed(2)),
      size: this.cache.size(),
      maxSize: this.config.maxSize,
      utilization: parseFloat(
        ((this.cache.size() / this.config.maxSize) * 100).toFixed(2)
      ),
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      compressions: 0,
      prefetches: 0,
    };
    console.log('🗑️ Cache cleared');
  }
}

// =======================
// Singleton Instance
// =======================

export const searchCache = new SearchCache({
  maxSize: 1000, // Increase for production
  ttlMs: 20 * 60 * 1000, // 20 minutes
  enablePrefetching: true,
  compressionThreshold: 75, // 75KB threshold
});

// =======================
// Cache Decorator Function
// =======================

/**
 * Decorator function to add caching to search methods
 */
export function withCache<
  T extends (...args: any[]) => Promise<HybridSearchResult>,
>(searchFn: T, cache: SearchCache = searchCache): T {
  return (async (...args: any[]) => {
    const [query] = args as [SearchQuery, ...any[]];

    // Try cache first
    const cached = await cache.get(query);
    if (cached) {
      return cached;
    }

    // Execute search
    const result = await searchFn(...args);

    // Cache result
    await cache.set(query, result);

    return result;
  }) as T;
}
