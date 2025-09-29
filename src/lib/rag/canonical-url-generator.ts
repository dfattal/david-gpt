/**
 * Canonical URL Generator
 *
 * Generates canonical URLs for various document types to enable
 * proper deduplication in URL parsing and document processing.
 */

import { sanitizeDOI } from './doi-utils';

export interface CanonicalUrlResult {
  canonicalUrl: string;
  originalUrl: string;
  documentId?: string; // ArXiv ID, DOI, Patent Number, etc.
  documentType?: 'arxiv' | 'doi' | 'patent' | 'generic';
  metadata?: Record<string, any>;
}

export class CanonicalUrlGenerator {

  /**
   * Generate canonical URL for any given URL
   */
  static generateCanonical(url: string): CanonicalUrlResult {
    if (!url) {
      return { canonicalUrl: '', originalUrl: url };
    }

    const cleanUrl = this.basicUrlNormalization(url);

    // Try specific canonical generators in order of specificity
    let result = this.generateArxivCanonical(cleanUrl);
    if (result.canonicalUrl !== cleanUrl) return result;

    result = this.generateDoiCanonical(cleanUrl);
    if (result.canonicalUrl !== cleanUrl) return result;

    result = this.generatePatentCanonical(cleanUrl);
    if (result.canonicalUrl !== cleanUrl) return result;

    // Return generic canonical form
    return {
      canonicalUrl: cleanUrl,
      originalUrl: url,
      documentType: 'generic'
    };
  }

  /**
   * Basic URL normalization - remove common variations
   */
  private static basicUrlNormalization(url: string): string {
    let normalized = url.trim();

    // Remove trailing characters from markdown parsing
    normalized = normalized.replace(/[\]\)>"\s]+$/, '');
    normalized = normalized.replace(/[<>"\s]*$/, '');
    normalized = normalized.replace(/[.,\s]*$/, '');

    try {
      const urlObj = new URL(normalized);

      // Normalize protocol
      if (urlObj.protocol === 'http:' &&
          (urlObj.hostname.includes('arxiv.org') ||
           urlObj.hostname.includes('doi.org') ||
           urlObj.hostname.includes('patents.google.com'))) {
        urlObj.protocol = 'https:';
      }

      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'referrer'];
      trackingParams.forEach(param => urlObj.searchParams.delete(param));

      // Remove trailing slash for consistency
      let cleanPath = urlObj.pathname.replace(/\/$/, '');
      if (!cleanPath) cleanPath = '/';

      return `${urlObj.protocol}//${urlObj.hostname}${cleanPath}${urlObj.search}${urlObj.hash}`;
    } catch (error) {
      // If URL parsing fails, return basic cleaned version
      return normalized;
    }
  }

  /**
   * Generate canonical URL for ArXiv papers
   */
  private static generateArxivCanonical(url: string): CanonicalUrlResult {
    const arxivPatterns = [
      // PDF URLs: https://arxiv.org/pdf/2405.10314.pdf or https://arxiv.org/pdf/2405.10314
      /https?:\/\/arxiv\.org\/pdf\/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?/i,
      // Abstract URLs: https://arxiv.org/abs/2405.10314
      /https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)/i,
      // Legacy URLs: https://arxiv.org/abs/math/0309285
      /https?:\/\/arxiv\.org\/abs\/([a-z-]+\/\d{7}(?:v\d+)?)/i
    ];

    for (const pattern of arxivPatterns) {
      const match = url.match(pattern);
      if (match) {
        const arxivId = match[1];
        const canonicalUrl = `https://arxiv.org/abs/${arxivId}`;

        return {
          canonicalUrl,
          originalUrl: url,
          documentId: arxivId,
          documentType: 'arxiv',
          metadata: {
            arxivId,
            pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
            abstractUrl: canonicalUrl
          }
        };
      }
    }

    return { canonicalUrl: url, originalUrl: url };
  }

