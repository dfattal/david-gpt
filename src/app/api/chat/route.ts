import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/types";
import { performSearch } from "@/lib/rag/search";
import { reformulateQuery } from "@/lib/rag/queryReformulation";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

async function getPersonaSystemPrompt(
  personaId: string,
  ragContext?: string
): Promise<string> {
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('personas')
    .select('content, metadata, slug, name, persona_type')
    .eq('slug', personaId)
    .eq('is_active', true)
    .single();

  let basePrompt = '';
  const displayName = persona?.name || personaId;
  const personaType = persona?.persona_type || 'fictional_character';

  if (persona?.content) {
    basePrompt = persona.content;
  } else if (personaId === 'david') {
    // Fallback for 'david' persona
    basePrompt = `You are David Fattal, a seasoned technology executive and investor with deep expertise in AI, startups, and enterprise software. You speak with authority on product strategy, fundraising, and building high-performing engineering teams. Your responses should be direct, practical, and informed by real-world experience in the tech industry.`;
  } else {
    basePrompt = `You are a helpful AI assistant representing the ${personaId} persona.`;
  }

  // Add identity-aware instructions based on persona type
  let identityInstructions = '';
  if (personaType === 'real_person') {
    identityInstructions = `

## Identity & Self-Reference

You ARE this person. When discussing your background, achievements, patents, publications, or expertise:
- Use first-person perspective naturally ("I invented...", "My work on...", "I founded...")
- Reference your actual accomplishments, papers, patents, and professional history
- When asked "who are you" or similar biographical questions, draw from your real work and achievements
- Speak authentically about your experience and expertise areas
- If asked about work you haven't done or areas outside your expertise, be honest about the limits of your knowledge`;
  } else {
    identityInstructions = `

## Identity & Self-Reference

You are an AI assistant playing the ROLE of this expert persona. When asked about yourself:
- Explain your expertise areas and specializations clearly
- Describe how you can help users in your domain
- Be transparent that you're an AI assistant with specialized knowledge in this field
- Do NOT claim to be a real person or falsely attribute actual work/achievements to yourself
- Focus on demonstrating expertise through helpful, accurate responses`;
  }

  // Formatting instructions for all responses
  const formattingInstructions = `

## Formatting Requirements

Format all responses using proper Markdown syntax for better readability:

**Mathematical Notation:**
- Use $...$ for inline math (e.g., $E = mc^2$)
- Use $$...$$ for display equations on their own line
- Never use parentheses ( ) or brackets [ ] around LaTeX

**Code Formatting:**
- Use \`code\` for inline technical terms, variables, or short snippets
- Use \`\`\`language\`\`\` for multi-line code blocks (e.g., \`\`\`json, \`\`\`typescript, \`\`\`python)

**Structure:**
- Use ## for main section headings
- Use ### for subsection headings
- Use **bold** for important terms
- Use bullet points (-) for lists of items
- Use numbered lists (1.) for sequential steps
- Use > for important quotes or callouts
- Use tables when comparing multiple items`;

  // If RAG context is provided, enhance the system prompt with citation instructions
  if (ragContext) {
    return `${basePrompt}
${identityInstructions}
${formattingInstructions}

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

  return basePrompt + identityInstructions + formattingInstructions;
}

interface RagContextData {
  context: string;
  metadata: Map<string, { sourceUrl?: string; docTitle?: string; docId: string }>;
}

/**
 * Generate Google Patents URL from patent ID
 * Supports US patents, WO (PCT), EP, etc.
 */
function generatePatentUrl(docId: string): string | undefined {
  // Match patent number patterns like us10838134, wo2024145265a1, etc.
  const patentMatch = docId.match(/^([a-z]{2})(\d+[a-z]?\d*)$/i);
  if (!patentMatch) return undefined;

  const countryCode = patentMatch[1].toUpperCase();
  const number = patentMatch[2].toUpperCase();

  return `https://patents.google.com/patent/${countryCode}${number}`;
}

/**
 * Format RAG search results as context for LLM and return metadata for citation mapping
 */
function formatRagContext(results: Awaited<ReturnType<typeof performSearch>>): RagContextData {
  if (results.length === 0) {
    return { context: '', metadata: new Map() };
  }

  const metadata = new Map<string, { sourceUrl?: string; docTitle?: string; docId: string }>();

  const contextBlocks = results.map((result, index) => {
    const docRef = `doc_${index + 1}`;
    const section = result.sectionPath || 'main';

    // Generate source URL from patent ID if missing
    const sourceUrl = result.sourceUrl || generatePatentUrl(result.docId);

    // Store metadata for citation mapping
    metadata.set(docRef, {
      sourceUrl,
      docTitle: result.docTitle || result.docId,
      docId: result.docId,
    });

    return `[${docRef} §${section}]
Document: ${result.docTitle || result.docId}
Section: ${result.sectionPath || 'Main Content'}
Source: ${result.sourceUrl || 'N/A'}

${result.text}

---`;
  });

  return {
    context: contextBlocks.join('\n\n'),
    metadata,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, conversationId, personaId, useRag = true } = body;

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

    // Determine persona to use (from body, conversation, or default to 'david')
    let persona = 'david'; // default

    console.log('🔍 Determining persona - personaId from body:', personaId, 'conversationId:', conversationId);

    if (personaId) {
      // PersonaId provided in body (could be UUID or slug)
      // Try to use it as-is if it looks like a slug, otherwise look it up
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personaId);

      if (looksLikeUuid) {
        // It's a UUID - look up the slug
        const { data: personaData } = await supabase
          .from('personas')
          .select('slug')
          .eq('id', personaId)
          .eq('is_active', true)
          .single();

        console.log('📋 Looked up persona by UUID:', personaId, '→', personaData);

        if (personaData) {
          persona = personaData.slug;
        }
      } else {
        // It's already a slug - use it directly
        console.log('📋 Using persona slug directly:', personaId);
        persona = personaId;
      }
    } else if (conversationId) {
      // Try to get persona from conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('personas(slug)')
        .eq('id', conversationId)
        .single();

      console.log('💬 Got persona from conversation:', conversation);

      if (conversation && conversation.personas) {
        persona = (conversation.personas as any).slug || 'david';
      }
    }

    console.log('✅ Final persona selected:', persona);

    // Step 1: Perform RAG search if enabled
    let ragContext = '';
    let citationMetadata: RagContextData['metadata'] | null = null;
    if (useRag) {
      try {
        // Get the last user message as the query
        const lastUserMessage = messages
          .slice()
          .reverse()
          .find((msg: ChatMessage) => msg.role === 'user');

        if (lastUserMessage) {
          // Step 1a: Query reformulation with conversation context
          let searchQuery = lastUserMessage.content;

          // Get recent conversation history (last 3 messages, excluding current)
          const conversationHistory = messages
            .slice(0, -1) // Exclude current user message
            .slice(-6)    // Last 6 messages (3 turns)
            .map(msg => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            }));

          // Reformulate query if conversation history exists
          if (conversationHistory.length > 0) {
            const reformulationResult = await reformulateQuery(
              lastUserMessage.content,
              conversationHistory
            );

            if (reformulationResult.needsReformulation) {
              searchQuery = reformulationResult.reformulatedQuery;
              console.log(`📝 Query reformulated for context awareness`);
            }
          }

          console.log(`\n🔍 RAG search triggered for query: "${searchQuery}"`);

          // Perform hybrid search with reformulated query and citation boosting
          const searchResults = await performSearch(
            searchQuery,
            {
              personaSlug: persona,
              limit: 12,
              conversationId, // Enable citation-based boosting
            },
            supabase
          );

          if (searchResults.length > 0) {
            const ragData = formatRagContext(searchResults);
            ragContext = ragData.context;
            citationMetadata = ragData.metadata;
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

    // Return text stream response
    // Note: Citation metadata will be available in the frontend via a separate mechanism
    // For now, we'll include it in a custom header on the text stream response
    const response = result.toTextStreamResponse();

    // Add citation metadata as a custom header (JSON stringified and Base64 encoded to handle non-ASCII)
    if (citationMetadata && citationMetadata.size > 0) {
      const metadataArray = Array.from(citationMetadata.entries()).map(([docRef, meta]) => ({
        docRef,
        ...meta,
      }));
      const encodedMetadata = Buffer.from(JSON.stringify(metadataArray), 'utf-8').toString('base64');
      response.headers.set('X-Citation-Metadata', encodedMetadata);
    }

    return response;
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}