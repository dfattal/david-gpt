/**
 * Unified Document Analysis Service
 * 
 * Consolidates document type detection, academic paper detection, 
 * and content analysis logic that was scattered across multiple files.
 * Enhanced with URL list detection for batch processing.
 */

import type { DocumentType } from './types';
import { urlListParser, type UrlListParseResult } from './url-list-parser';

// =======================
// Document Analysis Types
// =======================

export interface DocumentAnalysis {
  documentType: DocumentType;
  confidence: number;
  isAcademic: boolean;
  academicConfidence: number;
  authority: string;
  metadata: {
    hasStructuredContent?: boolean;
    estimatedTokens?: number;
    language?: string;
    hasImages?: boolean;
    hasTables?: boolean;
    hasEquations?: boolean;
    hasReferences?: boolean;
  };
  characteristics: string[];
  urlListAnalysis?: UrlListParseResult;
}

export interface AnalysisInput {
  content?: string;
  url?: string;
  patentUrl?: string;
  doi?: string;
  fileName?: string;
  fileBuffer?: Buffer;
  extractedMetadata?: Record<string, any>;
}

// =======================
// Document Type Detection
// =======================

export class UnifiedDocumentAnalyzer {
  
  /**
   * Analyze document and determine its type, academic nature, and other characteristics
   */
  async analyzeDocument(input: AnalysisInput): Promise<DocumentAnalysis> {
    // Check if this is a URL list first
    let urlListAnalysis: UrlListParseResult | undefined;
    let documentType = this.detectDocumentType(input);
    
    // If it's a markdown file with content, check for URL lists
    if (input.content && input.fileName?.endsWith('.md')) {
      urlListAnalysis = urlListParser.parseMarkdownContent(input.content, input.fileName);
      
      // If it's a URL list with high confidence, adjust document type
      if (urlListAnalysis.isUrlList && urlListAnalysis.confidence > 0.7) {
        documentType = 'url-list' as DocumentType; // We'll need to add this type
      }
    }
    
    const isAcademic = this.detectAcademicDocument(input);
    const academicConfidence = this.calculateAcademicConfidence(input);
    const authority = this.determineAuthority(input);
    const metadata = await this.extractMetadata(input);
    const characteristics = this.identifyCharacteristics(input, urlListAnalysis);
    
    return {
      documentType,
      confidence: this.calculateTypeConfidence(input, documentType),
      isAcademic,
      academicConfidence,
      authority,
      metadata,
      characteristics,
      urlListAnalysis
    };
  }

  /**
   * Detect document type based on various indicators
   */
  private detectDocumentType(input: AnalysisInput): DocumentType {
    // Patent indicators
    if (input.patentUrl || input.extractedMetadata?.patentNumber) {
      return 'patent';
    }

    // DOI indicates academic paper
    if (input.doi) {
      return 'paper';
    }

    // Content-based detection for technical documents
    if (input.content) {
      const contentAnalysis = this.analyzeContentType(input.content, input.fileName);
      if (contentAnalysis.documentType !== 'note') {
        return contentAnalysis.documentType;
      }
    }

    // URL-based detection
    if (input.url) {
      const url = input.url.toLowerCase();
      
      // Patent URLs
      if (url.includes('patents.google.com') || 
          url.includes('uspto.gov') || 
          url.includes('patentscope.wipo.int')) {
        return 'patent';
      }

      // Academic URLs
      if (this.isAcademicUrl(url)) {
        return 'paper';
      }

      return 'url';
    }

    // File-based detection
    if (input.fileBuffer) {
      if (input.fileName?.toLowerCase().endsWith('.pdf')) {
        return 'pdf';
      }
      // Could add other file type detection here
      return 'pdf';
    }

    // Content-based fallback
    if (input.content) {
      const contentAnalysis = this.analyzeContentType(input.content, input.fileName);
      return contentAnalysis.documentType;
    }

    // Default to note for text content
    return 'note';
  }

