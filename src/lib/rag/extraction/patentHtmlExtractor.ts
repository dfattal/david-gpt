/**
 * Google Patents HTML Extraction
 * Extracts complete patent data from Google Patents HTML
 */

import { extractMetadataWithGemini } from './smartMetadataExtractor';
import { WebMetadata } from './documentAssembler';

export interface PatentDocument {
  patentNumber: string;
  title: string;
  abstract: string;
  background: string;
  summary: string;
  detailedDescription: string;
  claims: PatentClaim[];
  drawings: DrawingInfo[];
  metadata: WebMetadata;
  rawHtml?: string; // For debugging
}

export interface PatentClaim {
  number: number;
  text: string;
  isDependent: boolean;
  dependsOn?: number;
}

export interface DrawingInfo {
  figureNumber: string;
  description?: string;
}

/**
 * Extract complete patent document from Google Patents HTML
 */
export async function extractPatentFromHtml(
  patentNumber: string,
  geminiApiKey?: string
): Promise<PatentDocument> {
  const url = `https://patents.google.com/patent/${patentNumber}`;
  console.log(`\n📄 Fetching patent from Google Patents: ${url}`);

  // Fetch HTML
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch patent: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  console.log(`  ✓ Fetched HTML (${html.length} chars)`);

  // Extract structured metadata using Gemini
  let metadata: WebMetadata | null = null;
  if (geminiApiKey) {
    console.log('  🤖 Extracting metadata with Gemini...');
    metadata = await extractMetadataWithGemini(html, url, 'patent', geminiApiKey);
    if (metadata) {
      console.log('  ✓ Metadata extracted successfully');
    }
  }

  // Fallback: Extract basic metadata with regex if Gemini fails
  if (!metadata) {
    console.log('  ℹ Using regex-based metadata extraction');
    metadata = extractBasicMetadata(html, patentNumber);
  } else {
    // Ensure patent_number is present (derive from publication_number if missing)
    if (!metadata.identifiers) metadata.identifiers = {};
    if (!metadata.identifiers.patent_number) {
      if (metadata.identifiers.publication_number) {
        // Strip suffix from publication number to get patent number
        metadata.identifiers.patent_number = metadata.identifiers.publication_number.replace(/[AB][12]$/i, '');
      } else {
        // Use the input patent number
        metadata.identifiers.patent_number = patentNumber;
      }
      console.log(`  ✓ Derived patent_number: ${metadata.identifiers.patent_number}`);
    }

    // Always extract patent family with regex (appears late in HTML, may be truncated in Gemini prompt)
    const familyMetadata = extractPatentFamily(html, patentNumber);
    if (familyMetadata.length > 0) {
      metadata.identifiers.patent_family = familyMetadata;
      console.log(`  ✓ Extracted ${familyMetadata.length} patent family members`);
    }
  }

  // Extract content sections - ONLY Abstract, Description, and Claims
  console.log('  📝 Extracting content sections...');
  const title = extractTitle(html);
  const abstract = extractAbstract(html);
  const detailedDescription = extractCompleteDescription(html);
  const claims = extractClaims(html);

  console.log(`  ✓ Extracted: ${claims.length} claims`);
  console.log(`  ✓ Description: ${detailedDescription.length.toLocaleString()} chars`);

  return {
    patentNumber,
    title: title || metadata?.identifiers?.patent_number || patentNumber,
    abstract,
    background: '', // Not needed
    summary: '', // Not needed
    detailedDescription,
    claims,
    drawings: [], // Not needed
    metadata: metadata || { identifiers: { patent_number: patentNumber } },
  };
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string {
  // Try microdata first
  const microdataMatch = html.match(/itemprop="title"[^>]*>([^<]+)</i);
  if (microdataMatch) return microdataMatch[1].trim();

  // Try meta tag
  const metaMatch = html.match(/<meta\s+name="DC\.title"\s+content="([^"]+)"/i);
  if (metaMatch) return metaMatch[1].trim();

  // Try heading
  const headingMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (headingMatch) return headingMatch[1].trim();

  return '';
}

/**
 * Extract abstract from HTML
 */
function extractAbstract(html: string): string {
  // Look for abstract section
  const abstractMatch = html.match(/itemprop="abstract"[^>]*>([\s\S]*?)<\/(?:section|div)>/i);
  if (abstractMatch) {
    return cleanHtmlText(abstractMatch[1]);
  }

  // Fallback: look for "Abstract" heading
  const headingMatch = html.match(/<h\d[^>]*>Abstract<\/h\d>([\s\S]*?)<h\d/i);
  if (headingMatch) {
    return cleanHtmlText(headingMatch[1]);
  }

  return '';
}

