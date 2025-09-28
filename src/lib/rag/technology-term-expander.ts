/**
 * Technology Term Expansion Service
 *
 * Enhances semantic understanding by expanding technology abbreviations,
 * synonyms, and related terms based on David Fattal's expertise domains.
 * Helps map user queries like "switchable LC patent" to specific documents.
 */

export interface TermExpansion {
  originalTerm: string;
  expandedTerms: string[];
  synonyms: string[];
  relatedTerms: string[];
  confidence: number;
}

export interface TechnologyMapping {
  // Core technology areas
  displayTechnology: string[];
  optics: string[];
  materials: string[];
  ai: string[];
  nanotechnology: string[];
}

/**
 * Comprehensive technology term mappings based on David Fattal's expertise
 */
const TECHNOLOGY_MAPPINGS: TechnologyMapping = {
  displayTechnology: [
    // LCD related
    'lcd',
    'liquid crystal display',
    'liquid crystal',
    'lc',
    // 3D Display technology
    '3d display',
    'three dimensional display',
    'stereoscopic',
    'autostereoscopic',
    'glasses-free',
    'glasses free',
    'switchable display',
    'switchable 2d 3d',
    'locally switchable',
    'multi-view',
    'multiview',
    // Switchable LC specific
    'switchable lc',
    'switchable liquid crystal',
    'switchable lcd',
    'switchable display technology',
    '2d 3d switching',
    // Display components
    'backlight',
    'lightfield',
    'light field',
    'lenticular',
    'parallax barrier',
    'pixel',
    'subpixel',
    'display panel',
  ],

  optics: [
    'optics',
    'photonics',
    'optical',
    'lens',
    'lenses',
    'diffractive',
    'diffractive optics',
    'holographic',
    'hologram',
    'waveguide',
    'optical interconnect',
    'optical interconnects',
    'metamaterial',
    'metasurface',
    'photonic crystal',
    'beam steering',
    'optical switching',
  ],

  materials: [
    'liquid crystal',
    'lc',
    'nematic',
    'twisted nematic',
    'tn',
    'silicon',
    'silicon photonics',
    'gaas',
    'gallium arsenide',
    'polymer',
    'organic',
    'oled',
    'organic light emitting diode',
    'quantum dot',
    'perovskite',
  ],

  ai: [
    'artificial intelligence',
    'ai',
    'machine learning',
    'ml',
    'neural network',
    'neural',
    'deep learning',
    'computer vision',
    'depth estimation',
    'depth sensing',
    'depth map',
    'object detection',
    'image processing',
    'spatial ai',
  ],

  nanotechnology: [
    'nanotechnology',
    'nanostructure',
    'nanophotonics',
    'nanomaterial',
    'quantum',
    'quantum effect',
    'nano',
    'microscale',
    'nanoscale',
  ],
};

/**
 * Specific abbreviation expansions
 */
const ABBREVIATION_EXPANSIONS: Record<string, string[]> = {
  lc: ['liquid crystal', 'light guide'],
  lcd: ['liquid crystal display'],
  oled: ['organic light emitting diode'],
  ai: ['artificial intelligence'],
  ml: ['machine learning'],
  cv: ['computer vision'],
  ar: ['augmented reality'],
  vr: ['virtual reality'],
  xr: ['extended reality', 'mixed reality'],
  '2d': ['two dimensional', 'two-dimensional'],
  '3d': ['three dimensional', 'three-dimensional'],
  ui: ['user interface'],
  ux: ['user experience'],
  api: ['application programming interface'],
  gpu: ['graphics processing unit'],
  cpu: ['central processing unit'],
  ram: ['random access memory'],
};

/**
 * Technology product/concept mappings
 */
const PRODUCT_TECHNOLOGY_MAPPINGS: Record<string, string[]> = {
  'switchable lc': [
    'switchable liquid crystal',
    'locally switchable 2d and 3d displays',
    'switchable display technology',
    '2d 3d switching display',
    'multi-view display',
  ],
  lightfield: [
    'light field display',
    'lightfield technology',
    'multi-view display',
    'autostereoscopic display',
  ],
  leia: [
    'leia inc',
    'lightfield display',
    '3d display technology',
    'glasses-free 3d',
  ],
};

