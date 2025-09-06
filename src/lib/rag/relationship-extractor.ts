/**
 * Relationship Extraction System
 * 
 * Extracts relationships between entities from document content and metadata.
 * Focuses on author-document, inventor-patent, and technology relationships.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { 
  KnowledgeEdge, 
  RelationType, 
  Entity,
  DocumentMetadata,
  DocumentChunk 
} from './types';

// =======================
// Relationship Patterns
// =======================

// Domain-specific patterns for 3D displays, computer vision, and patents
const RELATIONSHIP_PATTERNS = {
  author_of: [
    /(?:authored|written|published)\s+by\s+((?:[A-Z]\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /(?:paper|study|research)\s+by\s+((?:[A-Z]\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  ],
  
  inventor_of: [
    /invented\s+by\s+((?:[A-Z]\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /patent\s+(?:filed|granted)\s+(?:to|by)\s+((?:[A-Z]\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  ],
  
  assignee_of: [
    /assigned\s+to\s+(Leia(?:\s+Inc)?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /assignee[:\s]+(Leia(?:\s+Inc)?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  ],
  
  implements: [
    // Specific 3D display technologies
    /(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|3D\s+reconstruction)\s+(?:algorithm|method|technique|technology)/gi,
    /implements\s+(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|diffusion|NeRF|Gaussian\s+splatting)/gi,
    /based\s+on\s+(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|diffusion|NeRF|Gaussian\s+splatting)/gi,
    /utilizing\s+(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|diffusion|NeRF|Gaussian\s+splatting)/gi,
    /(Leia)\s+(?:uses|implements|utilizes)\s+([A-Z]{2,10}|lightfield|head\s+tracking)/gi,
  ],
  
  used_in: [
    // Technology used in products/applications
    /(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|3D\s+reconstruction|NeRF|diffusion)\s+(?:is\s+)?used\s+in\s+(Android|Leia|displays?|applications?)/gi,
    /(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis)\s+for\s+(Android|Leia|displays?|3D\s+visualization)/gi,
    /(Leia|Android)\s+uses\s+(OLED|LCD|lightfield|head\s+tracking|view\s+synthesis|3D\s+reconstruction)/gi,
    /application\s+of\s+(OLED|LCD|lightfield|head\s+tracking)\s+in\s+(displays?|Android|Leia)/gi,
  ],
  
  cites: [
    /(?:references?|cites?)\s+([A-Z][a-zA-Z\s]{10,50})/gi,
    /(?:see|cf\.)\s+([A-Z][a-zA-Z\s]{10,50})/gi,
    /\\[\\d+\\]\s*([A-Z][a-zA-Z\s]{10,50})/gi, // Citation format
  ],
  
  supersedes: [
    /(?:supersedes|replaces|improves\s+upon)\s+([A-Z][a-zA-Z\s]{8,40})/gi,
    /(?:updated|newer)\s+version\s+of\s+([A-Z][a-zA-Z\s]{8,40})/gi,
  ],
  
  similar_to: [
    /similar\s+to\s+(OLED|LCD|lightfield|head\s+tracking|[A-Z][a-zA-Z\s]{5,30})/gi,
    /(?:like|analogous\s+to)\s+(OLED|LCD|lightfield|head\s+tracking|[A-Z][a-zA-Z\s]{5,30})/gi,
  ]
};

// =======================
// Relationship Extractor
// =======================

export class RelationshipExtractor {
  /**
   * Extract relationships from document content and metadata
   */
  async extractRelationshipsFromDocument(
    documentId: string,
    documentMetadata: DocumentMetadata,
    documentChunks: DocumentChunk[]
  ): Promise<{
    relationships: Partial<KnowledgeEdge>[];
    entities: string[]; // Entity names found
  }> {
    console.log(`🔗 Extracting relationships from document: ${documentMetadata.title}`);
    
    const relationships: Partial<KnowledgeEdge>[] = [];
    const entitiesFound = new Set<string>();
    
    // 1. Extract metadata-based relationships
    const metadataRels = this.extractFromMetadata(documentId, documentMetadata);
    relationships.push(...metadataRels.relationships);
    metadataRels.entities.forEach(e => entitiesFound.add(e));
    
    // 2. Extract content-based relationships
    const fullContent = documentChunks.map(c => c.content).join('\n\n');
    const contentRels = this.extractFromContent(documentId, fullContent, documentMetadata.docType);
    relationships.push(...contentRels.relationships);
    contentRels.entities.forEach(e => entitiesFound.add(e));
    
    // 3. Extract citation relationships
    const citationRels = this.extractCitationRelationships(documentId, fullContent);
    relationships.push(...citationRels);
    
    console.log(`✅ Found ${relationships.length} relationships and ${entitiesFound.size} entities`);
    
    return {
      relationships: this.deduplicateRelationships(relationships),
      entities: Array.from(entitiesFound)
    };
  }
  
  /**
   * Extract relationships from document metadata
   */
  private extractFromMetadata(
    documentId: string,
    metadata: DocumentMetadata
  ): { relationships: Partial<KnowledgeEdge>[]; entities: string[] } {
    const relationships: Partial<KnowledgeEdge>[] = [];
    const entities: string[] = [];
    
    // For patents: inventor and assignee relationships
    if (metadata.docType === 'patent') {
      // Note: In practice, this would use parsed patent data
      // For now, we establish the framework
      
      // Patent-inventor relationships would be extracted from patent metadata
      // This is a placeholder for when we have parsed patent data
    }
    
    // For papers: author relationships from DOI metadata
    if (metadata.docType === 'paper' || metadata.docType === 'pdf') {
      // Note: This would typically come from parsed DOI metadata
      // We'll implement basic structure for now
    }
    
    return { relationships, entities };
  }
  
  /**
   * Extract relationships from document content using pattern matching
   */
  private extractFromContent(
    documentId: string,
    content: string,
    docType: string
  ): { relationships: Partial<KnowledgeEdge>[]; entities: string[] } {
    const relationships: Partial<KnowledgeEdge>[] = [];
    const entities = new Set<string>();
    
    // Extract each type of relationship
    for (const [relationType, patterns] of Object.entries(RELATIONSHIP_PATTERNS)) {
      const relationsOfType = this.extractRelationshipType(
        content,
        relationType as RelationType,
        patterns
      );
      
      for (const relation of relationsOfType) {
        relationships.push({
          ...relation,
          evidenceDocId: documentId,
        });
        
        // Track entities mentioned
        if (relation.srcId) entities.add(relation.srcId);
        if (relation.dstId) entities.add(relation.dstId);
      }
    }
    
    return {
      relationships,
      entities: Array.from(entities)
    };
  }
  
  /**
   * Extract a specific type of relationship using patterns
   */
  private extractRelationshipType(
    content: string,
    relationType: RelationType,
    patterns: RegExp[]
  ): Partial<KnowledgeEdge>[] {
    const relationships: Partial<KnowledgeEdge>[] = [];
    
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      
      while ((match = pattern.exec(content)) !== null) {
        const relationship = this.parseRelationshipMatch(match, relationType, pattern);
        if (relationship) {
          relationships.push(relationship);
        }
        
        // Prevent infinite loops with global regexes
        if (pattern.global === false) break;
      }
    }
    
    return relationships;
  }
  
  /**
   * Parse a regex match into a relationship
   */
  private parseRelationshipMatch(
    match: RegExpExecArray,
    relationType: RelationType,
    pattern: RegExp
  ): Partial<KnowledgeEdge> | null {
    try {
      const fullMatch = match[0];
      const groups = match.slice(1);
      
      // Extract entity names from the match
      const entityNames = groups
        .filter(group => group && group.length > 2)
        .map(name => name.trim())
        .filter(name => this.isValidEntityName(name));
      
      if (entityNames.length === 0) return null;
      
      // Determine source and destination based on relationship type
      let srcName: string, dstName: string;
      let srcType: 'entity' | 'document' = 'entity';
      let dstType: 'entity' | 'document' = 'entity';
      
      switch (relationType) {
        case 'author_of':
        case 'inventor_of':
          srcName = entityNames[0]; // Person
          dstName = 'DOCUMENT'; // Will be resolved to document
          dstType = 'document';
          break;
          
        case 'assignee_of':
          srcName = entityNames[0]; // Organization
          dstName = 'DOCUMENT';
          dstType = 'document';
          break;
          
        case 'implements':
        case 'used_in':
          if (entityNames.length >= 2) {
            srcName = entityNames[0];
            dstName = entityNames[1];
          } else {
            srcName = entityNames[0];
            dstName = 'DOCUMENT';
            dstType = 'document';
          }
          break;
          
        default:
          if (entityNames.length >= 2) {
            srcName = entityNames[0];
            dstName = entityNames[1];
          } else {
            srcName = entityNames[0];
            dstName = 'DOCUMENT';
            dstType = 'document';
          }
      }
      
      return {
        srcId: srcName, // Will be resolved to actual entity ID later
        srcType,
        rel: relationType,
        dstId: dstName,
        dstType,
        weight: this.calculateRelationshipWeight(relationType, fullMatch),
        evidenceText: fullMatch.length > 200 ? fullMatch.substring(0, 200) + '...' : fullMatch,
      };
      
    } catch (error) {
      console.warn('Error parsing relationship match:', error);
      return null;
    }
  }
  
  /**
   * Check if a string is a valid entity name
   */
  private isValidEntityName(name: string): boolean {
    if (!name || name.length < 2 || name.length > 50) return false;
    
    // Clean the name
    const cleanName = name.trim().replace(/[.,;:!?]$/, '');
    
    // Filter out common false positives
    const invalidPatterns = [
      /^(?:the|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|up|down|out|off|over|under|again|further|then|once)$/i,
      /^(?:this|that|these|those|here|there|where|when|what|which|who|how|why)$/i,
      /^(?:can|could|should|would|will|shall|may|might|must|do|does|did|have|has|had|is|are|was|were|be|been|being)$/i,
      /^(?:such|also|more|most|very|much|many|some|any|all|each|every|both|either|neither)$/i,
      /^\d+$/,  // Pure numbers
      /^[^a-zA-Z]*$/, // No letters
      /\s{3,}/, // Multiple consecutive spaces
      /^[a-z]\s/, // Single lowercase letter + space
    ];
    
    // Require proper entity structure - domain-specific patterns
    const validPatterns = [
      /^[A-Z]{2,10}$/, // Acronyms like "OLED", "API", "SDK", "NeRF"
      /^[A-Z][a-z]{2,}$/, // Proper nouns like "Leia", "Android"
      /^[A-Z][a-z]+\s[A-Z][a-z]+$/, // Two-word proper nouns like "Leia Inc"
      /^[a-z]{3,15}$/, // Technical terms like "lightfield", "algorithm", "diffusion"
      /^[0-9]+D\s[a-z]+$/, // Technical terms like "3D display", "3D reconstruction"
      /^(head\s+tracking|view\s+synthesis|Gaussian\s+splatting)$/i, // Multi-word technical terms
      /^(refractive\s+index|neural\s+network|machine\s+learning)$/i, // More technical terms
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(cleanName)) &&
           validPatterns.some(pattern => pattern.test(cleanName));
  }
  
  /**
   * Calculate relationship weight based on type and context
   */
  private calculateRelationshipWeight(relationType: RelationType, evidenceText: string): number {
    let baseWeight = 0.5;
    
    // Adjust weight based on relationship type
    switch (relationType) {
      case 'author_of':
      case 'inventor_of':
      case 'assignee_of':
        baseWeight = 0.9; // High confidence for formal relationships
        break;
      case 'implements':
      case 'used_in':
        baseWeight = 0.7; // Medium confidence for technical relationships
        break;
      case 'cites':
        baseWeight = 0.8; // High confidence for citations
        break;
      case 'supersedes':
        baseWeight = 0.6; // Medium confidence
        break;
      case 'similar_to':
        baseWeight = 0.4; // Lower confidence for similarity
        break;
    }
    
    // Boost weight for certain contextual indicators
    const confidenceBoosts = [
      { pattern: /\b(?:clearly|definitely|specifically|explicitly)\b/i, boost: 0.1 },
      { pattern: /\b(?:patent|paper|study|research)\b/i, boost: 0.1 },
      { pattern: /\b(?:developed|created|invented|designed)\b/i, boost: 0.1 },
    ];
    
    for (const { pattern, boost } of confidenceBoosts) {
      if (pattern.test(evidenceText)) {
        baseWeight = Math.min(1.0, baseWeight + boost);
      }
    }
    
    return baseWeight;
  }
  
  /**
   * Extract citation relationships from reference lists
   */
  private extractCitationRelationships(
    documentId: string,
    content: string
  ): Partial<KnowledgeEdge>[] {
    const relationships: Partial<KnowledgeEdge>[] = [];
    
    // Look for reference sections
    const referenceSection = this.extractReferenceSection(content);
    if (!referenceSection) return relationships;
    
    // Extract individual references
    const references = this.parseReferences(referenceSection);
    
    for (const reference of references) {
      if (reference.title) {
        relationships.push({
          srcId: 'DOCUMENT', // Current document
          srcType: 'document',
          rel: 'cites',
          dstId: reference.title, // Will be resolved to actual document/entity
          dstType: 'document',
          weight: 0.8,
          evidenceText: reference.fullText,
        });
      }
    }
    
    return relationships;
  }
  
  /**
   * Extract reference section from content
   */
  private extractReferenceSection(content: string): string | null {
    const referencePatterns = [
      /(?:references?|bibliography|citations?)\s*:?\s*\n((?:.|\n)*?)(?:\n\n|\n(?:appendix|acknowledgments))/i,
      /(?:references?|bibliography)\s*\n((?:.|\n)*?)$/i,
    ];
    
    for (const pattern of referencePatterns) {
      const match = content.match(pattern);
      if (match && match[1] && match[1].length > 100) {
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * Parse individual references from reference section
   */
  private parseReferences(referenceSection: string): Array<{
    title?: string;
    authors?: string[];
    year?: string;
    fullText: string;
  }> {
    const references: Array<any> = [];
    
    // Split into individual references (common patterns)
    const referenceLines = referenceSection
      .split(/\n(?=\d+\.|\[\d+\])/g)
      .filter(line => line.trim().length > 20);
    
    for (const line of referenceLines.slice(0, 50)) { // Limit to avoid processing huge reference lists
      const reference = this.parseReference(line);
      if (reference.title) {
        references.push(reference);
      }
    }
    
    return references;
  }
  
  /**
   * Parse a single reference line
   */
  private parseReference(line: string): {
    title?: string;
    authors?: string[];
    year?: string;
    fullText: string;
  } {
    const reference = { fullText: line.trim() };
    
    // Extract title (usually in quotes or between punctuation)
    const titlePatterns = [
      /"([^"]{10,200})"/,  // Quoted titles
      /\. ([A-Z][^.]{10,200})\. /,  // Sentence-like titles
      /\. ([A-Z][^.]{10,200})(?:,|$)/, // End with comma or end of line
    ];
    
    for (const pattern of titlePatterns) {
      const match = line.match(pattern);
      if (match) {
        (reference as any).title = match[1].trim();
        break;
      }
    }
    
    // Extract year
    const yearMatch = line.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      (reference as any).year = yearMatch[0];
    }
    
    // Extract authors (simplified - first author patterns)
    const authorPatterns = [
      /^(?:\d+\.?\s*)?([A-Z][a-z]+,?\s+[A-Z](?:\.[A-Z])?\.?)/,
      /([A-Z][a-z]+\s+et\s+al\.?)/,
    ];
    
    for (const pattern of authorPatterns) {
      const match = line.match(pattern);
      if (match) {
        (reference as any).authors = [match[1].trim()];
        break;
      }
    }
    
    return reference;
  }
  
  /**
   * Remove duplicate relationships
   */
  private deduplicateRelationships(relationships: Partial<KnowledgeEdge>[]): Partial<KnowledgeEdge>[] {
    const seen = new Set<string>();
    return relationships.filter(rel => {
      const key = `${rel.srcId}_${rel.rel}_${rel.dstId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Save relationships to database
   */
  async saveRelationships(relationships: Partial<KnowledgeEdge>[]): Promise<void> {
    console.log(`💾 Saving ${relationships.length} relationships to database...`);
    
    for (const rel of relationships) {
      try {
        // Resolve entity names to entity IDs
        const resolvedRel = await this.resolveRelationshipEntities(rel);
        
        if (resolvedRel.srcId && resolvedRel.dstId) {
          // Check if relationship already exists
          const { data: existing } = await supabaseAdmin
            .from('edges')
            .select('id')
            .eq('src_id', resolvedRel.srcId)
            .eq('rel', resolvedRel.rel)
            .eq('dst_id', resolvedRel.dstId)
            .single();
          
          if (!existing) {
            await supabaseAdmin
              .from('edges')
              .insert(resolvedRel);
          }
        }
      } catch (error) {
        console.warn(`Failed to save relationship:`, rel, error);
        // Continue with other relationships
      }
    }
    
    console.log('✅ Relationships saved successfully');
  }
  
  /**
   * Resolve entity names in relationships to entity IDs
   */
  private async resolveRelationshipEntities(
    rel: Partial<KnowledgeEdge>
  ): Promise<Partial<KnowledgeEdge>> {
    const resolved = { ...rel };
    
    // Resolve source entity
    if (rel.srcId && rel.srcId !== 'DOCUMENT') {
      const entity = await this.findEntityByName(rel.srcId);
      if (entity) {
        resolved.srcId = entity.id;
      }
    }
    
    // Resolve destination entity
    if (rel.dstId && rel.dstId !== 'DOCUMENT') {
      const entity = await this.findEntityByName(rel.dstId);
      if (entity) {
        resolved.dstId = entity.id;
      }
    }
    
    return resolved;
  }
  
  /**
   * Find entity by name (with fuzzy matching)
   */
  private async findEntityByName(name: string): Promise<Entity | null> {
    // Try exact match first
    const { data: exactMatch } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('name', name)
      .single();
    
    if (exactMatch) return exactMatch;
    
    // Try alias match
    const { data: aliasMatch } = await supabaseAdmin
      .from('aliases')
      .select('entities(*)')
      .eq('alias', name)
      .single();
    
    if (aliasMatch?.entities) return aliasMatch.entities as Entity;
    
    return null;
  }
}

// =======================
// Export Functions
// =======================

export const relationshipExtractor = new RelationshipExtractor();

/**
 * Extract relationships from a document
 */
export async function extractDocumentRelationships(
  documentId: string,
  documentMetadata: DocumentMetadata,
  documentChunks: DocumentChunk[]
): Promise<void> {
  try {
    const { relationships } = await relationshipExtractor.extractRelationshipsFromDocument(
      documentId,
      documentMetadata,
      documentChunks
    );
    
    await relationshipExtractor.saveRelationships(relationships);
    
  } catch (error) {
    console.error('Error extracting document relationships:', error);
    throw error;
  }
}

/**
 * Batch process relationships for multiple documents
 */
export async function batchProcessRelationships(limit = 10): Promise<void> {
  try {
    console.log(`🔄 Starting batch relationship processing (limit: ${limit})...`);
    
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select(`
        *,
        document_chunks (*)
      `)
      .eq('processing_status', 'completed')
      .limit(limit);
    
    if (!documents || documents.length === 0) {
      console.log('No documents found for relationship processing');
      return;
    }
    
    for (const doc of documents) {
      try {
        if (doc.document_chunks && doc.document_chunks.length > 0) {
          await extractDocumentRelationships(
            doc.id,
            doc as DocumentMetadata,
            doc.document_chunks as DocumentChunk[]
          );
        }
      } catch (error) {
        console.error(`Failed to process relationships for document ${doc.title}:`, error);
        // Continue with other documents
      }
    }
    
    console.log('✅ Batch relationship processing completed');
    
  } catch (error) {
    console.error('Error in batchProcessRelationships:', error);
    throw error;
  }
}