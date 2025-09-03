/**
 * RAG Search Tools for AI SDK Integration
 * 
 * Tools that integrate with Vercel AI SDK's tool calling system
 * to provide hybrid search, fact lookup, and timeline queries.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { hybridSearchEngine, searchByEntity } from './hybrid-search';
import { citationGenerator, processCitations } from './citations';
import { supabase } from '@/lib/supabase';
import type { 
  SearchResult, 
  ResponseMode, 
  TurnType,
  CitationContext 
} from './types';

// =======================
// Tool Definitions
// =======================

/**
 * Search the document corpus using hybrid search
 */
export const searchCorpusTool = tool({
  description: 'Search through the document corpus using hybrid semantic and keyword search. Use this to find relevant information from papers, patents, and notes.',
  parameters: z.object({
    query: z.string().describe('The search query - what you want to find information about'),
    limit: z.number().default(10).describe('Maximum number of results to return (default: 10)'),
    documentTypes: z.array(z.enum(['pdf', 'paper', 'patent', 'note', 'url', 'book'])).optional().describe('Filter by document types'),
    dateRange: z.object({
      start: z.string().optional().describe('Start date in ISO format (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date in ISO format (YYYY-MM-DD)')
    }).optional().describe('Filter by date range'),
    responseMode: z.enum(['FACT', 'EXPLAIN', 'CONFLICTS']).default('EXPLAIN').describe('How to structure the response - FACT for quick facts, EXPLAIN for detailed context, CONFLICTS for comparing sources'),
  }),
  execute: async ({ 
    query, 
    limit = 10, 
    documentTypes, 
    dateRange, 
    responseMode = 'EXPLAIN' 
  }) => {
    try {
      // Build search filters
      const filters: any = {};
      
      if (documentTypes && documentTypes.length > 0) {
        filters.documentTypes = documentTypes;
      }
      
      if (dateRange) {
        filters.dateRange = {};
        if (dateRange.start) {
          filters.dateRange.start = new Date(dateRange.start);
        }
        if (dateRange.end) {
          filters.dateRange.end = new Date(dateRange.end);
        }
      }

      // Execute hybrid search
      const searchResult = await hybridSearchEngine.search({
        query,
        limit,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });

      // Process results
      const results = searchResult.results;
      
      if (results.length === 0) {
        return {
          success: true,
          message: `No documents found matching "${query}". The query might be too specific or the information may not be in the corpus.`,
          results: [],
          totalCount: 0,
          suggestions: [
            'Try broader search terms',
            'Check spelling and terminology',
            'Remove date or document type filters',
            'Ask about general topics in the corpus'
          ]
        };
      }

      // Generate citations for the results
      const citationContext: CitationContext = {
        responseMode: responseMode as ResponseMode,
        userRole: 'member' // Default - should be passed from request context
      };

      const citations = citationGenerator.generateCitations(results, citationContext);

      return {
        success: true,
        message: `Found ${results.length} relevant documents for "${query}"`,
        results: results.map((result, index) => ({
          title: result.title,
          content: result.content,
          docType: result.docType,
          pageRange: result.pageRange,
          sectionTitle: result.sectionTitle,
          score: Math.round(result.score * 100) / 100,
          citation: citations[index]?.marker ? `[${citations[index].marker}]` : `[${index + 1}]`,
        })),
        totalCount: results.length,
        executionTime: searchResult.executionTime,
        citations: citations.map(c => ({
          marker: c.marker,
          title: c.title,
          factSummary: c.factSummary,
          documentType: c.docType
        }))
      };

    } catch (error) {
      console.error('Search corpus error:', error);
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

/**
 * Look up specific facts about entities (people, organizations, products, etc.)
 */
export const lookupFactsTool = tool({
  description: 'Look up specific facts about people, organizations, products, algorithms, materials, or concepts mentioned in the corpus. Use this for factual questions about specific entities.',
  parameters: z.object({
    entityName: z.string().describe('The name of the person, organization, product, algorithm, material, or concept to look up'),
    entityType: z.enum(['person', 'org', 'product', 'algorithm', 'material', 'concept']).describe('The type of entity being looked up'),
    factType: z.enum(['basic_info', 'relationships', 'timeline', 'technical_details']).default('basic_info').describe('What kind of facts to retrieve'),
  }),
  execute: async ({ entityName, entityType, factType = 'basic_info' }) => {
    try {
      // Search for the entity in the corpus
      const results = await searchByEntity(entityName, entityType);

      if (results.length === 0) {
        return {
          success: true,
          message: `No information found about ${entityName} (${entityType}) in the corpus.`,
          facts: [],
          totalCount: 0
        };
      }

      // Look up entity in the knowledge graph
      const { data: entityData, error: entityError } = await supabase
        .from('entities')
        .select(`
          id,
          name,
          kind,
          description,
          authority_score,
          mention_count,
          aliases (
            alias,
            is_primary,
            confidence
          ),
          events (
            type,
            event_date,
            authority,
            description
          )
        `)
        .eq('name', entityName)
        .eq('kind', entityType)
        .order('authority_score', { ascending: false })
        .limit(1)
        .single();

      // Get related entities and relationships if needed
      let relatedData = null;
      if (factType === 'relationships' && entityData) {
        const { data: relationships } = await supabase
          .from('edges')
          .select(`
            rel,
            weight,
            evidence_text,
            dst:dst_id (name, kind),
            src:src_id (name, kind)
          `)
          .or(`src_id.eq.${entityData.id},dst_id.eq.${entityData.id}`)
          .order('weight', { ascending: false })
          .limit(10);

        relatedData = relationships;
      }

      // Format the response based on what we found
      const facts = results.slice(0, 5).map((result, index) => ({
        content: result.content,
        source: result.title,
        docType: result.docType,
        pageRange: result.pageRange,
        relevanceScore: Math.round(result.score * 100) / 100,
        citation: `[F${index + 1}]`
      }));

      return {
        success: true,
        message: `Found ${facts.length} fact${facts.length === 1 ? '' : 's'} about ${entityName}`,
        entityInfo: entityData ? {
          name: entityData.name,
          type: entityData.kind,
          description: entityData.description,
          authorityScore: entityData.authority_score,
          mentionCount: entityData.mention_count,
          aliases: entityData.aliases?.map((a: any) => a.alias) || [],
          events: entityData.events?.map((e: any) => ({
            type: e.type,
            date: e.event_date,
            description: e.description
          })) || []
        } : null,
        relationships: relatedData?.map((rel: any) => ({
          relation: rel.rel,
          target: rel.dst?.name || rel.src?.name,
          targetType: rel.dst?.kind || rel.src?.kind,
          evidence: rel.evidence_text,
          strength: rel.weight
        })) || [],
        facts,
        totalCount: facts.length
      };

    } catch (error) {
      console.error('Lookup facts error:', error);
      return {
        success: false,
        message: `Fact lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        facts: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

/**
 * Get timeline information for events related to entities or documents
 */
export const getTimelineTool = tool({
  description: 'Get chronological timeline information about events related to people, organizations, products, patents, or papers. Use this for questions about "when did X happen" or historical sequences.',
  parameters: z.object({
    entityName: z.string().optional().describe('Name of the entity to get timeline for (person, org, product, etc.)'),
    topic: z.string().optional().describe('Topic or subject area to get timeline for if no specific entity'),
    dateRange: z.object({
      start: z.string().optional().describe('Start date in ISO format (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date in ISO format (YYYY-MM-DD)')
    }).optional().describe('Filter events by date range'),
    eventTypes: z.array(z.enum(['filed', 'published', 'granted', 'expires', 'product_launch', 'acquired', 'founded'])).optional().describe('Filter by specific event types'),
  }),
  execute: async ({ entityName, topic, dateRange, eventTypes }) => {
    try {
      let query = supabase
        .from('events')
        .select(`
          id,
          type,
          event_date,
          authority,
          description,
          document_id,
          entity_id,
          documents (
            title,
            doc_type,
            doi,
            arxiv_id,
            patent_no,
            url
          ),
          entities (
            name,
            kind
          )
        `)
        .order('event_date', { ascending: true });

      // Filter by entity if specified
      if (entityName) {
        const { data: entity } = await supabase
          .from('entities')
          .select('id')
          .eq('name', entityName)
          .single();

        if (entity) {
          query = query.eq('entity_id', entity.id);
        }
      }

      // Filter by date range
      if (dateRange) {
        if (dateRange.start) {
          query = query.gte('event_date', dateRange.start);
        }
        if (dateRange.end) {
          query = query.lte('event_date', dateRange.end);
        }
      }

      // Filter by event types
      if (eventTypes && eventTypes.length > 0) {
        query = query.in('type', eventTypes);
      }

      const { data: events, error } = await query.limit(50);

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        const searchTerm = entityName || topic || 'requested criteria';
        return {
          success: true,
          message: `No timeline events found for ${searchTerm}`,
          events: [],
          totalCount: 0
        };
      }

      // Format events for response
      const formattedEvents = events.map((event, index) => ({
        date: event.event_date,
        type: event.type,
        description: event.description || `${event.type} event`,
        entity: event.entities?.name,
        entityType: event.entities?.kind,
        document: event.documents?.title,
        documentType: event.documents?.doc_type,
        authority: event.authority,
        citation: `[T${index + 1}]`
      }));

      // Group events by year for better presentation
      const eventsByYear = formattedEvents.reduce((acc, event) => {
        const year = new Date(event.date).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(event);
        return acc;
      }, {} as Record<number, any[]>);

      return {
        success: true,
        message: `Found ${formattedEvents.length} timeline events`,
        events: formattedEvents,
        eventsByYear,
        totalCount: formattedEvents.length,
        dateRange: {
          earliest: events[0]?.event_date,
          latest: events[events.length - 1]?.event_date
        }
      };

    } catch (error) {
      console.error('Timeline lookup error:', error);
      return {
        success: false,
        message: `Timeline lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        events: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
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
  const timelineMatches = timelinePatterns.filter(pattern => pattern.test(normalizedQuery)).length;
  if (timelineMatches >= 2) {
    return {
      primaryTool: 'get_timeline',
      confidence: 0.8,
      reasoning: 'Query contains multiple temporal indicators suggesting timeline lookup'
    };
  }

  // Check for fact lookup patterns
  const factMatches = factPatterns.filter(pattern => pattern.test(normalizedQuery)).length;
  if (factMatches >= 1) {
    return {
      primaryTool: 'lookup_facts',
      confidence: 0.7,
      reasoning: 'Query appears to be asking for specific facts about an entity'
    };
  }

  // Default to general corpus search
  return {
    primaryTool: 'search_corpus',
    confidence: 0.6,
    reasoning: 'General information query - using hybrid search across corpus'
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
      'Try using broader search terms',
      'Check if the topic is covered in the corpus',
      'Ask about related concepts or entities'
    ];
  }

  const suggestions: string[] = [];

  // Extract entities and concepts from results
  const commonTerms = extractCommonTerms(results);
  
  // Generate entity-based suggestions
  commonTerms.entities.slice(0, 2).forEach(entity => {
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
  
  const allText = results.map(r => r.content + ' ' + r.title).join(' ');
  
  // Extract capitalized words as potential entities
  const capitalizedWords = allText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const entities = [...new Set(capitalizedWords)]
    .filter(word => word.length > 2)
    .slice(0, 5);

  // Extract years as dates
  const years = allText.match(/\b(19|20)\d{2}\b/g) || [];
  const dates = [...new Set(years)];

  // Extract technical terms (simplified)
  const technicalWords = allText.match(/\b[a-z]+(?:ing|tion|ment|ness|ity)\b/g) || [];
  const concepts = [...new Set(technicalWords)]
    .filter(word => word.length > 4)
    .slice(0, 3);

  return { entities, dates, concepts };
}