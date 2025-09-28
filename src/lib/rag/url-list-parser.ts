/**
 * URL List Parser
 *
 * Parses markdown files containing lists of URLs and extracts them
 * for individual document processing. Handles various markdown formats
 * and detects document types from URLs.
 */

import type { DocumentType } from './types';
import { sanitizeDOI } from './doi-utils';
import { TitleQualityValidator } from './title-quality-validator';
import {
  CanonicalUrlGenerator,
  type CanonicalUrlResult,
} from './canonical-url-generator';

// =======================
// Types
// =======================

export interface ParsedUrlItem {
  title: string;
  url: string;
  canonicalUrl: string;
  documentId?: string; // ArXiv ID, DOI, Patent Number for deduplication
  detectedType: DocumentType;
  confidence: number;
  metadata: {
    description?: string;
    source?: string;
    category?: string;
    isPatent?: boolean;
    isDoi?: boolean;
    isArxiv?: boolean;
    canonicalData?: CanonicalUrlResult;
  };
}

export interface UrlListParseResult {
  isUrlList: boolean;
  confidence: number;
  urls: ParsedUrlItem[];
  listType: 'patent' | 'article' | 'paper' | 'mixed' | 'unknown';
  listTitle?: string;
}

// =======================
// URL List Parser
// =======================

export class UrlListParser {
  /**
   * Parse markdown content and extract URLs if it's a URL list
   */
  parseMarkdownContent(content: string, fileName?: string): UrlListParseResult {
    const isUrlList = this.detectUrlList(content);

    if (!isUrlList) {
      return {
        isUrlList: false,
        confidence: 0,
        urls: [],
        listType: 'unknown',
      };
    }

    const urls = this.extractUrls(content);
    const listType = this.detectListType(urls, fileName);
    const listTitle = this.extractListTitle(content, fileName);

    return {
      isUrlList: true,
      confidence: this.calculateConfidence(content, urls),
      urls,
      listType,
      listTitle,
    };
  }

  /**
   * Check if URL is a valid, real URL (not XML namespace or metadata)
   */
  private isRealUrl(url: string): boolean {
    if (!url) return false;

    // Filter out XML namespace URLs
    const xmlNamespacePatterns = [
      /^https?:\/\/ns\.adobe\.com\//,
      /^https?:\/\/www\.w3\.org\//,
      /^https?:\/\/purl\.org\//,
      /^https?:\/\/prismstandard\.org\//,
      /xmlns[:=]/i,
      /namespace/i,
    ];

    // Check if it matches any XML namespace pattern
    if (xmlNamespacePatterns.some(pattern => pattern.test(url))) {
      return false;
    }

    // Must be a valid HTTP(S) URL and reasonable length
    try {
      const urlObj = new URL(url);
      return (
        urlObj.protocol.startsWith('http') &&
        url.length > 10 &&
        url.length < 2000
      ); // Prevent extremely long URLs
    } catch {
      return false;
    }
  }

  /**
   * Check if content has YAML frontmatter structure
   */
  private hasYamlFrontmatter(content: string): boolean {
    if (!content || content.length < 10) return false;

    // Check for YAML frontmatter pattern: starts with ---, contains ---, has content after
    const frontmatterPattern = /^---\n([\s\S]*?)\n---\n([\s\S]*)/;
    const match = content.match(frontmatterPattern);

    if (!match) return false;

    // Validate that the frontmatter section contains YAML-like content
    const frontmatterSection = match[1];
    const hasYamlStructure =
      frontmatterSection.includes(':') &&
      frontmatterSection
        .split('\n')
        .some(line => line.trim().match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/));