/**
 * Extract complete Description section with all subheadings
 * Captures: FIELD, BACKGROUND, SUMMARY, BRIEF DESCRIPTION, DETAILED DESCRIPTION
 * Preserves subheading structure
 * Handles both US patents (<heading> tags) and WO patents (paragraph-based headings)
 */
function extractCompleteDescription(html: string): string {
  const sections: string[] = [];

  // Extract all description-related headings in order
  const descriptionHeadings = [
    'FIELD OF THE INVENTION',
    'BACKGROUND OF THE INVENTION',
    'BACKGROUND',
    'SUMMARY OF THE INVENTION',
    'SUMMARY',
    'BRIEF DESCRIPTION OF THE DRAWINGS',
    'DETAILED DESCRIPTION OF THE EMBODIMENTS',
    'DETAILED DESCRIPTION'
  ];

  for (const headingText of descriptionHeadings) {
    // Try US patent format (<heading> tags)
    const headingPattern = new RegExp(
      `<heading[^>]*>${headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</heading>([\\s\\S]*?)(?:<heading|<h2>Claims|<div\\s+id="CLM-|<claim-statement>|<section\\s+itemprop="events"|$)`,
      'i'
    );
    let headingMatch = html.match(headingPattern);

    if (!headingMatch) {
      // Try WO patent format (paragraph with heading text)
      const woPattern = new RegExp(
        `<div[^>]*class="description-paragraph"[^>]*>\\s*${headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</div>([\\s\\S]*?)(?:<div[^>]*class="description-paragraph"[^>]*>\\s*(?:FIELD|BACKGROUND|SUMMARY|BRIEF DESCRIPTION|DETAILED DESCRIPTION)|<h2>Claims|<div\\s+id="CLM-|<claim-statement>|$)`,
        'i'
      );
      headingMatch = html.match(woPattern);
    }

    if (headingMatch) {
      let text = headingMatch[1];
      // Remove trailing claims preamble text and timeline/events data if present
      text = text.replace(/\s*Claims\s*\(\d+\)\s*[\s\S]*$/i, '');
      text = text.replace(/\s*The invention claimed is:\s*$/i, '');
      text = text.replace(/\s*ASSIGNMENT OF ASSIGNORS[\s\S]*$/i, '');

      const cleanedText = cleanHtmlText(text);
      if (cleanedText.trim()) {
        // Add subheading and content
        sections.push(`## ${headingText}\n\n${cleanedText}`);
      }
    }
  }

  return sections.join('\n\n');
}

/**
 * Extract a named section from HTML (DEPRECATED - use extractCompleteDescription instead)
 */
function extractSection(html: string, sectionName: string): string {
  // Map section names to actual Google Patents headings
  const headingMap: Record<string, string> = {
    background: 'BACKGROUND OF THE INVENTION',
    summary: 'SUMMARY OF THE INVENTION',
    description: 'DETAILED DESCRIPTION OF THE EMBODIMENTS',
  };

  const headingText = headingMap[sectionName.toLowerCase()] || sectionName;

  // Try Google Patents <heading> tag
  const headingPattern = new RegExp(`<heading[^>]*>${headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</heading>([\\s\\S]*?)(?:<heading|<h2>Claims|<div\\s+id="CLM-|<claim-statement>|<section\\s+itemprop="events"|$)`, 'i');
  const headingMatch = html.match(headingPattern);
  if (headingMatch) {
    // Remove trailing claims preamble text and timeline/events data if present
    let text = headingMatch[1];
    // Remove "Claims (14)" type headers and any trailing claim preambles
    text = text.replace(/\s*Claims\s*\(\d+\)\s*[\s\S]*$/i, '');
    text = text.replace(/\s*The invention claimed is:\s*$/i, '');
    // Remove timeline/events data (ASSIGNMENT OF ASSIGNORS, etc.)
    text = text.replace(/\s*ASSIGNMENT OF ASSIGNORS[\s\S]*$/i, '');
    return cleanHtmlText(text);
  }

  // Fallback: Try itemprop attribute (but NOT for description - it's in events timeline)
  // Note: Some patents don't have these sections in Google Patents HTML at all
  if (sectionName !== 'description') {
    const propMatch = html.match(new RegExp(`itemprop="${sectionName}"[^>]*>([\\s\\S]*?)<\\/(?:section|div)>`, 'i'));
    if (propMatch) {
      return cleanHtmlText(propMatch[1]);
    }
  }

  // No content found - return empty (some patents genuinely don't have these sections)
  return '';
}

