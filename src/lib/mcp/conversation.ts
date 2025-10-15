/**
 * MCP Conversation Utilities
 * Handles conversation persistence and retrieval for MCP clients
 * Similar to Slack integration but for MCP protocol
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';

// MCP system user ID
const MCP_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Get or create conversation for an MCP session
 * @param sessionId - Unique session identifier from MCP client
 * @param personaSlug - Persona slug (default: 'david')
 * @returns Conversation ID (UUID)
 */
export async function getOrCreateMcpConversation(
  sessionId: string,
  personaSlug: string = 'david'
): Promise<string> {
  const supabase = createOptimizedAdminClient();

  // Try to find existing conversation by mcp_session_id
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('mcp_session_id', sessionId)
    .single();

  if (existing) {
    console.log('[MCP] Found existing conversation:', existing.id);
    return existing.id;
  }

  // Get persona ID from slug
  const { data: persona } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', personaSlug)
    .eq('is_active', true)
    .single();

  if (!persona) {
    console.warn(`[MCP] Persona '${personaSlug}' not found, using null`);
  }

  // Create new conversation with MCP system user
  const { data: newConversation, error } = await supabase
    .from('conversations')
    .insert({
      user_id: MCP_SYSTEM_USER_ID,
      mcp_session_id: sessionId,
      persona_id: persona?.id || null,
      title: 'MCP conversation', // Will be updated with first message
    })
    .select('id')
    .single();

  if (error || !newConversation) {
    console.error('[MCP] Failed to create conversation:', error);
    throw new Error('Failed to create conversation');
  }

  console.log('[MCP] Created new conversation:', newConversation.id);
  return newConversation.id;
}

/**
 * Get conversation history for an MCP session
 * Returns last N messages in chronological order (oldest first)
 * @param conversationId - Conversation UUID
 * @param limit - Maximum number of messages to retrieve (default: 6)
 * @returns Array of messages with role and content
 */
export async function getMcpConversationHistory(
  conversationId: string,
  limit: number = 6
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = createOptimizedAdminClient();

  const { data: messages, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[MCP] Failed to fetch conversation history:', error);
    return [];
  }

  if (!messages || messages.length === 0) {
    return [];
  }

  // Reverse to get chronological order (oldest first)
  const history = messages.reverse().map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  console.log('[MCP] Retrieved conversation history:', history.length, 'messages');
  return history;
}

/**
 * Store a message in the conversation
 * @param conversationId - Conversation UUID
 * @param role - Message role ('user' or 'assistant')
 * @param content - Message content
 */
export async function storeMcpMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const supabase = createOptimizedAdminClient();

  const { error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
    });

  if (error) {
    console.error('[MCP] Failed to store message:', error);
    throw new Error('Failed to store message');
  }

  // Update last_message_at timestamp
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  console.log('[MCP] Stored message:', role);
}

/**
 * Update conversation title based on first message
 * @param conversationId - Conversation UUID
 * @param title - New conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const supabase = createOptimizedAdminClient();

  // Truncate title to 100 characters
  const truncatedTitle = title.substring(0, 100);

  const { error } = await supabase
    .from('conversations')
    .update({ title: truncatedTitle })
    .eq('id', conversationId);

  if (error) {
    console.error('[MCP] Failed to update conversation title:', error);
    // Don't throw - title update is not critical
  }
}

/**
 * List recent MCP conversations
 * @param limit - Maximum number of conversations to retrieve (default: 10)
 * @returns Array of conversation summaries
 */
export async function listMcpConversations(
  limit: number = 10
): Promise<Array<{
  id: string;
  mcp_session_id: string;
  title: string;
  last_message_at: string;
  persona_slug: string | null;
}>> {
  const supabase = createOptimizedAdminClient();

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, mcp_session_id, title, last_message_at, personas(slug)')
    .eq('user_id', MCP_SYSTEM_USER_ID)
    .not('mcp_session_id', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[MCP] Failed to list conversations:', error);
    return [];
  }

  if (!conversations) {
    return [];
  }

  return conversations.map(conv => ({
    id: conv.id,
    mcp_session_id: conv.mcp_session_id!,
    title: conv.title || 'Untitled conversation',
    last_message_at: conv.last_message_at,
    persona_slug: (conv.personas as any)?.slug || null,
  }));
}
