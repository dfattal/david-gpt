/**
 * Slack Process Handler
 * Handles long-running RAG queries triggered by Slack events
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createSlackClient,
  postMessage,
  convertMarkdownToSlack,
  getOrCreateConversation,
  getConversationHistory,
  storeMessage,
} from '@/lib/slack';
import { parseCitations } from '@/lib/rag/citations/parser';

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

    if (!query || !channel || !threadTs) {
      throw new Error('Missing required fields: query, channel, or threadTs');
    }

    // Step 1: Get or create conversation for this thread
    console.log('[Slack Process] Getting conversation for thread');
    const conversationId = await getOrCreateConversation(threadTs, channel, 'david');
    console.log('[Slack Process] Conversation ID:', conversationId);

    // Step 2: Retrieve conversation history
    console.log('[Slack Process] Retrieving conversation history');
    const history = await getConversationHistory(conversationId, 6);
    console.log('[Slack Process] Retrieved history:', history.length, 'messages');

    // Step 3: Build messages array with history + current query
    const messages = [
      ...history,
      { role: 'user' as const, content: query },
    ];

    console.log('[Slack Process] Total messages for context:', messages.length);

    // Step 4: Store user message
    console.log('[Slack Process] Storing user message');
    await storeMessage(conversationId, 'user', query);

    // Step 5: Call chat API with conversation history
    const chatApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/chat`;

    console.log('[Slack Process] Calling chat API:', chatApiUrl);

    const chatResponse = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        conversationId,
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

    // Extract citation metadata from headers
    const citationMetadataHeader = chatResponse.headers.get('X-Citation-Metadata');
    let citationMetadata: Array<{ docRef: string; sourceUrl?: string; docTitle?: string; docId: string }> = [];

    if (citationMetadataHeader) {
      try {
        const decoded = Buffer.from(citationMetadataHeader, 'base64').toString('utf-8');
        citationMetadata = JSON.parse(decoded);
        console.log('[Slack Process] Extracted citation metadata:', citationMetadata.length, 'citations');
      } catch (error) {
        console.warn('[Slack Process] Failed to parse citation metadata:', error);
      }
    }

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

    // Step 6: Store assistant response
    console.log('[Slack Process] Storing assistant message');
    await storeMessage(conversationId, 'assistant', fullResponse);

    // Step 7: Convert markdown to Slack mrkdwn format
    const slackFormattedResponse = convertMarkdownToSlack(fullResponse);

    console.log('[Slack Process] Converted markdown to Slack format');

    // Step 8: Post response to Slack
    console.log('[Slack Process] Creating Slack client');
    const slackClient = createSlackClient();

    console.log('[Slack Process] Posting message to Slack:', {
      channel,
      threadTs,
      messageLength: slackFormattedResponse.length,
    });

    await postMessage(slackClient, channel, slackFormattedResponse, threadTs);

    console.log('[Slack Process] ✅ Successfully posted response to Slack');

    // Step 9: Post citations as a follow-up message if available
    if (citationMetadata.length > 0) {
      console.log('[Slack Process] Parsing citations from response');

      // Build context map from citation metadata
      const contextMap = new Map<string, { sourceUrl?: string; docTitle?: string }>();
      citationMetadata.forEach((meta) => {
        contextMap.set(meta.docRef, {
          sourceUrl: meta.sourceUrl,
          docTitle: meta.docTitle,
        });
      });

      // Parse citations from the response to get only the ones actually referenced
      const { citations } = parseCitations(fullResponse, contextMap);

      if (citations.length > 0) {
        console.log('[Slack Process] Posting citations message with', citations.length, 'sources');

        // Build sources message with clickable links
        const sourcesLines = ['📚 *Sources:*\n'];

        citations.forEach((citation) => {
          const title = citation.docTitle || citation.docId;
          const section = citation.sectionPath;

          if (citation.sourceUrl) {
            // Create clickable link in Slack format: <URL|text>, §section
            sourcesLines.push(`${citation.number}. <${citation.sourceUrl}|${title}>, §${section}`);
          } else {
            // No URL, just show the title and section
            sourcesLines.push(`${citation.number}. ${title}, §${section}`);
          }
        });

        const sourcesMessage = sourcesLines.join('\n');

        await postMessage(slackClient, channel, sourcesMessage, threadTs);
        console.log('[Slack Process] ✅ Posted citations message');
      } else {
        console.log('[Slack Process] No citations found in response, skipping sources message');
      }
    }

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
