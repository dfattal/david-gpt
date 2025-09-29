/**
 * Knowledge Graph Enhanced Search System
 * 
 * Enhances the hybrid search with knowledge graph capabilities:
 * - Entity-based query expansion
 * - Authority-based result boosting
 * - Timeline and relationship queries
 * - Smart disambiguation
 */

import { supabaseAdmin } from '@/lib/supabase';
import { HybridSearchEngine } from './hybrid-search';
import type { 
  SearchQuery, 
  SearchResult, 
  HybridSearchResult,
  SearchFilters,
  Entity,
  EntityKind,
  KnowledgeEdge,
  RelationType,
  EventType
} from './types';

// =======================
// KG-Enhanced Search Types
// =======================

export interface KGSearchQuery extends SearchQuery {
  entityFocus?: string; // Focus on specific entity
  relationshipType?: RelationType; // Focus on specific relationship
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  expandEntities?: boolean; // Whether to expand query with related entities
  authorityBoost?: boolean; // Whether to boost results by authority scores
  disambiguate?: boolean; // Whether to disambiguate entity names
}

export interface EntitySearchResult {
  entity: Entity;
  aliases: string[];
  documents: SearchResult[];
  relationships: KnowledgeEdge[];
  authorityScore: number;
  mentionCount: number;
}

export interface TimelineResult {
  event: {
    type: EventType;
    date: Date;
    description: string;
    authority: string;
  };
  entity?: Entity;
  document?: SearchResult;
}

// =======================
// KG Enhanced Search Engine
// =======================

export class KGEnhancedSearchEngine extends HybridSearchEngine {
  
  /**
   * Enhanced search with knowledge graph capabilities
   */
  async kgSearch(query: KGSearchQuery): Promise<HybridSearchResult & {
    expandedEntities?: Entity[];
    disambiguatedTerms?: Array<{ original: string; resolved: Entity }>;
    authorityBoosts?: Array<{ documentId: string; boost: number; reason: string }>;
  }> {
    console.log(`🧠 KG-enhanced search for: "${query.query}"`);
    
    try {
      // Phase 1: Entity recognition and disambiguation
      const recognizedEntities = await this.recognizeEntities(query.query);
      const disambiguatedTerms = query.disambiguate 
        ? await this.disambiguateEntities(recognizedEntities)
        : [];
      
      // Phase 2: Query expansion based on entities
      const expandedQuery = query.expandEntities 
        ? await this.expandQueryWithEntities(query, recognizedEntities)
        : query;
      
      // Phase 3: Execute hybrid search
      const baseResults = await super.search(expandedQuery);
      
      // Phase 4: Apply knowledge graph enhancements
      const enhancedResults = await this.applyKGEnhancements(
        baseResults.results,
        query,
        recognizedEntities
      );
      
      // Phase 5: Authority-based boosting
      const authorityBoosts = query.authorityBoost
        ? await this.applyAuthorityBoosts(enhancedResults, recognizedEntities)
        : [];
      
      // Re-sort results based on enhanced scores
      const finalResults = this.sortEnhancedResults(enhancedResults, authorityBoosts);
      
      return {
        ...baseResults,
        results: finalResults,
        expandedEntities: recognizedEntities,
        disambiguatedTerms,
        authorityBoosts
      };
      
    } catch (error) {
      console.error('KG-enhanced search error:', error);
      // Fallback to regular hybrid search
      return super.search(query);
    }
  }
  
