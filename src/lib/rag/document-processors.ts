/**
 * Document Processing Pipeline
 * 
 * Handles ingestion and processing of various document types including
 * PDFs, DOI/arXiv links, patents, and URLs with metadata extraction.
 */

import { createHash } from 'crypto';
import type { 
  DocumentMetadata, 
  DOIMetadata, 
  PatentMetadata, 
  GROBIDResponse, 
  DocumentType,
  ProcessingJob 
} from './types';

// =======================
// External API Clients
// =======================

/**
 * Crossref API client for DOI resolution
 */
export class CrossrefClient {
  private readonly baseUrl = 'https://api.crossref.org/works';
  private readonly userAgent = 'david-gpt/0.1.0 (mailto:david@example.com)';

  async resolveDOI(doi: string): Promise<DOIMetadata | null> {
    try {
      const cleanDOI = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(cleanDOI)}`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Crossref API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const work = data.message;

      return {
        doi: cleanDOI,
        title: work.title?.[0] || 'Untitled',
        authors: work.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()) || [],
        journal: work['container-title']?.[0],
        volume: work.volume,
        issue: work.issue,
        pages: work.page,
        year: work.issued?.['date-parts']?.[0]?.[0],
        publishedDate: work.issued?.['date-parts']?.[0] ? 
          new Date(
            work.issued['date-parts'][0][0], 
            (work.issued['date-parts'][0][1] || 1) - 1, 
            work.issued['date-parts'][0][2] || 1
          ) : undefined,
        abstract: work.abstract,
        url: work.URL,
      };
    } catch (error) {
      console.error('Error resolving DOI:', error);
      return null;
    }
  }

  /**
   * Extract DOI from arXiv identifier
   */
  async resolveArxiv(arxivId: string): Promise<DOIMetadata | null> {
    try {
      // Clean arXiv ID (remove version if present)
      const cleanId = arxivId.replace(/^(arxiv:)?/, '').replace(/v\d+$/, '');
      
      // First try to get metadata from arXiv API
      const arxivResponse = await fetch(`http://export.arxiv.org/api/query?id_list=${cleanId}`);
      if (!arxivResponse.ok) {
        throw new Error(`arXiv API error: ${arxivResponse.status}`);
      }

      const xmlText = await arxivResponse.text();
      
      // Parse basic info from XML (simplified - in production, use proper XML parser)
      const titleMatch = xmlText.match(/<title>([^<]+)<\/title>/);
      const authorsMatch = xmlText.match(/<author>.*?<name>([^<]+)<\/name>.*?<\/author>/g);
      const summaryMatch = xmlText.match(/<summary>([^<]+)<\/summary>/);
      const publishedMatch = xmlText.match(/<published>([^<]+)<\/published>/);

      return {
        doi: `arxiv:${cleanId}`,
        title: titleMatch?.[1] || 'Untitled arXiv Paper',
        authors: authorsMatch?.map(match => match.match(/<name>([^<]+)<\/name>/)?.[1] || '') || [],
        journal: 'arXiv',
        abstract: summaryMatch?.[1],
        publishedDate: publishedMatch?.[1] ? new Date(publishedMatch[1]) : undefined,
        url: `https://arxiv.org/abs/${cleanId}`,
      };
    } catch (error) {
      console.error('Error resolving arXiv ID:', error);
      return null;
    }
  }
}

/**
 * GROBID client for academic paper parsing
 */
export class GROBIDClient {
  private readonly baseUrl = 'https://kermitt2-grobid.hf.space';

