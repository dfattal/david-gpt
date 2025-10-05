/**
 * Smart metadata extraction using Gemini API
 * Generalizes across all document types by analyzing HTML with LLM
 */

import { DocumentType } from '../ingestion/geminiProcessor';
import { WebMetadata } from './documentAssembler';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Extract metadata from web page HTML using Gemini API
 */
export async function extractMetadataWithGemini(
  html: string,
  url: string,
  docType: DocumentType,
  apiKey: string
): Promise<WebMetadata | null> {
  console.log(`  🤖 Using Gemini to extract ${docType} metadata from ${url}...`);

  const prompt = generateExtractionPrompt(html, url, docType);

  try {
    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt,
          }],
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for factual extraction
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.warn('  ⚠️ Could not parse JSON from Gemini response');
      return null;
    }

    const metadata = JSON.parse(jsonMatch[1]) as WebMetadata;

    // Validate and clean metadata
    if (!metadata.identifiers && !metadata.dates && !metadata.actors) {
      console.warn('  ⚠️ Gemini returned empty metadata');
      return null;
    }

    console.log(`  ✅ Gemini extracted metadata successfully`);
    return metadata;
  } catch (error) {
    console.warn(`  ⚠️ Gemini metadata extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Generate document-type-specific extraction prompt
 */
function generateExtractionPrompt(html: string, url: string, docType: DocumentType): string {
  const truncatedHtml = html.substring(0, 50000); // Limit HTML size for Gemini

  const typeInstructions = getTypeSpecificInstructions(docType);
  const schema = getMetadataSchema(docType);

  return `You are a metadata extraction specialist. Analyze the following HTML from ${url} and extract ALL available metadata.

**Document Type:** ${docType}

**HTML Content:**
${truncatedHtml}

**Instructions:**
${typeInstructions}

**Output Format:**
Return ONLY a JSON object with this structure:
${schema}

**Important:**
- Extract ALL dates you find (use ISO format YYYY-MM-DD)
- Extract ALL people/organizations with their roles
- For reassignments, list both original and current owners
- If a field is not found, omit it (don't include null values)
- Return ONLY the JSON, no explanatory text

Output the JSON now:`;
}

/**
 * Get document-type-specific extraction instructions
 */
function getTypeSpecificInstructions(docType: DocumentType): string {
  const instructions: Record<DocumentType, string> = {
    patent: `
1. Find ALL assignees (original and current - patents are often reassigned)
2. Extract priority date (earliest filing date in family)
3. Extract actual expiration date (don't calculate - it's shown on the page)
4. Extract grant date if available
5. List ALL inventors
6. Get publication number, application number
7. Extract patent family from "Worldwide applications" or patent family table (look for representativePublication values like WO2012038876A1, CN103109226B, EP3537204A1, etc.) - exclude the current US patent itself`,

    arxiv: `
1. Extract submission date and all revision dates
2. Find ALL authors with affiliations if available
3. Get arxiv ID and DOI
4. Extract version information (v1, v2, etc.)
5. Get subject categories`,

    release_notes: `
1. Extract version number
2. Get release date
3. Find product name
4. Extract all bug fix IDs or ticket numbers mentioned
5. Get company/vendor name`,

    blog: `
1. Extract publication date
2. Get author name(s)
3. Find last updated date if available
4. Get blog platform/publisher
5. Extract tags or categories`,

    press: `
1. Extract press release date
2. Get company/organization name
3. Find all quoted people with titles
4. Extract contact information
5. Get PR distribution service if mentioned`,

    spec: `
1. Extract specification version
2. Get publication/approval date
3. Find standards body (W3C, IETF, ISO, etc.)
4. Get all editors/authors
5. Extract document number/identifier`,

    technical_note: `
1. Extract version or revision number
2. Get publication date
3. Find authors/creators
4. Get document identifier
5. Extract related specifications or standards`,

    faq: `
1. Extract last updated date
2. Get product/service name
3. Find author or organization
4. Extract version if available`,

    other: `
1. Extract any dates mentioned (publication, update, etc.)
2. Find any author or organization names
3. Get any identifiers (DOI, ISBN, etc.)
4. Extract version information if available`,
  };

  return instructions[docType] || instructions.other;
}

/**
 * Get metadata schema for document type
 */
function getMetadataSchema(docType: DocumentType): string {
  const baseSchema = `{
  "identifiers": {
    // Any document identifiers (patent_number, arxiv_id, doi, version, etc.)
  },
  "dates": {
    // All dates in YYYY-MM-DD format (filing, publication, priority, expiration, etc.)
  },
  "actors": [
    {"name": "Person/Org Name", "role": "inventor|author|assignee|current_assignee|original_assignee|editor|etc", "affiliation": "Optional affiliation/organization"}
  ]
}`;

  // Add type-specific examples
  const examples: Record<DocumentType, string> = {
    patent: `{
  "identifiers": {
    "patent_number": "US11281020",
    "publication_number": "US11281020B2",
    "application_number": "US16/596,819",
    "patent_family": ["WO2012038876A1", "CN103109226B", "EP3537204A1", "JP5921550B2", "KR102006481B1"]
  },
  "dates": {
    "priority": "2010-09-22",
    "filing": "2019-10-09",
    "publication": "2022-03-22",
    "granted": "2022-03-22",
    "expiration": "2031-12-31"
  },
  "actors": [
    {"name": "Fetze Pijlman", "role": "inventor"},
    {"name": "Jan Van Der Horst", "role": "inventor"},
    {"name": "Leia Inc", "role": "current_assignee"},
    {"name": "Koninklijke Philips NV", "role": "original_assignee"}
  ]
}`,

    arxiv: `{
  "identifiers": {
    "arxiv_id": "2501.11841",
    "doi": "10.48550/arXiv.2501.11841",
    "version": "v4"
  },
  "dates": {
    "submitted": "2025-01-21",
    "updated": "2025-08-26"
  },
  "actors": [
    {"name": "Author Name", "role": "author", "affiliation": "University/Institution"}
  ]
}`,

    release_notes: `{
  "identifiers": {
    "version": "1.34.6",
    "product": "LeiaSR"
  },
  "dates": {
    "released": "2024-06-15"
  },
  "actors": [
    {"name": "Company Name", "role": "vendor"}
  ]
}`,
  };

  return examples[docType] || baseSchema;
}
