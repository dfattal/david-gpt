/**
 * Async Operations Manager
 * Handles background tasks and non-blocking operations for better performance
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface BackgroundTask {
  id: string;
  type: 'citation_persistence' | 'message_save' | 'conversation_update';
  payload: any;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

// Simple in-memory queue for background tasks
class AsyncTaskQueue {
  private tasks: BackgroundTask[] = [];
  private processing = false;
  private processingStats = {
    processed: 0,
    failed: 0,
    avgProcessingTime: 0,
  };

  enqueue(task: Omit<BackgroundTask, 'id' | 'createdAt'>) {
    const backgroundTask: BackgroundTask = {
      ...task,
      id: `${task.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    this.tasks.push(backgroundTask);
    this.tasks.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return backgroundTask.id;
  }

  private async processQueue() {
    if (this.processing || this.tasks.length === 0) return;

    this.processing = true;
    console.log(
      `🔄 Starting background task processing (${this.tasks.length} tasks)`
    );

    while (this.tasks.length > 0) {
      const task = this.tasks.shift();
      if (!task) break;

      const startTime = Date.now();
      try {
        await this.processTask(task);
        this.processingStats.processed++;

        const processingTime = Date.now() - startTime;
        this.processingStats.avgProcessingTime =
          (this.processingStats.avgProcessingTime *
            (this.processingStats.processed - 1) +
            processingTime) /
          this.processingStats.processed;

        console.log(
          `✅ Completed background task: ${task.type} in ${processingTime}ms`
        );
      } catch (error) {
        this.processingStats.failed++;
        console.error(`❌ Background task failed: ${task.type}`, error);
      }
    }

    this.processing = false;
    console.log(
      `⏹️ Background processing completed. Stats:`,
      this.processingStats
    );
  }

  private async processTask(task: BackgroundTask) {
    switch (task.type) {
      case 'citation_persistence':
        await this.handleCitationPersistence(task.payload);
        break;
      case 'message_save':
        await this.handleMessageSave(task.payload);
        break;
      case 'conversation_update':
        await this.handleConversationUpdate(task.payload);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async handleCitationPersistence(payload: {
    supabase: SupabaseClient;
    messageId: string;
    conversationId: string;
    ragContext: any;
  }) {
    const { supabase, messageId, conversationId, ragContext } = payload;

    // Batch citation operations for better performance
    if (ragContext.enhancedCitations?.length > 0) {
      const citationData = ragContext.enhancedCitations.map(
        (citation: any) => ({
          message_id: messageId,
          document_id: citation.documentId,
          chunk_id: citation.chunkId,
          marker: citation.marker,
          fact_summary: citation.factSummary,
          page_range: citation.pageRange,
          relevance_score: citation.relevanceScore,
          citation_order: citation.citationOrder,
        })
      );

      const sourceData = ragContext.enhancedCitations.map((citation: any) => ({
        conversation_id: conversationId,
        document_id: citation.documentId,
        last_used_at: new Date().toISOString(),
        carry_score: citation.relevanceScore || 1.0,
        pinned: false,
        turns_inactive: 0,
      }));

      // Execute citation and source operations in parallel
      const [citationResult, sourceResult] = await Promise.allSettled([
        supabase.from('message_citations').insert(citationData),
        supabase.from('conversation_sources').upsert(sourceData, {
          onConflict: 'conversation_id,document_id',
          ignoreDuplicates: false,
        }),
      ]);

      if (
        citationResult.status === 'rejected' ||
        (citationResult.status === 'fulfilled' && citationResult.value.error)
      ) {
        throw new Error(
          `Citation persistence failed: ${
            citationResult.status === 'fulfilled'
              ? citationResult.value.error
              : citationResult.reason
          }`
        );
      }

      if (
        sourceResult.status === 'rejected' ||
        (sourceResult.status === 'fulfilled' && sourceResult.value.error)
      ) {
        console.warn(
          `Source update warning:`,
          sourceResult.status === 'fulfilled'
            ? sourceResult.value.error
            : sourceResult.reason
        );
      }
    }
  }

  private async handleMessageSave(payload: {
    supabase: SupabaseClient;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
  }) {
    const { supabase, conversationId, role, content } = payload;

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role,
      content,
    });

    if (error) {
      throw new Error(`Message save failed: ${error.message}`);
    }
  }

  private async handleConversationUpdate(payload: {
    supabase: SupabaseClient;
    conversationId: string;
    userId: string;
    updates: Record<string, any>;
  }) {
    const { supabase, conversationId, userId, updates } = payload;

    const { error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Conversation update failed: ${error.message}`);
    }
  }

  getStats() {
    return {
      ...this.processingStats,
      queueLength: this.tasks.length,
      processing: this.processing,
    };
  }
}

// Global singleton instance
export const asyncTaskQueue = new AsyncTaskQueue();

// Helper functions for common async operations
export function enqueueCitationPersistence(
  supabase: SupabaseClient,
  messageId: string,
  conversationId: string,
  ragContext: any
) {
  return asyncTaskQueue.enqueue({
    type: 'citation_persistence',
    payload: { supabase, messageId, conversationId, ragContext },
    priority: 'medium',
  });
}

export function enqueueMessageSave(
  supabase: SupabaseClient,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  priority: 'high' | 'medium' | 'low' = 'medium'
) {
  return asyncTaskQueue.enqueue({
    type: 'message_save',
    payload: { supabase, conversationId, role, content },
    priority,
  });
}

export function enqueueConversationUpdate(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  updates: Record<string, any>,
  priority: 'high' | 'medium' | 'low' = 'low'
) {
  return asyncTaskQueue.enqueue({
    type: 'conversation_update',
    payload: { supabase, conversationId, userId, updates },
    priority,
  });
}