  /**
   * Detect if document is academic paper
   */
  private detectAcademicDocument(input: AnalysisInput): boolean {
    // Explicit academic identifiers
    if (input.extractedMetadata?.doi || 
        input.extractedMetadata?.arxivId || 
        input.extractedMetadata?.pubmedId) {
      return true;
    }

    // DOI in input
    if (input.doi) {
      return true;
    }

    // URL patterns for academic sources
    if (input.url && this.isAcademicUrl(input.url)) {
      return true;
    }

    // Metadata academic indicators
    if (input.extractedMetadata?.venue || 
        input.extractedMetadata?.journal || 
        input.extractedMetadata?.conference) {
      return true;
    }

    // Content-based detection
    if (input.content) {
      return this.hasAcademicContentStructure(input.content);
    }

    // GROBID structured data indicates academic paper
    if (input.extractedMetadata?.structuredData?.authors && 
        input.extractedMetadata?.structuredData?.abstract) {
      return true;
    }

    return false;
  }

  /**
   * Calculate confidence score for academic classification
   */
  private calculateAcademicConfidence(input: AnalysisInput): number {
    let score = 0;
    let maxScore = 0;

    // Explicit identifiers (high confidence)
    maxScore += 30;
    if (input.extractedMetadata?.doi || input.doi) score += 30;
    else if (input.extractedMetadata?.arxivId) score += 25;
    else if (input.extractedMetadata?.pubmedId) score += 25;

    // URL source (medium confidence)
    maxScore += 20;
    if (input.url) {
      const academicScore = this.calculateAcademicUrlScore(input.url);
      score += academicScore * 20;
    }

    // Structured metadata (medium confidence)
    maxScore += 20;
    if (input.extractedMetadata?.venue) score += 10;
    if (input.extractedMetadata?.journal) score += 10;
    if (input.extractedMetadata?.conference) score += 8;
    if (input.extractedMetadata?.authors?.length > 0) score += 5;

    // Content structure (lower confidence, but still valuable)
    maxScore += 30;
    if (input.content) {
      score += this.calculateContentAcademicScore(input.content);
    }

    return Math.min(1.0, score / maxScore);
  }

  /**
   * Determine document authority/source
   */
  private determineAuthority(input: AnalysisInput): string {
    if (input.url) {
      const url = input.url.toLowerCase();
      
      // High authority academic sources
      if (url.includes('arxiv.org')) return 'arXiv';
      if (url.includes('pubmed') || url.includes('ncbi.nlm.nih.gov')) return 'PubMed';
      if (url.includes('ieee.org')) return 'IEEE';
      if (url.includes('acm.org')) return 'ACM';
      if (url.includes('springer.com')) return 'Springer';
      if (url.includes('sciencedirect.com')) return 'ScienceDirect';
      if (url.includes('nature.com')) return 'Nature';
      if (url.includes('science.org')) return 'Science';
      if (url.includes('patents.google.com')) return 'Google Patents';
      if (url.includes('uspto.gov')) return 'USPTO';
    }

    if (input.doi) return 'Crossref';
    if (input.patentUrl) return 'Patent Authority';
    
    return 'GROBID'; // Default for PDF processing
  }

  /**
   * Extract document metadata
   */
  private async extractMetadata(input: AnalysisInput) {
    const metadata: any = {};

    if (input.content) {
      metadata.estimatedTokens = this.estimateTokens(input.content);
      metadata.hasReferences = this.hasReferences(input.content);
      metadata.hasTables = this.hasTables(input.content);
      metadata.hasEquations = this.hasEquations(input.content);
      metadata.language = this.detectLanguage(input.content);
    }

    if (input.extractedMetadata?.structuredData) {
      metadata.hasStructuredContent = true;
    }

    if (input.fileBuffer) {
      // Could add image/table detection for PDFs here
      metadata.hasImages = false; // Placeholder
    }

    return metadata;
  }

