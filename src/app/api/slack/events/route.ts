/**
 * Slack Events API Handler
 * Handles incoming @mentions from Slack workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSlackClient, addReaction, parseMessageText, isBotThread } from '@/lib/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/slack/events
 * Main handler for Slack Events API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('[Slack Events] Received event:', {
      type: body.type,
      eventType: body.event?.type,
    });

    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      console.log('[Slack Events] URL verification challenge');
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle app_mention events
    if (body.type === 'event_callback' && body.event?.type === 'app_mention') {
      const event = body.event;

      console.log('[Slack Events] App mention received:', {
        channel: event.channel,
        user: event.user,
        text: event.text?.substring(0, 100),
      });

      // Parse message text (remove bot mentions)
      const query = parseMessageText(event.text || '');

      if (!query.trim()) {
        console.log('[Slack Events] Empty query after parsing, ignoring');
        return NextResponse.json({ ok: true });
      }

      // Add 👀 reaction immediately
      try {
        const slackClient = createSlackClient();
        await addReaction(slackClient, event.channel, event.ts, 'eyes');
        console.log('[Slack Events] Added eyes reaction');
      } catch (error) {
        console.error('[Slack Events] Failed to add reaction:', error);
        // Continue anyway - reaction is not critical
      }

      // Trigger separate process handler (fire and forget)
      const processUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/slack/process`;

      console.log('[Slack Events] Triggering process handler:', processUrl);

      fetch(processUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          channel: event.channel,
          threadTs: event.thread_ts || event.ts,
          messageTs: event.ts,
        }),
      })
        .then((res) => {
          console.log('[Slack Events] Process handler triggered successfully:', {
            status: res.status,
            ok: res.ok,
          });
        })
        .catch((error) => {
          console.error('[Slack Events] Failed to trigger process handler:', error);
        });

      console.log('[Slack Events] Event acknowledged');
      return NextResponse.json({ ok: true });
    }

    // Handle message events (for follow-ups in threads)
    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const event = body.event;

      // Ignore bot's own messages
      if (event.bot_id || event.subtype === 'bot_message') {
        console.log('[Slack Events] Ignoring bot message');
        return NextResponse.json({ ok: true });
      }

      // Ignore messages with bot mentions (handled by app_mention)
      if (event.text && /<@[A-Z0-9]+>/.test(event.text)) {
        console.log('[Slack Events] Ignoring message with mention (handled by app_mention)');
        return NextResponse.json({ ok: true });
      }

      // Only respond if in a thread where bot has participated
      if (event.thread_ts) {
        console.log('[Slack Events] Message in thread received:', {
          channel: event.channel,
          thread_ts: event.thread_ts,
          text: event.text?.substring(0, 100),
        });

        const isBotActive = await isBotThread(event.thread_ts, event.channel);

        if (isBotActive) {
          console.log('[Slack Events] Bot is active in thread, processing follow-up message');

          const query = event.text || '';

          if (!query.trim()) {
            console.log('[Slack Events] Empty query, ignoring');
            return NextResponse.json({ ok: true });
          }

          // Add 👀 reaction immediately
          try {
            const slackClient = createSlackClient();
            await addReaction(slackClient, event.channel, event.ts, 'eyes');
            console.log('[Slack Events] Added eyes reaction');
          } catch (error) {
            console.error('[Slack Events] Failed to add reaction:', error);
          }

          // Trigger separate process handler (fire and forget)
          const processUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/slack/process`;

          console.log('[Slack Events] Triggering process handler for follow-up:', processUrl);

          fetch(processUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              channel: event.channel,
              threadTs: event.thread_ts,
              messageTs: event.ts,
            }),
          })
            .then((res) => {
              console.log('[Slack Events] Process handler triggered successfully:', {
                status: res.status,
                ok: res.ok,
              });
            })
            .catch((error) => {
              console.error('[Slack Events] Failed to trigger process handler:', error);
            });

          console.log('[Slack Events] Follow-up event acknowledged');
          return NextResponse.json({ ok: true });
        } else {
          console.log('[Slack Events] Bot not active in thread, ignoring');
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Other event types - just acknowledge
    console.log('[Slack Events] Event type not handled');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Events] Handler error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/slack/events
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    service: 'Slack Events API',
    status: 'healthy',
    version: '1.0.0',
  });
}
