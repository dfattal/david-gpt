/**
 * RAW Markdown Formatter
 * Converts raw markdown files into RAG-optimized formatted markdown with frontmatter
 * Uses Gemini AI to extract metadata, key terms, and structure the content
 */

import { generateDocumentSummary } from './summaryGenerator';

export interface RawMarkdownInput {
  content: string;
  filename: string;
  personaSlug: string;
}

export interface FormattedMarkdownResult {
  success: boolean;
  markdown?: string;
  stats?: {
    originalChars: number;
    formattedChars: number;
    documentType: string;
  };
  error?: string;
}

/**
 * Extract metadata and format raw markdown using Gemini
 */
export async function formatRawMarkdown(
  input: RawMarkdownInput,
  geminiApiKey: string
): Promise<FormattedMarkdownResult> {
  const { content, filename, personaSlug } = input;

  try {
    console.log(`\n📄 Processing RAW markdown: ${filename}`);
    console.log(`   Content length: ${content.length} chars`);

    // Generate document ID from filename
    const docId = filename
      .toLowerCase()
      .replace(/\.md$/, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Extract title from content (first H1) or use filename
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, '');

    // Use Gemini to analyze the content and extract metadata
    const prompt = `You are a technical document analyzer. Analyze this markdown document and extract metadata.

Document Content:
${content.substring(0, 8000)} ${content.length > 8000 ? '\n...(truncated)' : ''}

Extract the following in JSON format:
{
  "documentType": "technical_memo|spec|faq|blog|article|guide|other",
  "keyTerms": ["term1", "term2", ...],  // 5-10 key technical terms, concepts, or technologies mentioned
  "alsoKnownAs": "alternative name or acronym if applicable, otherwise empty string",
  "summary": "one-sentence summary of the main topic",
  "detectedDate": "YYYY-MM-DD if any date is mentioned, otherwise null",
  "detectedAuthors": ["author names if mentioned"] or []
}

Focus on:
- Technical accuracy for key terms
- Finding synonyms/acronyms for alsoKnownAs
- Concise, factual summary
- Dates in ISO format

Return ONLY the JSON, no other text.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = geminiText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      geminiText.match(/\{[\s\S]*\}/);
    const metadata = jsonMatch ? JSON.parse(jsonMatch[0].replace(/```json\s*|\s*```/g, '')) : {};

    console.log(`   ✓ Extracted metadata:`, metadata);

    // Build frontmatter
    const frontmatter = buildFrontmatter({
      id: docId,
      title,
      personaSlug,
      filename,
      metadata,
    });

    // Build formatted markdown with frontmatter
    const formattedMarkdown = `---
${frontmatter}
---

${metadata.keyTerms?.length > 0 ? `**Key Terms**: ${metadata.keyTerms.join(', ')}` : ''}
${metadata.alsoKnownAs ? `**Also Known As**: ${metadata.alsoKnownAs}` : ''}

${content.replace(/^---[\s\S]*?---\s*/m, '')}`.trim();

    const stats = {
      originalChars: content.length,
      formattedChars: formattedMarkdown.length,
      documentType: metadata.documentType || 'article',
    };

    console.log(`   ✓ Formatted: ${stats.formattedChars} chars`);

    return {
      success: true,
      markdown: formattedMarkdown,
      stats,
    };

  } catch (error) {
    console.error(`   ✗ Error formatting RAW markdown:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build YAML frontmatter from extracted metadata
 */
function buildFrontmatter(params: {
  id: string;
  title: string;
  personaSlug: string;
  filename: string;
  metadata: any;
}): string {
  const { id, title, personaSlug, filename, metadata } = params;

  const lines: string[] = [
    `id: ${id}`,
    `title: "${escapeYaml(title)}"`,
    `type: ${metadata.documentType || 'other'}`,
    `personas: [${personaSlug}]`,
  ];

  // Tags (from key terms)
  if (metadata.keyTerms?.length > 0) {
    lines.push(`tags: [${metadata.keyTerms.map((t: string) => `"${escapeYaml(t)}"`).join(', ')}]`);
  }

  // Summary
  if (metadata.summary) {
    lines.push(`summary: "${escapeYaml(metadata.summary)}"`);
  }

  // Identifiers (structured) - always include even if minimal
  lines.push(`identifiers:`);
  lines.push(`  document_id: "${id}"`);
  lines.push(`  filename: "${filename}"`);

  // Dates (structured) - include if detected
  if (metadata.detectedDate) {
    lines.push(`dates:`);
    lines.push(`  created: "${metadata.detectedDate}"`);
  }

  // Actors (structured) - always include even if empty
  if (metadata.detectedAuthors?.length > 0) {
    lines.push(`actors:`);
    metadata.detectedAuthors.forEach((author: string) => {
      lines.push(`  - name: "${escapeYaml(author)}"`);
      lines.push(`    role: "author"`);
    });
  } else {
    lines.push(`actors: []`);
  }

  return lines.join('\n');
}

/**
 * Escape special characters for YAML
 */
function escapeYaml(text: string): string {
  return text.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * Process batch of raw markdown files
 */
export async function formatBatchRawMarkdown(
  inputs: RawMarkdownInput[],
  geminiApiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<FormattedMarkdownResult[]> {
  const results: FormattedMarkdownResult[] = [];

  for (let i = 0; i < inputs.length; i++) {
    onProgress?.(i + 1, inputs.length);

    const result = await formatRawMarkdown(inputs[i], geminiApiKey);
    results.push(result);

    // Rate limiting: 2 requests per second
    if (i < inputs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
