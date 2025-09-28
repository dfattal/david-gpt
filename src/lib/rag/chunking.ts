/**
 * Document Chunking System
 *
 * Handles intelligent text chunking with 800-1200 tokens, 15-20% overlap,
 * and section awareness for optimal retrieval performance.
 */

import { createHash } from 'crypto';
import type { DocumentChunk, ChunkingConfig } from './types';
import { DEFAULT_RAG_CONFIG } from './types';

// =======================
// Token Estimation
// =======================

/**
 * Estimate token count using OpenAI's approximation (4 chars ≈ 1 token)
 * More accurate than splitting by words, accounts for punctuation and spaces
 */
function estimateTokens(text: string): number {
  // Remove extra whitespace and normalize
  const normalized = text.trim().replace(/\s+/g, ' ');

  // OpenAI's approximation: ~4 characters per token for English text
  // Adjust for punctuation and special characters
  const baseCount = normalized.length / 4;

  // Account for punctuation (slightly increases token count)
  const punctuationCount = (normalized.match(/[.!?,;:()\[\]{}'"]/g) || [])
    .length;

  return Math.ceil(baseCount + punctuationCount * 0.1);
}

/**
 * Split text at token boundary while preserving word integrity
 */
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

  return result || text; // Fallback if single word exceeds limit
}

// =======================
// Section Detection
// =======================

interface DocumentSection {
  title: string;
  content: string;
  level: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Detect document sections based on formatting patterns
 */
function detectSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = text.split('\n');

  let currentSection: DocumentSection | null = null;
  let lineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    lineIndex += lines[i].length + 1; // +1 for newline

    // Detect section headers (various patterns)
    const sectionMatch = detectSectionHeader(line, i, lines);

    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endIndex = lineIndex - lines[i].length - 1;
        currentSection.content = text
          .slice(currentSection.startIndex, currentSection.endIndex)
          .trim();
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: sectionMatch.title,
        level: sectionMatch.level,
        content: '',
        startIndex: lineIndex,
        endIndex: text.length,
      };
    }
  }

  // Handle last section
  if (currentSection) {
    currentSection.content = text.slice(currentSection.startIndex).trim();
    sections.push(currentSection);
  }

  // If no sections detected, create a single section
  if (sections.length === 0) {
    sections.push({
      title: 'Document',
      content: text,
      level: 1,
      startIndex: 0,
      endIndex: text.length,
    });
  }

  return sections;
}

/**
 * Detect section headers using various patterns
 */
function detectSectionHeader(
  line: string,
  index: number,
  allLines: string[]
): { title: string; level: number } | null {
  // Pattern 1: Markdown headers
  const markdownMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (markdownMatch) {
    return {
      title: markdownMatch[2],
      level: markdownMatch[1].length,
    };
  }

  // Pattern 2: Numbered sections (1. 1.1. 1.1.1.)
  const numberedMatch = line.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
  if (numberedMatch) {
    const level = (numberedMatch[1].match(/\./g) || []).length + 1;
    return {
      title: numberedMatch[2],
      level,
    };
  }

  // Pattern 3: ALL CAPS headers
  if (
    line.length > 3 &&
    line === line.toUpperCase() &&
    /^[A-Z\s]+$/.test(line)
  ) {
    return {
      title: line,
      level: 2,
    };
  }

  // Pattern 4: Underlined headers (next line is ===== or -----)
  if (index + 1 < allLines.length) {
    const nextLine = allLines[index + 1].trim();
    if (nextLine.length >= 3 && /^[=-]{3,}$/.test(nextLine)) {
      const level = nextLine.startsWith('=') ? 1 : 2;
      return {
        title: line,
        level,
      };
    }
  }

  // Pattern 5: Roman numerals (I. II. III.)
  const romanMatch = line.match(/^([IVX]+\.)\s+(.+)$/);
  if (romanMatch) {
    return {
      title: romanMatch[2],
      level: 2,
    };
  }

  return null;
}

// =======================
// Smart Chunking Algorithm
// =======================

export class DocumentChunker {
  private config: ChunkingConfig;

  constructor(config: ChunkingConfig = DEFAULT_RAG_CONFIG.chunking) {
    this.config = config;
  }