  async processPDF(pdfBuffer: Buffer): Promise<GROBIDResponse | null> {
    try {
      const formData = new FormData();
      formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }));

      const response = await fetch(`${this.baseUrl}/api/processFulltextDocument`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/xml',
        },
      });

      if (!response.ok) {
        throw new Error(`GROBID API error: ${response.status} ${response.statusText}`);
      }

      const xmlData = await response.text();
      return this.parseGROBIDResponse(xmlData);
    } catch (error) {
      console.error('Error processing PDF with GROBID:', error);
      return null;
    }
  }

  private parseGROBIDResponse(xml: string): GROBIDResponse {
    // Simplified XML parsing - in production, use proper XML parser
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    const authorsMatch = xml.match(/<author[^>]*>.*?<persName[^>]*>.*?<forename[^>]*>([^<]*)<\/forename>.*?<surname[^>]*>([^<]*)<\/surname>.*?<\/persName>.*?<\/author>/g);
    const abstractMatch = xml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/);
    const keywordsMatch = xml.match(/<keywords[^>]*>([\s\S]*?)<\/keywords>/);

    // Extract full text content from body
    let fullText = '';
    const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    if (bodyMatch) {
      const bodyXML = bodyMatch[1];
      
      // Extract text from paragraphs and sections - using [\s\S]* for ES2017 compatibility
      const paragraphs = bodyXML.match(/<p[^>]*>([\s\S]*?)<\/p>/g) || [];
      const cleanParagraphs = paragraphs.map(p => 
        p.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      ).filter(p => p.length > 10); // Filter out very short paragraphs
      
      // Combine paragraphs in document order
      fullText = cleanParagraphs.join('\n\n');
    }

    const parsedResult: GROBIDResponse = {
      title: titleMatch?.[1]?.trim(),
      authors: authorsMatch?.map(match => {
        const forenameMatch = match.match(/<forename[^>]*>([^<]*)<\/forename>/);
        const surnameMatch = match.match(/<surname[^>]*>([^<]*)<\/surname>/);
        const forename = forenameMatch?.[1]?.trim() || '';
        const surname = surnameMatch?.[1]?.trim() || '';
        return {
          firstName: forename,
          surname: surname,
          fullName: `${forename} ${surname}`.trim(),
        };
      }),
      abstract: abstractMatch?.[1]?.replace(/<[^>]*>/g, '')?.trim(),
      keywords: keywordsMatch?.[1]?.split(/[,;]/)?.map(k => k.trim()) || [],
      fullText, // Add the extracted full text
    };

    return parsedResult;
  }
}

/**
 * Patent processing using USPTO/EPO APIs
 */
export class PatentProcessor {
  async processPatentNumber(patentNo: string): Promise<PatentMetadata | null> {
    // Clean patent number
    const cleanPatentNo = patentNo.replace(/[^\w\d]/g, '').toUpperCase();
    
    // Try different patent office APIs
    let metadata = await this.processUSPTOPatent(cleanPatentNo);
    if (!metadata) {
      metadata = await this.processEPOPatent(cleanPatentNo);
    }
    
    return metadata;
  }

