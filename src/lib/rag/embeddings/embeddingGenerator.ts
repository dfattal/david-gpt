/**
 * Embedding generation utility using OpenAI text-embedding-3-large
 * Handles batching, rate limiting, and retries
 */

import OpenAI from 'openai';

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingBatchResult {
  results: EmbeddingResult[];
  totalTokens: number;
  cost: number;
}

export interface EmbeddingConfig {
  model: 'text-embedding-3-large' | 'text-embedding-3-small';
  dimensions?: number; // Optional: reduce dimensions for performance
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-large',
  dimensions: 3072, // Full dimensions
  batchSize: 100, // OpenAI allows up to 2048, but 100 is safer
  maxRetries: 3,
  retryDelayMs: 1000,
};

// Pricing per 1M tokens (as of 2024)
const PRICING = {
  'text-embedding-3-large': 0.13,
  'text-embedding-3-small': 0.02,
};

/**
 * Generate embeddings for a batch of texts
 */
export class EmbeddingGenerator {
  private client: OpenAI;
  private config: EmbeddingConfig;

  constructor(apiKey: string, config: Partial<EmbeddingConfig> = {}) {
    this.client = new OpenAI({ apiKey });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate embedding for a single text
   */
  async generateSingle(text: string): Promise<EmbeddingResult> {
    const batch = await this.generateBatch([text]);
    return batch.results[0];
  }

  /**
   * Generate embeddings for multiple texts with automatic batching
   */
  async generateBatch(
    texts: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<EmbeddingBatchResult> {
    const allResults: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Split into batches
    const batches = this.splitIntoBatches(texts);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResult = await this.generateBatchWithRetry(batch);

      allResults.push(...batchResult.results);
      totalTokens += batchResult.totalTokens;

      if (onProgress) {
        onProgress((i + 1) * this.config.batchSize, texts.length);
      }
    }

    const cost = this.calculateCost(totalTokens);

    return {
      results: allResults,
      totalTokens,
      cost,
    };
  }

  /**
   * Generate embeddings for a batch with retry logic
   */
  private async generateBatchWithRetry(
    texts: string[],
    attempt = 0
  ): Promise<EmbeddingBatchResult> {
    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      });

      const results: EmbeddingResult[] = response.data.map((item, index) => ({
        text: texts[index],
        embedding: item.embedding,
        tokenCount: 0, // Will be set from usage
      }));

      // Distribute token count across results
      const totalTokens = response.usage.total_tokens;
      const tokensPerText = Math.ceil(totalTokens / texts.length);
      results.forEach((r) => (r.tokenCount = tokensPerText));

      return {
        results,
        totalTokens,
        cost: this.calculateCost(totalTokens),
      };
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        // Exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        console.warn(
          `Embedding generation failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${this.config.maxRetries})`
        );
        await this.sleep(delay);
        return this.generateBatchWithRetry(texts, attempt + 1);
      }

      throw new Error(`Failed to generate embeddings after ${this.config.maxRetries} retries: ${error}`);
    }
  }

  /**
   * Split texts into batches
   */
  private splitIntoBatches(texts: string[]): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      batches.push(texts.slice(i, i + this.config.batchSize));
    }
    return batches;
  }

  /**
   * Calculate cost in USD
   */
  private calculateCost(tokens: number): number {
    const pricePerMillion = PRICING[this.config.model];
    return (tokens / 1_000_000) * pricePerMillion;
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Validate embedding dimensions
 */
export function validateEmbedding(
  embedding: number[],
  expectedDimensions: number
): boolean {
  if (embedding.length !== expectedDimensions) {
    console.error(
      `Invalid embedding dimensions: expected ${expectedDimensions}, got ${embedding.length}`
    );
    return false;
  }

  // Check for NaN or Infinity
  const hasInvalid = embedding.some((v) => !isFinite(v));
  if (hasInvalid) {
    console.error('Embedding contains NaN or Infinity values');
    return false;
  }

  return true;
}

/**
 * Format embedding for PostgreSQL vector column
 */
export function formatEmbeddingForDB(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Create embedding generator from environment variables
 */
export function createEmbeddingGenerator(
  config: Partial<EmbeddingConfig> = {}
): EmbeddingGenerator {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  return new EmbeddingGenerator(apiKey, config);
}

/**
 * Estimate cost for embedding generation
 */
export function estimateCost(
  tokenCount: number,
  model: EmbeddingConfig['model'] = 'text-embedding-3-large'
): number {
  const pricePerMillion = PRICING[model];
  return (tokenCount / 1_000_000) * pricePerMillion;
}