  /**
   * Main chunking method - creates optimally sized chunks with overlap
   */
  async chunkDocument(
    text: string,
    documentId: string,
    metadata?: {
      title?: string;
      sections?: DocumentSection[];
    }
  ): Promise<DocumentChunk[]> {
    if (!text?.trim()) {
      throw new Error('Text content is required for chunking');
    }

    const totalTokens = estimateTokens(text);

    // If document is small (< 1000 tokens), keep as single chunk
    if (totalTokens < 1000) {
      console.log(
        `Document is small (${totalTokens} tokens), keeping as single chunk`
      );
      return [
        {
          id: '', // Will be set by database
          documentId,
          content: text.trim(),
          contentHash: createHash('sha256').update(text.trim()).digest('hex'),
          tokenCount: totalTokens,
          chunkIndex: 0,
          sectionTitle: metadata?.title || 'Document',
          overlapStart: 0,
          overlapEnd: 0,
          createdAt: new Date(),
        },
      ];
    }

    const sections =
      metadata?.sections ||
      (this.config.sectionAware ? detectSections(text) : []);

    // For medium-sized documents (1000-2000 tokens), be more conservative with section chunking
    // Only use section-based chunking if we have reasonable sections (not too many tiny ones)
    if (this.config.sectionAware && sections.length > 1) {
      const shouldUseTokenBasedChunking = this.shouldAvoidSectionChunking(
        sections,
        totalTokens
      );

      if (shouldUseTokenBasedChunking) {
        console.log(
          `Document has ${sections.length} sections but would create too many small chunks, using token-based chunking instead`
        );
        return this.chunkByTokens(text, documentId);
      }

      const sectionChunks = await this.chunkBySections(
        text,
        documentId,
        sections
      );

      // If section-based chunking produced valid chunks, use them
      const validChunks = this.postProcessChunks(sectionChunks);
      if (validChunks.length > 0 && validChunks.length <= 5) {
        // Don't return more than 5 chunks for medium docs
        return validChunks;
      }

      // If section-based chunking produced too many chunks, fall back to token-based chunking
      console.log(
        'Section-based chunking produced too many chunks, falling back to token-based chunking'
      );
    }

    // Use sliding window approach (either as primary strategy or fallback)
    return this.chunkByTokens(text, documentId);
  }

  /**
   * Determine if we should avoid section-based chunking due to too many small sections
   */
  private shouldAvoidSectionChunking(
    sections: DocumentSection[],
    totalTokens: number
  ): boolean {
    // If we have too many sections relative to document size, avoid section chunking
    const averageTokensPerSection = totalTokens / sections.length;

    // Count very small sections (< 50 tokens) and empty sections
    const smallSections = sections.filter(s => {
      const sectionTokens = estimateTokens(s.content);
      return sectionTokens < 50;
    }).length;

    // Count empty sections
    const emptySections = sections.filter(
      s => s.content.trim().length === 0
    ).length;

    // Avoid section chunking if:
    // 1. More than 50% of sections are very small or empty
    // 2. More than 10 sections for documents under 3000 tokens
    // 3. Average section size is less than 200 tokens for documents under 2000 tokens
    const tooManySmallSections =
      (smallSections + emptySections) / sections.length > 0.5;
    const tooManySections = sections.length > 10 && totalTokens < 3000;
    const sectionsTooSmall =
      averageTokensPerSection < 200 && totalTokens < 2000;

    if (tooManySmallSections) {
      console.log(
        `Avoiding section chunking: ${smallSections + emptySections}/${sections.length} sections are small/empty`
      );
      return true;
    }

    if (tooManySections) {
      console.log(
        `Avoiding section chunking: ${sections.length} sections is too many for ${totalTokens} token document`
      );
      return true;
    }

    if (sectionsTooSmall) {
      console.log(
        `Avoiding section chunking: average section size of ${Math.round(averageTokensPerSection)} tokens is too small`
      );
      return true;
    }

    return false;
  }

  /**
   * Chunk by sections, respecting section boundaries
   */
  private async chunkBySections(
    text: string,
    documentId: string,
    sections: DocumentSection[]
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const section of sections) {
      const sectionChunks = await this.chunkByTokens(
        section.content,
        documentId,
        section.title
      );

      // Update chunk indices to be global
      for (const chunk of sectionChunks) {
        chunk.chunkIndex = chunks.length;
        chunks.push(chunk);
      }
    }

    // Apply overlap between section boundaries
    this.applyInterSectionOverlap(chunks, text);

