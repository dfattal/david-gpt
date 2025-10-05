/**
 * ArXiv PDF Extraction (Fallback)
 * Downloads and extracts text from ArXiv PDFs when HTML is not available
 */

import type { ArxivPaper } from './arxivHtmlExtractor';

/**
 * Extract ArXiv paper from PDF URL (fallback when HTML unavailable)
 */
export async function extractArxivFromPdf(
  arxivId: string,
  geminiApiKey: string
): Promise<ArxivPaper> {
  const url = `https://arxiv.org/pdf/${arxivId}.pdf`;
  console.log(`\n📄 Fetching ArXiv PDF (fallback): ${url}`);

  // Download PDF
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ArXiv PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`  ✓ Downloaded PDF (${(buffer.length / 1024).toFixed(1)} KB)`);

  // Extract text from PDF - import core library directly to avoid debug code
  const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
  const pdfData = await pdf(buffer);
  const fullText = pdfData.text;
  console.log(`  ✓ Extracted text (${fullText.length.toLocaleString()} chars)`);

  // Process with Gemini to extract structured data
  console.log('  🤖 Processing with Gemini 2.5 Pro...');

  const prompt = `You are an academic paper extraction expert. Analyze this ArXiv paper text extracted from a PDF.

IMPORTANT INSTRUCTIONS:
1. Extract the paper title, authors with affiliations, and abstract
2. Organize the remaining content with hierarchical structure (## for sections, ### for subsections)
3. Preserve citations in [1], [2] format if present
4. Clean up any PDF extraction artifacts (page numbers, headers, footers)
5. Generate 8-12 key technical terms (focus on the paper's main contributions/topics)
6. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)
7. Extract publication dates if available in the text

Return ONLY valid JSON in this exact format:
{
  "title": "Paper title",
  "abstract": "Full abstract text",
  "content": "Complete paper content with ## Section headers and ### Subsection headers",
  "authors": [{"name": "John Doe", "affiliation": "University Name"}],
  "arxivId": "${arxivId}",
  "doi": "10.xxxx/xxxxx (if available in text)",
  "published": "YYYY-MM-DD (if available)",
  "updated": "YYYY-MM-DD (if available)",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

PDF text to analyze:
${fullText.substring(0, 100000)}`; // Limit to first 100K chars for Gemini

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
    const errorBody = await geminiResponse.text();
    console.error(`  ❌ Gemini API error response:`, errorBody);
    throw new Error(`Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`);
  }

  const geminiData = await geminiResponse.json();
  const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!extractedText) {
    throw new Error('No response from Gemini API');
  }

  const paperData = JSON.parse(extractedText);

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

  console.log(`  ✓ Extracted from PDF: ${paper.title}`);
  console.log(`  ✓ Authors: ${paper.authors.length}`);
  console.log(`  ✓ Content: ${paper.content.length.toLocaleString()} chars`);
  console.log(`  ✓ Summary: ${paper.metadata.summary}`);

  return paper;
}