    return hasYamlStructure;
  }

  /**
   * Detect if markdown content contains a URL list
   */
  private detectUrlList(content: string): boolean {
    // First check if this is a structured markdown document with frontmatter
    // Such documents should NOT be treated as URL lists even if they contain URLs
    if (this.hasYamlFrontmatter(content)) {
      console.log(
        '🚫 Skipping URL list detection: document has YAML frontmatter structure'
      );
      return false;
    }

    // Look for markdown link patterns
    const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const urlPattern = /https?:\/\/[^\s\)]+/g;

    const markdownLinks = content.match(markdownLinkPattern) || [];
    const plainUrls = content.match(urlPattern) || [];

    // Get unique REAL URLs (excluding XML namespaces) to avoid double counting
    const allUrls = new Set([
      ...markdownLinks
        .map(link => link.match(/\(([^)]+)\)/)?.[1])
        .filter(url => url && this.isRealUrl(url)),
      ...plainUrls.filter(url => this.isRealUrl(url)),
    ]);

    const totalUrls = allUrls.size;

    // Enhanced list indicators
    const listIndicators = [
      /^[\s]*[-*+]\s+/m, // Bullet points
      /^\s*\d+\.\s+/m, // Numbered lists
      /^[\s]*>\s+/m, // Block quotes
      /^#{1,6}\s+.*list/im, // Headers mentioning "list"
      /^#{1,6}\s+.*url/im, // Headers mentioning "url"
      /^#{1,6}\s+.*patent/im, // Headers mentioning "patent"
      /^#{1,6}\s+.*paper/im, // Headers mentioning "paper"
      /^#{1,6}\s+.*article/im, // Headers mentioning "article"
    ];

    const hasListIndicators = listIndicators.some(pattern =>
      pattern.test(content)
    );

    // Check content-to-URL ratio (high URL density suggests a list)
    const contentLength = content.replace(/\s+/g, ' ').trim().length;
    const urlDensity = totalUrls / Math.max(contentLength / 100, 1); // URLs per 100 chars

    // Multiple detection criteria
    const criteria = {
      multipleUrls: totalUrls >= 2,
      singleUrlWithIndicators: totalUrls >= 1 && hasListIndicators,
      highUrlDensity: urlDensity > 0.5, // More than 0.5 URLs per 100 characters
      mostlyUrls: totalUrls >= 1 && contentLength < 500 && urlDensity > 0.2,
    };

    return (
      criteria.multipleUrls ||
      criteria.singleUrlWithIndicators ||
      criteria.highUrlDensity ||
      criteria.mostlyUrls
    );
  }

  /**
   * Extract URLs from markdown content with enhanced deduplication and pattern prioritization
   */
  private extractUrls(content: string): ParsedUrlItem[] {
    const urls: ParsedUrlItem[] = [];
    const processedCanonical = new Set<string>(); // Use canonical URLs for deduplication
    const processedDocIds = new Set<string>(); // Use document IDs for stronger deduplication
    const documentTitles = new Map<string, string>(); // Track best titles by document ID

    // Process extraction patterns in priority order (highest quality first)

    // PRIORITY 1: Explicit markdown links with titles - highest quality
    this.extractMarkdownLinks(
      content,
      urls,
      processedCanonical,
      processedDocIds,
      documentTitles
    );

    // PRIORITY 2: Titled URL formats - medium quality
    this.extractTitledUrls(
      content,
      urls,
      processedCanonical,
      processedDocIds,
      documentTitles
    );

    // PRIORITY 3: Bracket-only URLs - lower quality (needs title generation)
    this.extractBracketUrls(
      content,
      urls,
      processedCanonical,
      processedDocIds,
      documentTitles
    );

    // PRIORITY 4: Raw URLs from lines - lowest quality (fallback)
    this.extractRawUrls(
      content,
      urls,
      processedCanonical,
      processedDocIds,
      documentTitles
    );

    // Post-process to ensure title consistency for same documents
    this.ensureTitleConsistency(urls, documentTitles);

    return urls;
  }

  /**
   * Extract explicit markdown links: [title](url)
   */
  private extractMarkdownLinks(
    content: string,
    urls: ParsedUrlItem[],
    processedCanonical: Set<string>,
    processedDocIds: Set<string>,
    documentTitles: Map<string, string>
  ): void {
    const markdownPatterns = [
      /\[([^\]]+)\]\(([^)]+)\)/g, // Standard: [title](url)
      /\[([^\]]+)\]\s*\(([^)]+)\)/g, // With space: [title] (url)
      /\[([^\]]+)\]:\s*([^\s]+)/g, // Reference style: [title]: url
      /-\s*\[([^\]]+)\]\(([^)]+)\)/g, // Bullet with link: - [title](url)
    ];

    for (const pattern of markdownPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim();
        const rawUrl = match[2].trim();
        const canonicalResult = CanonicalUrlGenerator.generateCanonical(rawUrl);

        if (
          this.isRealUrl(canonicalResult.canonicalUrl) &&
          !this.isDuplicate(
            canonicalResult,
            processedCanonical,
            processedDocIds
          )
        ) {
          // Track best title for this document (markdown links have highest quality)
          if (canonicalResult.documentId) {
            documentTitles.set(canonicalResult.documentId, title);
          }

          const parsedItem = this.createParsedUrlItem(title, canonicalResult);
          urls.push(parsedItem);
          this.markAsProcessed(
            canonicalResult,
            processedCanonical,
            processedDocIds
          );

          console.log(
            `📝 Priority 1 - Markdown link: "${title}" → ${canonicalResult.canonicalUrl}`
          );
        }
      }
    }
  }

  /**
   * Extract titled URL formats: "Title: URL" or "Title -- URL"
   */
  private extractTitledUrls(
    content: string,
    urls: ParsedUrlItem[],
    processedCanonical: Set<string>,
    processedDocIds: Set<string>,
    documentTitles: Map<string, string>
  ): void {
    const lines = content.split('\n');
    const titledPatterns = [
      /(?:- )?([^:]+):\s*(https?:\/\/[^\s]+)/g, // "Title: URL" format
      /(?:- )?([^-]+)\s*--\s*(https?:\/\/[^\s]+)/g, // "Title -- URL" format
    ];

    for (const line of lines) {
      // Skip lines that contain markdown links (already processed)
      if (/\[([^\]]+)\]\(([^)]+)\)/.test(line)) {
        continue;
      }

      for (const pattern of titledPatterns) {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const title = match[1].trim();
          const rawUrl = match[2].trim();
          const canonicalResult =
            CanonicalUrlGenerator.generateCanonical(rawUrl);

          if (
            this.isRealUrl(canonicalResult.canonicalUrl) &&
            !this.isDuplicate(
              canonicalResult,
              processedCanonical,
              processedDocIds
            )
          ) {
            // Track title for consistency (medium priority)
            if (
              canonicalResult.documentId &&
              !documentTitles.has(canonicalResult.documentId)
            ) {
              documentTitles.set(canonicalResult.documentId, title);
            }

            const parsedItem = this.createParsedUrlItem(title, canonicalResult);
            urls.push(parsedItem);
            this.markAsProcessed(
              canonicalResult,
              processedCanonical,
              processedDocIds
            );

            console.log(
              `📝 Priority 2 - Titled URL: "${title}" → ${canonicalResult.canonicalUrl}`
            );
          }
        }
      }
    }
  }

  /**
   * Extract bracket-only URLs: [url] format
   */
  private extractBracketUrls(
    content: string,
    urls: ParsedUrlItem[],
    processedCanonical: Set<string>,
    processedDocIds: Set<string>,
    documentTitles: Map<string, string>
  ): void {
    const bracketOnlyUrls = content.match(/\[(https?:\/\/[^\]]+)\]/g) || [];

    for (const bracketUrl of bracketOnlyUrls) {
      const urlMatch = bracketUrl.match(/\[(https?:\/\/[^\]]+)\]/);
      if (urlMatch) {
        const rawUrl = urlMatch[1].trim();
        const canonicalResult = CanonicalUrlGenerator.generateCanonical(rawUrl);

        if (
          this.isRealUrl(canonicalResult.canonicalUrl) &&
          !this.isDuplicate(
            canonicalResult,
            processedCanonical,
            processedDocIds
          )
        ) {
          // Generate title from the line context
          const lines = content.split('\n');
          let title = this.generateTitleFromUrl(canonicalResult.canonicalUrl);

          for (const line of lines) {
            if (line.includes(bracketUrl)) {
              const contextTitle = this.extractTitleFromLine(
                line.replace(bracketUrl, ''),
                canonicalResult.canonicalUrl
              );
              if (contextTitle && contextTitle.length > 3) {
                title = contextTitle;
                break;
              }
            }
          }

          // Track title for consistency (lower priority)
          if (
            canonicalResult.documentId &&
            !documentTitles.has(canonicalResult.documentId)
          ) {
            documentTitles.set(canonicalResult.documentId, title);
          }

          const parsedItem = this.createParsedUrlItem(title, canonicalResult);
          urls.push(parsedItem);
          this.markAsProcessed(
            canonicalResult,
            processedCanonical,
            processedDocIds
          );

          console.log(
            `📝 Priority 3 - Bracket URL: "${title}" → ${canonicalResult.canonicalUrl}`
          );
        }
      }
    }
  }

  /**
   * Extract raw URLs from lines (fallback)
   */
  private extractRawUrls(
    content: string,
    urls: ParsedUrlItem[],
    processedCanonical: Set<string>,
    processedDocIds: Set<string>,
    documentTitles: Map<string, string>
  ): void {
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip lines that were already processed by higher priority patterns
      if (
        /\[([^\]]+)\]\(([^)]+)\)/.test(line) || // Markdown links
        /[^:]+:\s*https?:\/\//.test(line) || // Titled URLs
        /\[https?:\/\/[^\]]+\]/.test(line)
      ) {
        // Bracket URLs
        continue;
      }

      // Look for raw URLs
      const rawUrlPattern = /https?:\/\/[^\s\)]+/g;
      let match;

      while ((match = rawUrlPattern.exec(line)) !== null) {
        const rawUrl = match[0].trim();
        const canonicalResult = CanonicalUrlGenerator.generateCanonical(rawUrl);

        if (
          this.isRealUrl(canonicalResult.canonicalUrl) &&
          !this.isDuplicate(
            canonicalResult,
            processedCanonical,
            processedDocIds
          )
        ) {
          const title =
            this.extractTitleFromLine(line, rawUrl) ||
            this.generateTitleFromUrl(canonicalResult.canonicalUrl);

          // Track title for consistency (lowest priority - only if none exists)
          if (
            canonicalResult.documentId &&
            !documentTitles.has(canonicalResult.documentId)
          ) {
            documentTitles.set(canonicalResult.documentId, title);
          }

          const parsedItem = this.createParsedUrlItem(title, canonicalResult);
          urls.push(parsedItem);
          this.markAsProcessed(
            canonicalResult,
            processedCanonical,
            processedDocIds
          );

          console.log(
            `📝 Priority 4 - Raw URL: "${title}" → ${canonicalResult.canonicalUrl}`
          );
        }
      }
    }
  }

  /**
   * Ensure title consistency for documents with the same ID
   */
  private ensureTitleConsistency(
    urls: ParsedUrlItem[],
    documentTitles: Map<string, string>
  ): void {
    for (const url of urls) {
      if (url.documentId && documentTitles.has(url.documentId)) {
        const bestTitle = documentTitles.get(url.documentId)!;

        // Only update if the current title is significantly worse
        if (this.shouldUpdateTitle(url.title, bestTitle)) {
          console.log(
            `🔄 Title consistency: "${url.title}" → "${bestTitle}" for ${url.documentId}`
          );
          url.title = bestTitle;
        }
      }
    }
  }

  /**
   * Determine if title should be updated based on quality
   */
  private shouldUpdateTitle(
    currentTitle: string,
    candidateTitle: string
  ): boolean {
    // Don't replace if titles are similar
    if (this.areTitlesSimilar(currentTitle, candidateTitle)) {
      return false;
    }

    // Use title quality validator to compare
    const currentScore = TitleQualityValidator.validateTitle(currentTitle);
    const candidateScore = TitleQualityValidator.validateTitle(candidateTitle);

    // Replace if candidate is significantly better (at least 20 points higher)
    return candidateScore.score > currentScore.score + 20;
  }

  /**
   * Check if two titles are similar enough to be considered the same
   */
  private areTitlesSimilar(title1: string, title2: string): boolean {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();
    const norm1 = normalize(title1);
    const norm2 = normalize(title2);

    // Exact match after normalization
    if (norm1 === norm2) return true;

    // Check if one is a subset of the other (handle incomplete parentheses, etc.)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return Math.abs(norm1.length - norm2.length) < 10; // Small difference
    }

    return false;
  }

  /**
   * Extract title from line context, handling various formats
   */
  private extractTitleFromLine(line: string, url: string): string {
    let title = line.replace(url, '').trim();

    // Remove common list markers and separators
    title = title.replace(/^[-*+]\s*/, ''); // Remove bullet points
    title = title.replace(/^\d+\.\s*/, ''); // Remove numbered lists
    title = title.replace(/^>\s*/, ''); // Remove block quote markers
    title = title.replace(/[:\-\—]+\s*$/, ''); // Remove trailing separators
    title = title.replace(/^\s*[:\-\—]+/, ''); // Remove leading separators
    title = title.replace(/\s*--\s*$/, ''); // Remove trailing double dash

    // Clean up brackets and parentheses if they're unmatched
    if (title.includes('[') && !title.includes(']')) {
      title = title.replace(/\[/, '');
    }
    if (title.includes('(') && !title.includes(')')) {
      title = title.replace(/\(/, '');
    }

    // Remove XML/HTML tags that might have leaked through
    title = title.replace(/<[^>]+>/g, '').trim();

    // Check for junk title patterns and reject them
    const junkPatterns = [
      /^[a-z]{1,3}$/, // Very short lowercase (like "li", "rdf")
      /^[A-Z]{1,3}$/, // Very short uppercase
      /^[0-9]+$/, // Only numbers
      /^[\W_]+$/, // Only special characters
      /^(pdf|doc|txt|html|htm)$/i, // File extensions
      /^(undefined|null|NaN|error)$/i, // Programming terms
      /^(rdf:li|rdf|li)$/i, // XML artifacts
    ];

    for (const pattern of junkPatterns) {
      if (pattern.test(title)) {
        // Return empty string to trigger fallback title generation
        return '';
      }
    }

    return title.trim();
  }

  /**
   * Check if URL is a duplicate based on canonical URL or document ID
   */
  private isDuplicate(
    canonicalResult: CanonicalUrlResult,
    processedCanonical: Set<string>,
    processedDocIds: Set<string>
  ): boolean {
    // Check document ID first (strongest deduplication)
    if (
      canonicalResult.documentId &&
      processedDocIds.has(canonicalResult.documentId)
    ) {
      return true;
    }

    // Check canonical URL
    if (processedCanonical.has(canonicalResult.canonicalUrl)) {
      return true;
    }

    return false;
  }

  /**
   * Mark a canonical result as processed for deduplication
   */
  private markAsProcessed(
    canonicalResult: CanonicalUrlResult,
    processedCanonical: Set<string>,
    processedDocIds: Set<string>
  ): void {
    processedCanonical.add(canonicalResult.canonicalUrl);
    if (canonicalResult.documentId) {
      processedDocIds.add(canonicalResult.documentId);
    }
  }

  /**
   * Create a parsed URL item with type detection
   */
  private createParsedUrlItem(
    title: string,
    canonicalResult: CanonicalUrlResult
  ): ParsedUrlItem {
    const url = canonicalResult.originalUrl;
    const canonicalUrl = canonicalResult.canonicalUrl;

    const detectedType = this.detectDocumentTypeFromUrl(canonicalUrl);
    const confidence = this.calculateTypeConfidence(canonicalUrl, detectedType);
    const metadata = this.extractUrlMetadata(canonicalUrl, title);

    // Add canonical data to metadata
    metadata.canonicalData = canonicalResult;

    // Validate and clean the title
    const cleanTitle = this.validateAndCleanTitle(
      title || this.generateTitleFromUrl(canonicalUrl),
      canonicalUrl
    );

    return {
      title: cleanTitle,
      url,
      canonicalUrl,
      documentId: canonicalResult.documentId,
      detectedType,
      confidence,
      metadata,
    };
  }

  /**
   * Validate and clean document titles to prevent junk titles
   */
  private validateAndCleanTitle(title: string, url: string): string {
    if (!title) {
      return this.generateTitleFromUrl(url);
    }

    const originalTitle = title;
    let cleanedTitle = title;

    // Basic cleaning first
    cleanedTitle = cleanedTitle.replace(/<[^>]+>/g, '').trim(); // Remove HTML/XML tags
    cleanedTitle = cleanedTitle.replace(/^(https?:\/\/|www\.|ftp:\/\/)/, ''); // Remove URL prefixes

    // More targeted cleanup - preserve parentheses and meaningful punctuation
    cleanedTitle = cleanedTitle.replace(
      /^[^\w\(\['"]+|[^\w\)\]'".,!?:;]+$/g,
      ''
    ); // Remove junk chars but preserve () [] quotes and end punctuation

    // Fix incomplete parentheses
    cleanedTitle = this.fixIncompleteParentheses(cleanedTitle);

    // Use the comprehensive title quality validator
    const qualityScore = TitleQualityValidator.validateTitle(cleanedTitle);

    if (!qualityScore.isAcceptable) {
      console.warn(
        `⚠️  Title quality failed (score: ${qualityScore.score}): "${originalTitle}" for URL: ${url}`
      );
      console.warn(`   Issues: ${qualityScore.issues.join(', ')}`);

      // Try to get an improved title from the validator
      const improvedTitle = TitleQualityValidator.suggestImprovedTitle(
        cleanedTitle,
        { url }
      );
      if (improvedTitle) {
        const improvedScore =
          TitleQualityValidator.validateTitle(improvedTitle);
        if (improvedScore.isAcceptable) {
          console.log(
            `✨ Using improved title: "${improvedTitle}" (score: ${improvedScore.score})`
          );
          return improvedTitle;
        }
      }

      // Fallback to URL-based generation
      const fallbackTitle = this.generateTitleFromUrl(url);
      console.log(`🔄 Using fallback title: "${fallbackTitle}"`);
      return fallbackTitle;
    }

    if (cleanedTitle !== originalTitle) {
      console.log(
        `✨ Cleaned title: "${originalTitle}" → "${cleanedTitle}" (score: ${qualityScore.score})`
      );
    }

    return cleanedTitle;
  }

  /**
   * Detect document type from URL
   */
  private detectDocumentTypeFromUrl(url: string): DocumentType {
    const lowerUrl = url.toLowerCase();

    // Patent URLs
    if (
      lowerUrl.includes('patents.google.com') ||
      lowerUrl.includes('patents.uspto.gov') ||
      lowerUrl.includes('ops.epo.org') ||
      lowerUrl.includes('patft.uspto.gov') ||
      lowerUrl.includes('worldwide.espacenet.com')
    ) {
      return 'patent';
    }

    // Academic URLs - Enhanced with more platforms
    if (
      lowerUrl.includes('arxiv.org') ||
      lowerUrl.includes('doi.org') ||
      lowerUrl.includes('pubmed') ||
      lowerUrl.includes('ieee.org') ||
      lowerUrl.includes('acm.org') ||
      lowerUrl.includes('nature.com') ||
      lowerUrl.includes('science.org') ||
      lowerUrl.includes('springer.com') ||
      lowerUrl.includes('wiley.com') ||
      lowerUrl.includes('elsevier.com') ||
      lowerUrl.includes('sciencedirect.com') ||
      lowerUrl.includes('researchgate.net') ||
      lowerUrl.includes('scholar.google.com') ||
      lowerUrl.includes('biorxiv.org') ||
      lowerUrl.includes('plos.org') ||
      lowerUrl.includes('mdpi.com')
    ) {
      return 'paper';
    }

    // Context-aware academic paper detection
    // If URL ends in .pdf but appears in academic context, treat as paper
    if (lowerUrl.endsWith('.pdf')) {
      // Check for academic indicators in the URL path or domain
      if (this.hasAcademicIndicators(lowerUrl)) {
        return 'paper';
      }
      // For generic PDFs without academic context, classify as note
      return 'note';
    }

    // Technical documentation and blog platforms
    if (
      lowerUrl.includes('medium.com') ||
      lowerUrl.includes('substack.com') ||
      lowerUrl.includes('github.io') ||
      lowerUrl.includes('gitlab.io') ||
      lowerUrl.includes('readthedocs.io') ||
      lowerUrl.includes('notion.site') ||
      lowerUrl.includes('gitbook.io') ||
      lowerUrl.includes('confluence.') ||
      lowerUrl.includes('gamma.app') ||
      lowerUrl.includes('docs.') ||
      lowerUrl.includes('documentation.')
    ) {
      return 'note';
    }

    // Press/News outlets (check against comprehensive list)
    if (this.isNewsOutlet(lowerUrl)) {
      return 'press-article';
    }

    // Default to URL
    return 'url';
  }

  /**
   * Check if URL is from a news/press outlet
   */
  private isNewsOutlet(url: string): boolean {
    const newsOutlets = [
      'techcrunch.com',
      'theverge.com',
      'cnet.com',
      'engadget.com',
      'arstechnica.com',
      'wired.com',
      'gizmodo.com',
      'androidcentral.com',
      'androidpolice.com',
      '9to5google.com',
      '9to5mac.com',
      'macrumors.com',
      'tomshardware.com',
      'anandtech.com',
      'pcmag.com',
      'digitaltrends.com',
      'gsmarena.com',
      'phonearena.com',
      'androidauthority.com',
      'xda-developers.com',
      'sammobile.com',
      'samsunginsider.com',
      'displaydaily.com',
      'flatpanelshd.com',
      'avforums.com',
      'rtings.com',
      'techhive.com',
      'techradar.com',
      'zdnet.com',
      'venturebeat.com',
      'thenextweb.com',
      'mashable.com',
      'fastcompany.com',
      'businessinsider.com',
      'forbes.com',
      'reuters.com',
      'bloomberg.com',
      'wsj.com',
      'nytimes.com',
      'businesswire.com',
      'prnewswire.com',
      'globenewswire.com',
      'marketwatch.com',
      'news.samsung.com',
      'samsung.com',
      'zte.com.cn',
      'zte.com',
      'lg.com',
      'newsroom.lg.com',
      'sony.com',
      'news.sony.com',
      'apple.com/newsroom',
      'blog.google',
      'news.microsoft.com',
    ];

    return newsOutlets.some(outlet => url.includes(outlet));
  }

  /**
   * Check if URL has academic indicators for better paper classification
   */
  private hasAcademicIndicators(url: string): boolean {
    const lowerUrl = url.toLowerCase();

    // Academic file paths/directories
    const academicPaths = [
      '/paper',
      '/papers',
      '/publication',
      '/publications',
      '/research',
      '/preprint',
      '/preprints',
      '/manuscript',
      '/thesis',
      '/dissertation',
      '/assets/',
      '/documents/',
      '/pdfs/',
      '/files/',
      '/archive/',
      '/content/',
    ];

    // Academic terms in URL path or filename
    const academicTerms = [
      'arxiv',
      'paper',
      'publication',
      'research',
      'study',
      'analysis',
      'survey',
      'review',
      'proceedings',
      'conference',
      'journal',
      'academic',
      'scholar',
      'thesis',
      'dissertation',
      'preprint',
      'manuscript',
      'technical',
      'report',
    ];

    // University/research institution domains
    const academicDomains = [
      '.edu',
      '.ac.uk',
      '.ac.in',
      '.edu.au',
      '.edu.cn',
      'university',
      'institut',
      'college',
      'research',
    ];

    // Check for academic indicators
    return (
      academicPaths.some(path => lowerUrl.includes(path)) ||
      academicTerms.some(term => lowerUrl.includes(term)) ||
      academicDomains.some(domain => lowerUrl.includes(domain))
    );
  }

  /**
   * Extract metadata from URL and title
   */
  private extractUrlMetadata(
    url: string,
    title: string
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Patent detection
    if (url.includes('patents.google.com')) {
      metadata.isPatent = true;
      metadata.source = 'Google Patents';

      // Extract patent number from URL
      const patentMatch = url.match(/\/patent\/([A-Z0-9]+)/);
      if (patentMatch) {
        metadata.patentNumber = patentMatch[1];
      }

      // Extract additional context from title for patents
      if (title && title.includes('--')) {
        const parts = title.split('--').map(p => p.trim());
        if (parts.length >= 2) {
          metadata.description = parts[1];
          metadata.patentTitle = parts[0];
        }
      }
    }

    // DOI detection
    if (url.includes('doi.org')) {
      metadata.isDoi = true;
      metadata.source = 'DOI';

      const doiMatch = url.match(/doi\.org\/(.+)$/);
      if (doiMatch) {
        // Clean up malformed DOI strings with XML tags before storing
        const rawDoi = doiMatch[1];
        const cleanDoi = sanitizeDOI(rawDoi);
        if (cleanDoi) {
          metadata.doi = cleanDoi;
        }
      }
    }

    // arXiv detection
    if (url.includes('arxiv.org')) {
      metadata.isArxiv = true;
      metadata.source = 'arXiv';

      const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/);
      if (arxivMatch) {
        const arxivId = arxivMatch[1];
        metadata.arxivId = arxivId;

        // Mark this for enhanced ArXiv API processing
        metadata.requiresArxivApi = true;

        // Convert PDF URLs to abs URLs for better metadata extraction
        if (url.includes('/pdf/')) {
          metadata.arxivAbsUrl = url
            .replace('/pdf/', '/abs/')
            .replace('.pdf', '');
        } else {
          metadata.arxivAbsUrl = url;
        }

        // Create canonical URL for deduplication
        metadata.canonicalUrl = `https://arxiv.org/abs/${arxivId}`;
      }

      // Extract paper title from brackets if present
      const bracketMatch = title.match(/\[([^\]]+)\]/);
      if (bracketMatch) {
        metadata.paperTitle = bracketMatch[1];
      }
    }

    // Technical blog platforms
    if (url.includes('gamma.app')) {
      metadata.source = 'Gamma';
      metadata.platform = 'Gamma App';
    }

    if (url.includes('medium.com')) {
      metadata.source = 'Medium';
      metadata.platform = 'Medium';
    }

    if (url.includes('github.com') || url.includes('github.io')) {
      metadata.source = 'GitHub';
      metadata.platform = 'GitHub';
    }

    // News outlets
    if (this.isNewsOutlet(url)) {
      metadata.source = 'Press';
      metadata.platform = new URL(url).hostname.replace('www.', '');

      // Extract publication context
      if (title.includes(':')) {
        const colonIndex = title.indexOf(':');
        metadata.publisher = title.substring(0, colonIndex).trim();
        metadata.articleTitle = title.substring(colonIndex + 1).trim();
      }
    }

    // Extract description from title (enhanced)
    if (title && title.length > 5) {
      // Clean up the title for description
      let description = title;

      // Remove URL-specific prefixes
      description = description.replace(
        /^(Patent |arXiv:|DOI: |GitHub: |Medium: )/,
        ''
      );

      // Extract meaningful description
      if (description.includes('--')) {
        description = description.split('--')[1].trim();
      } else if (description.includes(' - ')) {
        description = description.split(' - ')[1].trim();
      }

      // Only set description if it's meaningful
      if (description.length > 10 && description !== title) {
        metadata.description = description;
      } else if (title.length > 10) {
        metadata.description = title;
      }
    }

    // Add URL for reference
    metadata.originalUrl = url;

    return metadata;
  }

  /**
   * Calculate confidence for type detection
   */
  private calculateTypeConfidence(url: string, type: DocumentType): number {
    const lowerUrl = url.toLowerCase();

    switch (type) {
      case 'patent':
        return lowerUrl.includes('patents.google.com') ? 0.95 : 0.8;
      case 'paper':
        if (lowerUrl.includes('arxiv.org') || lowerUrl.includes('doi.org'))
          return 0.95;
        if (lowerUrl.includes('ieee.org') || lowerUrl.includes('acm.org'))
          return 0.9;
        return 0.7;
      case 'pdf':
        return lowerUrl.endsWith('.pdf') ? 0.9 : 0.6;
      case 'press-article':
        return this.isNewsOutlet(lowerUrl) ? 0.85 : 0.6;
      default:
        return 0.6;
    }
  }

  /**
   * Detect overall list type based on URLs
   */
  private detectListType(
    urls: ParsedUrlItem[],
    fileName?: string
  ): 'patent' | 'article' | 'paper' | 'mixed' | 'unknown' {
    if (urls.length === 0) return 'unknown';

    // Check filename hints
    if (fileName) {
      const lowerFileName = fileName.toLowerCase();
      if (lowerFileName.includes('patent')) return 'patent';
      if (lowerFileName.includes('paper')) return 'paper';
      if (lowerFileName.includes('article')) return 'article';
    }

    // Analyze URL types
    const typeCount = urls.reduce(
      (acc, url) => {
        acc[url.detectedType] = (acc[url.detectedType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const sortedTypes = Object.entries(typeCount).sort(([, a], [, b]) => b - a);

    const dominantType = sortedTypes[0][0] as DocumentType;
    const dominantCount = sortedTypes[0][1];

    // If one type dominates (>70%), use that type
    if (dominantCount / urls.length > 0.7) {
      switch (dominantType) {
        case 'patent':
          return 'patent';
        case 'paper':
          return 'paper';
        case 'press-article':
          return 'article';
        default:
          return 'mixed';
      }
    }

    return 'mixed';
  }

  /**
   * Extract list title from content
   */
  private extractListTitle(content: string, fileName?: string): string {
    // Try to extract from first line if it looks like a title
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length > 0) {
      const firstLine = lines[0].trim();

      // Check if first line is a markdown header
      if (firstLine.startsWith('#')) {
        return firstLine.replace(/^#+\s*/, '');
      }

      // Check if first line looks like a title (doesn't contain URLs)
      if (
        !firstLine.includes('http') &&
        firstLine.length > 10 &&
        firstLine.length < 100
      ) {
        return firstLine;
      }
    }

    // Fallback to filename
    if (fileName) {
      return fileName.replace(/\.[^/.]+$/, '').replace(/-/g, ' ');
    }

    return 'Document List';
  }

  /**
   * Calculate overall confidence for URL list detection
   */
  private calculateConfidence(content: string, urls: ParsedUrlItem[]): number {
    let score = 0;

    // URL count factor - more URLs = higher confidence
    if (urls.length >= 10) score += 0.5;
    else if (urls.length >= 5) score += 0.4;
    else if (urls.length >= 3) score += 0.3;
    else if (urls.length >= 2) score += 0.2;
    else if (urls.length >= 1) score += 0.1;

    // List structure indicators
    const structureIndicators = [
      { pattern: /^[\s]*[-*+]\s+/m, points: 0.2 }, // Bullet points
      { pattern: /^\s*\d+\.\s+/m, points: 0.2 }, // Numbered lists
      { pattern: /^#{1,6}\s+/m, points: 0.15 }, // Headers
      { pattern: /^[\s]*>\s+/m, points: 0.1 }, // Block quotes
    ];

    for (const indicator of structureIndicators) {
      if (indicator.pattern.test(content)) {
        score += indicator.points;
      }
    }

    // Markdown link format preference
    const markdownLinkCount = (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [])
      .length;
    const linkFormatRatio = markdownLinkCount / Math.max(urls.length, 1);
    if (linkFormatRatio >= 0.8) score += 0.2;
    else if (linkFormatRatio >= 0.5) score += 0.15;
    else if (linkFormatRatio >= 0.2) score += 0.1;

    // Consistent URL types boost confidence
    const typeVariety = new Set(urls.map(u => u.detectedType)).size;
    if (typeVariety === 1)
      score += 0.15; // All same type
    else if (typeVariety <= 2)
      score += 0.1; // Very consistent
    else if (typeVariety <= 3) score += 0.05; // Somewhat consistent

    // High-confidence URL types
    const highConfidenceTypes = ['patent', 'paper', 'pdf'];
    const highConfidenceCount = urls.filter(
      u => highConfidenceTypes.includes(u.detectedType) && u.confidence >= 0.8
    ).length;

    if (highConfidenceCount >= urls.length * 0.8) score += 0.2;
    else if (highConfidenceCount >= urls.length * 0.5) score += 0.1;

    // Content-to-URL ratio (clean lists have high URL density)
    const contentWords = content
      .split(/\s+/)
      .filter(
        word => !word.startsWith('http') && word.trim().length > 0
      ).length;
    const urlDensity = urls.length / Math.max(contentWords, 1);

    if (urlDensity > 0.5)
      score += 0.15; // Very URL-heavy
    else if (urlDensity > 0.2)
      score += 0.1; // URL-heavy
    else if (urlDensity > 0.1) score += 0.05; // Moderate URLs

    // Penalty for very long content without structure (likely not a list)
    if (
      content.length > 2000 &&
      !/^[\s]*[-*+]|^\s*\d+\.|^#{1,6}/m.test(content)
    ) {
      score -= 0.2;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Fix incomplete parentheses in titles
   */
  private fixIncompleteParentheses(title: string): string {
    if (!title) return title;

    // Count opening and closing parentheses
    const openParens = (title.match(/\(/g) || []).length;
    const closeParens = (title.match(/\)/g) || []).length;

    // If we have more opening than closing, add closing parentheses
    if (openParens > closeParens) {
      const missingClose = openParens - closeParens;
      title += ')'.repeat(missingClose);
    }

    // If we have more closing than opening, remove extra closing at the end
    if (closeParens > openParens) {
      const extraClose = closeParens - openParens;
      for (let i = 0; i < extraClose; i++) {
        title = title.replace(/\)$/, '');
      }
    }

    return title;
  }

  /**
   * Legacy method - now redirects to canonical URL generator
   * @deprecated Use CanonicalUrlGenerator.generateCanonical() instead
   */
  private normalizeUrl(url: string): string {
    return CanonicalUrlGenerator.generateCanonical(url).canonicalUrl;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      new URL(normalizedUrl);
      return normalizedUrl.startsWith('http') && normalizedUrl.length > 10;
    } catch {
      return false;
    }
  }

  /**
   * Generate title from URL when none provided
   */
  private generateTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');

      // Patent URLs
      if (url.includes('patents.google.com')) {
        const patentMatch = url.match(/\/patent\/([A-Z0-9]+)/);
        return patentMatch
          ? `Patent ${patentMatch[1]}`
          : `Patent from ${hostname}`;
      }

      // arXiv URLs
      if (url.includes('arxiv.org')) {
        const arxivMatch = url.match(
          /arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/
        );
        return arxivMatch ? `arXiv:${arxivMatch[1]}` : `Paper from arXiv`;
      }

      // DOI URLs
      if (url.includes('doi.org')) {
        const doiMatch = url.match(/doi\.org\/(.+)$/);
        if (doiMatch) {
          const rawDoi = doiMatch[1];
          // Clean up malformed DOI strings with XML tags using centralized utility
          const cleanDoi = sanitizeDOI(rawDoi);
          if (cleanDoi && cleanDoi !== rawDoi) {
            console.warn(
              `⚠️  Cleaned malformed DOI: "${rawDoi}" → "${cleanDoi}"`
            );
          }
          return cleanDoi ? `DOI: ${cleanDoi}` : `Academic Paper`;
        }
        return `Document from ${hostname}`;
      }

      // Technical platforms with better naming
      if (url.includes('gamma.app')) {
        const pathMatch = url.match(/\/docs\/([^\/\?]+)/);
        return pathMatch
          ? `Gamma Doc: ${pathMatch[1].replace(/-/g, ' ')}`
          : `Gamma Document`;
      }

      if (url.includes('medium.com')) {
        const pathMatch = url.match(/\/([^\/]+)$/);
        return pathMatch
          ? `Medium: ${pathMatch[1].replace(/-/g, ' ')}`
          : `Medium Article`;
      }

      if (url.includes('github.com') || url.includes('github.io')) {
        const pathMatch = url.match(
          /github\.(?:com|io)\/([^\/]+)(?:\/([^\/]+))?/
        );
        return pathMatch
          ? `GitHub: ${pathMatch[1]}${pathMatch[2] ? `/${pathMatch[2]}` : ''}`
          : `GitHub Document`;
      }

      // News outlets - extract article title hints from URL path
      if (this.isNewsOutlet(url)) {
        // Multi-strategy approach for extracting meaningful titles

        // Strategy 1: Look for URL segments with relaxed constraints
        const pathSegments = urlObj.pathname.split('/').filter(
          seg =>
            seg &&
            seg.length > 5 && // Relaxed from 10 to 5 characters
            !seg.match(
              /^(news|articles?|posts?|blog|opinion|sports|tech|business|[0-9]{4}|[0-9]{1,2})$/i
            ) &&
            !seg.match(/^[0-9]+$/) // Exclude pure numbers
        );

        // Strategy 2: Prioritize segments with word separators (hyphens, underscores)
        const slugSegments = pathSegments.filter(
          seg => seg.includes('-') || seg.includes('_')
        );
        const candidateSegments =
          slugSegments.length > 0 ? slugSegments : pathSegments;

        if (candidateSegments.length > 0) {
          // Use the longest meaningful segment
          const articleSlug = candidateSegments.reduce((longest, current) =>
            current.length > longest.length ? current : longest
          );

          const titleHint = articleSlug
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .substring(0, 80)
            .trim();

          // Relaxed validation: accept titles >= 8 characters that aren't just the platform name
          const platformName = hostname.split('.')[0].toLowerCase();
          if (
            titleHint.length >= 8 &&
            !titleHint.toLowerCase().includes(platformName)
          ) {
            return titleHint;
          }
        }

        // Strategy 3: Check for query parameters that might contain titles
        const queryTitle = this.extractTitleFromQueryParams(urlObj);
        if (queryTitle) {
          return queryTitle;
        }

        // Strategy 4: Look for fragment identifiers
        if (urlObj.hash && urlObj.hash.length > 3) {
          const fragmentTitle = urlObj.hash
            .substring(1)
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .substring(0, 60);
          if (fragmentTitle.length >= 8) {
            return fragmentTitle;
          }
        }

        // Strategy 5: Contextual fallback with date/time for uniqueness
        const currentDate = new Date().toISOString().split('T')[0];
        const platformCapitalized =
          hostname.split('.')[0].charAt(0).toUpperCase() +
          hostname.split('.')[0].slice(1);
        return `${platformCapitalized} Article (${currentDate})`;
      }

      // Default
      return `Document from ${hostname}`;
    } catch {
      return 'Untitled Document';
    }
  }

  /**
   * Extract meaningful title from URL query parameters
   */
  private extractTitleFromQueryParams(urlObj: URL): string | null {
    const titleParams = [
      'title',
      'headline',
      'subject',
      'name',
      'article',
      'story',
    ];

    for (const param of titleParams) {
      const value = urlObj.searchParams.get(param);
      if (value && value.length > 8) {
        const cleanTitle = value
          .replace(/[+%]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .trim()
          .substring(0, 80);

        if (cleanTitle.length >= 8) {
          return cleanTitle;
        }
      }
    }

    return null;
  }
}

// Export singleton instance
export const urlListParser = new UrlListParser();