  /**
   * Identify document characteristics
   */
  private identifyCharacteristics(input: AnalysisInput, urlListAnalysis?: UrlListParseResult): string[] {
    const characteristics: string[] = [];

    if (input.extractedMetadata?.doi || input.doi) {
      characteristics.push('peer-reviewed');
    }

    if (input.url && this.isHighAuthoritySource(input.url)) {
      characteristics.push('high-authority');
    }

    // URL list specific characteristics
    if (urlListAnalysis?.isUrlList) {
      characteristics.push('url-list');
      characteristics.push(`${urlListAnalysis.listType}-list`);
      
      if (urlListAnalysis.urls.length >= 10) {
        characteristics.push('large-collection');
      } else if (urlListAnalysis.urls.length >= 5) {
        characteristics.push('medium-collection');
      }
    }

    if (input.content) {
      if (this.hasComplexStructure(input.content)) {
        characteristics.push('structured');
      }
      
      if (this.hasTechnicalContent(input.content)) {
        characteristics.push('technical');
      }

      if (this.hasReferences(input.content)) {
        characteristics.push('cited');
      }
    }

    return characteristics;
  }

  // =======================
  // Helper Methods
  // =======================

  private isAcademicUrl(url: string): boolean {
    const academicDomains = [
      'arxiv.org', 'ncbi.nlm.nih.gov', 'pubmed', 'ieee.org', 'acm.org',
      'springer.com', 'sciencedirect.com', 'nature.com', 'science.org',
      'plos.org', 'biorxiv.org', 'researchgate.net', 'scholar.google'
    ];
    
    return academicDomains.some(domain => url.includes(domain));
  }

  private calculateAcademicUrlScore(url: string): number {
    const highAuthority = ['arxiv.org', 'nature.com', 'science.org', 'ieee.org'];
    const mediumAuthority = ['pubmed', 'springer.com', 'sciencedirect.com'];
    const lowAuthority = ['researchgate.net', 'scholar.google'];

    if (highAuthority.some(domain => url.includes(domain))) return 1.0;
    if (mediumAuthority.some(domain => url.includes(domain))) return 0.8;
    if (lowAuthority.some(domain => url.includes(domain))) return 0.6;
    return 0.0;
  }

  private hasAcademicContentStructure(content: string): boolean {
    const academicPatterns = [
      /abstract[\s\n]*:?[\s\n]/i,
      /introduction[\s\n]*1\.?[\s\n]/i,
      /(?:references|bibliography)[\s\n]*$/i,
      /keywords[\s\n]*:?[\s\n]/i,
      /(?:figure|fig\.)\s*\d+/i,
      /(?:table|tab\.)\s*\d+/i,
      /doi[\s\n]*:?[\s\n]*\d{2}\.\d{4}/i
    ];

    const patternMatches = academicPatterns.filter(pattern => pattern.test(content)).length;
    return patternMatches >= 3;
  }

  private calculateContentAcademicScore(content: string): number {
    let score = 0;
    
    // Academic structure patterns (up to 15 points)
    if (/abstract[\s\n]*:?[\s\n]/i.test(content)) score += 5;
    if (/(?:references|bibliography)/i.test(content)) score += 5;
    if (/(?:figure|fig\.)\s*\d+/i.test(content)) score += 2;
    if (/(?:table|tab\.)\s*\d+/i.test(content)) score += 2;
    if (/doi[\s\n]*:?[\s\n]*\d{2}\.\d{4}/i.test(content)) score += 3;

    // Citation patterns (up to 10 points)
    const citationMatches = content.match(/\[\d+\]|\(\d{4}\)|\w+\s+et\s+al\./gi) || [];
    score += Math.min(5, citationMatches.length);

    // Technical vocabulary (up to 5 points)
    const technicalTerms = ['hypothesis', 'methodology', 'analysis', 'conclusion', 'statistical'];
    const technicalMatches = technicalTerms.filter(term => 
      new RegExp(term, 'i').test(content)
    ).length;
    score += Math.min(5, technicalMatches);

    return score;
  }

