/**
 * Semantic Chunking Service
 *
 * Enhanced chunking system that uses semantic similarity to create
 * coherent chunks while maintaining document structure awareness.
 */

import { createHash } from 'crypto';
import { embeddingService } from './embeddings';
import { estimateTokens, detectSections } from './chunking';
import { unifiedChunkingService } from './unified-chunking-service';
import type { DocumentChunk, ChunkingConfig, DocumentMetadata } from './types';
import { DEFAULT_RAG_CONFIG } from './types';

// ===========================
// Semantic Chunking Types
// ===========================

export interface SemanticChunkingConfig extends ChunkingConfig {
  semanticThreshold: number; // Similarity threshold for grouping sentences (0.0-1.0)
  minSemanticChunkSize: number; // Minimum tokens for semantic chunks
  maxSemanticChunkSize: number; // Maximum tokens for semantic chunks
  sentenceOverlap: boolean; // Whether to include sentence overlap
  useEmbeddings: boolean; // Whether to use embeddings for similarity
  fallbackToStructural: boolean; // Fall back to structural chunking if semantic fails
}

export interface SemanticChunk {
  sentences: string[];
  semanticScore: number; // Average semantic coherence score
  topics: string[]; // Inferred topics/themes
  boundaries: {
    start: number;
    end: number;
  };
}

export interface SemanticBoundary {
  position: number;
  score: number; // Semantic discontinuity score (higher = stronger boundary)
  type: 'topic_shift' | 'section_break' | 'structural' | 'similarity_drop';
  confidence: number;
}

// ===========================
// Default Semantic Configuration
// ===========================

const DEFAULT_SEMANTIC_CONFIG: SemanticChunkingConfig = {
  ...DEFAULT_RAG_CONFIG.chunking,
  semanticThreshold: 0.7, // Sentences with similarity >= 0.7 stay together
  minSemanticChunkSize: 200, // Reduced from 600 to 200 tokens per semantic chunk
  maxSemanticChunkSize: 1400, // Maximum 1400 tokens per semantic chunk
  sentenceOverlap: true, // Include overlapping sentences for context
  useEmbeddings: true, // Use embeddings for semantic similarity
  fallbackToStructural: true, // Fall back to structural chunking
};

// ===========================
// Semantic Chunking Service
// ===========================

export class SemanticChunkingService {
  /**
   * Create semantic chunks that maintain topical coherence
   */
  async createSemanticChunks(
    content: string,
    documentId: string,
    metadata?: DocumentMetadata,
    config: Partial<SemanticChunkingConfig> = {}
  ): Promise<DocumentChunk[]> {
    const finalConfig = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
    console.log(
      `🧠 Starting semantic chunking for document: ${metadata?.title || documentId}`
    );

    try {
      // 1. Preprocess content and extract sentences
      const sentences = this.extractSentences(content);
      console.log(`📝 Extracted ${sentences.length} sentences`);

      if (sentences.length < 5) {
        console.log(
          '⚠️ Too few sentences for semantic chunking, using structural approach'
        );
        return await this.fallbackToStructuralChunking(
          content,
          documentId,
          metadata,
          finalConfig
        );
      }

      // 2. Detect semantic boundaries
      const boundaries = await this.detectSemanticBoundaries(
        sentences,
        finalConfig
      );
      console.log(`🔍 Detected ${boundaries.length} semantic boundaries`);

      // 3. Create semantic chunks based on boundaries
      const semanticChunks = this.createChunksFromBoundaries(
        sentences,
        boundaries,
        finalConfig
      );
      console.log(`🧩 Created ${semanticChunks.length} semantic chunks`);

      // 4. Convert to document chunks with proper formatting
      const documentChunks = await this.convertToDocumentChunks(
        semanticChunks,
        documentId,
        metadata,
        finalConfig
      );

      // 5. Validate and post-process
      const validChunks = this.validateSemanticChunks(
        documentChunks,
        finalConfig
      );

      if (validChunks.length === 0 && finalConfig.fallbackToStructural) {
        console.log(
          '⚠️ Semantic chunking produced no valid chunks, falling back to structural'
        );
        return await this.fallbackToStructuralChunking(
          content,
          documentId,
          metadata,
          finalConfig
        );
      }

      console.log(
        `✅ Semantic chunking completed: ${validChunks.length} chunks created`
      );
      return validChunks;
    } catch (error) {
      console.error('❌ Semantic chunking failed:', error);

      if (finalConfig.fallbackToStructural) {
        console.log('🔄 Falling back to structural chunking due to error');
        return await this.fallbackToStructuralChunking(
          content,
          documentId,
          metadata,
          finalConfig
        );
      }

      throw error;
    }
  }

