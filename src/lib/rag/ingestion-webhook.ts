/**
 * Webhook support for real-time ingestion progress monitoring
 */

import { createClient } from '@/lib/supabase/server';

export interface IngestionStage {
  stage: 'upload' | 'analysis' | 'chunking' | 'embedding' | 'entities_extraction' | 'entities_consolidation' | 'completed' | 'failed';
  progress: number; // 0-1
  message: string;
  details?: {
    chunksCreated?: number;
    embeddingsGenerated?: number;
    entitiesExtracted?: number;
    entitiesConsolidated?: number;
    timeElapsed?: number;
    error?: string;
    metadata?: any;
  };
}

export interface IngestionWebhookPayload {
  documentId: string;
  jobId: string;
  userId: string;
  stage: IngestionStage;
  timestamp: string;
  batchId?: string;
}

export class IngestionWebhookManager {
  private static instance: IngestionWebhookManager;
  private webhookEndpoints: Map<string, Set<string>> = new Map(); // userId -> Set of webhook URLs
  private sseConnections: Map<string, any> = new Map(); // userId -> SSE connection

  static getInstance(): IngestionWebhookManager {
    if (!this.instance) {
      this.instance = new IngestionWebhookManager();
    }
    return this.instance;
  }

  /**
   * Register a webhook endpoint for a user
   */
  registerWebhook(userId: string, webhookUrl: string) {
    if (!this.webhookEndpoints.has(userId)) {
      this.webhookEndpoints.set(userId, new Set());
    }
    this.webhookEndpoints.get(userId)!.add(webhookUrl);
  }

  /**
   * Register SSE connection for real-time updates
   */
  registerSSEConnection(userId: string, connection: any) {
    this.sseConnections.set(userId, connection);
  }

  /**
   * Unregister SSE connection
   */
  unregisterSSEConnection(userId: string) {
    this.sseConnections.delete(userId);
  }

  /**
   * Send progress update to all registered endpoints
   */
  async sendProgressUpdate(payload: IngestionWebhookPayload) {
    // Send to webhook endpoints
    await this.sendToWebhooks(payload);
    
    // Send to SSE connections
    this.sendToSSE(payload);
    
    // Update database record
    await this.updateDatabaseRecord(payload);
  }

  private async sendToWebhooks(payload: IngestionWebhookPayload) {
    const webhooks = this.webhookEndpoints.get(payload.userId);
    if (!webhooks || webhooks.size === 0) return;

    const promises = Array.from(webhooks).map(async (webhookUrl) => {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'David-GPT-Ingestion-Webhook'
          },
          body: JSON.stringify(payload),
          timeout: 5000 // 5 second timeout
        });

        if (!response.ok) {
          console.warn(`Webhook failed: ${webhookUrl} - ${response.status}`);
        }
      } catch (error) {
        console.error(`Webhook error: ${webhookUrl}`, error);
        // Remove failed webhook after 3 consecutive failures
        // This could be enhanced with a retry mechanism
      }
    });

    await Promise.allSettled(promises);
  }

  private sendToSSE(payload: IngestionWebhookPayload) {
    const connection = this.sseConnections.get(payload.userId);
    if (!connection) return;

    try {
      const data = JSON.stringify({
        type: 'ingestion_progress',
        data: payload
      });
      
      connection.write(data);
    } catch (error) {
      console.error('SSE send error:', error);
      this.unregisterSSEConnection(payload.userId);
    }
  }

  private async updateDatabaseRecord(payload: IngestionWebhookPayload) {
    try {
      const supabase = await createClient();
      
      // Update processing job record
      await supabase
        .from('processing_jobs')
        .update({
          status: this.mapStageToStatus(payload.stage.stage),
          progress: payload.stage.progress,
          progress_message: payload.stage.message,
          ...(payload.stage.stage === 'completed' && {
            completed_at: new Date().toISOString(),
            results: payload.stage.details
          }),
          ...(payload.stage.stage === 'failed' && {
            completed_at: new Date().toISOString(),
            error_message: payload.stage.details?.error || payload.stage.message
          })
        })
        .eq('id', payload.jobId);

      // Update document record if needed
      if (payload.stage.stage === 'completed' || payload.stage.stage === 'failed') {
        await supabase
          .from('documents')
          .update({
            processing_status: payload.stage.stage,
            ...(payload.stage.stage === 'completed' && {
              processed_at: new Date().toISOString()
            }),
            ...(payload.stage.stage === 'failed' && {
              error_message: payload.stage.details?.error || payload.stage.message
            })
          })
          .eq('id', payload.documentId);
      }
    } catch (error) {
      console.error('Failed to update database record:', error);
    }
  }

  private mapStageToStatus(stage: IngestionStage['stage']): string {
    switch (stage) {
      case 'upload': return 'pending';
      case 'analysis':
      case 'chunking':
      case 'embedding':
      case 'entities_extraction':
      case 'entities_consolidation': return 'processing';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }

  /**
   * Helper method to create stage progress updates
   */
  static createStageUpdate(
    stage: IngestionStage['stage'],
    progress: number,
    message: string,
    details?: IngestionStage['details']
  ): IngestionStage {
    return {
      stage,
      progress,
      message,
      details
    };
  }

  /**
   * Predefined stage templates aligned with progress visualization
   */
  static readonly STAGES = {
    UPLOAD: () => this.createStageUpdate(
      'upload', 0.1,
      'Document uploaded to database'
    ),

    ANALYSIS: (isUrlList?: boolean) => this.createStageUpdate(
      'analysis', 0.3,
      isUrlList ? 'Analyzing URL list and expanding into individual documents' : 'Analyzing document content and structure'
    ),

    CHUNKING: (chunks?: number) => this.createStageUpdate(
      'chunking', 0.5,
      chunks ? `Creating ${chunks} text chunks` : 'Breaking document into searchable chunks',
      chunks ? { chunksCreated: chunks } : undefined
    ),

    EMBEDDING: (embeddings?: number) => this.createStageUpdate(
      'embedding', 0.7,
      embeddings ? `Generating ${embeddings} embeddings` : 'Generating semantic embeddings',
      embeddings ? { embeddingsGenerated: embeddings } : undefined
    ),

    ENTITIES_EXTRACTION: (entities?: number) => this.createStageUpdate(
      'entities_extraction', 0.85,
      entities ? `Extracting ${entities} entities` : 'Extracting entities for knowledge graph',
      entities ? { entitiesExtracted: entities } : undefined
    ),

    ENTITIES_CONSOLIDATION: (consolidated?: number) => this.createStageUpdate(
      'entities_consolidation', 0.95,
      consolidated ? `Consolidated ${consolidated} entities` : 'Consolidating and linking entities',
      consolidated ? { entitiesConsolidated: consolidated } : undefined
    ),

    COMPLETED: (chunks: number, embeddings: number, entities: number, consolidated: number, timeElapsed?: number) => this.createStageUpdate(
      'completed', 1.0,
      'Document processing completed successfully - ready for search and chat',
      { chunksCreated: chunks, embeddingsGenerated: embeddings, entitiesExtracted: entities, entitiesConsolidated: consolidated, timeElapsed }
    ),

    FAILED: (error: string) => this.createStageUpdate(
      'failed', 0.0,
      'Document processing failed',
      { error }
    )
  };
}

