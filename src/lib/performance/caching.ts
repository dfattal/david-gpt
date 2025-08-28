// Production-ready caching system for RAG operations
// Implements multi-level caching with TTL and cache invalidation

export interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  maxSize?: number // Maximum number of items in cache
  serialize?: boolean // Whether to serialize/deserialize values
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
  memoryUsage: number
}

class MemoryCache<T> {
  private cache = new Map<string, { value: T; expires: number; accessCount: number }>()
  private stats = { hits: 0, misses: 0 }
  private maxSize: number
  private defaultTtl: number

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000
    this.defaultTtl = options.ttl || 5 * 60 * 1000 // 5 minutes default
  }

  get(key: string): T | null {
    const item = this.cache.get(key)
    
    if (!item) {
      this.stats.misses++
      return null
    }

    if (Date.now() > item.expires) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    item.accessCount++
    this.stats.hits++
    return item.value
  }

  set(key: string, value: T, ttl?: number): void {
    const expires = Date.now() + (ttl || this.defaultTtl)
    
    // Evict if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastUsed()
    }

    this.cache.set(key, { value, expires, accessCount: 0 })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
  }

  has(key: string): boolean {
    const item = this.cache.get(key)
    return item ? Date.now() <= item.expires : false
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? this.stats.hits / total : 0
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: this.estimateMemoryUsage()
    }
  }

  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null
    let leastAccessCount = Infinity

    for (const [key, item] of this.cache) {
      if (item.accessCount < leastAccessCount) {
        leastAccessCount = item.accessCount
        leastUsedKey = key
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey)
    }
  }

  private estimateMemoryUsage(): number {
    let size = 0
    for (const [key, item] of this.cache) {
      size += key.length * 2 // String size in bytes (UTF-16)
      size += JSON.stringify(item.value).length * 2 // Rough estimate
      size += 24 // Object overhead
    }
    return size
  }
}

// Singleton cache instances for different data types
const searchCache = new MemoryCache<any>({ ttl: 2 * 60 * 1000, maxSize: 500 }) // 2 min for search results
const entityCache = new MemoryCache<any>({ ttl: 10 * 60 * 1000, maxSize: 1000 }) // 10 min for entities
const documentCache = new MemoryCache<any>({ ttl: 30 * 60 * 1000, maxSize: 200 }) // 30 min for documents
const embeddingCache = new MemoryCache<number[]>({ ttl: 60 * 60 * 1000, maxSize: 2000 }) // 1 hour for embeddings

export const CacheManager = {
  // Search result caching
  getSearchResults: (key: string) => searchCache.get(key),
  setSearchResults: (key: string, results: any, ttl?: number) => searchCache.set(key, results, ttl),
  invalidateSearch: (pattern?: string) => {
    if (pattern) {
      // Invalidate keys matching pattern
      for (const key of searchCache['cache'].keys()) {
        if (key.includes(pattern)) {
          searchCache.delete(key)
        }
      }
    } else {
      searchCache.clear()
    }
  },

  // Entity caching
  getEntity: (entityId: string) => entityCache.get(`entity:${entityId}`),
  setEntity: (entityId: string, entity: any) => entityCache.set(`entity:${entityId}`, entity),
  invalidateEntity: (entityId: string) => {
    entityCache.delete(`entity:${entityId}`)
    // Also invalidate related searches
    searchCache.clear() // Simple approach - clear all search cache
  },

  // Document caching
  getDocument: (docId: string) => documentCache.get(`doc:${docId}`),
  setDocument: (docId: string, document: any) => documentCache.set(`doc:${docId}`, document),
  invalidateDocument: (docId: string) => {
    documentCache.delete(`doc:${docId}`)
    searchCache.clear() // Invalidate search cache when documents change
  },

  // Embedding caching
  getEmbedding: (text: string) => embeddingCache.get(`embed:${text}`),
  setEmbedding: (text: string, embedding: number[]) => embeddingCache.set(`embed:${text}`, embedding),

  // Cache statistics
  getStats: () => ({
    search: searchCache.getStats(),
    entity: entityCache.getStats(),
    document: documentCache.getStats(),
    embedding: embeddingCache.getStats()
  }),

  // Cache management
  clearAll: () => {
    searchCache.clear()
    entityCache.clear()
    documentCache.clear()
    embeddingCache.clear()
  },

  // Memory usage optimization
  optimizeMemory: () => {
    const stats = CacheManager.getStats()
    let cleared = 0

    // Clear caches if they're using too much memory (> 50MB)
    if (stats.search.memoryUsage > 50 * 1024 * 1024) {
      searchCache.clear()
      cleared++
    }
    if (stats.entity.memoryUsage > 50 * 1024 * 1024) {
      entityCache.clear()
      cleared++
    }
    if (stats.document.memoryUsage > 50 * 1024 * 1024) {
      documentCache.clear()
      cleared++
    }
    if (stats.embedding.memoryUsage > 100 * 1024 * 1024) {
      embeddingCache.clear()
      cleared++
    }

    return { cachesCleared: cleared }
  }
}

// Cache key generation utilities
export const CacheKeys = {
  search: (query: string, filters: Record<string, any> = {}) => {
    const filterStr = Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
    return `search:${query}:${filterStr}`
  },

  hybridSearch: (query: string, options: any = {}) => {
    const optionsStr = JSON.stringify(options)
    return `hybrid:${query}:${optionsStr}`
  },

  entitySearch: (query: string, type?: string) => {
    return `entity_search:${query}:${type || 'all'}`
  },

  relationSearch: (entityId: string, type?: string) => {
    return `relations:${entityId}:${type || 'all'}`
  },

  kgContext: (entities: string[], relations: string[]) => {
    return `kg_context:${entities.sort().join(',')}:${relations.sort().join(',')}`
  }
}

// Performance monitoring for cache effectiveness
export const CacheMonitor = {
  logCacheHit: (cacheType: string, key: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Cache HIT] ${cacheType}: ${key}`)
    }
  },

  logCacheMiss: (cacheType: string, key: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Cache MISS] ${cacheType}: ${key}`)
    }
  },

  reportStats: () => {
    const stats = CacheManager.getStats()
    console.log('Cache Statistics:', {
      search: `${stats.search.size} items, ${stats.search.hitRate * 100}% hit rate`,
      entity: `${stats.entity.size} items, ${stats.entity.hitRate * 100}% hit rate`,
      document: `${stats.document.size} items, ${stats.document.hitRate * 100}% hit rate`,
      embedding: `${stats.embedding.size} items, ${stats.embedding.hitRate * 100}% hit rate`,
      totalMemory: `${(
        stats.search.memoryUsage + 
        stats.entity.memoryUsage + 
        stats.document.memoryUsage + 
        stats.embedding.memoryUsage
      ) / (1024 * 1024)}MB`
    })
    return stats
  }
}