  /**
   * Extract sentences from content with intelligent splitting
   */
  private extractSentences(content: string): string[] {
    // Normalize whitespace and clean up content
    const normalized = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Split into sentences using multiple patterns
    const sentences = normalized
      .split(/(?<=[.!?])\s+(?=[A-Z])/) // Basic sentence split
      .flatMap(sent => {
        // Handle special cases like "Dr. Smith" or "U.S.A."
        return sent
          .split(/(?<=[.!?])\s+(?=(?:[A-Z]|"[A-Z]))/)
          .filter(s => s.trim().length > 0);
      })
      .map(s => s.trim())
      .filter(s => {
        // Filter out very short fragments and single characters
        return s.length > 10 && !/^[^a-zA-Z]*$/.test(s);
      });

    return sentences;
  }

  /**
   * Detect semantic boundaries using similarity analysis
   */
  private async detectSemanticBoundaries(
    sentences: string[],
    config: SemanticChunkingConfig
  ): Promise<SemanticBoundary[]> {
    const boundaries: SemanticBoundary[] = [];

    if (!config.useEmbeddings || sentences.length < 3) {
      // Fall back to structural boundary detection
      return this.detectStructuralBoundaries(sentences);
    }

    try {
      // 1. Generate embeddings for all sentences (batched for efficiency)
      const embeddings = await this.generateSentenceEmbeddings(sentences);

      // 2. Calculate semantic similarity between adjacent sentences
      const similarities = this.calculateSentenceSimilarities(embeddings);

      // 3. Detect significant similarity drops (potential boundaries)
      const threshold = config.semanticThreshold;
      const minBoundaryScore = 0.4; // Minimum score to consider a boundary

      for (let i = 0; i < similarities.length; i++) {
        const similarity = similarities[i];
        const avgSimilarity = this.calculateLocalAverage(similarities, i, 2);

        // Significant drop in similarity indicates a topic shift
        if (similarity < threshold && avgSimilarity - similarity > 0.15) {
          boundaries.push({
            position: i + 1, // Position after the current sentence
            score: avgSimilarity - similarity, // Magnitude of the drop
            type: 'topic_shift',
            confidence: Math.min(0.9, (avgSimilarity - similarity) / 0.3),
          });
        }

        // Also detect very low similarity as hard boundaries
        if (similarity < minBoundaryScore) {
          boundaries.push({
            position: i + 1,
            score: 1.0 - similarity,
            type: 'similarity_drop',
            confidence: 1.0 - similarity,
          });
        }
      }

      // 4. Add structural boundaries (section breaks, etc.)
      const structuralBoundaries = this.detectStructuralBoundaries(sentences);
      boundaries.push(...structuralBoundaries);

      // 5. Sort by position and remove duplicates
      return this.consolidateBoundaries(boundaries);
    } catch (error) {
      console.warn(
        'Failed to generate embeddings for semantic chunking:',
        error
      );
      return this.detectStructuralBoundaries(sentences);
    }
  }

  /**
   * Generate embeddings for sentences in batches
   */
  private async generateSentenceEmbeddings(
    sentences: string[]
  ): Promise<number[][]> {
    const batchSize = 20; // Process in smaller batches to avoid rate limits
    const embeddings: number[][] = [];

    for (let i = 0; i < sentences.length; i += batchSize) {
      const batch = sentences.slice(i, i + batchSize);
      const batchEmbeddings = await embeddingService.generateEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Calculate cosine similarity between adjacent sentence embeddings
   */
  private calculateSentenceSimilarities(embeddings: number[][]): number[] {
    const similarities: number[] = [];

    for (let i = 0; i < embeddings.length - 1; i++) {
      const similarity = this.cosineSimilarity(
        embeddings[i],
        embeddings[i + 1]
      );
      similarities.push(similarity);
    }

    return similarities;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate local average similarity around a position
   */
  private calculateLocalAverage(
    similarities: number[],
    position: number,
    window: number
  ): number {
    const start = Math.max(0, position - window);
    const end = Math.min(similarities.length, position + window + 1);

    let sum = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      sum += similarities[i];
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Detect structural boundaries (section breaks, lists, etc.)
   */
  private detectStructuralBoundaries(sentences: string[]): SemanticBoundary[] {
    const boundaries: SemanticBoundary[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Detect section headers
      if (
        /^(#{1,6}|\d+\.|\w+\.)\s+[A-Z]/.test(sentence) ||
        sentence === sentence.toUpperCase()
      ) {
        boundaries.push({
          position: i,
          score: 0.8,
          type: 'section_break',
          confidence: 0.7,
        });
      }

      // Detect list items or numbered points
      if (/^[-*•]\s+/.test(sentence) || /^\d+[\.)]\s+/.test(sentence)) {
        boundaries.push({
          position: i,
          score: 0.5,
          type: 'structural',
          confidence: 0.5,
        });
      }
    }

    return boundaries;
  }

  /**
   * Consolidate overlapping boundaries and sort by position
   */
  private consolidateBoundaries(
    boundaries: SemanticBoundary[]
  ): SemanticBoundary[] {
    // Sort by position
    boundaries.sort((a, b) => a.position - b.position);

    // Remove duplicates within 2 positions of each other, keeping the highest score
    const consolidated: SemanticBoundary[] = [];

    for (const boundary of boundaries) {
      const existing = consolidated.find(
        b => Math.abs(b.position - boundary.position) <= 2
      );

      if (!existing) {
        consolidated.push(boundary);
      } else if (boundary.score > existing.score) {
        // Replace with higher-scoring boundary
        consolidated[consolidated.indexOf(existing)] = boundary;
      }
    }

    return consolidated;
  }

  /**
   * Create semantic chunks from detected boundaries
   */
  private createChunksFromBoundaries(
    sentences: string[],
    boundaries: SemanticBoundary[],
    config: SemanticChunkingConfig
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];

    // Add implicit boundaries at start and end
    const allBoundaries = [
      { position: 0, score: 1.0, type: 'structural' as const, confidence: 1.0 },
      ...boundaries,
      {
        position: sentences.length,
        score: 1.0,
        type: 'structural' as const,
        confidence: 1.0,
      },
    ].sort((a, b) => a.position - b.position);

    // Create chunks between boundaries
    for (let i = 0; i < allBoundaries.length - 1; i++) {
      const start = allBoundaries[i].position;
      const end = allBoundaries[i + 1].position;

      if (end > start) {
        const chunkSentences = sentences.slice(start, end);
        const content = chunkSentences.join(' ');
        const tokenCount = estimateTokens(content);

        // Skip very small chunks unless they're structural boundaries (more permissive)
        if (
          tokenCount < Math.min(config.minSemanticChunkSize, 150) &&
          allBoundaries[i].type !== 'section_break'
        ) {
          continue;
        }

        // Split large chunks further if needed
        if (tokenCount > config.maxSemanticChunkSize) {
          const subChunks = this.splitLargeChunk(chunkSentences, config);
          chunks.push(...subChunks);
        } else {
          chunks.push({
            sentences: chunkSentences,
            semanticScore: 0.8, // TODO: Calculate actual semantic coherence
            topics: [], // TODO: Extract topics/themes
            boundaries: { start, end },
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Split chunks that are too large while maintaining semantic coherence
   */
  private splitLargeChunk(
    sentences: string[],
    config: SemanticChunkingConfig
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const targetSize =
      (config.minSemanticChunkSize + config.maxSemanticChunkSize) / 2;

    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = estimateTokens(sentence);

      if (
        currentTokens + sentenceTokens > config.maxSemanticChunkSize &&
        currentChunk.length > 0
      ) {
        // Create chunk from current sentences
        chunks.push({
          sentences: [...currentChunk],
          semanticScore: 0.8,
          topics: [],
          boundaries: { start: i - currentChunk.length, end: i },
        });

        // Start new chunk with overlap if configured
        if (config.sentenceOverlap && currentChunk.length > 1) {
          const overlapSentence = currentChunk[currentChunk.length - 1];
          currentChunk = [overlapSentence, sentence];
          currentTokens = estimateTokens(overlapSentence + ' ' + sentence);
        } else {
          currentChunk = [sentence];
          currentTokens = sentenceTokens;
        }
      } else {
        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
      }
    }

    // Add final chunk if any sentences remain
    if (currentChunk.length > 0) {
      chunks.push({
        sentences: currentChunk,
        semanticScore: 0.8,
        topics: [],
        boundaries: {
          start: sentences.length - currentChunk.length,
          end: sentences.length,
        },
      });
    }

    return chunks;
  }

  /**
   * Convert semantic chunks to document chunks
   */
  private async convertToDocumentChunks(
    semanticChunks: SemanticChunk[],
    documentId: string,
    metadata?: DocumentMetadata,
    config?: SemanticChunkingConfig
  ): Promise<DocumentChunk[]> {
    const documentChunks: DocumentChunk[] = [];

    for (let i = 0; i < semanticChunks.length; i++) {
      const chunk = semanticChunks[i];
      const content = chunk.sentences.join(' ').trim();
      const tokenCount = estimateTokens(content);

      if (content.length === 0) continue;

      const documentChunk: DocumentChunk = {
        id: `${documentId}_semantic_${i}`,
        document_id: documentId,
        content,
        token_count: tokenCount,
        position: i,
        content_hash: createHash('sha256').update(content).digest('hex'),
        metadata: {
          semantic_score: chunk.semanticScore,
          sentence_count: chunk.sentences.length,
          topics: chunk.topics,
          boundary_start: chunk.boundaries.start,
          boundary_end: chunk.boundaries.end,
          chunk_type: 'semantic',
          created_at: new Date().toISOString(),
        },
      };

      documentChunks.push(documentChunk);
    }

    return documentChunks;
  }

  /**
   * Validate semantic chunks meet quality requirements
   */
  private validateSemanticChunks(
    chunks: DocumentChunk[],
    config: SemanticChunkingConfig
  ): DocumentChunk[] {
    return chunks.filter(chunk => {
      // More permissive token count bounds
      const minTokens = Math.min(config.minSemanticChunkSize, 100); // Allow smaller chunks
      if (
        chunk.token_count < minTokens ||
        chunk.token_count > config.maxSemanticChunkSize
      ) {
        return false;
      }

      // Check content quality (more permissive)
      if (!chunk.content.trim() || chunk.content.length < 25) {
        return false;
      }

      // More lenient sentence count requirement
      const sentenceCount = (chunk.metadata?.sentence_count as number) || 1;
      if (sentenceCount < 1) {
        // Allow single sentence chunks
        return false;
      }

      return true;
    });
  }

  /**
   * Fall back to structural chunking when semantic chunking fails
   */
  private async fallbackToStructuralChunking(
    content: string,
    documentId: string,
    metadata?: DocumentMetadata,
    config?: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    console.log('🔄 Using structural chunking as fallback');

    // Use unified chunking service with academic/patent strategy if applicable
    const strategy = this.determineStructuralStrategy(metadata);

    const result = await unifiedChunkingService.createChunks({
      content,
      documentId,
      documentType: metadata?.docType,
      strategy,
      customConfig: config,
    });

    return result.chunks;
  }

  /**
   * Determine the best structural chunking strategy
   */
  private determineStructuralStrategy(metadata?: DocumentMetadata): string {
    if (!metadata?.docType) return 'auto';

    switch (metadata.docType) {
      case 'patent':
        return 'patent';
      case 'paper':
      case 'pdf':
        return 'academic';
      case 'press-article':
        return 'technical';
      default:
        return 'auto';
    }
  }
}

// Export singleton instance
export const semanticChunkingService = new SemanticChunkingService();

/**
 * Enhanced chunking function that uses semantic analysis when beneficial
 */
export async function createSemanticChunks(
  content: string,
  documentId: string,
  metadata?: DocumentMetadata,
  config?: Partial<SemanticChunkingConfig>
): Promise<DocumentChunk[]> {
  // Determine if semantic chunking is beneficial
  const shouldUseSemanticChunking = await shouldUseSemantic(content, metadata);

  if (!shouldUseSemanticChunking) {
    console.log(
      '📄 Using structural chunking (semantic not beneficial for this document)'
    );
    return await semanticChunkingService['fallbackToStructuralChunking'](
      content,
      documentId,
      metadata,
      config
    );
  }

  return await semanticChunkingService.createSemanticChunks(
    content,
    documentId,
    metadata,
    config
  );
}

/**
 * Determine if semantic chunking would be beneficial for this content
 */
async function shouldUseSemantic(
  content: string,
  metadata?: DocumentMetadata
): Promise<boolean> {
  const contentLength = content.length;
  const tokenCount = estimateTokens(content);

  // Don't use semantic chunking for very short documents (reduced threshold)
  if (tokenCount < 500) {
    return false;
  }

  // Don't use for highly structured documents (patents, code) - but allow papers
  if (
    metadata?.docType === 'patent' ||
    content.includes('```') ||
    /^\d+\.\s/m.test(content)
  ) {
    return false;
  }

  // Use semantic chunking for academic papers and medium-form content (reduced threshold)
  if (metadata?.docType === 'paper' || tokenCount > 1500) {
    return true;
  }

  // Check content characteristics (more permissive)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const avgSentenceLength = contentLength / sentences.length;

  // Use semantic for content with reasonable sentence structure (more permissive)
  return avgSentenceLength > 30 && sentences.length > 10;
}
