/**
 * Patent-Specific Chunking Module
 *
 * Implements section-aware chunking for patent documents following the lean metadata approach:
 * - Create special short chunks for title, abstract, and independent claims
 * - Create normal chunks for description sections with proper headers
 * - Group dependent claims by their independent claims
 * - Preserve section structure for precise retrieval
 */

import {
  DocumentChunk,
  PatentChunk,
  PatentSectionType,
  PatentMetadata,
  LeanPatentMetadata,
} from './types';
import { injectMetadataIntoContent } from './metadata-templates';

interface PatentSections {
  title?: string;
  abstract?: string;
  background?: string;
  summary?: string;
  detailedDescription?: string;
  claims: string[];
  independentClaims: number[];
  dependentClaims: Array<{
    claimNumber: number;
    dependsOn: number;
    text: string;
  }>;
}

interface ChunkingConfig {
  targetTokens: number;
  maxTokens: number;
  minTokens: number;
  overlapPercent: number;
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetTokens: 800,
  maxTokens: 1200,
  minTokens: 100,
  overlapPercent: 15,
};

/**
 * Parse patent claims to identify independent vs dependent claims
 */
function parsePatentClaims(claims: string[]): {
  independentClaims: number[];
  dependentClaims: Array<{
    claimNumber: number;
    dependsOn: number;
    text: string;
  }>;
} {
  const independentClaims: number[] = [];
  const dependentClaims: Array<{
    claimNumber: number;
    dependsOn: number;
    text: string;
  }> = [];

  claims.forEach((claim, index) => {
    const claimNumber = index + 1;
    const claimText = claim.trim();

    // Look for dependency patterns: "claim 1", "claims 1-3", "any of claims 1-5", etc.
    const dependencyPattern =
      /(?:claim|claims)\s+(\d+)(?:-(\d+))?|(?:any\s+of\s+claims?\s+)(\d+)(?:-(\d+))?/i;
    const match = claimText.match(dependencyPattern);

    if (match) {
      // This is a dependent claim
      const dependsOn = parseInt(match[1] || match[3]);
      dependentClaims.push({
        claimNumber,
        dependsOn,
        text: claimText,
      });
    } else {
      // This is an independent claim
      independentClaims.push(claimNumber);
    }
  });

  return { independentClaims, dependentClaims };
}

/**
 * Extract and parse patent sections from raw text
 */
function parsePatentSections(
  fullText: string,
  extractedMetadata: PatentMetadata
): PatentSections {
  const sections: PatentSections = {
    title: extractedMetadata.title,
    abstract: extractedMetadata.abstract,
    claims: extractedMetadata.claims || [],
    independentClaims: [],
    dependentClaims: [],
  };

  // Parse claims if available
  if (sections.claims.length > 0) {
    const { independentClaims, dependentClaims } = parsePatentClaims(
      sections.claims
    );
    sections.independentClaims = independentClaims;
    sections.dependentClaims = dependentClaims;
  }

  // Extract major sections from full text using common patent section headers
  const sectionPatterns = {
    background:
      /(?:BACKGROUND|FIELD\s+OF\s+THE\s+INVENTION|RELATED\s+ART)(.*?)(?=(?:SUMMARY|BRIEF\s+DESCRIPTION|DETAILED\s+DESCRIPTION|CLAIMS)|$)/is,
    summary:
      /(?:SUMMARY|BRIEF\s+DESCRIPTION)(.*?)(?=(?:DETAILED\s+DESCRIPTION|CLAIMS)|$)/is,
    detailedDescription:
      /(?:DETAILED\s+DESCRIPTION|DESCRIPTION\s+OF\s+THE\s+INVENTION)(.*?)(?=CLAIMS|$)/is,
  };

  for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
    const match = fullText.match(pattern);
    if (match) {
      sections[sectionName as keyof PatentSections] = match[1].trim();
    }
  }

  return sections;
}

/**
 * Create special short chunks for high-precision retrieval
 */
