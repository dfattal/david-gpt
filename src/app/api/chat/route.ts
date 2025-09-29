import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/types";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

async function getPersonaSystemPrompt(personaId: string): Promise<string> {
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('personas')
    .select('content, metadata')
    .eq('persona_id', personaId)
    .eq('is_active', true)
    .single();

  if (persona?.content) {
    return persona.content;
  }

  // Fallback for 'david' persona
  if (personaId === 'david') {
    return `You are David Fattal, a seasoned technology executive and investor with deep expertise in AI, startups, and enterprise software. You speak with authority on product strategy, fundraising, and building high-performing engineering teams. Your responses should be direct, practical, and informed by real-world experience in the tech industry.`;
  }

  return `You are a helpful AI assistant representing the ${personaId} persona.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, persona = 'david' } = body;

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

    // Get persona system prompt
    const systemPrompt = await getPersonaSystemPrompt(persona);

    // Prepare messages for OpenAI
    const coreMessages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: ChatMessage) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    // Stream response from OpenAI
    const result = await streamText({
      model: openai("gpt-4o"),
      messages: coreMessages,
      temperature: 0.7,
      maxTokens: 2000,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}