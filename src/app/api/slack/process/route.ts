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
  console.log('[Slack Process] Processing request');

  try {
    const body = await req.json();
    const { query, channel, threadTs, messageTs } = body;

    console.log('[Slack Process] Query:', {
      query: query.substring(0, 100),
      channel,
      threadTs,
    });

    // Call chat API with persona=david
    const chatApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/chat`;

    console.log('[Slack Process] Calling chat API');

    const chatResponse = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        personaId: 'david',
        useRag: true,
      }),
    });

    if (!chatResponse.ok) {
      throw new Error(`Chat API returned ${chatResponse.status}`);
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
    });

    // Post response to Slack
    const slackClient = createSlackClient();
    await postMessage(slackClient, channel, fullResponse, threadTs);

    console.log('[Slack Process] Posted response to Slack');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Process] Error:', error);

    // Try to post error message to Slack
    try {
      const body = await req.json();
      const slackClient = createSlackClient();
      await postMessage(
        slackClient,
        body.channel,
        'Sorry, I encountered an error processing your request. Please try again.',
        body.threadTs
      );
    } catch (slackError) {
      console.error('[Slack Process] Failed to post error to Slack:', slackError);
    }

    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}
