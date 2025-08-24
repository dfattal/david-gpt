import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Legacy client-side Supabase client (for compatibility with existing hooks)
export const supabase = createSupabaseClient(supabaseUrl, supabaseKey)

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