export class TechnologyTermExpander {
  /**
   * Expand a query with technology-specific terms and synonyms
   */
  expandQuery(query: string): TermExpansion[] {
    const expansions: TermExpansion[] = [];
    const lowerQuery = query.toLowerCase();

    // Check for abbreviations first
    for (const [abbrev, expansions_list] of Object.entries(
      ABBREVIATION_EXPANSIONS
    )) {
      if (this.containsTerm(lowerQuery, abbrev)) {
        expansions.push({
          originalTerm: abbrev,
          expandedTerms: expansions_list,
          synonyms: [],
          relatedTerms: [],
          confidence: 0.9,
        });
      }
    }

    // Check for product/technology mappings
    for (const [product, techs] of Object.entries(
      PRODUCT_TECHNOLOGY_MAPPINGS
    )) {
      if (this.containsTerm(lowerQuery, product)) {
        expansions.push({
          originalTerm: product,
          expandedTerms: techs,
          synonyms: [],
          relatedTerms: [],
          confidence: 0.85,
        });
      }
    }

    // Check technology domain mappings
    for (const [domain, terms] of Object.entries(TECHNOLOGY_MAPPINGS)) {
      for (const term of terms) {
        if (this.containsTerm(lowerQuery, term)) {
          const relatedTerms = terms.filter(
            t => t !== term && this.calculateSimilarity(term, t) > 0.3
          );

          expansions.push({
            originalTerm: term,
            expandedTerms: [term],
            synonyms: relatedTerms.slice(0, 3), // Top 3 most related
            relatedTerms: relatedTerms.slice(3, 6), // Additional related terms
            confidence: 0.7,
          });
        }
      }
    }

    return expansions;
  }

  /**
   * Generate expanded search terms for metadata queries
   */
  generateSearchTerms(query: string): string[] {
    const expansions = this.expandQuery(query);
    const searchTerms = new Set<string>();

    // Add original query
    searchTerms.add(query);

    // Add expanded terms
    for (const expansion of expansions) {
      expansion.expandedTerms.forEach(term => searchTerms.add(term));
      expansion.synonyms.forEach(syn => searchTerms.add(syn));

      // Add high-confidence related terms
      if (expansion.confidence > 0.8) {
        expansion.relatedTerms.forEach(rel => searchTerms.add(rel));
      }
    }

    return Array.from(searchTerms);
  }

  /**
   * Enhanced technology pattern detection
   */
  detectTechnologyPatterns(query: string): {
    hasTechnologyTerms: boolean;
    domains: string[];
    primaryDomain?: string;
    confidence: number;
  } {
    const lowerQuery = query.toLowerCase();
    const detectedDomains: Set<string> = new Set();
    let maxConfidence = 0;

    // Check each technology domain
    for (const [domain, terms] of Object.entries(TECHNOLOGY_MAPPINGS)) {
      let domainScore = 0;
      let termCount = 0;

      for (const term of terms) {
        if (this.containsTerm(lowerQuery, term)) {
          termCount++;
          // Longer terms get higher scores
          domainScore += term.length / 10;
        }
      }

      if (termCount > 0) {
        detectedDomains.add(domain);
        // Calculate confidence based on match strength, not total domain size
        const domainConfidence = Math.min(
          domainScore / Math.max(termCount, 1),
          1.0
        );
        maxConfidence = Math.max(maxConfidence, domainConfidence);
      }
    }

    const domains = Array.from(detectedDomains);
    const primaryDomain =
      domains.length > 0
        ? domains.reduce((a, b) =>
            TECHNOLOGY_MAPPINGS[a as keyof TechnologyMapping].length >
            TECHNOLOGY_MAPPINGS[b as keyof TechnologyMapping].length
              ? a
              : b
          )
        : undefined;

    return {
      hasTechnologyTerms: domains.length > 0,
      domains,
      primaryDomain,
      confidence: maxConfidence,
    };
  }

  /**
   * Generate database search patterns for technology terms
   */
  generateDatabaseSearchPatterns(query: string): {
    titlePatterns: string[];
    contentPatterns: string[];
    entityPatterns: string[];
  } {
    const searchTerms = this.generateSearchTerms(query);

    return {
      titlePatterns: searchTerms.map(term => `%${term}%`),
      contentPatterns: searchTerms.map(term => term.replace(/\s+/g, ' & ')),
      entityPatterns: searchTerms,
    };
  }

  /**
   * Check if query contains a specific term (handles word boundaries)
   */
  private containsTerm(query: string, term: string): boolean {
    // Handle abbreviations and exact matches
    const termRegex = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i'
    );
    return termRegex.test(query);
  }

  /**
   * Calculate similarity between two terms (simple Jaccard similarity)
   */
  private calculateSimilarity(term1: string, term2: string): number {
    const words1 = new Set(term1.toLowerCase().split(/\s+/));
    const words2 = new Set(term2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// Export singleton instance
export const technologyTermExpander = new TechnologyTermExpander();