function createSpecialChunks(
  documentId: string,
  sections: PatentSections,
  config: ChunkingConfig,
  patentMetadata: PatentMetadata
): PatentChunk[] {
  const specialChunks: PatentChunk[] = [];
  let chunkIndex = 0;

  // Title chunk (100-200 tokens)
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
      createdAt: new Date(),
    });
  }

  // Abstract chunk (200-400 tokens) with metadata injection
  if (sections.abstract) {
    const enhancedAbstract = injectMetadataIntoContent(sections.abstract, {
      title: patentMetadata.title,
      docType: 'patent',
      patentNo: patentMetadata.patentNumber,
      inventors: patentMetadata.inventors,
      assignees: patentMetadata.assignee
        ? [patentMetadata.assignee]
        : undefined,
      filedDate: patentMetadata.filedDate?.toISOString().split('T')[0],
      grantedDate: patentMetadata.grantedDate?.toISOString().split('T')[0],
    });

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
      createdAt: new Date(),
    });
  }

  // Independent claim chunks (150-300 tokens each)
  sections.independentClaims.forEach(claimNumber => {
    const claimText = sections.claims[claimNumber - 1];
    if (claimText) {
      specialChunks.push({
        id: `${documentId}-claim-${claimNumber}`,
        documentId,
        content: claimText,
        contentHash: '', // Will be computed later
        tokenCount: countTokens(claimText),
        chunkIndex: chunkIndex++,
        sectionTitle: `Independent Claim ${claimNumber}`,
        sectionType: 'independent_claim',
        claimNumber,
        overlapStart: 0,
        overlapEnd: 0,
        createdAt: new Date(),
      });
    }
  });

  return specialChunks;
}

/**
 * Create regular chunks for description sections
 */
function createDescriptionChunks(
  documentId: string,
  sections: PatentSections,
  config: ChunkingConfig,
  startingIndex: number
): PatentChunk[] {
  const chunks: PatentChunk[] = [];
  let chunkIndex = startingIndex;

  const sectionMappings: Array<{
    content: string;
    sectionType: PatentSectionType;
    sectionTitle: string;
  }> = [];

  if (sections.background) {
    sectionMappings.push({
      content: sections.background,
      sectionType: 'background',
      sectionTitle: 'Background',
    });
  }

  if (sections.summary) {
    sectionMappings.push({
      content: sections.summary,
      sectionType: 'summary',
      sectionTitle: 'Summary',
    });
  }

  if (sections.detailedDescription) {
    sectionMappings.push({
      content: sections.detailedDescription,
      sectionType: 'detailed_description',
      sectionTitle: 'Detailed Description',
    });
  }

  // Chunk each section
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
        sectionTitle:
          index === 0 ? sectionTitle : `${sectionTitle} (continued)`,
        sectionType,
        overlapStart: chunk.overlapStart,
        overlapEnd: chunk.overlapEnd,
        createdAt: new Date(),
      });
    });
  });

  return chunks;
}

/**
 * Create chunks for dependent claims grouped by independent claims
 */
function createDependentClaimChunks(
  documentId: string,
  sections: PatentSections,
  config: ChunkingConfig,
  startingIndex: number
): PatentChunk[] {
  const chunks: PatentChunk[] = [];
  let chunkIndex = startingIndex;

  // Group dependent claims by the independent claim they depend on
  const claimGroups = new Map<
    number,
    Array<{ claimNumber: number; text: string }>
  >();

  sections.dependentClaims.forEach(depClaim => {
    if (!claimGroups.has(depClaim.dependsOn)) {
      claimGroups.set(depClaim.dependsOn, []);
    }
    claimGroups.get(depClaim.dependsOn)!.push({
      claimNumber: depClaim.claimNumber,
      text: depClaim.text,
    });
  });

  // Create chunks for each group
  claimGroups.forEach((claims, independentClaimNumber) => {
    let currentChunk = '';
    let currentTokens = 0;
    let claimsInChunk: number[] = [];

    claims.forEach(claim => {
      const claimTokens = countTokens(claim.text);

      if (currentTokens + claimTokens > config.maxTokens && currentChunk) {
        // Create chunk with current claims
        chunks.push({
          id: `${documentId}-dep-claims-${independentClaimNumber}-${chunkIndex}`,
          documentId,
          content: currentChunk.trim(),
          contentHash: '', // Will be computed later
          tokenCount: currentTokens,
          chunkIndex: chunkIndex++,
          sectionTitle: `Dependent Claims (based on Claim ${independentClaimNumber})`,
          sectionType: 'dependent_claims',
          dependsOnClaim: independentClaimNumber,
          overlapStart: 0,
          overlapEnd: 0,
          createdAt: new Date(),
        });

        currentChunk = '';
        currentTokens = 0;
        claimsInChunk = [];
      }

      currentChunk += (currentChunk ? '\n\n' : '') + claim.text;
      currentTokens += claimTokens;
      claimsInChunk.push(claim.claimNumber);
    });

    // Create final chunk if there's remaining content
    if (currentChunk) {
      chunks.push({
        id: `${documentId}-dep-claims-${independentClaimNumber}-${chunkIndex}`,
        documentId,
        content: currentChunk.trim(),
        contentHash: '', // Will be computed later
        tokenCount: currentTokens,
        chunkIndex: chunkIndex++,
        sectionTitle: `Dependent Claims (based on Claim ${independentClaimNumber})`,
        sectionType: 'dependent_claims',
        dependsOnClaim: independentClaimNumber,
        overlapStart: 0,
        overlapEnd: 0,
        createdAt: new Date(),
      });
    }
  });

  return chunks;
}

