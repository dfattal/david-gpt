/**
 * Entity Extraction Service
 * 
 * Extracts entities from documents using multiple approaches:
 * 1. Named Entity Recognition (NER) for persons and organizations
 * 2. Pattern-based extraction for technical terms, products, algorithms
 * 3. Patent-specific extraction for inventors, assignees, classifications
 * 4. Academic paper extraction for authors, institutions, keywords
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { 
  Entity, 
  EntityKind, 
  EntityAlias,
  DocumentMetadata,
  DocumentChunk 
} from './types';

// =======================
// Entity Extraction Patterns
// =======================

// Common technology and algorithm patterns
const TECHNOLOGY_PATTERNS = [
  // Machine Learning
  /\b(?:machine learning|deep learning|neural network|artificial intelligence|AI|ML|DL)\b/gi,
  /\b(?:transformer|BERT|GPT|LSTM|CNN|RNN|attention mechanism)\b/gi,
  /\b(?:supervised learning|unsupervised learning|reinforcement learning|semi-supervised)\b/gi,
  
  // Computer Science
  /\b(?:algorithm|data structure|binary tree|hash table|graph theory)\b/gi,
  /\b(?:distributed system|microservice|containerization|kubernetes|docker)\b/gi,
  /\b(?:blockchain|cryptocurrency|smart contract|proof of work|consensus)\b/gi,
  
  // Materials & Chemistry
  /\b(?:graphene|carbon nanotube|quantum dot|semiconductor|photovoltaic)\b/gi,
  /\b(?:polymer|catalyst|electrolyte|lithium[-\s]ion|solid[-\s]state)\b/gi,
  
  // Physics & Engineering
  /\b(?:quantum computing|quantum entanglement|superconductor|metamaterial)\b/gi,
  /\b(?:CMOS|MOSFET|transistor|integrated circuit|chip design)\b/gi,
];

// Product name patterns (more specific)
const PRODUCT_PATTERNS = [
  // Software products
  /\b(?:TensorFlow|PyTorch|Keras|scikit[-\s]learn|pandas|numpy)\b/gi,
  /\b(?:React|Angular|Vue\.js|Node\.js|Express\.js|Django|Flask)\b/gi,
  /\b(?:PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|Apache Kafka)\b/gi,
  
  // Hardware products
  /\b(?:iPhone|iPad|MacBook|Surface|Pixel|Galaxy|Tesla Model [A-Z0-9])\b/gi,
  /\b(?:Intel \w+|AMD \w+|NVIDIA \w+|Qualcomm \w+)\b/gi,
];

// Organization patterns (supplements NER)
const ORGANIZATION_PATTERNS = [
  // Academic institutions
  /\b(?:University of \w+|MIT|Stanford|Harvard|Berkeley|Caltech|CMU)\b/gi,
  /\b(?:Max Planck Institute|CERN|NASA|NIH|NSF)\b/gi,
  
  // Tech companies
  /\b(?:Google|Microsoft|Apple|Amazon|Meta|Facebook|Tesla|OpenAI|Anthropic)\b/gi,
  /\b(?:NVIDIA|Intel|AMD|Qualcomm|Broadcom|Taiwan Semiconductor)\b/gi,
];

// =======================
// Entity Extraction Classes
// =======================

export class EntityExtractor {
  /**
   * Extract entities from document content using multiple approaches
   */
  async extractFromDocument(
    documentId: string,
    metadata: DocumentMetadata,
    chunks: DocumentChunk[]
  ): Promise<{
    entities: Partial<Entity>[];
    aliases: Partial<EntityAlias>[];
    relationships: Array<{
      srcName: string;
      srcType: EntityKind;
      relation: string;
      dstName: string;
      dstType: EntityKind;
      evidenceText?: string;
    }>;
  }> {
    console.log(`🔍 Extracting entities from document: ${metadata.title}`);
    
    const entities: Partial<Entity>[] = [];
    const aliases: Partial<EntityAlias>[] = [];
    const relationships: Array<any> = [];
    
    // 1. Extract from metadata (authors, assignees, etc.)
    const metadataEntities = this.extractFromMetadata(metadata);
    entities.push(...metadataEntities.entities);
    relationships.push(...metadataEntities.relationships);
    
    // 2. Extract from document content
    const fullContent = chunks.map(chunk => chunk.content).join('\n\n');
    const contentEntities = this.extractFromContent(fullContent, metadata.docType);
    entities.push(...contentEntities.entities);
    aliases.push(...contentEntities.aliases);
    
    // 3. Extract document-specific patterns
    if (metadata.docType === 'patent') {
      const patentEntities = this.extractFromPatentContent(fullContent, metadata);
      entities.push(...patentEntities.entities);
      relationships.push(...patentEntities.relationships);
    } else if (metadata.docType === 'paper' || metadata.docType === 'pdf') {
      const paperEntities = this.extractFromPaperContent(fullContent, metadata);
      entities.push(...paperEntities.entities);
      relationships.push(...paperEntities.relationships);
    }
    
    console.log(`✅ Extracted ${entities.length} entities, ${aliases.length} aliases, ${relationships.length} relationships`);
    
    return {
      entities: this.deduplicateEntities(entities),
      aliases,
      relationships
    };
  }
  
  /**
   * Extract entities from document metadata (authors, assignees, etc.)
   */
  private extractFromMetadata(metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];
    
    // For patents: inventors and assignees
    if (metadata.docType === 'patent') {
      // Note: In real implementation, patent metadata would contain parsed inventor/assignee info
      // For now, we'll implement basic patterns that could be enhanced later
    }
    
    // For papers: extract potential author institutions from DOI metadata
    if (metadata.doi && metadata.docType === 'paper') {
      // Note: This would typically come from parsed DOI metadata
      // We'll implement a basic structure for now
    }
    
    return { entities, relationships };
  }
  
  /**
   * Extract entities from document content using pattern matching and basic NER
   */
  private extractFromContent(content: string, docType: string): {
    entities: Partial<Entity>[];
    aliases: Partial<EntityAlias>[];
  } {
    const entities: Partial<Entity>[] = [];
    const aliases: Partial<EntityAlias>[] = [];
    
    // Extract technology/algorithm entities
    const techEntities = this.extractTechnologies(content);
    entities.push(...techEntities);
    
    // Extract product entities
    const productEntities = this.extractProducts(content);
    entities.push(...productEntities);
    
    // Extract organization entities (supplement to NER)
    const orgEntities = this.extractOrganizations(content);
    entities.push(...orgEntities);
    
    // Extract person entities (basic pattern matching)
    const personEntities = this.extractPersons(content);
    entities.push(...personEntities);
    
    // Extract material/concept entities
    const conceptEntities = this.extractConcepts(content);
    entities.push(...conceptEntities);
    
    return { entities, aliases };
  }
  
  /**
   * Extract technology and algorithm entities
   */
  private extractTechnologies(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    TECHNOLOGY_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.toLowerCase().trim();
          if (!found.has(normalized)) {
            found.add(normalized);
            entities.push({
              name: match.trim(),
              kind: 'algorithm' as EntityKind,
              description: `Technology/algorithm extracted from document content`,
              authorityScore: 0.6,
              mentionCount: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
            });
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract product entities
   */
  private extractProducts(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    PRODUCT_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.toLowerCase().trim();
          if (!found.has(normalized)) {
            found.add(normalized);
            entities.push({
              name: match.trim(),
              kind: 'product' as EntityKind,
              description: `Product extracted from document content`,
              authorityScore: 0.7,
              mentionCount: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
            });
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract organization entities
   */
  private extractOrganizations(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    ORGANIZATION_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.toLowerCase().trim();
          if (!found.has(normalized)) {
            found.add(normalized);
            entities.push({
              name: match.trim(),
              kind: 'org' as EntityKind,
              description: `Organization extracted from document content`,
              authorityScore: 0.8,
              mentionCount: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
            });
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract person entities using basic patterns
   */
  private extractPersons(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    // Pattern for "Dr./Prof. FirstName LastName" or "FirstName LastName, PhD"
    const personPatterns = [
      /(?:Dr\.?|Prof\.?|Professor)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/g,
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)(?:,\s*(?:PhD|Ph\.D\.|M\.D\.|Dr\.))/g,
      // Author citation patterns: "LastName et al."
      /\b([A-Z][a-z]{2,})\s+et\s+al\./g,
    ];
    
    personPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1].trim();
        const normalized = name.toLowerCase();
        
        // Basic filtering to avoid false positives
        if (name.length > 5 && 
            !found.has(normalized) && 
            !/\b(?:the|and|or|for|with|from|that|this|was|were|been|have|has|will|would|could|should)\b/i.test(name)) {
          found.add(normalized);
          entities.push({
            name,
            kind: 'person' as EntityKind,
            description: `Person extracted from document content`,
            authorityScore: 0.5,
            mentionCount: (content.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        }
      }
    });
    
    return entities;
  }
  
  /**
   * Extract concept/material entities
   */
  private extractConcepts(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    // Scientific concept patterns
    const conceptPatterns = [
      // Chemical compounds
      /\b([A-Z][a-z]*(?:-\d+)*(?:\s+[a-z]+)*)\s+(?:compound|molecule|chemical|substance|material)/gi,
      // Methods/techniques
      /\b(\w+(?:\s+\w+)*)\s+(?:method|technique|approach|algorithm|process)/gi,
    ];
    
    conceptPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const concept = match[1].trim();
        const normalized = concept.toLowerCase();
        
        if (concept.length > 3 && 
            concept.length < 50 && 
            !found.has(normalized) &&
            !/\b(?:this|that|these|those|new|novel|proposed|developed)\b/i.test(concept)) {
          found.add(normalized);
          entities.push({
            name: concept,
            kind: 'concept' as EntityKind,
            description: `Concept/material extracted from document content`,
            authorityScore: 0.4,
            mentionCount: 1 // Initial mention
          });
        }
      }
    });
    
    return entities;
  }
  
  /**
   * Extract patent-specific entities
   */
  private extractFromPatentContent(content: string, metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];
    
    // Extract patent classifications (IPC/CPC codes)
    const classificationPattern = /\b([A-H]\d{2}[A-Z]\s*\d+\/\d+)\b/g;
    let match;
    while ((match = classificationPattern.exec(content)) !== null) {
      entities.push({
        name: match[1],
        kind: 'concept' as EntityKind,
        description: `Patent classification code`,
        authorityScore: 0.9,
        mentionCount: 1
      });
    }
    
    // Extract invention/product names from patent title and claims
    const inventionPatterns = [
      /(?:system|method|device|apparatus|process)\s+for\s+([^.]{10,100})/gi,
      /(?:improved|enhanced|novel)\s+([^.]{10,80})/gi,
    ];
    
    inventionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const invention = match[1].trim();
        if (invention.length > 10 && invention.length < 80) {
          entities.push({
            name: invention,
            kind: 'product' as EntityKind,
            description: `Patent invention/product`,
            authorityScore: 0.8,
            mentionCount: 1
          });
        }
      }
    });
    
    return { entities, relationships };
  }
  
  /**
   * Extract paper-specific entities
   */
  private extractFromPaperContent(content: string, metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];
    
    // Extract datasets mentioned in papers
    const datasetPatterns = [
      /\b([A-Z][A-Za-z0-9-]+)\s+dataset/gi,
      /dataset\s+called\s+([A-Z][A-Za-z0-9-]+)/gi,
      /\b(ImageNet|CIFAR-10|MNIST|COCO|Wikipedia|Common Crawl)\b/gi,
    ];
    
    datasetPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const datasetName = match.replace(/\s+dataset/i, '').trim();
          entities.push({
            name: datasetName,
            kind: 'material' as EntityKind, // Using 'material' for datasets since 'dataset' not in current schema
            description: `Dataset mentioned in research paper`,
            authorityScore: 0.7,
            mentionCount: 1
          });
        });
      }
    });
    
    // Extract research methodologies
    const methodPatterns = [
      /\b(\w+(?:\s+\w+)*)\s+(?:methodology|framework|architecture)/gi,
      /propose(?:d)?\s+(?:a|an|the)\s+([^.]{10,50})/gi,
    ];
    
    methodPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1].trim();
        if (method.length > 5 && method.length < 50 && 
            !/\b(?:new|novel|improved|enhanced|proposed)\b/i.test(method)) {
          entities.push({
            name: method,
            kind: 'algorithm' as EntityKind,
            description: `Research methodology/algorithm`,
            authorityScore: 0.6,
            mentionCount: 1
          });
        }
      }
    });
    
    return { entities, relationships };
  }
  
  /**
   * Deduplicate entities based on name similarity
   */
  private deduplicateEntities(entities: Partial<Entity>[]): Partial<Entity>[] {
    const deduped = new Map<string, Partial<Entity>>();
    
    entities.forEach(entity => {
      if (!entity.name) return;
      
      const normalizedName = entity.name.toLowerCase().trim();
      const existing = deduped.get(normalizedName);
      
      if (existing) {
        // Merge mention counts and use higher authority score
        existing.mentionCount = (existing.mentionCount || 0) + (entity.mentionCount || 0);
        existing.authorityScore = Math.max(existing.authorityScore || 0, entity.authorityScore || 0);
      } else {
        deduped.set(normalizedName, entity);
      }
    });
    
    return Array.from(deduped.values());
  }
  
  /**
   * Save entities to database with continuous consolidation
   */
  async saveEntities(
    documentId: string,
    entities: Partial<Entity>[],
    aliases: Partial<EntityAlias>[],
    relationships: Array<any>
  ): Promise<void> {
    console.log(`💾 Saving ${entities.length} entities to database with consolidation...`);
    
    try {
      // Import consolidator
      const { entityConsolidator } = await import('./entity-consolidator');
      
      let reusedCount = 0;
      let newCount = 0;
      
      // Save entities with consolidation
      for (const entity of entities) {
        if (!entity.name || !entity.kind) continue;
        
        // Use consolidator to check for existing entities and reuse them
        const consolidationResult = await entityConsolidator.consolidateEntityOnIngestion(
          entity.name,
          entity.kind,
          entity.description
        );
        
        if (consolidationResult.wasReused) {
          reusedCount++;
          console.log(`🔗 Reused entity: ${entity.name} → ${consolidationResult.matchedName || entity.name}`);
        } else {
          newCount++;
          console.log(`🆕 Created new entity: ${entity.name}`);
        }
      }
      
      console.log(`✅ Entities saved successfully: ${reusedCount} reused, ${newCount} new`);
      
      // TODO: Save relationships after consolidation
      // This would require mapping entity names to consolidated entity IDs
      
    } catch (error) {
      console.error('Error in saveEntities:', error);
      throw error;
    }
  }
}

