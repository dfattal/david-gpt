import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/types";
import { performSearch } from "@/lib/rag/search";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

async function getPersonaSystemPrompt(
  personaId: string,
  ragContext?: string
): Promise<string> {
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('personas')
    .select('content, metadata, slug, name')
    .eq('persona_id', personaId)
    .eq('is_active', true)
    .single();

  let basePrompt = '';
  const displayName = persona?.name || personaId;

  if (persona?.content) {
    basePrompt = persona.content;
  } else if (personaId === 'david') {
    // Fallback for 'david' persona
    basePrompt = `You are David Fattal, a seasoned technology executive and investor with deep expertise in AI, startups, and enterprise software. You speak with authority on product strategy, fundraising, and building high-performing engineering teams. Your responses should be direct, practical, and informed by real-world experience in the tech industry.`;
  } else {
    basePrompt = `You are a helpful AI assistant representing the ${personaId} persona.`;
  }

  // If RAG context is provided, enhance the system prompt with citation instructions
  if (ragContext) {
    return `${basePrompt}

## RAG Context Usage Instructions

You are ${displayName}. Use ONLY the provided context below for persona-specific facts.

**Citation Rules**:
- Every factual statement that depends on the context MUST include a bracket citation: [^doc_id:section]
- The citation format is [^{doc_id}:{section_path}] where doc_id is the document identifier and section_path is the section heading
- If the context is insufficient to answer the question, say so clearly and suggest what documentation might be needed
- Do not make up information not present in the context
- When multiple sources support a claim, cite all relevant sources

**Context Documents**:
${ragContext}

**Remember**: Always cite your sources using the [^doc_id:section] format for any factual claims based on the context above.`;
  }

  return basePrompt;
}

/**
 * Format RAG search results as context for LLM
 */
function formatRagContext(results: Awaited<ReturnType<typeof performSearch>>): string {
  if (results.length === 0) {
    return '';
  }

  const contextBlocks = results.map((result, index) => {
    const docRef = `doc_${index + 1}`;
    const section = result.sectionPath || 'main';

    return `[${docRef} §${section}]
Document: ${result.docTitle || result.docId}
Section: ${result.sectionPath || 'Main Content'}
Source: ${result.sourceUrl || 'N/A'}

${result.text}

---`;
  });

  return contextBlocks.join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, persona = 'david', useRag = true } = body;

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

    // Create Supabase client for RAG
    const supabase = await createClient();

    // Step 1: Perform RAG search if enabled
    let ragContext = '';
    if (useRag) {
      try {
        // Get the last user message as the query
        const lastUserMessage = messages
          .slice()
          .reverse()
          .find((msg: ChatMessage) => msg.role === 'user');

        if (lastUserMessage) {
          console.log(`\n🔍 RAG search triggered for query: "${lastUserMessage.content}"`);

          // Perform hybrid search
          const searchResults = await performSearch(
            lastUserMessage.content,
            {
              personaSlug: persona,
              limit: 12,
            },
            supabase
          );

          if (searchResults.length > 0) {
            ragContext = formatRagContext(searchResults);
            console.log(`✓ RAG context generated: ${searchResults.length} chunks`);
          } else {
            console.log('ℹ No RAG results found, proceeding without context');
          }
        }
      } catch (ragError) {
        console.error('RAG search failed, proceeding without context:', ragError);
        // Continue without RAG context on error
      }
    }

    // Step 2: Get persona system prompt (with RAG context if available)
    const systemPrompt = await getPersonaSystemPrompt(persona, ragContext);

    // Step 3: Prepare messages for OpenAI
    const coreMessages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: ChatMessage) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    // Step 4: Stream response from OpenAI
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