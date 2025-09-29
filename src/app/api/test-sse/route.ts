import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTitleUpdate, getActiveConnections } from "@/lib/sse-manager";

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { conversationId } = await req.json();

    console.log(`🧪 Testing SSE connection for user: ${user.id}`);
    const activeConnections = getActiveConnections();
    console.log(`📊 Active SSE connections: ${activeConnections}`);
    console.log(`📊 Total connections: ${activeConnections.length}`);
    console.log(
      `📊 User in connections: ${activeConnections.includes(user.id)}`
    );

    // Send a test title update
    console.log(`📡 Attempting to send test SSE message to user: ${user.id}`);
    const testSuccess = sendTitleUpdate(user.id, {
      conversationId: conversationId || "test-conversation-id",
      title: "Test Title Update " + new Date().toLocaleTimeString(),
    });
    console.log(`📡 Test SSE message result: ${testSuccess}`);

    return NextResponse.json({
      success: testSuccess,
      userId: user.id,
      activeConnections: getActiveConnections(),
      message: testSuccess
        ? "Test SSE message sent successfully"
        : "Failed to send test SSE message - no active connection found",
    });
  } catch (error) {
    console.error("Test SSE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
