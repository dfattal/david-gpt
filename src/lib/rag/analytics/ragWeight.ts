/**
 * RAG Weight Calculator
 *
 * Calculates a 0.0-1.0 score indicating how much of an LLM response
 * came from RAG context vs. pre-trained knowledge.
 *
 * Uses multi-signal approach optimized for high-quality synthesis:
 * - Citation presence (60% weight): Boolean - are there ANY citations?
 * - Factual density (25% weight): % of factual/specific sentences that are cited
 * - Token overlap (10% weight): N-gram overlap between response and RAG context
 * - Search quality (5% weight): Average search score of retrieved chunks
 *
 * Key insight: A response with even 1-2 citations that cover all factual claims
 * should score high, even if it includes synthesis/explanation sentences.
 */

import { CitationMetadata } from '../citations/saveCitations';
import { SearchResult } from '../search';

export interface RagWeightBreakdown {
  citation_presence: number;     // 0.0-1.0 (binary: has citations?)
  factual_density: number;       // 0.0-1.0 (% of factual sentences cited)
  token_overlap: number;         // 0.0-1.0
  search_quality: number;        // 0.0-1.0
}

export interface RagWeightResult {
  rag_weight: number;            // 0.0-1.0 composite score
  breakdown: RagWeightBreakdown;
  metadata: {
    total_sentences: number;
    factual_sentences: number;
    cited_factual_sentences: number;
    has_citations: boolean;
    avg_search_score: number;
    token_overlap_percentage: number;
  };
}

/**
 * Extract citations from response text
 * Matches pattern: [^doc_X:section]
 */
function extractCitations(text: string): string[] {
  const citationPattern = /\[\^(doc_\d+:[^\]]+)\]/g;
  const matches = text.matchAll(citationPattern);
  return Array.from(matches).map(match => match[1]);
}

/**
 * Split text into sentences (simple heuristic)
 */
function splitIntoSentences(text: string): string[] {
  // Split on ., !, ? followed by space or newline
  return text
    .split(/[.!?]+(?:\s+|\n|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Calculate citation presence: Binary signal for whether citations exist
 * If ANY citations exist, return 1.0. This rewards RAG-based responses.
 */
function calculateCitationPresence(responseText: string): number {
  const hasCitations = /\[\^doc_\d+:[^\]]+\]/.test(responseText);
  return hasCitations ? 1.0 : 0.0;
}

/**
 * Heuristic to identify "factual" sentences that should have citations
 * Factual sentences typically:
 * - Contain numbers, dates, specific names
 * - Use declarative statements
 * - Don't start with hedging words (might, maybe, generally)
 */
function isFactualSentence(sentence: string): boolean {
  const lowerSentence = sentence.toLowerCase().trim();

  // Skip if it's a question or starts with hedging/introductory phrases
  if (
    lowerSentence.startsWith('let me ') ||
    lowerSentence.startsWith('i ') ||
    lowerSentence.startsWith('to ') ||
    lowerSentence.startsWith('for example') ||
    lowerSentence.startsWith('generally') ||
    lowerSentence.startsWith('typically') ||
    lowerSentence.includes('?')
  ) {
    return false;
  }

  // Consider it factual if it contains:
  // - Numbers
  // - Specific technical terms (capitalized words, acronyms)
  // - Dates or time references
  const hasNumbers = /\d+/.test(sentence);
  const hasProperNouns = /[A-Z][a-z]+/.test(sentence);
  const hasTechnicalTerms = /[A-Z]{2,}/.test(sentence); // Acronyms like RAG, PDF, etc.
  const hasDateReferences = /(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|today|yesterday)/i.test(sentence);

  return hasNumbers || hasProperNouns || hasTechnicalTerms || hasDateReferences;
}

/**
 * Calculate factual density: % of factual sentences that have citations
 * This is more sophisticated than raw citation density - it only penalizes
 * missing citations on sentences that should have them.
 */
function calculateFactualDensity(responseText: string): {
  density: number;
  totalSentences: number;
  factualSentences: number;
  citedFactualSentences: number;
} {
  const sentences = splitIntoSentences(responseText);

  if (sentences.length === 0) {
    return { density: 0, totalSentences: 0, factualSentences: 0, citedFactualSentences: 0 };
  }

  const factualSentences = sentences.filter(isFactualSentence);
  const citedFactualSentences = factualSentences.filter(sentence =>
    /\[\^doc_\d+:[^\]]+\]/.test(sentence)
  );

  // If no factual sentences, but there are citations, give high score
  // (response is likely all synthesis with appropriate citations)
  if (factualSentences.length === 0) {
    const hasCitations = /\[\^doc_\d+:[^\]]+\]/.test(responseText);
    return {
      density: hasCitations ? 1.0 : 0.0,
      totalSentences: sentences.length,
      factualSentences: 0,
      citedFactualSentences: 0,
    };
  }

  return {
    density: citedFactualSentences.length / factualSentences.length,
    totalSentences: sentences.length,
    factualSentences: factualSentences.length,
    citedFactualSentences: citedFactualSentences.length,
  };
}


