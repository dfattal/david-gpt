// Database types based on the established schema
export type UserRole = 'admin' | 'member' | 'guest'

export interface UserProfile {
  id: string
  email: string
  display_name?: string
  role: UserRole
  created_at: string
  updated_at: string
  last_active_at: string
}

export interface Conversation {
  id: string
  user_id: string
  persona_id?: string
  title?: string
  last_message_at: string
  context_summary?: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  turn_type?: 'new-topic' | 'drill-down' | 'compare' | 'same-sources'
  response_mode?: 'FACT' | 'EXPLAIN' | 'CONFLICTS'
  processing_time_ms?: number
  sources_used?: number
  created_at: string
  rag_weight?: number
  rag_weight_breakdown?: {
    citation_density: number
    context_utilization: number
    token_overlap: number
    search_quality: number
  }
  metadata?: any
}

export interface MessageCitation {
  id: string
  message_id: string
  document_id: string
  chunk_id?: string
  marker: string
  fact_summary?: string
  page_range?: string
  relevance_score?: number
  citation_order?: number
  created_at: string
}

export interface Document {
  id: string
  title: string
  doc_type: 'pdf' | 'paper' | 'patent' | 'note' | 'url' | 'book'
  status?: 'draft' | 'published' | 'granted' | 'expired' | 'superseded'
  file_path?: string
  file_size?: number
  file_hash?: string
  doi?: string
  arxiv_id?: string
  patent_no?: string
  url?: string
  processing_status?: string
  processed_at?: string
  error_message?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// Active job tracking (for real-time progress UI)
export interface ActiveJob {
  id: string
  jobType: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: {
    current: number
    total: number
    message: string
  }
  docId?: string // Document ID if available (from result_data or input_data)
  createdAt: string
  error?: string
}

// AI SDK types
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}