/**
 * Extract claims with structure
 */
function extractClaims(html: string): PatentClaim[] {
  const claims: PatentClaim[] = [];

  // Google Patents uses <div id="CLM-00001" class="claim"> structure
  const claimPattern = /<div\s+id="CLM-(\d+)"\s+num="(\d+)"\s+class="claim"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;

  while ((match = claimPattern.exec(html)) !== null) {
    const number = parseInt(match[2]);
    const claimHtml = match[3];

    // Extract complete text by cleaning HTML and removing tags
    // This handles nested <div class="claim-text"> structures properly
    let text = cleanHtmlText(claimHtml);

    // Remove claim number prefix if present at start
    text = text.replace(/^\d+\.\s*/, '');

    // Check if dependent (references another claim)
    const dependentMatch = text.match(/(?:according to|as claimed in|of)\s+claim\s+(\d+)/i);
    const isDependent = !!dependentMatch;
    const dependsOn = dependentMatch ? parseInt(dependentMatch[1]) : undefined;

    claims.push({ number, text, isDependent, dependsOn });
  }

  // Fallback: try itemprop="claims" section
  if (claims.length === 0) {
    const claimsMatch = html.match(/itemprop="claims"[^>]*>([\s\S]*?)<\/(?:section|div)>/i);
    if (claimsMatch) {
      return parseClaimsText(claimsMatch[1]);
    }

    // Last resort: look for "The invention claimed is:"
    const inventionMatch = html.match(/<claim-statement>The invention claimed is:<\/claim-statement>([\s\S]*?)(?:<\/claims>|$)/i);
    if (inventionMatch) {
      return parseClaimsText(inventionMatch[1]);
    }
  }

  return claims;
}

/**
 * Parse claims from plain text
 */
function parseClaimsText(text: string): PatentClaim[] {
  const claims: PatentClaim[] = [];
  const cleanText = cleanHtmlText(text);

  // Split by numbered claims
  const claimMatches = cleanText.matchAll(/(\d+)\.\s+([\s\S]*?)(?=\d+\.\s+|$)/g);

  for (const match of claimMatches) {
    const number = parseInt(match[1]);
    const text = match[2].trim();

    const dependentMatch = text.match(/(?:according to|as claimed in|of)\s+claim\s+(\d+)/i);
    const isDependent = !!dependentMatch;
    const dependsOn = dependentMatch ? parseInt(dependentMatch[1]) : undefined;

    claims.push({ number, text, isDependent, dependsOn });
  }

  return claims;
}

/**
 * Extract drawing/figure information with descriptions
 */
function extractDrawings(html: string): DrawingInfo[] {
  const drawings: DrawingInfo[] = [];

  // First, try to extract from "BRIEF DESCRIPTION OF THE DRAWINGS" section
  const descPattern = /<heading[^>]*>BRIEF DESCRIPTION OF THE DRAWINGS<\/heading>([\s\S]*?)(?:<heading|$)/i;
  const descMatch = html.match(descPattern);

  if (descMatch) {
    const descriptionsText = descMatch[1];

    // Extract individual figure descriptions from divs
    const figDivPattern = /<div[^>]*class="description-paragraph"[^>]*>\s*<figref[^>]*>(FIG(?:S)?\.?\s+([^<]+))<\/figref>\s+([^<]*(?:<[^>]+>[^<]*)*?)<\/div>/gi;
    let match;

    while ((match = figDivPattern.exec(descriptionsText)) !== null) {
      const figRef = match[1].trim(); // Full reference like "FIG. 1" or "FIGS. 3A and 3B"
      const figNumbers = match[2].trim(); // Just the numbers part
      let description = match[3].trim();

      // Clean the description - extract FIG references and remove other tags
      description = description.replace(/<figref[^>]*>(FIG(?:S)?\.?\s+[^<]+)<\/figref>/gi, '$1');
      description = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // Handle multiple figures (e.g., "FIGS. 3A and 3B")
      if (figNumbers.includes('and') || figNumbers.includes('&')) {
        const nums = figNumbers.split(/\s+(?:and|&)\s+/);
        nums.forEach(num => {
          drawings.push({
            figureNumber: num.trim(),
            description: description,
          });
        });
      } else {
        drawings.push({
          figureNumber: figNumbers.trim(),
          description: description,
        });
      }
    }
  }

  // Fallback: if no descriptions found, just list figure numbers
  if (drawings.length === 0) {
    const figurePattern = /(?:FIG\.|Figure)\s*(\d+[A-Z]*)/gi;
    const figureSet = new Set<string>();

    let match;
    while ((match = figurePattern.exec(html)) !== null) {
      figureSet.add(match[1]);
    }

    const figures = Array.from(figureSet).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      return numA - numB;
    });

    for (const fig of figures) {
      drawings.push({
        figureNumber: fig,
        description: undefined,
      });
    }
  }

  return drawings;
}

