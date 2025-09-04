/**
 * Google Patents JSON-LD Data Extractor
 * 
 * Extracts structured patent data from Google Patents URLs using JSON-LD metadata
 * without requiring PDF downloads. Provides rich metadata for patent documents.
 */

export interface PatentData {
  patentNumber: string;
  title: string;
  abstract: string;
  inventors: string[];
  assignees: string[];
  filingDate: string | null;
  publicationDate: string | null;
  grantDate: string | null;
  expirationDate: string | null;
  applicationNumber: string | null;
  publicationNumber: string | null;
  claims: string[];
  description: string;
  classification: string[];
  familyId: string | null;
  priorityDate: string | null;
  status: string;
  url: string;
}

export async function extractGooglePatentData(patentUrl: string): Promise<PatentData> {
  try {
    console.log(`🔍 Extracting patent data from: ${patentUrl}`);
    
    // Fetch the patent page
    const response = await fetch(patentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DavidGPT/1.0; RAG Document Processor)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch patent page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract JSON-LD structured data
    const jsonLdData = extractJsonLd(html);
    
    // Extract patent number from URL
    const patentNumber = extractPatentNumber(patentUrl);
    
    // Parse the HTML for additional data not in JSON-LD
    const htmlData = parsePatentHtml(html);
    
    // Combine all data sources
    const patentData: PatentData = {
      patentNumber: patentNumber || jsonLdData.identifier || 'Unknown',
      title: jsonLdData.name || htmlData.title || 'Untitled Patent',
      abstract: jsonLdData.abstract || htmlData.abstract || '',
      inventors: jsonLdData.inventor || htmlData.inventors || [],
      assignees: jsonLdData.assignee || htmlData.assignees || [],
      filingDate: jsonLdData.filingDate || htmlData.filingDate,
      publicationDate: jsonLdData.publicationDate || htmlData.publicationDate,
      grantDate: jsonLdData.grantDate || htmlData.grantDate,
      expirationDate: htmlData.expirationDate,
      applicationNumber: jsonLdData.applicationNumber || htmlData.applicationNumber,
      publicationNumber: jsonLdData.publicationNumber || htmlData.publicationNumber,
      claims: htmlData.claims || [],
      description: htmlData.description || jsonLdData.description || '',
      classification: jsonLdData.classification || htmlData.classification || [],
      familyId: htmlData.familyId,
      priorityDate: htmlData.priorityDate,
      status: htmlData.status || 'Unknown',
      url: patentUrl
    };

    console.log(`✅ Successfully extracted patent data: ${patentData.title}`);
    return patentData;

  } catch (error) {
    console.error(`❌ Failed to extract patent data from ${patentUrl}:`, error);
    
    // Return minimal data structure on error
    return {
      patentNumber: extractPatentNumber(patentUrl) || 'Unknown',
      title: `Patent ${extractPatentNumber(patentUrl) || 'Document'}`,
      abstract: 'Unable to extract patent abstract',
      inventors: [],
      assignees: [],
      filingDate: null,
      publicationDate: null,
      grantDate: null,
      expirationDate: null,
      applicationNumber: null,
      publicationNumber: null,
      claims: [],
      description: 'Unable to extract patent description',
      classification: [],
      familyId: null,
      priorityDate: null,
      status: 'Unknown',
      url: patentUrl
    };
  }
}

