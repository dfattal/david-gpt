/**
 * EXA API Client
 * 
 * Handles content extraction and summarization using EXA's API
 * for enhanced document processing with better structure and metadata.
 */

import type { 
  PatentMetadata, 
  DOIMetadata, 
  DocumentMetadata 
} from './types';

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
  async extractContent(urls: string[], summaryQuery?: string): Promise<ExaResult[]> {
    try {
      const request: ExaContentsRequest = {
        urls,
        text: true,
        summaryQuery: summaryQuery || 'Extract all relevant metadata, content, and structure'
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
        throw new Error(`EXA API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: ExaContentsResponse = await response.json();
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
      if (metadata.patentNumber) patentInfo.push(`Patent Number: ${metadata.patentNumber}`);
      if (metadata.inventors?.length) patentInfo.push(`Inventors: ${metadata.inventors.join(', ')}`);
      if (metadata.assignees?.length) patentInfo.push(`Assignee: ${metadata.assignees.join(', ')}`);
      if (metadata.filedDate) patentInfo.push(`Filed: ${metadata.filedDate.toDateString()}`);
      if (metadata.publishedDate) patentInfo.push(`Published: ${metadata.publishedDate.toDateString()}`);
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
        return null;
      }

      const result = results[0];
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
      title: result.title?.replace(/ - Google Patents$/, '') || 'Untitled Patent',
    };

    // Extract patent number from title or content
    const patentNoMatch = text.match(/US(\d{7,8}[A-Z]?\d*)/i) || result.title?.match(/US(\d{7,8}[A-Z]?\d*)/i);
    if (patentNoMatch) {
      metadata.patentNumber = `US${patentNoMatch[1]}`;
    }

    // Parse Google Patents structured info section
    const infoSection = text.match(/## Info([\s\S]*?)## Links/);
    if (infoSection) {
      const info = infoSection[1];
      console.log('🔍 Info section content for parsing:', info.substring(0, 800));
      
      // Extract inventors with more flexible patterns
      let inventorMatches = info.match(/Inventor[:\s]*([^A-Z]*?)(?:Current Assignee|Original Assignee|Priority date|Filing date|$)/s);
      if (!inventorMatches) {
        // Try alternative pattern
        inventorMatches = info.match(/Inventor[:\s]*([\s\S]*?)(?:Current|Original|Priority|Filing)/i);
      }
      
      if (inventorMatches) {
        console.log('🔍 Raw inventor match:', inventorMatches[1]);
        const inventorText = inventorMatches[1];
        
        // Split inventor names - they can be concatenated without separators
        // Look for patterns like "FirstName LastNameAnotherFirstName LastName"
        const inventors = [];
        
        // First try splitting by newlines
        let nameList = inventorText
          .split(/\n/)
          .map(name => name.trim())
          .filter(name => name && 
            name.length > 2 && 
            !name.toLowerCase().includes('assignee') && 
            !name.toLowerCase().includes('priority') &&
            !name.toLowerCase().includes('filing') &&
            !name.toLowerCase().includes('current') &&
            !name.toLowerCase().includes('original') &&
            !name.match(/^\d/)  // Skip lines starting with numbers
          );
        
        // If we get a single long string, try to split by capital letters pattern
        if (nameList.length === 1 && nameList[0].length > 20) {
          const singleString = nameList[0];
          console.log('🔍 Attempting to split concatenated names:', singleString);
          
          // Split by pattern: CapitalLetter followed by lowercase letters and space, then another CapitalLetter
          // This captures names like "Fetze PijlmanJan Van Der Horst" -> ["Fetze Pijlman", "Jan Van Der Horst"]
          const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=[A-Z][a-z]|$)/g;
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
      let currentAssigneeMatch = info.match(/Current Assignee[^)]*\)([^O]+?)(?:Original Assignee|Priority date|Filing date|$)/s);
      if (!currentAssigneeMatch) {
        currentAssigneeMatch = info.match(/Current Assignee[:\s]*([\s\S]*?)(?:Original|Priority|Filing)/i);
      }
      
      if (currentAssigneeMatch) {
        const assigneeText = currentAssigneeMatch[1].trim();
        metadata.assignees = [assigneeText];
        console.log('✅ Extracted current assignee:', assigneeText);
      }

      // Extract original assignee with more flexible pattern
      let originalAssigneeMatch = info.match(/Original Assignee[:\s]*([^P]+?)(?:Priority date|Filing date|$)/s);
      if (!originalAssigneeMatch) {
        originalAssigneeMatch = info.match(/Original Assignee[:\s]*([\s\S]*?)(?:Priority|Filing)/i);
      }
      
      if (originalAssigneeMatch) {
        const originalText = originalAssigneeMatch[1].trim();
        metadata.originalAssignee = originalText;
        console.log('✅ Extracted original assignee:', originalText);
      } else {
        console.log('❌ No original assignee matches found');
      }

      // Extract dates
      const priorityDateMatch = info.match(/Priority date[^)]*\)(\d{4}-\d{2}-\d{2})/);
      if (priorityDateMatch) {
        metadata.priorityDate = new Date(priorityDateMatch[1]);
      }

      const filingDateMatch = info.match(/Filing date(\d{4}-\d{2}-\d{2})/);
      if (filingDateMatch) {
        metadata.filedDate = new Date(filingDateMatch[1]);
      }

      const publicationDateMatch = info.match(/Publication date(\d{4}-\d{2}-\d{2})/);
      if (publicationDateMatch) {
        metadata.publishedDate = new Date(publicationDateMatch[1]);
      }

      // Extract expiration date from "expires YYYY-MM-DD" pattern
      const expirationMatch = info.match(/expires\s+(\d{4}-\d{2}-\d{2})/i);
      if (expirationMatch) {
        metadata.expirationDate = new Date(expirationMatch[1]);
        console.log('✅ Extracted expiration date:', expirationMatch[1]);
      }

      // Extract application number
      const appNoMatch = info.match(/US(\d+\/\d+,\d+|\d{2}\/\d{6,7})/);
      if (appNoMatch) {
        metadata.applicationNumber = `US${appNoMatch[1]}`;
      }
    }

    // Extract abstract from the structured Abstract section
    const abstractMatch = text.match(/## Abstract\s*\n\s*([^#]+?)(?:\n\s*##|$)/);
    if (abstractMatch) {
      metadata.abstract = abstractMatch[1].trim();
    }

    // Extract clean description from the Description section, excluding classification codes
    const descriptionMatch = text.match(/## Description\s*\n\s*([\s\S]+?)(?:\n\s*## Landscapes|$)/);
    if (descriptionMatch) {
      let description = descriptionMatch[1];
      
      // Remove Google Patents classification entries (lines with technical codes)
      description = description
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          // Filter out classification entries like "- 238000000034methodMethods0.000title..."
          return !trimmed.match(/^- \d{12}[a-zA-Z\s]*(?:Substances|Methods|Effects|Inorganic materials|Chemical compound)[\d.]+/);
        })
        .join('\n')
        .trim();
        
      metadata.description = description;
    }

    // Extract clean classifications from Classifications section
    const classificationsMatch = text.match(/## Classifications\s*\n\s*([\s\S]+?)(?:\n\s*## |$)/);
    if (classificationsMatch) {
      const classifications = classificationsMatch[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- ') && !line.includes('—') && line.length > 5)
        .map(line => line.replace(/^- /, '').trim());
      
      if (classifications.length > 0) {
        metadata.classification = classifications;
      }
    }

    // Extract patent status from the legal status section
    const statusMatch = text.match(/Legal status[^)]*\)([^,]+?)(?:,|expires|$)/i);
    if (statusMatch) {
      const status = statusMatch[1].toLowerCase().trim();
      metadata.status = status;
      console.log('✅ Extracted patent status:', status);
    }

    // Debug: Log available sections to understand EXA response structure
    const sectionHeaders = text.match(/## [^#\n]+/g);
    console.log('🔍 Available EXA sections:', sectionHeaders);

    // Extract claims from Claims section with multiple patterns
    let claimsMatch = text.match(/## Claims(?:\s*\(\d+\))?\s*\n\s*([^#]+?)(?:\n\s*##|$)/s);
    if (!claimsMatch) {
      // Try alternative patterns for claims
      claimsMatch = text.match(/Claims?\s*:?\s*\n\s*([^#]+?)(?:\n\s*##|What is claimed|$)/si);
    }
    if (!claimsMatch) {
      // Try "What is claimed" pattern (common in patents)
      claimsMatch = text.match(/What is claimed[^:]*:?\s*\n\s*([^#]+?)(?:\n\s*##|$)/si);
    }
    
    if (claimsMatch) {
      const claimsText = claimsMatch[1].trim();
      console.log('🔍 Raw claims text (first 500 chars):', claimsText.substring(0, 500));
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
        console.log('🔍 Standard numbering failed, trying alternative patterns...');
        
        // Try splitting by "numbered.\space" including escaped numbers like "1\\."  
        claimsArray = claimsText
          .split(/(?=\d+\\?\.\s)/) 
          .map(claim => claim.trim())
          .filter(claim => claim && claim.length > 10);
      }
      
      if (claimsArray.length <= 1) {
        console.log('🔍 Escaped numbering failed, trying newline + number pattern...');
        
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
          cleaned = cleaned.replace(/\s*US\d+\/\d+,?\d*\s*\d{4}-\d{2}-\d{2}.*$/, '');
          cleaned = cleaned.replace(/\s*\[?US\d+[A-Z]\d*\s*\(en\)\]?.*$/, '');
          cleaned = cleaned.replace(/\s*Active\d{4}-\d{2}-\d{2}.*$/, '');
          cleaned = cleaned.replace(/\s*Expired\s*-\s*Lifetime.*$/, '');
          
          // Remove any trailing patent URLs or metadata
          cleaned = cleaned.replace(/\s*https?:\/\/patents\.google\.com\/.*$/, '');
          
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
        .filter(claim => 
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
        console.log('✅ Extracted claims:', claimsArray.length, 'clean claims found');
      } else {
        console.log('❌ No valid claims could be extracted after cleanup');
      }
    } else {
      console.log('❌ No claims section found in any pattern');
    }

    return metadata;
  }

  /**
   * Parse general document metadata from EXA result
   */
  private parseDocumentMetadata(result: ExaResult, originalUrl: string): Partial<DocumentMetadata> {
    const metadata: Partial<DocumentMetadata> = {
      title: result.title,
      url: originalUrl,
      canonicalUrl: result.url,
    };

    // Extract publication date
    if (result.publishedDate) {
      metadata.publishedDate = new Date(result.publishedDate);
      metadata.isoDate = new Date(result.publishedDate);
    }

    // Extract author
    if (result.author) {
      metadata.authors = [result.author];
    }

    // Extract DOI
    const doiMatch = result.text.match(/doi\s*:?\s*([0-9]+\.[0-9]+\/[^\s]+)/i);
    if (doiMatch) {
      metadata.doi = doiMatch[1];
    }

    // Extract abstract or summary
    const abstractMatch = result.text.match(/(?:abstract|summary)\s*:?\s*([\s\S]+?)(?:\n\s*\n|introduction|keywords)/i);
    if (abstractMatch) {
      metadata.abstract = abstractMatch[1].trim();
    }

    // Extract journal/venue
    const journalMatch = result.text.match(/(?:journal|published\s+in|venue)\s*:?\s*([^.]+)/i);
    if (journalMatch) {
      metadata.journal = journalMatch[1].trim();
    }

    return metadata;
  }
}

// Export singleton instance
export const exaClient = new ExaClient();