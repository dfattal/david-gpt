/**
 * Persona-Aware Query Classifier
 *
 * Determines when RAG search is likely to help based on David Fattal's expertise domains.
 * This replaces the "always-on RAG" approach with intelligent routing.
 */

export enum QueryClassification {
  ALWAYS_RAG = 'always_rag', // Questions about David's work, research, patents
  LIKELY_RAG = 'likely_rag', // Technical questions in David's domains
  MAYBE_RAG = 'maybe_rag', // General technical questions that might benefit
  SKIP_RAG = 'skip_rag', // Math, greetings, basic facts outside domains
}

export interface ClassificationResult {
  classification: QueryClassification;
  confidence: number;
  reasoning: string;
  domains: string[];
}

/**
 * David Fattal's core expertise domains from persona
 */
const DAVID_EXPERTISE_DOMAINS = {
  // Core technical domains
  optics: [
    'optics',
    'photonics',
    'lightfield',
    'diffractive',
    'holographic',
    'lens',
    'display',
    'backlight',
  ],
  displays: [
    '3d display',
    'glasses-free',
    'stereoscopic',
    'autostereoscopic',
    'lcd',
    'switchable',
  ],
  ai: [
    'artificial intelligence',
    'machine learning',
    'depth estimation',
    'computer vision',
    'neural',
    'ai',
  ],
  spatialai: [
    'spatial ai',
    'spatial intelligence',
    'physical ai',
    'embodied ai',
    '3d ai',
  ],

  // Business domains
  companies: ['leia', 'immersity', 'hp labs', 'dimenco'],
  entrepreneurship: [
    'startup',
    'founder',
    'cto',
    'fundraising',
    'oem',
    'partnership',
  ],

  // Research domains
  research: [
    'patent',
    'paper',
    'publication',
    'research',
    'invention',
    'ieee',
    'arxiv',
  ],
  people: ['david fattal', 'david', 'fattal'],

  // Related technical areas
  tech: [
    'quantum computing',
    'nanophotonics',
    'semiconductor',
    'silicon',
    'manufacturing',
  ],
};

/**
 * Patterns that should always skip RAG
 */
const SKIP_RAG_PATTERNS = [
  // Math and calculations
  /^\s*\d+\s*[\+\-\*\/\%\^]\s*\d+/,
  /what\s+is\s+\d+\s*[\+\-\*\/\%\^]\s*\d+/i,
  /calculate\s+\d+/i,
  /^\s*\d+\s*\+\s*\d+/,

  // Simple greetings
  /^(hi|hello|hey|good morning|good afternoon|good evening)$/i,
  /^(thanks|thank you|bye|goodbye)$/i,

  // Basic facts clearly outside David's domains
  /what\s+is\s+the\s+capital\s+of/i,
  /when\s+was\s+.*\s+born/i,
  /what\s+color\s+is/i,
  /how\s+many\s+days\s+in/i,

  // Weather/time/date
  /what\s+(time|date)/i,
  /weather/i,
  /temperature/i,
];

/**
 * Patterns that should always use RAG (David-specific content)
 */
const ALWAYS_RAG_PATTERNS = [
  // Direct references to David
  /david\s+fattal/i,
  /your\s+(work|research|patents|papers|company)/i,
  /tell\s+me\s+about\s+(yourself|you)/i,

  // Leia/Immersity specific
  /leia\s+(inc|displays?)/i,
  /immersity\s+ai/i,

  // Patent-specific queries
  /(patent|claims?|inventors?|assignee)/i,
  /this\s+patent/i,
  /the\s+patent/i,

  // Research-specific
  /(paper|publication|research|study)\s+(on|about)/i,
  /citations?\s+(from|of)/i,
];

/**
 * Classify a query to determine if RAG should be used
 */
