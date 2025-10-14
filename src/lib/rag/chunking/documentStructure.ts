/**
 * Document Structure Detection and Analysis
 * Identifies document type and critical sections for structure-aware chunking
 */

import { MarkdownSection } from '../ingestion/markdownProcessor';

export interface DocumentStructure {
  type: 'patent' | 'paper' | 'arxiv' | 'technical_memo' | 'generic';
  criticalSections: CriticalSection[];
  abstract?: string;
  claims?: string[];
  keyFindings?: string[];
}

export interface CriticalSection {
  name: string;
  pattern: RegExp;
  importance: 'critical' | 'high' | 'medium';
  minChunkTokens?: number; // Override minimum for this section
}

/**
 * Patent document structure patterns
 */
const PATENT_STRUCTURE: CriticalSection[] = [
  {
    name: 'Abstract',
    pattern: /^#{1,3}\s*Abstract\s*$/i,
    importance: 'critical',
    minChunkTokens: 100, // Don't merge abstract even if small
  },
  {
    name: 'Claims',
    pattern: /^#{1,3}\s*(Claims?|What is claimed)\s*$/i,
    importance: 'critical',
    minChunkTokens: 200,
  },
  {
    name: 'Summary of Invention',
    pattern: /^#{1,3}\s*Summary\s*(of\s*(the\s*)?Invention)?\s*$/i,
    importance: 'critical',
    minChunkTokens: 150,
  },
  {
    name: 'Technical Field',
    pattern: /^#{1,3}\s*Technical\s*Field\s*$/i,
    importance: 'high',
  },
  {
    name: 'Background',
    pattern: /^#{1,3}\s*Background(\s*of\s*(the\s*)?Invention)?\s*$/i,
    importance: 'high',
  },
  {
    name: 'Brief Description',
    pattern: /^#{1,3}\s*Brief\s*Description\s*(of\s*(the\s*)?Drawings)?\s*$/i,
    importance: 'medium',
  },
  {
    name: 'Detailed Description',
    pattern: /^#{1,3}\s*Detailed\s*Description\s*$/i,
    importance: 'medium',
  },
];

/**
 * Academic paper structure patterns
 */
const PAPER_STRUCTURE: CriticalSection[] = [
  {
    name: 'Abstract',
    pattern: /^#{1,3}\s*Abstract\s*$/i,
    importance: 'critical',
    minChunkTokens: 100,
  },
  {
    name: 'Introduction',
    pattern: /^#{1,3}\s*Introduction\s*$/i,
    importance: 'high',
  },
  {
    name: 'Methods',
    pattern: /^#{1,3}\s*(Methods?|Methodology|Materials\s*and\s*Methods)\s*$/i,
    importance: 'critical',
    minChunkTokens: 200,
  },
  {
    name: 'Results',
    pattern: /^#{1,3}\s*Results\s*$/i,
    importance: 'critical',
    minChunkTokens: 200,
  },
  {
    name: 'Discussion',
    pattern: /^#{1,3}\s*Discussion\s*$/i,
    importance: 'high',
  },
  {
    name: 'Conclusion',
    pattern: /^#{1,3}\s*Conclusions?\s*$/i,
    importance: 'critical',
    minChunkTokens: 150,
  },
  {
    name: 'References',
    pattern: /^#{1,3}\s*References\s*$/i,
    importance: 'medium',
  },
];

/**
 * ArXiv paper structure (similar to academic but with some variations)
 */
const ARXIV_STRUCTURE: CriticalSection[] = [
  ...PAPER_STRUCTURE,
  {
    name: 'Related Work',
    pattern: /^#{1,3}\s*Related\s*Work\s*$/i,
    importance: 'high',
  },
  {
    name: 'Experiments',
    pattern: /^#{1,3}\s*Experiments?\s*$/i,
    importance: 'critical',
    minChunkTokens: 200,
  },
];

/**
 * Detect document structure based on type and content
 */
export function detectDocumentStructure(
  docType: string,
  sections: MarkdownSection[]
): DocumentStructure {
  let structure: DocumentStructure = {
    type: 'generic',
    criticalSections: [],
  };

  // Determine document type and load appropriate structure
  if (docType === 'patent') {
    structure.type = 'patent';
    structure.criticalSections = PATENT_STRUCTURE;
  } else if (docType === 'arxiv') {
    structure.type = 'arxiv';
    structure.criticalSections = ARXIV_STRUCTURE;
  } else if (
    docType === 'paper' ||
    docType === 'article' ||
    hasAcademicStructure(sections)
  ) {
    structure.type = 'paper';
    structure.criticalSections = PAPER_STRUCTURE;
  } else if (docType === 'technical_memo' || docType === 'tech_memo') {
    structure.type = 'technical_memo';
    structure.criticalSections = [];
  }

  // Extract abstract if present
  structure.abstract = extractAbstract(sections);

  // Extract claims for patents
  if (structure.type === 'patent') {
    structure.claims = extractClaims(sections);
  }

  return structure;
}

/**
 * Check if document has academic paper structure
 */
function hasAcademicStructure(sections: MarkdownSection[]): boolean {
  const sectionTitles = sections.map((s) => s.title.toLowerCase());

  // Check for common academic paper sections
  const hasAbstract = sectionTitles.some((t) => t.includes('abstract'));
  const hasMethodology = sectionTitles.some(
    (t) => t.includes('method') || t.includes('methodology')
  );
  const hasResults = sectionTitles.some((t) => t.includes('result'));
  const hasConclusion = sectionTitles.some((t) => t.includes('conclusion'));

  // If has 2+ academic sections, likely a paper
  const academicSectionCount =
    [hasAbstract, hasMethodology, hasResults, hasConclusion].filter(Boolean).length;

  return academicSectionCount >= 2;
}

/**
 * Extract abstract section content
 */
function extractAbstract(sections: MarkdownSection[]): string | undefined {
  const abstractSection = sections.find((s) =>
    /^abstract$/i.test(s.title.trim())
  );

  if (abstractSection) {
    // Return first 500 chars or full content if shorter
    return abstractSection.content.substring(0, 500).trim();
  }

  return undefined;
}

/**
 * Extract claims from patent
 */
function extractClaims(sections: MarkdownSection[]): string[] | undefined {
  const claimsSection = sections.find((s) =>
    /^claims?$/i.test(s.title.trim())
  );

  if (!claimsSection) return undefined;

  // Extract individual claims (numbered list items)
  const claimMatches = claimsSection.content.match(/^\d+\.\s+(.+?)(?=^\d+\.|$)/gms);

  if (claimMatches) {
    // Return first 3 claims (independent claims are usually first)
    return claimMatches.slice(0, 3).map((claim) => claim.trim());
  }

  return undefined;
}

/**
 * Check if a section is critical and should not be merged
 */
export function isCriticalSection(
  sectionTitle: string,
  structure: DocumentStructure
): { isCritical: boolean; minTokens?: number } {
  for (const criticalSection of structure.criticalSections) {
    if (criticalSection.pattern.test(sectionTitle)) {
      return {
        isCritical: criticalSection.importance === 'critical',
        minTokens: criticalSection.minChunkTokens,
      };
    }
  }

  return { isCritical: false };
}

/**
 * Get minimum token count for a section based on its importance
 */
export function getMinTokensForSection(
  sectionTitle: string,
  structure: DocumentStructure,
  defaultMinTokens: number
): number {
  const sectionInfo = isCriticalSection(sectionTitle, structure);

  if (sectionInfo.minTokens !== undefined) {
    return sectionInfo.minTokens;
  }

  return defaultMinTokens;
}
