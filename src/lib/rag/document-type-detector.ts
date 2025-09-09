/**
 * Enhanced Document Type Detection Utility
 * Analyzes file content to automatically determine document type and extract metadata
 */

export interface DocumentDetectionResult {
  detectedType: 'pdf' | 'paper' | 'patent' | 'note' | 'url' | 'unknown';
  confidence: number;
  title: string;
  metadata: {
    doi?: string;
    arxivId?: string;
    patentNumber?: string;
    patentUrl?: string;
    allPatentUrls?: string[];
    authors?: string[];
    abstract?: string;
    publishedDate?: string;
    venue?: string;
    urls?: string[];
  };
  processingHints: {
    useGrobid?: boolean;
    usePatentApi?: boolean;
    extractFromUrl?: boolean;
    requiresOcr?: boolean;
  };
}

export class DocumentTypeDetector {
  private static readonly DOI_REGEX = /(?:doi:?\s*)(10\.\d+\/[^\s\]]+)/i;
  private static readonly ARXIV_REGEX = /(?:arxiv:?\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i;
  private static readonly PATENT_NUMBER_REGEX = /(US|EP|JP|WO|CN)\s*(\d+)\s*([A-Z]\d*)?/i;
  private static readonly PATENT_URL_REGEX = /patents\.google\.com\/patent\/([A-Z]{2}\d+[A-Z]?\d*)/i;
  private static readonly URL_REGEX = /https?:\/\/[^\s\n\]]+/g;
  private static readonly EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  static async analyzeFile(file: File): Promise<DocumentDetectionResult> {
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop() || '';
    
    // Initialize result with defaults
    let result: DocumentDetectionResult = {
      detectedType: 'unknown',
      confidence: 0.1,
      title: file.name.replace(/\.[^/.]+$/, ''),
      metadata: {},
      processingHints: {}
    };

    try {
      // Read file content for analysis
      const content = await this.readFileContent(file, fileExtension === 'pdf' ? 5000 : undefined);
      
      // Analyze based on file type and content
      if (fileExtension === 'pdf' || file.type === 'application/pdf') {
        result = await this.analyzePDF(content, result);
      } else if (['txt', 'md', 'text'].includes(fileExtension) || file.type.startsWith('text/')) {
        result = await this.analyzeTextFile(content, result);
      } else if (fileExtension === 'json') {
        result = await this.analyzeJSONFile(content, result);
      } else if (['csv', 'tsv'].includes(fileExtension)) {
        result = await this.analyzeCSVFile(content, result);
      }

      // Extract common metadata
      result = this.extractCommonMetadata(content, result);
      
      // Determine processing hints
      result = this.setProcessingHints(result);

    } catch (error) {
      console.warn(`Error analyzing file ${file.name}:`, error);
    }

    return result;
  }

  private static async readFileContent(file: File, maxBytes?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(maxBytes ? result.slice(0, maxBytes) : result);
      };
      
      reader.onerror = reject;
      
      if (maxBytes && maxBytes < file.size) {
        const blob = file.slice(0, maxBytes);
        reader.readAsText(blob);
      } else {
        reader.readAsText(file);
      }
    });
  }

  private static async analyzePDF(content: string, result: DocumentDetectionResult): Promise<DocumentDetectionResult> {
    result.detectedType = 'pdf';
    result.confidence = 0.7;

    // Check for academic paper indicators
    const academicKeywords = ['abstract', 'introduction', 'methodology', 'results', 'conclusion', 'references', 'bibliography'];
    const academicScore = academicKeywords.filter(keyword => 
      new RegExp(keyword, 'i').test(content)
    ).length / academicKeywords.length;

    // Check for patent indicators
    const patentKeywords = ['claims', 'inventor', 'assignee', 'field of invention', 'background', 'detailed description'];
    const patentScore = patentKeywords.filter(keyword => 
      new RegExp(keyword, 'i').test(content)
    ).length / patentKeywords.length;

    if (academicScore > 0.4) {
      result.detectedType = 'paper';
      result.confidence = 0.8 + (academicScore * 0.2);
      result.processingHints.useGrobid = true;
    } else if (patentScore > 0.3) {
      result.detectedType = 'patent';
      result.confidence = 0.7 + (patentScore * 0.3);
      result.processingHints.usePatentApi = true;
    }

    return result;
  }

  private static async analyzeTextFile(content: string, result: DocumentDetectionResult): Promise<DocumentDetectionResult> {
    result.detectedType = 'note';
    result.confidence = 0.8;

    // Check for URL lists
    const urls = content.match(this.URL_REGEX) || [];
    if (urls.length > 0) {
      result.metadata.urls = urls;
      
      // Check for patent URLs
      const patentUrls = urls.filter(url => this.PATENT_URL_REGEX.test(url));
      if (patentUrls.length > 0) {
        result.detectedType = 'patent';
        result.confidence = 0.9;
        result.metadata.patentUrl = patentUrls[0];
        result.processingHints.extractFromUrl = true;
        
        // Store all patent URLs for potential expansion
        result.metadata.allPatentUrls = patentUrls;
        
        const match = patentUrls[0].match(this.PATENT_URL_REGEX);
        if (match) {
          result.metadata.patentNumber = match[1];
        }
      }
      
      // Check for DOI URLs
      const doiUrls = urls.filter(url => url.includes('doi.org') || url.includes('arxiv.org'));
      if (doiUrls.length > 0) {
        result.detectedType = 'paper';
        result.confidence = 0.9;
        result.processingHints.extractFromUrl = true;
      }
    }

    // Check for academic structure
    const academicSections = ['abstract', 'introduction', 'methodology', 'results', 'discussion', 'conclusion'];
    const foundSections = academicSections.filter(section => 
      new RegExp(`^\\s*${section}\\s*$`, 'im').test(content)
    );
    
    if (foundSections.length >= 3) {
      result.detectedType = 'paper';
      result.confidence = Math.max(result.confidence, 0.8);
      result.processingHints.useGrobid = true;
    }

    return result;
  }

  private static async analyzeJSONFile(content: string, result: DocumentDetectionResult): Promise<DocumentDetectionResult> {
    try {
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        // Handle arrays of documents
        if (data.length > 0 && typeof data[0] === 'object') {
          return this.analyzeJSONObject(data[0], result);
        }
      } else if (typeof data === 'object') {
        return this.analyzeJSONObject(data, result);
      }
    } catch (error) {
      console.warn('Failed to parse JSON:', error);
    }

    result.detectedType = 'note';
    result.confidence = 0.5;
    return result;
  }

  private static analyzeJSONObject(data: any, result: DocumentDetectionResult): DocumentDetectionResult {
    // Check for academic paper structure
    if (data.doi || data.arxiv_id || data.pmid) {
      result.detectedType = 'paper';
      result.confidence = 0.95;
      result.metadata.doi = data.doi;
      result.metadata.arxivId = data.arxiv_id;
      result.title = data.title || result.title;
      result.metadata.authors = data.authors || data.author;
      result.metadata.abstract = data.abstract;
      result.metadata.venue = data.journal || data.venue || data.conference;
      result.processingHints.extractFromUrl = !!data.doi;
    }
    
    // Check for patent structure
    else if (data.patent_number || data.patent_id || data.assignee || data.inventor) {
      result.detectedType = 'patent';
      result.confidence = 0.95;
      result.metadata.patentNumber = data.patent_number || data.patent_id;
      result.title = data.title || data.invention_title || result.title;
      result.metadata.authors = data.inventors || data.inventor;
      result.processingHints.usePatentApi = true;
    }
    
    // Generic structured data
    else {
      result.detectedType = 'note';
      result.confidence = 0.7;
      result.title = data.title || data.name || result.title;
    }

    return result;
  }

  private static async analyzeCSVFile(content: string, result: DocumentDetectionResult): Promise<DocumentDetectionResult> {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      result.detectedType = 'note';
      result.confidence = 0.5;
      return result;
    }

    const header = lines[0].toLowerCase();
    
    // Check for academic paper CSV structure
    if (header.includes('doi') || header.includes('arxiv') || header.includes('pmid')) {
      result.detectedType = 'paper';
      result.confidence = 0.8;
      result.processingHints.extractFromUrl = true;
    }
    
    // Check for patent CSV structure
    else if (header.includes('patent') || header.includes('assignee') || header.includes('inventor')) {
      result.detectedType = 'patent';
      result.confidence = 0.8;
      result.processingHints.usePatentApi = true;
    }
    
    // Generic CSV
    else {
      result.detectedType = 'note';
      result.confidence = 0.6;
    }

    return result;
  }

  private static extractCommonMetadata(content: string, result: DocumentDetectionResult): DocumentDetectionResult {
    // Extract DOI
    const doiMatch = content.match(this.DOI_REGEX);
    if (doiMatch) {
      result.metadata.doi = doiMatch[1];
      if (result.detectedType === 'unknown' || result.confidence < 0.8) {
        result.detectedType = 'paper';
        result.confidence = 0.9;
      }
    }

    // Extract arXiv ID
    const arxivMatch = content.match(this.ARXIV_REGEX);
    if (arxivMatch) {
      result.metadata.arxivId = arxivMatch[1];
      if (result.detectedType === 'unknown' || result.confidence < 0.8) {
        result.detectedType = 'paper';
        result.confidence = 0.9;
      }
    }

    // Extract patent number
    const patentMatch = content.match(this.PATENT_NUMBER_REGEX);
    if (patentMatch) {
      result.metadata.patentNumber = patentMatch[0].replace(/\s+/g, '');
      if (result.detectedType === 'unknown' || result.confidence < 0.8) {
        result.detectedType = 'patent';
        result.confidence = 0.8;
      }
    }

    // Extract patent URL
    const patentUrlMatch = content.match(this.PATENT_URL_REGEX);
    if (patentUrlMatch) {
      result.metadata.patentUrl = patentUrlMatch[0];
      result.metadata.patentNumber = patentUrlMatch[1];
      if (result.detectedType === 'unknown' || result.confidence < 0.8) {
        result.detectedType = 'patent';
        result.confidence = 0.9;
      }
    }

    // Extract potential title from first lines
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 10 && firstLine.length < 200 && !firstLine.includes('http')) {
        // Clean up potential title
        const cleanTitle = firstLine
          .replace(/^(title:?\s*|abstract:?\s*)/i, '')
          .replace(/[^\w\s-.,():]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanTitle.length > 5) {
          result.title = cleanTitle;
        }
      }
    }

    // Extract abstract
    const abstractMatch = content.match(/abstract[:\s]+([^.]+(?:\.[^.]*){0,5})/i);
    if (abstractMatch) {
      result.metadata.abstract = abstractMatch[1].trim().substring(0, 500);
    }

    return result;
  }

  private static setProcessingHints(result: DocumentDetectionResult): DocumentDetectionResult {
    // Set processing hints based on detected type and available metadata
    switch (result.detectedType) {
      case 'paper':
        if (result.metadata.doi || result.metadata.arxivId) {
          result.processingHints.extractFromUrl = true;
        } else {
          result.processingHints.useGrobid = true;
        }
        break;
        
      case 'patent':
        if (result.metadata.patentUrl || result.metadata.patentNumber) {
          result.processingHints.usePatentApi = true;
        }
        break;
        
      case 'pdf':
        result.processingHints.useGrobid = true;
        break;
    }

    return result;
  }

  /**
   * Expand patent URL lists into individual patent documents
   */
  static expandPatentUrls(result: DocumentDetectionResult): DocumentDetectionResult[] {
    if (result.detectedType === 'patent' && result.metadata.allPatentUrls && result.metadata.allPatentUrls.length > 1) {
      // Create individual documents for each patent URL
      return result.metadata.allPatentUrls.map((patentUrl, index) => {
        const match = patentUrl.match(this.PATENT_URL_REGEX);
        const patentNumber = match ? match[1] : `Patent ${index + 1}`;
        
        return {
          ...result,
          title: `Patent ${patentNumber}`,
          metadata: {
            ...result.metadata,
            patentUrl: patentUrl,
            patentNumber: patentNumber,
            allPatentUrls: undefined // Remove the array to avoid confusion
          }
        };
      });
    }
    
    // Return original result if not a multi-patent document
    return [result];
  }

  /**
   * Batch analyze multiple files
   */
  static async analyzeFiles(files: File[]): Promise<DocumentDetectionResult[]> {
    const results = await Promise.allSettled(
      files.map(file => this.analyzeFile(file))
    );

    const basicResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Failed to analyze file ${files[index].name}:`, result.reason);
        return {
          detectedType: 'unknown' as const,
          confidence: 0.1,
          title: files[index].name.replace(/\.[^/.]+$/, ''),
          metadata: {},
          processingHints: {}
        };
      }
    });

    // Expand patent URL lists into individual documents
    const expandedResults: DocumentDetectionResult[] = [];
    for (const result of basicResults) {
      expandedResults.push(...this.expandPatentUrls(result));
    }

    return expandedResults;
  }
}