import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  shouldUseRAG,
  executeRAG,
  executeRAGWithContext,
  createRAGEnhancedPrompt,
  type RAGContext,
} from "@/lib/rag/sequential-rag";
import { createCitationManager } from "@/lib/rag/citation-persistence";
import { startPerformanceTimer, endPerformanceTimer, timeOperation } from "@/lib/performance/monitoring";
import { personaManager } from "@/lib/personas/persona-manager";
import type { Persona } from "@/lib/rag/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const overallTimerId = startPerformanceTimer('chat_request', {
    category: 'api',
    operation: 'chat_complete_request',
    threshold: 3000, // 3 second threshold
  });

  try {
    // Parse request body
    const parseTimerId = startPerformanceTimer('parse_request', {
      category: 'api',
      operation: 'parse_request_body',
    });
    const body = await req.json();
    endPerformanceTimer(parseTimerId);
    const { messages, conversationId, persona = 'david' } = body;

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
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })
    );

    // Initialize persona system if not already done
    const personaLoadTimerId = startPerformanceTimer('persona_load', {
      category: 'persona',
      operation: 'load_persona_config',
    });

    // Try to load enhanced persona if not already cached
    if (!personaManager.isEnhanced(persona as Persona)) {
      try {
        await personaManager.loadPersonaFromMarkdown(persona as Persona);
      } catch (error) {
        console.warn(`Failed to load enhanced persona ${persona}, using fallback:`, error);
      }
    }

    endPerformanceTimer(personaLoadTimerId);

    // Generate dynamic system prompt based on persona
    const baseSystemPrompt = personaManager.generateSystemPrompt(persona as Persona);

    // Add RAG tools and formatting guidelines
    const toolsAndFormattingGuidelines = `

Current user role: ${userRole}

You have access to advanced RAG tools that can search the comprehensive document corpus:

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

CITATION RULES:
- Always cite sources using the citation IDs returned by tools (e.g., [A1], [F2], [T3])
- Include a "Sources" section at the end with full citations
- For facts with low confidence, mention uncertainty
- Prefer authoritative sources (patents, papers) over notes

Always provide accurate, helpful responses with transparent sourcing while maintaining proper markdown formatting for excellent readability.`;

    const systemPrompt = baseSystemPrompt + toolsAndFormattingGuidelines;

    // Get the user query for RAG analysis
    const userQuery = messages[messages.length - 1]?.content || "";

    console.log(`🤖 Processing query: "${userQuery}"`);

    // Check if RAG is needed for this query
    const useRAG = shouldUseRAG(userQuery);
    console.log(`🎯 RAG needed: ${useRAG}`);

    let ragContext: RAGContext = {
      hasRAGResults: false,
      ragResults: "",
      citations: "",
      toolsUsed: [],
      executionTime: 0,
      // Enhanced context information
      contextUsed: false,
      turnAnalysis: undefined,
      carryOverResult: undefined,
      freshResults: 0,
      carryOverResults: 0,
      // Fact summarization context
      memoryUsed: false,
      // Citation persistence context
      citationsPersisted: false,
      // Metadata query context
      isMetadataQuery: false,
    };

    // Execute RAG if needed (with enhanced context management)
    if (useRAG) {
      const { result: ragResult, duration: ragDuration } = await timeOperation(
        () => executeRAGWithContext(userQuery, conversationId, messages),
        'rag_execution',
        {
          category: 'rag',
          operation: 'executeRAGWithContext',
          threshold: 1000, // 1 second threshold for RAG
          context: { query: userQuery, conversationId }
        }
      );
      
      ragContext = ragResult;
      console.log("🔍 Executing sequential RAG with context management...");
      console.log(
        `📊 RAG execution completed in ${ragDuration.toFixed(0)}ms: ${
          ragContext.hasRAGResults ? "SUCCESS" : "NO_RESULTS"
        }`
      );
      console.log(`🔄 Context Management: ${ragContext.contextUsed ? "ACTIVE" : "DISABLED"}`);
      if (ragContext.contextUsed && ragContext.turnAnalysis) {
        console.log(`🎯 Turn: ${ragContext.turnAnalysis.turnType}, Mode: ${ragContext.turnAnalysis.responseMode}`);
        console.log(`📈 Sources: ${ragContext.freshResults} fresh + ${ragContext.carryOverResults} carried`);
      }
    }

    // Create enhanced system prompt with RAG context
    const enhancedSystemPrompt = createRAGEnhancedPrompt(
      systemPrompt,
      ragContext
    );

    // Optimized onFinish handler with parallel operations
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

          // Parallel operation 1: Get conversation ID if needed
          if (!actualConversationId) {
            console.log("🔍 No conversationId provided, searching for recently created conversation...");
            const { data: recentConversations, error: searchError } = await supabase
              .from("conversations")
              .select("id, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(5);

            if (!searchError && recentConversations?.length > 0) {
              const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
              const recentConv = recentConversations.find((conv: { id: string; created_at: string }) => conv.created_at > thirtySecondsAgo);
              
              if (recentConv) {
                actualConversationId = recentConv.id;
                console.log(`✅ Found recent conversation: ${actualConversationId}`);
              }
            }
          }

          if (!actualConversationId) {
            console.log("⚠️ No conversation ID available, skipping message save");
            return;
          }

          console.log("💾 Starting parallel database operations...");
          const dbTimerId = startPerformanceTimer('database_operations', {
            category: 'database',
            operation: 'parallel_message_persistence',
            threshold: 2000, // 2 second threshold for DB operations
            context: { conversationId: actualConversationId }
          });

          // Execute all database operations in parallel
          const [
            existingMessageCheck,
            assistantMessageInsert,
            conversationUpdate
          ] = await Promise.allSettled([
            // Check for existing user message
            supabase
              .from("messages")
              .select("id")
              .eq("conversation_id", actualConversationId)
              .eq("role", "user")
              .eq("content", latestUserMessage.content)
              .limit(1),
            
            // Save assistant message immediately
            supabase.from("messages").insert({
              conversation_id: actualConversationId,
              role: "assistant",
              content: completion.text,
            }).select('id').single(),
            
            // Update conversation timestamp
            supabase
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", actualConversationId)
              .eq("user_id", user.id)
          ]);

          const operationTime = endPerformanceTimer(dbTimerId) || 0;
          console.log(`⚡ Parallel database operations completed in ${operationTime.toFixed(0)}ms`);

          // Handle assistant message result
          let savedMessageId: string | null = null;
          if (assistantMessageInsert.status === 'fulfilled' && !assistantMessageInsert.value.error) {
            savedMessageId = assistantMessageInsert.value.data?.id;
            console.log("✅ Assistant message saved successfully");
          } else {
            console.error("❌ Failed to save assistant message:", 
              assistantMessageInsert.status === 'fulfilled' 
                ? assistantMessageInsert.value.error 
                : assistantMessageInsert.reason);
          }

          // Handle user message if needed (only if doesn't exist)
          let userMessageExists = false;
          if (existingMessageCheck.status === 'fulfilled' && !existingMessageCheck.value.error) {
            userMessageExists = (existingMessageCheck.value.data?.length || 0) > 0;
            if (userMessageExists) {
              console.log("✅ User message already exists, skipping duplicate save");
            }
          }

          // Save user message if it doesn't exist (async, non-blocking)
          if (!userMessageExists) {
            supabase.from("messages").insert({
              conversation_id: actualConversationId,
              role: "user",
              content: latestUserMessage.content,
            }).then((result: { error: any }) => {
              if (result.error) {
                console.error("❌ Failed to save user message:", result.error);
              } else {
                console.log("✅ User message saved successfully");
              }
            });
          }

          // Handle conversation timestamp update
          if (conversationUpdate.status === 'fulfilled' && !conversationUpdate.value.error) {
            console.log("✅ Conversation timestamp updated successfully");
          } else {
            console.error("❌ Failed to update conversation timestamp:", 
              conversationUpdate.status === 'fulfilled' 
                ? conversationUpdate.value.error 
                : conversationUpdate.reason);
          }
          
          // Handle citation persistence with optimized batch processing (non-blocking)
          // Skip citation persistence for metadata queries since they don't have document citations
          if (ragContext.hasRAGResults && savedMessageId && !ragContext.isMetadataQuery) {
            // Import optimized citation processing
            import('@/lib/performance/batch-citations')
              .then(({ optimizedCitationPersistence }) => 
                optimizedCitationPersistence(supabase, savedMessageId, actualConversationId, ragContext)
              )
              .then(() => console.log("✅ Citations queued for batch processing"))
              .catch((error) => console.error("❌ Citation persistence failed:", error));
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
    endPerformanceTimer(overallTimerId);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // Ensure timer is ended even if not caught above
    endPerformanceTimer(overallTimerId);
  }
}

