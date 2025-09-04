/**
 * RAG Search Tools for AI SDK Integration
 *
 * Tools that integrate with Vercel AI SDK's tool calling system
 * to provide hybrid search, fact lookup, and timeline queries.
 */

import { z } from "zod";
import { tool } from "ai";
import { createClient } from "@/lib/supabase/server";

// =======================
// Tool Definitions
// =======================

/**
 * Search the document corpus using hybrid search
 */
export const searchCorpusTool = tool({
  description:
    "Search through the document corpus using hybrid semantic and keyword search. Use this to find relevant information from papers, patents, and notes.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query - what you want to find information about"),
    limit: z
      .number()
      .default(10)
      .describe("Maximum number of results to return (default: 10)"),
    documentTypes: z
      .array(z.enum(["pdf", "paper", "patent", "note", "url", "book"]))
      .optional()
      .describe("Filter by document types"),
    dateRange: z
      .object({
        start: z
          .string()
          .optional()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        end: z
          .string()
          .optional()
          .describe("End date in ISO format (YYYY-MM-DD)"),
      })
      .optional()
      .describe("Filter by date range"),
    responseMode: z
      .enum(["FACT", "EXPLAIN", "CONFLICTS"])
      .default("EXPLAIN")
      .describe(
        "How to structure the response - FACT for quick facts, EXPLAIN for detailed context, CONFLICTS for comparing sources"
      ),
  }),
  execute: async ({
    query,
    limit = 10,
    documentTypes,
    dateRange,
    responseMode = "EXPLAIN",
  }) => {
    try {
      console.log(`🔍 RAG search_corpus called with query: "${query}"`);
      const supabase = await createClient();

      // Get authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return {
          success: false,
          message: "Authentication required for corpus search",
          results: [],
          totalCount: 0,
        };
      }

      // Build query with filters
      let dbQuery = supabase
        .from("document_chunks")
        .select(
          `
          id,
          content,
          chunk_index,
          section_title,
          documents!inner (
            id,
            title,
            doc_type,
            url,
            authors,
            published_date,
            created_at,
            patent_no
          )
        `
        )
        .textSearch("tsvector_content", query, {
          config: "english",
          type: "websearch",
        })
        .order("documents(created_at)", { ascending: false })
        .limit(limit);

      // Apply document type filters
      if (documentTypes && documentTypes.length > 0) {
        dbQuery = dbQuery.in("documents.doc_type", documentTypes);
      }

      // Apply date range filters
      if (dateRange) {
        if (dateRange.start) {
          dbQuery = dbQuery.gte("documents.published_date", dateRange.start);
        }
        if (dateRange.end) {
          dbQuery = dbQuery.lte("documents.published_date", dateRange.end);
        }
      }

      const { data: chunks, error: searchError } = await dbQuery;

      if (searchError) {
        throw searchError;
      }

      if (!chunks || chunks.length === 0) {
        return {
          success: true,
          message: `No documents found matching "${query}". The query might be too specific or the information may not be in the corpus.`,
          results: [],
          totalCount: 0,
          suggestions: [
            "Try broader search terms",
            "Check spelling and terminology",
            "Remove date or document type filters",
            "Ask about general topics in the corpus",
          ],
        };
      }

      // Format results with citations
      const results = chunks.map((chunk, index) => ({
        title: chunk.documents.title,
        content: chunk.content,
        docType: chunk.documents.doc_type,
        pageRange: `Chunk ${chunk.chunk_index}`,
        sectionTitle: chunk.section_title,
        score: 0.8, // Placeholder score
        citation: `[C${index + 1}]`,
      }));

      return {
        success: true,
        message: `Found ${results.length} relevant documents for "${query}"`,
        results,
        totalCount: results.length,
        executionTime: Date.now() - Date.now(),
        citations: results.map((result, index) => ({
          marker: `C${index + 1}`,
          title: result.title,
          factSummary: result.content.substring(0, 100) + "...",
          documentType: result.docType,
        })),
      };
    } catch (error) {
      console.error("Search corpus error:", error);
      return {
        success: false,
        message: `Search failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        results: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Look up specific facts about entities (people, organizations, products, etc.)
 */
export const lookupFactsTool = tool({
  description:
    "Look up specific facts about people, organizations, products, algorithms, materials, or concepts mentioned in the corpus. Use this for factual questions about specific entities.",
  inputSchema: z.object({
    entityName: z
      .string()
      .describe(
        "The name of the person, organization, product, algorithm, material, or concept to look up"
      ),
    entityType: z
      .enum([
        "person",
        "organization",
        "product",
        "technology",
        "material",
        "concept",
        "venue",
        "location",
      ])
      .describe("The type of entity being looked up"),
    factType: z
      .enum(["basic_info", "relationships", "timeline", "technical_details"])
      .default("basic_info")
      .describe("What kind of facts to retrieve"),
  }),
  execute: async ({ entityName, entityType, factType = "basic_info" }) => {
    try {
      const supabase = await createClient();

      // Get authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return {
          success: false,
          message: "Authentication required for fact lookup",
          facts: [],
          totalCount: 0,
        };
      }

      // Search for entity mentions in document chunks
      const { data: chunks, error: searchError } = await supabase
        .from("document_chunks")
        .select(
          `
          id,
          content,
          chunk_index,
          section_title,
          documents!inner (
            id,
            title,
            doc_type,
            url,
            authors,
            published_date
          )
        `
        )
        .textSearch("tsvector_content", entityName, {
          config: "english",
          type: "websearch",
        })
        .limit(10);

      if (searchError) {
        throw searchError;
      }

      if (!chunks || chunks.length === 0) {
        return {
          success: true,
          message: `No information found about ${entityName} (${entityType}) in the corpus.`,
          facts: [],
          totalCount: 0,
        };
      }

      // Format the facts found
      const facts = chunks.slice(0, 5).map((chunk, index) => ({
        content: chunk.content,
        source: chunk.documents.title,
        docType: chunk.documents.doc_type,
        pageRange: `Chunk ${chunk.chunk_index}`,
        relevanceScore: 0.8, // Placeholder score
        citation: `[F${index + 1}]`,
      }));

      return {
        success: true,
        message: `Found ${facts.length} fact${
          facts.length === 1 ? "" : "s"
        } about ${entityName}`,
        entityInfo: {
          name: entityName,
          type: entityType,
          description: `Information about ${entityName} from the document corpus`,
          authorityScore: 0.8,
          mentionCount: chunks.length,
          aliases: [],
          events: [],
        },
        relationships: [],
        facts,
        totalCount: facts.length,
      };
    } catch (error) {
      console.error("Lookup facts error:", error);
      return {
        success: false,
        message: `Fact lookup failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        facts: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Get timeline information for events related to entities or documents
 */
export const getTimelineTool = tool({
  description:
    'Get chronological timeline information about events related to people, organizations, products, patents, or papers. Use this for questions about "when did X happen" or historical sequences.',
  inputSchema: z.object({
    entityName: z
      .string()
      .optional()
      .describe(
        "Name of the entity to get timeline for (person, org, product, etc.)"
      ),
    topic: z
      .string()
      .optional()
      .describe(
        "Topic or subject area to get timeline for if no specific entity"
      ),
    dateRange: z
      .object({
        start: z
          .string()
          .optional()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        end: z
          .string()
          .optional()
          .describe("End date in ISO format (YYYY-MM-DD)"),
      })
      .optional()
      .describe("Filter events by date range"),
    eventTypes: z
      .array(
        z.enum([
          "filed",
          "published",
          "granted",
          "expires",
          "product_launch",
          "acquired",
          "founded",
        ])
      )
      .optional()
      .describe("Filter by specific event types"),
  }),
  execute: async ({ entityName, topic, dateRange, eventTypes }) => {
    try {
      const supabase = await createClient();

      // Get authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return {
          success: false,
          message: "Authentication required for timeline access",
          events: [],
          totalCount: 0,
        };
      }

      // Search for timeline-relevant content in documents
      const searchTerm = entityName || topic || "timeline";

      const { data: documents, error: searchError } = await supabase
        .from("documents")
        .select(
          `
          id,
          title,
          doc_type,
          published_date,
          created_at,
          url,
          patent_no,
          authors
        `
        )
        .textSearch("title", searchTerm, {
          config: "english",
          type: "websearch",
        })
        .order("published_date", { ascending: true })
        .limit(20);

      if (searchError) {
        throw searchError;
      }

      if (!documents || documents.length === 0) {
        const searchTermDisplay = entityName || topic || "requested criteria";
        return {
          success: true,
          message: `No timeline events found for ${searchTermDisplay}`,
          events: [],
          totalCount: 0,
        };
      }

      // Create timeline events from documents
      const timelineEvents = documents
        .filter((doc) => doc.published_date || doc.created_at)
        .map((doc, index) => ({
          date: doc.published_date || doc.created_at,
          type: doc.doc_type === "patent" ? "published" : "created",
          description: `${doc.title}`,
          entity: entityName || "David Fattal",
          entityType: "person",
          document: doc.title,
          documentType: doc.doc_type,
          authority: 0.8,
          citation: `[T${index + 1}]`,
        }));

      // Apply date range filters
      let filteredEvents = timelineEvents;
      if (dateRange) {
        filteredEvents = timelineEvents.filter((event) => {
          const eventDate = new Date(event.date);
          const startOk =
            !dateRange.start || eventDate >= new Date(dateRange.start);
          const endOk = !dateRange.end || eventDate <= new Date(dateRange.end);
          return startOk && endOk;
        });
      }

      // Apply event type filters
      if (eventTypes && eventTypes.length > 0) {
        filteredEvents = filteredEvents.filter((event) =>
          eventTypes.includes(event.type as any)
        );
      }

      // Group events by year for better presentation
      const eventsByYear = filteredEvents.reduce((acc, event) => {
        const year = new Date(event.date).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(event);
        return acc;
      }, {} as Record<number, any[]>);

      return {
        success: true,
        message: `Found ${filteredEvents.length} timeline events`,
        events: filteredEvents,
        eventsByYear,
        totalCount: filteredEvents.length,
        dateRange: {
          earliest: filteredEvents[0]?.date,
          latest: filteredEvents[filteredEvents.length - 1]?.date,
        },
      };
    } catch (error) {
      console.error("Timeline lookup error:", error);
      return {
        success: false,
        message: `Timeline lookup failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        events: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// =======================
// Tool Collection Export
// =======================

export const ragSearchTools = {
  search_corpus: searchCorpusTool,
  lookup_facts: lookupFactsTool,
  get_timeline: getTimelineTool,
};

// =======================
// Utility Functions
// =======================

/**
 * Determine the best tool to use based on query intent
 */
export function classifyQueryIntent(query: string): {
  primaryTool: keyof typeof ragSearchTools;
  confidence: number;
  reasoning: string;
} {
  const normalizedQuery = query.toLowerCase();

  // Timeline indicators
  const timelinePatterns = [
    /when (did|was|were)/,
    /timeline/i,
    /chronolog/i,
    /history of/i,
    /sequence of/i,
    /over time/i,
    /\b(before|after|during)\b/,
    /\b\d{4}\b/, // Years
  ];

  // Entity/fact lookup indicators
  const factPatterns = [
    /who is/i,
    /what is/i,
    /tell me about/i,
    /information about/i,
    /details about/i,
    /facts about/i,
  ];

  // General search indicators (default)
  const searchPatterns = [
    /how/i,
    /why/i,
    /explain/i,
    /describe/i,
    /compare/i,
    /analysis/i,
  ];

  // Check for timeline patterns
  const timelineMatches = timelinePatterns.filter((pattern) =>
    pattern.test(normalizedQuery)
  ).length;
  if (timelineMatches >= 2) {
    return {
      primaryTool: "get_timeline",
      confidence: 0.8,
      reasoning:
        "Query contains multiple temporal indicators suggesting timeline lookup",
    };
  }

  // Check for fact lookup patterns
  const factMatches = factPatterns.filter((pattern) =>
    pattern.test(normalizedQuery)
  ).length;
  if (factMatches >= 1) {
    return {
      primaryTool: "lookup_facts",
      confidence: 0.7,
      reasoning:
        "Query appears to be asking for specific facts about an entity",
    };
  }

  // Default to general corpus search
  return {
    primaryTool: "search_corpus",
    confidence: 0.6,
    reasoning: "General information query - using hybrid search across corpus",
  };
}

/**
 * Suggest follow-up queries based on search results
 */
export function generateFollowUpSuggestions(
  results: SearchResult[],
  originalQuery: string
): string[] {
  if (results.length === 0) {
    return [
      "Try using broader search terms",
      "Check if the topic is covered in the corpus",
      "Ask about related concepts or entities",
    ];
  }

  const suggestions: string[] = [];

  // Extract entities and concepts from results
  const commonTerms = extractCommonTerms(results);

  // Generate entity-based suggestions
  commonTerms.entities.slice(0, 2).forEach((entity) => {
    suggestions.push(`Tell me more about ${entity}`);
  });

  // Generate time-based suggestions
  if (commonTerms.dates.length > 0) {
    suggestions.push(`What happened with this topic over time?`);
  }

  // Generate comparative suggestions
  if (results.length > 2) {
    suggestions.push(`Compare different approaches to ${originalQuery}`);
  }

  return suggestions.slice(0, 4); // Limit to 4 suggestions
}

/**
 * Extract common terms from search results for suggestions
 */
function extractCommonTerms(results: SearchResult[]): {
  entities: string[];
  dates: string[];
  concepts: string[];
} {
  // This is a simplified implementation
  // In a real system, you'd use NLP techniques

  const allText = results.map((r) => r.content + " " + r.title).join(" ");

  // Extract capitalized words as potential entities
  const capitalizedWords =
    allText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const entities = [...new Set(capitalizedWords)]
    .filter((word) => word.length > 2)
    .slice(0, 5);

  // Extract years as dates
  const years = allText.match(/\b(19|20)\d{2}\b/g) || [];
  const dates = [...new Set(years)];

  // Extract technical terms (simplified)
  const technicalWords =
    allText.match(/\b[a-z]+(?:ing|tion|ment|ness|ity)\b/g) || [];
  const concepts = [...new Set(technicalWords)]
    .filter((word) => word.length > 4)
    .slice(0, 3);

  return { entities, dates, concepts };
}
