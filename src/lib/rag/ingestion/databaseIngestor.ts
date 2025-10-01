/**
 * Database ingestion utility for RAG documents
 * Handles inserting/updating docs and chunks with embeddings
 */

import { createClient } from '@supabase/supabase-js';
import matter from 'gray-matter';
import { chunkDocument, type Chunk, type DocumentMetadata } from '../chunking/smartChunker';
import { createEmbeddingGenerator } from '../embeddings/embeddingGenerator';
import { stripFrontmatter } from './markdownProcessor';
import { generateContextualChunks } from '../embeddings/contextualRetrieval';

export interface DocumentToIngest {
  filePath: string;
  content: string; // Full markdown with frontmatter
}

export interface IngestionOptions {
  overwrite?: boolean;
  useContextualRetrieval?: boolean; // Enable contextual retrieval (default: true)
  contextMethod?: 'openai' | 'gemini'; // Context generation method (default: 'gemini')
}

export interface IngestionResult {
  docId: string;
  title: string;
  chunksCreated: number;
  tokensUsed: number;
  cost: number;
  skipped?: boolean; // Document already exists and overwrite=false
  error?: string;
}

export interface IngestionStats {
  documentsProcessed: number;
  documentsIngested: number; // Successfully ingested (new name for clarity)
  documentsFailed: number;
  documentsSkipped?: number; // Skipped because already in DB
  chunksCreated: number; // Renamed from totalChunks
  embeddingsGenerated: number; // Renamed from totalTokens
  totalCost: number;
  results: IngestionResult[];
}

/**
 * Database ingestor class
 */
export class DatabaseIngestor {
  private supabase: ReturnType<typeof createClient>;
  private embeddingGenerator: ReturnType<typeof createEmbeddingGenerator>;

  /**
   * Constructor overload for CLI usage (with URL and key)
   * @param supabaseUrl - Supabase project URL
   * @param supabaseKey - Supabase service role key
   * @param openaiApiKey - OpenAI API key (optional)
   */
  constructor(supabaseUrl: string, supabaseKey: string, openaiApiKey?: string);

  /**
   * Constructor overload for API route usage (with client instance)
   * @param supabaseClient - Authenticated Supabase client
   * @param openaiApiKey - OpenAI API key (optional)
   */
  constructor(supabaseClient: ReturnType<typeof createClient>, openaiApiKey?: string);

  /**
   * Implementation
   */
  constructor(
    supabaseUrlOrClient: string | ReturnType<typeof createClient>,
    supabaseKeyOrOpenaiKey?: string,
    openaiApiKey?: string
  ) {
    // Detect which overload was used
    if (typeof supabaseUrlOrClient === 'string') {
      // CLI usage: (url, key, openaiKey?)
      this.supabase = createClient(supabaseUrlOrClient, supabaseKeyOrOpenaiKey!);
      openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY;
    } else {
      // API route usage: (client, openaiKey?)
      this.supabase = supabaseUrlOrClient;
      openaiApiKey = supabaseKeyOrOpenaiKey || process.env.OPENAI_API_KEY;
    }

    // Validate OpenAI API key
    if (!openaiApiKey) {
      throw new Error('OpenAI API key required for embedding generation');
    }

    this.embeddingGenerator = createEmbeddingGenerator();
  }