function extractPatentNumber(patentUrl: string): string | null {
  // Match various patent number formats in Google Patents URLs
  const patterns = [
    /patent\/([A-Z]{2}\d+[A-Z]\d*)/,  // US11281020B2
    /patent\/([A-Z]{2}\d{4}\d+[A-Z]\d+)/, // WO2024145265A1
    /patent\/([A-Z]{2}\d+)/,          // Simple format
  ];
  
  for (const pattern of patterns) {
    const match = patentUrl.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function extractJsonLd(html: string): any {
  try {
    // Find JSON-LD script tags
    const jsonLdRegex = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
    const matches = html.matchAll(jsonLdRegex);
    
    for (const match of matches) {
      try {
        const jsonData = JSON.parse(match[1]);
        
        // Look for patent-related structured data
        if (jsonData['@type'] === 'Patent' || 
            jsonData['@context'] === 'http://schema.org' ||
            jsonData.name || jsonData.inventor || jsonData.abstract) {
          return normalizeJsonLd(jsonData);
        }
      } catch (e) {
        // Skip invalid JSON
        continue;
      }
    }
    
    return {};
  } catch (error) {
    console.warn('Failed to extract JSON-LD:', error);
    return {};
  }
}

function normalizeJsonLd(data: any): any {
  return {
    identifier: data.identifier || data.patentNumber,
    name: data.name || data.title,
    abstract: data.abstract,
    description: data.description,
    inventor: Array.isArray(data.inventor) 
      ? data.inventor.map((inv: any) => typeof inv === 'string' ? inv : inv.name)
      : data.inventor ? [typeof data.inventor === 'string' ? data.inventor : data.inventor.name]
      : [],
    assignee: Array.isArray(data.assignee)
      ? data.assignee.map((ass: any) => typeof ass === 'string' ? ass : ass.name)
      : data.assignee ? [typeof data.assignee === 'string' ? data.assignee : data.assignee.name]
      : [],
    filingDate: data.filingDate || data.dateCreated,
    publicationDate: data.publicationDate || data.datePublished,
    grantDate: data.grantDate,
    applicationNumber: data.applicationNumber,
    publicationNumber: data.publicationNumber,
    classification: Array.isArray(data.classification) ? data.classification : []
  };
}

function parsePatentHtml(html: string): any {
  const data: any = {
    title: '',
    abstract: '',
    inventors: [],
    assignees: [],
    claims: [],
    description: '',
    classification: [],
    filingDate: null,
    publicationDate: null,
    grantDate: null,
    expirationDate: null,
    applicationNumber: null,
    publicationNumber: null,
    familyId: null,
    priorityDate: null,
    status: 'Unknown'
  };

  try {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      data.title = titleMatch[1].replace(/\s*-\s*Google Patents\s*$/, '').trim();
    }

    // Extract abstract (look for common patterns)
    const abstractPatterns = [
      /<div[^>]*class="[^"]*abstract[^"]*"[^>]*>\s*<div[^>]*>([^<]+)/i,
      /<section[^>]*class="[^"]*abstract[^"]*"[^>]*>.*?<p[^>]*>([^<]+)/i,
      /<div[^>]*id="[^"]*abstract[^"]*"[^>]*>.*?<p[^>]*>([^<]+)/i
    ];

    for (const pattern of abstractPatterns) {
      const match = html.match(pattern);
      if (match) {
        data.abstract = cleanText(match[1]);
        break;
      }
    }

    // Extract inventors (look for inventor sections)
    const inventorPattern = /<div[^>]*class="[^"]*inventor[^"]*"[^>]*>.*?<span[^>]*>([^<]+)/gi;
    let inventorMatch;
    while ((inventorMatch = inventorPattern.exec(html)) !== null) {
      data.inventors.push(cleanText(inventorMatch[1]));
    }

    // Extract assignees
    const assigneePattern = /<div[^>]*class="[^"]*assignee[^"]*"[^>]*>.*?<span[^>]*>([^<]+)/gi;
    let assigneeMatch;
    while ((assigneeMatch = assigneePattern.exec(html)) !== null) {
      data.assignees.push(cleanText(assigneeMatch[1]));
    }

    // Extract dates from metadata tables
    const datePatterns = [
      { key: 'filingDate', patterns: [/Filing date[^:]*:\s*([^<\n]+)/i, /Application filed[^:]*:\s*([^<\n]+)/i] },
      { key: 'publicationDate', patterns: [/Publication date[^:]*:\s*([^<\n]+)/i, /Published[^:]*:\s*([^<\n]+)/i] },
      { key: 'grantDate', patterns: [/Grant date[^:]*:\s*([^<\n]+)/i, /Granted[^:]*:\s*([^<\n]+)/i] },
      { key: 'priorityDate', patterns: [/Priority date[^:]*:\s*([^<\n]+)/i] }
    ];

    for (const { key, patterns } of datePatterns) {
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          data[key] = parseDate(match[1].trim());
          break;
        }
      }
    }

    // Extract claims (first few claims for content)
    const claimsPattern = /<div[^>]*class="[^"]*claims?[^"]*"[^>]*>.*?<div[^>]*>([^<]+)/gi;
    let claimMatch;
    let claimCount = 0;
    while ((claimMatch = claimsPattern.exec(html)) !== null && claimCount < 5) {
      data.claims.push(cleanText(claimMatch[1]));
      claimCount++;
    }

    // Extract description (first paragraph or section)
    const descriptionPatterns = [
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>.*?<p[^>]*>([^<]+)/i,
      /<section[^>]*class="[^"]*description[^"]*"[^>]*>.*?<p[^>]*>([^<]+)/i
    ];

    for (const pattern of descriptionPatterns) {
      const match = html.match(pattern);
      if (match) {
        data.description = cleanText(match[1]);
        break;
      }
    }

    return data;

  } catch (error) {
    console.warn('Failed to parse patent HTML:', error);
    return data;
  }
}

function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(dateStr: string): string | null {
  try {
    // Handle various date formats from Google Patents
    const cleanDate = dateStr.replace(/[^\d\-\/\s]/g, '').trim();
    const parsed = new Date(cleanDate);
    
    if (isNaN(parsed.getTime())) {
      return null;
    }
    
    return parsed.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  } catch {
    return null;
  }
}

export function formatPatentContent(patentData: PatentData): string {
  const sections = [
    `# ${patentData.title}`,
    '',
    `**Patent Number:** ${patentData.patentNumber}`,
    `**Filing Date:** ${patentData.filingDate || 'Unknown'}`,
    `**Publication Date:** ${patentData.publicationDate || 'Unknown'}`,
    patentData.grantDate ? `**Grant Date:** ${patentData.grantDate}` : null,
    patentData.status !== 'Unknown' ? `**Status:** ${patentData.status}` : null,
    '',
    '## Inventors',
    patentData.inventors.length > 0 ? patentData.inventors.join(', ') : 'None listed',
    '',
    '## Assignees',
    patentData.assignees.length > 0 ? patentData.assignees.join(', ') : 'None listed',
    '',
    '## Abstract',
    patentData.abstract || 'No abstract available',
    '',
    patentData.description ? '## Description' : null,
    patentData.description || null,
    '',
    patentData.claims.length > 0 ? '## Claims' : null,
    patentData.claims.length > 0 ? patentData.claims.map((claim, i) => `${i + 1}. ${claim}`).join('\n\n') : null,
    '',
    patentData.classification.length > 0 ? '## Classification' : null,
    patentData.classification.length > 0 ? patentData.classification.join(', ') : null
  ];

  return sections.filter(section => section !== null).join('\n').trim();
}