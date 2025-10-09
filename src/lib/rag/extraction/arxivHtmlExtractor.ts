/**
 * ArXiv HTML Extraction
 * Extracts academic papers from arxiv.org/html pages
 */

import { extractArxivFromPdf } from './arxivPdfExtractor';

export interface ArxivPaper {
  title: string;
  abstract: string;
  content: string; // Full paper content with sections
  authors: Array<{
    name: string;
    affiliation?: string;
  }>;
  arxivId: string;
  metadata: {
    identifiers: {
      arxiv_id: string;
      doi?: string;
    };
    dates?: {
      published?: string;
      updated?: string;
    };
    authors: Array<{
      name: string;
      role: string;
      affiliation?: string;
    }>;
    summary?: string;
    key_terms?: string;
  };
}

/**
 * Extract ArXiv paper from HTML URL
 */
export async function extractArxivFromHtml(
  arxivId: string,
  geminiApiKey: string
): Promise<ArxivPaper> {
  const url = `https://arxiv.org/html/${arxivId}`;
  console.log(`\n📄 Fetching ArXiv paper: ${url}`);

  // Fetch HTML
  const response = await fetch(url);
  if (!response.ok) {
    // If HTML not available (404), fall back to PDF extraction
    if (response.status === 404) {
      console.log(`  ⚠️  HTML not available (404), falling back to PDF...`);
      return extractArxivFromPdf(arxivId, geminiApiKey);
    }
    throw new Error(`Failed to fetch ArXiv paper: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  console.log(`  ✓ Fetched HTML (${html.length.toLocaleString()} chars)`);

  // Smart chunking for large papers (reduce size for faster processing)
  const maxChunkSize = 200000; // 200KB per chunk for faster response
  const chunks = html.length > maxChunkSize ? chunkArxivHtml(html, maxChunkSize) : [html];

  if (chunks.length > 1) {
    console.log(`  📦 Chunked HTML into ${chunks.length} parts`);
  }

  // Extract using Gemini
  console.log('  🤖 Extracting with Gemini 2.5 Pro...');

  const prompt = `You are an academic paper extraction expert. Analyze this ${chunks.length > 1 ? 'chunk of an ' : ''}ArXiv HTML paper.

IMPORTANT INSTRUCTIONS:
1. Extract complete paper content with all sections and subsections
2. Preserve hierarchical structure (use ## for sections, ### for subsections)
3. Keep all citations in [1], [2] format intact
4. Preserve figure captions (e.g., "Figure 1: Description")
5. Remove navigation elements, headers, footers, and other page artifacts
6. Clean up the content but preserve academic formatting
7. Extract metadata: title, authors with affiliations, abstract, dates
8. Generate 8-12 key technical terms (focus on the paper's main contributions/topics)
9. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)

CRITICAL JSON REQUIREMENTS:
- Escape all special characters in strings (use \\" for quotes, \\n for newlines)
- Do NOT include any text outside the JSON object
- Ensure all JSON strings are properly closed with quotes
- Verify all commas and braces are balanced
- Test that the JSON is valid before returning

Return ONLY valid JSON in this exact format:
{
  "title": "Paper title",
  "abstract": "Full abstract text",
  "content": "Complete paper content with ## Section headers and ### Subsection headers. Preserve citations [1] and figure captions.",
  "authors": [{"name": "John Doe", "affiliation": "University Name"}],
  "arxivId": "${arxivId}",
  "doi": "10.xxxx/xxxxx (if available)",
  "published": "2024-05-15 (if available)",
  "updated": "2024-06-01 (if available)",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

HTML to analyze:
${chunks[0]}`;

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
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

  // Clean and parse JSON response (handle potential formatting issues)
  let paperData;
  try {
    // Remove markdown code blocks if present
    const cleanedText = extractedText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    paperData = JSON.parse(cleanedText);
  } catch (parseError) {
    console.error('  ❌ JSON parsing failed:', parseError instanceof Error ? parseError.message : 'Unknown error');
    console.error('  📄 Raw response (first 1000 chars):', extractedText.substring(0, 1000));
    console.error('  📄 Raw response (last 500 chars):', extractedText.substring(extractedText.length - 500));

    // Try to extract JSON from text if it's wrapped in other content
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        paperData = JSON.parse(jsonMatch[0]);
        console.log('  ✓ Recovered JSON from wrapped content');
      } catch (retryError) {
        // Last resort: try to repair common JSON issues
        const repairedJson = repairJsonString(jsonMatch[0]);
        try {
          paperData = JSON.parse(repairedJson);
          console.log('  ✓ Recovered JSON after repair');
        } catch (finalError) {
          console.error('  ❌ All JSON repair attempts failed');
          throw new Error(`Failed to parse Gemini JSON response after multiple attempts. Original error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
      }
    } else {
      throw new Error(`Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
  }

  // Build structured response
  const paper: ArxivPaper = {
    title: paperData.title || '',
    abstract: paperData.abstract || '',
    content: paperData.content || '',
    authors: paperData.authors || [],
    arxivId,
    metadata: {
      identifiers: {
        arxiv_id: arxivId,
        doi: paperData.doi
      },
      dates: {
        published: paperData.published,
        updated: paperData.updated
      },
      authors: (paperData.authors || []).map((a: any) => ({
        name: a.name,
        role: 'author',
        affiliation: a.affiliation
      })),
      summary: paperData.summary || '',
      key_terms: paperData.key_terms || ''
    }
  };

  console.log(`  ✓ Extracted: ${paper.title}`);
  console.log(`  ✓ Authors: ${paper.authors.length}`);
  console.log(`  ✓ Content: ${paper.content.length.toLocaleString()} chars`);
  console.log(`  ✓ Summary: ${paper.metadata.summary}`);

  return paper;
}

/**
 * Chunk large ArXiv HTML for Gemini processing
 */
function chunkArxivHtml(html: string, maxChunkSize: number): string[] {
  // For now, just use first chunk (contains header, abstract, and most content)
  // Future: implement smart section-based chunking if needed
  return [html.substring(0, maxChunkSize)];
}

/**
 * Attempt to repair common JSON string issues
 */
function repairJsonString(jsonStr: string): string {
  let repaired = jsonStr;

  // Fix unescaped quotes in strings (basic approach)
  // This is a simple heuristic - won't work for all cases
  repaired = repaired.replace(/([^\\])"([^",:}\]]*)":/g, '$1\\"$2":');

  // Fix trailing commas in objects and arrays
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Fix missing commas between properties (basic heuristic)
  repaired = repaired.replace(/"\s+"/g, '", "');

  // Ensure the JSON ends properly
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  return repaired;
}