// =======================
// Export Functions
// =======================

export const entityExtractor = new EntityExtractor();

/**
 * Process a document for entity extraction
 */
export async function processDocumentEntities(documentId: string): Promise<void> {
  try {
    console.log(`🚀 Starting entity extraction for document: ${documentId}`);
    
    // Get document metadata
    const { data: document } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (!document) {
      throw new Error('Document not found');
    }
    
    // Get document chunks
    const { data: chunks } = await supabaseAdmin
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index');
    
    if (!chunks || chunks.length === 0) {
      console.log('No chunks found for document, skipping entity extraction');
      return;
    }
    
    // Extract entities
    const { entities, aliases, relationships } = await entityExtractor.extractFromDocument(
      documentId,
      document as DocumentMetadata,
      chunks as DocumentChunk[]
    );
    
    // Save entities to database
    await entityExtractor.saveEntities(documentId, entities, aliases, relationships);
    
    console.log(`✅ Entity extraction completed for document: ${document.title}`);
    
  } catch (error) {
    console.error('Error in processDocumentEntities:', error);
    throw error;
  }
}

/**
 * Batch process all documents for entity extraction
 */
export async function batchProcessEntities(limit = 10): Promise<void> {
  try {
    console.log(`🔄 Starting batch entity processing (limit: ${limit})...`);
    
    // Get documents that haven't been processed for entities
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('id, title')
      .eq('processing_status', 'completed')
      .limit(limit);
    
    if (!documents || documents.length === 0) {
      console.log('No documents found for entity processing');
      return;
    }
    
    console.log(`Processing ${documents.length} documents...`);
    
    for (const doc of documents) {
      try {
        await processDocumentEntities(doc.id);
      } catch (error) {
        console.error(`Failed to process entities for document ${doc.title}:`, error);
        // Continue with other documents
      }
    }
    
    console.log('✅ Batch entity processing completed');
    
  } catch (error) {
    console.error('Error in batchProcessEntities:', error);
    throw error;
  }
}