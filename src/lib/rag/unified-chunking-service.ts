/**
 * Unified Chunking Service
 *
 * Consolidates chunking strategies across different document types
 * (generic, academic, patent) with intelligent section awareness
 * and configurable token limits.
 */

import { createHash } from 'crypto';
import type { DocumentChunk, ChunkingConfig, DocumentType } from './types';
import { DEFAULT_RAG_CONFIG } from './types';
import {
  documentAnalyzer,
  type DocumentAnalysis,
} from './unified-document-analyzer';

// =======================
// Chunking Strategy Types
// =======================

export interface ChunkingStrategy {
  name: string;
  description: string;
  tokenRange: { min: number; max: number };
  overlapPercentage: number;
  sectionAware: boolean;
  preserveStructure: boolean;
}

export interface ChunkingRequest {
  content: string;
  documentId: string;
  documentType?: DocumentType;
  documentAnalysis?: DocumentAnalysis;
  customConfig?: Partial<ChunkingConfig>;
  strategy?: 'auto' | 'generic' | 'academic' | 'patent' | 'technical';
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  strategy: ChunkingStrategy;
  totalTokens: number;
  avgChunkSize: number;
  metadata: {
    sectionsDetected: number;
    preservedStructure: boolean;
    overlapApplied: boolean;
  };
}

// =======================
// Chunking Strategies
// =======================

const CHUNKING_STRATEGIES: Record<string, ChunkingStrategy> = {
  generic: {
    name: 'Generic',
    description: 'Standard chunking for general documents',
    tokenRange: { min: 200, max: 1200 }, // Reduced min from 800 to 200
    overlapPercentage: 0.15,
    sectionAware: false,
    preserveStructure: false,
  },

  academic: {
    name: 'Academic',
    description: 'Preserves academic paper structure with section awareness',
    tokenRange: { min: 300, max: 1600 }, // Reduced min from 1000 to 300
    overlapPercentage: 0.2,
    sectionAware: true,
    preserveStructure: true,
  },

  patent: {
    name: 'Patent',
    description: 'Optimized for patent documents with claim preservation',
    tokenRange: { min: 400, max: 1800 }, // Reduced min from 1200 to 400
    overlapPercentage: 0.25,
    sectionAware: true,
    preserveStructure: true,
  },

  technical: {
    name: 'Technical',
    description: 'For technical documentation with code/formula preservation',
    tokenRange: { min: 250, max: 1400 }, // Reduced min from 900 to 250
    overlapPercentage: 0.18,
    sectionAware: true,
    preserveStructure: true,
  },
};

// =======================
// Token Estimation
// =======================

function estimateTokens(text: string): number {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const baseCount = normalized.length / 4;
  const punctuationCount = (normalized.match(/[.!?,;:()\[\]{}'"]/g) || [])
    .length;
  return Math.ceil(baseCount + punctuationCount * 0.1);
}

function splitAtTokenBoundary(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }

  const words = text.split(/\s+/);
  let result = '';
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word + ' ');
    if (currentTokens + wordTokens > maxTokens) {
      break;
    }
    result += (result ? ' ' : '') + word;
    currentTokens += wordTokens;
  }

  return result;
}

// =======================
// Section Detection
// =======================

interface DocumentSection {
  title: string;
  content: string;
  level: number;
  startPosition: number;
  endPosition: number;
  type: 'header' | 'paragraph' | 'list' | 'code' | 'equation' | 'table';
}

function detectSections(
  content: string,
  documentType?: DocumentType
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = content.split('\n');
  let currentPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      currentPosition += lines[i].length + 1;
      continue;
    }

    // Detect different section types based on patterns
    const section = detectSectionType(
      line,
      lines,
      i,
      currentPosition,
      documentType
    );
    if (section) {
      sections.push(section);
    }

    currentPosition += lines[i].length + 1;
  }

  return sections;
}