  private async processUSPTOPatent(patentNo: string): Promise<PatentMetadata | null> {
    try {
      // USPTO Patent Examination Research Dataset API
      const response = await fetch(
        `https://developer.uspto.gov/ds-api/patents/applications/v1/docs/${patentNo}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      return {
        patentNumber: patentNo,
        title: data.patentTitle || 'Untitled Patent',
        inventors: data.inventors?.map((inv: any) => inv.name) || [],
        assignee: data.assignees?.[0]?.name,
        applicationNumber: data.applicationNumber,
        filedDate: data.filedDate ? new Date(data.filedDate) : undefined,
        publishedDate: data.publishedDate ? new Date(data.publishedDate) : undefined,
        grantedDate: data.grantedDate ? new Date(data.grantedDate) : undefined,
        abstract: data.abstract,
        claims: data.claims,
        description: data.description,
      };
    } catch (error) {
      console.error('Error processing USPTO patent:', error);
      return null;
    }
  }

  private async processEPOPatent(patentNo: string): Promise<PatentMetadata | null> {
    try {
      // EPO Open Patent Services API
      const response = await fetch(
        `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/${patentNo}/biblio`,
        {
          headers: {
            'Accept': 'application/json',
            'X-OPS-Range': '1-100',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const biblio = data?.['ops:world-patent-data']?.['ops:biblio-search']?.['ops:search-result']?.['ops:publication-reference'];
      
      if (!biblio) {
        return null;
      }

      return {
        patentNumber: patentNo,
        title: biblio.title || 'Untitled Patent',
        inventors: biblio.inventors?.map((inv: any) => inv.name) || [],
        assignee: biblio.applicants?.[0]?.name,
        publicationNumber: biblio.publicationNumber,
        publishedDate: biblio.publishedDate ? new Date(biblio.publishedDate) : undefined,
        abstract: biblio.abstract,
      };
    } catch (error) {
      console.error('Error processing EPO patent:', error);
      return null;
    }
  }

  /**
   * Extract patent number from various formats including Google Patents URLs
   */
  extractPatentNumber(input: string): string | null {
    // Google Patents URL pattern
    const googlePatentsMatch = input.match(/patents\.google\.com\/patent\/([A-Z0-9]+)/);
    if (googlePatentsMatch) {
      return googlePatentsMatch[1];
    }

    // USPTO patent number patterns
    const patentMatches = [
      input.match(/US(\d{7,8})[A-Z]?\d?/),
      input.match(/(\d{7,8})/),
      input.match(/US(\d{4}\/\d{6})/),
    ];

    for (const match of patentMatches) {
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }
}

// =======================
// Main Document Processor
// =======================

export class DocumentProcessor {
  private crossref = new CrossrefClient();
  private grobid = new GROBIDClient();
  private patentProcessor = new PatentProcessor();

  /**
   * Process different types of document inputs
   */
  async processDocument(input: {
    type: 'file' | 'doi' | 'arxiv' | 'patent' | 'url';
    content?: Buffer | string;
    metadata?: Partial<DocumentMetadata>;
    userId?: string;
  }): Promise<{
    metadata: Partial<DocumentMetadata>;
    content?: string;
    rawText?: string;
  } | null> {
    try {
      switch (input.type) {
        case 'file':
          return await this.processPDFFile(input.content as Buffer, input.metadata);
        
        case 'doi':
          return await this.processDOI(input.content as string, input.metadata);
        
        case 'arxiv':
          return await this.processArxiv(input.content as string, input.metadata);
        
        case 'patent':
          return await this.processPatent(input.content as string, input.metadata);
        
        case 'url':
          return await this.processURL(input.content as string, input.metadata);
        
        default:
          throw new Error(`Unsupported document type: ${input.type}`);
      }
    } catch (error) {
      console.error('Error processing document:', error);
      return null;
    }
  }

  private async processPDFFile(buffer: Buffer, metadata?: Partial<DocumentMetadata>) {
    // Try to enhance with GROBID first
    const grobidData = await this.grobid.processPDF(buffer);
    
    // Use GROBID full text if available, otherwise fall back to pdf-parse
    let content = '';
    if (grobidData?.fullText && grobidData.fullText.length > 1000) {
      // Use GROBID structured content
      content = [
        grobidData.title,
        grobidData.abstract,
        grobidData.fullText
      ].filter(Boolean).join('\n\n');
    } else {
      // Fallback to pdf-parse (dynamic import to avoid initialization issues)
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      content = pdfData.text;
    }

    // Generate content hash
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    return {
      metadata: {
        ...metadata,
        docType: 'pdf' as DocumentType,
        title: grobidData?.title || metadata?.title || 'Untitled PDF',
        fileHash: contentHash,
        fileSize: buffer.length,
        processingStatus: 'completed' as const,
        processedAt: new Date(),
      },
      content,
      rawText: content,
      structuredData: grobidData,
    };
  }

  private async processDOI(doi: string, metadata?: Partial<DocumentMetadata>) {
    const doiData = await this.crossref.resolveDOI(doi);
    if (!doiData) {
      throw new Error(`Could not resolve DOI: ${doi}`);
    }

    return {
      metadata: {
        ...metadata,
        docType: 'paper' as DocumentType,
        title: doiData.title,
        doi: doiData.doi,
        url: doiData.url,
        canonicalUrl: doiData.url,
        publishedDate: doiData.publishedDate,
        isoDate: doiData.publishedDate,
        processingStatus: 'completed' as const,
        processedAt: new Date(),
      },
      content: doiData.abstract || '',
      rawText: doiData.abstract || '',
      structuredData: doiData,
    };
  }

  private async processArxiv(arxivId: string, metadata?: Partial<DocumentMetadata>) {
    const arxivData = await this.crossref.resolveArxiv(arxivId);
    if (!arxivData) {
      throw new Error(`Could not resolve arXiv ID: ${arxivId}`);
    }

    return {
      metadata: {
        ...metadata,
        docType: 'paper' as DocumentType,
        title: arxivData.title,
        arxivId,
        url: arxivData.url,
        canonicalUrl: arxivData.url,
        publishedDate: arxivData.publishedDate,
        isoDate: arxivData.publishedDate,
        processingStatus: 'completed' as const,
        processedAt: new Date(),
      },
      content: arxivData.abstract || '',
      rawText: arxivData.abstract || '',
      structuredData: arxivData,
    };
  }

  private async processPatent(patentInput: string, metadata?: Partial<DocumentMetadata>) {
    const patentNo = this.patentProcessor.extractPatentNumber(patentInput);
    if (!patentNo) {
      throw new Error(`Could not extract patent number from: ${patentInput}`);
    }

    const patentData = await this.patentProcessor.processPatentNumber(patentNo);
    if (!patentData) {
      throw new Error(`Could not resolve patent: ${patentNo}`);
    }

    return {
      metadata: {
        ...metadata,
        docType: 'patent' as DocumentType,
        title: patentData.title,
        patentNo: patentData.patentNumber,
        applicationNo: patentData.applicationNumber,
        publicationNo: patentData.publicationNumber,
        filedDate: patentData.filedDate,
        publishedDate: patentData.publishedDate,
        grantedDate: patentData.grantedDate,
        isoDate: patentData.grantedDate || patentData.publishedDate || patentData.filedDate,
        processingStatus: 'completed' as const,
        processedAt: new Date(),
      },
      content: [
        patentData.abstract,
        patentData.description,
        ...(patentData.claims || [])
      ].filter(Boolean).join('\n\n'),
      rawText: [
        patentData.abstract,
        patentData.description,
        ...(patentData.claims || [])
      ].filter(Boolean).join('\n\n'),
      structuredData: patentData,
    };
  }

  private async processURL(url: string, metadata?: Partial<DocumentMetadata>) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'david-gpt/0.1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/pdf')) {
        // Handle PDF URLs
        const buffer = Buffer.from(await response.arrayBuffer());
        return this.processPDFFile(buffer, { ...metadata, url, canonicalUrl: url });
      } else if (contentType?.includes('text/html')) {
        // Handle HTML pages (simplified - in production, use proper HTML parser)
        const html = await response.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || 'Untitled Web Page';
        
        // Extract text content (very basic - use proper HTML-to-text library)
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          metadata: {
            ...metadata,
            docType: 'url' as DocumentType,
            title,
            url,
            canonicalUrl: url,
            processingStatus: 'completed' as const,
            processedAt: new Date(),
          },
          content: textContent,
          rawText: textContent,
        };
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }
    } catch (error) {
      console.error('Error processing URL:', error);
      throw error;
    }
  }

  /**
   * Validate and normalize document metadata
   */
  validateMetadata(metadata: Partial<DocumentMetadata>): DocumentMetadata {
    if (!metadata.title?.trim()) {
      throw new Error('Document title is required');
    }

    if (!metadata.docType) {
      throw new Error('Document type is required');
    }

    return {
      id: metadata.id || '',
      title: metadata.title.trim(),
      docType: metadata.docType,
      status: metadata.status || 'published',
      processingStatus: metadata.processingStatus || 'pending',
      createdAt: metadata.createdAt || new Date(),
      updatedAt: metadata.updatedAt || new Date(),
      ...metadata,
    } as DocumentMetadata;
  }

  /**
   * Extract file extension and determine document type
   */
  detectDocumentType(filename: string, contentType?: string): DocumentType {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf' || contentType?.includes('pdf')) {
      return 'pdf';
    }
    
    if (['txt', 'md', 'markdown'].includes(ext || '')) {
      return 'note';
    }
    
    if (['html', 'htm'].includes(ext || '') || contentType?.includes('html')) {
      return 'url';
    }
    
    // Default to PDF for unknown types
    return 'pdf';
  }
}

export const documentProcessor = new DocumentProcessor();