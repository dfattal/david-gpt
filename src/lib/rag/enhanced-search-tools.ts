/**
 * Enhanced RAG Search Tools with Knowledge Graph Integration
 *
 * Extended tools that integrate with Vercel AI SDK's tool calling system
 * to provide KG-enhanced search, entity-aware queries, and specialized search patterns.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { kgEnhancedSearchEngine } from './kg-enhanced-search';
import {
  searchAuthorAdvanced,
  searchTechnologyAdvanced,
  searchTimeline,
  searchPatentsAdvanced,
} from './specialized-search';
import type { KGSearchQuery, EntityKind, EventType } from './types';

// =======================
// Enhanced Search Tools
// =======================

/**
 * Enhanced corpus search with KG capabilities
 */
export const enhancedSearchCorpusTool = tool({
  description: `
    Enhanced search through the document corpus with knowledge graph capabilities.
    Provides entity recognition, query expansion, authority boosting, and smart disambiguation.
    Use this for complex queries that benefit from understanding entities and relationships.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .describe('The search query - what you want to find information about'),
    limit: z
      .number()
      .default(10)
      .describe('Maximum number of results to return (default: 10)'),
    documentTypes: z
      .array(z.enum(['pdf', 'paper', 'patent', 'note', 'url', 'book']))
      .optional()
      .describe('Filter by document types'),
    expandEntities: z
      .boolean()
      .default(true)
      .describe('Whether to expand query with related entities and aliases'),
    authorityBoost: z
      .boolean()
      .default(true)
      .describe('Whether to boost results by entity authority scores'),
    disambiguate: z
      .boolean()
      .default(true)
      .describe('Whether to disambiguate entity names in the query'),
    entityFocus: z
      .string()
      .optional()
      .describe(
        'Focus search on a specific entity (person, organization, technology, etc.)'
      ),
    dateRange: z
      .object({
        start: z
          .string()
          .optional()
          .describe('Start date in ISO format (YYYY-MM-DD)'),
        end: z
          .string()
          .optional()
          .describe('End date in ISO format (YYYY-MM-DD)'),
      })
      .optional()
      .describe('Filter by date range'),
    responseMode: z
      .enum(['FACT', 'EXPLAIN', 'CONFLICTS'])
      .default('EXPLAIN')
      .describe('How to structure the response'),
  }),
  execute: async ({
    query,
    limit = 10,
    documentTypes,
    expandEntities = true,
    authorityBoost = true,
    disambiguate = true,
    entityFocus,
    dateRange,
    responseMode = 'EXPLAIN',
  }) => {
    try {
      console.log(`🧠 Enhanced KG search called with query: "${query}"`);

      // Authentication check
      const supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return {
          success: false,
          message: 'Authentication required for corpus search',
          results: [],
          totalCount: 0,
        };
      }

      // Build KG search query
      const kgQuery: KGSearchQuery = {
        query,
        limit,
        expandEntities,
        authorityBoost,
        disambiguate,
        entityFocus,
        filters: {
          documentTypes,
          dateRange: dateRange
            ? {
                start: dateRange.start ? new Date(dateRange.start) : undefined,
                end: dateRange.end ? new Date(dateRange.end) : undefined,
              }
            : undefined,
        },
      };

      // Execute KG-enhanced search
      const result = await kgEnhancedSearchEngine.kgSearch(kgQuery);

      // Format results for AI consumption
      const formattedResults = result.results.map((res, index) => ({
        id: `${index + 1}`,
        title: res.title,
        content:
          res.content.substring(0, 800) +
          (res.content.length > 800 ? '...' : ''),
        docType: res.docType,
        score: res.score,
        citation: `[${index + 1}] ${res.title}${res.pageRange ? ` (${res.pageRange})` : ''}`,
        metadata: {
          documentId: res.documentId,
          pageRange: res.pageRange,
          sectionTitle: res.sectionTitle,
          rerankedScore: res.rerankedScore,
        },
      }));

      // Add KG enhancement information
      const enhancementInfo: any = {};

      if (result.expandedEntities && result.expandedEntities.length > 0) {
        enhancementInfo.expandedEntities = result.expandedEntities.map(e => ({
          name: e.name,
          type: e.kind,
          authorityScore: e.authority_score,
        }));
      }

      if (result.disambiguatedTerms && result.disambiguatedTerms.length > 0) {
        enhancementInfo.disambiguatedTerms = result.disambiguatedTerms.map(
          dt => ({
            original: dt.original,
            resolved: dt.resolved.name,
            type: dt.resolved.kind,
          })
        );
      }

      if (result.authorityBoosts && result.authorityBoosts.length > 0) {
        enhancementInfo.authorityBoosts = result.authorityBoosts.slice(0, 5);
      }

      return {
        success: true,
        results: formattedResults,
        totalCount: result.totalCount,
        executionTime: result.executionTime,
        responseMode,
        enhancementInfo,
        message: `Found ${formattedResults.length} documents using KG-enhanced search${
          enhancementInfo.expandedEntities
            ? ` (expanded with ${enhancementInfo.expandedEntities.length} entities)`
            : ''
        }`,
      };
    } catch (error) {
      console.error('Enhanced search corpus error:', error);
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: [],
        totalCount: 0,
      };
    }
  },
});

/**
 * Search by author with advanced capabilities
 */
export const searchByAuthorTool = tool({
  description: `
    Search for documents by a specific author with advanced capabilities.
    Finds all works by the author, their collaborators, affiliations, and provides timeline context.
    Use when the user asks about a specific person's work or contributions.
  `,
  inputSchema: z.object({
    authorName: z.string().describe('Name of the author to search for'),
    includeAffiliations: z
      .boolean()
      .default(true)
      .describe("Whether to include author's affiliations and collaborators"),
    timeRange: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
      })
      .optional()
      .describe('Filter by publication date range'),
    documentTypes: z
      .array(z.string())
      .optional()
      .describe('Filter by document types'),
    limit: z
      .number()
      .default(20)
      .describe('Maximum number of results to return'),
  }),
  execute: async ({
    authorName,
    includeAffiliations = true,
    timeRange,
    documentTypes,
    limit = 20,
  }) => {
    try {
      console.log(`👤 Author search for: "${authorName}"`);

      const result = await searchAuthorAdvanced(authorName, {
        includeAffiliations,
        timeRange: timeRange
          ? {
              start: timeRange.start ? new Date(timeRange.start) : undefined,
              end: timeRange.end ? new Date(timeRange.end) : undefined,
            }
          : undefined,
        documentTypes,
        limit,
      });

      const response: any = {
        success: true,
        authorFound: !!result.author,
        documents: result.documents.map((doc, index) => ({
          id: `${index + 1}`,
          title: doc.title,
          content:
            doc.content.substring(0, 500) +
            (doc.content.length > 500 ? '...' : ''),
          docType: doc.docType,
          score: doc.score,
          citation: `[${index + 1}] ${doc.title}`,
        })),
        totalCount: result.documents.length,
      };

      if (result.author) {
        response.authorInfo = {
          name: result.author.entity.name,
          authorityScore: result.author.authorityScore,
          mentionCount: result.author.mentionCount,
          aliases: result.author.aliases,
        };
      }

      if (result.collaborators && result.collaborators.length > 0) {
        response.collaborators = result.collaborators.slice(0, 5).map(c => ({
          name: c.entity.name,
          authorityScore: c.authorityScore,
        }));
      }

      if (result.affiliations && result.affiliations.length > 0) {
        response.affiliations = result.affiliations.map(a => ({
          name: a.entity.name,
          type: a.entity.kind,
        }));
      }

      return response;
    } catch (error) {
      console.error('Author search error:', error);
      return {
        success: false,
        message: `Author search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        documents: [],
        totalCount: 0,
      };
    }
  },
});

