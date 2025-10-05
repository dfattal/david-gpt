/**
 * Patent Gemini Extractor - Hybrid Approach
 * HTML regex for metadata + Gemini 2.5 Pro for content (with smart chunking)
 */

export interface PatentExtractedData {
  title: string;
  abstract: string;
  background: string;
  summary: string;
  detailedDescription: string;
  claims: Array<{
    number: number;
    text: string;
    isDependent: boolean;
    dependsOn?: number;
  }>;
  figures: Array<{
    figureNumber: string;
    description?: string;
  }>;
  metadata: {
    identifiers?: {
      patent_number?: string;
      publication_number?: string;
      application_number?: string;
      patent_family?: string[];
    };
    dates?: {
      priority?: string;
      filing?: string;
      publication?: string;
      granted?: string;
      expiration?: string;
    };
    actors?: Array<{
      name: string;
      role: string;
    }>;
    summary?: string;
    key_terms?: string;
  };
}

/**
 * Extract metadata from HTML using regex (expiration dates, assignees, etc.)
 */
function extractMetadataFromHtml(html: string): Partial<PatentExtractedData['metadata']> {
  const metadata: Partial<PatentExtractedData['metadata']> = {
    dates: {},
    actors: []
  };

  // Extract expiration date (try multiple patterns)
  let expirationMatch = html.match(/<time[^>]*itemprop="expiration"[^>]*datetime="([^"]+)"/i);

  if (!expirationMatch) {
    // Try "Anticipated expiration" pattern from events timeline
    expirationMatch = html.match(/<time[^>]*itemprop="date"[^>]*datetime="([^"]+)"[^>]*>[^<]*<\/time>\s*<span[^>]*itemprop="title"[^>]*>Anticipated expiration/i);
  }

  if (expirationMatch) {
    metadata.dates!.expiration = expirationMatch[1].trim();
  }

  // Extract all assignees (current and original)
  const assigneeMatches = html.matchAll(/<dd[^>]*itemprop="assigneeOriginal"[^>]*>([^<]+)<\/dd>/gi);
  for (const match of assigneeMatches) {
    metadata.actors!.push({
      name: match[1].trim(),
      role: 'original_assignee'
    });
  }

  const currentAssigneeMatches = html.matchAll(/<dd[^>]*itemprop="assigneeCurrent"[^>]*>([^<]+)<\/dd>/gi);
  for (const match of currentAssigneeMatches) {
    metadata.actors!.push({
      name: match[1].trim(),
      role: 'current_assignee'
    });
  }

  return metadata;
}

/**
 * Chunk HTML content intelligently for large patents
 */
function chunkHtmlForGemini(html: string, maxChunkSize: number = 300000): string[] {
  if (html.length <= maxChunkSize) {
    return [html];
  }

  const chunks: string[] = [];

  // Extract header/metadata section (first 50K chars)
  const headerChunk = html.substring(0, 50000);

  // Find major section boundaries
  const abstractStart = html.indexOf('itemprop="abstract"');
  const descriptionStart = html.indexOf('itemprop="description"');
  const claimsStart = html.search(/<section[^>]*itemprop="claims"/i) || html.indexOf('id="claims"');

  // Chunk 1: Header + Abstract
  if (abstractStart > 0) {
    const abstractEnd = descriptionStart > 0 ? descriptionStart : claimsStart;
    chunks.push(html.substring(0, abstractEnd));
  } else {
    chunks.push(headerChunk);
  }

  // Chunk 2: Description (may need further splitting)
  if (descriptionStart > 0 && claimsStart > 0) {
    const descriptionHtml = html.substring(descriptionStart, claimsStart);

    if (descriptionHtml.length > maxChunkSize) {
      // Split description by headings
      const headingPattern = /<heading[^>]*>([^<]+)<\/heading>/gi;
      let lastPos = 0;
      let currentChunk = '';

      for (const match of descriptionHtml.matchAll(headingPattern)) {
        const nextSection = descriptionHtml.substring(lastPos, match.index!);

        if (currentChunk.length + nextSection.length > maxChunkSize) {
          chunks.push(headerChunk + currentChunk); // Include header for context
          currentChunk = nextSection;
        } else {
          currentChunk += nextSection;
        }

        lastPos = match.index!;
      }

      if (currentChunk) {
        chunks.push(headerChunk + currentChunk);
      }
    } else {
      chunks.push(headerChunk + descriptionHtml);
    }
  }

  // Chunk 3: Claims
  if (claimsStart > 0) {
    chunks.push(headerChunk + html.substring(claimsStart));
  }

  console.log(`  📦 Chunked HTML into ${chunks.length} parts (avg ${Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length).toLocaleString()} chars each)`);

  return chunks;
}

/**
 * Extract patent data using hybrid approach
 */
