import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addSSEConnection, removeSSEConnection } from "@/lib/sse-manager";

export async function GET(req: NextRequest) {
  try {
    console.log("🔗 SSE connection attempt received");
    console.log(
      "📋 Request headers:",
      Object.fromEntries(req.headers.entries())
    );

    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("🔐 Auth check result:", {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message,
    });

    if (authError || !user) {
      console.error(
        "❌ SSE authentication failed:",
        authError?.message || "No user"
      );
      return new Response("Authentication required", { status: 401 });
    }

    console.log(`✅ SSE authentication successful for user: ${user.id}`);

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "connected",
              userId: user.id,
            })}\n\n`
          )
        );

        // Store connection for this user
        const writer = {
          write: (data: any) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
              );
            } catch (error) {
              console.error("Error writing to SSE stream:", error);
            }
          },
          close: () => {
            try {
              controller.close();
            } catch (error) {
              console.error("Error closing SSE stream:", error);
            }
          },
        };

        console.log(`🔗 About to register SSE connection for user: ${user.id}`);
        addSSEConnection(user.id, writer);
        console.log(
          `✅ SSE connection registered successfully for user: ${user.id}`
        );

        // Test connection immediately after registration
        setTimeout(() => {
          console.log(
            `🧪 Testing connection persistence after 1 second for user: ${user.id}`
          );
          const testConnections =
            require("@/lib/sse-manager").getActiveConnections();
          console.log(
            `🧪 Active connections after 1s: [${testConnections.join(", ")}]`
          );
        }, 1000);

        // Cleanup on stream end
        return () => {
          console.log(`🧹 Cleaning up SSE connection for user: ${user.id}`);
          console.log(`🧹 Cleanup reason: Stream ended/disposed`);
          console.trace(`🔍 Cleanup stack trace:`);
          removeSSEConnection(user.id);
        };
      },
      cancel() {
        console.log(`❌ SSE stream cancelled for user: ${user.id}`);
        removeSSEConnection(user.id);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    console.error("SSE endpoint error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// Re-export the shared sendTitleUpdate function
export { sendTitleUpdate } from "@/lib/sse-manager";