/**
 * Extract patent family from Worldwide applications table
 */
function extractPatentFamily(html: string, patentNumber: string): string[] {
  const family: string[] = [];

  // Look for country status entries in the patent family table
  const familyPattern = /<tr\s+itemprop="countryStatus"[\s\S]*?<span\s+itemprop="representativePublication">([^<]+)<\/span>/gi;
  let match;

  while ((match = familyPattern.exec(html)) !== null) {
    const familyRef = match[1].trim();
    // Skip the current US patent itself
    if (!familyRef.startsWith('US11281020') && !family.includes(familyRef)) {
      family.push(familyRef);
    }
  }

  return family;
}

/**
 * Extract basic metadata using regex (fallback)
 */
function extractBasicMetadata(html: string, patentNumber: string): WebMetadata {
  const metadata: WebMetadata = {
    identifiers: { patent_number: patentNumber },
    dates: {},
    actors: [],
  };

  // Extract publication number
  const pubMatch = html.match(/itemprop="publicationNumber"[^>]*>([^<]+)</i);
  if (pubMatch) {
    metadata.identifiers!.publication_number = pubMatch[1].trim();
  }

  // Extract application number
  const appMatch = html.match(/itemprop="applicationNumber"[^>]*>([^<]+)</i);
  if (appMatch) {
    metadata.identifiers!.application_number = appMatch[1].trim();
  }

  // Extract dates
  const priorityMatch = html.match(/itemprop="priorityDate"[^>]*datetime="([^"]+)"/i);
  if (priorityMatch) {
    metadata.dates!.priority = priorityMatch[1];
  }

  const filingMatch = html.match(/itemprop="filingDate"[^>]*datetime="([^"]+)"/i);
  if (filingMatch) {
    metadata.dates!.filing = filingMatch[1];
  }

  const pubDateMatch = html.match(/itemprop="publicationDate"[^>]*datetime="([^"]+)"/i);
  if (pubDateMatch) {
    metadata.dates!.publication = pubDateMatch[1];
  }

  const grantMatch = html.match(/itemprop="grantDate"[^>]*datetime="([^"]+)"/i);
  if (grantMatch) {
    metadata.dates!.granted = grantMatch[1];
  }

  // Extract inventors
  const inventorPattern = /<meta\s+name="DC\.contributor"\s+scheme="inventor"\s+content="([^"]+)"/gi;
  let inventorMatch;
  while ((inventorMatch = inventorPattern.exec(html)) !== null) {
    metadata.actors!.push({
      name: inventorMatch[1].trim(),
      role: 'inventor',
    });
  }

  // Extract assignees
  const currentAssigneeMatch = html.match(/itemprop="assigneeCurrent"[^>]*>([^<]+)</i);
  if (currentAssigneeMatch) {
    metadata.actors!.push({
      name: currentAssigneeMatch[1].trim(),
      role: 'current_assignee',
    });
  }

  const originalAssigneeMatch = html.match(/itemprop="assigneeOriginal"[^>]*>([^<]+)</i);
  if (originalAssigneeMatch) {
    metadata.actors!.push({
      name: originalAssigneeMatch[1].trim(),
      role: 'original_assignee',
    });
  }

  // Extract patent family (use the dedicated function)
  metadata.identifiers!.patent_family = extractPatentFamily(html, patentNumber);

  return metadata;
}

/**
 * Clean HTML text - remove tags, normalize whitespace
 */
function cleanHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '') // Remove scripts
    .replace(/<style[\s\S]*?<\/style>/gi, '') // Remove styles
    .replace(/<br\s*\/?>/gi, '\n') // Convert breaks to newlines
    .replace(/<\/p>/gi, '\n\n') // Convert paragraph ends to double newlines
    .replace(/<li[^>]*>/gi, '\n- ') // Convert list items
    .replace(/<[^>]+>/g, '') // Remove all other tags
    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim();
}