/**
 * Search by technology or algorithm
 */
export const searchByTechnologyTool = tool({
  description: `
    Search for documents related to a specific technology, algorithm, or technical concept.
    Finds papers, patents, and implementations related to the technology with context about
    its development, applications, and related technologies.
  `,
  inputSchema: z.object({
    technologyName: z
      .string()
      .describe('Name of the technology, algorithm, or technical concept'),
    includeImplementations: z
      .boolean()
      .default(true)
      .describe(
        'Whether to include products/systems that implement this technology'
      ),
    includeRelatedTech: z
      .boolean()
      .default(true)
      .describe('Whether to include related or similar technologies'),
    limit: z
      .number()
      .default(20)
      .describe('Maximum number of results to return'),
  }),
  execute: async ({
    technologyName,
    includeImplementations = true,
    includeRelatedTech = true,
    limit = 20,
  }) => {
    try {
      console.log(`⚡ Technology search for: "${technologyName}"`);

      const result = await searchTechnologyAdvanced(technologyName, {
        includeImplementations,
        includeRelatedTech,
        limit,
      });

      const response: any = {
        success: true,
        technologyFound: !!result.technology,
        documents: result.documents.map((doc, index) => ({
          id: `${index + 1}`,
          title: doc.title,
          content:
            doc.content.substring(0, 500) +
            (doc.content.length > 500 ? '...' : ''),
          docType: doc.docType,
          score: doc.score,
          citation: `[${index + 1}] ${doc.title}`,
        })),
        totalCount: result.documents.length,
      };

      if (result.technology) {
        response.technologyInfo = {
          name: result.technology.entity.name,
          type: result.technology.entity.kind,
          authorityScore: result.technology.authorityScore,
          mentionCount: result.technology.mentionCount,
          description: result.technology.entity.description,
        };
      }

      if (result.implementations && result.implementations.length > 0) {
        response.implementations = result.implementations.map(impl => ({
          name: impl.entity.name,
          type: impl.entity.kind,
          authorityScore: impl.authorityScore,
        }));
      }

      if (result.relatedTechnologies && result.relatedTechnologies.length > 0) {
        response.relatedTechnologies = result.relatedTechnologies.map(tech => ({
          name: tech.entity.name,
          authorityScore: tech.authorityScore,
        }));
      }

      return response;
    } catch (error) {
      console.error('Technology search error:', error);
      return {
        success: false,
        message: `Technology search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        documents: [],
        totalCount: 0,
      };
    }
  },
});

/**
 * Timeline search for events and developments
 */
export const getTimelineTool = tool({
  description: `
    Get timeline of events, publications, patents, and developments related to a topic or entity.
    Useful for understanding the chronological development of technologies, author publication history,
    or organizational milestones. Provides dates, context, and authoritative sources.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .describe('The topic, entity, or subject to get timeline for'),
    entityFocus: z
      .string()
      .optional()
      .describe(
        'Focus timeline on a specific entity (person, organization, technology)'
      ),
    timeRange: z
      .object({
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      })
      .optional()
      .describe('Filter events to specific time range'),
    eventTypes: z
      .array(
        z.enum([
          'filed',
          'published',
          'granted',
          'expires',
          'product_launch',
          'acquired',
          'founded',
        ])
      )
      .optional()
      .describe('Filter by specific event types'),
    groupByYear: z
      .boolean()
      .default(true)
      .describe('Whether to group events by year'),
    limit: z
      .number()
      .default(30)
      .describe('Maximum number of events to return'),
  }),
  execute: async ({
    query,
    entityFocus,
    timeRange,
    eventTypes,
    groupByYear = true,
    limit = 30,
  }) => {
    try {
      console.log(`📅 Timeline search for: "${query}"`);

      const result = await searchTimeline(query, {
        entityFocus,
        timeRange: timeRange
          ? {
              start: timeRange.start ? new Date(timeRange.start) : undefined,
              end: timeRange.end ? new Date(timeRange.end) : undefined,
            }
          : undefined,
        eventTypes: eventTypes as EventType[],
        groupByYear,
        includeContext: true,
        limit,
      });

      const events = result.events.map((event, index) => ({
        id: `${index + 1}`,
        type: event.event.type,
        date: event.event.date.toISOString().split('T')[0],
        description: event.event.description,
        authority: event.event.authority,
        entity: event.entity
          ? {
              name: event.entity.name,
              type: event.entity.kind,
            }
          : undefined,
        document: event.document
          ? {
              title: event.document.title,
              docType: event.document.docType,
            }
          : undefined,
      }));

      const response: any = {
        success: true,
        events,
        totalCount: events.length,
        timelineQuery: query,
      };

      if (result.yearGroups && groupByYear) {
        response.yearGroups = Object.entries(result.yearGroups).map(
          ([year, yearEvents]) => ({
            year: parseInt(year),
            eventCount: yearEvents.length,
            events: yearEvents.slice(0, 10).map(e => ({
              type: e.event.type,
              date: e.event.date.toISOString().split('T')[0],
              description: e.event.description,
            })),
          })
        );
      }

      if (result.entities) {
        response.relatedEntities = result.entities.slice(0, 5).map(e => ({
          name: e.entity.name,
          type: e.entity.kind,
          authorityScore: e.authorityScore,
        }));
      }

      return response;
    } catch (error) {
      console.error('Timeline search error:', error);
      return {
        success: false,
        message: `Timeline search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        events: [],
        totalCount: 0,
      };
    }
  },
});

/**
 * Advanced patent search
 */
export const searchPatentsTool = tool({
  description: `
    Advanced patent search with legal status, inventor/assignee information, and classification.
    Provides comprehensive patent information including filing dates, legal status, and relationships.
    Use when users ask about patents, inventions, or intellectual property.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Patent search query (technology, inventor, assignee, or patent concept)'
      ),
    includeExpired: z
      .boolean()
      .default(false)
      .describe('Whether to include expired patents'),
    assigneeFilter: z
      .string()
      .optional()
      .describe('Filter by specific assignee/company'),
    filingDateRange: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
      })
      .optional()
      .describe('Filter by filing date range'),
    limit: z
      .number()
      .default(15)
      .describe('Maximum number of patents to return'),
  }),
  execute: async ({
    query,
    includeExpired = false,
    assigneeFilter,
    filingDateRange,
    limit = 15,
  }) => {
    try {
      console.log(`📜 Patent search for: "${query}"`);

      const result = await searchPatentsAdvanced(query, {
        includeExpired,
        assigneeFilter,
        filingDateRange: filingDateRange
          ? {
              start: filingDateRange.start
                ? new Date(filingDateRange.start)
                : undefined,
              end: filingDateRange.end
                ? new Date(filingDateRange.end)
                : undefined,
            }
          : undefined,
        limit,
      });

      const patents = result.patents.map((patent, index) => ({
        id: `${index + 1}`,
        title: patent.title,
        content:
          patent.content.substring(0, 600) +
          (patent.content.length > 600 ? '...' : ''),
        patentNumber: patent.metadata?.patentNo || 'Unknown',
        status: patent.metadata?.status || 'Unknown',
        filedDate: patent.metadata?.filedDate || 'Unknown',
        assignee: assigneeFilter || 'Multiple/Unknown',
        citation: `[${index + 1}] ${patent.title} (Patent ${patent.metadata?.patentNo || 'Unknown'})`,
        score: patent.score,
      }));

      const response: any = {
        success: true,
        patents,
        totalCount: patents.length,
        searchQuery: query,
      };

      if (result.inventors && result.inventors.length > 0) {
        response.topInventors = result.inventors.slice(0, 5).map(inv => ({
          name: inv.entity.name,
          authorityScore: inv.authorityScore,
          mentionCount: inv.mentionCount,
        }));
      }

      if (result.assignees && result.assignees.length > 0) {
        response.topAssignees = result.assignees.slice(0, 5).map(ass => ({
          name: ass.entity.name,
          type: ass.entity.kind,
          authorityScore: ass.authorityScore,
        }));
      }

      if (result.classifications) {
        response.classifications = result.classifications.slice(0, 10);
      }

      return response;
    } catch (error) {
      console.error('Patent search error:', error);
      return {
        success: false,
        message: `Patent search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        patents: [],
        totalCount: 0,
      };
    }
  },
});

// =======================
// Export Enhanced Tools
// =======================

export const enhancedRagTools = {
  enhancedSearchCorpus: enhancedSearchCorpusTool,
  searchByAuthor: searchByAuthorTool,
  searchByTechnology: searchByTechnologyTool,
  getTimeline: getTimelineTool,
  searchPatents: searchPatentsTool,
};