  /**
   * Ingest a single document
   */
  async ingestDocument(doc: DocumentToIngest, overwrite = false): Promise<IngestionResult> {
    try {
      console.log(`\nIngesting document: ${doc.filePath}`);

      // Parse frontmatter
      const { data: metadata, content: bodyContent } = matter(doc.content);

      // Validate required fields
      if (!metadata.id || !metadata.title || !metadata.personas) {
        throw new Error('Missing required frontmatter fields: id, title, personas');
      }

      // Ensure personas is an array
      const personas = Array.isArray(metadata.personas)
        ? metadata.personas
        : [metadata.personas];

      // Auto-extract tags from "Also Known As" and "Key Terms" if not already in tags
      const autoTags: string[] = [];

      // Extract from "Also Known As" in body
      const akaMatch = doc.content.match(/\*\*Also Known As\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s);
      if (akaMatch) {
        const akaTerms = akaMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        autoTags.push(...akaTerms);
      }

      // Extract from "Key Terms" in body
      const keyTermsMatch = doc.content.match(/\*\*Key Terms\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s);
      if (keyTermsMatch) {
        const keyTerms = keyTermsMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        autoTags.push(...keyTerms);
      }

      // Merge with existing tags, removing duplicates
      const existingTags = Array.isArray(metadata.tags) ? metadata.tags : [];
      const allTags = [...new Set([...existingTags, ...autoTags])];

      console.log(`  Auto-extracted ${autoTags.length} tags from content`);

      // Check if document already exists (unless overwrite is true)
      if (!overwrite) {
        const { data: existing, error: checkError } = await this.supabase
          .from('docs')
          .select('id, title')
          .eq('id', metadata.id)
          .maybeSingle();

        if (checkError) {
          console.warn(`  Warning: Failed to check for existing document: ${checkError.message}`);
        }

        if (existing) {
          console.log(`  Skipped: Document already exists (use --overwrite to re-ingest)`);
          return {
            docId: existing.id,
            title: existing.title,
            chunksCreated: 0,
            tokensUsed: 0,
            cost: 0,
            skipped: true,
          };
        }
      }

      // Insert/update document record
      const { data: docRecord, error: docError } = await this.supabase
        .from('docs')
        .upsert(
          {
            id: metadata.id,
            title: metadata.title,
            date: metadata.date || null,
            source_url: metadata.source_url || null,
            type: metadata.type || 'other',
            summary: metadata.summary || null,
            license: metadata.license || 'unknown',
            personas: personas, // Pass array directly for JSONB column
            tags: allTags, // Use merged tags (manual + auto-extracted)
            identifiers: metadata.identifiers || {}, // Structured identifiers
            dates_structured: metadata.dates || {}, // Structured dates
            actors: metadata.actors || [], // Actors array
            raw_content: doc.content,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (docError) throw docError;
      if (!docRecord) throw new Error('Failed to create document record');

      console.log(`  Document record created: ${docRecord.id}`);

      // Delete existing chunks for this document (for re-ingestion)
      const { error: deleteError } = await this.supabase
        .from('chunks')
        .delete()
        .eq('doc_id', docRecord.id);

      if (deleteError) {
        console.warn(`  Warning: Failed to delete existing chunks: ${deleteError.message}`);
      }

      // Strip frontmatter and chunk the content
      const cleanContent = stripFrontmatter(bodyContent);

      // Extract "Key Terms" and "Also Known As" from body content for metadata chunk
      const keyTermsMatchForChunk = bodyContent.match(/\*\*Key Terms\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s);
      const keyTerms = keyTermsMatchForChunk ? keyTermsMatchForChunk[1].trim() : undefined;

      const akaMatchForChunk = bodyContent.match(/\*\*Also Known As\*\*:\s*(.+?)(?:\n\n|\n\*\*|$)/s);
      const alsoKnownAs = akaMatchForChunk ? akaMatchForChunk[1].trim() : undefined;

      // Prepare metadata for metadata chunk generation
      const chunkMetadata: DocumentMetadata = {
        id: metadata.id,
        title: metadata.title,
        type: metadata.type,
        date: metadata.date,
        summary: metadata.summary,
        tags: allTags, // Use merged tags for metadata chunk
        keyTerms,
        alsoKnownAs,
        identifiers: metadata.identifiers,
        dates: metadata.dates,
        actors: metadata.actors,
      };

      const chunks = chunkDocument(cleanContent, {}, chunkMetadata);

      console.log(`  Generated ${chunks.length} chunks (including metadata chunk)`);

      if (chunks.length === 0) {
        return {
          docId: docRecord.id,
          title: metadata.title,
          chunksCreated: 0,
          tokensUsed: 0,
          cost: 0,
          error: 'No chunks generated from document',
        };
      }

      // Apply contextual retrieval if enabled
      let chunkTextsForEmbedding = chunks.map((c) => c.text);
      let contextCost = 0;

      if (overwrite !== false) {
        // Default to contextual retrieval unless explicitly disabled
        const useContextual = process.env.DISABLE_CONTEXTUAL_RETRIEVAL !== 'true';
        const contextMethod = (process.env.CONTEXT_METHOD as 'openai' | 'gemini') || 'openai';

        if (useContextual) {
          console.log(`  Generating contextual chunks using ${contextMethod.toUpperCase()}...`);

          try {
            const contextResult = await generateContextualChunks(
              chunkTextsForEmbedding,
              metadata.title,
              metadata.summary || 'Technical documentation',
              contextMethod,
              (completed, total) => {
                if (completed % 10 === 0 || completed === total) {
                  console.log(`    Progress: ${completed}/${total} contexts`);
                }
              }
            );

            // Use contextualized text for embeddings
            chunkTextsForEmbedding = contextResult.chunks.map((c) => c.contextualizedText);
            contextCost = contextResult.cost;

            console.log(
              `  Contexts generated. Cost: $${contextCost.toFixed(4)} (${contextResult.method})`
            );
          } catch (error) {
            console.warn(`  Warning: Context generation failed, using original chunks:`, error);
            // Fall back to original chunks
          }
        }
      }

      // Generate embeddings for all chunks (with or without context)
      console.log(`  Generating embeddings...`);
      const embeddingResult = await this.embeddingGenerator.generateBatch(
        chunkTextsForEmbedding,
        (completed, total) => {
          if (completed % 10 === 0 || completed === total) {
            console.log(`    Progress: ${completed}/${total} embeddings`);
          }
        }
      );

      console.log(`  Embeddings generated. Cost: $${embeddingResult.cost.toFixed(4)}`);

      // Prepare chunk records (store original text, embed contextualized text)
      const chunkRecords = chunks.map((chunk, index) => ({
        doc_id: docRecord.id,
        section_path: chunk.sectionPath,
        text: chunk.text, // Store original text for display
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(embeddingResult.results[index].embedding),
      }));

      // Insert chunks in batches (Supabase has a limit)
      const BATCH_SIZE = 100;
      let insertedCount = 0;

      for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
        const batch = chunkRecords.slice(i, i + BATCH_SIZE);
        const { error: chunkError } = await this.supabase
          .from('chunks')
          .insert(batch);

        if (chunkError) throw chunkError;
        insertedCount += batch.length;
        console.log(`  Inserted chunks: ${insertedCount}/${chunkRecords.length}`);
      }

      console.log(`  ✓ Document ingested successfully`);

      return {
        docId: docRecord.id,
        title: metadata.title,
        chunksCreated: chunks.length,
        tokensUsed: embeddingResult.totalTokens,
        cost: embeddingResult.cost + contextCost,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`  ✗ Failed to ingest document: ${errorMsg}`);

      return {
        docId: doc.filePath,
        title: doc.filePath,
        chunksCreated: 0,
        tokensUsed: 0,
        cost: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * Ingest multiple documents
   */
  async ingestDocuments(docs: DocumentToIngest[], overwrite = false): Promise<IngestionStats> {
    console.log(`\n=== Starting ingestion of ${docs.length} documents ===\n`);

    const results: IngestionResult[] = [];
    let totalChunks = 0;
    let totalEmbeddings = 0;
    let totalCost = 0;

    for (const doc of docs) {
      const result = await this.ingestDocument(doc, overwrite);
      results.push(result);

      if (!result.error && !result.skipped) {
        totalChunks += result.chunksCreated;
        totalEmbeddings += result.tokensUsed;
        totalCost += result.cost;
      }
    }

    const ingested = results.filter((r) => !r.error && !r.skipped).length;
    const failed = results.filter((r) => r.error).length;
    const skipped = results.filter((r) => r.skipped).length;

    const stats: IngestionStats = {
      documentsProcessed: docs.length,
      documentsIngested: ingested,
      documentsFailed: failed,
      documentsSkipped: skipped,
      chunksCreated: totalChunks,
      embeddingsGenerated: totalEmbeddings,
      totalCost,
      results,
    };

    console.log(`\n=== Ingestion Complete ===`);
    console.log(`Documents processed: ${stats.documentsProcessed}`);
    console.log(`  Ingested: ${stats.documentsIngested}`);
    console.log(`  Skipped: ${stats.documentsSkipped || 0}`);
    console.log(`  Failed: ${stats.documentsFailed}`);
    console.log(`Total chunks: ${stats.chunksCreated}`);
    console.log(`Total embeddings: ${stats.embeddingsGenerated}`);
    console.log(`Total cost: $${stats.totalCost.toFixed(4)}\n`);

    return stats;
  }

  /**
   * Delete a document and its chunks
   */
  async deleteDocument(docId: string): Promise<void> {
    const { error } = await this.supabase
      .from('docs')
      .delete()
      .eq('id', docId);

    if (error) throw error;

    // Chunks are automatically deleted via CASCADE
    console.log(`Deleted document: ${docId}`);
  }

  /**
   * List all documents for a persona
   */
  async listDocuments(personaSlug: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('docs')
      .select('id, title, type, date, created_at, personas, tags')
      .contains('personas', [personaSlug])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(docId: string): Promise<{
    chunkCount: number;
    avgTokens: number;
    totalTokens: number;
  }> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('token_count')
      .eq('doc_id', docId);

    if (error) throw error;

    const chunks = data || [];
    const totalTokens = chunks.reduce((sum, c) => sum + c.token_count, 0);
    const avgTokens = chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0;

    return {
      chunkCount: chunks.length,
      avgTokens,
      totalTokens,
    };
  }
}

/**
 * Create ingestor from environment variables
 */
export function createIngestor(): DatabaseIngestor {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  return new DatabaseIngestor(supabaseUrl, supabaseKey, openaiKey);
}