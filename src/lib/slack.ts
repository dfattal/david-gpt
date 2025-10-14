/**
 * Slack Utilities
 * Simple utilities for Slack Web API integration
 */

import { WebClient } from '@slack/web-api';
import { createOptimizedAdminClient } from '@/lib/supabase/server';

interface SlackConversation {
  id: string;
  slack_thread_ts: string;
  slack_channel_id: string;
  persona_id: string | null;
}

interface SlackMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/**
 * Create Slack Web API client
 */
export function createSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    throw new Error('SLACK_BOT_TOKEN environment variable is required');
  }

  return new WebClient(token);
}

/**
 * Add emoji reaction to a Slack message
 */
export async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  try {
    await client.reactions.add({
      channel,
      timestamp,
      name: emoji,
    });
  } catch (error) {
    console.error('[Slack] Failed to add reaction:', error);
    // Don't throw - reactions are not critical
  }
}

/**
 * Post message to Slack channel/thread
 */
export async function postMessage(
  client: WebClient,
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  try {
    console.log('[Slack] Posting message:', {
      channel,
      threadTs,
      textLength: text.length,
      textPreview: text.substring(0, 100),
    });

    const result = await client.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs,
    });

    console.log('[Slack] Message posted successfully:', {
      ok: result.ok,
      ts: result.ts,
      channel: result.channel,
    });
  } catch (error) {
    console.error('[Slack] Failed to post message:', error);
    console.error('[Slack] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      channel,
      threadTs,
    });
    throw error;
  }
}

/**
 * Parse Slack message text
 * Removes bot mentions and extracts clean query text
 */
export function parseMessageText(text: string): string {
  // Remove bot mentions like <@U09LHTJFCMP>
  let cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  return cleanText;
}

/**
 * Convert markdown to Slack mrkdwn format
 * Slack doesn't support standard markdown, so we need to convert
 */
export function convertMarkdownToSlack(markdown: string): string {
  let text = markdown;

  // Convert headers (### Header -> *Header*)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Convert bold (**text** or __text__ -> *text*)
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  text = text.replace(/__(.+?)__/g, '*$1*');

  // Convert italic (*text* or _text_ -> _text_)
  text = text.replace(/\*(.+?)\*/g, '_$1_');
  text = text.replace(/_(.+?)_/g, '_$1_');

  // Convert inline code (`code` -> `code`) - already compatible

  // Convert code blocks (```language\ncode\n``` -> ```code```)
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, '```$1```');

  // Convert bullet lists (- item or * item -> • item)
  text = text.replace(/^[\-\*]\s+(.+)$/gm, '• $1');

  // Convert numbered lists (1. item -> 1. item) - already compatible

  // Convert blockquotes (> text -> text with indent)
  text = text.replace(/^>\s+(.+)$/gm, '    $1');

  // Convert citation links [^doc_1:section] to just superscript numbers
  // This makes them less noisy in Slack
  const citationMap = new Map<string, number>();
  let citationCounter = 1;

  text = text.replace(/\[\^([^\]]+)\]/g, (match, citation) => {
    if (!citationMap.has(citation)) {
      citationMap.set(citation, citationCounter++);
    }
    return `[${citationMap.get(citation)}]`;
  });

  return text;
}

/**
 * Get or create conversation for a Slack thread
 */
export async function getOrCreateConversation(
  threadTs: string,
  channelId: string,
  personaSlug: string = 'david'
): Promise<string> {
  const supabase = createOptimizedAdminClient();

  // Try to find existing conversation by thread_ts
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('slack_thread_ts', threadTs)
    .eq('slack_channel_id', channelId)
    .single();

  if (existing) {
    console.log('[Slack] Found existing conversation:', existing.id);
    return existing.id;
  }

  // Get persona ID from slug
  const { data: persona } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', personaSlug)
    .eq('is_active', true)
    .single();

  // Create new conversation
  const { data: newConversation, error } = await supabase
    .from('conversations')
    .insert({
      slack_thread_ts: threadTs,
      slack_channel_id: channelId,
      persona_id: persona?.id || null,
      title: 'Slack conversation', // Will be updated later
    })
    .select('id')
    .single();

  if (error || !newConversation) {
    console.error('[Slack] Failed to create conversation:', error);
    throw new Error('Failed to create conversation');
  }

  console.log('[Slack] Created new conversation:', newConversation.id);
  return newConversation.id;
}

/**
 * Get conversation history for a Slack thread
 * Returns last N messages in the format expected by chat API
 */
export async function getConversationHistory(
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
    console.error('[Slack] Failed to fetch conversation history:', error);
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

  console.log('[Slack] Retrieved conversation history:', history.length, 'messages');
  return history;
}

/**
 * Store a message in the conversation
 */
export async function storeMessage(
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
    console.error('[Slack] Failed to store message:', error);
    throw new Error('Failed to store message');
  }

  // Update last_message_at timestamp
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  console.log('[Slack] Stored message:', role);
}

/**
 * Check if bot has participated in a thread
 * Used to determine if we should respond to non-mention messages
 */
export async function isBotThread(threadTs: string, channelId: string): Promise<boolean> {
  const supabase = createOptimizedAdminClient();

  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('slack_thread_ts', threadTs)
    .eq('slack_channel_id', channelId)
    .single();

  return !!data;
}
