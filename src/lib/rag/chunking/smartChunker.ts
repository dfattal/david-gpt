/**
 * Smart chunking algorithm for RAG documents
 * Target: 800-1200 tokens per chunk with 15-20% overlap
 * Splits on heading boundaries when possible and tracks section hierarchy
 */

import { encode } from 'gpt-tokenizer';
import { extractSections, buildSectionPath, type MarkdownSection } from '../ingestion/markdownProcessor';
import {
  detectDocumentStructure,
  isCriticalSection,
  getMinTokensForSection,
  type DocumentStructure,
} from './documentStructure';

export interface Chunk {
  text: string;
  sectionPath: string;
  tokenCount: number;
  startLine: number;
  endLine: number;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  type?: string;
  date?: string;
  summary?: string;
  tags?: string[];
  keyTerms?: string;
  alsoKnownAs?: string;
  identifiers?: Record<string, string>; // patent_number, doi, arxiv_id, etc.
  dates?: Record<string, string>; // filing, publication, priority, expiration, etc.
  actors?: Array<{ name: string; role: string }>; // inventors, authors, assignees, etc.
  abstract?: string; // Full abstract text for patents/papers
  claims?: string[]; // Key patent claims
}

export interface ChunkConfig {
  targetMinTokens: number; // 800
  targetMaxTokens: number; // 1200
  overlapPercent: number;  // 0.15-0.20
  model: 'gpt-4' | 'gpt-3.5-turbo'; // Model name (not used with gpt-tokenizer)
}

const DEFAULT_CONFIG: ChunkConfig = {
  targetMinTokens: 800,
  targetMaxTokens: 1200,
  overlapPercent: 0.175, // 17.5% (average of 15-20%)
  model: 'gpt-4',
};

/**
 * Token counter using gpt-tokenizer (pure JS, no WASM)
 */
export class TokenCounter {
  constructor(_model: ChunkConfig['model'] = 'gpt-4') {
    // gpt-tokenizer uses cl100k_base encoding (works for gpt-4 and gpt-3.5-turbo)
    // No initialization needed
  }

  count(text: string): number {
    return encode(text).length;
  }

  cleanup(): void {
    // No cleanup needed for gpt-tokenizer
  }
}

/**
 * Calculate overlap token count
 */
function calculateOverlapTokens(config: ChunkConfig): number {
  return Math.floor(config.targetMaxTokens * config.overlapPercent);
}

/**
 * Extract code blocks from markdown text
 * Returns array of {start, end, language, code}
 */
interface CodeBlock {
  startLine: number;
  endLine: number;
  language: string;
  code: string;
}

function extractCodeBlocks(content: string, baseStartLine: number): CodeBlock[] {
  const lines = content.split('\n');
  const codeBlocks: CodeBlock[] = [];
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockLanguage = '';
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Start of code block
        inCodeBlock = true;
        codeBlockStart = i;
        codeBlockLanguage = line.trim().substring(3).trim();
        codeBlockLines = [];
      } else {
        // End of code block
        codeBlocks.push({
          startLine: baseStartLine + codeBlockStart,
          endLine: baseStartLine + i,
          language: codeBlockLanguage,
          code: codeBlockLines.join('\n'),
        });
        inCodeBlock = false;
        codeBlockStart = -1;
        codeBlockLanguage = '';
        codeBlockLines = [];
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    }
  }

  return codeBlocks;
}

/**
 * Remove code blocks from text, replacing them with placeholders
 * Returns {cleanedText, codeBlocks}
 */
function removeCodeBlocks(content: string): { cleanedText: string; codeBlockIndices: number[] } {
  const lines = content.split('\n');
  const cleanedLines: string[] = [];
  const codeBlockIndices: number[] = [];
  let inCodeBlock = false;
  let codeBlockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Start of code block - add placeholder
        cleanedLines.push(`[CODE_BLOCK_${codeBlockIndex}]`);
        codeBlockIndices.push(codeBlockIndex);
        codeBlockIndex++;
        inCodeBlock = true;
      } else {
        // End of code block
        inCodeBlock = false;
      }
    } else if (!inCodeBlock) {
      cleanedLines.push(line);
    }
    // Skip lines inside code blocks
  }

  return {
    cleanedText: cleanedLines.join('\n'),
    codeBlockIndices,
  };
}

/**
 * Split text into sentences for overlap calculation
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries while preserving the delimiter
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}

/**
 * Extract overlap text from end of previous chunk
 */
