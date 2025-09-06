/**
 * Relationship-Aware Search System
 * 
 * Enhances search with 1-hop relationship traversal to provide contextual information
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { Entity } from './types';

export interface RelationshipSearchResult {
  documents: Array<{
    id: string;
    title: string;
    docType: string;
    relevanceScore: number;
    relationshipContext?: Array<{
      relationship: string;
      relatedEntity: string;
      evidence: string;
      weight: number;
    }>;
  }>;
  relationships: Array<{
    source: string;
    relationship: string;
    destination: string;
    weight: number;
    evidence: string;
  }>;
  expandedEntities: Array<{
    name: string;
    kind: string;
    relatedVia: string;
  }>;
}

export class RelationshipSearchEngine {
  
  /**
   * Search with relationship-aware enhancement
   */
  async searchWithRelationships(params: {
    query: string;
    includeRelatedEntities?: boolean;
    maxHops?: number;
    limit?: number;
  }): Promise<RelationshipSearchResult> {
    const { query, includeRelatedEntities = true, maxHops = 1, limit = 10 } = params;
    
    console.log(`🔗 Relationship-aware search: "${query}"`);
    
    // Step 1: Find entities mentioned in query
    const queryEntities = await this.findEntitiesInQuery(query);
    console.log(`📊 Found ${queryEntities.length} entities in query:`, queryEntities.map(e => e.name));
    
    // Step 2: Expand with related entities via relationships
    let expandedEntities = [...queryEntities];
    let relationships: Array<any> = [];
    
    if (includeRelatedEntities && queryEntities.length > 0) {
      const expansion = await this.expandEntitiesViaRelationships(queryEntities, maxHops);
      expandedEntities.push(...expansion.entities);
      relationships.push(...expansion.relationships);
      
      console.log(`🔍 Expanded to ${expandedEntities.length} total entities via relationships`);
    }
    
    // Step 3: Build enhanced search query
    const enhancedQuery = this.buildEnhancedQuery(query, expandedEntities);
    console.log(`🚀 Enhanced query: "${enhancedQuery}"`);
    
    // Step 4: Perform document search with enhanced query
    const documents = await this.performDocumentSearch(enhancedQuery, limit);
    
    // Step 5: Add relationship context to results
    const enrichedDocuments = await this.addRelationshipContext(documents, relationships);
    
    return {
      documents: enrichedDocuments,
      relationships,
      expandedEntities: expandedEntities.map(e => ({
        name: e.name,
        kind: e.kind,
        relatedVia: e.name === query ? 'direct' : 'relationship'
      }))
    };
  }
  
  /**
   * Find entities mentioned in the search query
   */
  private async findEntitiesInQuery(query: string): Promise<Entity[]> {
    const queryLower = query.toLowerCase();
    const entities: Entity[] = [];
    
    // Search for entities by name (exact and partial matches)
    const { data: exactMatches } = await supabaseAdmin
      .from('entities')
      .select('*')
      .ilike('name', `%${query}%`);
      
    if (exactMatches) {
      entities.push(...exactMatches);
    }
    
    // Search for entities via aliases
    const { data: aliasMatches } = await supabaseAdmin
      .from('aliases')
      .select('entities(*)')
      .ilike('alias', `%${query}%`);
      
    if (aliasMatches) {
      aliasMatches.forEach(match => {
        if (match.entities && !entities.find(e => e.id === match.entities.id)) {
          entities.push(match.entities as Entity);
        }
      });
    }
    
    // Search for specific known entities in the query text
    const knownEntities = ['Leia', 'OLED', 'Android', 'lightfield', 'head tracking', '3D reconstruction'];
    for (const entityName of knownEntities) {
      if (queryLower.includes(entityName.toLowerCase())) {
        const { data: found } = await supabaseAdmin
          .from('entities')
          .select('*')
          .ilike('name', entityName)
          .limit(1)
          .single();
          
        if (found && !entities.find(e => e.id === found.id)) {
          entities.push(found);
        }
      }
    }
    
    return entities;
  }
  
  /**
   * Expand entities via relationships (1-hop traversal)
   */
  private async expandEntitiesViaRelationships(
    baseEntities: Entity[], 
    maxHops: number = 1
  ): Promise<{
    entities: Entity[];
    relationships: Array<{
      source: string;
      relationship: string;
      destination: string;
      weight: number;
      evidence: string;
    }>;
  }> {
    if (maxHops === 0 || baseEntities.length === 0) {
      return { entities: [], relationships: [] };
    }
    
    const entityIds = baseEntities.map(e => e.id);
    const expandedEntities: Entity[] = [];
    const relationships: Array<any> = [];
    
    // Find relationships where base entities are source or destination
    const { data: outgoingRels } = await supabaseAdmin
      .from('edges')
      .select(`
        rel,
        weight,
        evidence_text,
        src:entities!src_id(id, name, kind),
        dst:entities!dst_id(id, name, kind)
      `)
      .in('src_id', entityIds);
      
    const { data: incomingRels } = await supabaseAdmin
      .from('edges')
      .select(`
        rel,
        weight, 
        evidence_text,
        src:entities!src_id(id, name, kind),
        dst:entities!dst_id(id, name, kind)
      `)
      .in('dst_id', entityIds);
    
    // Process outgoing relationships (base entity is source)
    if (outgoingRels) {
      outgoingRels.forEach((rel: any) => {
        if (rel.src && rel.dst) {
          relationships.push({
            source: rel.src.name,
            relationship: rel.rel,
            destination: rel.dst.name,
            weight: parseFloat(rel.weight || 0),
            evidence: rel.evidence_text || ''
          });
          
          // Add destination entity to expansion
          if (!expandedEntities.find(e => e.id === rel.dst.id)) {
            expandedEntities.push(rel.dst);
          }
        }
      });
    }
    
    // Process incoming relationships (base entity is destination) 
    if (incomingRels) {
      incomingRels.forEach((rel: any) => {
        if (rel.src && rel.dst) {
          relationships.push({
            source: rel.src.name,
            relationship: rel.rel,
            destination: rel.dst.name,
            weight: parseFloat(rel.weight || 0),
            evidence: rel.evidence_text || ''
          });
          
          // Add source entity to expansion
          if (!expandedEntities.find(e => e.id === rel.src.id)) {
            expandedEntities.push(rel.src);
          }
        }
      });
    }
    
    console.log(`🔗 Found ${relationships.length} relationships and ${expandedEntities.length} related entities`);
    
    return { entities: expandedEntities, relationships };
  }
  
  /**
   * Build enhanced search query with entity names
   */
  private buildEnhancedQuery(originalQuery: string, entities: Entity[]): string {
    const entityNames = entities.map(e => e.name).filter(name => name.length > 2);
    
    if (entityNames.length === 0) {
      return originalQuery;
    }
    
    // Create OR query with original query and entity names
    const entityTerms = entityNames.join(' OR ');
    return `${originalQuery} OR ${entityTerms}`;
  }
  
  /**
   * Perform document search with enhanced query
   */
  private async performDocumentSearch(query: string, limit: number): Promise<Array<{
    id: string;
    title: string;
    docType: string;
    relevanceScore: number;
  }>> {
    // Use existing keyword search from hybrid-search
    const { data: chunks } = await supabaseAdmin
      .from('document_chunks')
      .select(`
        document_id,
        documents!inner(id, title, doc_type)
      `)
      .textSearch('content', query, {
        type: 'websearch',
        config: 'english'
      })
      .limit(limit);
    
    if (!chunks) return [];
    
    // Deduplicate by document and calculate relevance scores
    const docMap = new Map<string, any>();
    
    chunks.forEach((chunk: any) => {
      const doc = chunk.documents;
      if (!docMap.has(doc.id)) {
        docMap.set(doc.id, {
          id: doc.id,
          title: doc.title,
          docType: doc.doc_type,
          relevanceScore: 0.5, // Base relevance
          chunkCount: 0
        });
      }
      
      const existing = docMap.get(doc.id)!;
      existing.chunkCount++;
      existing.relevanceScore = Math.min(0.95, 0.5 + (existing.chunkCount * 0.1));
    });
    
    return Array.from(docMap.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }
  
  /**
   * Add relationship context to document results
   */
  private async addRelationshipContext(
    documents: Array<any>,
    relationships: Array<any>
  ): Promise<Array<any>> {
    // For each document, find relevant relationships
    return documents.map(doc => {
      const relevantRels = relationships.filter(rel => 
        doc.title.toLowerCase().includes(rel.source.toLowerCase()) ||
        doc.title.toLowerCase().includes(rel.destination.toLowerCase())
      );
      
      return {
        ...doc,
        relationshipContext: relevantRels.map(rel => ({
          relationship: rel.relationship,
          relatedEntity: rel.source === doc.title ? rel.destination : rel.source,
          evidence: rel.evidence,
          weight: rel.weight
        }))
      };
    });
  }
}

