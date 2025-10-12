/**
 * RAW Markdown Formatter
 * Converts raw markdown files into RAG-optimized formatted markdown with frontmatter
 * Uses Gemini AI to extract metadata, key terms, and structure the content
 */

import { generateDocumentSummary } from './summaryGenerator';

export interface RawMarkdownInput {
  content: string;
  filename: string;
  personaSlugs: string[]; // Changed from personaSlug - supports multi-persona assignment
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
  const { content, filename, personaSlugs } = input;

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
  "documentType": "blog|press|spec|tech_memo|technical_memo|faq|slide|email|patent|release_notes|arxiv|technical_note|article|other",
  "keyTerms": ["term1", "term2", ...],  // 5-10 key technical terms, concepts, or technologies mentioned
  "alsoKnownAs": "alternative name or acronym if applicable, otherwise empty string",
  "summary": "one-sentence summary of the main topic",
  "detectedDate": "YYYY-MM-DD if any date is mentioned, otherwise null",
  "detectedAuthors": ["author names if mentioned"] or [],
  "sourceUrl": "IMPORTANT: Extract the full URL from markdown link syntax like [text](URL) when you see patterns like 'Source: [...](...)', 'Original: [...](...)', or any explicit source attribution. Return the URL inside the parentheses. If no source URL found, return null"
}

IMPORTANT: The documentType MUST be one of the exact values listed above.
- Use "article" for general content, biographies, profiles, or educational materials
- Use "technical_note" or "technical_memo" for technical documentation
- Use "other" only as a last resort

Focus on:
- Technical accuracy for key terms
- Finding synonyms/acronyms for alsoKnownAs
- Concise, factual summary
- Dates in ISO format (convert any date format to YYYY-MM-DD)
- **CRITICAL**: For sourceUrl, look for markdown links in lines starting with "Source:", "Original:", "Link:", etc. Extract the URL from inside the parentheses of markdown link syntax [text](URL)

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

    // Fallback: Extract source URL using regex if Gemini didn't find it
    if (!metadata.sourceUrl) {
      const sourceUrlPatterns = [
        /\*Source:\s*\[([^\]]+)\]\(([^)]+)\)/i,  // *Source: [text](url)*
        /Source:\s*\[([^\]]+)\]\(([^)]+)\)/i,    // Source: [text](url)
        /Original:\s*\[([^\]]+)\]\(([^)]+)\)/i,   // Original: [text](url)
        /Link:\s*\[([^\]]+)\]\(([^)]+)\)/i,       // Link: [text](url)
      ];

      for (const pattern of sourceUrlPatterns) {
        const match = content.match(pattern);
        if (match && match[2]) {
          metadata.sourceUrl = match[2];
          console.log(`   ✓ Fallback extracted source URL: ${metadata.sourceUrl}`);
          break;
        }
      }
    }

    console.log(`   ✓ Extracted metadata:`, metadata);

    // Validate and normalize doc_type
    const validDocTypes = [
      'blog', 'press', 'spec', 'tech_memo', 'technical_memo', 'faq',
      'slide', 'email', 'patent', 'release_notes', 'arxiv',
      'technical_note', 'article', 'other'
    ];

    if (metadata.documentType && !validDocTypes.includes(metadata.documentType)) {
      console.warn(`   ⚠️  Invalid doc_type "${metadata.documentType}" detected, defaulting to "article"`);
      metadata.documentType = 'article';
    }

    // Build frontmatter
    const frontmatter = buildFrontmatter({
      id: docId,
      title,
      personaSlugs,
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
  personaSlugs: string[];
  filename: string;
  metadata: any;
}): string {
  const { id, title, personaSlugs, filename, metadata } = params;

  const lines: string[] = [
    `id: ${id}`,
    `title: "${escapeYaml(title)}"`,
    `type: ${metadata.documentType || 'other'}`,
    `personas: [${personaSlugs.join(', ')}]`,
  ];

  // Summary
  if (metadata.summary) {
    lines.push(`summary: "${escapeYaml(metadata.summary)}"`);
  }

  // Identifiers (structured) - always include even if minimal
  lines.push(`identifiers:`);
  lines.push(`  document_id: "${id}"`);
  lines.push(`  filename: "${filename}"`);
  if (metadata.sourceUrl) {
    lines.push(`  source_url: "${metadata.sourceUrl}"`);
  }

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
