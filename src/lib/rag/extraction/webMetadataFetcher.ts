/**
 * Web metadata fetching using Gemini API (primary) and regex (fallback)
 * Fetches metadata from arxiv.org, Google Patents, etc.
 */

import { WebMetadata } from './documentAssembler';
import { DocumentType } from '../ingestion/geminiProcessor';
import { extractMetadataWithGemini } from './smartMetadataExtractor';

const EXA_API_URL = 'https://api.exa.ai/search';

interface ExaSearchResult {
  results: Array<{
    url: string;
    title: string;
    text: string;
  }>;
}

/**
 * Fetch arxiv metadata from arxiv.org using Gemini (primary) and regex (fallback)
 */
export async function fetchArxivMetadata(
  arxivId: string,
  exaApiKey: string,
  geminiApiKey?: string
): Promise<WebMetadata | null> {
  console.log(`  Fetching arxiv metadata for ${arxivId} from arxiv.org...`);

  try {
    const url = `https://arxiv.org/abs/${arxivId}`;

    // Try Gemini smart extraction first (if API key provided)
    if (geminiApiKey) {
      try {
        const htmlResponse = await fetch(url);
        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          const geminiMetadata = await extractMetadataWithGemini(html, url, 'arxiv', geminiApiKey);
          if (geminiMetadata && Object.keys(geminiMetadata.identifiers || {}).length > 0) {
            return geminiMetadata;
          }
        }
      } catch (e) {
        console.log(`  Gemini extraction failed, falling back to regex...`);
      }
    }

    // Fallback to regex-based extraction
    let text = '';
    try {
      const htmlResponse = await fetch(url);
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();

        // Extract the submission history line which has the dates
        const submissionMatch = html.match(/\[Submitted on ([^\]]+)\]/);
        const revisionMatch = html.match(/last revised ([^\(]+)\(this version/);

        if (submissionMatch || revisionMatch) {
          text = `Submitted on ${submissionMatch?.[1] || ''} Last revised ${revisionMatch?.[1] || ''}`;
        }
      }
    } catch (e) {
      console.log(`  Direct fetch failed, trying EXA...`);
    }

    // Fallback to EXA if direct fetch didn't work
    if (!text) {
      const response = await fetch(EXA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': exaApiKey,
        },
        body: JSON.stringify({
          query: `arxiv ${arxivId}`,
          num_results: 1,
          use_autoprompt: false,
          contents: {
            text: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`EXA API error: ${response.status}`);
      }

      const data = await response.json() as ExaSearchResult;
      const result = data.results?.[0];

      if (!result) {
        console.warn(`  ⚠ No results from EXA for arxiv ${arxivId}`);
        return null;
      }

      text = result.text;
    }

    // Parse the text content to extract metadata
    const metadata: WebMetadata = {
      identifiers: { arxiv_id: arxivId },
      dates: {},
      actors: [],
    };

    // Extract DOI
    const doiMatch = text.match(/DOI:\s*(10\.\d+\/[^\s]+)/i) || text.match(/(10\.48550\/arXiv\.\d+\.\d+)/);
    if (doiMatch) {
      metadata.identifiers!.doi = doiMatch[1];
    }

    // Extract submission date - try multiple patterns
    let submittedMatch = text.match(/Submitted on ([^,\(]+)/i);
    if (!submittedMatch) {
      submittedMatch = text.match(/\[v\d+\]\s*(\w+,\s*\d+\s+\w+\s+\d{4})/i);
    }
    if (!submittedMatch) {
      // Try pattern: "21 Jan 2025" (without day name)
      submittedMatch = text.match(/(\d+\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    }
    if (submittedMatch) {
      const date = parseArxivDate(submittedMatch[1]);
      if (date) metadata.dates!.submitted = date;
    }

    // Extract updated/revised date
    let updatedMatch = text.match(/Last revised ([^,\(]+)/i);
    if (!updatedMatch) {
      updatedMatch = text.match(/last revised ([^\(]+)\(/i);
    }
    if (!updatedMatch) {
      updatedMatch = text.match(/\[v\d+\]\s*\w+,\s*\d+\s+\w+\s+\d{4}[^\]]*\(this version.*?(\w+,\s*\d+\s+\w+\s+\d{4})\)/i);
    }
    if (updatedMatch) {
      const date = parseArxivDate(updatedMatch[1]);
      if (date) metadata.dates!.updated = date;
    }

    // Extract authors
    const authorsMatch = text.match(/Authors?:\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i);
    if (authorsMatch) {
      const authors = parseAuthors(authorsMatch[1]);
      metadata.actors = authors.map(name => ({ name, role: 'author' }));
    }

    console.log(`  ✓ Arxiv metadata fetched successfully`);
    return metadata;
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch arxiv metadata: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fetch patent metadata from Google Patents using Gemini (primary) and regex (fallback)
 */
export async function fetchPatentMetadata(
  patentNumber: string,
  exaApiKey: string,
  geminiApiKey?: string
): Promise<WebMetadata | null> {
  console.log(`  Fetching patent metadata for ${patentNumber} from Google Patents...`);

  try {
    const url = `https://patents.google.com/patent/${patentNumber}`;

    // Try Gemini smart extraction first (if API key provided)
    if (geminiApiKey) {
      try {
        const htmlResponse = await fetch(url);
        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          const geminiMetadata = await extractMetadataWithGemini(html, url, 'patent', geminiApiKey);
          if (geminiMetadata && Object.keys(geminiMetadata.identifiers || {}).length > 0) {
            return geminiMetadata;
          }
        }
      } catch (e) {
        console.log(`  Gemini extraction failed, falling back to regex...`);
      }
    }

    // Fallback to regex-based extraction
    let html = '';
    try {
      const htmlResponse = await fetch(url);
      if (htmlResponse.ok) {
        html = await htmlResponse.text();
      }
    } catch (e) {
      console.log(`  Direct fetch failed, trying EXA...`);
    }

    // Fallback to EXA if direct fetch failed
    let text = '';
    if (!html) {
      const response = await fetch(EXA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': exaApiKey,
        },
        body: JSON.stringify({
          query: `${patentNumber} patent`,
          num_results: 1,
          use_autoprompt: false,
          contents: {
            text: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`EXA API error: ${response.status}`);
      }

      const data = await response.json() as ExaSearchResult;
      const result = data.results?.[0];

      if (!result) {
        console.warn(`  ⚠ No results from EXA for patent ${patentNumber}`);
        return null;
      }

      text = result.text;
    } else {
      // Parse HTML directly using structured data
      text = html;
    }

    const metadata: WebMetadata = {
      identifiers: { patent_number: patentNumber },
      dates: {},
      actors: [],
    };

    if (html) {
      // Extract from HTML meta tags and microdata

      // Extract publication number from itemprop
      const pubMatch = html.match(/itemprop="publicationNumber">([^<]+)</i);
      if (pubMatch) {
        metadata.identifiers!.publication_number = pubMatch[1];
      }

      // Extract inventors from meta tags (more reliable)
      const inventorMatches = html.matchAll(/<meta name="DC\.contributor" content="([^"]+)" scheme="inventor">/g);
      const inventors = Array.from(inventorMatches, m => m[1]);
      if (inventors.length > 0) {
        metadata.actors!.push(...inventors.map(name => ({ name, role: 'inventor' })));
      }

      // Fallback: extract from itemprop inventor
      if (metadata.actors!.length === 0) {
        const inventorItemProps = html.matchAll(/itemprop="inventor"[^>]*>([^<]+)</g);
        const inventorNames = Array.from(inventorItemProps, m => m[1].trim()).filter(Boolean);
        if (inventorNames.length > 0) {
          metadata.actors!.push(...inventorNames.map(name => ({ name, role: 'inventor' })));
        }
      }

      // Extract filing date from datetime attribute
      const filingMatch = html.match(/itemprop="filingDate" datetime="([^"]+)"/i);
      if (filingMatch) {
        metadata.dates!.filing = filingMatch[1]; // Already in ISO format
      }

      // Extract publication date
      const publicationMatch = html.match(/itemprop="publicationDate" datetime="([^"]+)"/i);
      if (publicationMatch) {
        metadata.dates!.publication = publicationMatch[1];
      }

      // Extract priority date
      const priorityMatch = html.match(/itemprop="priorityDate" datetime="([^"]+)"/i);
      if (priorityMatch) {
        metadata.dates!.priority = priorityMatch[1];
      }

      // Extract expiration date (actual expiration, not calculated)
      const expirationMatch = html.match(/itemprop="expiration" datetime="([^"]+)"/i);
      if (expirationMatch) {
        metadata.dates!.expiration = expirationMatch[1];
      }

      // Extract grant date (if available)
      const grantMatch = html.match(/itemprop="grantDate" datetime="([^"]+)"/i);
      if (grantMatch) {
        metadata.dates!.granted = grantMatch[1];
      }

      // Extract current assignee (most recent owner)
      const currentAssigneeMatch = html.match(/itemprop="assigneeCurrent"[^>]*>\s*([^<]+)/i);
      if (currentAssigneeMatch) {
        const name = currentAssigneeMatch[1].trim();
        if (name) {
          metadata.actors!.push({ name, role: 'current_assignee' });
        }
      }

      // Extract original assignee
      const originalAssigneeMatch = html.match(/itemprop="assigneeOriginal"[^>]*>([^<]+)</i);
      if (originalAssigneeMatch) {
        const name = originalAssigneeMatch[1].trim();
        if (name) {
          metadata.actors!.push({ name, role: 'original_assignee' });
        }
      }

      // Fallback: Extract from meta tag if no assignees found
      if (metadata.actors!.filter(a => a.role.includes('assignee')).length === 0) {
        const assigneeMetaMatch = html.match(/<meta name="DC\.contributor" content="([^"]+)" scheme="assignee">/);
        if (assigneeMetaMatch) {
          metadata.actors!.push({ name: assigneeMetaMatch[1], role: 'assignee' });
        }
      }
    } else {
      // Fallback to text parsing (EXA result)

      // Extract application number
      const appMatch = text.match(/Application[:\s]+([A-Z]{2}[\d,\/]+)/i);
      if (appMatch) {
        metadata.identifiers!.application_number = appMatch[1].replace(/,/g, '');
      }

      // Extract publication number
      const pubMatch = text.match(/Publication number[:\s]+([A-Z]{2}\d+[A-Z]\d*)/i);
      if (pubMatch) {
        metadata.identifiers!.publication_number = pubMatch[1];
      }

      // Extract dates
      const filingMatch = text.match(/Filing date[:\s]+(\w+\s+\d+,\s+\d{4})/i);
      if (filingMatch) {
        metadata.dates!.filing = parsePatentDate(filingMatch[1]);
      }

      const publicationMatch = text.match(/Publication date[:\s]+(\w+\s+\d+,\s+\d{4})/i);
      if (publicationMatch) {
        metadata.dates!.publication = parsePatentDate(publicationMatch[1]);
      }

      const grantMatch = text.match(/Grant date[:\s]+(\w+\s+\d+,\s+\d{4})/i);
      if (grantMatch) {
        metadata.dates!.granted = parsePatentDate(grantMatch[1]);
      }

      const priorityMatch = text.match(/Priority date[:\s]+(\w+\s+\d+,\s+\d{4})/i);
      if (priorityMatch) {
        metadata.dates!.priority = parsePatentDate(priorityMatch[1]);
      }

      // Calculate expiration
      if (metadata.dates?.filing) {
        const filingYear = parseInt(metadata.dates.filing.split('-')[0]);
        metadata.dates!.expiration = `${filingYear + 20}-${metadata.dates.filing.substring(5)}`;
      }

      // Extract inventors
      const inventorsMatch = text.match(/Inventors?[:\s]+([^\n]+(?:\n(?!Assignee|Current)[^\n]+)*)/i);
      if (inventorsMatch) {
        const inventors = parseInventors(inventorsMatch[1]);
        metadata.actors!.push(...inventors.map(name => ({ name, role: 'inventor' })));
      }

      // Extract assignees
      const assigneeMatch = text.match(/Original Assignee[:\s]+([^\n]+)/i) || text.match(/Assignee[:\s]+([^\n]+)/i);
      if (assigneeMatch) {
        metadata.actors!.push({ name: assigneeMatch[1].trim(), role: 'assignee' });
      }

      const currentAssigneeMatch = text.match(/Current Assignee[:\s]+([^\n]+)/i);
      if (currentAssigneeMatch && currentAssigneeMatch[1] !== assigneeMatch?.[1]) {
        metadata.actors!.push({ name: currentAssigneeMatch[1].trim(), role: 'current_assignee' });
      }
    }

    console.log(`  ✓ Patent metadata fetched successfully`);
    return metadata;
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch patent metadata: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Parse arxiv date format "Mon, 20 Jan 2025" to "2025-01-20"
 */
function parseArxivDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // Format: "Mon, 20 Jan 2025" or "20 Jan 2025"
  const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (!match) return null;

  const [, day, month, year] = match;
  const monthNum = months[month.toLowerCase().substring(0, 3)];
  if (!monthNum) return null;

  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Parse patent date format "Mar 22, 2022" to "2022-03-22"
 */
function parsePatentDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = dateStr.match(/(\w+)\s+(\d+),\s+(\d{4})/i);
  if (!match) return null;

  const [, month, day, year] = match;
  const monthNum = months[month.toLowerCase().substring(0, 3)];
  if (!monthNum) return null;

  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Parse author names from text
 */
function parseAuthors(authorText: string): string[] {
  // Split by comma, semicolon, or "and"
  const authors = authorText.split(/[,;]|\sand\s/).map(s => s.trim()).filter(Boolean);

  return authors
    .map(author => {
      // Remove affiliations in parentheses
      return author.replace(/\([^)]+\)/g, '').trim();
    })
    .filter(name => {
      // Must have at least 2 parts and start with capital
      return /^[A-Z][a-z]+(?:\s+[A-Z]\.?|\s+[A-Z][a-z]+)+/.test(name);
    });
}

/**
 * Parse inventor names from patent text
 */
function parseInventors(inventorText: string): string[] {
  // Split by comma or newline
  const inventors = inventorText.split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  return inventors
    .map(inv => {
      // Extract name before location (e.g., "John Smith, New York" -> "John Smith")
      const match = inv.match(/^([A-Z][a-z]+(?:\s+[A-Z]\.?|\s+[A-Z][a-z]+)+)/);
      return match ? match[1].trim() : inv.trim();
    })
    .filter(Boolean);
}