  /**
   * Search for entities by name with fuzzy matching
   */
  async searchEntities(
    entityName: string, 
    entityType?: EntityKind,
    limit = 10
  ): Promise<EntitySearchResult[]> {
    console.log(`🔍 Searching entities: "${entityName}" (type: ${entityType || 'any'})`);
    
    try {
      // Build entity query
      let entityQuery = supabaseAdmin
        .from('entities')
        .select(`
          *,
          aliases (alias, confidence)
        `)
        .limit(limit);
      
      if (entityType) {
        entityQuery = entityQuery.eq('kind', entityType);
      }
      
      // Search by name and aliases
      const [nameResults, aliasResults] = await Promise.all([
        entityQuery.ilike('name', `%${entityName}%`),
        supabaseAdmin
          .from('aliases')
          .select(`
            *,
            entities (*)
          `)
          .ilike('alias', `%${entityName}%`)
          .limit(limit)
      ]);
      
      // Combine and deduplicate results
      const entities = new Map<string, Entity>();
      
      // Add direct name matches
      nameResults.data?.forEach(entity => {
        entities.set(entity.id, entity);
      });
      
      // Add alias matches
      aliasResults.data?.forEach(alias => {
        if (alias.entities) {
          entities.set(alias.entities.id, alias.entities as Entity);
        }
      });
      
      // Get documents and relationships for each entity
      const entitySearchResults: EntitySearchResult[] = [];
      
      for (const entity of entities.values()) {
        const [documents, relationships] = await Promise.all([
          this.getEntityDocuments(entity.id),
          this.getEntityRelationships(entity.id)
        ]);
        
        const aliases = nameResults.data?.find(e => e.id === entity.id)?.aliases?.map(a => a.alias) || [];
        
        entitySearchResults.push({
          entity,
          aliases,
          documents,
          relationships,
          authorityScore: entity.authority_score,
          mentionCount: entity.mention_count
        });
      }
      
      // Sort by authority score and relevance
      return entitySearchResults.sort((a, b) => {
        // Primary sort: authority score
        if (b.authorityScore !== a.authorityScore) {
          return b.authorityScore - a.authorityScore;
        }
        // Secondary sort: mention count
        return b.mentionCount - a.mentionCount;
      });
      
    } catch (error) {
      console.error('Entity search error:', error);
      return [];
    }
  }
  
  /**
   * Get timeline events for entities or topics
   */
  async getTimeline(
    query: string,
    entityId?: string,
    timeRange?: { start?: Date; end?: Date },
    eventTypes?: EventType[],
    limit = 20
  ): Promise<TimelineResult[]> {
    console.log(`📅 Getting timeline for: "${query}"`);
    
    try {
      let eventsQuery = supabaseAdmin
        .from('events')
        .select(`
          *,
          entities (*),
          documents (*)
        `)
        .order('event_date', { ascending: false })
        .limit(limit);
      
      // Apply filters
      if (entityId) {
        eventsQuery = eventsQuery.eq('entity_id', entityId);
      }
      
      if (timeRange?.start) {
        eventsQuery = eventsQuery.gte('event_date', timeRange.start.toISOString().split('T')[0]);
      }
      
      if (timeRange?.end) {
        eventsQuery = eventsQuery.lte('event_date', timeRange.end.toISOString().split('T')[0]);
      }
      
      if (eventTypes && eventTypes.length > 0) {
        eventsQuery = eventsQuery.in('type', eventTypes);
      }
      
      const { data: events } = await eventsQuery;
      
      if (!events) return [];
      
      // Convert to timeline results
      const timelineResults: TimelineResult[] = [];
      
      for (const event of events) {
        // Get associated document if available
        let document: SearchResult | undefined;
        if (event.document_id) {
          const docResults = await this.getDocumentSearchResult(event.document_id);
          document = docResults[0];
        }
        
        timelineResults.push({
          event: {
            type: event.type,
            date: new Date(event.event_date),
            description: event.description || `${event.type} event`,
            authority: event.authority || 'Unknown'
          },
          entity: event.entities as Entity,
          document
        });
      }
      
      return timelineResults;
      
    } catch (error) {
      console.error('Timeline query error:', error);
      return [];
    }
  }
  
  /**
   * Find documents by author name
   */
  async searchByAuthor(authorName: string, limit = 20): Promise<SearchResult[]> {
    console.log(`👤 Searching by author: "${authorName}"`);
    
    try {
      // Find author entity
      const authorEntities = await this.searchEntities(authorName, 'person', 3);
      
      if (authorEntities.length === 0) {
        console.log('No author entities found, falling back to text search');
        return this.searchByText(`author:${authorName}`, limit);
      }
      
      // Get documents for the top author match
      const bestAuthor = authorEntities[0];
      return bestAuthor.documents.slice(0, limit);
      
    } catch (error) {
      console.error('Author search error:', error);
      return [];
    }
  }
  
  /**
   * Find documents by organization
   */
  async searchByOrganization(orgName: string, limit = 20): Promise<SearchResult[]> {
    console.log(`🏢 Searching by organization: "${orgName}"`);
    
    try {
      const orgEntities = await this.searchEntities(orgName, 'org', 3);
      
      if (orgEntities.length === 0) {
        return this.searchByText(`organization:${orgName}`, limit);
      }
      
      const bestOrg = orgEntities[0];
      return bestOrg.documents.slice(0, limit);
      
    } catch (error) {
      console.error('Organization search error:', error);
      return [];
    }
  }
  