    return chunks;
  }

  /**
   * Chunk by token count using sliding window with overlap
   */
  private async chunkByTokens(
    text: string,
    documentId: string,
    sectionTitle?: string
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const targetTokens = this.config.targetTokens;
    const overlapPercent = this.config.overlapPercent / 100;
    const overlapTokens = Math.floor(targetTokens * overlapPercent);

    let position = 0;
    let chunkIndex = 0;

    while (position < text.length) {
      const endPosition = this.findOptimalChunkEnd(
        text,
        position,
        targetTokens
      );
      const chunkText = text.slice(position, endPosition);

      // Skip empty chunks
      if (!chunkText.trim()) {
        break;
      }

      const tokenCount = estimateTokens(chunkText);

      // Create chunk
      const chunk: DocumentChunk = {
        id: '', // Will be set by database
        documentId,
        content: chunkText.trim(),
        contentHash: createHash('sha256')
          .update(chunkText.trim())
          .digest('hex'),
        tokenCount,
        chunkIndex,
        sectionTitle,
        overlapStart: position > 0 ? overlapTokens : 0,
        overlapEnd: endPosition < text.length ? overlapTokens : 0,
        createdAt: new Date(),
      };

      chunks.push(chunk);

      // Calculate next position with overlap
      if (endPosition >= text.length) {
        break;
      }

      const overlapStart = Math.max(
        position,
        endPosition - this.getOverlapCharacters(chunkText, overlapTokens)
      );

      position = overlapStart;
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Find optimal chunk end position respecting sentence boundaries
   */
  private findOptimalChunkEnd(
    text: string,
    start: number,
    maxTokens: number
  ): number {
    const maxChars = maxTokens * 4; // Rough approximation
    const end = Math.min(start + maxChars, text.length);

    // If we're at the end, return
    if (end >= text.length) {
      return text.length;
    }

    // Try to end at sentence boundary
    const sentenceEnd = this.findSentenceBoundary(text, start, end);
    if (sentenceEnd > start) {
      return sentenceEnd;
    }

    // Try to end at paragraph boundary
    const paragraphEnd = this.findParagraphBoundary(text, start, end);
    if (paragraphEnd > start) {
      return paragraphEnd;
    }

    // Fall back to word boundary
    return this.findWordBoundary(text, end);
  }

  /**
   * Find sentence boundary near target position
   */
  private findSentenceBoundary(
    text: string,
    start: number,
    target: number
  ): number {
    // Look backwards from target for sentence endings
    const searchStart = Math.max(start, target - 200); // Don't look too far back
    const searchText = text.slice(searchStart, target + 100);

    // Sentence ending patterns
    const sentenceEndings = /[.!?]+[\s\n]/g;
    let match;
    let lastMatch = -1;

    while ((match = sentenceEndings.exec(searchText)) !== null) {
      const position = searchStart + match.index + match[0].length;
      if (position <= target + 50) {
        // Allow some flexibility
        lastMatch = position;
      }
    }

    return lastMatch > start ? lastMatch : -1;
  }

  /**
   * Find paragraph boundary near target position
   */
  private findParagraphBoundary(
    text: string,
    start: number,
    target: number
  ): number {
    const searchStart = Math.max(start, target - 100);

    for (let i = target; i >= searchStart; i--) {
      if (text[i] === '\n' && text[i + 1] === '\n') {
        return i + 2;
      }
    }

    return -1;
  }

  /**
   * Find word boundary near target position
   */
  private findWordBoundary(text: string, target: number): number {
    for (let i = target; i >= Math.max(0, target - 50); i--) {
      if (/\s/.test(text[i])) {
        return i;
      }
    }
    return target;
  }

  /**
   * Calculate character count for token-based overlap
   */
  private getOverlapCharacters(text: string, overlapTokens: number): number {
    if (overlapTokens <= 0) return 0;

    // Rough approximation: 4 chars per token
    const targetChars = overlapTokens * 4;

    // Find word boundary near target
    return this.findWordBoundary(text, Math.min(targetChars, text.length));
  }

  /**
   * Apply overlap between section boundaries
   */
  private applyInterSectionOverlap(
    chunks: DocumentChunk[],
    text: string
  ): void {
    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1];
      const currentChunk = chunks[i];

      // Add overlap from previous chunk to current chunk
      if (prevChunk.content && currentChunk.content) {
        const overlapTokens = Math.floor(
          this.config.targetTokens * (this.config.overlapPercent / 100)
        );
        const overlapChars = this.getOverlapCharacters(
          prevChunk.content,
          overlapTokens
        );

        if (overlapChars > 0) {
          const overlapText = prevChunk.content.slice(-overlapChars);
          currentChunk.content = overlapText + '\n\n' + currentChunk.content;
          currentChunk.overlapStart = overlapTokens;
          currentChunk.tokenCount = estimateTokens(currentChunk.content);
          currentChunk.contentHash = createHash('sha256')
            .update(currentChunk.content)
            .digest('hex');
        }
      }
    }
  }

  /**
   * Validate chunk meets size requirements
   */
  private validateChunk(chunk: DocumentChunk): boolean {
    const tokens = chunk.tokenCount;
    return (
      tokens >= this.config.minChunkTokens &&
      tokens <= this.config.maxChunkTokens &&
      chunk.content.trim().length > 0
    );
  }

  /**
   * Post-process chunks to ensure quality
   */
  postProcessChunks(chunks: DocumentChunk[]): DocumentChunk[] {
    return chunks
      .filter(chunk => this.validateChunk(chunk))
      .map((chunk, index) => ({
        ...chunk,
        chunkIndex: index, // Ensure sequential indexing
      }));
  }
}

/**
 * Utility function for quick chunking with default config
 */
export async function chunkText(
  text: string,
  documentId: string,
  config?: Partial<ChunkingConfig>
): Promise<DocumentChunk[]> {
  const chunker = new DocumentChunker(
    config ? { ...DEFAULT_RAG_CONFIG.chunking, ...config } : undefined
  );

  const chunks = await chunker.chunkDocument(text, documentId);
  return chunker.postProcessChunks(chunks);
}

export { estimateTokens, detectSections };
