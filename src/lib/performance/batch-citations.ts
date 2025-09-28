/**
 * Optimized Batch Citation Processing
 * High-performance citation processing with batching and caching
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface BatchCitation {
  messageId: string;
  documentId: string;
  chunkId?: string;
  marker: string;
  factSummary?: string;
  pageRange?: string;
  relevanceScore?: number;
  citationOrder: number;
}

interface BatchSource {
  conversationId: string;
  documentId: string;
  lastUsedAt: string;
  carryScore: number;
  pinned: boolean;
  turnsInactive: number;
}

// In-memory cache for document metadata to avoid repeated queries
const documentMetadataCache = new Map<
  string,
  {
    title: string;
    docType: string;
    metadata?: any;
    cachedAt: Date;
  }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class BatchCitationProcessor {
  private citationBatch: BatchCitation[] = [];
  private sourceBatch: BatchSource[] = [];
  private batchSize: number;
  private flushTimeoutMs: number;
  private flushTimeout: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(batchSize = 50, flushTimeoutMs = 2000) {
    this.batchSize = batchSize;
    this.flushTimeoutMs = flushTimeoutMs;
  }

  /**
   * Add citations to batch for processing
   */
  addCitations(
    supabase: SupabaseClient,
    messageId: string,
    conversationId: string,
    ragContext: any
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (ragContext.enhancedCitations?.length > 0) {
          // Process enhanced citations
          ragContext.enhancedCitations.forEach(
            (citation: any, index: number) => {
              this.citationBatch.push({
                messageId,
                documentId: citation.documentId,
                chunkId: citation.chunkId,
                marker: citation.marker || `[${index + 1}]`,
                factSummary: citation.factSummary,
                pageRange: citation.pageRange,
                relevanceScore: citation.relevanceScore || 1.0,
                citationOrder: citation.citationOrder || index + 1,
              });

              // Add to source batch for conversation_sources update
              this.sourceBatch.push({
                conversationId,
                documentId: citation.documentId,
                lastUsedAt: new Date().toISOString(),
                carryScore: citation.relevanceScore || 1.0,
                pinned: false,
                turnsInactive: 0,
              });
            }
          );
        }

        // Schedule batch flush if not already scheduled
        this.scheduleBatchFlush(supabase);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Schedule batch flush with timeout or size limit
   */
  private scheduleBatchFlush(supabase: SupabaseClient) {
    // Immediate flush if batch size reached
    if (this.citationBatch.length >= this.batchSize) {
      this.flushBatch(supabase);
      return;
    }

    // Schedule timeout flush if not already scheduled
    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flushBatch(supabase);
      }, this.flushTimeoutMs);
    }
  }

  /**
   * Flush current batch to database
   */
  private async flushBatch(supabase: SupabaseClient) {
    if (
      this.processing ||
      (this.citationBatch.length === 0 && this.sourceBatch.length === 0)
    ) {
      return;
    }

    this.processing = true;

    // Clear timeout
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    const startTime = Date.now();
    const citationsToProcess = [...this.citationBatch];
    const sourcesToProcess = [...this.sourceBatch];

    // Clear batches
    this.citationBatch = [];
    this.sourceBatch = [];

    console.log(
      `🔄 Processing batch: ${citationsToProcess.length} citations, ${sourcesToProcess.length} sources`
    );

    try {
      // Execute citation and source operations in parallel
      const operations: Promise<any>[] = [];

      if (citationsToProcess.length > 0) {
        // Optimize citations data for insertion
        const citationData = citationsToProcess.map(citation => ({
          message_id: citation.messageId,
          document_id: citation.documentId,
          chunk_id: citation.chunkId,
          marker: citation.marker,
          fact_summary: citation.factSummary,
          page_range: citation.pageRange,
          relevance_score: citation.relevanceScore,
          citation_order: citation.citationOrder,
        }));

        operations.push(
          supabase.from('message_citations').insert(citationData)
        );
      }

      if (sourcesToProcess.length > 0) {
        // Deduplicate sources by conversation_id + document_id
        const uniqueSources = this.deduplicateSources(sourcesToProcess);

        operations.push(
          supabase.from('conversation_sources').upsert(
            uniqueSources.map(source => ({
              conversation_id: source.conversationId,
              document_id: source.documentId,
              last_used_at: source.lastUsedAt,
              carry_score: source.carryScore,
              pinned: source.pinned,
              turns_inactive: source.turnsInactive,
            })),
            {
              onConflict: 'conversation_id,document_id',
              ignoreDuplicates: false,
            }
          )
        );
      }

      // Execute all operations in parallel
      const results = await Promise.allSettled(operations);

      // Log results
      let successCount = 0;
      let errorCount = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          successCount++;
        } else {
          errorCount++;
          const operation = index === 0 ? 'citations' : 'sources';
          console.error(
            `❌ Batch ${operation} operation failed:`,
            result.status === 'fulfilled' ? result.value.error : result.reason
          );
        }
      });

      const processingTime = Date.now() - startTime;
      console.log(
        `⚡ Batch processing completed in ${processingTime}ms: ${successCount}/${results.length} operations successful`
      );
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Force immediate flush of current batch
   */
  async forceFlush(supabase: SupabaseClient): Promise<void> {
    await this.flushBatch(supabase);
  }

  /**
   * Get current batch statistics
   */
  getStats() {
    return {
      citationsPending: this.citationBatch.length,
      sourcesPending: this.sourceBatch.length,
      processing: this.processing,
      hasScheduledFlush: !!this.flushTimeout,
    };
  }

  /**
   * Get cached document metadata or fetch if not cached
   */
  async getDocumentMetadata(
    supabase: SupabaseClient,
    documentId: string
  ): Promise<{ title: string; docType: string; metadata?: any } | null> {
    // Check cache first
    const cached = documentMetadataCache.get(documentId);
    const now = new Date();

    if (cached && now.getTime() - cached.cachedAt.getTime() < CACHE_TTL) {
      return cached;
    }

    // Fetch from database
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('title, doc_type, metadata')
        .eq('id', documentId)
        .single();

      if (error || !data) {
        console.warn(
          `Could not fetch metadata for document ${documentId}:`,
          error
        );
        return null;
      }

      const metadata = {
        title: data.title,
        docType: data.doc_type,
        metadata: data.metadata,
        cachedAt: now,
      };

      // Cache the result
      documentMetadataCache.set(documentId, metadata);

      return metadata;
    } catch (error) {
      console.error(
        `Error fetching document metadata for ${documentId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Clear document metadata cache
   */
  clearCache() {
    documentMetadataCache.clear();
  }

  /**
   * Deduplicate sources by conversation_id + document_id
   */
  private deduplicateSources(sources: BatchSource[]): BatchSource[] {
    const uniqueMap = new Map<string, BatchSource>();

    sources.forEach(source => {
      const key = `${source.conversationId}:${source.documentId}`;
      const existing = uniqueMap.get(key);

      if (!existing || source.carryScore > existing.carryScore) {
        uniqueMap.set(key, source);
      }
    });

    return Array.from(uniqueMap.values());
  }
}

// Global singleton batch processor
export const globalBatchProcessor = new BatchCitationProcessor(25, 1500); // Smaller batches for faster processing

/**
 * Add citations to global batch processor
 */
export function addCitationsToBatch(
  supabase: SupabaseClient,
  messageId: string,
  conversationId: string,
  ragContext: any
): Promise<void> {
  return globalBatchProcessor.addCitations(
    supabase,
    messageId,
    conversationId,
    ragContext
  );
}

/**
 * Force flush all pending batches
 */
export function flushAllBatches(supabase: SupabaseClient): Promise<void> {
  return globalBatchProcessor.forceFlush(supabase);
}

/**
 * Get batch processing statistics
 */
export function getBatchStats() {
  return globalBatchProcessor.getStats();
}

/**
 * Optimized citation processing function to replace the original
 */
export async function optimizedCitationPersistence(
  supabase: SupabaseClient,
  messageId: string,
  conversationId: string,
  ragContext: any
): Promise<void> {
  const startTime = Date.now();

  try {
    // Use batch processor for better performance
    await addCitationsToBatch(supabase, messageId, conversationId, ragContext);

    const processingTime = Date.now() - startTime;
    console.log(
      `⚡ Citations queued for batch processing in ${processingTime}ms`
    );
  } catch (error) {
    console.error('❌ Optimized citation persistence failed:', error);
    throw error;
  }
}