// Export singleton
export const relationshipSearchEngine = new RelationshipSearchEngine();

/**
 * Test relationship-aware search
 */
export async function testRelationshipSearch(query: string): Promise<void> {
  console.log(`🧪 Testing relationship search for: "${query}"`);
  
  try {
    const results = await relationshipSearchEngine.searchWithRelationships({
      query,
      includeRelatedEntities: true,
      maxHops: 1,
      limit: 5
    });
    
    console.log('\n📊 Search Results:');
    console.log(`  Documents found: ${results.documents.length}`);
    console.log(`  Relationships used: ${results.relationships.length}`);
    console.log(`  Entities expanded: ${results.expandedEntities.length}`);
    
    if (results.relationships.length > 0) {
      console.log('\n🔗 Relationships Found:');
      results.relationships.forEach((rel, i) => {
        console.log(`  ${i+1}. ${rel.source} --[${rel.relationship}]--> ${rel.destination} (${rel.weight})`);
        if (rel.evidence) {
          console.log(`     Evidence: "${rel.evidence}"`);
        }
      });
    }
    
    if (results.documents.length > 0) {
      console.log('\n📄 Top Documents:');
      results.documents.slice(0, 3).forEach((doc, i) => {
        console.log(`  ${i+1}. "${doc.title}" (relevance: ${doc.relevanceScore.toFixed(2)})`);
        if (doc.relationshipContext && doc.relationshipContext.length > 0) {
          doc.relationshipContext.forEach((ctx: any) => {
            console.log(`     → Related via "${ctx.relationship}" to "${ctx.relatedEntity}"`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Relationship search failed:', error);
    throw error;
  }
}