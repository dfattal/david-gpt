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
