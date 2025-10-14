/**
 * Slack Process Handler
 * Handles long-running RAG queries triggered by Slack events
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSlackClient, postMessage } from '@/lib/slack';

// Allow up to 60 seconds for this endpoint (requires Vercel Pro)
export const maxDuration = 60;

/**
 * POST /api/slack/process
 * Processes RAG query and posts result to Slack
 */
export async function POST(req: NextRequest) {
  console.log('[Slack Process] Processing request started');

  let body: any;
  let channel: string;
  let threadTs: string;

  try {
    body = await req.json();
    const { query, channel: ch, threadTs: ts, messageTs } = body;
    channel = ch;
    threadTs = ts;

    console.log('[Slack Process] Request parsed:', {
      query: query?.substring(0, 100),
      channel,
      threadTs,
      hasQuery: !!query,
    });

    if (!query || !channel) {
      throw new Error('Missing required fields: query or channel');
    }

    // Call chat API with persona=david
    const chatApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/chat`;

    console.log('[Slack Process] Calling chat API:', chatApiUrl);

    const chatResponse = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        personaId: 'david',
        useRag: true,
      }),
    });

    console.log('[Slack Process] Chat API response:', {
      status: chatResponse.status,
      ok: chatResponse.ok,
      statusText: chatResponse.statusText,
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error('[Slack Process] Chat API error response:', errorText);
      throw new Error(`Chat API returned ${chatResponse.status}: ${errorText}`);
    }

    console.log('[Slack Process] Streaming response from chat API');

    // Stream and buffer the response
    const reader = chatResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body from chat API');
    }

    let fullResponse = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
    }

    console.log('[Slack Process] Response complete:', {
      length: fullResponse.length,
      preview: fullResponse.substring(0, 100),
    });

    if (!fullResponse.trim()) {
      throw new Error('Empty response from chat API');
    }

    // Post response to Slack
    console.log('[Slack Process] Creating Slack client');
    const slackClient = createSlackClient();

    console.log('[Slack Process] Posting message to Slack:', {
      channel,
      threadTs,
      messageLength: fullResponse.length,
    });

    await postMessage(slackClient, channel, fullResponse, threadTs);

    console.log('[Slack Process] ✅ Successfully posted response to Slack');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Process] ❌ Error:', error);
    console.error('[Slack Process] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Try to post error message to Slack if we have the channel info
    if (channel && threadTs) {
      try {
        console.log('[Slack Process] Attempting to post error message to Slack');
        const slackClient = createSlackClient();
        await postMessage(
          slackClient,
          channel,
          'Sorry, I encountered an error processing your request. Please try again.',
          threadTs
        );
        console.log('[Slack Process] Error message posted to Slack');
      } catch (slackError) {
        console.error('[Slack Process] Failed to post error to Slack:', slackError);
      }
    } else {
      console.error('[Slack Process] Cannot post error to Slack - missing channel or threadTs');
    }

    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}
