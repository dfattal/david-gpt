export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      aliases: {
        Row: {
          alias: string
          confidence: number | null
          created_at: string | null
          entity_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          alias: string
          confidence?: number | null
          created_at?: string | null
          entity_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          alias?: string
          confidence?: number | null
          created_at?: string | null
          entity_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "aliases_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sources: {
        Row: {
          carry_score: number
          conversation_id: string
          created_at: string | null
          document_id: string
          id: string
          last_used_at: string
          pinned: boolean | null
          turns_inactive: number | null
          updated_at: string | null
        }
        Insert: {
          carry_score?: number
          conversation_id: string
          created_at?: string | null
          document_id: string
          id?: string
          last_used_at?: string
          pinned?: boolean | null
          turns_inactive?: number | null
          updated_at?: string | null
        }
        Update: {
          carry_score?: number
          conversation_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
          last_used_at?: string
          pinned?: boolean | null
          turns_inactive?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sources_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          context_summary: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          persona_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          persona_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          persona_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          chunk_type: string | null
          content: string
          content_hash: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          overlap_end: number | null
          overlap_start: number | null
          page_end: number | null
          page_start: number | null
          section_title: string | null
          token_count: number
          tsvector_content: unknown | null
        }
        Insert: {
          chunk_index: number
          chunk_type?: string | null
          content: string
          content_hash: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          overlap_end?: number | null
          overlap_start?: number | null
          page_end?: number | null
          page_start?: number | null
          section_title?: string | null
          token_count: number
          tsvector_content?: unknown | null
        }
        Update: {
          chunk_index?: number
          chunk_type?: string | null
          content?: string
          content_hash?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          overlap_end?: number | null
          overlap_start?: number | null
          page_end?: number | null
          page_start?: number | null
          section_title?: string | null
          token_count?: number
          tsvector_content?: unknown | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          persona_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_types_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          actors: Json | null
          created_at: string | null
          created_by: string | null
          dates: Json | null
          document_type_id: number
          error_message: string | null
          file_hash: string | null
          file_path: string | null
          file_size: number | null
          id: string
          identifiers: Json | null
          persona_id: string | null
          processed_at: string | null
          processing_status: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          title: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          actors?: Json | null
          created_at?: string | null
          created_by?: string | null
          dates?: Json | null
          document_type_id: number
          error_message?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          identifiers?: Json | null
          persona_id?: string | null
          processed_at?: string | null
          processing_status?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          title: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          actors?: Json | null
          created_at?: string | null
          created_by?: string | null
          dates?: Json | null
          document_type_id?: number
          error_message?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          identifiers?: Json | null
          persona_id?: string | null
          processed_at?: string | null
          processing_status?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          title?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      edges: {
        Row: {
          created_at: string | null
          dst_id: string
          dst_type: Database["public"]["Enums"]["source_type"]
          evidence_doc_id: string | null
          evidence_text: string | null
          id: string
          relationship_type_id: number
          src_id: string
          src_type: Database["public"]["Enums"]["source_type"]
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          dst_id: string
          dst_type: Database["public"]["Enums"]["source_type"]
          evidence_doc_id?: string | null
          evidence_text?: string | null
          id?: string
          relationship_type_id: number
          src_id: string
          src_type: Database["public"]["Enums"]["source_type"]
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          dst_id?: string
          dst_type?: Database["public"]["Enums"]["source_type"]
          evidence_doc_id?: string | null
          evidence_text?: string | null
          id?: string
          relationship_type_id?: number
          src_id?: string
          src_type?: Database["public"]["Enums"]["source_type"]
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "edges_evidence_doc_id_fkey"
            columns: ["evidence_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          authority_score: number | null
          created_at: string | null
          description: string | null
          entity_kind_id: number
          id: string
          mention_count: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          authority_score?: number | null
          created_at?: string | null
          description?: string | null
          entity_kind_id: number
          id?: string
          mention_count?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          authority_score?: number | null
          created_at?: string | null
          description?: string | null
          entity_kind_id?: number
          id?: string
          mention_count?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_entity_kind_id_fkey"
            columns: ["entity_kind_id"]
            isOneToOne: false
            referencedRelation: "entity_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_kinds: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          persona_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_kinds_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          authority: string | null
          created_at: string | null
          description: string | null
          document_id: string | null
          entity_id: string | null
          event_date: string
          id: string
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          authority?: string | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          entity_id?: string | null
          event_date: string
          id?: string
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          authority?: string | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          entity_id?: string | null
          event_date?: string
          id?: string
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      message_citations: {
        Row: {
          chunk_id: string | null
          citation_order: number | null
          created_at: string | null
          document_id: string
          fact_summary: string | null
          id: string
          marker: string
          message_id: string
          page_range: string | null
          relevance_score: number | null
        }
        Insert: {
          chunk_id?: string | null
          citation_order?: number | null
          created_at?: string | null
          document_id: string
          fact_summary?: string | null
          id?: string
          marker: string
          message_id: string
          page_range?: string | null
          relevance_score?: number | null
        }
        Update: {
          chunk_id?: string | null
          citation_order?: number | null
          created_at?: string | null
          document_id?: string
          fact_summary?: string | null
          id?: string
          marker?: string
          message_id?: string
          page_range?: string | null
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_citations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          processing_time_ms: number | null
          response_mode: string | null
          role: string
          sources_used: number | null
          turn_type: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          processing_time_ms?: number | null
          response_mode?: string | null
          role: string
          sources_used?: number | null
          turn_type?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          processing_time_ms?: number | null
          response_mode?: string | null
          role?: string
          sources_used?: number | null
          turn_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_document_type_permissions: {
        Row: {
          created_at: string | null
          document_type_id: number
          persona_id: string
        }
        Insert: {
          created_at?: string | null
          document_type_id: number
          persona_id: string
        }
        Update: {
          created_at?: string | null
          document_type_id?: number
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_document_type_permissions_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_document_type_permissions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_entity_kind_permissions: {
        Row: {
          created_at: string | null
          entity_kind_id: number
          persona_id: string
        }
        Insert: {
          created_at?: string | null
          entity_kind_id: number
          persona_id: string
        }
        Update: {
          created_at?: string | null
          entity_kind_id?: number
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_entity_kind_permissions_entity_kind_id_fkey"
            columns: ["entity_kind_id"]
            isOneToOne: false
            referencedRelation: "entity_kinds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_entity_kind_permissions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_relationship_type_permissions: {
        Row: {
          created_at: string | null
          persona_id: string
          relationship_type_id: number
        }
        Insert: {
          created_at?: string | null
          persona_id: string
          relationship_type_id: number
        }
        Update: {
          created_at?: string | null
          persona_id?: string
          relationship_type_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "persona_relationship_type_permissions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_relationship_type_permissions_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          persona_id: string
          updated_at: string | null
          validation_errors: string[] | null
          validation_status: string | null
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          persona_id: string
          updated_at?: string | null
          validation_errors?: string[] | null
          validation_status?: string | null
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          persona_id?: string
          updated_at?: string | null
          validation_errors?: string[] | null
          validation_status?: string | null
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          attempts: number | null
          completed_at: string | null
          config: Json | null
          created_at: string | null
          document_id: string | null
          error_message: string | null
          id: string
          max_attempts: number | null
          priority: number | null
          progress: number | null
          progress_message: string | null
          results: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          document_id?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          priority?: number | null
          progress?: number | null
          progress_message?: string | null
          results?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          document_id?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          priority?: number | null
          progress?: number | null
          progress_message?: string | null
          results?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          persona_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          persona_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_types_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          id: string
          query_text: string
          query_type: string | null
          response_time_ms: number | null
          results_count: number | null
          sources_retrieved: number | null
          sources_used: number | null
          user_feedback: string | null
          user_id: string | null
          user_rating: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          query_text: string
          query_type?: string | null
          response_time_ms?: number | null
          results_count?: number | null
          sources_retrieved?: number | null
          sources_used?: number | null
          user_feedback?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          query_text?: string
          query_type?: string | null
          response_time_ms?: number | null
          results_count?: number | null
          sources_retrieved?: number | null
          sources_used?: number | null
          user_feedback?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          last_active_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      bm25_score: {
        Args: {
          b?: number
          document_vector: unknown
          k1?: number
          query_text: string
        }
        Returns: number
      }
      cleanup_expired_conversation_sources: {
        Args: { dry_run?: boolean; ttl_turns?: number }
        Returns: {
          action_taken: string
          conversation_id: string
          expired_sources: number
        }[]
      }
      cleanup_old_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_entities: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      clear_user_knowledge_graph: {
        Args: { p_user_id: string }
        Returns: {
          chunk_entities_deleted: number
          entities_deleted: number
          relations_deleted: number
        }[]
      }
      exec_sql: {
        Args: { sql: string }
        Returns: string
      }
      find_orphaned_entities: {
        Args: Record<PropertyKey, never>
        Returns: {
          canonical_name: string
          created_at: string
          entity_id: number
          type: string
        }[]
      }
      get_active_personas_with_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          avatar_url: string
          conversations: number
          description: string
          documents: number
          expertise_domains: string[]
          is_active: boolean
          last_active: string
          name: string
          persona_id: string
        }[]
      }
      get_conversation_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          conversations_this_week: number
          conversations_today: number
          total_conversations: number
        }[]
      }
      get_current_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_document_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          documents_this_week: number
          documents_today: number
          total_documents: number
        }[]
      }
      get_habit_conversation_insights: {
        Args: { target_user_id?: string }
        Returns: {
          consistency_score: number
          conversation_count: number
          habit_keywords: string[]
          last_mention: string
        }[]
      }
      get_message_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_response_time: number
          messages_last_hour: number
          messages_today: number
          total_messages: number
        }[]
      }
      get_persona_activity_realtime: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_users: number
          avg_response_time: number
          conversations_last_hour: number
          messages_last_hour: number
          name: string
          persona_id: string
        }[]
      }
      get_persona_analytics: {
        Args: Record<PropertyKey, never>
        Returns: {
          conversations: number
          documents: number
          kg_entities: number
          kg_relationships: number
          last_active: string
          monthly_conversations: number
          persona_id: string
          persona_identifier: string
          total_messages: number
          weekly_conversations: number
        }[]
      }
      get_persona_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_personas: number
          total_personas: number
        }[]
      }
      get_recent_activity_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_users_this_hour: number
          active_users_today: number
          error_rate: number
        }[]
      }
      get_user_conversation_ids: {
        Args: Record<PropertyKey, never>
        Returns: {
          conversation_id: string
        }[]
      }
      get_user_conversation_summary: {
        Args: { target_user_id?: string }
        Returns: {
          active_conversations: number
          activity_streak_days: number
          avg_messages_per_conversation: number
          last_activity: string
          total_conversations: number
          total_messages: number
        }[]
      }
      get_user_entity_stats: {
        Args: { p_user_id: string }
        Returns: {
          avg_confidence: number
          entity_count: number
          entity_type: string
          total_mentions: number
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      increment_mention_count: {
        Args: { entity_id: string }
        Returns: undefined
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      refresh_conversation_analytics: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      restore_conversation: {
        Args: { conversation_uuid: string }
        Returns: boolean
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      soft_delete_conversation: {
        Args:
          | { conversation_id: string; user_id: string }
          | { conversation_uuid: string }
        Returns: Json
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      document_status:
        | "draft"
        | "published"
        | "granted"
        | "expired"
        | "superseded"
      document_type_deprecated:
        | "pdf"
        | "paper"
        | "patent"
        | "note"
        | "url"
        | "book"
        | "press-article"
      document_type_enum:
        | "academic-paper"
        | "preprint"
        | "thesis"
        | "conference-paper"
        | "patent"
        | "legal-document"
        | "press-release"
        | "news-article"
        | "blog-post"
        | "white-paper"
        | "datasheet"
        | "manual"
        | "internal-note"
        | "report"
        | "presentation"
        | "book"
        | "magazine-article"
      entity_kind_deprecated:
        | "person"
        | "organization"
        | "product"
        | "technology"
        | "component"
        | "document"
      event_type:
        | "filed"
        | "published"
        | "granted"
        | "expires"
        | "product_launch"
        | "acquired"
        | "founded"
      job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      job_type:
        | "document_ingest"
        | "entity_extraction"
        | "embedding_generation"
        | "kg_processing"
        | "reindexing"
      patent_status_enum: "filed" | "active" | "expired"
      relation_type_deprecated:
        | "author_of"
        | "inventor_of"
        | "assignee_of"
        | "implements"
        | "used_in"
        | "supersedes"
        | "cites"
        | "similar_to"
        | "enables_3d"
        | "uses_component"
        | "competing_with"
        | "integrates_with"
        | "can_use"
        | "enhances"
        | "evolved_to"
        | "alternative_to"
        | "affiliated_with"
        | "made_by"
        | "supplied_by"
      source_type: "entity" | "document"
      user_role: "admin" | "member" | "guest"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      document_status: [
        "draft",
        "published",
        "granted",
        "expired",
        "superseded",
      ],
      document_type_deprecated: [
        "pdf",
        "paper",
        "patent",
        "note",
        "url",
        "book",
        "press-article",
      ],
      document_type_enum: [
        "academic-paper",
        "preprint",
        "thesis",
        "conference-paper",
        "patent",
        "legal-document",
        "press-release",
        "news-article",
        "blog-post",
        "white-paper",
        "datasheet",
        "manual",
        "internal-note",
        "report",
        "presentation",
        "book",
        "magazine-article",
      ],
      entity_kind_deprecated: [
        "person",
        "organization",
        "product",
        "technology",
        "component",
        "document",
      ],
      event_type: [
        "filed",
        "published",
        "granted",
        "expires",
        "product_launch",
        "acquired",
        "founded",
      ],
      job_status: ["pending", "processing", "completed", "failed", "cancelled"],
      job_type: [
        "document_ingest",
        "entity_extraction",
        "embedding_generation",
        "kg_processing",
        "reindexing",
      ],
      patent_status_enum: ["filed", "active", "expired"],
      relation_type_deprecated: [
        "author_of",
        "inventor_of",
        "assignee_of",
        "implements",
        "used_in",
        "supersedes",
        "cites",
        "similar_to",
        "enables_3d",
        "uses_component",
        "competing_with",
        "integrates_with",
        "can_use",
        "enhances",
        "evolved_to",
        "alternative_to",
        "affiliated_with",
        "made_by",
        "supplied_by",
      ],
      source_type: ["entity", "document"],
      user_role: ["admin", "member", "guest"],
    },
  },
} as const