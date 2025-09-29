import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { testTools } from "@/lib/rag/test-tool";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { messages, conversationId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY environment variable");
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 500 }
      );
    }

    // Get authenticated user (optional - allow guest access)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Set user role based on authentication status
    const userRole = user ? "user" : "guest";

    // Convert messages to AI SDK format
    const coreMessages: CoreMessage[] = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Simple system prompt for testing
    const systemPrompt = `You are a test assistant. You have access to a test tool. When users ask you to test something, use the test_tool to echo their message.`;

    console.log("🧪 Testing streamText with tools...");

    // Create streaming response with test tools
    const result = streamText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages: coreMessages,
      temperature: 0.7,
      tools: testTools, // TESTING: Add simple test tool
      onError: (error) => {
        console.error("⚠️ StreamText error:", error);
      },
      onFinish: async (completion) => {
        console.log(
          "✅ Stream finished with tools, text length:",
          completion.text?.length || 0
        );
        console.log("🔧 Tool results:", completion.toolResults);
      },
    });

    console.log("🚀 Returning stream response with tools enabled");
    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat test API error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