function extractOverlap(
  previousText: string,
  overlapTokens: number,
  counter: TokenCounter
): string {
  if (!previousText) return '';

  const sentences = splitIntoSentences(previousText);
  const overlap: string[] = [];
  let tokenCount = 0;

  // Walk backwards through sentences until we hit overlap target
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i];
    const sentenceTokens = counter.count(sentence);

    if (tokenCount + sentenceTokens > overlapTokens && overlap.length > 0) {
      break;
    }

    overlap.unshift(sentence);
    tokenCount += sentenceTokens;
  }

  return overlap.join(' ');
}

/**
 * Create a code reference chunk with minimal context
 */
function createCodeReferenceChunk(
  codeBlock: CodeBlock,
  sectionPath: string,
  context: string,
  counter: TokenCounter
): Chunk {
  // Format: brief context + language label + code
  const codeText = `${context}\n\n\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\``;

  return {
    text: codeText,
    sectionPath: `${sectionPath} [${codeBlock.language || 'code'} reference]`,
    tokenCount: counter.count(codeText),
    startLine: codeBlock.startLine,
    endLine: codeBlock.endLine,
  };
}

/**
 * Chunk a single section respecting token limits and handling code blocks separately
 */
function chunkSection(
  section: MarkdownSection,
  sectionPath: string,
  config: ChunkConfig,
  counter: TokenCounter,
  previousChunkText?: string
): Chunk[] {
  const chunks: Chunk[] = [];

  // Extract code blocks from this section
  const codeBlocks = extractCodeBlocks(section.content, section.startLine + 1);

  // Remove code blocks and chunk the remaining prose
  const { cleanedText, codeBlockIndices } = removeCodeBlocks(section.content);
  const lines = cleanedText.split('\n');
  const overlapTokens = calculateOverlapTokens(config);

  let currentChunk: string[] = [];
  let currentTokenCount = 0;
  let chunkStartLine = section.startLine + 1;

  // Add overlap from previous chunk if this is a continuation
  let overlapText = '';
  if (previousChunkText && !previousChunkText.includes('[CODE_BLOCK_')) {
    // Don't carry over overlap if previous chunk was a code block
    overlapText = extractOverlap(previousChunkText, overlapTokens, counter);
    if (overlapText) {
      currentChunk.push(overlapText);
      currentTokenCount = counter.count(overlapText);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = counter.count(line + '\n');

    // Check if adding this line would exceed max tokens
    if (
      currentTokenCount + lineTokens > config.targetMaxTokens &&
      currentTokenCount >= config.targetMinTokens
    ) {
      // Save current chunk
      const chunkText = currentChunk.join('\n').trim();
      if (chunkText) {
        chunks.push({
          text: chunkText,
          sectionPath,
          tokenCount: currentTokenCount,
          startLine: chunkStartLine,
          endLine: section.startLine + 1 + i - 1,
        });
      }

      // Start new chunk with overlap
      overlapText = extractOverlap(chunkText, overlapTokens, counter);
      currentChunk = overlapText ? [overlapText] : [];
      currentTokenCount = overlapText ? counter.count(overlapText) : 0;
      chunkStartLine = section.startLine + 1 + i;
    }

    // Add line to current chunk
    currentChunk.push(line);
    currentTokenCount += lineTokens;
  }

  // Save final chunk if it has content
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join('\n').trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        sectionPath,
        tokenCount: currentTokenCount,
        startLine: chunkStartLine,
        endLine: section.startLine + lines.length,
      });
    }
  }

  // Create separate code reference chunks
  // Extract context from the section (first few sentences or heading)
  const contextLines = section.content.split('\n').slice(0, 3);
  const context = contextLines.join('\n').substring(0, 200).trim() + '...';

  for (const codeBlock of codeBlocks) {
    chunks.push(createCodeReferenceChunk(codeBlock, sectionPath, context, counter));
  }

  return chunks;
}

/**
 * Generate a metadata chunk from document metadata
 * This chunk helps with document identification and keyword matching
 * NOTE: Summary, abstract, and claims are in the separate Summary chunk
 */
