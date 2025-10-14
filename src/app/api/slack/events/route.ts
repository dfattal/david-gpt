/**
 * Slack Events API Handler
 * Handles incoming @mentions from Slack workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSlackClient, addReaction, parseMessageText } from '@/lib/slack';

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
      }).catch((error) => {
        console.error('[Slack Events] Failed to trigger process handler:', error);
      });

      console.log('[Slack Events] Event acknowledged');
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