/**
 * Chunk text with overlap for better retrieval
 */
function chunkTextWithOverlap(
  text: string,
  config: ChunkingConfig
): Array<{
  text: string;
  tokenCount: number;
  overlapStart: number;
  overlapEnd: number;
}> {
  const chunks: Array<{
    text: string;
    tokenCount: number;
    overlapStart: number;
    overlapEnd: number;
  }> = [];

  // Simple sentence-based chunking for now
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let currentChunk = '';
  let currentTokens = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim() + '.';
    const sentenceTokens = countTokens(sentence);

    if (currentTokens + sentenceTokens > config.maxTokens && currentChunk) {
      // Finalize current chunk
      chunks.push({
        text: currentChunk.trim(),
        tokenCount: currentTokens,
        overlapStart: 0, // Simplified for now
        overlapEnd: 0,
      });

      // Start new chunk with overlap
      const overlapTokens = Math.floor(
        currentTokens * (config.overlapPercent / 100)
      );
      // TODO: Implement proper overlap logic based on token count
      currentChunk = sentence;
      currentTokens = sentenceTokens;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
  }

  // Add final chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk.trim(),
      tokenCount: currentTokens,
      overlapStart: 0,
      overlapEnd: 0,
    });
  }

  return chunks;
}

/**
 * Main function to create patent-specific chunks
 */
export function createPatentChunks(
  documentId: string,
  fullText: string,
  extractedMetadata: PatentMetadata,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): PatentChunk[] {
  // Parse patent sections
  const sections = parsePatentSections(fullText, extractedMetadata);

  // Create all chunk types
  const specialChunks = createSpecialChunks(
    documentId,
    sections,
    config,
    extractedMetadata
  );
  const descriptionChunks = createDescriptionChunks(
    documentId,
    sections,
    config,
    specialChunks.length
  );
  const dependentClaimChunks = createDependentClaimChunks(
    documentId,
    sections,
    config,
    specialChunks.length + descriptionChunks.length
  );

  // Combine all chunks
  const allChunks = [
    ...specialChunks,
    ...descriptionChunks,
    ...dependentClaimChunks,
  ];

  // Generate content hashes
  allChunks.forEach(chunk => {
    chunk.contentHash = generateContentHash(chunk.content);
  });

  return allChunks;
}

/**
 * Determine patent status based on filing and grant dates
 */
function determinePatentStatus(
  grantedDate?: Date,
  filedDate?: Date
): 'filed' | 'active' | 'expired' {
  const now = new Date();

  // If no grant date, it's still filed (application)
  if (!grantedDate) {
    return 'filed';
  }

  // Calculate expiration date (20 years from filing date, or grant date if no filing date)
  const baseDate = filedDate || grantedDate;
  const expirationDate = new Date(
    baseDate.getTime() + 20 * 365 * 24 * 60 * 60 * 1000
  );

  // If past expiration, it's expired
  if (now > expirationDate) {
    return 'expired';
  }

  // If granted and not expired, it's active
  return 'active';
}

/**
 * Extract lean patent metadata for database storage
 */
export function extractLeanPatentMetadata(
  extractedMetadata: PatentMetadata,
  sourceUrl: string,
  authority: string = 'GooglePatents'
): LeanPatentMetadata {
  // Extract jurisdiction from patent number (US12345 -> US, EP12345 -> EP, etc.)
  const jurisdiction =
    extractedMetadata.patentNumber.match(/^([A-Z]{2})/)?.[1] || 'US';

  // Count claims
  const claimCount = extractedMetadata.claims?.length || 0;
  const { independentClaims } = parsePatentClaims(
    extractedMetadata.claims || []
  );
  const independentClaimCount = independentClaims.length;

  return {
    patentNumber: extractedMetadata.patentNumber,
    jurisdiction,
    assignee: extractedMetadata.assignee,
    originalAssignee: extractedMetadata.assignee, // TODO: Implement logic to detect original vs current
    inventors: extractedMetadata.inventors,
    filingDate: extractedMetadata.filedDate,
    grantDate: extractedMetadata.grantedDate,
    priorityDate: extractedMetadata.filedDate, // TODO: Extract actual priority date if available
    expirationDate: extractedMetadata.grantedDate
      ? new Date(
          extractedMetadata.grantedDate.getTime() +
            20 * 365 * 24 * 60 * 60 * 1000
        ) // 20 years from grant
      : undefined,
    expirationIsEstimate: true, // Mark as estimate since we're calculating it
    status: determinePatentStatus(
      extractedMetadata.grantedDate,
      extractedMetadata.filedDate
    ),
    abstract: extractedMetadata.abstract || '',
    sourceUrl,
    authority,
    claimCount,
    independentClaimCount,
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
    hash = (hash << 5) - hash + char;
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