export function classifyQuery(query: string): ClassificationResult {
  const normalizedQuery = query.toLowerCase().trim();

  // Step 1: Check for explicit skip patterns
  for (const pattern of SKIP_RAG_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        classification: QueryClassification.SKIP_RAG,
        confidence: 0.9,
        reasoning: 'Simple math/greeting/basic fact outside expertise domains',
        domains: [],
      };
    }
  }

  // Step 2: Check for always RAG patterns
  for (const pattern of ALWAYS_RAG_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        classification: QueryClassification.ALWAYS_RAG,
        confidence: 0.95,
        reasoning:
          "Direct reference to David's work or specific research content",
        domains: ['personal', 'research'],
      };
    }
  }

  // Step 3: Domain-based classification
  const domainMatches = findDomainMatches(normalizedQuery);

  if (domainMatches.length === 0) {
    // No domain matches - likely general knowledge
    if (isGeneralTechnicalQuery(normalizedQuery)) {
      return {
        classification: QueryClassification.MAYBE_RAG,
        confidence: 0.3,
        reasoning:
          'General technical query that might benefit from corpus knowledge',
        domains: [],
      };
    } else {
      return {
        classification: QueryClassification.SKIP_RAG,
        confidence: 0.7,
        reasoning: 'No matching expertise domains detected',
        domains: [],
      };
    }
  }

  // Step 4: Score based on domain relevance and query type
  const score = calculateDomainScore(domainMatches, normalizedQuery);

  if (score >= 0.8) {
    return {
      classification: QueryClassification.ALWAYS_RAG,
      confidence: score,
      reasoning: `High relevance to David's expertise: ${domainMatches.join(', ')}`,
      domains: domainMatches,
    };
  } else if (score >= 0.5) {
    return {
      classification: QueryClassification.LIKELY_RAG,
      confidence: score,
      reasoning: `Moderate relevance to expertise domains: ${domainMatches.join(', ')}`,
      domains: domainMatches,
    };
  } else {
    return {
      classification: QueryClassification.MAYBE_RAG,
      confidence: score,
      reasoning: `Weak relevance to expertise domains: ${domainMatches.join(', ')}`,
      domains: domainMatches,
    };
  }
}

/**
 * Find which of David's expertise domains match the query
 */
function findDomainMatches(query: string): string[] {
  const matches: string[] = [];

  Object.entries(DAVID_EXPERTISE_DOMAINS).forEach(([domain, keywords]) => {
    const hasMatch = keywords.some(keyword => {
      // Use word boundaries for better matching
      const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
      return regex.test(query);
    });

    if (hasMatch) {
      matches.push(domain);
    }
  });

  return matches;
}

/**
 * Calculate relevance score based on domain matches and query characteristics
 */
function calculateDomainScore(domains: string[], query: string): number {
  let score = 0;

  // Base score from domain count and importance
  const domainWeights: Record<string, number> = {
    people: 1.0, // Always important when David is mentioned
    companies: 0.9, // Leia/Immersity content
    research: 0.9, // Patents/papers
    optics: 0.8, // Core technical expertise
    displays: 0.8, // Core technical expertise
    spatialai: 0.8, // Core research area
    ai: 0.6, // Broad but relevant
    entrepreneurship: 0.6,
    tech: 0.4, // Related but less specific
  };

  domains.forEach(domain => {
    score = Math.max(score, domainWeights[domain] || 0.3);
  });

  // Boost for question words that suggest information seeking
  const questionWords = [
    'what',
    'how',
    'why',
    'when',
    'who',
    'where',
    'explain',
    'tell',
    'describe',
  ];
  const hasQuestionWord = questionWords.some(word =>
    new RegExp(`\\b${word}\\b`, 'i').test(query)
  );

  if (hasQuestionWord) {
    score += 0.1;
  }

  // Boost for comparative/analytical queries
  const analyticalWords = [
    'difference',
    'compare',
    'versus',
    'better',
    'advantage',
    'disadvantage',
  ];
  const hasAnalyticalWord = analyticalWords.some(word =>
    new RegExp(`\\b${word}\\b`, 'i').test(query)
  );

  if (hasAnalyticalWord) {
    score += 0.15;
  }

  return Math.min(score, 1.0);
}

/**
 * Check if query is general technical that might benefit from RAG
 */
function isGeneralTechnicalQuery(query: string): boolean {
  const generalTechWords = [
    'algorithm',
    'software',
    'hardware',
    'technology',
    'system',
    'method',
    'process',
    'technique',
    'approach',
    'solution',
    'implementation',
    'framework',
    'platform',
    'architecture',
    'design',
    'development',
  ];

  return generalTechWords.some(word =>
    new RegExp(`\\b${word}\\b`, 'i').test(query)
  );
}

/**
 * Convenience function to determine if RAG should be used
 */
export function shouldUseRAGForQuery(query: string): boolean {
  const result = classifyQuery(query);

  // Log classification for debugging
  console.log(
    `🎯 Query classification: ${result.classification} (confidence: ${result.confidence.toFixed(2)})`
  );
  console.log(`📝 Reasoning: ${result.reasoning}`);
  if (result.domains.length > 0) {
    console.log(`🏷️ Domains: ${result.domains.join(', ')}`);
  }

  return result.classification !== QueryClassification.SKIP_RAG;
}
