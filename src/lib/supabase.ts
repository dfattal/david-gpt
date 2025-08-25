import { createClient } from '@/lib/supabase/client'

// Client-side Supabase client using SSR-compatible client
// This is kept for backward compatibility but should be replaced with API calls
export const supabase = createClient()

// Types for our database schema
export interface Conversation {
  id: string
  owner: string
  title: string
  title_status: 'pending' | 'ready' | 'error'
  created_at: string
  updated_at: string
  last_message_at: string
  deleted_at: string | null
}

export interface StoredMessage {
  id: number
  conversation_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  parts: MessagePart[]
  provider_message_id: string | null
  created_at: string
}

// UIMessage interface for Vercel AI SDK v5
export interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  parts: MessagePart[]
  createdAt?: Date
}

export interface MessagePart {
  type: 'text' | 'image' | 'file'
  text?: string
  image?: string
  data?: unknown
}