  /**
   * Generate canonical URL for DOI-based papers
   */
  private static generateDoiCanonical(url: string): CanonicalUrlResult {
    const doiPatterns = [
      // Direct DOI URLs: https://doi.org/10.1000/182
      /https?:\/\/(?:dx\.)?doi\.org\/(.+)/i,
      // DOI in various URL formats
      /https?:\/\/[^\/]+\/.*doi[\/=:]([^\/&?\s]+)/i,
      // DOI embedded in academic URLs
      /https?:\/\/[^\/]+\/.*\/doi\/(?:full\/)?([^\/&?\s]+)/i
    ];

    for (const pattern of doiPatterns) {
      const match = url.match(pattern);
      if (match) {
        const rawDoi = match[1];
        const cleanDoi = sanitizeDOI(rawDoi);

        if (cleanDoi) {
          const canonicalUrl = `https://doi.org/${cleanDoi}`;

          return {
            canonicalUrl,
            originalUrl: url,
            documentId: cleanDoi,
            documentType: 'doi',
            metadata: {
              doi: cleanDoi
            }
          };
        }
      }
    }

    return { canonicalUrl: url, originalUrl: url };
  }

  /**
   * Generate canonical URL for patent documents
   */
  private static generatePatentCanonical(url: string): CanonicalUrlResult {
    // Google Patents URLs
    const googlePatentMatch = url.match(/https?:\/\/patents\.google\.com\/patent\/([A-Z]{2}\d+[A-Z]?\d*)/i);
    if (googlePatentMatch) {
      const patentNumber = googlePatentMatch[1];
      const canonicalUrl = `https://patents.google.com/patent/${patentNumber}`;

      return {
        canonicalUrl,
        originalUrl: url,
        documentId: patentNumber,
        documentType: 'patent',
        metadata: {
          patentNumber,
          source: 'Google Patents'
        }
      };
    }

    // USPTO URLs
    const usptoMatch = url.match(/patents\.uspto\.gov.*[?&](?:pn|Patent)=([A-Z]*\d+[A-Z]*\d*)/i);
    if (usptoMatch) {
      const patentNumber = usptoMatch[1];
      // Convert to Google Patents canonical format for consistency
      const canonicalUrl = `https://patents.google.com/patent/${patentNumber}`;

      return {
        canonicalUrl,
        originalUrl: url,
        documentId: patentNumber,
        documentType: 'patent',
        metadata: {
          patentNumber,
          source: 'USPTO',
          originalSource: 'USPTO'
        }
      };
    }

    return { canonicalUrl: url, originalUrl: url };
  }

  /**
   * Extract document identifier from canonical URL
   */
  static extractDocumentId(canonicalResult: CanonicalUrlResult): string | null {
    return canonicalResult.documentId || null;
  }

  /**
   * Check if two URLs represent the same document
   */
  static areEquivalentUrls(url1: string, url2: string): boolean {
    const canonical1 = this.generateCanonical(url1);
    const canonical2 = this.generateCanonical(url2);

    // If both have document IDs, compare those
    if (canonical1.documentId && canonical2.documentId) {
      return canonical1.documentId === canonical2.documentId;
    }

    // Otherwise compare canonical URLs
    return canonical1.canonicalUrl === canonical2.canonicalUrl;
  }

  /**
   * Generate consistent title suffix for document type
   */
  static generateTitleSuffix(canonicalResult: CanonicalUrlResult): string {
    switch (canonicalResult.documentType) {
      case 'arxiv':
        return ` (arXiv:${canonicalResult.documentId})`;
      case 'doi':
        return ` (DOI:${canonicalResult.documentId})`;
      case 'patent':
        return ` (Patent ${canonicalResult.documentId})`;
      default:
        return '';
    }
  }

  /**
   * Batch process multiple URLs for deduplication
   */
  static deduplicateUrls(urls: string[]): CanonicalUrlResult[] {
    const seen = new Set<string>();
    const results: CanonicalUrlResult[] = [];

    for (const url of urls) {
      const canonical = this.generateCanonical(url);
      const key = canonical.documentId || canonical.canonicalUrl;

      if (!seen.has(key)) {
        seen.add(key);
        results.push(canonical);
      }
    }

    return results;
  }
}