/**
 * Academic Article-Specific Chunking Module
 * 
 * Implements section-aware chunking for academic papers following the lean metadata approach:
 * - Create special short chunks for title, abstract, and figure/table captions
 * - Create regular chunks for main sections with proper headers and hierarchy
 * - Preserve section structure for precise retrieval
 * - Handle academic paper structure (intro, methods, results, discussion, etc.)
 */

import { DocumentChunk, ArticleChunk, ArticleSectionType, GROBIDResponse, LeanArticleMetadata } from './types';
import { injectMetadataIntoContent } from './metadata-templates';

interface ArticleSections {
  title?: string;
  abstract?: string;
  introduction?: string;
  relatedWork?: string;
  methodology?: string;
  results?: string;
  discussion?: string;
  conclusion?: string;
  references?: string;
  appendix?: string;
  figureCaptions: Array<{number: number, caption: string}>;
  tableCaptions: Array<{number: number, caption: string}>;
}

interface ChunkingConfig {
  targetTokens: number;
  maxTokens: number;
  minTokens: number;
  overlapPercent: number;
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetTokens: 900,
  maxTokens: 1200,
  minTokens: 100,
  overlapPercent: 17.5
};

/**
 * Parse academic paper sections from GROBID structured output or raw text
 */
function parseArticleSections(fullText: string, grobidData?: GROBIDResponse): ArticleSections {
  const sections: ArticleSections = {
    title: grobidData?.title,
    abstract: grobidData?.abstract,
    figureCaptions: [],
    tableCaptions: []
  };

  // Use GROBID sections if available, otherwise parse from full text
  if (grobidData?.sections?.length) {
    // Process GROBID structured sections
    grobidData.sections.forEach(section => {
      const sectionTitle = section.title?.toLowerCase() || '';
      const content = section.content?.trim() || '';
      
      if (!content) return;

      if (sectionTitle.includes('introduction')) {
        sections.introduction = content;
      } else if (sectionTitle.includes('related') || sectionTitle.includes('background') || sectionTitle.includes('prior')) {
        sections.relatedWork = content;
      } else if (sectionTitle.includes('method') || sectionTitle.includes('approach') || sectionTitle.includes('model')) {
        sections.methodology = content;
      } else if (sectionTitle.includes('result') || sectionTitle.includes('experiment') || sectionTitle.includes('evaluation')) {
        sections.results = content;
      } else if (sectionTitle.includes('discussion') || sectionTitle.includes('analysis')) {
        sections.discussion = content;
      } else if (sectionTitle.includes('conclusion') || sectionTitle.includes('summary')) {
        sections.conclusion = content;
      } else if (sectionTitle.includes('reference') || sectionTitle.includes('bibliograph')) {
        sections.references = content;
      } else if (sectionTitle.includes('appendix')) {
        sections.appendix = content;
      }
    });

    // Extract figure captions from GROBID
    if (grobidData.figures?.length) {
      sections.figureCaptions = grobidData.figures
        .map((figure, index) => ({
          number: index + 1,
          caption: figure.caption || ''
        }))
        .filter(fig => fig.caption.length > 10);
    }
  } else {
    // Fallback: parse sections from full text using common academic section headers
    const sectionPatterns = {
      introduction: /(?:INTRODUCTION|Introduction)(.*?)(?=(?:RELATED|BACKGROUND|METHOD|APPROACH|$))/is,
      relatedWork: /(?:RELATED\s+WORK|BACKGROUND|PRIOR\s+ART|Related\s+Work|Background)(.*?)(?=(?:METHOD|APPROACH|INTRODUCTION|$))/is,
      methodology: /(?:METHOD|APPROACH|MODEL|ALGORITHM|Methodology|Methods)(.*?)(?=(?:RESULT|EXPERIMENT|EVALUATION|DISCUSSION|$))/is,
      results: /(?:RESULT|EXPERIMENT|EVALUATION|Results|Experiments)(.*?)(?=(?:DISCUSSION|CONCLUSION|ANALYSIS|$))/is,
      discussion: /(?:DISCUSSION|ANALYSIS|Discussion|Analysis)(.*?)(?=(?:CONCLUSION|SUMMARY|REFERENCES|$))/is,
      conclusion: /(?:CONCLUSION|SUMMARY|Conclusion|Summary)(.*?)(?=(?:REFERENCES|ACKNOWLEDGMENT|$))/is,
      references: /(?:REFERENCES|BIBLIOGRAPHY|References)(.*?)(?=(?:APPENDIX|$))/is
    };

    for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
      const match = fullText.match(pattern);
      if (match) {
        sections[sectionName as keyof ArticleSections] = match[1].trim();
      }
    }

    // Extract figure and table captions using patterns
    const figureMatches = fullText.matchAll(/(?:Figure|Fig\.?)\s*(\d+)[:\.]?\s*([^.\n]+(?:\.[^.\n]*)*)/gi);
    for (const match of figureMatches) {
      sections.figureCaptions.push({
        number: parseInt(match[1]),
        caption: match[2].trim()
      });
    }

    const tableMatches = fullText.matchAll(/(?:Table|Tab\.?)\s*(\d+)[:\.]?\s*([^.\n]+(?:\.[^.\n]*)*)/gi);
    for (const match of tableMatches) {
      sections.tableCaptions.push({
        number: parseInt(match[1]),
        caption: match[2].trim()
      });
    }
  }

  return sections;
}

