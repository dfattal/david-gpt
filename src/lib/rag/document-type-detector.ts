/**
 * Enhanced Document Type Detection Utility
 * Analyzes file content to automatically determine document type and extract metadata
 * Supports extensible type system with persona-specific detection rules
 */

import { sanitizeDOI } from './doi-utils';
import { UrlListParser } from './url-list-parser';
import { typeRegistry, DEFAULT_PERSONA } from './type-registry';
import type { Persona, DocumentType } from './types';

export interface DocumentDetectionResult {
  detectedType: DocumentType | 'unknown';
  confidence: number;
  title: string;
  suggestedPersona?: Persona;
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
    // Legal-specific metadata
    caseNumber?: string;
    legalCitation?: string;
    courtLevel?: string;
    jurisdiction?: string;
    // Medical-specific metadata
    clinicalTrialId?: string;
    pubmedId?: string;
    meshTerms?: string[];
    studyType?: string;
    // Extensible metadata
    customFields?: Record<string, any>;
  };
  processingHints: {
    useGrobid?: boolean;
    usePatentApi?: boolean;
    extractFromUrl?: boolean;
    requiresOcr?: boolean;
    persona?: Persona;
  };
}

export class DocumentTypeDetector {
  private static readonly DOI_REGEX = /(?:doi:?\s*)(10\.\d+\/[^\s\]]+)/i;
  private static readonly ARXIV_REGEX = /(?:arxiv:?\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i;
  private static readonly PATENT_NUMBER_REGEX = /(US|EP|JP|WO|CN)\s*(\d+)\s*([A-Z]\d*)?/i;
  private static readonly PATENT_URL_REGEX = /patents\.google\.com\/patent\/([A-Z]{2}\d+[A-Z]?\d*)/i;
  private static readonly URL_REGEX = /https?:\/\/[^\s\n\]]+/g;
  private static readonly EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  // Legal document patterns
  private static readonly CASE_NUMBER_REGEX = /(\d{1,2}-[A-Z]{2,4}-\d+|\d+\s+[A-Z\.]+\s+\d+)/i;
  private static readonly LEGAL_CITATION_REGEX = /(\d+\s+[A-Z][a-z]*\.?\s*\d*\s+\d+|\d+\s+F\.\d*d\s+\d+)/i;
  private static readonly COURT_PATTERNS = [
    /Supreme Court/i, /Court of Appeals/i, /District Court/i, /Circuit Court/i,
    /Federal Court/i, /State Court/i, /Appellate Court/i
  ];

  // Medical document patterns
  private static readonly CLINICAL_TRIAL_REGEX = /NCT\d{8}/i;
  private static readonly PUBMED_REGEX = /(PMID:?\s*)?(\d{7,8})/i;
  private static readonly MESH_TERMS_REGEX = /MeSH[:\s]+([^\n\r]+)/i;

  static async analyzeFile(file: File, targetPersona?: Persona): Promise<DocumentDetectionResult> {
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop() || '';

    // Initialize result with defaults
    let result: DocumentDetectionResult = {
      detectedType: 'unknown',
      confidence: 0.1,
      title: file.name.replace(/\.[^/.]+$/, ''),
      suggestedPersona: targetPersona || DEFAULT_PERSONA,
      metadata: {},
      processingHints: {
        persona: targetPersona || DEFAULT_PERSONA
      }
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

      // Apply extensible detection rules
      result = this.applyExtensibleDetection(content, fileName, result, targetPersona);

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
      const rawDoi = doiMatch[1];
      const cleanedDoi = sanitizeDOI(rawDoi);
      if (cleanedDoi) {
        result.metadata.doi = cleanedDoi;
      }
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

  private static applyExtensibleDetection(
    content: string,
    fileName: string,
    result: DocumentDetectionResult,
    targetPersona?: Persona
  ): DocumentDetectionResult {
    const personas = targetPersona ? [targetPersona] : typeRegistry.getAllPersonas();
    let bestMatch = result;
    let bestScore = result.confidence;

    for (const persona of personas) {
      const personaConfig = typeRegistry.getPersonaConfig(persona);
      if (!personaConfig) continue;

      // Check each document type supported by this persona
      for (const docType of personaConfig.documentTypes) {
        const detectionRules = typeRegistry.getDetectionRules(docType);
        let typeScore = 0;
        let matchCount = 0;

        for (const rule of detectionRules) {
          let ruleScore = 0;

          // File pattern matching
          if (rule.filePatterns) {
            for (const pattern of rule.filePatterns) {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
              if (regex.test(fileName)) {
                ruleScore += 0.3;
              }
            }
          }

          // Content pattern matching
          if (rule.contentPatterns) {
            for (const pattern of rule.contentPatterns) {
              if (pattern.test(content)) {
                ruleScore += 0.4;
              }
            }
          }

          // URL pattern matching
          if (rule.urlPatterns && result.metadata.urls) {
            for (const pattern of rule.urlPatterns) {
              for (const url of result.metadata.urls) {
                if (pattern.test(url)) {
                  ruleScore += 0.3;
                }
              }
            }
          }

          if (ruleScore > 0) {
            typeScore += ruleScore * rule.confidence * (rule.priority || 1);
            matchCount++;
          }
        }

        // Apply persona-specific detection patterns
        typeScore += this.applyPersonaSpecificDetection(content, docType, persona);

        // Calculate final score for this type
        if (matchCount > 0) {
          const finalScore = Math.min(typeScore / matchCount, 1.0);
          if (finalScore > bestScore) {
            bestMatch = {
              ...result,
              detectedType: docType as DocumentType,
              confidence: finalScore,
              suggestedPersona: persona,
              processingHints: {
                ...result.processingHints,
                persona: persona
              }
            };
            bestScore = finalScore;
          }
        }
      }
    }

    return bestMatch;
  }

  private static applyPersonaSpecificDetection(
    content: string,
    docType: string,
    persona: Persona
  ): number {
    let score = 0;

    switch (persona) {
      case 'legal':
        score += this.detectLegalContent(content, docType);
        break;
      case 'medical':
        score += this.detectMedicalContent(content, docType);
        break;
      case 'david':
        score += this.detectTechnicalContent(content, docType);
        break;
    }

    return score;
  }

  private static detectLegalContent(content: string, docType: string): number {
    let score = 0;

    // Legal keywords and patterns
    const legalKeywords = [
      'plaintiff', 'defendant', 'court', 'judge', 'ruling', 'precedent',
      'statute', 'jurisdiction', 'appeal', 'motion', 'brief', 'legal'
    ];

    // Case number detection
    if (this.CASE_NUMBER_REGEX.test(content)) score += 0.4;

    // Legal citation detection
    if (this.LEGAL_CITATION_REGEX.test(content)) score += 0.3;

    // Court pattern detection
    for (const pattern of this.COURT_PATTERNS) {
      if (pattern.test(content)) score += 0.2;
    }

    // Legal keyword density
    const keywordMatches = legalKeywords.filter(keyword =>
      new RegExp(keyword, 'i').test(content)
    ).length;
    score += (keywordMatches / legalKeywords.length) * 0.3;

    return Math.min(score, 1.0);
  }

  private static detectMedicalContent(content: string, docType: string): number {
    let score = 0;

    // Medical keywords
    const medicalKeywords = [
      'patient', 'clinical', 'trial', 'study', 'treatment', 'diagnosis',
      'therapy', 'medical', 'hospital', 'physician', 'disease', 'drug'
    ];

    // Clinical trial ID detection
    if (this.CLINICAL_TRIAL_REGEX.test(content)) score += 0.5;

    // PubMed ID detection
    if (this.PUBMED_REGEX.test(content)) score += 0.4;

    // MeSH terms detection
    if (this.MESH_TERMS_REGEX.test(content)) score += 0.3;

    // Medical keyword density
    const keywordMatches = medicalKeywords.filter(keyword =>
      new RegExp(keyword, 'i').test(content)
    ).length;
    score += (keywordMatches / medicalKeywords.length) * 0.3;

    return Math.min(score, 1.0);
  }

  private static detectTechnicalContent(content: string, docType: string): number {
    let score = 0;

    // Technical keywords for David's domain (3D displays, etc.)
    const technicalKeywords = [
      '3D', 'display', 'lenticular', 'holographic', 'immersive',
      'stereoscopic', 'depth', 'parallax', 'optics', 'technology'
    ];

    // Company names related to David's expertise
    const companies = ['Samsung', 'LG', 'Sony', 'Apple', 'Google', 'Meta', 'Leia'];

    // Technical keyword density
    const keywordMatches = technicalKeywords.filter(keyword =>
      new RegExp(keyword, 'i').test(content)
    ).length;
    score += (keywordMatches / technicalKeywords.length) * 0.3;

    // Company mention boost
    const companyMatches = companies.filter(company =>
      new RegExp(company, 'i').test(content)
    ).length;
    score += (companyMatches / companies.length) * 0.2;

    return Math.min(score, 1.0);
  }

  private static setProcessingHints(result: DocumentDetectionResult): DocumentDetectionResult {
    // Set processing hints based on detected type and available metadata
    switch (result.detectedType) {
      case 'paper':
      case 'medical-paper':
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

      case 'legal-doc':
      case 'case-law':
      case 'statute':
      case 'legal-brief':
        result.processingHints.extractFromUrl = true;
        break;

      case 'clinical-trial':
        if (result.metadata.clinicalTrialId) {
          result.processingHints.extractFromUrl = true;
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
   * Expand any detected URL lists into individual documents using UrlListParser
   */
  static async expandAllUrlLists(result: DocumentDetectionResult, content: string, fileName?: string): Promise<DocumentDetectionResult[]> {

    // Only process text files that could contain URL lists
    // Include 'paper', 'note', and 'unknown' types since markdown files might be detected as 'paper'
    if (!['note', 'unknown', 'paper'].includes(result.detectedType)) {
      return [result];
    }

    // Check if the file appears to be a markdown file or contains URLs
    const isMarkdownFile = fileName?.endsWith('.md') || fileName?.endsWith('.markdown');
    const hasUrls = /https?:\/\/[^\s]+/.test(content);


    if (!isMarkdownFile && !hasUrls) {
      return [result];
    }

    try {
      const urlListParser = new UrlListParser();
      const parseResult = urlListParser.parseMarkdownContent(content, fileName);


      if (!parseResult.isUrlList || parseResult.urls.length === 0) {
        return [result];
      }


      // Convert parsed URLs to DocumentDetectionResult format
      const expandedResults = parseResult.urls.map((urlItem, index) => {
        const documentResult: DocumentDetectionResult = {
          detectedType: urlItem.detectedType as DocumentDetectionResult['detectedType'],
          confidence: urlItem.confidence,
          title: urlItem.title,
          metadata: {
            sourceUrl: urlItem.url,
            originalListFile: fileName,
            originalListTitle: result.title,
            listType: parseResult.listType,
            // Set appropriate URL/identifier fields based on detected type
            ...(urlItem.detectedType === 'patent' && { patentUrl: urlItem.url }),
            ...(urlItem.metadata.isDoi && { doi: urlItem.metadata.canonicalData?.doi }),
            ...(urlItem.metadata.isArxiv && { arxivId: urlItem.metadata.canonicalData?.arxivId }),
            // For other types, store as generic URL
            ...(!urlItem.metadata.isDoi && !urlItem.metadata.isArxiv && urlItem.detectedType !== 'patent' && { urls: [urlItem.url] })
          },
          processingHints: {
            usePatentApi: urlItem.detectedType === 'patent',
            useGrobid: urlItem.detectedType === 'paper',
            extractFromUrl: true
          }
        };

        return documentResult;
      });

            return expandedResults;

    } catch (error) {
      console.warn(`Failed to expand URL list for ${fileName}:`, error);
      return [result];
    }
  }

  /**
   * Batch analyze multiple files
   */
  static async analyzeFiles(files: File[], targetPersona?: Persona): Promise<DocumentDetectionResult[]> {
    const results = await Promise.allSettled(
      files.map(file => this.analyzeFile(file, targetPersona))
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

    // Expand both patent URL lists and general URL lists
    const expandedResults: DocumentDetectionResult[] = [];

    for (let i = 0; i < basicResults.length; i++) {
      const result = basicResults[i];
      const file = files[i];


      // First check for patent URL expansion (existing logic)
      const patentExpanded = this.expandPatentUrls(result);

      // If patent expansion created multiple documents, use those
      if (patentExpanded.length > 1) {
        expandedResults.push(...patentExpanded);
      } else {
        // For single results, check for general URL list expansion
        try {
          const fileContent = await this.readFileContent(file);

          const urlExpanded = await this.expandAllUrlLists(result, fileContent, file.name);

          expandedResults.push(...urlExpanded);
        } catch (error) {
          console.warn(`Failed to read file content for URL expansion: ${file.name}`, error);
          expandedResults.push(result);
        }
      }
    }

    return expandedResults;
  }
}