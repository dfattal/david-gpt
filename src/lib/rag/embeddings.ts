/**
 * Embedding Generation System
 *
 * Handles text embeddings generation using OpenAI's API with batching,
 * retry logic, and caching for optimal performance.
 */

import OpenAI from 'openai';
import type { DocumentChunk, EmbeddingConfig } from './types';
import { DEFAULT_RAG_CONFIG } from './types';

// =======================
// OpenAI Client Setup
// =======================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not found in environment variables');
}

// =======================
// Embedding Service
// =======================

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache = new Map<string, number[]>();

  constructor(config: EmbeddingConfig = DEFAULT_RAG_CONFIG.embedding) {
    this.config = config;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text?.trim()) {
      throw new Error('Text is required for embedding generation');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await this.callOpenAIWithRetry([text]);
      const embedding = response.data[0].embedding;

      // Cache the result
      this.cache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter(text => text?.trim());
    if (!validTexts.length) {
      return [];
    }

    const results: number[][] = [];
    const batches = this.createBatches(validTexts);

    for (const batch of batches) {
      try {
        const batchResults = await this.processBatch(batch);
        results.push(...batchResults);
      } catch (error) {
        console.error('Error processing embedding batch:', error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Generate embeddings for document chunks
   */
  async generateChunkEmbeddings(
    chunks: DocumentChunk[]
  ): Promise<DocumentChunk[]> {
    if (!chunks.length) {
      return [];
    }

    console.log(`Generating embeddings for ${chunks.length} chunks...`);

    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await this.generateEmbeddings(texts);

    // Attach embeddings to chunks
    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index] || null,
    }));
  }

  /**
   * Process a batch of texts with retry logic
   */
  private async processBatch(texts: string[]): Promise<number[][]> {
    // Check cache for existing embeddings
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cacheKey = this.getCacheKey(text);

      if (this.cache.has(cacheKey)) {
        results[i] = this.cache.get(cacheKey)!;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const response = await this.callOpenAIWithRetry(uncachedTexts);

      for (let i = 0; i < uncachedTexts.length; i++) {
        const text = uncachedTexts[i];
        const embedding = response.data[i].embedding;
        const originalIndex = uncachedIndices[i];

        // Cache and store result
        this.cache.set(this.getCacheKey(text), embedding);
        results[originalIndex] = embedding;
      }
    }

    return results;
  }

  /**
   * Call OpenAI API with retry logic
   */
  private async callOpenAIWithRetry(
    texts: string[],
    attempt = 1
  ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    try {
      const response = await openai.embeddings.create({
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      });

      return response;
    } catch (error: any) {
      if (attempt < this.config.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
        console.warn(
          `Embedding API call failed (attempt ${attempt}), retrying in ${delay}ms...`
        );

        await this.sleep(delay);
        return this.callOpenAIWithRetry(texts, attempt + 1);
      }

      console.error('Max retries exceeded for embedding generation:', error);
      throw error;
    }
  }

  /**
   * Create batches from texts based on config
   */
  private createBatches(texts: string[]): string[][] {
    const batches: string[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      batches.push(texts.slice(i, i + this.config.batchSize));
    }

    return batches;
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    // Use first 100 chars + model config as cache key
    const prefix = text.trim().slice(0, 100);
    return `${this.config.model}:${this.config.dimensions}:${prefix}`;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
      // Hit rate would need to be tracked separately
    };
  }
}

// =======================
// Vector Operations
// =======================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Normalize vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

  if (magnitude === 0) {
    return vector.slice(); // Return copy of zero vector
  }

  return vector.map(val => val / magnitude);
}

/**
 * Find most similar vectors using cosine similarity
 */
export function findMostSimilar(
  queryVector: number[],
  vectors: { id: string; vector: number[]; metadata?: any }[],
  topK: number = 10
): Array<{ id: string; similarity: number; metadata?: any }> {
  const similarities = vectors.map(item => ({
    id: item.id,
    similarity: cosineSimilarity(queryVector, item.vector),
    metadata: item.metadata,
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// =======================
// Utility Functions
// =======================

/**
 * Validate embedding dimensions
 */
export function validateEmbedding(
  embedding: number[],
  expectedDim: number
): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === expectedDim &&
    embedding.every(val => typeof val === 'number' && !isNaN(val))
  );
}

/**
 * Convert embedding to PostgreSQL vector format
 */
export function embeddingToPostgresVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse PostgreSQL vector to embedding array
 */
export function postgresVectorToEmbedding(vectorString: string): number[] {
  // Remove brackets and split by comma
  const cleanString = vectorString.replace(/[\[\]]/g, '');
  return cleanString.split(',').map(val => parseFloat(val.trim()));
}

/**
 * Estimate embedding storage size in bytes
 */
export function estimateEmbeddingSize(dimensions: number): number {
  // Each float32 is 4 bytes + some overhead for JSON/vector format
  return dimensions * 4 + 50; // 50 bytes overhead estimate
}

// =======================
// Export Default Instance
// =======================

export const embeddingService = new EmbeddingService();

// =======================
// Convenience Functions
// =======================

/**
 * Quick embedding generation for single text
 */
export async function embed(text: string): Promise<number[]> {
  return embeddingService.generateEmbedding(text);
}

/**
 * Quick embedding generation for multiple texts
 */
export async function embedMany(texts: string[]): Promise<number[][]> {
  return embeddingService.generateEmbeddings(texts);
}

/**
 * Generate query embedding optimized for search
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  // Normalize query for better matching
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    throw new Error('Query cannot be empty');
  }

  return embeddingService.generateEmbedding(normalizedQuery);
}
