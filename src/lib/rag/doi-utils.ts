/**
 * DOI Processing Utilities
 *
 * Centralized utilities for cleaning, validating, and processing DOIs
 * to ensure consistent handling across the entire application.
 */

/**
 * Comprehensive DOI sanitization function
 *
 * Handles multiple types of DOI contamination:
 * - URL prefixes (https://doi.org/, dx.doi.org/)
 * - XML/HTML tags (<rdf:li>, </rdf:li>, etc.)
 * - Whitespace and control characters
 * - Malformed encoding artifacts
 *
 * @param doi - Raw DOI string that may contain contamination
 * @returns Clean DOI string or null if invalid
 */
export function sanitizeDOI(doi: string): string | null {
  if (!doi || typeof doi !== 'string') {
    return null;
  }

  let cleanDOI = doi.trim();

  // Remove URL prefixes (existing logic)
  cleanDOI = cleanDOI.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');

  // Remove XML/HTML tags (new logic to fix the <rdf:li> issue)
  cleanDOI = cleanDOI.replace(/<[^>]*>/g, '');

  // Remove common XML entities and artifacts
  cleanDOI = cleanDOI.replace(/&[a-zA-Z0-9#]+;/g, '');

  // Remove extra whitespace and control characters
  cleanDOI = cleanDOI.replace(/\s+/g, ' ').trim();

  // Validate DOI format (must start with 10. and contain a slash)
  if (!cleanDOI.match(/^10\.\d{4,}\/\S+/)) {
    return null;
  }

  // Remove any trailing punctuation that shouldn't be part of DOI
  cleanDOI = cleanDOI.replace(/[.,;:]+$/, '');

  return cleanDOI;
}

/**
 * Validates if a string looks like a DOI
 *
 * @param text - Text to check
 * @returns True if text appears to be a DOI
 */
export function isDOI(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Check for DOI pattern (with or without URL prefix)
  return /(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/)?10\.\d{4,}\/\S+/.test(text);
}

/**
 * Extracts DOI from text that may contain other content
 *
 * @param text - Text that may contain a DOI
 * @returns Extracted and sanitized DOI or null
 */
export function extractDOI(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Pattern to match DOI with optional URL prefix
  const doiPattern = /(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/)?10\.\d{4,}\/[^\s<>]+/i;
  const match = text.match(doiPattern);

  if (!match) {
    return null;
  }

  return sanitizeDOI(match[0]);
}

/**
 * Creates a standard DOI URL
 *
 * @param doi - Clean DOI string
 * @returns Standard DOI URL
 */
export function createDOIUrl(doi: string): string {
  const cleanDOI = sanitizeDOI(doi);
  if (!cleanDOI) {
    throw new Error(`Invalid DOI: ${doi}`);
  }

  return `https://doi.org/${cleanDOI}`;
}

/**
 * Extracts DOI from academic publisher URLs
 *
 * @param url - URL that may contain a DOI
 * @returns Extracted and sanitized DOI or null
 */
export function extractDOIFromURL(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Common academic publisher URL patterns containing DOIs
  const doiUrlPatterns = [
    // Wiley: https://sid.onlinelibrary.wiley.com/doi/full/10.1002/msid.1410
    /wiley\.com\/doi\/(?:full\/|abs\/|pdf\/)?(10\.\d{4,}\/[^\s\/\?#]+)/i,
    // Springer: https://link.springer.com/article/10.1007/s00123-456-7890-1
    /springer\.com\/article\/(10\.\d{4,}\/[^\s\/\?#]+)/i,
    // Elsevier/ScienceDirect: https://www.sciencedirect.com/science/article/pii/S1234567890123456
    /sciencedirect\.com\/science\/article\/(?:pii\/)?([^\/\?#]+)/i,
    // Nature: https://www.nature.com/articles/nature12345
    /nature\.com\/articles\/(?:10\.\d{4,}\/)?([^\s\/\?#]+)/i,
    // IEEE: https://ieeexplore.ieee.org/document/1234567
    /ieeexplore\.ieee\.org\/document\/(\d+)/i,
    // ACM: https://dl.acm.org/doi/10.1145/1234567.1234567
    /acm\.org\/doi\/(10\.\d{4,}\/[^\s\/\?#]+)/i,
    // General DOI URLs: https://doi.org/10.xxxx/yyyy
    /doi\.org\/(10\.\d{4,}\/[^\s\/\?#]+)/i,
    // PubMed/PMC: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/
    /ncbi\.nlm\.nih\.gov\/pmc\/articles\/PMC(\d+)/i,
    // Generic /doi/ paths in URLs
    /\/doi\/(?:full\/|abs\/|pdf\/)?(10\.\d{4,}\/[^\s\/\?#]+)/i
  ];

  for (const pattern of doiUrlPatterns) {
    const match = url.match(pattern);
    if (match) {
      // For most patterns, the DOI is in the full match or first capture group
      let doiCandidate = match[1] || match[0];

      // Clean up the candidate
      doiCandidate = doiCandidate.replace(/^.*\/doi\/(?:full\/|abs\/|pdf\/)?/, '');
      doiCandidate = doiCandidate.replace(/^\w+\.com\/\w+\//, '');

      // Special handling for different patterns
      if (pattern.source.includes('sciencedirect') && !doiCandidate.startsWith('10.')) {
        // ScienceDirect PII - try to resolve via Crossref later
        continue;
      }

      if (pattern.source.includes('nature') && !doiCandidate.startsWith('10.')) {
        // Nature article ID - construct DOI
        doiCandidate = `10.1038/${doiCandidate}`;
      }

      if (pattern.source.includes('ieee')) {
        // IEEE document ID - construct DOI
        doiCandidate = `10.1109/DOCUMENT.${doiCandidate}`;
      }

      if (pattern.source.includes('pmc')) {
        // PMC ID - not a DOI, skip
        continue;
      }

      // Validate and return the extracted DOI
      const cleanDOI = sanitizeDOI(doiCandidate);
      if (cleanDOI) {
        return cleanDOI;
      }
    }
  }

  // Fallback: try general DOI extraction from any part of the URL
  return extractDOI(url);
}

/**
 * Checks if a URL points to an academic paper that likely has a DOI
 *
 * @param url - URL to check
 * @returns True if URL is from an academic publisher
 */
export function isAcademicPublisherURL(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const academicDomains = [
    'wiley.com',
    'onlinelibrary.wiley.com',
    'sid.onlinelibrary.wiley.com',
    'springer.com',
    'link.springer.com',
    'sciencedirect.com',
    'elsevier.com',
    'nature.com',
    'science.org',
    'sciencemag.org',
    'ieeexplore.ieee.org',
    'acm.org',
    'dl.acm.org',
    'doi.org',
    'dx.doi.org',
    'pubmed.ncbi.nlm.nih.gov',
    'www.ncbi.nlm.nih.gov',
    'arxiv.org',
    'biorxiv.org',
    'medrxiv.org',
    'psyarxiv.com',
    'osf.io',
    'iopscience.iop.org',
    'journals.aps.org',
    'pubs.acs.org',
    'rsc.org',
    'tandfonline.com',
    'sagepub.com',
    'journals.sagepub.com'
  ];

  const urlLower = url.toLowerCase();
  return academicDomains.some(domain => urlLower.includes(domain));
}

/**
 * Test cases for DOI sanitization (for debugging)
 */
export const DOI_TEST_CASES = [
  // Normal cases
  { input: '10.1038/nature11972', expected: '10.1038/nature11972' },
  { input: 'https://doi.org/10.1038/nature11972', expected: '10.1038/nature11972' },
  { input: 'dx.doi.org/10.1038/nature11972', expected: '10.1038/nature11972' },

  // XML contamination cases (the main bug we're fixing)
  { input: '10.1038/nature11972</rdf:li>', expected: '10.1038/nature11972' },
  { input: '<rdf:li>10.1038/nature11972</rdf:li>', expected: '10.1038/nature11972' },
  { input: '10.1038/nature11972<br/>', expected: '10.1038/nature11972' },

  // Invalid cases
  { input: 'not-a-doi', expected: null },
  { input: '10.1038/', expected: null },
  { input: '', expected: null },
  { input: null as any, expected: null },
];

/**
 * Runs all test cases (useful for debugging)
 */
export function runDOITests(): boolean {
  console.log('🧪 Running DOI sanitization tests...');

  let passed = 0;
  let failed = 0;

  for (const testCase of DOI_TEST_CASES) {
    const result = sanitizeDOI(testCase.input);
    if (result === testCase.expected) {
      console.log(`✅ PASS: "${testCase.input}" → "${result}"`);
      passed++;
    } else {
      console.log(`❌ FAIL: "${testCase.input}" → "${result}" (expected: "${testCase.expected}")`);
      failed++;
    }
  }

  console.log(`\n📊 DOI Tests: ${passed} passed, ${failed} failed`);
  return failed === 0;
}