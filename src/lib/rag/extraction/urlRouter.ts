/**
 * URL Router - Detects document type from URL and routes to appropriate extractor
 */

export type DocumentType = 'patent' | 'arxiv' | 'generic';

export interface UrlAnalysis {
  type: DocumentType;
  identifier?: string;
  originalUrl: string;
  extractorUrl: string;
}

/**
 * Analyze URL and determine document type and extraction strategy
 */
export function analyzeUrl(url: string): UrlAnalysis {
  const cleanUrl = url.trim();

  // Patent patterns
  if (cleanUrl.includes('patents.google.com/patent/')) {
    const patentMatch = cleanUrl.match(/patents\.google\.com\/patent\/([A-Z0-9]+)/i);
    if (patentMatch) {
      return {
        type: 'patent',
        identifier: patentMatch[1],
        originalUrl: cleanUrl,
        extractorUrl: `https://patents.google.com/patent/${patentMatch[1]}`
      };
    }
  }

  // Patent number format (e.g., "US10838134B2")
  const patentNumberMatch = cleanUrl.match(/^([A-Z]{2}\d{7,}[A-Z]?\d?)$/i);
  if (patentNumberMatch) {
    return {
      type: 'patent',
      identifier: patentNumberMatch[1].toUpperCase(),
      originalUrl: cleanUrl,
      extractorUrl: `https://patents.google.com/patent/${patentNumberMatch[1].toUpperCase()}`
    };
  }

  // ArXiv patterns
  if (cleanUrl.includes('arxiv.org')) {
    // arxiv.org/html/2405.10314 or arxiv.org/abs/2405.10314
    const arxivMatch = cleanUrl.match(/arxiv\.org\/(?:html|abs)\/(\d{4}\.\d{4,5})/);
    if (arxivMatch) {
      return {
        type: 'arxiv',
        identifier: arxivMatch[1],
        originalUrl: cleanUrl,
        extractorUrl: `https://arxiv.org/html/${arxivMatch[1]}`
      };
    }
  }

  // ArXiv identifier format (e.g., "arxiv:2405.10314" or "2405.10314")
  const arxivIdMatch = cleanUrl.match(/^(?:arxiv:)?(\d{4}\.\d{4,5})$/i);
  if (arxivIdMatch) {
    return {
      type: 'arxiv',
      identifier: arxivIdMatch[1],
      originalUrl: cleanUrl,
      extractorUrl: `https://arxiv.org/html/${arxivIdMatch[1]}`
    };
  }

  // Generic URL fallback
  return {
    type: 'generic',
    originalUrl: cleanUrl,
    extractorUrl: cleanUrl
  };
}

/**
 * Normalize identifier for storage (filename-safe)
 */
export function normalizeIdentifier(analysis: UrlAnalysis): string {
  if (analysis.identifier) {
    return analysis.identifier.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
  }

  // For generic URLs, create identifier from domain + path
  try {
    const urlObj = new URL(analysis.originalUrl);
    const domain = urlObj.hostname.replace(/^www\./, '');
    const path = urlObj.pathname.replace(/\//g, '-').replace(/^-|-$/g, '');
    return `${domain}${path}`.toLowerCase().replace(/[^a-z0-9.-]/g, '-').slice(0, 100);
  } catch {
    return 'unknown-document';
  }
}