function generateMetadataChunk(
  metadata: DocumentMetadata,
  counter: TokenCounter
): Chunk {
  const parts: string[] = ['**Document Metadata**\n'];

  // Add document identifiers
  parts.push(`- **ID**: ${metadata.id}`);
  parts.push(`- **Title**: ${metadata.title}`);

  if (metadata.type) {
    parts.push(`- **Type**: ${metadata.type}`);
  }

  if (metadata.date) {
    parts.push(`- **Date**: ${metadata.date}`);
  }

  // Add structured identifiers (patent numbers, DOIs, etc.)
  if (metadata.identifiers && Object.keys(metadata.identifiers).length > 0) {
    const identifiersList = Object.entries(metadata.identifiers)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    parts.push(`- **Identifiers**: ${identifiersList}`);
  }

  // Add structured dates
  if (metadata.dates && Object.keys(metadata.dates).length > 0) {
    const datesList = Object.entries(metadata.dates)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    parts.push(`- **Dates**: ${datesList}`);
  }

  // Add actors (inventors, authors, etc.)
  if (metadata.actors && metadata.actors.length > 0) {
    const actorsList = metadata.actors
      .map((actor) => `${actor.name} (${actor.role})`)
      .join(', ');
    parts.push(`- **Actors**: ${actorsList}`);
  }

  // Add searchable aliases
  if (metadata.alsoKnownAs) {
    parts.push(`- **Also Known As**: ${metadata.alsoKnownAs}`);
  }

  // Add key terms for keyword matching
  if (metadata.keyTerms) {
    parts.push(`- **Key Terms**: ${metadata.keyTerms}`);
  }

  // Add tags if available
  if (metadata.tags && metadata.tags.length > 0) {
    parts.push(`- **Tags**: ${metadata.tags.join(', ')}`);
  }

  const text = parts.join('\n');

  return {
    text,
    sectionPath: 'Metadata',
    tokenCount: counter.count(text),
    startLine: 0,
    endLine: 0,
  };
}

/**
 * Generate a summary chunk from document metadata
 * This chunk contains the high-level overview: summary, abstract, and key claims
 * Positioned as Chunk #2 (right after metadata) for optimal retrieval
 */
function generateSummaryChunk(
  metadata: DocumentMetadata,
  counter: TokenCounter
): Chunk | null {
  const parts: string[] = ['**Document Summary**\n'];
  let hasContent = false;

  // Add one-line summary if available
  if (metadata.summary) {
    parts.push(`**TL;DR**: ${metadata.summary}\n`);
    hasContent = true;
  }

  // Add full abstract for patents/papers (improves semantic search)
  if (metadata.abstract) {
    parts.push(`**Abstract**\n${metadata.abstract}\n`);
    hasContent = true;
  }

  // Add key claims for patents (critical for understanding novelty)
  if (metadata.claims && metadata.claims.length > 0) {
    parts.push(`**Key Claims**`);
    metadata.claims.forEach((claim, idx) => {
      parts.push(`${idx + 1}. ${claim}`);
    });
    hasContent = true;
  }

  // Only create summary chunk if we have content
  if (!hasContent) {
    return null;
  }

  const text = parts.join('\n');

  return {
    text,
    sectionPath: 'Summary',
    tokenCount: counter.count(text),
    startLine: 0,
    endLine: 0,
  };
}

/**
 * Merge small adjacent sections to reach minimum token count
 * This prevents creating too many tiny chunks from documents with many short sections
 * Now structure-aware: respects critical sections from document structure
 */
function mergeSections(
  sections: MarkdownSection[],
  minTokens: number,
  counter: TokenCounter,
  structure?: DocumentStructure
): MarkdownSection[] {
  if (sections.length === 0) return [];

  const merged: MarkdownSection[] = [];
  let currentMerge: MarkdownSection | null = null;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionTokens = counter.count(section.content);

    // Check if this section is critical (should not be merged)
    const { isCritical: sectionIsCritical } = structure
      ? isCriticalSection(section.title, structure)
      : { isCritical: false };

    // Get structure-aware minimum tokens for this section
    const effectiveMinTokens = structure
      ? getMinTokensForSection(section.title, structure, minTokens)
      : minTokens;

    if (!currentMerge) {
      // Start a new merge group
      currentMerge = { ...section };
    } else if (
      !sectionIsCritical && // Never merge critical sections
      counter.count(currentMerge.content) + sectionTokens < effectiveMinTokens &&
      section.level >= currentMerge.level  // Only merge if new section is same level or child (higher level number)
    ) {
      // Merge this section into the current group if both are small
      currentMerge.content += '\n\n' + section.content;
      currentMerge.endLine = section.endLine;
      // Keep the highest level heading (smaller level number)
      if (section.level < currentMerge.level) {
        currentMerge.title = section.title;
        currentMerge.level = section.level;
      }
    } else {
      // Current merge is large enough or new section is higher in hierarchy or is critical, save it and start new merge
      merged.push(currentMerge);
      currentMerge = { ...section };
    }
  }

  // Don't forget the last merge group
  if (currentMerge) {
    merged.push(currentMerge);
  }

  return merged;
}

