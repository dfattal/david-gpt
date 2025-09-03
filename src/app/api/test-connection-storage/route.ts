import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addSSEConnection,
  getActiveConnections,
  removeSSEConnection,
} from "@/lib/sse-manager";

export async function GET(req: NextRequest) {
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

    console.log(`\n🧪 === CONNECTION STORAGE TEST ===`);
    console.log(`🧪 Testing for user: ${user.id}`);

    // Check initial state
    const initialConnections = getActiveConnections();
    console.log(`🧪 Initial connections: [${initialConnections.join(", ")}]`);

    // Add a mock connection
    const mockWriter = {
      write: (data: any) => console.log("Mock write:", data),
      close: () => console.log("Mock close"),
    };

    console.log(`🧪 Adding mock connection for user: ${user.id}`);
    addSSEConnection(user.id, mockWriter);

    // Check after add
    const afterAddConnections = getActiveConnections();
    console.log(
      `🧪 After add connections: [${afterAddConnections.join(", ")}]`
    );

    // Wait a moment and check again
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterWaitConnections = getActiveConnections();
    console.log(`🧪 After 100ms wait: [${afterWaitConnections.join(", ")}]`);

    // Clean up mock connection
    console.log(`🧪 Removing mock connection for user: ${user.id}`);
    removeSSEConnection(user.id);

    const finalConnections = getActiveConnections();
    console.log(`🧪 Final connections: [${finalConnections.join(", ")}]`);
    console.log(`🧪 === END CONNECTION STORAGE TEST ===\n`);

    return NextResponse.json({
      userId: user.id,
      initialConnections,
      afterAddConnections,
      afterWaitConnections,
      finalConnections,
      testPassed:
        afterAddConnections.includes(user.id) &&
        afterWaitConnections.includes(user.id),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Connection storage test error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
