/**
 * Specialized Search Functions
 * 
 * Provides specialized search functions for authors, technologies, timeline queries,
 * and other domain-specific search patterns that leverage the mini knowledge graph.
 */

import { kgEnhancedSearchEngine } from './kg-enhanced-search';
import { supabaseAdmin } from '@/lib/supabase';
import type { 
  SearchResult,
  EntitySearchResult,
  TimelineResult,
  EntityKind,
  EventType,
  KGSearchQuery
} from './types';

// =======================
// Specialized Search Types
// =======================

export interface AuthorSearchOptions {
  includeAffiliations?: boolean;
  timeRange?: { start?: Date; end?: Date };
  documentTypes?: string[];
  limit?: number;
}

export interface TechnologySearchOptions {
  includeImplementations?: boolean;
  includeRelatedTech?: boolean;
  minimumMentions?: number;
  limit?: number;
}

export interface TimelineSearchOptions {
  entityFocus?: string;
  eventTypes?: EventType[];
  timeRange?: { start?: Date; end?: Date };
  groupByYear?: boolean;
  includeContext?: boolean;
  limit?: number;
}

export interface PatentSearchOptions {
  includeExpired?: boolean;
  assigneeFilter?: string;
  classificationFilter?: string[];
  filingDateRange?: { start?: Date; end?: Date };
  limit?: number;
}

// =======================
// Author Search Functions
// =======================

/**
 * Advanced author search with affiliations and collaboration networks
 */
export async function searchAuthorAdvanced(
  authorName: string,
  options: AuthorSearchOptions = {}
): Promise<{
  author: EntitySearchResult | null;
  documents: SearchResult[];
  collaborators?: EntitySearchResult[];
  affiliations?: EntitySearchResult[];
  timeline?: TimelineResult[];
}> {
  console.log(`👤 Advanced author search: "${authorName}"`);
  
  try {
    // Find the author entity
    const authorEntities = await kgEnhancedSearchEngine.searchEntities(authorName, 'person', 3);
    const author = authorEntities[0] || null;
    
    if (!author) {
      console.log('Author not found in knowledge graph');
      return {
        author: null,
        documents: await kgEnhancedSearchEngine.searchByAuthor(authorName, options.limit || 20),
      };
    }
    
    const results: any = { author, documents: author.documents };
    
    // Get collaborators if requested
    if (options.includeAffiliations) {
      results.collaborators = await findCollaborators(author.entity.id, 5);
      results.affiliations = await findAffiliations(author.entity.id);
    }
    
    // Apply filters
    if (options.timeRange || options.documentTypes) {
      results.documents = filterDocuments(results.documents, options);
    }
    
    return results;
    
  } catch (error) {
    console.error('Advanced author search error:', error);
    return {
      author: null,
      documents: []
    };
  }
}

/**
 * Find all papers by multiple authors (co-authorship search)
 */
export async function searchByCoAuthors(
  authorNames: string[],
  options: { requireAll?: boolean; limit?: number } = {}
): Promise<SearchResult[]> {
  console.log(`👥 Co-author search: ${authorNames.join(', ')}`);
  
  try {
    const authorResults = await Promise.all(
      authorNames.map(name => kgEnhancedSearchEngine.searchEntities(name, 'person', 1))
    );
    
    const authors = authorResults
      .map(result => result[0]?.entity)
      .filter(Boolean);
    
    if (authors.length === 0) return [];
    
    // Find documents that mention multiple authors
    // This is a simplified implementation - in practice, you'd use relationship edges
    const allDocuments = new Map<string, { doc: SearchResult; authorCount: number }>();
    
    for (const author of authors) {
      const authorDocs = await kgEnhancedSearchEngine.searchByAuthor(author.name, 100);
      
      for (const doc of authorDocs) {
        const existing = allDocuments.get(doc.documentId);
        if (existing) {
          existing.authorCount++;
        } else {
          allDocuments.set(doc.documentId, { doc, authorCount: 1 });
        }
      }
    }
    
    // Filter based on requirements
    const minAuthors = options.requireAll ? authors.length : 2;
    const coAuthoredDocs = Array.from(allDocuments.values())
      .filter(item => item.authorCount >= minAuthors)
      .map(item => item.doc)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 20);
    
    return coAuthoredDocs;
    
  } catch (error) {
    console.error('Co-author search error:', error);
    return [];
  }
}

