/**
 * Slack Utilities
 * Simple utilities for Slack Web API integration
 */

import { WebClient } from '@slack/web-api';

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