  /**
   * Find documents by technology or algorithm
   */
  async searchByTechnology(techName: string, limit = 20): Promise<SearchResult[]> {
    console.log(`⚡ Searching by technology: "${techName}"`);
    
    try {
      const techEntities = await this.searchEntities(techName, 'algorithm', 5);
      
      if (techEntities.length === 0) {
        return this.searchByText(techName, limit);
      }
      
      // Combine documents from all relevant technology entities
      const allDocuments: SearchResult[] = [];
      for (const tech of techEntities.slice(0, 3)) {
        allDocuments.push(...tech.documents);
      }
      
      // Sort by score and deduplicate
      const uniqueDocs = new Map<string, SearchResult>();
      allDocuments.forEach(doc => {
        const existing = uniqueDocs.get(doc.documentId);
        if (!existing || doc.score > existing.score) {
          uniqueDocs.set(doc.documentId, doc);
        }
      });
      
      return Array.from(uniqueDocs.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Technology search error:', error);
      return [];
    }
  }
  
  // ===== Private Helper Methods =====
  
  /**
   * Recognize entities in query text
   */
  private async recognizeEntities(queryText: string): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    // Simple entity recognition - look for capitalized words and phrases
    const potentialEntities = queryText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    
    for (const entityName of potentialEntities.slice(0, 5)) {
      const entityResults = await this.searchEntities(entityName, undefined, 1);
      if (entityResults.length > 0) {
        entities.push(entityResults[0].entity);
      }
    }
    
    return entities;
  }
  
  /**
   * Disambiguate entity names using aliases and context
   */
  private async disambiguateEntities(
    entities: Entity[]
  ): Promise<Array<{ original: string; resolved: Entity }>> {
    const disambiguated: Array<{ original: string; resolved: Entity }> = [];
    
    // For now, return the highest authority entity for each name
    for (const entity of entities) {
      disambiguated.push({
        original: entity.name,
        resolved: entity
      });
    }
    
    return disambiguated;
  }
  
  /**
   * Expand query with related entities
   */
  private async expandQueryWithEntities(
    query: KGSearchQuery,
    entities: Entity[]
  ): Promise<SearchQuery> {
    if (entities.length === 0) return query;
    
    // Add entity names and aliases to the query
    const expansionTerms: string[] = [];
    
    for (const entity of entities.slice(0, 3)) {
      expansionTerms.push(entity.name);
      
      // Add aliases
      const { data: aliases } = await supabaseAdmin
        .from('aliases')
        .select('alias')
        .eq('entity_id', entity.id)
        .gte('confidence', 0.7);
      
      if (aliases) {
        expansionTerms.push(...aliases.map(a => a.alias));
      }
    }
    
    // Combine original query with expansion terms
    const expandedQueryText = [query.query, ...expansionTerms.slice(0, 5)].join(' OR ');
    
    return {
      ...query,
      query: expandedQueryText
    };
  }
  
  /**
   * Apply knowledge graph enhancements to search results
   */
  private async applyKGEnhancements(
    results: SearchResult[],
    query: KGSearchQuery,
    entities: Entity[]
  ): Promise<SearchResult[]> {
    // For now, return results as-is
    // Future enhancements could include:
    // - Relationship-based filtering
    // - Entity-document matching
    // - Contextual relevance scoring
    return results;
  }
  
  /**
   * Apply authority-based boosting to search results
   */
  private async applyAuthorityBoosts(
    results: SearchResult[],
    entities: Entity[]
  ): Promise<Array<{ documentId: string; boost: number; reason: string }>> {
    const boosts: Array<{ documentId: string; boost: number; reason: string }> = [];
    
    // Boost documents that mention high-authority entities
    for (const result of results) {
      for (const entity of entities) {
        if (entity.authority_score > 0.8) {
          const boost = entity.authority_score * 0.2; // Max 20% boost
          boosts.push({
            documentId: result.documentId,
            boost,
            reason: `High authority entity: ${entity.name} (${entity.authority_score.toFixed(2)})`
          });
        }
      }
    }
    
    return boosts;
  }
  