/**
 * Create special short chunks for high-precision retrieval
 */
function createSpecialChunks(
  documentId: string,
  sections: ArticleSections,
  config: ChunkingConfig,
  grobidData?: GROBIDResponse
): ArticleChunk[] {
  const specialChunks: ArticleChunk[] = [];
  let chunkIndex = 0;

  // Title chunk (10-40 tokens)
  if (sections.title) {
    specialChunks.push({
      id: `${documentId}-title`,
      documentId,
      content: sections.title,
      contentHash: '', // Will be computed later
      tokenCount: countTokens(sections.title),
      chunkIndex: chunkIndex++,
      sectionTitle: 'Title',
      sectionType: 'title',
      overlapStart: 0,
      overlapEnd: 0,
      createdAt: new Date()
    });
  }

  // Abstract chunk (100-250 tokens) with metadata injection
  if (sections.abstract) {
    let enhancedAbstract = sections.abstract;
    
    // Inject metadata if GROBID data is available
    if (grobidData) {
      enhancedAbstract = injectMetadataIntoContent(sections.abstract, {
        title: grobidData.title,
        docType: 'paper',
        doi: grobidData.doi,
        arxivId: grobidData.arxivId,
        authorsAffiliations: grobidData.authors?.map(author => ({
          name: author.fullName || `${author.firstName || ''} ${author.surname || ''}`.trim(),
          affiliation: undefined // GROBID doesn't always provide structured affiliations
        })),
        publicationYear: grobidData.publicationDate ? new Date(grobidData.publicationDate).getFullYear() : undefined
      });
    }
    
    specialChunks.push({
      id: `${documentId}-abstract`,
      documentId,
      content: enhancedAbstract,
      contentHash: '', // Will be computed later
      tokenCount: countTokens(enhancedAbstract),
      chunkIndex: chunkIndex++,
      sectionTitle: 'Abstract',
      sectionType: 'abstract',
      overlapStart: 0,
      overlapEnd: 0,
      createdAt: new Date()
    });
  }

  // Figure caption chunks (50-150 tokens each)
  sections.figureCaptions.forEach(figure => {
    if (figure.caption.length > 20) {
      specialChunks.push({
        id: `${documentId}-figure-${figure.number}`,
        documentId,
        content: `Figure ${figure.number}: ${figure.caption}`,
        contentHash: '', // Will be computed later
        tokenCount: countTokens(figure.caption) + 5, // +5 for "Figure N: "
        chunkIndex: chunkIndex++,
        sectionTitle: `Figure ${figure.number}`,
        sectionType: 'figure_caption',
        figureNumber: figure.number,
        overlapStart: 0,
        overlapEnd: 0,
        createdAt: new Date()
      });
    }
  });

  // Table caption chunks (50-150 tokens each)
  sections.tableCaptions.forEach(table => {
    if (table.caption.length > 20) {
      specialChunks.push({
        id: `${documentId}-table-${table.number}`,
        documentId,
        content: `Table ${table.number}: ${table.caption}`,
        contentHash: '', // Will be computed later
        tokenCount: countTokens(table.caption) + 5, // +5 for "Table N: "
        chunkIndex: chunkIndex++,
        sectionTitle: `Table ${table.number}`,
        sectionType: 'table_caption',
        tableNumber: table.number,
        overlapStart: 0,
        overlapEnd: 0,
        createdAt: new Date()
      });
    }
  });

  return specialChunks;
}

