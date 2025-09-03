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
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
          content: string
          content_hash: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
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
          content: string
          content_hash: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
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
          content?: string
          content_hash?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
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
      documents: {
        Row: {
          application_no: string | null
          arxiv_id: string | null
          canonical_of: string | null
          canonical_url: string | null
          created_at: string | null
          created_by: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          doi: string | null
          error_message: string | null
          file_hash: string | null
          file_path: string | null
          file_size: number | null
          filed_date: string | null
          funding_agency: string | null
          grant_no: string | null
          granted_date: string | null
          id: string
          iso_date: string | null
          patent_no: string | null
          processed_at: string | null
          processing_status: string | null
          publication_no: string | null
          published_date: string | null
          pubmed_id: string | null
          raw_date: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          superseded_by: string | null
          title: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          application_no?: string | null
          arxiv_id?: string | null
          canonical_of?: string | null
          canonical_url?: string | null
          created_at?: string | null
          created_by?: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          doi?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          filed_date?: string | null
          funding_agency?: string | null
          grant_no?: string | null
          granted_date?: string | null
          id?: string
          iso_date?: string | null
          patent_no?: string | null
          processed_at?: string | null
          processing_status?: string | null
          publication_no?: string | null
          published_date?: string | null
          pubmed_id?: string | null
          raw_date?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          superseded_by?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          application_no?: string | null
          arxiv_id?: string | null
          canonical_of?: string | null
          canonical_url?: string | null
          created_at?: string | null
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          doi?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          filed_date?: string | null
          funding_agency?: string | null
          grant_no?: string | null
          granted_date?: string | null
          id?: string
          iso_date?: string | null
          patent_no?: string | null
          processed_at?: string | null
          processing_status?: string | null
          publication_no?: string | null
          published_date?: string | null
          pubmed_id?: string | null
          raw_date?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          superseded_by?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_canonical_of_fkey"
            columns: ["canonical_of"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "documents"
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
          rel: Database["public"]["Enums"]["relation_type"]
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
          rel: Database["public"]["Enums"]["relation_type"]
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
          rel?: Database["public"]["Enums"]["relation_type"]
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
        ]
      }
      entities: {
        Row: {
          authority_score: number | null
          created_at: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          mention_count: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          authority_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["entity_kind"]
          mention_count?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          authority_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["entity_kind"]
          mention_count?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
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
      [_ in never]: never
    }
    Enums: {
      document_status:
        | "draft"
        | "published"
        | "granted"
        | "expired"
        | "superseded"
      document_type: "pdf" | "paper" | "patent" | "note" | "url" | "book"
      entity_kind:
        | "person"
        | "org"
        | "product"
        | "algorithm"
        | "material"
        | "concept"
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
      relation_type:
        | "author_of"
        | "inventor_of"
        | "assignee_of"
        | "implements"
        | "used_in"
        | "supersedes"
        | "cites"
        | "similar_to"
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