  /**
   * Sort results with enhanced scores
   */
  private sortEnhancedResults(
    results: SearchResult[],
    authorityBoosts: Array<{ documentId: string; boost: number; reason: string }>
  ): SearchResult[] {
    const boostMap = new Map<string, number>();
    authorityBoosts.forEach(boost => {
      const existing = boostMap.get(boost.documentId) || 0;
      boostMap.set(boost.documentId, existing + boost.boost);
    });
    
    return results.map(result => ({
      ...result,
      score: result.score * (1 + (boostMap.get(result.documentId) || 0))
    })).sort((a, b) => b.score - a.score);
  }
  
  /**
   * Get documents associated with an entity
   */
  private async getEntityDocuments(entityId: string): Promise<SearchResult[]> {
    try {
      // Get documents through relationship edges
      const { data: edges } = await supabaseAdmin
        .from('edges')
        .select(`
          dst_id,
          documents!edges_evidence_doc_id_fkey (
            id,
            title,
            doc_type,
            doi,
            patent_no,
            url
          )
        `)
        .eq('src_id', entityId)
        .eq('dst_type', 'document');
      
      const documents: SearchResult[] = [];
      
      if (edges) {
        for (const edge of edges) {
          if (edge.documents) {
            documents.push({
              documentId: edge.documents.id,
              score: 0.8, // Base score for entity-document relationships
              content: '', // Would be populated with actual content if needed
              title: edge.documents.title,
              docType: edge.documents.doc_type,
              metadata: edge.documents as any
            });
          }
        }
      }
      
      return documents;
      
    } catch (error) {
      console.error('Error getting entity documents:', error);
      return [];
    }
  }
  
  /**
   * Get relationships for an entity
   */
  private async getEntityRelationships(entityId: string): Promise<KnowledgeEdge[]> {
    try {
      const { data: relationships } = await supabaseAdmin
        .from('edges')
        .select('*')
        .or(`src_id.eq.${entityId},dst_id.eq.${entityId}`)
        .limit(50);
      
      return relationships || [];
      
    } catch (error) {
      console.error('Error getting entity relationships:', error);
      return [];
    }
  }
  
  /**
   * Get search result for a document ID
   */
  private async getDocumentSearchResult(documentId: string): Promise<SearchResult[]> {
    try {
      const { data: document } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (!document) return [];
      
      return [{
        documentId: document.id,
        score: 1.0,
        content: '',
        title: document.title,
        docType: document.doc_type,
        metadata: document as any
      }];
      
    } catch (error) {
      console.error('Error getting document search result:', error);
      return [];
    }
  }
  
  /**
   * Simple text search fallback
   */
  private async searchByText(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const result = await super.search({ query, limit });
      return result.results;
    } catch (error) {
      console.error('Text search fallback error:', error);
      return [];
    }
  }
}

// =======================
// Export Functions
// =======================

export const kgEnhancedSearchEngine = new KGEnhancedSearchEngine();

/**
 * Knowledge graph enhanced search
 */
export async function kgSearch(query: KGSearchQuery): Promise<HybridSearchResult> {
  return kgEnhancedSearchEngine.kgSearch(query);
}

/**
 * Search for entities
 */
export async function searchEntities(
  entityName: string, 
  entityType?: EntityKind,
  limit = 10
): Promise<EntitySearchResult[]> {
  return kgEnhancedSearchEngine.searchEntities(entityName, entityType, limit);
}

/**
 * Get timeline events
 */
export async function getTimeline(
  query: string,
  options?: {
    entityId?: string;
    timeRange?: { start?: Date; end?: Date };
    eventTypes?: EventType[];
    limit?: number;
  }
): Promise<TimelineResult[]> {
  return kgEnhancedSearchEngine.getTimeline(
    query,
    options?.entityId,
    options?.timeRange,
    options?.eventTypes,
    options?.limit
  );
}

/**
 * Search by author
 */
export async function searchByAuthor(authorName: string, limit = 20): Promise<SearchResult[]> {
  return kgEnhancedSearchEngine.searchByAuthor(authorName, limit);
}

/**
 * Search by organization
 */
export async function searchByOrganization(orgName: string, limit = 20): Promise<SearchResult[]> {
  return kgEnhancedSearchEngine.searchByOrganization(orgName, limit);
}

/**
 * Search by technology/algorithm
 */
export async function searchByTechnology(techName: string, limit = 20): Promise<SearchResult[]> {
  return kgEnhancedSearchEngine.searchByTechnology(techName, limit);
}