  private calculateTypeConfidence(input: AnalysisInput, type: DocumentType): number {
    switch (type) {
      case 'patent':
        return (input.patentUrl || input.extractedMetadata?.patentNumber) ? 0.95 : 0.7;
      case 'paper':
        return input.doi ? 0.95 : 0.8;
      case 'pdf':
        return input.fileBuffer ? 0.9 : 0.6;
      case 'url':
        return input.url ? 0.8 : 0.5;
      default:
        return 0.6;
    }
  }

  private isHighAuthoritySource(url: string): boolean {
    const highAuthoritySources = [
      'nature.com', 'science.org', 'ieee.org', 'acm.org',
      'arxiv.org', 'patents.google.com', 'uspto.gov'
    ];
    return highAuthoritySources.some(domain => url.includes(domain));
  }

  private hasComplexStructure(content: string): boolean {
    const structureIndicators = [
      /\n\s*\d+\.?\s+/, // Numbered sections
      /\n\s*[A-Z][A-Z\s]+\n/, // Section headers
      /\n\s*Abstract\s*\n/i,
      /\n\s*Introduction\s*\n/i,
      /\n\s*Conclusion\s*\n/i
    ];
    
    return structureIndicators.some(pattern => pattern.test(content));
  }

  private hasTechnicalContent(content: string): boolean {
    const technicalIndicators = [
      /\b\d+\.\d+%\b/, // Percentages
      /\bp\s*[<>=]\s*0\.\d+/i, // P-values
      /\b(?:algorithm|method|approach|technique)\b/i,
      /\b(?:equation|formula|calculation)\b/i
    ];
    
    return technicalIndicators.some(pattern => pattern.test(content));
  }

  private hasReferences(content: string): boolean {
    return /(?:references|bibliography)/i.test(content) ||
           /\[\d+\]/.test(content) ||
           /\(\d{4}\)/.test(content);
  }

  private hasTables(content: string): boolean {
    return /(?:table|tab\.)\s*\d+/i.test(content) ||
           /\|.*\|.*\|/.test(content);
  }

  private hasEquations(content: string): boolean {
    return /(?:equation|eq\.)\s*\d+/i.test(content) ||
           /\$.*\$/.test(content) ||
           /\\[a-zA-Z]+/.test(content);
  }

  /**
   * Analyze content type for better document classification
   */
  private analyzeContentType(content: string, fileName?: string): { documentType: DocumentType; confidence: number; characteristics: string[] } {
    const characteristics: string[] = [];
    let scores = {
      'press-article': 0,
      'note': 0,
      'paper': 0,
      'patent': 0,
    };

    // Technical FAQ Detection
    const faqScore = this.calculateFAQScore(content);
    if (faqScore > 0.7) {
      characteristics.push('technical-faq');
      scores['note'] += 0.6;
    }

    // Technical Documentation Detection
    const technicalScore = this.calculateTechnicalScore(content);
    if (technicalScore > 0.5) {
      characteristics.push('technical-documentation');
      scores['note'] += 0.4;
    }

    // Press Article Detection
    const pressScore = this.calculatePressScore(content);
    if (pressScore > 0.6) {
      characteristics.push('press-coverage');
      scores['press-article'] += 0.8;
    }

    // Academic Paper Detection
    const academicScore = this.calculateAcademicScore(content);
    if (academicScore > 0.6) {
      characteristics.push('academic-paper');
      scores['paper'] += 0.7;
    }

    // Patent Detection
    const patentScore = this.calculatePatentScore(content);
    if (patentScore > 0.6) {
      characteristics.push('patent-document');
      scores['patent'] += 0.8;
    }

    // File name analysis
    if (fileName) {
      const lowerFileName = fileName.toLowerCase();
      if (lowerFileName.includes('faq') || lowerFileName.includes('FAQ')) {
        scores['note'] += 0.3;
        characteristics.push('faq-filename');
      }
      if (lowerFileName.includes('spec') || lowerFileName.includes('technical')) {
        scores['note'] += 0.2;
        characteristics.push('technical-filename');
      }
    }

    // Find the highest scoring type
    const maxScore = Math.max(...Object.values(scores));
    const bestType = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as DocumentType || 'note';

    return {
      documentType: bestType,
      confidence: maxScore,
      characteristics
    };
  }

