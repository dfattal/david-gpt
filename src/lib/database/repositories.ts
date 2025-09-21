/**
 * Database Repository Pattern
 * 
 * Provides a centralized abstraction layer for database operations,
 * eliminating repetitive Supabase query patterns across the codebase.
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentType, ProcessingJob } from '@/lib/rag/types';

// =======================
// Base Repository
// =======================

export class BaseRepository<T = any> {
  protected supabase: SupabaseClient;
  protected tableName: string;

  constructor(tableName: string, supabase?: SupabaseClient) {
    this.tableName = tableName;
    this.supabase = supabase || createOptimizedAdminClient();
  }

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to find ${this.tableName} by id: ${error.message}`);
    }

    return data;
  }

  async findMany(filters: Record<string, any> = {}, limit?: number): Promise<T[]> {
    let query = this.supabase.from(this.tableName).select('*');

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to find ${this.tableName}: ${error.message}`);
    }

    return data || [];
  }

  async create(data: Partial<T>): Promise<T> {
    const { data: created, error } = await this.supabase
      .from(this.tableName)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ${this.tableName}: ${error.message}`);
    }

    return created;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const { data: updated, error } = await this.supabase
      .from(this.tableName)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update ${this.tableName}: ${error.message}`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete ${this.tableName}: ${error.message}`);
    }
  }

  async count(filters: Record<string, any> = {}): Promise<number> {
    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    });

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count ${this.tableName}: ${error.message}`);
    }

    return count || 0;
  }
}

// =======================
// Document Repository
// =======================

export interface Document {
  id: string;
  title: string;
  doc_type: DocumentType;
  url?: string;
  doi?: string;
  patent_no?: string;
  processing_status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class DocumentRepository extends BaseRepository<Document> {
  constructor(supabase?: SupabaseClient) {
    super('documents', supabase);
  }

  async findByUser(userId: string, limit = 50): Promise<Document[]> {
    return this.findMany({ created_by: userId }, limit);
  }

  async findByStatus(status: string, limit = 100): Promise<Document[]> {
    return this.findMany({ processing_status: status }, limit);
  }

  async findByType(docType: DocumentType, limit = 100): Promise<Document[]> {
    return this.findMany({ doc_type: docType }, limit);
  }

  async updateStatus(id: string, status: string): Promise<Document> {
    return this.update(id, { processing_status: status });
  }

  async searchByTitle(query: string, limit = 20): Promise<Document[]> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(limit);

    if (error) {
      throw new Error(`Failed to search documents: ${error.message}`);
    }

    return data || [];
  }
}

// =======================
// Processing Job Repository
// =======================

export class ProcessingJobRepository extends BaseRepository<ProcessingJob> {
  constructor(supabase?: SupabaseClient) {
    super('processing_jobs', supabase);
  }

  async findByUser(userId: string, limit = 50): Promise<ProcessingJob[]> {
    return this.findMany({ user_id: userId }, limit);
  }

  async findByStatus(status: string, limit = 100): Promise<ProcessingJob[]> {
    return this.findMany({ status }, limit);
  }

  async findByDocument(documentId: string): Promise<ProcessingJob[]> {
    return this.findMany({ document_id: documentId });
  }

  async updateProgress(
    id: string, 
    progress: number, 
    message?: string,
    status?: string
  ): Promise<ProcessingJob> {
    const updateData: any = { progress };
    if (message) updateData.progress_message = message;
    if (status) updateData.status = status;
    
    return this.update(id, updateData);
  }

  async markCompleted(id: string, results?: Record<string, any>): Promise<ProcessingJob> {
    return this.update(id, {
      status: 'completed',
      progress: 1.0,
      completed_at: new Date().toISOString(),
      results
    });
  }

  async markFailed(id: string, error: string): Promise<ProcessingJob> {
    return this.update(id, {
      status: 'failed',
      error_message: error,
      completed_at: new Date().toISOString()
    });
  }
}

// =======================
// Conversation Repository
// =======================

export interface Conversation {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export class ConversationRepository extends BaseRepository<Conversation> {
  constructor(supabase?: SupabaseClient) {
    super('conversations', supabase);
  }

  async findByUser(userId: string, limit = 50): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to find conversations: ${error.message}`);
    }

    return data || [];
  }

  async findRecent(userId: string, since: string): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .gt('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find recent conversations: ${error.message}`);
    }

    return data || [];
  }

  async updateTitle(id: string, title: string): Promise<Conversation> {
    return this.update(id, { title });
  }
}

// =======================
// Message Repository
// =======================

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export class MessageRepository extends BaseRepository<Message> {
  constructor(supabase?: SupabaseClient) {
    super('messages', supabase);
  }

  async findByConversation(conversationId: string, limit = 100): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to find messages: ${error.message}`);
    }

    return data || [];
  }

  async createUserMessage(conversationId: string, content: string): Promise<Message> {
    return this.create({
      conversation_id: conversationId,
      role: 'user',
      content
    });
  }

  async createAssistantMessage(conversationId: string, content: string): Promise<Message> {
    return this.create({
      conversation_id: conversationId,
      role: 'assistant',
      content
    });
  }
}

// =======================
// Chunk Repository
// =======================

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  token_count: number;
  position: number;
  embedding?: number[];
  created_at: string;
}

export class ChunkRepository extends BaseRepository<Chunk> {
  constructor(supabase?: SupabaseClient) {
    super('chunks', supabase);
  }

  async findByDocument(documentId: string): Promise<Chunk[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('position', { ascending: true });

    if (error) {
      throw new Error(`Failed to find chunks: ${error.message}`);
    }

    return data || [];
  }

  async createBatch(chunks: Partial<Chunk>[]): Promise<Chunk[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .insert(chunks)
      .select();

    if (error) {
      throw new Error(`Failed to create chunks: ${error.message}`);
    }

    return data || [];
  }

  async search(
    query: string, 
    embedding?: number[], 
    limit = 10
  ): Promise<Chunk[]> {
    let queryBuilder = this.supabase
      .from('chunks')
      .select(`
        *,
        documents (
          id,
          title,
          doc_type,
          url
        )
      `);

    if (embedding) {
      // Use vector similarity search if embedding provided
      queryBuilder = queryBuilder
        .rpc('search_chunks', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: limit
        });
    } else {
      // Full-text search fallback
      queryBuilder = queryBuilder
        .textSearch('content', query)
        .limit(limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to search chunks: ${error.message}`);
    }

    return data || [];
  }
}

// =======================
// Repository Factory
// =======================

export class RepositoryFactory {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createOptimizedAdminClient();
  }

  documents(): DocumentRepository {
    return new DocumentRepository(this.supabase);
  }

  processingJobs(): ProcessingJobRepository {
    return new ProcessingJobRepository(this.supabase);
  }

  conversations(): ConversationRepository {
    return new ConversationRepository(this.supabase);
  }

  messages(): MessageRepository {
    return new MessageRepository(this.supabase);
  }

  chunks(): ChunkRepository {
    return new ChunkRepository(this.supabase);
  }
}

// Export singleton factory
export const repositories = new RepositoryFactory();