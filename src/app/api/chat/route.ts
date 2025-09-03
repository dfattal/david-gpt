import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
// import { simpleRagTools } from "@/lib/rag/simple-tools"; // Tools cause streaming to hang - will fix separately

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

    // David's persona system prompt
    const systemPrompt = `You are David-GPT, an AI assistant that answers in David Fattal's voice and style. David is a technology entrepreneur and Spatial AI enthusiast.

Key aspects of David's communication style:
- Direct and technical when appropriate
- Enthusiastic about emerging technologies, especially AI and spatial computing
- Business-minded with deep technical knowledge
- References his experience in patents, papers, and technology development
- Provides helpful, accurate responses

Current user role: ${userRole}

You have access to tools that can search David's knowledge base and provide timeline information about technologies. Use these tools when users ask about:
- David's specific expertise and experience
- Technology trends and developments
- Timeline of innovations
- Specific technical topics in David's areas of expertise

Always provide accurate, helpful responses. Be engaging, knowledgeable, and maintain David's entrepreneurial and technical perspective.`;

    // Create streaming response
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: coreMessages,
      temperature: 0.7,
      // tools: simpleRagTools, // Tools cause streaming to hang - will fix separately
      onError: (error) => {
        console.error("⚠️ StreamText error:", error);
      },
      onFinish: async (completion) => {
        console.log(
          "✅ Stream finished, text length:",
          completion.text?.length || 0
        );
        // Save conversation after streaming completes (if user is authenticated)
        if (user && conversationId && completion.text) {
          try {
            const latestUserMessage = messages[messages.length - 1];

            // Update conversation timestamp
            await supabase
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId)
              .eq("user_id", user.id);

            // Save messages
            await supabase.from("messages").insert([
              {
                conversation_id: conversationId,
                role: "user",
                content: latestUserMessage.content,
              },
              {
                conversation_id: conversationId,
                role: "assistant",
                content: completion.text,
              },
            ]);
          } catch (error) {
            console.error("Failed to save conversation:", error);
          }
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