function detectSectionType(
  line: string,
  allLines: string[],
  lineIndex: number,
  position: number,
  documentType?: DocumentType
): DocumentSection | null {
  // Academic paper sections
  if (documentType === 'paper') {
    const academicHeaders = [
      /^(?:abstract|introduction|methodology|methods|results|discussion|conclusion|references)\s*$/i,
      /^\d+\.?\s+[A-Z][a-z\s]+$/,
      /^[A-Z\s]{3,}$/,
    ];

    for (const pattern of academicHeaders) {
      if (pattern.test(line)) {
        return {
          title: line,
          content: '',
          level: line.match(/^\d+/) ? 2 : 1,
          startPosition: position,
          endPosition: position + line.length,
          type: 'header',
        };
      }
    }
  }

  // Patent sections
  if (documentType === 'patent') {
    const patentHeaders = [
      /^(?:field\s+of\s+the\s+invention|background|summary|brief\s+description|detailed\s+description|claims)\s*$/i,
      /^claim\s+\d+/i,
      /^\d+\.\s+[A-Z]/,
    ];

    for (const pattern of patentHeaders) {
      if (pattern.test(line)) {
        return {
          title: line,
          content: '',
          level: line.startsWith('claim') ? 2 : 1,
          startPosition: position,
          endPosition: position + line.length,
          type: 'header',
        };
      }
    }
  }

  // Generic numbered or lettered lists
  if (/^\s*[\d\w]\.\s+/.test(line)) {
    return {
      title: '',
      content: line,
      level: 3,
      startPosition: position,
      endPosition: position + line.length,
      type: 'list',
    };
  }

  // Code blocks (technical documents)
  if (
    line.startsWith('```') ||
    line.includes('function') ||
    line.includes('class ')
  ) {
    return {
      title: '',
      content: line,
      level: 3,
      startPosition: position,
      endPosition: position + line.length,
      type: 'code',
    };
  }

  return null;
}

// =======================
// Main Chunking Service
// =======================

export class UnifiedChunkingService {
  /**
   * Create chunks using the most appropriate strategy for the document
   */
  async createChunks(request: ChunkingRequest): Promise<ChunkingResult> {
    // ENHANCED: Validate content before processing
    const contentValidation = this.validateContent(request.content);
    if (!contentValidation.isValid) {
      throw new Error(`Content validation failed: ${contentValidation.reason}`);
    }

    // Auto-detect strategy if not specified
    const strategy = await this.selectStrategy(request);

    // Get configuration with adaptive sizing for short content
    const config = this.getAdaptiveChunkingConfig(
      strategy,
      request.customConfig,
      request.content
    );

    // Analyze document structure if needed
    const sections = strategy.sectionAware
      ? detectSections(request.content, request.documentType)
      : [];

    // Create chunks based on strategy
    const chunks = await this.executeChunkingStrategy(
      request.content,
      request.documentId,
      strategy,
      config,
      sections
    );

    // Calculate metadata
    const totalTokens = chunks.reduce(
      (sum, chunk) => sum + chunk.token_count,
      0
    );
    const avgChunkSize = chunks.length > 0 ? totalTokens / chunks.length : 0;

    return {
      chunks,
      strategy,
      totalTokens,
      avgChunkSize,
      metadata: {
        sectionsDetected: sections.length,
        preservedStructure: strategy.preserveStructure,
        overlapApplied: strategy.overlapPercentage > 0,
      },
    };
  }

  /**
   * Select the most appropriate chunking strategy
   */
  private async selectStrategy(
    request: ChunkingRequest
  ): Promise<ChunkingStrategy> {
    if (request.strategy && request.strategy !== 'auto') {
      return CHUNKING_STRATEGIES[request.strategy];
    }

    // Use document analysis if available
    let analysis = request.documentAnalysis;
    if (!analysis && request.documentType) {
      analysis = await documentAnalyzer.analyzeDocument({
        content: request.content,
      });
    }

    // Auto-select strategy based on analysis
    if (analysis?.isAcademic && analysis.academicConfidence > 0.7) {
      return CHUNKING_STRATEGIES.academic;
    }

    if (request.documentType === 'patent') {
      return CHUNKING_STRATEGIES.patent;
    }

    if (analysis?.characteristics.includes('technical')) {
      return CHUNKING_STRATEGIES.technical;
    }

    return CHUNKING_STRATEGIES.generic;
  }

