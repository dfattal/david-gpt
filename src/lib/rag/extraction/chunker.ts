/**
 * Chunk normalized text into ~2-3k character segments with page anchors
 */

import { NormalizedPage, TextBlock } from './textNormalizer';

export interface ContentChunk {
  content: string;
  pageRange: {
    start: number;
    end: number;
  };
  charCount: number;
  tokenEstimate: number;
}

const MIN_CHUNK_SIZE = 1800;
const MAX_CHUNK_SIZE = 3000;
const TARGET_CHUNK_SIZE = 2400;

/**
 * Chunk normalized pages into manageable segments
 */
export function chunkPages(pages: NormalizedPage[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let currentChunk: string[] = [];
  let currentCharCount = 0;
  let chunkStartPage = pages[0]?.pageNumber || 1;
  let currentPage = chunkStartPage;

  for (const page of pages) {
    currentPage = page.pageNumber;
    const pageContent = `\n\n[Page ${page.pageNumber}]\n\n${page.normalizedText}`;
    const pageCharCount = pageContent.length;

    // If adding this page would exceed max chunk size and current chunk is not empty
    if (currentCharCount + pageCharCount > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(createChunk(currentChunk, chunkStartPage, currentPage - 1));

      // Start new chunk with current page
      currentChunk = [pageContent];
      currentCharCount = pageCharCount;
      chunkStartPage = page.pageNumber;
    } else {
      // Add to current chunk
      currentChunk.push(pageContent);
      currentCharCount += pageCharCount;
    }

    // If current chunk is large enough and we're at a page boundary
    if (currentCharCount >= MIN_CHUNK_SIZE) {
      chunks.push(createChunk(currentChunk, chunkStartPage, currentPage));
      currentChunk = [];
      currentCharCount = 0;
      chunkStartPage = currentPage + 1;
    }
  }

  // Add remaining content
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunkStartPage, currentPage));
  }

  return chunks;
}

/**
 * Create a chunk object
 */
function createChunk(
  content: string[],
  startPage: number,
  endPage: number
): ContentChunk {
  const text = content.join('');

  return {
    content: text,
    pageRange: {
      start: startPage,
      end: endPage,
    },
    charCount: text.length,
    tokenEstimate: estimateTokens(text),
  };
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk by blocks instead of pages (alternative strategy)
 * Useful for documents with clear structural divisions
 */
export function chunkByBlocks(pages: NormalizedPage[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let currentChunk: string[] = [];
  let currentCharCount = 0;
  let chunkStartPage = pages[0]?.pageNumber || 1;
  let chunkEndPage = chunkStartPage;

  for (const page of pages) {
    for (const block of page.blocks) {
      const blockContent = block.content;
      const blockCharCount = blockContent.length;

      // If adding this block would exceed max chunk size
      if (currentCharCount + blockCharCount > MAX_CHUNK_SIZE && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(createChunk(currentChunk, chunkStartPage, chunkEndPage));

        // Start new chunk
        currentChunk = [blockContent];
        currentCharCount = blockCharCount;
        chunkStartPage = page.pageNumber;
        chunkEndPage = page.pageNumber;
      } else {
        // Add to current chunk
        currentChunk.push(blockContent);
        currentCharCount += blockCharCount;
        chunkEndPage = page.pageNumber;
      }

      // If current chunk is large enough
      if (currentCharCount >= MIN_CHUNK_SIZE) {
        chunks.push(createChunk(currentChunk, chunkStartPage, chunkEndPage));
        currentChunk = [];
        currentCharCount = 0;
        chunkStartPage = page.pageNumber;
      }
    }
  }

  // Add remaining content
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunkStartPage, chunkEndPage));
  }

  return chunks;
}

/**
 * Smart chunking: tries to break at natural boundaries (headings, paragraphs)
 */
export function smartChunk(pages: NormalizedPage[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let currentChunk: string[] = [];
  let currentCharCount = 0;
  let chunkStartPage = pages[0]?.pageNumber || 1;
  let chunkEndPage = chunkStartPage;

  for (const page of pages) {
    for (const block of page.blocks) {
      const blockContent = block.content;
      const blockCharCount = blockContent.length;

      // Check if we should start a new chunk
      const shouldSplit =
        currentCharCount + blockCharCount > MAX_CHUNK_SIZE ||
        (currentCharCount >= TARGET_CHUNK_SIZE && block.type === 'heading');

      if (shouldSplit && currentChunk.length > 0) {
        chunks.push(createChunk(currentChunk, chunkStartPage, chunkEndPage));
        currentChunk = [];
        currentCharCount = 0;
        chunkStartPage = page.pageNumber;
      }

      currentChunk.push(blockContent);
      currentCharCount += blockCharCount;
      chunkEndPage = page.pageNumber;
    }
  }

  // Add remaining content
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunkStartPage, chunkEndPage));
  }

  return chunks;
}