/**
 * Handle citation persistence after message is saved
 */
async function handleCitationPersistence(
  supabase: SupabaseClient,
  messageId: string,
  conversationId: string,
  ragContext: RAGContext
) {
  try {
    console.log("💾 Starting citation persistence process...");
    
    const citationManager = createCitationManager(conversationId);
    
    // Extract citations from ragContext if available
    if (ragContext.enhancedCitations && ragContext.enhancedCitations.length > 0) {
      console.log(`💾 Persisting ${ragContext.enhancedCitations.length} enhanced citations...`);
      
      // Persist citations to message_citations table
      const citationData = ragContext.enhancedCitations.map(citation => ({
        message_id: messageId,
        document_id: citation.documentId,
        chunk_id: citation.chunkId,
        marker: citation.marker,
        fact_summary: citation.factSummary,
        page_range: citation.pageRange,
        relevance_score: citation.relevanceScore,
        citation_order: citation.citationOrder
      }));
      
      const { error: citationError } = await supabase
        .from('message_citations')
        .insert(citationData);
        
      if (citationError) {
        console.error("❌ Failed to persist citations:", citationError);
      } else {
        console.log("✅ Citations persisted successfully");
      }
      
      // Update conversation_sources table
      const sourceData = ragContext.enhancedCitations.map(citation => ({
        conversation_id: conversationId,
        document_id: citation.documentId,
        last_used_at: new Date().toISOString(),
        carry_score: citation.relevanceScore || 1.0,
        pinned: false,
        turns_inactive: 0
      }));
      
      // Use upsert to handle existing sources
      const { error: sourceError } = await supabase
        .from('conversation_sources')
        .upsert(sourceData, { 
          onConflict: 'conversation_id,document_id',
          ignoreDuplicates: false 
        });
        
      if (sourceError) {
        console.error("❌ Failed to update conversation sources:", sourceError);
      } else {
        console.log("✅ Conversation sources updated successfully");
      }
    }
    
    // Also handle legacy citation format from ragContext.citations if needed
    if (!ragContext.enhancedCitations && ragContext.citations) {
      console.log("💾 Processing legacy citation format...");
      // Parse citations from the formatted string and persist
      // This would need additional parsing logic for the legacy format
    }
    
  } catch (error) {
    console.error("❌ Citation persistence failed:", error);
  }
}
