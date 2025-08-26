// Text chunking utilities for RAG system
// Phase 2: Chunking & Embeddings

import { RAG_CONSTANTS } from './types'

export interface ChunkingOptions {
  chunkSize?: number // Target tokens per chunk (200-300)
  overlap?: number   // Token overlap between chunks (50)
  preserveParagraphs?: boolean // Try to keep paragraphs intact
  preserveSentences?: boolean  // Try to keep sentences intact
}

export interface TextChunk {
  content: string
  index: number
  startOffset: number
  endOffset: number
  tokenCount: number
}

export interface ChunkingResult {
  chunks: TextChunk[]
  totalTokens: number
  averageChunkSize: number
}

// Simple token estimation (approximation: 1 token ≈ 4 characters for English)
export function estimateTokenCount(text: string): number {
  // More accurate estimation based on whitespace and punctuation
  // GPT models roughly: 1 token = 0.75 words, 1 word ≈ 5.3 chars including spaces
  return Math.ceil(text.length / 4)
}

// Split text into sentences using basic punctuation rules
export function splitIntoSentences(text: string): string[] {
  // Handle common abbreviations that shouldn't trigger sentence breaks
  const abbreviations = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Inc.', 'Corp.', 'Ltd.', 'vs.', 'etc.', 'i.e.', 'e.g.']
  let processedText = text
  
  // Temporarily replace abbreviations to avoid false sentence splits
  const abbreviationPlaceholders: Record<string, string> = {}
  abbreviations.forEach((abbr, index) => {
    const placeholder = `__ABBR_${index}__`
    abbreviationPlaceholders[placeholder] = abbr
    processedText = processedText.replace(new RegExp(abbr.replace('.', '\\.'), 'g'), placeholder)
  })
  
  // Split on sentence endings: . ! ? followed by whitespace and capital letter
  const sentences = processedText
    .split(/[.!?]+\s+(?=[A-Z])/)
    .map(sentence => {
      // Restore abbreviations
      let restored = sentence
      Object.entries(abbreviationPlaceholders).forEach(([placeholder, abbr]) => {
        restored = restored.replace(new RegExp(placeholder, 'g'), abbr)
      })
      return restored.trim()
    })
    .filter(sentence => sentence.length > 0)
  
  return sentences
}

// Split text into paragraphs
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)
}

// Core chunking algorithm with overlap and boundary preservation
export function chunkText(
  text: string, 
  options: ChunkingOptions = {}
): ChunkingResult {
  const {
    chunkSize = RAG_CONSTANTS.CHUNK_SIZE_MAX,
    overlap = RAG_CONSTANTS.CHUNK_OVERLAP,
    preserveParagraphs = true,
    preserveSentences = true
  } = options

  const chunks: TextChunk[] = []
  const currentOffset = 0
  let chunkIndex = 0

  // Clean and normalize text
  const normalizedText = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\s+/g, ' ')   // Normalize whitespace
    .trim()

  if (!normalizedText) {
    return { chunks: [], totalTokens: 0, averageChunkSize: 0 }
  }

  const totalTokens = estimateTokenCount(normalizedText)

  // If text is small enough, return as single chunk
  if (totalTokens <= chunkSize) {
    chunks.push({
      content: normalizedText,
      index: 0,
      startOffset: 0,
      endOffset: normalizedText.length,
      tokenCount: totalTokens
    })
    
    return {
      chunks,
      totalTokens,
      averageChunkSize: totalTokens
    }
  }

  // Split text into workable units based on preferences
  let textUnits: string[]
  
  if (preserveParagraphs) {
    textUnits = splitIntoParagraphs(normalizedText)
  } else if (preserveSentences) {
    textUnits = splitIntoSentences(normalizedText)
  } else {
    // Fallback: split by sentences anyway for better boundaries
    textUnits = splitIntoSentences(normalizedText)
  }

  let currentChunk = ''
  let currentChunkStartOffset = 0

  for (let i = 0; i < textUnits.length; i++) {
    const unit = textUnits[i]
    const potentialChunk = currentChunk ? `${currentChunk} ${unit}` : unit
    const potentialTokens = estimateTokenCount(potentialChunk)

    // If adding this unit would exceed chunk size, finalize current chunk
    if (potentialTokens > chunkSize && currentChunk) {
      const chunkTokens = estimateTokenCount(currentChunk)
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: currentChunkStartOffset,
        endOffset: currentChunkStartOffset + currentChunk.length,
        tokenCount: chunkTokens
      })

      // Calculate overlap for next chunk
      if (overlap > 0 && chunkTokens > overlap) {
        const overlapText = getOverlapText(currentChunk, overlap)
        currentChunk = `${overlapText} ${unit}`
        // Adjust start offset to account for overlap
        currentChunkStartOffset = findOverlapOffset(normalizedText, currentChunkStartOffset, overlapText)
      } else {
        currentChunk = unit
        currentChunkStartOffset = normalizedText.indexOf(unit, currentChunkStartOffset)
      }
    } else {
      // Add unit to current chunk
      if (!currentChunk) {
        currentChunkStartOffset = normalizedText.indexOf(unit, currentOffset)
      }
      currentChunk = potentialChunk
    }

    // Handle case where single unit is too large
    if (estimateTokenCount(unit) > chunkSize) {
      // Split large unit by character boundaries as fallback
      const largeUnitChunks = chunkByCharacters(unit, chunkSize, overlap)
      largeUnitChunks.forEach(largeChunk => {
        chunks.push({
          content: largeChunk.content,
          index: chunkIndex++,
          startOffset: currentChunkStartOffset + largeChunk.startOffset,
          endOffset: currentChunkStartOffset + largeChunk.endOffset,
          tokenCount: largeChunk.tokenCount
        })
      })
      currentChunk = ''
      currentChunkStartOffset = normalizedText.indexOf(unit, currentChunkStartOffset) + unit.length
    }
  }

  // Add final chunk if there's remaining content
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentChunkStartOffset,
      endOffset: currentChunkStartOffset + currentChunk.length,
      tokenCount: estimateTokenCount(currentChunk)
    })
  }

  const averageChunkSize = chunks.length > 0 
    ? chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / chunks.length 
    : 0

  return {
    chunks,
    totalTokens,
    averageChunkSize
  }
}

