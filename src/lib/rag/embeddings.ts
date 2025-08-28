import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface EmbeddingResult {
  embedding: number[]
  tokens: number
  model: string
}

export interface ChunkEmbedding {
  chunk_id: string
  document_id: string
  chunk_index: number
  content: string
  embedding: number[]
  token_count: number
  created_at: string
}

export class EmbeddingService {
  private readonly model: string
  private readonly maxTokens: number

  constructor(
    model: string = 'text-embedding-3-small',
    maxTokens: number = 8192
  ) {
    this.model = model
    this.maxTokens = maxTokens
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!text.trim()) {
      throw new Error('Cannot generate embedding for empty text')
    }

    try {
      const response = await openai.embeddings.create({
        model: this.model,
        input: text.trim(),
        encoding_format: 'float',
      })

      const embedding = response.data[0]
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI API')
      }

      return {
        embedding: embedding.embedding,
        tokens: response.usage.total_tokens,
        model: this.model
      }
    } catch (error) {
      console.error('OpenAI embedding generation failed:', error)
      
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error('OpenAI rate limit exceeded. Please wait before retrying.')
        } else if (error.message.includes('quota')) {
          throw new Error('OpenAI quota exceeded. Please check your billing.')
        } else if (error.message.includes('invalid_api_key')) {
          throw new Error('Invalid OpenAI API key. Please check your configuration.')
        }
      }
      
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async generateBatchEmbeddings(texts: string[], batchSize: number = 100): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = []
    const filteredTexts = texts.filter(text => text.trim().length > 0)

    if (filteredTexts.length === 0) {
      return results
    }

    for (let i = 0; i < filteredTexts.length; i += batchSize) {
      const batch = filteredTexts.slice(i, i + batchSize)
      
      try {
        const response = await openai.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float',
        })

        for (let j = 0; j < response.data.length; j++) {
          const embedding = response.data[j]
          if (embedding) {
            results.push({
              embedding: embedding.embedding,
              tokens: response.usage.total_tokens / response.data.length,
              model: this.model
            })
          }
        }

        if (i + batchSize < filteredTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`Batch embedding generation failed for batch ${i}-${i + batchSize}:`, error)
        
        for (const text of batch) {
          try {
            const singleResult = await this.generateEmbedding(text)
            results.push(singleResult)
            await new Promise(resolve => setTimeout(resolve, 50))
          } catch (singleError) {
            console.error('Failed to generate embedding for individual text:', singleError)
            results.push({
              embedding: new Array(1536).fill(0),
              tokens: 0,
              model: this.model
            })
          }
        }
      }
    }

    return results
  }

  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) {
      return false
    }

    if (this.model === 'text-embedding-3-small' && embedding.length !== 1536) {
      return false
    }

    if (this.model === 'text-embedding-3-large' && embedding.length !== 3072) {
      return false
    }

    if (embedding.some(val => typeof val !== 'number' || isNaN(val))) {
      return false
    }

    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    if (magnitude < 0.1 || magnitude > 2.0) {
      return false
    }

    return true
  }

  getDimensions(): number {
    switch (this.model) {
      case 'text-embedding-3-small':
        return 1536
      case 'text-embedding-3-large':
        return 3072
      case 'text-embedding-ada-002':
        return 1536
      default:
        return 1536
    }
  }
}

export async function generateChunkEmbeddings(
  documentId: string,
  chunks: Array<{ content: string; chunk_index: number; chunk_id: string }>
): Promise<ChunkEmbedding[]> {
  const embeddingService = new EmbeddingService()
  const chunkEmbeddings: ChunkEmbedding[] = []

  console.log(`Generating embeddings for ${chunks.length} chunks from document ${documentId}`)

  const texts = chunks.map(chunk => chunk.content)
  const embeddings = await embeddingService.generateBatchEmbeddings(texts)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const embeddingResult = embeddings[i]

    if (!embeddingResult) {
      console.error(`No embedding generated for chunk ${chunk.chunk_index}`)
      continue
    }

    if (!embeddingService.validateEmbedding(embeddingResult.embedding)) {
      console.error(`Invalid embedding generated for chunk ${chunk.chunk_index}`)
      continue
    }

    chunkEmbeddings.push({
      chunk_id: chunk.chunk_id,
      document_id: documentId,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      embedding: embeddingResult.embedding,
      token_count: embeddingResult.tokens,
      created_at: new Date().toISOString()
    })
  }

  console.log(`Successfully generated ${chunkEmbeddings.length} embeddings`)
  return chunkEmbeddings
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function findSimilarChunks(
  queryEmbedding: number[],
  chunkEmbeddings: ChunkEmbedding[],
  limit: number = 5,
  threshold: number = 0.7
): Array<ChunkEmbedding & { similarity: number }> {
  const similarities = chunkEmbeddings
    .map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .filter(chunk => chunk.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return similarities
}

// Default embedding service instance
const defaultEmbeddingService = new EmbeddingService()

// Export convenience function for generating embeddings
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  return defaultEmbeddingService.generateEmbedding(text)
}