/**
 * Main chunking function - processes entire document
 */
export function chunkDocument(
  content: string,
  config: Partial<ChunkConfig> = {},
  metadata?: DocumentMetadata
): Chunk[] {
  const finalConfig: ChunkConfig = { ...DEFAULT_CONFIG, ...config };
  const counter = new TokenCounter(finalConfig.model);
  const sections = extractSections(content);
  const allChunks: Chunk[] = [];

  // Detect document structure (patent, paper, generic, etc.)
  const docType = metadata?.type || 'generic';
  const structure = detectDocumentStructure(docType, sections);

  // Enhance metadata with detected structure information
  if (metadata && structure) {
    // Add abstract if detected (for better semantic search in metadata chunk)
    if (structure.abstract && !metadata.abstract) {
      metadata.abstract = structure.abstract;
    }
    // Add claims if detected (for patents)
    if (structure.claims && !metadata.claims) {
      metadata.claims = structure.claims;
    }
  }

  // Generate metadata chunk if metadata provided (Chunk #1)
  if (metadata) {
    const metadataChunk = generateMetadataChunk(metadata, counter);
    allChunks.push(metadataChunk);

    // Generate summary chunk if we have summary/abstract/claims (Chunk #2)
    const summaryChunk = generateSummaryChunk(metadata, counter);
    if (summaryChunk) {
      allChunks.push(summaryChunk);
    }
  }

  // Merge small adjacent sections to avoid creating too many tiny chunks
  // Now structure-aware: preserves critical sections (Abstract, Claims, Methods, etc.)
  const mergedSections = mergeSections(sections, finalConfig.targetMinTokens, counter, structure);

  let previousChunkText: string | undefined;

  mergedSections.forEach((section, index) => {
    const sectionPath = buildSectionPath(mergedSections, index);
    const sectionChunks = chunkSection(
      section,
      sectionPath,
      finalConfig,
      counter,
      previousChunkText
    );

    if (sectionChunks.length > 0) {
      allChunks.push(...sectionChunks);
      // Track last chunk for overlap with next section
      previousChunkText = sectionChunks[sectionChunks.length - 1].text;
    }
  });

  counter.cleanup();
  return allChunks;
}

/**
 * Validate chunk quality
 */
export function validateChunks(chunks: Chunk[]): {
  valid: boolean;
  warnings: string[];
  stats: {
    totalChunks: number;
    avgTokens: number;
    minTokens: number;
    maxTokens: number;
  };
} {
  const warnings: string[] = [];

  if (chunks.length === 0) {
    return {
      valid: false,
      warnings: ['No chunks generated'],
      stats: { totalChunks: 0, avgTokens: 0, minTokens: 0, maxTokens: 0 },
    };
  }

  const tokenCounts = chunks.map((c) => c.tokenCount);
  const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
  const avgTokens = totalTokens / chunks.length;
  const minTokens = Math.min(...tokenCounts);
  const maxTokens = Math.max(...tokenCounts);

  // Check for chunks that are too small
  const tooSmall = chunks.filter((c) => c.tokenCount < 100);
  if (tooSmall.length > 0) {
    warnings.push(`${tooSmall.length} chunks have fewer than 100 tokens`);
  }

  // Check for chunks that are too large
  const tooLarge = chunks.filter((c) => c.tokenCount > 1500);
  if (tooLarge.length > 0) {
    warnings.push(`${tooLarge.length} chunks exceed 1500 tokens`);
  }

  // Check for empty section paths
  const noPath = chunks.filter((c) => !c.sectionPath);
  if (noPath.length > 0) {
    warnings.push(`${noPath.length} chunks missing section path`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    stats: {
      totalChunks: chunks.length,
      avgTokens: Math.round(avgTokens),
      minTokens,
      maxTokens,
    },
  };
}

/**
 * Get chunking statistics for a document
 */
export function getChunkStats(chunks: Chunk[]): string {
  const validation = validateChunks(chunks);
  const { stats, warnings } = validation;

  let report = `Chunking Statistics:\n`;
  report += `  Total chunks: ${stats.totalChunks}\n`;
  report += `  Average tokens: ${stats.avgTokens}\n`;
  report += `  Min tokens: ${stats.minTokens}\n`;
  report += `  Max tokens: ${stats.maxTokens}\n`;

  if (warnings.length > 0) {
    report += `\nWarnings:\n`;
    warnings.forEach((w) => (report += `  - ${w}\n`));
  }

  return report;
}