/**
 * Create regular chunks for main content sections
 */
function createContentChunks(
  documentId: string,
  sections: ArticleSections,
  config: ChunkingConfig,
  startingIndex: number
): ArticleChunk[] {
  const chunks: ArticleChunk[] = [];
  let chunkIndex = startingIndex;

  const sectionMappings: Array<{
    content: string;
    sectionType: ArticleSectionType;
    sectionTitle: string;
  }> = [];

  // Map content sections to chunk types
  if (sections.introduction) {
    sectionMappings.push({
      content: sections.introduction,
      sectionType: 'introduction',
      sectionTitle: 'Introduction'
    });
  }

  if (sections.relatedWork) {
    sectionMappings.push({
      content: sections.relatedWork,
      sectionType: 'related_work',
      sectionTitle: 'Related Work'
    });
  }

  if (sections.methodology) {
    sectionMappings.push({
      content: sections.methodology,
      sectionType: 'methodology',
      sectionTitle: 'Methodology'
    });
  }

  if (sections.results) {
    sectionMappings.push({
      content: sections.results,
      sectionType: 'results',
      sectionTitle: 'Results'
    });
  }

  if (sections.discussion) {
    sectionMappings.push({
      content: sections.discussion,
      sectionType: 'discussion',
      sectionTitle: 'Discussion'
    });
  }

  if (sections.conclusion) {
    sectionMappings.push({
      content: sections.conclusion,
      sectionType: 'conclusion',
      sectionTitle: 'Conclusion'
    });
  }

  if (sections.appendix) {
    sectionMappings.push({
      content: sections.appendix,
      sectionType: 'appendix',
      sectionTitle: 'Appendix'
    });
  }

  // Chunk each section with overlap
  sectionMappings.forEach(({ content, sectionType, sectionTitle }) => {
    const sectionChunks = chunkTextWithOverlap(content, config);
    
    sectionChunks.forEach((chunk, index) => {
      chunks.push({
        id: `${documentId}-${sectionType}-${index}`,
        documentId,
        content: chunk.text,
        contentHash: '', // Will be computed later
        tokenCount: chunk.tokenCount,
        chunkIndex: chunkIndex++,
        sectionTitle: index === 0 ? sectionTitle : `${sectionTitle} (continued)`,
        sectionType,
        headingPath: sectionTitle, // Could be enhanced with subsection hierarchy
        overlapStart: chunk.overlapStart,
        overlapEnd: chunk.overlapEnd,
        createdAt: new Date()
      });
    });
  });

  return chunks;
}

/**
 * Create reference chunks (lexical index only, not embedded)
 */
function createReferenceChunks(
  documentId: string,
  sections: ArticleSections,
  config: ChunkingConfig,
  startingIndex: number
): ArticleChunk[] {
  const chunks: ArticleChunk[] = [];
  
  if (!sections.references || sections.references.length < 100) {
    return chunks;
  }

  // Split references into individual entries
  const referenceEntries = sections.references
    .split(/\n\s*(?=\[?\d+\]?\.|\[\d+\])/g)
    .filter(ref => ref.trim().length > 50);

  // Group references into chunks to avoid too many small chunks
  const refsPerChunk = 10;
  for (let i = 0; i < referenceEntries.length; i += refsPerChunk) {
    const referenceBatch = referenceEntries.slice(i, i + refsPerChunk);
    const content = referenceBatch.join('\n\n');
    
    chunks.push({
      id: `${documentId}-references-${Math.floor(i / refsPerChunk)}`,
      documentId,
      content,
      contentHash: '', // Will be computed later
      tokenCount: countTokens(content),
      chunkIndex: startingIndex + Math.floor(i / refsPerChunk),
      sectionTitle: `References (${i + 1}-${Math.min(i + refsPerChunk, referenceEntries.length)})`,
      sectionType: 'references',
      overlapStart: 0,
      overlapEnd: 0,
      createdAt: new Date()
    });
  }

  return chunks;
}

/**
 * Chunk text with overlap for better retrieval
 */
