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
  
  // Group results by document title to avoid redundant citations
  const groupedByDocument = new Map<string, { results: typeof results; docType: string }>();
  
  results.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, { results: [], docType: r.docType });
    }
    groupedByDocument.get(r.title)!.results.push(r);
  });
  
  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  return documents.map(([title, { results: docResults, docType }], docIndex: number) => 
    `**Source ${docIndex + 1}:** ${title} (${docType})
${docResults.map(r => r.content).join('\n\n')}
Citation: [${docIndex + 1}]`
  ).join("\n\n");
}

/**
 * Format citations for search results - grouped by document
 */
function formatCitations(result: { citations?: Array<{ marker: string; title: string; factSummary: string; documentType: string }> }): string {
  const citations = result.citations || [];
  
  // Group citations by document title
  const groupedByDocument = new Map<string, { documentType: string; factSummary: string }>();
  
  citations.forEach(c => {
    if (!groupedByDocument.has(c.title)) {
      groupedByDocument.set(c.title, { documentType: c.documentType, factSummary: c.factSummary });
    }
  });
  
  // Create clean numbered citations
  const documents = Array.from(groupedByDocument.entries());
  return documents.map(([title, { documentType }], index: number) => 
    `[${index + 1}]: ${title}`
  ).join("\n");
}

/**
 * Format fact lookup results
 */
function formatFactResults(result: { facts?: Array<{ source: string; docType: string; content: string; citation: string }> }): string {
  const facts = result.facts || [];
  
  // Group facts by source document to avoid redundant citations
  const groupedBySource = new Map<string, { facts: typeof facts; docType: string }>();
  
  facts.forEach(f => {
    if (!groupedBySource.has(f.source)) {
      groupedBySource.set(f.source, { facts: [], docType: f.docType });
    }
    groupedBySource.get(f.source)!.facts.push(f);
  });
  
  // Create numbered citations for each unique source
  const sources = Array.from(groupedBySource.entries());
  return sources.map(([source, { facts: sourceFacts, docType }], sourceIndex: number) => 
    `**Source ${sourceIndex + 1}:** ${source} (${docType})
${sourceFacts.map(f => f.content).join('\n\n')}
Citation: [${sourceIndex + 1}]`
  ).join("\n\n");
}

/**
 * Format fact citations - grouped by source
 */
function formatFactCitations(result: { facts?: Array<{ citation: string; source: string }> }): string {
  const facts = result.facts || [];
  
  // Group citations by source
  const groupedBySource = new Map<string, boolean>();
  
  facts.forEach(f => {
    groupedBySource.set(f.source, true);
  });
  
  // Create clean numbered citations
  const sources = Array.from(groupedBySource.keys());
  return sources.map((source, index: number) => 
    `[${index + 1}]: ${source}`
  ).join("\n");
}

/**
 * Format timeline results
 */
function formatTimelineResults(result: { events?: Array<{ date: string; description: string; document: string; documentType: string; citation: string }> }): string {
  const events = result.events || [];
  
  // Group events by document to avoid redundant citations
  const groupedByDocument = new Map<string, { events: typeof events; documentType: string }>();
  
  events.forEach(e => {
    if (!groupedByDocument.has(e.document)) {
      groupedByDocument.set(e.document, { events: [], documentType: e.documentType });
    }
    groupedByDocument.get(e.document)!.events.push(e);
  });
  
  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  return documents.map(([document, { events: docEvents, documentType }], docIndex: number) => 
    `**Source ${docIndex + 1}:** ${document} (${documentType})
${docEvents.map(e => `${e.date} - ${e.description}`).join('\n')}
Citation: [${docIndex + 1}]`
  ).join("\n\n");
}

/**
 * Format timeline citations - grouped by document
 */
function formatTimelineCitations(result: { events?: Array<{ citation: string; document: string; date: string }> }): string {
  const events = result.events || [];
  
  // Group citations by document
  const groupedByDocument = new Map<string, boolean>();
  
  events.forEach(e => {
    groupedByDocument.set(e.document, true);
  });
  
  // Create clean numbered citations
  const documents = Array.from(groupedByDocument.keys());
  return documents.map((document, index: number) => 
    `[${index + 1}]: ${document}`
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
    // When RAG fails or returns no results, explicitly inform the model
    const noRAGSection = `

## IMPORTANT: LIMITED ACCESS TO DOCUMENT CORPUS

You currently do not have access to David Fattal's document corpus or the RAG search returned no relevant results.

## CRITICAL INSTRUCTIONS FOR THIS RESPONSE:

- DO NOT fabricate or guess information about specific patents, papers, people, or technical details
- If asked about specific patents, papers, or documents, clearly state: "I cannot find information about [topic] in the available corpus. For accurate details about patents, papers, or technical documents, I'd recommend checking the original sources directly."
- DO NOT make up patent numbers, inventor names, publication dates, or technical specifications
- You can provide general knowledge about topics, but clearly distinguish between general knowledge and specific factual claims
- Be honest about limitations rather than providing potentially incorrect information
- Suggest alternative ways the user could find the information (USPTO database, Google Patents, original paper sources, etc.)

REMEMBER: It's better to admit uncertainty than to provide incorrect information that could mislead the user.`;
    
    return basePrompt + noRAGSection;
  }

  const ragSection = `

## DOCUMENT CORPUS CONTEXT

You have access to the following relevant information from David Fattal's document corpus:

${ragContext.ragResults}

## CITATIONS

${ragContext.citations}

## INSTRUCTIONS

- Use the above context to provide accurate, well-cited responses
- Reference sources using clean numbered citations (e.g., [1], [2], [3])
- If the context doesn't contain relevant information, say so clearly
- Always prioritize accuracy over completeness
- Include sources at the end using this sleek format with visual separation:
  
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280;">
  [1]: Document Title One<br>
  [2]: Document Title Two
  </div>`;

  return basePrompt + ragSection;
}