  /**
   * Get chunking configuration based on strategy and custom overrides
   */
  private getChunkingConfig(
    strategy: ChunkingStrategy,
    customConfig?: Partial<ChunkingConfig>
  ): ChunkingConfig {
    return {
      chunkSize: customConfig?.chunkSize || strategy.tokenRange.max,
      minChunkSize: customConfig?.minChunkSize || strategy.tokenRange.min,
      overlapSize:
        customConfig?.overlapSize ||
        Math.floor(strategy.tokenRange.max * strategy.overlapPercentage),
      preserveStructure:
        customConfig?.preserveStructure ?? strategy.preserveStructure,
      ...DEFAULT_RAG_CONFIG,
    };
  }

  /**
   * Execute the chunking strategy
   */
  private async executeChunkingStrategy(
    content: string,
    documentId: string,
    strategy: ChunkingStrategy,
    config: ChunkingConfig,
    sections: DocumentSection[]
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    if (strategy.sectionAware && sections.length > 0) {
      // Section-aware chunking
      chunks.push(
        ...(await this.createSectionAwareChunks(
          content,
          documentId,
          config,
          sections
        ))
      );
    } else {
      // Standard sliding window chunking
      chunks.push(
        ...(await this.createSlidingWindowChunks(content, documentId, config))
      );
    }

    return chunks;
  }

  /**
   * Create chunks with section awareness
   */
  private async createSectionAwareChunks(
    content: string,
    documentId: string,
    config: ChunkingConfig,
    sections: DocumentSection[]
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    // Group sections into chunks that fit within token limits
    let currentChunk = '';
    let currentSections: DocumentSection[] = [];

    for (const section of sections) {
      const sectionContent = this.extractSectionContent(
        content,
        section,
        sections
      );
      const sectionTokens = estimateTokens(sectionContent);
      const currentTokens = estimateTokens(currentChunk);

      // If adding this section would exceed limits, finalize current chunk
      if (currentTokens + sectionTokens > config.chunkSize && currentChunk) {
        chunks.push(
          this.createChunk(
            currentChunk,
            documentId,
            chunkIndex++,
            currentSections
          )
        );

        // Start new chunk with overlap
        currentChunk = this.applyOverlap(currentChunk, config.overlapSize);
        currentSections = [];
      }

      currentChunk += (currentChunk ? '\n\n' : '') + sectionContent;
      currentSections.push(section);

      // If this section alone exceeds chunk size, split it
      if (sectionTokens > config.chunkSize) {
        const subChunks = await this.createSlidingWindowChunks(
          sectionContent,
          documentId,
          config,
          chunkIndex
        );
        chunks.push(...subChunks);
        chunkIndex += subChunks.length;
        currentChunk = '';
        currentSections = [];
      }
    }

    // Add final chunk if any content remains
    if (currentChunk.trim()) {
      chunks.push(
        this.createChunk(currentChunk, documentId, chunkIndex, currentSections)
      );
    }

    return chunks;
  }

  /**
   * Create chunks using sliding window approach
   */
  private async createSlidingWindowChunks(
    content: string,
    documentId: string,
    config: ChunkingConfig,
    startIndex = 0
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());

    let currentChunk = '';
    let chunkIndex = startIndex;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const paragraphTokens = estimateTokens(paragraph);
      const currentTokens = estimateTokens(currentChunk);

      // If adding this paragraph exceeds chunk size
      if (currentTokens + paragraphTokens > config.chunkSize && currentChunk) {
        // Create chunk
        chunks.push(this.createChunk(currentChunk, documentId, chunkIndex++));

        // Start new chunk with overlap
        currentChunk = this.applyOverlap(currentChunk, config.overlapSize);
      }

      // If single paragraph is too large, split it further
      if (paragraphTokens > config.chunkSize) {
        const sentences = this.splitIntoSentences(paragraph);
        for (const sentence of sentences) {
          const sentenceTokens = estimateTokens(sentence);

          if (
            estimateTokens(currentChunk) + sentenceTokens > config.chunkSize &&
            currentChunk
          ) {
            chunks.push(
              this.createChunk(currentChunk, documentId, chunkIndex++)
            );
            currentChunk = this.applyOverlap(currentChunk, config.overlapSize);
          }

          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(currentChunk, documentId, chunkIndex));
    }