/**
 * Helper functions for webhook integration
 */
export async function notifyIngestionProgress(
  documentId: string,
  jobId: string,
  userId: string,
  stage: IngestionStage,
  batchId?: string
) {
  const webhookManager = IngestionWebhookManager.getInstance();
  
  const payload: IngestionWebhookPayload = {
    documentId,
    jobId,
    userId,
    stage,
    timestamp: new Date().toISOString(),
    batchId
  };

  await webhookManager.sendProgressUpdate(payload);
}

/**
 * Batch progress tracking
 */
export class BatchProgressTracker {
  private batchId: string;
  private userId: string;
  private totalDocuments: number;
  private completedDocuments: number = 0;
  private failedDocuments: number = 0;

  constructor(batchId: string, userId: string, totalDocuments: number) {
    this.batchId = batchId;
    this.userId = userId;
    this.totalDocuments = totalDocuments;
  }

  async notifyDocumentProgress(documentId: string, jobId: string, stage: IngestionStage) {
    // Track completion
    if (stage.stage === 'completed') {
      this.completedDocuments++;
    } else if (stage.stage === 'failed') {
      this.failedDocuments++;
    }

    // Send individual document progress
    await notifyIngestionProgress(documentId, jobId, this.userId, stage, this.batchId);

    // Send batch progress if document completed/failed
    if (stage.stage === 'completed' || stage.stage === 'failed') {
      await this.notifyBatchProgress();
    }
  }

  async updateProgress(progress: number) {
    // Create a generic batch progress update
    const batchStage = IngestionWebhookManager.createStageUpdate(
      'entities_consolidation', progress,
      `Batch progress: ${Math.round(progress * 100)}% (${Math.round(progress * this.totalDocuments)}/${this.totalDocuments} documents processed)`,
      { chunksCreated: this.completedDocuments }
    );

    // Send batch progress with special batch document ID
    await notifyIngestionProgress(
      `batch_${this.batchId}`,
      `batch_job_${this.batchId}`,
      this.userId,
      batchStage,
      this.batchId
    );
  }

  private async notifyBatchProgress() {
    const totalProcessed = this.completedDocuments + this.failedDocuments;
    const batchProgress = totalProcessed / this.totalDocuments;
    
    let batchStage: IngestionStage;
    
    if (totalProcessed === this.totalDocuments) {
      if (this.failedDocuments === 0) {
        batchStage = IngestionWebhookManager.createStageUpdate(
          'completed', 1.0,
          `Batch completed: ${this.completedDocuments} documents processed successfully`,
          { chunksCreated: this.completedDocuments }
        );
      } else {
        batchStage = IngestionWebhookManager.createStageUpdate(
          'completed', 1.0,
          `Batch completed: ${this.completedDocuments} succeeded, ${this.failedDocuments} failed`,
          { chunksCreated: this.completedDocuments, error: `${this.failedDocuments} documents failed` }
        );
      }
    } else {
      batchStage = IngestionWebhookManager.createStageUpdate(
        'entities_consolidation', batchProgress,
        `Batch progress: ${totalProcessed}/${this.totalDocuments} documents processed`,
        { chunksCreated: this.completedDocuments }
      );
    }

    // Send batch progress with special batch document ID
    await notifyIngestionProgress(
      `batch_${this.batchId}`,
      `batch_job_${this.batchId}`,
      this.userId,
      batchStage,
      this.batchId
    );
  }
}