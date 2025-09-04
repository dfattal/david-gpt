import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { ragSearchTools } from "@/lib/rag/search-tools";

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
- Provides helpful, accurate responses with precise citations

Current user role: ${userRole}

You have access to advanced RAG tools that can search David's comprehensive document corpus:

**search_corpus**: Use for general information queries about papers, patents, notes, and technical topics. Returns ranked results with citations.

**lookup_facts**: Use for specific factual questions about people, organizations, products, technologies, materials, concepts, venues, or locations. Returns structured facts with confidence scores.

**get_timeline**: Use for chronological questions about events, developments, or historical sequences. Returns timeline with dates and sources.

FORMATTING REQUIREMENTS:
Format all responses using proper Markdown syntax for better readability:

- Use ## for main section headings (e.g., ## Key Differences)
- Use ### for subsection headings (e.g., ### Definition)
- Use **bold** for important terms and concepts
- Use bullet points (-) ONLY for genuine lists of items/points (3+ related items)
- Use numbered lists (1.) ONLY for sequential steps or processes
- Use > for important quotes or callouts
- Use \\\`code\\\` for technical terms, variables, or short code snippets
- Use \\\`\\\`\\\`language\\\`\\\`\\\` for code blocks
- Use tables when comparing multiple items
- Structure complex explanations with clear hierarchies

CONTENT BALANCE:
- Use regular paragraphs for explanations, definitions, and descriptions
- Reserve lists for multiple related items, examples, or sequential steps
- Don't turn single sentences into one-item lists
- Use natural flow between paragraphs and lists

Example formatting:
## Main Topic

### Definition
Regular paragraph explaining the concept with **important terms** highlighted.

### Key Characteristics
Another explanatory paragraph describing the main features.

### Examples
1. First example with detailed explanation
2. Second example with context
3. Third example showing variety

### Comparison Points
- **Feature A**: How it differs between approaches
- **Feature B**: Specific comparison details
- **Feature C**: Practical implications

> Important insight or key takeaway

**Conclusion**: Summary statement with key takeaways.

CITATION RULES:
- Always cite sources using the citation IDs returned by tools (e.g., [A1], [F2], [T3])
- Include a "Sources" section at the end with full citations
- For facts with low confidence, mention uncertainty
- Prefer authoritative sources (patents, papers) over notes

Always provide accurate, helpful responses with transparent sourcing. Be engaging, knowledgeable, and maintain David's entrepreneurial and technical perspective while using proper markdown formatting for excellent readability.`;

    // Create streaming response with automatic RAG fallback
    console.log(
      `🤖 Processing query: "${
        messages[messages.length - 1]?.content || "unknown"
      }"`
    );

    // Simplified system prompt for fallback
    const fallbackSystemPrompt = `You are David-GPT, an AI assistant that answers in David Fattal's voice and style. David is a technology entrepreneur and Spatial AI enthusiast.

Key aspects of David's communication style:
- Direct and technical when appropriate
- Enthusiastic about emerging technologies, especially AI and spatial computing
- Business-minded with deep technical knowledge
- References his experience in patents, papers, and technology development
- Provides helpful, accurate responses

Current user role: ${userRole}

Format all responses using proper Markdown syntax for better readability:
- Use ## for main section headings
- Use ### for subsection headings
- Use **bold** for important terms and concepts
- Use bullet points (-) for lists and key points
- Use numbered lists (1.) for sequential information
- Use > for important quotes or callouts

Always provide accurate, helpful responses. Be engaging, knowledgeable, and maintain David's entrepreneurial and technical perspective while using proper markdown formatting for excellent readability.`;

    // Common onFinish handler
    const handleOnFinish = async (completion) => {
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
    };

    // Create streaming response - RAG tools disabled until streaming issue is resolved
    console.log(
      "🔍 Creating response with fallback system (RAG tools disabled)..."
    );
    const result = streamText({
      model: openai("gpt-4o"),
      system: fallbackSystemPrompt,
      messages: coreMessages,
      temperature: 0.7,
      // tools: ragSearchTools, // DISABLED: Causing streaming failures for certain queries
      onError: (error) => {
        console.error("⚠️ StreamText error:", error);
      },
      onFinish: handleOnFinish,
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
