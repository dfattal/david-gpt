/**
 * Contextual Retrieval Implementation
 * Generates situating context for each chunk to improve embedding quality
 *
 * Reference: https://www.anthropic.com/news/contextual-retrieval
 *
 * The context prepended to each chunk helps the embedding model understand:
 * - What document this chunk is from
 * - What topic/section it covers
 * - How it relates to the broader document
 */

import OpenAI from 'openai';
import { execSync } from 'child_process';

export interface ChunkWithContext {
  originalText: string;
  context: string;
  contextualizedText: string;
  tokenCount: number;
}

export interface ContextGenerationResult {
  chunks: ChunkWithContext[];
  totalTokens: number;
  cost: number;
  method: 'openai' | 'gemini';
}

/**
 * Generate context using OpenAI GPT-4 Mini (server-side)
 */
async function generateContextWithOpenAI(
  docTitle: string,
  docSummary: string,
  chunkText: string,
  apiKey: string
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const prompt = `You are a technical documentation expert. Given a document and a chunk from it, generate a brief 1-2 sentence context that situates this chunk within the document.

Document Title: ${docTitle}
Document Summary: ${docSummary}

Chunk:
${chunkText}

Generate a concise context (1-2 sentences) that explains what this chunk covers and how it relates to the document. This context will be prepended to the chunk for better embedding quality.

Context:`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 100,
  });

  return response.choices[0].message.content?.trim() || '';
}

/**
 * Generate context using Gemini CLI (local processing)
 */
function generateContextWithGemini(
  docTitle: string,
  docSummary: string,
  chunkText: string
): string {
  const prompt = `You are a technical documentation expert. Given a document and a chunk from it, generate a brief 1-2 sentence context that situates this chunk within the document.

Document Title: ${docTitle}
Document Summary: ${docSummary}

Chunk:
${chunkText}

Generate a concise context (1-2 sentences) that explains what this chunk covers and how it relates to the document. This context will be prepended to the chunk for better embedding quality.

Context:`;

  try {
    // Use Gemini CLI in non-interactive mode
    const result = execSync(`gemini -y '${prompt.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000, // 30 second timeout per chunk
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    return result.trim();
  } catch (error) {
    console.warn('Gemini CLI context generation failed, using fallback:', error);
    // Fallback: generate simple context from document metadata
    return `This excerpt from "${docTitle}" discusses ${chunkText.substring(0, 100).trim()}...`;
  }
}

/**
 * Generate contextual embeddings for chunks
 * @param chunks - Array of chunk texts
 * @param docTitle - Document title
 * @param docSummary - Document summary
 * @param method - 'openai' for server-side (GPT-4 Mini) or 'gemini' for local (Gemini CLI)
 * @param onProgress - Progress callback (current, total)
 */
export async function generateContextualChunks(
  chunks: string[],
  docTitle: string,
  docSummary: string,
  method: 'openai' | 'gemini' = 'gemini',
  onProgress?: (current: number, total: number) => void
): Promise<ContextGenerationResult> {
  const contextualChunks: ChunkWithContext[] = [];
  let totalTokens = 0;
  const apiKey = process.env.OPENAI_API_KEY;

  if (method === 'openai' && !apiKey) {
    throw new Error('OPENAI_API_KEY required for server-side context generation');
  }

  console.log(`Generating contexts using ${method.toUpperCase()}...`);

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];

    try {
      // Generate context
      const context =
        method === 'openai'
          ? await generateContextWithOpenAI(docTitle, docSummary, chunkText, apiKey!)
          : generateContextWithGemini(docTitle, docSummary, chunkText);

      // Combine context + chunk
      const contextualizedText = `${context}\n\n${chunkText}`;

      contextualChunks.push({
        originalText: chunkText,
        context,
        contextualizedText,
        tokenCount: Math.ceil(contextualizedText.length / 4), // Rough estimate
      });

      totalTokens += contextualizedText.length / 4;

      if (onProgress) {
        onProgress(i + 1, chunks.length);
      }
    } catch (error) {
      console.error(`Failed to generate context for chunk ${i + 1}:`, error);
      // Fallback: use chunk without context
      contextualChunks.push({
        originalText: chunkText,
        context: '',
        contextualizedText: chunkText,
        tokenCount: Math.ceil(chunkText.length / 4),
      });
    }
  }

  // Calculate cost (GPT-4 Mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens)
  // Approximate: 100 tokens output per chunk context
  const inputCost = method === 'openai' ? (totalTokens / 1_000_000) * 0.15 : 0;
  const outputCost = method === 'openai' ? (chunks.length * 100 / 1_000_000) * 0.60 : 0;
  const cost = inputCost + outputCost;

  return {
    chunks: contextualChunks,
    totalTokens: Math.ceil(totalTokens),
    cost,
    method,
  };
}

/**
 * Validate that contexts are meaningful
 */
export function validateContexts(chunks: ChunkWithContext[]): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for missing contexts
  const missingContext = chunks.filter((c) => !c.context || c.context.length < 10);
  if (missingContext.length > 0) {
    warnings.push(`${missingContext.length} chunks have missing or very short contexts`);
  }

  // Check for generic/unhelpful contexts
  const genericPhrases = ['this chunk', 'this excerpt', 'this section', 'this passage'];
  const tooGeneric = chunks.filter((c) =>
    genericPhrases.some((phrase) => c.context.toLowerCase().includes(phrase))
  );
  if (tooGeneric.length > chunks.length * 0.5) {
    warnings.push('More than 50% of contexts appear generic and may not be helpful');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}