// Get overlap text from the end of a chunk
function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.trim().split(/\s+/)
  const estimatedOverlapWords = Math.ceil(overlapTokens * 0.75) // Rough token-to-word ratio
  const overlapWords = words.slice(-estimatedOverlapWords)
  return overlapWords.join(' ')
}

// Find the offset where overlap text begins in the original text
function findOverlapOffset(fullText: string, searchStartOffset: number, overlapText: string): number {
  const index = fullText.indexOf(overlapText, searchStartOffset)
  return index !== -1 ? index : searchStartOffset
}

// Fallback chunking by character boundaries (for very long units)
function chunkByCharacters(
  text: string, 
  maxTokens: number, 
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = []
  const maxChars = maxTokens * 4 // Rough token-to-char ratio
  const overlapChars = overlap * 4
  
  let start = 0
  let index = 0

  while (start < text.length) {
    let end = start + maxChars
    
    // Adjust end to word boundary if possible
    if (end < text.length) {
      const nextSpace = text.indexOf(' ', end)
      const prevSpace = text.lastIndexOf(' ', end)
      
      // Prefer word boundary that's closer to target
      if (nextSpace !== -1 && (prevSpace === -1 || nextSpace - end < end - prevSpace)) {
        end = nextSpace
      } else if (prevSpace !== -1 && prevSpace > start) {
        end = prevSpace
      }
    } else {
      end = text.length
    }

    const chunkContent = text.slice(start, end).trim()
    if (chunkContent) {
      chunks.push({
        content: chunkContent,
        index: index++,
        startOffset: start,
        endOffset: end,
        tokenCount: estimateTokenCount(chunkContent)
      })
    }

    // Move start position with overlap
    start = Math.max(start + 1, end - overlapChars)
  }

  return chunks
}

// Utility function to validate chunk quality
export function validateChunks(chunks: TextChunk[]): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  chunks.forEach((chunk, index) => {
    // Check token count bounds
    if (chunk.tokenCount > RAG_CONSTANTS.CHUNK_SIZE_MAX + 50) { // Allow some tolerance
      issues.push(`Chunk ${index} too large: ${chunk.tokenCount} tokens`)
    }
    
    if (chunk.tokenCount < 10) { // Minimum meaningful chunk size
      issues.push(`Chunk ${index} too small: ${chunk.tokenCount} tokens`)
    }
    
    // Check content quality
    if (!chunk.content.trim()) {
      issues.push(`Chunk ${index} is empty`)
    }
    
    if (chunk.content.length < 20) {
      issues.push(`Chunk ${index} content too short: ${chunk.content.length} chars`)
    }
  })
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

// Export configuration for easy testing
export const CHUNKING_PRESETS = {
  // Conservative chunking - smaller chunks, more overlap
  conservative: {
    chunkSize: RAG_CONSTANTS.CHUNK_SIZE_MIN,
    overlap: RAG_CONSTANTS.CHUNK_OVERLAP + 25,
    preserveParagraphs: true,
    preserveSentences: true
  },
  
  // Balanced chunking - default settings
  balanced: {
    chunkSize: (RAG_CONSTANTS.CHUNK_SIZE_MIN + RAG_CONSTANTS.CHUNK_SIZE_MAX) / 2,
    overlap: RAG_CONSTANTS.CHUNK_OVERLAP,
    preserveParagraphs: true,
    preserveSentences: true
  },
  
  // Aggressive chunking - larger chunks, less overlap
  aggressive: {
    chunkSize: RAG_CONSTANTS.CHUNK_SIZE_MAX,
    overlap: Math.max(25, RAG_CONSTANTS.CHUNK_OVERLAP - 25),
    preserveParagraphs: false,
    preserveSentences: true
  }
} as const