// =======================
// Technology Search Functions
// =======================

/**
 * Advanced technology search with implementations and related technologies
 */
export async function searchTechnologyAdvanced(
  technologyName: string,
  options: TechnologySearchOptions = {}
): Promise<{
  technology: EntitySearchResult | null;
  documents: SearchResult[];
  implementations?: EntitySearchResult[];
  relatedTechnologies?: EntitySearchResult[];
  usageTimeline?: TimelineResult[];
}> {
  console.log(`⚡ Advanced technology search: "${technologyName}"`);
  
  try {
    // Find the technology entity
    const techEntities = await kgEnhancedSearchEngine.searchEntities(technologyName, 'algorithm', 3);
    const technology = techEntities[0] || null;
    
    if (!technology) {
      return {
        technology: null,
        documents: await kgEnhancedSearchEngine.searchByTechnology(technologyName, options.limit || 20)
      };
    }
    
    const results: any = { technology, documents: technology.documents };
    
    // Find implementations (products that use this technology)
    if (options.includeImplementations) {
      results.implementations = await findTechnologyImplementations(technology.entity.id);
    }
    
    // Find related technologies
    if (options.includeRelatedTech) {
      results.relatedTechnologies = await findRelatedTechnologies(technology.entity.id, 5);
    }
    
    return results;
    
  } catch (error) {
    console.error('Advanced technology search error:', error);
    return {
      technology: null,
      documents: []
    };
  }
}

/**
 * Search for technology trends over time
 */