/**
 * Tokenize text into words (simple whitespace-based)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Generate n-grams from token array
 */
function generateNGrams(tokens: string[], n: number): Set<string> {
  const ngrams = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Calculate token overlap using trigram similarity
 */
function calculateTokenOverlap(
  responseText: string,
  ragContext: string
): {
  overlap: number;
  overlapPercentage: number;
} {
  if (!ragContext || ragContext.trim().length === 0) {
    return { overlap: 0, overlapPercentage: 0 };
  }

  // Tokenize both texts
  const responseTokens = tokenize(responseText);
  const contextTokens = tokenize(ragContext);

  if (responseTokens.length === 0) {
    return { overlap: 0, overlapPercentage: 0 };
  }

  // Generate trigrams (3-word sequences)
  const responseNGrams = generateNGrams(responseTokens, 3);
  const contextNGrams = generateNGrams(contextTokens, 3);

  if (responseNGrams.size === 0) {
    return { overlap: 0, overlapPercentage: 0 };
  }

  // Calculate overlap
  let matchingNGrams = 0;
  for (const ngram of responseNGrams) {
    if (contextNGrams.has(ngram)) {
      matchingNGrams++;
    }
  }

  const overlapPercentage = matchingNGrams / responseNGrams.size;

  return {
    overlap: overlapPercentage,
    overlapPercentage: Math.round(overlapPercentage * 100),
  };
}

/**
 * Calculate average search quality score from search results
 */
function calculateSearchQuality(searchResults?: SearchResult[]): number {
  if (!searchResults || searchResults.length === 0) {
    return 0;
  }

  const totalScore = searchResults.reduce((sum, result) => sum + result.score, 0);
  return totalScore / searchResults.length;
}

/**
 * Extract RAG context text from formatted context string
 * Removes reference markers and metadata
 */
function extractContextText(formattedContext: string): string {
  // Remove reference markers like [Reference: ^doc_1:section]
  // and metadata lines like "Document:", "Section:", "Source:"
  return formattedContext
    .replace(/\[Reference:.*?\]/g, '')
    .replace(/^(Document|Section|Source):.*$/gm, '')
    .replace(/^---$/gm, '')
    .trim();
}

/**
 * Main function: Calculate RAG weight for a response
 *
 * @param responseText - The LLM's response text
 * @param citationMetadata - Metadata about cited documents
 * @param ragContext - The RAG context provided to the LLM (optional)
 * @param searchResults - The search results used for retrieval (optional)
 */
export function calculateRagWeight(
  responseText: string,
  citationMetadata: CitationMetadata[],
  ragContext?: string,
  searchResults?: SearchResult[]
): RagWeightResult {
  // Calculate individual signals
  const citationPresence = calculateCitationPresence(responseText);
  const factualAnalysis = calculateFactualDensity(responseText);

  // Extract clean context text for overlap analysis
  const contextText = ragContext ? extractContextText(ragContext) : '';
  const overlapAnalysis = calculateTokenOverlap(responseText, contextText);

  const avgSearchScore = calculateSearchQuality(searchResults);

  // Normalize search score to 0-1 range (assuming scores are 0-1 already)
  const normalizedSearchQuality = Math.min(1, Math.max(0, avgSearchScore));

  // Build breakdown with new scoring system
  const breakdown: RagWeightBreakdown = {
    citation_presence: citationPresence,
    factual_density: factualAnalysis.density,
    token_overlap: overlapAnalysis.overlap,
    search_quality: normalizedSearchQuality,
  };

  // Calculate composite RAG weight using NEW weighted formula:
  // - 60% for having citations (binary)
  // - 25% for factual density (% of factual sentences cited)
  // - 10% for token overlap
  // - 5% for search quality
  const ragWeight =
    0.60 * breakdown.citation_presence +
    0.25 * breakdown.factual_density +
    0.10 * breakdown.token_overlap +
    0.05 * breakdown.search_quality;

  // Round to 2 decimal places
  const roundedRagWeight = Math.round(ragWeight * 100) / 100;

  return {
    rag_weight: roundedRagWeight,
    breakdown,
    metadata: {
      total_sentences: factualAnalysis.totalSentences,
      factual_sentences: factualAnalysis.factualSentences,
      cited_factual_sentences: factualAnalysis.citedFactualSentences,
      has_citations: citationPresence === 1.0,
      avg_search_score: Math.round(avgSearchScore * 100) / 100,
      token_overlap_percentage: overlapAnalysis.overlapPercentage,
    },
  };
}

/**
 * Helper function to interpret RAG weight as a category
 */
export function getRagWeightCategory(ragWeight: number): {
  category: 'high' | 'medium' | 'low';
  label: string;
  color: string;
} {
  if (ragWeight >= 0.7) {
    return {
      category: 'high',
      label: 'Primarily from knowledge base',
      color: 'green',
    };
  } else if (ragWeight >= 0.4) {
    return {
      category: 'medium',
      label: 'Mixed knowledge base & general knowledge',
      color: 'yellow',
    };
  } else {
    return {
      category: 'low',
      label: 'Primarily from general knowledge',
      color: 'red',
    };
  }
}
