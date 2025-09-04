/**
 * Sequential RAG Implementation
 * 
 * This approach solves the AI SDK v5 + tools + streaming incompatibility by:
 * 1. Determining if RAG is needed based on query analysis
 * 2. Calling RAG tools separately (non-streaming) if needed
 * 3. Injecting RAG results into the system prompt
 * 4. Streaming the final response without tools enabled
 */

import { createClient } from "@/lib/supabase/server";
import { ragSearchTools, classifyQueryIntent } from "./search-tools";

// SearchResult interface removed - not used in this file

export interface RAGContext {
  hasRAGResults: boolean;
  ragResults: string;
  citations: string;
  toolsUsed: string[];
  executionTime: number;
}

/**
 * Determine if a query needs RAG support
 */
export function shouldUseRAG(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  
  // Keywords that suggest RAG is needed
  const ragKeywords = [
    'difference between',
    'compare',
    'what is',
    'tell me about',
    'explain',
    'definition of',
    'how does',
    'research',
    'paper',
    'study',
    'patent',
    'citation',
    'source',
    'document',
    'spatial ai',
    'physical ai',
    'machine learning',
    'artificial intelligence',
    'david fattal',
  ];

  // Simple heuristic: if query contains RAG keywords, use RAG
  return ragKeywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Execute RAG tools sequentially and return formatted results
 */
export async function executeRAG(query: string): Promise<RAGContext> {
  const startTime = Date.now();
  
  try {
    console.log(`🔍 Sequential RAG execution for query: "${query}"`);
    
    // Get authenticated user for RAG tools
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log("❌ Sequential RAG: No authenticated user");
      return {
        hasRAGResults: false,
        ragResults: "",
        citations: "",
        toolsUsed: [],
        executionTime: Date.now() - startTime,
      };
    }

    // Classify query intent to determine best tool
    const queryIntent = classifyQueryIntent(query);
    console.log(`🎯 Query classified as: ${queryIntent.primaryTool} (confidence: ${queryIntent.confidence})`);

    let ragResults = "";
    let citations = "";
    const toolsUsed: string[] = [];

    // Execute the primary tool based on classification
    switch (queryIntent.primaryTool) {
      case "search_corpus": {
        const tool = ragSearchTools.search_corpus;
        const result = await tool.execute({
          query,
          limit: 8,
          responseMode: "EXPLAIN",
        });
        
        if (result.success && result.results && result.results.length > 0) {
          ragResults = formatSearchResults(result);
          citations = formatCitations(result);
          toolsUsed.push("search_corpus");
        }
        break;
      }
      
      case "lookup_facts": {
        // Extract entity name from query
        const entityName = extractEntityName(query);
        if (entityName) {
          const tool = ragSearchTools.lookup_facts;
          const result = await tool.execute({
            entityName,
            entityType: "concept",
            factType: "basic_info",
          });
          
          if (result.success && result.facts && result.facts.length > 0) {
            ragResults = formatFactResults(result);
            citations = formatFactCitations(result);
            toolsUsed.push("lookup_facts");
          }
        }
        break;
      }
      
      case "get_timeline": {
        const tool = ragSearchTools.get_timeline;
        const result = await tool.execute({
          topic: query,
        });
        
        if (result.success && result.events && result.events.length > 0) {
          ragResults = formatTimelineResults(result);
          citations = formatTimelineCitations(result);
          toolsUsed.push("get_timeline");
        }
        break;
      }
    }

    // If primary tool failed or returned no results, try search_corpus as fallback
    if (!ragResults && queryIntent.primaryTool !== "search_corpus") {
      console.log("🔄 Primary tool failed, falling back to search_corpus");
      const tool = ragSearchTools.search_corpus;
      const result = await tool.execute({
        query,
        limit: 5,
        responseMode: "EXPLAIN",
      });
      
      if (result.success && result.results && result.results.length > 0) {
        ragResults = formatSearchResults(result);
        citations = formatCitations(result);
        toolsUsed.push("search_corpus");
      }
    }

    const executionTime = Date.now() - startTime;
    
    console.log(`✅ Sequential RAG completed in ${executionTime}ms`);
    console.log(`📊 Tools used: ${toolsUsed.join(", ")}`);
    console.log(`📝 RAG results length: ${ragResults.length} characters`);
    
    return {
      hasRAGResults: ragResults.length > 0,
      ragResults,
      citations,
      toolsUsed,
      executionTime,
    };
    
  } catch (error) {
    console.error("❌ Sequential RAG execution failed:", error);
    return {
      hasRAGResults: false,
      ragResults: "",
      citations: "",
      toolsUsed: [],
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Format search corpus results for injection into system prompt
 */
function formatSearchResults(result: { results?: Array<{ title: string; docType: string; content: string; citation: string }> }): string {
  const results = result.results || [];
  return results.map((r, index: number) => 
    `**Source ${index + 1}:** ${r.title} (${r.docType})
${r.content}
Citation: ${r.citation}`
  ).join("\n\n");
}

/**
 * Format citations for search results
 */
function formatCitations(result: { citations?: Array<{ marker: string; title: string; factSummary: string }> }): string {
  const citations = result.citations || [];
  return citations.map((c) => 
    `${c.marker}: ${c.title} - ${c.factSummary}`
  ).join("\n");
}

/**
 * Format fact lookup results
 */
function formatFactResults(result: { facts?: Array<{ source: string; docType: string; content: string; citation: string }> }): string {
  const facts = result.facts || [];
  return facts.map((f, index: number) => 
    `**Fact ${index + 1}:** ${f.source} (${f.docType})
${f.content}
Citation: ${f.citation}`
  ).join("\n\n");
}

/**
 * Format fact citations
 */
function formatFactCitations(result: { facts?: Array<{ citation: string; source: string }> }): string {
  const facts = result.facts || [];
  return facts.map((f) => 
    `${f.citation}: ${f.source}`
  ).join("\n");
}

/**
 * Format timeline results
 */
function formatTimelineResults(result: { events?: Array<{ date: string; description: string; document: string; documentType: string; citation: string }> }): string {
  const events = result.events || [];
  return events.map((e, index: number) => 
    `**Event ${index + 1}:** ${e.date} - ${e.description}
Document: ${e.document} (${e.documentType})
Citation: ${e.citation}`
  ).join("\n\n");
}

/**
 * Format timeline citations
 */
function formatTimelineCitations(result: { events?: Array<{ citation: string; document: string; date: string }> }): string {
  const events = result.events || [];
  return events.map((e) => 
    `${e.citation}: ${e.document} (${e.date})`
  ).join("\n");
}

/**
 * Extract entity name from query for fact lookup
 */
function extractEntityName(query: string): string | null {
  // Simple entity extraction patterns
  const patterns = [
    /(?:what is|tell me about|define|explain)\s+(.+?)(?:\?|$)/i,
    /(?:who is|about)\s+(.+?)(?:\?|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Create enhanced system prompt with RAG context
 */
export function createRAGEnhancedPrompt(basePrompt: string, ragContext: RAGContext): string {
  if (!ragContext.hasRAGResults) {
    return basePrompt;
  }

  const ragSection = `

## DOCUMENT CORPUS CONTEXT

You have access to the following relevant information from David Fattal's document corpus:

${ragContext.ragResults}

## CITATIONS

${ragContext.citations}

## INSTRUCTIONS

- Use the above context to provide accurate, well-cited responses
- Reference sources using the citation markers provided (e.g., [C1], [F1], [T1])
- If the context doesn't contain relevant information, say so clearly
- Always prioritize accuracy over completeness
- Include a "Sources" section at the end with full citations`;

  return basePrompt + ragSection;
}