// Embeddings utilities for RAG system
// Phase 2: OpenAI text-embedding-3-small integration

import { openai } from '@ai-sdk/openai'
import { embed, EmbedResult } from 'ai'
import { RAG_CONSTANTS } from './types'

export interface EmbeddingOptions {
  model?: string
  batchSize?: number
  maxRetries?: number
  retryDelay?: number
}

export interface EmbeddingResult {
  embedding: number[]
  tokens: number
  index: number
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
  successful: number
  failed: number
  errors: Array<{ index: number; error: string }>
}

// Default embedding configuration
const DEFAULT_EMBEDDING_OPTIONS: Required<EmbeddingOptions> = {
  model: 'text-embedding-3-small', // OpenAI's latest small model
  batchSize: 100, // Process up to 100 texts per batch
  maxRetries: 3,
  retryDelay: 1000 // 1 second base delay
}

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerMinute: 3000, // OpenAI limit for text-embedding-3-small
  tokensPerMinute: 1000000, // OpenAI limit
  maxConcurrentRequests: 10
}

class RateLimiter {
  private requests: number[] = []
  private tokens: number[] = []
  private activeRequests = 0

  async waitForCapacity(estimatedTokens: number): Promise<void> {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean up old entries
    this.requests = this.requests.filter(time => time > oneMinuteAgo)
    this.tokens = this.tokens.filter(time => time > oneMinuteAgo)

    // Wait if we're at rate limits
    while (
      this.requests.length >= RATE_LIMIT.requestsPerMinute ||
      this.tokens.length + estimatedTokens > RATE_LIMIT.tokensPerMinute ||
      this.activeRequests >= RATE_LIMIT.maxConcurrentRequests
    ) {
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Clean up old entries again
      const currentTime = Date.now()
      const oneMinuteAgoNow = currentTime - 60000
      this.requests = this.requests.filter(time => time > oneMinuteAgoNow)
      this.tokens = this.tokens.filter(time => time > oneMinuteAgoNow)
    }

    // Reserve capacity
    this.requests.push(now)
    for (let i = 0; i < estimatedTokens; i++) {
      this.tokens.push(now)
    }
    this.activeRequests++
  }

  releaseRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1)
  }
}

const rateLimiter = new RateLimiter()

// Estimate token count for embedding input (more conservative than chunking)
export function estimateEmbeddingTokens(text: string): number {
  // OpenAI embedding models are more strict about tokens
  // Use a more conservative estimate: 1 token ≈ 3.5 characters
  return Math.ceil(text.length / 3.5)
}

// Generate embedding for a single text
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  const config = { ...DEFAULT_EMBEDDING_OPTIONS, ...options }
  
  if (!text.trim()) {
    throw new Error('Cannot generate embedding for empty text')
  }

  const estimatedTokens = estimateEmbeddingTokens(text)
  
  // Check if text is too long for embedding model
  if (estimatedTokens > 8192) { // OpenAI's max context length for embeddings
    throw new Error(`Text too long for embedding: ${estimatedTokens} tokens (max: 8192)`)
  }

  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Wait for rate limit capacity
      await rateLimiter.waitForCapacity(estimatedTokens)
      
      // Generate embedding using Vercel AI SDK
      const result: EmbedResult<string> = await embed({
        model: openai.embedding(config.model),
        value: text
      })
      
      rateLimiter.releaseRequest()
      
      // Validate embedding dimensions
      if (result.embedding.length !== RAG_CONSTANTS.EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding dimensions: ${result.embedding.length} ` +
          `(expected: ${RAG_CONSTANTS.EMBEDDING_DIMENSIONS})`
        )
      }
      
      return {
        embedding: result.embedding,
        tokens: result.usage?.tokens || estimatedTokens,
        index: 0
      }
      
    } catch (error) {
      rateLimiter.releaseRequest()
      lastError = error as Error
      
      console.warn(`Embedding attempt ${attempt + 1} failed:`, lastError.message)
      
      // Don't retry on certain errors
      if (
        lastError.message.includes('too long') ||
        lastError.message.includes('invalid') ||
        lastError.message.includes('unauthorized')
      ) {
        break
      }
      
      // Exponential backoff for retries
      if (attempt < config.maxRetries) {
        const delay = config.retryDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw new Error(`Failed to generate embedding after ${config.maxRetries + 1} attempts: ${lastError?.message}`)
}

// Generate embeddings for multiple texts in batches
export async function generateBatchEmbeddings(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<BatchEmbeddingResult> {
  const config = { ...DEFAULT_EMBEDDING_OPTIONS, ...options }
  
  if (texts.length === 0) {
    return {
      embeddings: [],
      totalTokens: 0,
      successful: 0,
      failed: 0,
      errors: []
    }
  }

  const results: EmbeddingResult[] = []
  const errors: Array<{ index: number; error: string }> = []
  let totalTokens = 0
  let successful = 0
  let failed = 0

  // Process texts in batches
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize)
    const batchPromises = batch.map(async (text, batchIndex) => {
      const globalIndex = i + batchIndex
      
      try {
        // Skip empty texts
        if (!text.trim()) {
          errors.push({ index: globalIndex, error: 'Empty text' })
          failed++
          return null
        }

        const result = await generateEmbedding(text, config)
        result.index = globalIndex
        totalTokens += result.tokens
        successful++
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ index: globalIndex, error: errorMessage })
        failed++
        return null
      }
    })

    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises)
    
    // Collect successful results
    batchResults.forEach(result => {
      if (result) {
        results.push(result)
      }
    })

    // Add small delay between batches to be respectful to API
    if (i + config.batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // Sort results by original index
  results.sort((a, b) => a.index - b.index)

  return {
    embeddings: results,
    totalTokens,
    successful,
    failed,
    errors
  }
}

// Utility function to calculate cosine similarity between embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

// Utility function to validate embedding
export function validateEmbedding(embedding: number[]): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  // Check dimensions
  if (embedding.length !== RAG_CONSTANTS.EMBEDDING_DIMENSIONS) {
    issues.push(`Invalid dimensions: ${embedding.length} (expected: ${RAG_CONSTANTS.EMBEDDING_DIMENSIONS})`)
  }
  
  // Check for invalid values
  const hasInvalidValues = embedding.some(val => 
    !isFinite(val) || isNaN(val)
  )
  if (hasInvalidValues) {
    issues.push('Embedding contains invalid values (NaN or Infinity)')
  }
  
  // Check for zero vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  if (magnitude === 0) {
    issues.push('Embedding is a zero vector')
  }
  
  // Check reasonable value ranges (embeddings should be normalized-ish)
  const maxAbs = Math.max(...embedding.map(Math.abs))
  if (maxAbs > 10) {
    issues.push(`Embedding values seem unnormalized (max absolute value: ${maxAbs})`)
  }
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

// Test function to verify embedding service is working
export async function testEmbeddingService(): Promise<{
  success: boolean
  latency: number
  dimensions: number
  error?: string
}> {
  const testText = "This is a test sentence for verifying the embedding service."
  const startTime = performance.now()
  
  try {
    const result = await generateEmbedding(testText)
    const latency = performance.now() - startTime
    
    const validation = validateEmbedding(result.embedding)
    if (!validation.isValid) {
      throw new Error(`Invalid embedding: ${validation.issues.join(', ')}`)
    }
    
    return {
      success: true,
      latency,
      dimensions: result.embedding.length
    }
  } catch (error) {
    return {
      success: false,
      latency: performance.now() - startTime,
      dimensions: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Export for testing and configuration
export { RATE_LIMIT, DEFAULT_EMBEDDING_OPTIONS }