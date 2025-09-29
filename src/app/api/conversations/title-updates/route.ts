import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, handleApiError } from "@/lib/utils";
import { addSSEConnection, removeSSEConnection } from "@/lib/sse-broadcaster";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError("Authentication required", 401);
    }

    // Set up SSE headers
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Register this connection with the broadcaster
        addSSEConnection(user.id, controller);

        // Send initial connection confirmation
        const data = JSON.stringify({
          type: 'connected',
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        controller.enqueue(`data: ${data}\n\n`);

        // Set up a heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            const heartbeatData = JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            });
            controller.enqueue(`data: ${heartbeatData}\n\n`);
          } catch (error) {
            console.error('Heartbeat error:', error);
            clearInterval(heartbeat);
            removeSSEConnection(user.id, controller);
          }
        }, 30000); // Send heartbeat every 30 seconds

        // Clean up on close
        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          removeSSEConnection(user.id, controller);
          controller.close();
        });
      }
    });

    return new Response(stream, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}