  /**
   * Calculate FAQ structure score
   */
  private calculateFAQScore(content: string): number {
    let score = 0;

    // FAQ structure patterns
    const faqPatterns = [
      /(?:^|\n)#{1,6}\s*(?:What|How|Why|When|Where|Which)\s+[^?\n]*\??\s*$/gmi,
      /(?:^|\n)\*\*Q(?:uestion)?:?\*\*\s+/gmi,
      /(?:^|\n)Q:?\s+/gmi,
      /(?:^|\n)\*\*A(?:nswer)?:?\*\*\s+/gmi,
      /(?:^|\n)A:?\s+/gmi,
    ];

    let totalMatches = 0;
    for (const pattern of faqPatterns) {
      const matches = content.match(pattern) || [];
      totalMatches += matches.length;
    }

    // Score based on FAQ pattern density
    const words = content.split(/\s+/).length;
    const faqDensity = totalMatches / (words / 100); // per 100 words
    score += Math.min(faqDensity * 0.2, 0.6);

    // Check for FAQ in title or early content
    if (/(?:frequently\s+asked\s+questions|FAQ)/i.test(content.slice(0, 500))) {
      score += 0.3;
    }

    // Check for Q&A structure prevalence
    const qMatches = (content.match(/(?:^|\n)[Q][:.]?\s+/gmi) || []).length;
    const aMatches = (content.match(/(?:^|\n)[A][:.]?\s+/gmi) || []).length;
    if (qMatches >= 3 && aMatches >= 3 && Math.abs(qMatches - aMatches) <= 2) {
      score += 0.4;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate technical documentation score
   */
  private calculateTechnicalScore(content: string): number {
    let score = 0;

    // Technical terminology density
    const technicalTerms = [
      /\b(?:API|SDK|algorithm|protocol|framework|architecture)\b/gi,
      /\b(?:configuration|calibration|optimization|implementation)\b/gi,
      /\b(?:specification|parameter|variable|function|method)\b/gi,
      /\b(?:hardware|software|component|module|system)\b/gi,
      /\b(?:DLB|LCD|OLED|3D\s+Cell|LC\s+lens|lightfield)\b/gi,
    ];

    let technicalMatches = 0;
    for (const pattern of technicalTerms) {
      technicalMatches += (content.match(pattern) || []).length;
    }

    const words = content.split(/\s+/).length;
    const technicalDensity = technicalMatches / (words / 100);
    score += Math.min(technicalDensity * 0.05, 0.4);

    // Technical measurements and specifications
    const measurementPatterns = [
      /\b\d+(?:\.\d+)?%\b/g, // Percentages
      /\b\d+\s*(?:fps|Hz|MHz|GHz)\b/g, // Frequencies
      /\b\d+\s*(?:mm|cm|inch|pixel|ms|µs)\b/g, // Measurements
      /\b~\d+%\s+transmission\b/g, // Technical specs
    ];

    let measurementMatches = 0;
    for (const pattern of measurementPatterns) {
      measurementMatches += (content.match(pattern) || []).length;
    }

    if (measurementMatches >= 5) score += 0.3;
    else if (measurementMatches >= 2) score += 0.1;

    // Code or technical format indicators
    const formatIndicators = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`]+`/g, // Inline code
      /\b[A-Z_]{3,}\b/g, // Constants/enums
    ];

    for (const pattern of formatIndicators) {
      if (pattern.test(content)) {
        score += 0.1;
        break;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate press article score
   */
  private calculatePressScore(content: string): number {
    let score = 0;

    // Press article indicators
    const pressPatterns = [
      /\b(?:announced|revealed|unveiled|launched|released)\b/gi,
      /\b(?:CEO|CTO|spokesperson|representative|executive)\b/gi,
      /\b(?:company|corporation|startup|firm|business)\b/gi,
      /\b(?:product|device|technology|innovation|breakthrough)\b/gi,
      /\b(?:market|industry|sector|competition|competitor)\b/gi,
    ];

    let pressMatches = 0;
    for (const pattern of pressPatterns) {
      pressMatches += (content.match(pattern) || []).length;
    }

    const words = content.split(/\s+/).length;
    const pressDensity = pressMatches / (words / 100);
    score += Math.min(pressDensity * 0.02, 0.4);

    // Quote patterns
    const quoteMatches = (content.match(/"[^"]{20,}"/g) || []).length;
    if (quoteMatches >= 2) score += 0.3;

    // Date and attribution patterns
    if (/\b(?:today|yesterday|this\s+week|announced\s+(?:today|yesterday))\b/i.test(content)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate academic paper score
   */
  private calculateAcademicScore(content: string): number {
    let score = 0;

    // Academic structure
    const academicSections = [
      /\babstract\b/i, /\bintroduction\b/i, /\bmethodology\b/i,
      /\bresults\b/i, /\bdiscussion\b/i, /\bconclusion\b/i,
      /\breferences\b/i, /\backnowledg/i
    ];

    let sectionMatches = 0;
    for (const pattern of academicSections) {
      if (pattern.test(content)) sectionMatches++;
    }
    score += Math.min(sectionMatches * 0.1, 0.4);

    // Citation patterns
    const citationMatches = (content.match(/\[\d+\]|\(\d{4}\)/g) || []).length;
    if (citationMatches >= 5) score += 0.3;

    // Academic language
    const academicTerms = [
      /\b(?:hypothesis|methodology|empirical|significant|correlation)\b/gi,
      /\b(?:experimental|theoretical|statistical|qualitative|quantitative)\b/gi,
    ];

    for (const pattern of academicTerms) {
      if (pattern.test(content)) score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate patent document score
   */
  private calculatePatentScore(content: string): number {
    let score = 0;

    // Patent-specific sections and language
    const patentPatterns = [
      /\b(?:claim|claims|invention|inventor|assignee)\b/gi,
      /\b(?:embodiment|implementation|preferred|accordance)\b/gi,
      /\b(?:figure|fig\.|drawing|diagram)\b/gi,
      /\bU\.?S\.?\s+Patent\b/gi,
    ];

    let patentMatches = 0;
    for (const pattern of patentPatterns) {
      patentMatches += (content.match(pattern) || []).length;
    }

    const words = content.split(/\s+/).length;
    const patentDensity = patentMatches / (words / 100);
    score += Math.min(patentDensity * 0.05, 0.6);

    // Patent number patterns
    if (/\b(?:US|EP|WO)\s*\d{7,}/i.test(content)) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  private detectLanguage(content: string): string {
    // Simple language detection - could be enhanced
    const englishIndicators = ['the', 'and', 'or', 'in', 'of', 'to', 'for'];
    const englishScore = englishIndicators.reduce((score, word) => 
      score + (content.toLowerCase().split(' ').filter(w => w === word).length), 0
    );
    
    return englishScore > content.split(' ').length * 0.05 ? 'en' : 'unknown';
  }

  private estimateTokens(text: string): number {
    // OpenAI's approximation: ~4 characters per token
    const normalized = text.trim().replace(/\s+/g, ' ');
    const baseCount = normalized.length / 4;
    
    // Account for punctuation
    const punctuationCount = (normalized.match(/[.!?,;:()\[\]{}'"]/g) || []).length;
    
    return Math.ceil(baseCount + (punctuationCount * 0.1));
  }
}

// Export singleton
export const documentAnalyzer = new UnifiedDocumentAnalyzer();