export async function searchTechnologyTrends(
  technologies: string[],
  timeRange?: { start?: Date; end?: Date }
): Promise<Array<{
  technology: string;
  timeline: TimelineResult[];
  mentionCounts: Array<{ year: number; count: number }>;
}>> {
  console.log(`📈 Technology trends search: ${technologies.join(', ')}`);
  
  const results: Array<any> = [];
  
  try {
    for (const techName of technologies) {
      const timeline = await kgEnhancedSearchEngine.getTimeline(
        techName,
        undefined,
        timeRange,
        ['product_launch', 'published'],
        50
      );
      
      // Group by year for trend analysis
      const mentionCounts = groupTimelineByYear(timeline);
      
      results.push({
        technology: techName,
        timeline,
        mentionCounts
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('Technology trends search error:', error);
    return [];
  }
}

// =======================
// Timeline Search Functions
// =======================

/**
 * Comprehensive timeline search with context
 */
export async function searchTimeline(
  query: string,
  options: TimelineSearchOptions = {}
): Promise<{
  events: TimelineResult[];
  yearGroups?: Record<number, TimelineResult[]>;
  entities?: EntitySearchResult[];
}> {
  console.log(`📅 Timeline search: "${query}"`);
  
  try {
    // Get timeline events
    const events = await kgEnhancedSearchEngine.getTimeline(
      query,
      options.entityFocus,
      options.timeRange,
      options.eventTypes,
      options.limit || 50
    );
    
    const results: any = { events };
    
    // Group by year if requested
    if (options.groupByYear) {
      results.yearGroups = groupEventsByYear(events);
    }
    
    // Include entity context if requested
    if (options.includeContext) {
      const entityNames = events
        .map(event => event.entity?.name)
        .filter(Boolean)
        .slice(0, 10);
      
      results.entities = await Promise.all(
        entityNames.map(name => kgEnhancedSearchEngine.searchEntities(name!, undefined, 1))
      ).then(results => results.map(r => r[0]).filter(Boolean));
    }
    
    return results;
    
  } catch (error) {
    console.error('Timeline search error:', error);
    return { events: [] };
  }
}

/**
 * Search for events in a specific time period
 */
export async function searchEventsByPeriod(
  startDate: Date,
  endDate: Date,
  eventTypes?: EventType[],
  entityTypes?: EntityKind[]
): Promise<TimelineResult[]> {
  console.log(`📆 Period events search: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  try {
    let query = supabaseAdmin
      .from('events')
      .select(`
        *,
        entities (*, entity_kinds(name)),
        documents (*)
      `)
      .gte('event_date', startDate.toISOString().split('T')[0])
      .lte('event_date', endDate.toISOString().split('T')[0])
      .order('event_date', { ascending: false });
    
    if (eventTypes && eventTypes.length > 0) {
      query = query.in('type', eventTypes);
    }
    
    const { data: events } = await query.limit(100);
    
    if (!events) return [];
    
    // Filter by entity types if specified
    let filteredEvents = events;
    if (entityTypes && entityTypes.length > 0) {
      filteredEvents = events.filter(event =>
        event.entities && event.entities.entity_kinds &&
        entityTypes.includes(event.entities.entity_kinds.name as EntityKind)
      );
    }
    
    return filteredEvents.map(event => ({
      event: {
        type: event.type,
        date: new Date(event.event_date),
        description: event.description || `${event.type} event`,
        authority: event.authority || 'Unknown'
      },
      entity: event.entities as any,
      document: event.documents ? {
        documentId: event.documents.id,
        score: 1.0,
        content: '',
        title: event.documents.title,
        docType: event.documents.doc_type,
        metadata: event.documents as any
      } : undefined
    }));
    
  } catch (error) {
    console.error('Period events search error:', error);
    return [];
  }
}

// =======================
// Patent Search Functions
// =======================

/**
 * Advanced patent search with legal status and classification
 */
export async function searchPatentsAdvanced(
  query: string,
  options: PatentSearchOptions = {}
): Promise<{
  patents: SearchResult[];
  inventors?: EntitySearchResult[];
  assignees?: EntitySearchResult[];
  classifications?: string[];
  timeline?: TimelineResult[];
}> {
  console.log(`📜 Advanced patent search: "${query}"`);
  
  try {
    // Basic patent search
    const searchQuery: KGSearchQuery = {
      query,
      filters: {
        documentTypes: ['patent'],
        ...(options.filingDateRange && { dateRange: options.filingDateRange })
      },
      limit: options.limit || 20
    };
    
    if (options.assigneeFilter) {
      searchQuery.query = `${query} assignee:${options.assigneeFilter}`;
    }
    
    const searchResult = await kgEnhancedSearchEngine.kgSearch(searchQuery);
    let patents = searchResult.results;
    
    // Filter out expired patents if requested
    if (!options.includeExpired) {
      patents = patents.filter(patent => 
        !patent.metadata?.status || patent.metadata.status !== 'expired'
      );
    }
    
    const results: any = { patents };
    
    // Get inventors and assignees
    const inventorNames = new Set<string>();
    const assigneeNames = new Set<string>();
    
    // Extract from patent metadata (simplified)
    for (const patent of patents) {
      // This would be enhanced with actual patent data parsing
      if (patent.content.includes('inventor')) {
        // Extract inventor names from content
      }
    }
    
    // Get entity information for inventors and assignees
    if (inventorNames.size > 0) {
      results.inventors = await Promise.all(
        Array.from(inventorNames).slice(0, 10).map(name =>
          kgEnhancedSearchEngine.searchEntities(name, 'person', 1)
        )
      ).then(results => results.map(r => r[0]).filter(Boolean));
    }
    
    return results;
    
  } catch (error) {
    console.error('Advanced patent search error:', error);
    return { patents: [] };
  }
}

// =======================
// Helper Functions
// =======================

/**
 * Find collaborators of an author
 */
async function findCollaborators(authorId: string, limit: number): Promise<EntitySearchResult[]> {
  try {
    const { data: relationships } = await supabaseAdmin
      .from('edges')
      .select(`
        dst_id,
        entities!edges_dst_id_fkey (*)
      `)
      .eq('src_id', authorId)
      .eq('rel', 'author_of')
      .limit(limit);
    
    const collaborators: EntitySearchResult[] = [];
    
    if (relationships) {
      for (const rel of relationships) {
        if (rel.entities) {
          collaborators.push({
            entity: rel.entities as any,
            aliases: [],
            documents: [],
            relationships: [],
            authorityScore: rel.entities.authority_score,
            mentionCount: rel.entities.mention_count
          });
        }
      }
    }
    
    return collaborators;
    
  } catch (error) {
    console.error('Error finding collaborators:', error);
    return [];
  }
}

/**
 * Find affiliations of an author
 */
async function findAffiliations(authorId: string): Promise<EntitySearchResult[]> {
  try {
    const { data: relationships } = await supabaseAdmin
      .from('edges')
      .select(`
        dst_id,
        entities!edges_dst_id_fkey (*, entity_kinds(name))
      `)
      .eq('src_id', authorId)
      .eq('rel', 'affiliated_with')
      .limit(10);
    
    const affiliations: EntitySearchResult[] = [];
    
    if (relationships) {
      for (const rel of relationships) {
        if (rel.entities && rel.entities.entity_kinds && rel.entities.entity_kinds.name === 'org') {
          affiliations.push({
            entity: rel.entities as any,
            aliases: [],
            documents: [],
            relationships: [],
            authorityScore: rel.entities.authority_score,
            mentionCount: rel.entities.mention_count
          });
        }
      }
    }
    
    return affiliations;
    
  } catch (error) {
    console.error('Error finding affiliations:', error);
    return [];
  }
}

/**
 * Find technology implementations
 */
async function findTechnologyImplementations(technologyId: string): Promise<EntitySearchResult[]> {
  try {
    const { data: relationships } = await supabaseAdmin
      .from('edges')
      .select(`
        dst_id,
        entities!edges_dst_id_fkey (*, entity_kinds(name))
      `)
      .eq('src_id', technologyId)
      .eq('rel', 'used_in')
      .limit(10);
    
    const implementations: EntitySearchResult[] = [];
    
    if (relationships) {
      for (const rel of relationships) {
        if (rel.entities && rel.entities.entity_kinds && rel.entities.entity_kinds.name === 'product') {
          implementations.push({
            entity: rel.entities as any,
            aliases: [],
            documents: [],
            relationships: [],
            authorityScore: rel.entities.authority_score,
            mentionCount: rel.entities.mention_count
          });
        }
      }
    }
    
    return implementations;
    
  } catch (error) {
    console.error('Error finding technology implementations:', error);
    return [];
  }
}

/**
 * Find related technologies
 */
async function findRelatedTechnologies(technologyId: string, limit: number): Promise<EntitySearchResult[]> {
  try {
    const { data: relationships } = await supabaseAdmin
      .from('edges')
      .select(`
        dst_id,
        entities!edges_dst_id_fkey (*, entity_kinds(name))
      `)
      .eq('src_id', technologyId)
      .eq('rel', 'similar_to')
      .limit(limit);
    
    const relatedTech: EntitySearchResult[] = [];
    
    if (relationships) {
      for (const rel of relationships) {
        if (rel.entities && rel.entities.entity_kinds && rel.entities.entity_kinds.name === 'algorithm') {
          relatedTech.push({
            entity: rel.entities as any,
            aliases: [],
            documents: [],
            relationships: [],
            authorityScore: rel.entities.authority_score,
            mentionCount: rel.entities.mention_count
          });
        }
      }
    }
    
    return relatedTech;
    
  } catch (error) {
    console.error('Error finding related technologies:', error);
    return [];
  }
}

/**
 * Filter documents based on criteria
 */
function filterDocuments(documents: SearchResult[], options: AuthorSearchOptions): SearchResult[] {
  let filtered = documents;
  
  if (options.documentTypes) {
    filtered = filtered.filter(doc => 
      options.documentTypes!.includes(doc.docType as string)
    );
  }
  
  if (options.timeRange) {
    filtered = filtered.filter(doc => {
      const docDate = doc.metadata?.publishedDate || doc.metadata?.createdAt;
      if (!docDate) return true;
      
      const date = new Date(docDate);
      if (options.timeRange!.start && date < options.timeRange!.start) return false;
      if (options.timeRange!.end && date > options.timeRange!.end) return false;
      
      return true;
    });
  }
  
  return filtered.slice(0, options.limit || 20);
}

/**
 * Group timeline events by year
 */
function groupTimelineByYear(timeline: TimelineResult[]): Array<{ year: number; count: number }> {
  const yearCounts = new Map<number, number>();
  
  timeline.forEach(event => {
    const year = event.event.date.getFullYear();
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  });
  
  return Array.from(yearCounts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Group events by year
 */
function groupEventsByYear(events: TimelineResult[]): Record<number, TimelineResult[]> {
  const groups: Record<number, TimelineResult[]> = {};
  
  events.forEach(event => {
    const year = event.event.date.getFullYear();
    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(event);
  });
  
  return groups;
}