export async function extractPatentWithGemini(
  patentNumber: string,
  geminiApiKey: string
): Promise<PatentExtractedData> {
  const url = `https://patents.google.com/patent/${patentNumber}`;
  console.log(`\n📄 Fetching patent HTML: ${url}`);

  // Fetch HTML
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch patent: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  console.log(`  ✓ Fetched HTML (${html.length.toLocaleString()} chars)`);

  // Extract metadata from HTML (expiration, assignees)
  const htmlMetadata = extractMetadataFromHtml(html);
  console.log(`  ✓ Extracted metadata: ${htmlMetadata.actors?.length || 0} actors, expiration: ${htmlMetadata.dates?.expiration || 'N/A'}`);

  // Smart chunking for large patents
  const chunks = chunkHtmlForGemini(html);

  // Process chunks with Gemini
  console.log('  🤖 Extracting with Gemini 2.5 Pro...');

  let combinedData: any = {
    title: '',
    abstract: '',
    description: '',
    claims: [],
    metadata: {
      identifiers: {},
      dates: {},
      actors: [],
      summary: '',
      key_terms: ''
    }
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;

    const prompt = `You are a patent extraction expert. Analyze this ${chunks.length > 1 ? `chunk ${i + 1}/${chunks.length} of ` : ''}Google Patents HTML.

IMPORTANT INSTRUCTIONS:
1. ONLY extract Abstract, Description (with all subheadings), and Claims sections
2. REMOVE all page artifacts like "LI-206", "-3-", "-4-", "-5-", page numbers, docket numbers
3. Preserve all section headings in the Description (FIELD, BACKGROUND, SUMMARY, BRIEF DESCRIPTION OF DRAWINGS, DETAILED DESCRIPTION, etc.)
4. Extract metadata (patent numbers, dates, inventors, assignees) - only from first chunk
5. ${isLastChunk ? 'Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)' : 'Skip summary generation for this chunk'}
6. ${isLastChunk ? 'Generate 8-12 key technical terms (focus on technology/innovation, avoid generic words)' : 'Skip key terms for this chunk'}

Return ONLY valid JSON in this exact format:
{
  "title": "Patent title",
  "abstract": "Full abstract text (empty if not in this chunk)",
  "description": "Description content from this chunk (use ## for section headings)",
  "claims": [{"number": 1, "text": "Claim text", "isDependent": false}],
  "metadata": {
    "identifiers": {"patent_number": "US1234567", "publication_number": "US1234567B2"},
    "dates": {"priority": "2020-01-15", "filing": "2020-03-20", "publication": "2021-06-10", "granted": "2022-01-05"},
    "actors": [{"name": "John Doe", "role": "inventor"}],
    "summary": "${isLastChunk ? 'Brief intelligent summary here' : ''}",
    "key_terms": "${isLastChunk ? 'term1, term2, term3' : ''}"
  }
}

HTML chunk to analyze:
${chunk}`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 32768,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`);
    }

    const geminiData = await geminiResponse.json();
    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      throw new Error('No response from Gemini API');
    }

    const chunkData = JSON.parse(extractedText);

    // Merge chunk data
    if (i === 0) {
      combinedData.title = chunkData.title || '';
      combinedData.abstract = chunkData.abstract || '';
      combinedData.metadata = chunkData.metadata || combinedData.metadata;
    }

    if (chunkData.description) {
      combinedData.description += '\n\n' + chunkData.description;
    }

    if (chunkData.claims && chunkData.claims.length > 0) {
      combinedData.claims.push(...chunkData.claims);
    }

    if (isLastChunk && chunkData.metadata?.summary) {
      combinedData.metadata.summary = chunkData.metadata.summary;
      combinedData.metadata.key_terms = chunkData.metadata.key_terms;
    }

    console.log(`  ✓ Chunk ${i + 1}/${chunks.length} processed`);
  }

  // Merge HTML-extracted metadata (expiration, assignees)
  if (htmlMetadata.dates?.expiration) {
    combinedData.metadata.dates.expiration = htmlMetadata.dates.expiration;
  }

  if (htmlMetadata.actors && htmlMetadata.actors.length > 0) {
    // Merge actors, avoiding duplicates
    const existingActorNames = new Set(combinedData.metadata.actors.map((a: any) => a.name));
    for (const actor of htmlMetadata.actors) {
      if (!existingActorNames.has(actor.name)) {
        combinedData.metadata.actors.push(actor);
      }
    }
  }

  // Convert to our format
  const extractedData: PatentExtractedData = {
    title: combinedData.title || '',
    abstract: combinedData.abstract || '',
    background: '',
    summary: '',
    detailedDescription: combinedData.description?.trim() || '',
    claims: combinedData.claims?.map((c: any) => ({
      number: c.number || 0,
      text: c.text || '',
      isDependent: c.isDependent || false,
      dependsOn: c.dependsOn
    })) || [],
    figures: [],
    metadata: {
      identifiers: combinedData.metadata?.identifiers || {},
      dates: combinedData.metadata?.dates || {},
      actors: combinedData.metadata?.actors || [],
      summary: combinedData.metadata?.summary || '',
      key_terms: combinedData.metadata?.key_terms || ''
    }
  };

  console.log(`  ✓ Extracted: ${extractedData.claims.length} claims`);
  console.log(`  ✓ Description: ${extractedData.detailedDescription.length.toLocaleString()} chars`);
  console.log(`  ✓ Summary: ${extractedData.metadata.summary}`);
  console.log(`  ✓ Actors: ${extractedData.metadata.actors.length} (${extractedData.metadata.dates?.expiration ? 'with expiration' : 'no expiration'})`);

  return extractedData;
}