function chunkTextWithOverlap(
  text: string,
  config: ChunkingConfig
): Array<{ text: string; tokenCount: number; overlapStart: number; overlapEnd: number }> {
  const chunks: Array<{ text: string; tokenCount: number; overlapStart: number; overlapEnd: number }> = [];
  
  // Split by paragraphs first, then by sentences if needed
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  let currentChunk = '';
  let currentTokens = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphTokens = countTokens(paragraph);
    
    // If single paragraph is too long, split by sentences
    if (paragraphTokens > config.maxTokens) {
      // Finalize current chunk if it has content
      if (currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          tokenCount: currentTokens,
          overlapStart: 0, // Simplified for now
          overlapEnd: 0
        });
        currentChunk = '';
        currentTokens = 0;
      }
      
      // Split long paragraph by sentences
      const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
      let sentenceChunk = '';
      let sentenceTokens = 0;
      
      for (const sentence of sentences) {
        const sentenceWithPunct = sentence.trim() + '.';
        const sentTokens = countTokens(sentenceWithPunct);
        
        if (sentenceTokens + sentTokens > config.maxTokens && sentenceChunk) {
          chunks.push({
            text: sentenceChunk.trim(),
            tokenCount: sentenceTokens,
            overlapStart: 0,
            overlapEnd: 0
          });
          sentenceChunk = sentenceWithPunct;
          sentenceTokens = sentTokens;
        } else {
          sentenceChunk += (sentenceChunk ? ' ' : '') + sentenceWithPunct;
          sentenceTokens += sentTokens;
        }
      }
      
      // Add final sentence chunk
      if (sentenceChunk) {
        chunks.push({
          text: sentenceChunk.trim(),
          tokenCount: sentenceTokens,
          overlapStart: 0,
          overlapEnd: 0
        });
      }
    } else if (currentTokens + paragraphTokens > config.maxTokens && currentChunk) {
      // Finalize current chunk
      chunks.push({
        text: currentChunk.trim(),
        tokenCount: currentTokens,
        overlapStart: 0,
        overlapEnd: 0
      });
      
      // Start new chunk with overlap
      currentChunk = paragraph;
      currentTokens = paragraphTokens;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += paragraphTokens;
    }
  }
  
  // Add final chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk.trim(),
      tokenCount: currentTokens,
      overlapStart: 0,
      overlapEnd: 0
    });
  }
  
  return chunks;
}

/**
 * Main function to create article-specific chunks
 */
export function createArticleChunks(
  documentId: string,
  fullText: string,
  grobidData?: GROBIDResponse,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): ArticleChunk[] {
  // Parse article sections
  const sections = parseArticleSections(fullText, grobidData);
  
  // Create all chunk types
  const specialChunks = createSpecialChunks(documentId, sections, config, grobidData);
  const contentChunks = createContentChunks(documentId, sections, config, specialChunks.length);
  const referenceChunks = createReferenceChunks(
    documentId, 
    sections, 
    config, 
    specialChunks.length + contentChunks.length
  );
  
  // Combine all chunks
  const allChunks = [...specialChunks, ...contentChunks, ...referenceChunks];
  
  // Generate content hashes
  allChunks.forEach(chunk => {
    chunk.contentHash = generateContentHash(chunk.content);
  });
  
  return allChunks;
}

/**
 * Extract lean article metadata for database storage
 */
export function extractLeanArticleMetadata(
  grobidData: GROBIDResponse,
  sourceUrl: string,
  authority: string = 'GROBID'
): LeanArticleMetadata {
  // Extract authors with affiliations
  const authors = grobidData.authors?.map(author => ({
    name: author.fullName || `${author.firstName || ''} ${author.surname || ''}`.trim(),
    affiliation: undefined // GROBID doesn't always provide affiliations in a structured way
  })) || [];

  // Determine status based on DOI presence and source
  let status = 'Published';
  if (sourceUrl.includes('arxiv.org')) {
    status = 'Preprint';
  } else if (!grobidData.title) {
    status = 'Draft';
  }

  return {
    title: grobidData.title || 'Untitled Article',
    authors,
    venue: 'Unknown', // GROBID doesn't always extract venue reliably
    abstract: grobidData.abstract || '',
    keywords: grobidData.keywords || [],
    sourceUrl,
    authority,
    status
  };
}

/**
 * Simple content hash generation
 */
function generateContentHash(content: string): string {
  // Simple hash function for content deduplication
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Count tokens in text (simplified implementation)
 */
function countTokens(text: string): number {
  // Simplified token counting - roughly 4 characters per token for English
  return Math.ceil(text.length / 4);
}