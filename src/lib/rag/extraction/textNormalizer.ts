/**
 * Heuristics-based text normalization
 * Joins hyphenated lines, rebuilds paragraphs, detects lists, fences table-ish blocks
 */

import { ExtractedPage } from './pdfExtractor';

export interface NormalizedPage {
  pageNumber: number;
  normalizedText: string;
  blocks: TextBlock[];
}

export type BlockType = 'paragraph' | 'list' | 'table' | 'heading' | 'code';

export interface TextBlock {
  type: BlockType;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Normalize extracted PDF text with heuristics
 */
export function normalizeText(pages: ExtractedPage[]): NormalizedPage[] {
  return pages.map(page => {
    // Step 1: Join hyphenated words at line breaks
    let text = joinHyphenatedWords(page.text);

    // Step 2: Rebuild paragraphs
    text = rebuildParagraphs(text);

    // Step 3: Detect and preserve structure
    const blocks = detectBlocks(text);

    return {
      pageNumber: page.pageNumber,
      normalizedText: text,
      blocks,
    };
  });
}

/**
 * Join hyphenated words split across lines
 * Example: "autostereo-\nscopic" → "autostereoscopic"
 */
function joinHyphenatedWords(text: string): string {
  // Match hyphen at end of line followed by newline and word
  return text.replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2');
}

/**
 * Rebuild paragraphs by joining lines that should be together
 */
function rebuildParagraphs(text: string): string {
  const lines = text.split('\n');
  const rebuilt: string[] = [];
  let currentParagraph: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

    if (line === '') {
      // Empty line - end current paragraph
      if (currentParagraph.length > 0) {
        rebuilt.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      rebuilt.push(''); // Preserve empty line
    } else if (
      // Line ends with sentence-ending punctuation
      /[.!?]$/.test(line) ||
      // Next line starts with capital or number (likely new sentence/list)
      /^[A-Z0-9]/.test(nextLine) ||
      // Current line is very short (likely heading or list item)
      line.length < 50
    ) {
      currentParagraph.push(line);
      rebuilt.push(currentParagraph.join(' '));
      currentParagraph = [];
    } else {
      // Continue current paragraph
      currentParagraph.push(line);
    }
  }

  if (currentParagraph.length > 0) {
    rebuilt.push(currentParagraph.join(' '));
  }

  return rebuilt.join('\n');
}

/**
 * Detect structural blocks (headings, lists, tables, code)
 */
function detectBlocks(text: string): TextBlock[] {
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  let currentBlock: TextBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      // Empty line - close current block
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    const blockType = detectLineType(trimmed);

    if (currentBlock && currentBlock.type === blockType) {
      // Continue current block
      currentBlock.content += '\n' + line;
      currentBlock.endLine = i;
    } else {
      // Start new block
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        type: blockType,
        content: line,
        startLine: i,
        endLine: i,
      };
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Detect the type of a single line
 */
function detectLineType(line: string): BlockType {
  // Heading patterns
  if (
    /^[A-Z][A-Z\s]{3,}$/.test(line) || // ALL CAPS SHORT LINE
    /^\d+\.\s+[A-Z]/.test(line) ||      // "1. Introduction"
    /^[IVXLCDM]+\.\s+[A-Z]/.test(line)  // "I. Background"
  ) {
    return 'heading';
  }

  // List patterns
  if (
    /^[-•*]\s+/.test(line) ||           // Bullet points
    /^\d+[\.)]\s+/.test(line) ||        // Numbered lists
    /^[a-z][\.)]\s+/.test(line)         // Lettered lists
  ) {
    return 'list';
  }

  // Table-ish patterns (multiple spaces/tabs, aligned text)
  if (
    /\s{3,}/.test(line) ||              // Multiple consecutive spaces
    /\t/.test(line) ||                  // Contains tabs
    /\|/.test(line)                     // Contains pipes
  ) {
    return 'table';
  }

  // Code patterns
  if (
    /^(function|class|def|const|let|var|if|for|while)\s/.test(line) ||
    /[{}();]/.test(line) && /\s{2,}/.test(line) // Code-like indentation and syntax
  ) {
    return 'code';
  }

  // Default: paragraph
  return 'paragraph';
}

/**
 * Merge consecutive paragraph blocks for cleaner output
 */
export function mergeConsecutiveParagraphs(blocks: TextBlock[]): TextBlock[] {
  const merged: TextBlock[] = [];
  let currentParagraph: TextBlock | null = null;

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      if (currentParagraph) {
        currentParagraph.content += '\n\n' + block.content;
        currentParagraph.endLine = block.endLine;
      } else {
        currentParagraph = { ...block };
      }
    } else {
      if (currentParagraph) {
        merged.push(currentParagraph);
        currentParagraph = null;
      }
      merged.push(block);
    }
  }

  if (currentParagraph) {
    merged.push(currentParagraph);
  }

  return merged;
}
