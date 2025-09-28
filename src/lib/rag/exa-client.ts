/**
 * EXA API Client
 *
 * Handles content extraction and summarization using EXA's API
 * for enhanced document processing with better structure and metadata.
 */

import type { PatentMetadata, DOIMetadata, DocumentMetadata } from './types';
import { sanitizeDOI } from './doi-utils';

interface ExaContentsRequest {
  urls: string[];
  text?: boolean;
  highlights?: {
    highlightsPerUrl?: number;
    numSentences?: number;
    query?: string;
  };
  summary?: {
    query?: string;
  };
  summaryQuery?: string;
}

interface ExaContentsResponse {
  requestId: string;
  results: ExaResult[];
}

interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text: string;
  highlights?: string[];
  summary?: string;
}

export class ExaClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.exa.ai';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.EXA_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('EXA_API_KEY environment variable is required');
    }
  }

  /**
   * Extract content from URLs using EXA API
   */
  async extractContent(
    urls: string[],
    summaryQuery?: string
  ): Promise<ExaResult[]> {
    try {
      const request: ExaContentsRequest = {
        urls,
        text: true,
        summaryQuery:
          summaryQuery ||
          'Extract all relevant metadata, content, and structure',
      };

      const response = await fetch(`${this.baseUrl}/contents`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `EXA API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: ExaContentsResponse = await response.json();

      // Debug logging to understand what EXA is returning
      console.log('🔍 EXA API Response:', {
        requestId: data.requestId,
        resultCount: data.results.length,
        firstResult: data.results[0]
          ? {
              url: data.results[0].url,
              title: data.results[0].title,
              textLength: data.results[0].text?.length || 0,
              textPreview: data.results[0].text?.substring(0, 200) + '...',
              hasText: !!data.results[0].text,
              textIsUrl:
                data.results[0].text &&
                /^https?:\/\//.test(data.results[0].text.trim()),
            }
          : null,
      });

      return data.results;
    } catch (error) {
      console.error('Error extracting content with EXA:', error);
      throw error;
    }
  }

  /**
   * Process patent document using EXA
   */
  async processPatentDocument(patentUrl: string): Promise<{
    metadata: Partial<PatentMetadata>;
    content: string;
    rawText: string;
  } | null> {
    try {
      const summaryQuery = `Extract comprehensive patent information including: 
        - Patent number and publication details
        - Title and abstract
        - Inventors and assignees (current and original)
        - Priority date, filing date, publication date, grant date, expiration date
        - Patent status (active, expired, pending)
        - Full description including technical field, background, summary
        - Complete claims text
        - Classifications and citations
        - Application number and publication number`;

      const results = await this.extractContent([patentUrl], summaryQuery);
      if (!results.length) {
        return null;
      }

      const result = results[0];
      const metadata = this.parsePatentMetadata(result);

      // Clean up the content by extracting only the meaningful sections
      let cleanContent = '';

      // Add title and abstract
      if (metadata.title) {
        cleanContent += `# ${metadata.title}\n\n`;
      }

      if (metadata.abstract) {
        cleanContent += `## Abstract\n\n${metadata.abstract}\n\n`;
      }

      // Add clean description (already filtered in parsePatentMetadata)
      if (metadata.description) {
        cleanContent += `## Description\n\n${metadata.description}\n\n`;
      }

      // Add patent metadata
      const patentInfo = [];
      if (metadata.patentNumber)
        patentInfo.push(`Patent Number: ${metadata.patentNumber}`);
      if (metadata.inventors?.length)
        patentInfo.push(`Inventors: ${metadata.inventors.join(', ')}`);
      if (metadata.assignees?.length)
        patentInfo.push(`Assignee: ${metadata.assignees.join(', ')}`);
      if (metadata.filedDate)
        patentInfo.push(`Filed: ${metadata.filedDate.toDateString()}`);
      if (metadata.publishedDate)
        patentInfo.push(`Published: ${metadata.publishedDate.toDateString()}`);
      if (metadata.status) patentInfo.push(`Status: ${metadata.status}`);

      if (patentInfo.length > 0) {
        cleanContent += `## Patent Information\n\n${patentInfo.join('\n')}\n\n`;
      }

      // Add classifications if available
      if (metadata.classification?.length) {
        cleanContent += `## Classifications\n\n${metadata.classification.join('\n')}\n\n`;
      }

      return {
        metadata,
        content: cleanContent,
        rawText: cleanContent,
      };
    } catch (error) {
      console.error('Error processing patent with EXA:', error);
      return null;
    }
  }

  /**
   * Process academic paper or article using EXA
   */
  async processDocument(url: string): Promise<{
    metadata: Partial<DocumentMetadata>;
    content: string;
    rawText: string;
  } | null> {
    try {
      const summaryQuery = `Extract comprehensive document information including:
        - Title and authors
        - Publication date and venue/journal
        - Abstract or summary
        - Full text content with proper structure
        - Citations and references
        - DOI or other identifiers
        - Keywords and classifications`;

      const results = await this.extractContent([url], summaryQuery);
      if (!results.length) {
        console.warn(`🔍 EXA returned zero results for URL: ${url}`);
        return null;
      }

      const result = results[0];

      // Validate that EXA returned actual content, not just a URL
      if (!result.text || result.text.trim().length < 50) {
        console.warn(
          `🔍 EXA returned insufficient content for URL: ${url} (${result.text?.length || 0} chars)`
        );
        return null;
      }

      // Check if EXA returned just a URL (validation similar to ingestion service)
      const urlRegex = /^https?:\/\/[^\s]+$/;
      if (urlRegex.test(result.text.trim())) {
        console.warn(`🔍 EXA returned only URL for: ${url}`);
        return null;
      }

      const metadata = this.parseDocumentMetadata(result, url);

      return {
        metadata,
        content: result.text,
        rawText: result.text,
      };
    } catch (error) {
      console.error('Error processing document with EXA:', error);
      return null;
    }
  }

  /**
   * Parse patent-specific metadata from EXA result (Google Patents format)
   */
  private parsePatentMetadata(result: ExaResult): Partial<PatentMetadata> {
    const text = result.text;
    const metadata: Partial<PatentMetadata> = {
      title:
        result.title?.replace(/ - Google Patents$/, '') || 'Untitled Patent',
    };

    // Extract patent number from title or content
    const patentNoMatch =
      text.match(/US(\d{7,8}[A-Z]?\d*)/i) ||
      result.title?.match(/US(\d{7,8}[A-Z]?\d*)/i);
    if (patentNoMatch) {
      metadata.patentNumber = `US${patentNoMatch[1]}`;
    }

    // Parse Google Patents structured info section
    const infoSection = text.match(/## Info([\s\S]*?)## Links/);
    if (infoSection) {
      const info = infoSection[1];
      console.log(
        '🔍 Info section content for parsing:',
        info.substring(0, 800)
      );

      // Extract inventors with more flexible patterns
      let inventorMatches = info.match(
        /Inventor[:\s]*([^A-Z]*?)(?:Current Assignee|Original Assignee|Priority date|Filing date|$)/s
      );
      if (!inventorMatches) {
        // Try alternative pattern
        inventorMatches = info.match(
          /Inventor[:\s]*([\s\S]*?)(?:Current|Original|Priority|Filing)/i
        );
      }

      if (inventorMatches) {
        console.log('🔍 Raw inventor match:', inventorMatches[1]);
        const inventorText = inventorMatches[1];

        // Split inventor names - they can be concatenated without separators
        // Look for patterns like "FirstName LastNameAnotherFirstName LastName"
        const inventors = [];

        // First try splitting by newlines
        const nameList = inventorText
          .split(/\n/)
          .map(name => name.trim())
          .filter(
            name =>
              name &&
              name.length > 2 &&
              !name.toLowerCase().includes('assignee') &&
              !name.toLowerCase().includes('priority') &&
              !name.toLowerCase().includes('filing') &&
              !name.toLowerCase().includes('current') &&
              !name.toLowerCase().includes('original') &&
              !name.match(/^\d/) // Skip lines starting with numbers
          );

        // If we get a single long string, try to split by capital letters pattern
        if (nameList.length === 1 && nameList[0].length > 20) {
          const singleString = nameList[0];
          console.log(
            '🔍 Attempting to split concatenated names:',
            singleString
          );

          // Split by pattern: CapitalLetter followed by lowercase letters and space, then another CapitalLetter
          // This captures names like "Fetze PijlmanJan Van Der Horst" -> ["Fetze Pijlman", "Jan Van Der Horst"]
          const namePattern =
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=[A-Z][a-z]|$)/g;
          const matches = singleString.match(namePattern);

          if (matches && matches.length > 1) {
            inventors.push(...matches.map(name => name.trim()));
            console.log('✅ Split concatenated names:', inventors);
          } else {
            // Fallback: try to split by common name patterns
            // Split where a lowercase letter is followed by a capital letter
            const splitNames = singleString.split(/(?<=[a-z])(?=[A-Z])/);
            if (splitNames.length > 1) {
              inventors.push(...splitNames.map(name => name.trim()));
              console.log('✅ Split by letter pattern:', inventors);
            } else {
              inventors.push(singleString);
            }
          }
        } else {
          inventors.push(...nameList);
        }

        if (inventors.length > 0) {
          metadata.inventors = inventors;
          console.log('✅ Extracted inventors:', inventors);
        }
      } else {
        console.log('❌ No inventor matches found');
      }

      // Extract current assignee with more flexible pattern
      let currentAssigneeMatch = info.match(
        /Current Assignee[^)]*\)([^O]+?)(?:Original Assignee|Priority date|Filing date|$)/s
      );
      if (!currentAssigneeMatch) {
        currentAssigneeMatch = info.match(
          /Current Assignee[:\s]*([\s\S]*?)(?:Original|Priority|Filing)/i
        );
      }

      if (currentAssigneeMatch) {
        const assigneeText = currentAssigneeMatch[1].trim();
        metadata.assignees = [assigneeText];
        console.log('✅ Extracted current assignee:', assigneeText);
      }

      // Extract original assignee with more flexible pattern
      let originalAssigneeMatch = info.match(
        /Original Assignee[:\s]*([^P]+?)(?:Priority date|Filing date|$)/s
      );
      if (!originalAssigneeMatch) {
        originalAssigneeMatch = info.match(
          /Original Assignee[:\s]*([\s\S]*?)(?:Priority|Filing)/i
        );
      }

      if (originalAssigneeMatch) {
        const originalText = originalAssigneeMatch[1].trim();
        metadata.originalAssignee = originalText;
        console.log('✅ Extracted original assignee:', originalText);
      } else {
        console.log('❌ No original assignee matches found');
      }

      // Extract dates
      const priorityDateMatch = info.match(
        /Priority date[^)]*\)(\d{4}-\d{2}-\d{2})/
      );
      if (priorityDateMatch) {
        metadata.priorityDate = new Date(priorityDateMatch[1]);
      }

      const filingDateMatch = info.match(/Filing date(\d{4}-\d{2}-\d{2})/);
      if (filingDateMatch) {
        metadata.filedDate = new Date(filingDateMatch[1]);
      }

      const publicationDateMatch = info.match(
        /Publication date(\d{4}-\d{2}-\d{2})/
      );
      if (publicationDateMatch) {
        metadata.publishedDate = new Date(publicationDateMatch[1]);
      }

      // Extract expiration date from various patterns
      let expirationDate: Date | undefined;

      // Pattern 1: "expires YYYY-MM-DD"
      const expirationMatch = info.match(/expires\s+(\d{4}-\d{2}-\d{2})/i);
      if (expirationMatch) {
        expirationDate = new Date(expirationMatch[1]);
        console.log(
          '✅ Extracted expiration date from "expires" pattern:',
          expirationMatch[1]
        );
      }

      // Pattern 2: "Expiration: YYYY-MM-DD" or "Expiration date: YYYY-MM-DD"
      if (!expirationDate) {
        const expireDateMatch = info.match(
          /Expiration(?:\s+date)?[:\s]*(\d{4}-\d{2}-\d{2})/i
        );
        if (expireDateMatch) {
          expirationDate = new Date(expireDateMatch[1]);
          console.log(
            '✅ Extracted expiration date from "Expiration date" pattern:',
            expireDateMatch[1]
          );
        }
      }

      // Pattern 3: Look in Legal status section for expiration info
      if (!expirationDate) {
        const legalStatusMatch = text.match(
          /Legal status[^)]*\).*?expir.*?(\d{4}-\d{2}-\d{2})/i
        );
        if (legalStatusMatch) {
          expirationDate = new Date(legalStatusMatch[1]);
          console.log(
            '✅ Extracted expiration date from Legal status:',
            legalStatusMatch[1]
          );
        }
      }

      // Calculate expiration date if not found but we have filing date
      if (!expirationDate && metadata.filedDate) {
        // US utility patents typically expire 20 years from filing date
        expirationDate = new Date(metadata.filedDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 20);
        metadata.expirationIsEstimate = true;
        console.log(
          '📊 Calculated expiration date (20 years from filing):',
          expirationDate.toISOString().split('T')[0]
        );
      }

      // Calculate from priority date if filing date is not available
      if (!expirationDate && metadata.priorityDate) {
        expirationDate = new Date(metadata.priorityDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 20);
        metadata.expirationIsEstimate = true;
        console.log(
          '📊 Calculated expiration date (20 years from priority):',
          expirationDate.toISOString().split('T')[0]
        );
      }

      if (expirationDate) {
        metadata.expirationDate = expirationDate;
      }

      // Extract application number
      const appNoMatch = info.match(/US(\d+\/\d+,\d+|\d{2}\/\d{6,7})/);
      if (appNoMatch) {
        metadata.applicationNumber = `US${appNoMatch[1]}`;
      }
    }

    // Extract abstract from the structured Abstract section
    const abstractMatch = text.match(
      /## Abstract\s*\n\s*([^#]+?)(?:\n\s*##|$)/
    );
    if (abstractMatch) {
      metadata.abstract = abstractMatch[1].trim();
    }

    // Extract clean description from the Description section, excluding classification codes
    const descriptionMatch = text.match(
      /## Description\s*\n\s*([\s\S]+?)(?:\n\s*## Landscapes|$)/
    );
    if (descriptionMatch) {
      let description = descriptionMatch[1];

      // Remove Google Patents classification entries (lines with technical codes)
      description = description
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          // Filter out classification entries like "- 238000000034methodMethods0.000title..."
          return !trimmed.match(
            /^- \d{12}[a-zA-Z\s]*(?:Substances|Methods|Effects|Inorganic materials|Chemical compound)[\d.]+/
          );
        })
        .join('\n')
        .trim();

      metadata.description = description;
    }

    // Extract clean classifications from Classifications section
    const classificationsMatch = text.match(
      /## Classifications\s*\n\s*([\s\S]+?)(?:\n\s*## |$)/
    );
    if (classificationsMatch) {
      const classifications = classificationsMatch[1]
        .split('\n')
        .map(line => line.trim())
        .filter(
          line =>
            line.startsWith('- ') && !line.includes('—') && line.length > 5
        )
        .map(line => line.replace(/^- /, '').trim());

      if (classifications.length > 0) {
        metadata.classification = classifications;
      }
    }

    // Extract patent status from the legal status section
    const statusMatch = text.match(
      /Legal status[^)]*\)([^,]+?)(?:,|expires|$)/i
    );
    if (statusMatch) {
      const status = statusMatch[1].toLowerCase().trim();
      metadata.status = status;
      console.log('✅ Extracted patent status:', status);
    }

    // Debug: Log available sections to understand EXA response structure
    const sectionHeaders = text.match(/## [^#\n]+/g);
    console.log('🔍 Available EXA sections:', sectionHeaders);

    // Extract claims from Claims section with multiple patterns
    let claimsMatch = text.match(
      /## Claims(?:\s*\(\d+\))?\s*\n\s*([^#]+?)(?:\n\s*##|$)/s
    );
    if (!claimsMatch) {
      // Try alternative patterns for claims
      claimsMatch = text.match(
        /Claims?\s*:?\s*\n\s*([^#]+?)(?:\n\s*##|What is claimed|$)/is
      );
    }
    if (!claimsMatch) {
      // Try "What is claimed" pattern (common in patents)
      claimsMatch = text.match(
        /What is claimed[^:]*:?\s*\n\s*([^#]+?)(?:\n\s*##|$)/is
      );
    }

    if (claimsMatch) {
      const claimsText = claimsMatch[1].trim();
      console.log(
        '🔍 Raw claims text (first 500 chars):',
        claimsText.substring(0, 500)
      );
      console.log('🔍 Full claims text length:', claimsText.length);

      // Enhanced splitting logic to handle different numbering formats
      let claimsArray = [];

      // First try standard numbered claims (1., 2., 3., etc.)
      claimsArray = claimsText
        .split(/(?=\d+\.\s)/) // Split before numbered claims like "1. ", "2. ", etc.
        .map(claim => claim.trim())
        .filter(claim => claim && claim.length > 10);

      // If that doesn't work well, try alternative patterns
      if (claimsArray.length <= 1) {
        console.log(
          '🔍 Standard numbering failed, trying alternative patterns...'
        );

        // Try splitting by "numbered.\space" including escaped numbers like "1\\."
        claimsArray = claimsText
          .split(/(?=\d+\\?\.\s)/)
          .map(claim => claim.trim())
          .filter(claim => claim && claim.length > 10);
      }

      if (claimsArray.length <= 1) {
        console.log(
          '🔍 Escaped numbering failed, trying newline + number pattern...'
        );

        // Try splitting by newlines followed by numbers
        claimsArray = claimsText
          .split(/\n(?=\d+\.?\s)/)
          .map(claim => claim.trim())
          .filter(claim => claim && claim.length > 10);
      }

      // Enhanced cleanup of claim text to remove junk and format properly
      claimsArray = claimsArray
        .map(claim => {
          // Clean up claim text by removing extra whitespace and line breaks
          let cleaned = claim.replace(/\s+/g, ' ').trim();

          // Remove patent metadata junk that gets appended (application numbers, dates, etc.)
          cleaned = cleaned.replace(
            /\s*US\d+\/\d+,?\d*\s*\d{4}-\d{2}-\d{2}.*$/,
            ''
          );
          cleaned = cleaned.replace(/\s*\[?US\d+[A-Z]\d*\s*\(en\)\]?.*$/, '');
          cleaned = cleaned.replace(/\s*Active\d{4}-\d{2}-\d{2}.*$/, '');
          cleaned = cleaned.replace(/\s*Expired\s*-\s*Lifetime.*$/, '');

          // Remove any trailing patent URLs or metadata
          cleaned = cleaned.replace(
            /\s*https?:\/\/patents\.google\.com\/.*$/,
            ''
          );

          // Remove incomplete sentences at the end (likely cut-off metadata)
          if (cleaned.includes('US') && cleaned.match(/US\d+/)) {
            const lastUSIndex = cleaned.lastIndexOf('US');
            // If the last 'US' appears to be followed by numbers/metadata, truncate there
            if (lastUSIndex > cleaned.length * 0.8) {
              cleaned = cleaned.substring(0, lastUSIndex).trim();
            }
          }

          return cleaned;
        })
        .filter(
          claim =>
            claim &&
            claim.length > 20 && // Must be substantial
            !claim.match(/^US\d+/) && // Don't start with patent numbers
            !claim.includes('patents.google.com') // No URLs
        );

      console.log('🔍 Claims after cleanup (showing first 3):');
      claimsArray.slice(0, 3).forEach((claim, i) => {
        console.log(`  Claim ${i + 1}: ${claim.substring(0, 150)}...`);
      });

      if (claimsArray.length > 0) {
        // Store as clean JSON array
        metadata.claims = claimsArray;
        console.log(
          '✅ Extracted claims:',
          claimsArray.length,
          'clean claims found'
        );
      } else {
        console.log('❌ No valid claims could be extracted after cleanup');
      }
    } else {
      console.log('❌ No claims section found in any pattern');
    }

    return metadata;
  }

  /**
   * Parse enhanced academic document metadata from EXA result
   */
  private parseDocumentMetadata(
    result: ExaResult,
    originalUrl: string
  ): Partial<DocumentMetadata> {
    const metadata: Partial<DocumentMetadata> = {
      title: result.title,
      url: originalUrl,
      canonicalUrl: result.url,
    };

    // Enhanced publication date extraction with multiple patterns
    let pubDate: Date | undefined;

    if (result.publishedDate) {
      pubDate = new Date(result.publishedDate);
    } else {
      // Try to extract date from text content
      const datePatterns = [
        // Standard ISO dates
        /(\d{4}-\d{2}-\d{2})/g,
        // Month Day, Year format
        /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gi,
        // Day Month Year format
        /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/gi,
        // Published/Posted patterns
        /(?:published|posted|updated|created)\s*:?\s*([^.\n]+?(?:20\d{2}|19\d{2}))/gi,
        // Date in metadata patterns
        /(?:date|time)\s*[:=]\s*["']?([^"'\n]+?(?:20\d{2}|19\d{2}))/gi,
      ];

      for (const pattern of datePatterns) {
        const matches = result.text.match(pattern);
        if (matches) {
          for (const match of matches) {
            const parsedDate = new Date(
              match.replace(/^(published|posted|updated|created)\s*:?\s*/i, '')
            );
            if (
              !isNaN(parsedDate.getTime()) &&
              parsedDate.getFullYear() > 1990 &&
              parsedDate.getFullYear() <= new Date().getFullYear()
            ) {
              pubDate = parsedDate;
              console.log(
                '✅ Extracted publication date from text:',
                match,
                '→',
                pubDate.toISOString().split('T')[0]
              );
              break;
            }
          }
          if (pubDate) break;
        }
      }
    }

    if (pubDate && !isNaN(pubDate.getTime())) {
      metadata.publishedDate = pubDate;
      metadata.isoDate = pubDate;
      metadata.publicationYear = pubDate.getFullYear();
    }

    // First, try to extract structured data from JSON-LD and OpenGraph
    this.extractStructuredMetadata(result.text, metadata);

    // Enhanced author extraction with affiliations
    const authorsAffiliations: Array<{ name: string; affiliation?: string }> =
      [];

    if (result.author) {
      authorsAffiliations.push({ name: result.author });
    }

    // Try to extract multiple authors from text with enhanced patterns
    const authorPatterns = [
      // Academic paper patterns
      /(?:authors?|by)\s*:?\s*([^.\n]+?)(?:\n|abstract|introduction|$)/i,
      // News article bylines
      /(?:by|written by|author)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/i,
      // Multiple author formats
      /([A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)*)/g,
      // Simple name patterns
      /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*)/g,
      // Blog post patterns
      /(?:posted by|published by)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    ];

    for (const pattern of authorPatterns) {
      const matches = result.text.match(pattern);
      if (matches) {
        const authorText = matches[1] || matches[0];
        const authorNames = authorText
          .split(/[,;]|(?:\s+and\s+)|(?:\s*&\s*)/)
          .map(name => name.trim())
          .filter(
            name =>
              name.length > 3 &&
              name.length < 100 &&
              /^[A-Z]/.test(name) &&
              !name.includes('@') && // Skip email addresses
              !name.includes('http') && // Skip URLs
              !/^\d/.test(name) // Skip numbers
          );

        authorNames.forEach(name => {
          // Extract potential affiliation in parentheses
          const affiliationMatch = name.match(/^([^(]+)\s*\(([^)]+)\)$/);
          if (affiliationMatch) {
            const cleanName = affiliationMatch[1].trim();
            const affiliation = affiliationMatch[2].trim();
            if (!authorsAffiliations.some(a => a.name === cleanName)) {
              authorsAffiliations.push({ name: cleanName, affiliation });
            }
          } else {
            if (!authorsAffiliations.some(a => a.name === name)) {
              authorsAffiliations.push({ name });
            }
          }
        });

        if (authorNames.length > 0) {
          console.log(
            '✅ Extracted authors from pattern:',
            pattern.source,
            '→',
            authorNames
          );
          break; // Use first successful pattern
        }
      }
    }

    if (authorsAffiliations.length > 0) {
      metadata.authorsAffiliations = authorsAffiliations;
    }

    // Extract DOI with multiple patterns
    const doiPatterns = [
      /doi\s*:?\s*([0-9]{2}\.[0-9]{4}\/[^\s]+)/i,
      /https?:\/\/doi\.org\/([0-9]{2}\.[0-9]{4}\/[^\s]+)/i,
      /DOI:\s*([0-9]{2}\.[0-9]{4}\/[^\s]+)/i,
    ];

    for (const pattern of doiPatterns) {
      const doiMatch = result.text.match(pattern);
      if (doiMatch) {
        // Clean the DOI using centralized sanitization
        const rawDoi = doiMatch[1];
        const cleanedDoi = sanitizeDOI(rawDoi);
        if (cleanedDoi) {
          metadata.doi = cleanedDoi;
        }
        break;
      }
    }

    // Extract arXiv ID
    const arxivMatch = result.text.match(
      /arxiv\s*:?\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i
    );
    if (arxivMatch) {
      metadata.arxivId = arxivMatch[1];
    }

    // Enhanced abstract extraction
    const abstractPatterns = [
      /(?:abstract|summary)\s*:?\s*([\s\S]+?)(?:\n\s*\n|introduction|keywords|1\.|I\.)/i,
      /abstract\s*\n([\s\S]+?)(?:\n\s*introduction|\n\s*keywords|\n\s*1\.)/i,
    ];

    for (const pattern of abstractPatterns) {
      const abstractMatch = result.text.match(pattern);
      if (abstractMatch) {
        const abstract = abstractMatch[1]
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 2000); // Limit abstract length

        if (abstract.length > 50) {
          metadata.abstract = abstract;
          break;
        }
      }
    }

    // Enhanced venue/journal extraction with multiple patterns
    const venuePatterns = [
      // Academic paper patterns
      /(?:published\s+in|appeared\s+in|in\s+proceedings\s+of)\s*:?\s*([^.\n]+)/i,
      /(?:journal|conference|venue|publication)\s*:?\s*([^.\n]+)/i,
      /(?:Proceedings\s+of\s+the\s+)([^.\n]+)/i,
      // News/magazine patterns
      /(?:source|publication|magazine|newspaper)\s*:?\s*([^.\n]+)/i,
      // Conference acronyms like "CVPR 2024", "ICML 2023"
      /\b([A-Z]{3,8}\s*['"']?\d{4}['"']?)\b/g,
      // Journal names in italics or quotes
      /(?:in\s+)?['"'""]([^'"'""\n]+)['"'""](?:\s*journal|\s*magazine|\s*,|\s*\.)/i,
      // Nature, Science, etc patterns
      /\b(Nature|Science|Cell|PNAS|IEEE|ACM|Springer|Elsevier)\s+([A-Za-z\s]+)/i,
    ];

    for (const pattern of venuePatterns) {
      const venueMatches = result.text.match(pattern);
      if (venueMatches) {
        let venue = venueMatches[1]?.trim();
        if (!venue && venueMatches.length > 2) {
          venue = `${venueMatches[1]} ${venueMatches[2]}`.trim();
        }

        if (venue && venue.length > 3 && venue.length < 200) {
          // Clean up venue name
          venue = venue
            .replace(/[.,;:]$/, '') // Remove trailing punctuation
            .replace(/^\s*["']|["']\s*$/g, '') // Remove quotes
            .trim();

          if (venue.length > 3) {
            metadata.venue = venue;
            console.log('✅ Extracted venue:', venue);
            break;
          }
        }
      }
    }

    // Extract keywords
    const keywordsMatch = result.text.match(
      /(?:keywords|key\s+words)\s*:?\s*([^.\n]+)/i
    );
    if (keywordsMatch) {
      const keywords = keywordsMatch[1]
        .split(/[,;]/)
        .map(k => k.trim())
        .filter(k => k.length > 2 && k.length < 50);

      if (keywords.length > 0) {
        metadata.keywords = keywords;
      }
    }

    // Extract citation count (if mentioned)
    const citationMatch = result.text.match(
      /(?:cited\s+by|citations?)\s*:?\s*([0-9]+)/i
    );
    if (citationMatch) {
      metadata.citationCount = parseInt(citationMatch[1]);
    }

    // Determine document status based on URL and content
    let status = 'Published';
    if (originalUrl.includes('arxiv.org')) {
      status = 'Preprint';
    } else if (
      result.text.toLowerCase().includes('accepted') &&
      result.text.toLowerCase().includes('review')
    ) {
      status = 'Accepted';
    } else if (
      result.text.toLowerCase().includes('under review') ||
      result.text.toLowerCase().includes('submitted')
    ) {
      status = 'In Review';
    }

    // Detect open access indicators
    const openAccessIndicators = [
      /open\s+access/i,
      /creative\s+commons/i,
      /cc\s+by/i,
      /freely\s+available/i,
    ];

    metadata.openAccess = openAccessIndicators.some(pattern =>
      pattern.test(result.text)
    );

    return metadata;
  }

  /**
   * Extract structured metadata from JSON-LD, OpenGraph, and other structured data
   */
  private extractStructuredMetadata(
    text: string,
    metadata: Partial<DocumentMetadata>
  ): void {
    // Extract JSON-LD structured data
    const jsonLdMatches = text.match(
      /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonContent = match
            .replace(/<script[^>]*>/i, '')
            .replace(/<\/script>/i, '');
          const structuredData = JSON.parse(jsonContent);

          if (structuredData['@type']) {
            this.extractFromJsonLd(structuredData, metadata);
          }
        } catch (error) {
          console.warn('Failed to parse JSON-LD:', error);
        }
      }
    }

    // Extract OpenGraph meta tags
    const metaTagPattern =
      /<meta\s+(?:property|name)\s*=\s*["']([^"']+)["']\s+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let metaMatch;
    while ((metaMatch = metaTagPattern.exec(text)) !== null) {
      const property = metaMatch[1];
      const content = metaMatch[2];

      switch (property) {
        case 'og:title':
        case 'twitter:title':
          if (!metadata.title || metadata.title.length < content.length) {
            metadata.title = content;
          }
          break;
        case 'og:description':
        case 'twitter:description':
        case 'description':
          if (!metadata.abstract) {
            metadata.abstract = content.substring(0, 2000);
          }
          break;
        case 'article:author':
        case 'og:author':
          if (!metadata.authorsAffiliations) {
            metadata.authorsAffiliations = [{ name: content }];
          }
          break;
        case 'article:published_time':
        case 'og:published_time':
          if (!metadata.publishedDate) {
            const pubDate = new Date(content);
            if (!isNaN(pubDate.getTime())) {
              metadata.publishedDate = pubDate;
              metadata.isoDate = pubDate;
              metadata.publicationYear = pubDate.getFullYear();
            }
          }
          break;
        case 'article:section':
        case 'og:site_name':
          if (!metadata.venue) {
            metadata.venue = content;
          }
          break;
      }
    }
  }

  /**
   * Extract metadata from JSON-LD structured data
   */
  private extractFromJsonLd(
    data: any,
    metadata: Partial<DocumentMetadata>
  ): void {
    const type = Array.isArray(data['@type'])
      ? data['@type'][0]
      : data['@type'];

    switch (type) {
      case 'Article':
      case 'NewsArticle':
      case 'ScholarlyArticle':
        if (
          data.headline &&
          (!metadata.title || metadata.title.length < data.headline.length)
        ) {
          metadata.title = data.headline;
        }

        if (data.abstract && !metadata.abstract) {
          metadata.abstract = data.abstract.substring(0, 2000);
        }

        if (data.author && !metadata.authorsAffiliations) {
          const authors = Array.isArray(data.author)
            ? data.author
            : [data.author];
          metadata.authorsAffiliations = authors.map((author: any) => ({
            name:
              typeof author === 'string'
                ? author
                : author.name || author.givenName + ' ' + author.familyName,
            affiliation:
              typeof author === 'object' ? author.affiliation?.name : undefined,
          }));
        }

        if (data.datePublished && !metadata.publishedDate) {
          const pubDate = new Date(data.datePublished);
          if (!isNaN(pubDate.getTime())) {
            metadata.publishedDate = pubDate;
            metadata.isoDate = pubDate;
            metadata.publicationYear = pubDate.getFullYear();
          }
        }

        if (data.publisher && !metadata.venue) {
          metadata.venue =
            typeof data.publisher === 'string'
              ? data.publisher
              : data.publisher.name;
        }

        if (data.keywords && !metadata.keywords) {
          const keywords = Array.isArray(data.keywords)
            ? data.keywords
            : [data.keywords];
          metadata.keywords = keywords
            .map(k => (typeof k === 'string' ? k : k.name))
            .filter(k => k);
        }
        break;

      case 'Organization':
      case 'Person':
        // Can extract author information for cross-referencing
        break;
    }
  }
}

// Export singleton instance
export const exaClient = new ExaClient();
