import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  shouldUseRAG,
  executeRAG,
  createRAGEnhancedPrompt,
} from "@/lib/rag/sequential-rag";

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
    const coreMessages: CoreMessage[] = messages.map(
      (msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content,
      })
    );

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

    // Get the user query for RAG analysis
    const userQuery = messages[messages.length - 1]?.content || "";

    console.log(`🤖 Processing query: "${userQuery}"`);

    // Check if RAG is needed for this query
    const useRAG = shouldUseRAG(userQuery);
    console.log(`🎯 RAG needed: ${useRAG}`);

    let ragContext = {
      hasRAGResults: false,
      ragResults: "",
      citations: "",
      toolsUsed: [] as string[],
      executionTime: 0,
    };

    // Execute RAG if needed
    if (useRAG) {
      console.log("🔍 Executing sequential RAG...");
      ragContext = await executeRAG(userQuery);
      console.log(
        `📊 RAG execution completed: ${
          ragContext.hasRAGResults ? "SUCCESS" : "NO_RESULTS"
        }`
      );
    }

    // Create enhanced system prompt with RAG context
    const enhancedSystemPrompt = createRAGEnhancedPrompt(
      systemPrompt,
      ragContext
    );

    // Common onFinish handler
    const handleOnFinish = async (completion: { text?: string }) => {
      console.log(
        "✅ Stream finished, text length:",
        completion.text?.length || 0
      );
      console.log("🔧 RAG context used:", ragContext.hasRAGResults);
      console.log("📊 Tools used:", ragContext.toolsUsed.join(", "));

      // Debug logging for message saving conditions
      console.log("💾 Message saving conditions:");
      console.log("  - User authenticated:", !!user);
      console.log("  - Conversation ID exists:", !!conversationId);
      console.log("  - Completion text exists:", !!completion.text);
      console.log("  - Latest message exists:", !!(messages && messages.length > 0));

      // Save conversation after streaming completes (if user is authenticated)
      if (user && completion.text) {
        try {
          const latestUserMessage = messages[messages.length - 1];
          let actualConversationId = conversationId;

          // If no conversationId provided, this might be a first message
          // Try to find the conversation that was just created for this user with this message
          if (!actualConversationId) {
            console.log("🔍 No conversationId provided, searching for recently created conversation...");
            const { data: recentConversations, error: searchError } = await supabase
              .from("conversations")
              .select("id, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(5); // Check last 5 conversations

            if (searchError) {
              console.error("❌ Failed to search for recent conversations:", searchError);
            } else if (recentConversations && recentConversations.length > 0) {
              // Look for a conversation that was created in the last 30 seconds
              const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
              const recentConv = recentConversations.find(conv => conv.created_at > thirtySecondsAgo);
              
              if (recentConv) {
                actualConversationId = recentConv.id;
                console.log(`✅ Found recent conversation: ${actualConversationId}`);
              } else {
                console.log("⚠️ No recent conversation found within 30 seconds");
              }
            }
          }

          if (!actualConversationId) {
            console.log("⚠️ No conversation ID available, skipping message save");
            return;
          }

          // Check if user message already exists (to avoid duplicates from conversation creation)
          console.log("🔍 Checking if user message already exists...");
          const { data: existingUserMessages, error: checkError } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", actualConversationId)
            .eq("role", "user")
            .eq("content", latestUserMessage.content)
            .limit(1);

          let userError = checkError;

          if (checkError) {
            console.error("❌ Failed to check for existing user message:", checkError);
          } else if (existingUserMessages && existingUserMessages.length > 0) {
            console.log("✅ User message already exists, skipping duplicate save");
          } else {
            // Save user message only if it doesn't already exist
            console.log("💾 Saving user message to database...");
            const { error: insertUserError } = await supabase.from("messages").insert({
              conversation_id: actualConversationId,
              role: "user",
              content: latestUserMessage.content,
            });

            userError = insertUserError;

            if (insertUserError) {
              console.error("❌ Failed to save user message:", insertUserError);
            } else {
              console.log("✅ User message saved successfully");
            }
          }

          // Save assistant message separately to ensure it's persisted even if user message fails
          console.log("💾 Saving assistant message to database...");
          const { error: assistantError } = await supabase.from("messages").insert({
            conversation_id: actualConversationId,
            role: "assistant",
            content: completion.text,
          });

          if (assistantError) {
            console.error("❌ Failed to save assistant message:", assistantError);
          } else {
            console.log("✅ Assistant message saved successfully");
          }

          // Update conversation timestamp only if at least one message was saved
          if (!userError || !assistantError) {
            console.log("💾 Updating conversation timestamp...");
            const { error: timestampError } = await supabase
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", actualConversationId)
              .eq("user_id", user.id);

            if (timestampError) {
              console.error("❌ Failed to update conversation timestamp:", timestampError);
            } else {
              console.log("✅ Conversation timestamp updated successfully");
            }
          }
        } catch (error) {
          console.error("❌ Failed to save conversation:", error);
        }
      }
    };

    console.log(
      "🚀 Creating streaming response with sequential RAG integration..."
    );

    const result = streamText({
      model: openai("gpt-4o"),
      system: enhancedSystemPrompt,
      messages: coreMessages,
      temperature: 0.7,
      // No tools needed - RAG results are pre-injected into system prompt
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