    return chunks;
  }

  /**
   * Create a document chunk
   */
  private createChunk(
    content: string,
    documentId: string,
    position: number,
    sections?: DocumentSection[]
  ): DocumentChunk {
    const cleanContent = content.trim();
    const tokenCount = estimateTokens(cleanContent);
    const contentHash = createHash('sha256').update(cleanContent).digest('hex');

    return {
      id: `${documentId}_chunk_${position}`,
      document_id: documentId,
      content: cleanContent,
      token_count: tokenCount,
      position,
      content_hash: contentHash,
      metadata: {
        sections: sections?.map(s => ({ title: s.title, type: s.type })) || [],
        created_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Extract content for a specific section
   */
  private extractSectionContent(
    fullContent: string,
    section: DocumentSection,
    allSections: DocumentSection[]
  ): string {
    // Find the next section to determine content boundaries
    const nextSection = allSections.find(
      s => s.startPosition > section.startPosition
    );
    const endPosition = nextSection
      ? nextSection.startPosition
      : fullContent.length;

    return fullContent.slice(section.startPosition, endPosition).trim();
  }

  /**
   * Apply overlap by taking the last portion of current content
   */
  private applyOverlap(content: string, overlapTokens: number): string {
    if (overlapTokens <= 0 || !content) return '';

    const sentences = this.splitIntoSentences(content);
    let overlap = '';
    let currentTokens = 0;

    // Add sentences from the end until we reach overlap size
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const sentenceTokens = estimateTokens(sentence);

      if (currentTokens + sentenceTokens <= overlapTokens) {
        overlap = sentence + (overlap ? ' ' + overlap : '');
        currentTokens += sentenceTokens;
      } else {
        break;
      }
    }

    return overlap;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s =>
        s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.'
      );
  }

  /**
   * Validate content before chunking to catch URL-only or invalid content
   */
  private validateContent(content: string): {
    isValid: boolean;
    reason?: string;
  } {
    // Basic content checks
    if (!content || content.trim().length === 0) {
      return { isValid: false, reason: 'Empty content provided' };
    }

    // Check if content is just a URL (common failure case from extraction)
    const urlRegex = /^https?:\/\/[^\s]+$/;
    if (urlRegex.test(content.trim())) {
      return {
        isValid: false,
        reason: `Content is just a URL: ${content.trim()}`,
      };
    }

    // Check for minimum viable content length
    if (content.length < 25) {
      return {
        isValid: false,
        reason: `Content too short for chunking: ${content.length} chars`,
      };
    }

    // Check for extraction error patterns
    const errorPatterns = [
      /^Error:/i,
      /^Failed to/i,
      /^Cannot access/i,
      /^403 Forbidden/i,
      /^404 Not Found/i,
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(content)) {
        return {
          isValid: false,
          reason: `Content appears to be an error message: ${content.substring(0, 50)}...`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Get adaptive chunking configuration that adjusts for short content
   */
  private getAdaptiveChunkingConfig(
    strategy: ChunkingStrategy,
    customConfig?: Partial<ChunkingConfig>,
    content?: string
  ): ChunkingConfig {
    const contentTokens = content ? estimateTokens(content) : 0;

    // For very short content, use smaller chunks
    const adaptedStrategy = { ...strategy };
    if (contentTokens < 500) {
      adaptedStrategy.tokenRange = {
        min: Math.min(50, contentTokens),
        max: Math.min(300, contentTokens + 50),
      };
      console.log(
        `📏 Adaptive chunking: content has ${contentTokens} tokens, using range ${adaptedStrategy.tokenRange.min}-${adaptedStrategy.tokenRange.max}`
      );
    }

    return {
      chunkSize: customConfig?.chunkSize || adaptedStrategy.tokenRange.max,
      minChunkSize:
        customConfig?.minChunkSize || adaptedStrategy.tokenRange.min,
      overlapSize:
        customConfig?.overlapSize ||
        Math.floor(
          adaptedStrategy.tokenRange.max * adaptedStrategy.overlapPercentage
        ),
      preserveStructure:
        customConfig?.preserveStructure ?? adaptedStrategy.preserveStructure,
      ...DEFAULT_RAG_CONFIG,
    };
  }
}

// Export singleton
export const unifiedChunkingService = new UnifiedChunkingService();
