/**
 * Domain-Specific Entity Extractor 
 * 
 * Aligned with Mini-KG specification for 7 entity types:
 * - person, organization, product, technology, component, document, dataset
 * 
 * Focused on 3D displays, computer vision, and patent content
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
// Domain-Specific Patterns for 3D Displays & Computer Vision
// =======================

const PERSON_PATTERNS = [
  // Academic author patterns
  /\b(?:Dr\.?\s+|Prof\.?\s+|Professor\s+)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)\b/g,
  // Patent inventor patterns  
  /(?:inventor[s]?|authored?\s+by|developed\s+by|created\s+by):\s*([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)/gi,
];

const ORGANIZATION_PATTERNS = [
  // Companies (especially tech/display companies)
  /\b(?:Leia(?:\s+Inc\.?)?|Apple(?:\s+Inc\.?)?|Google(?:\s+LLC)?|Meta(?:\s+Platforms)?|Microsoft(?:\s+Corporation)?)\b/gi,
  /\b(?:NVIDIA(?:\s+Corporation)?|Intel(?:\s+Corporation)?|AMD|Qualcomm|Samsung)\b/gi,
  /\b(?:Magic\s+Leap|HoloLens|Oculus|HTC\s+Vive|Unity\s+Technologies)\b/gi,
  
  // Academic institutions
  /\b(?:University\s+of\s+[A-Z][a-z]+|MIT|Stanford(?:\s+University)?|Harvard|Berkeley|CMU)\b/gi,
  /\b(?:Max\s+Planck\s+Institute|CERN|NASA|NIH|NSF)\b/gi,
];

const TECHNOLOGY_PATTERNS = [
  // 3D Display Technologies
  /\b(?:lightfield|light[-\s]field|holographic\s+display|volumetric\s+display|autostereoscopic)\b/gi,
  /\b(?:parallax\s+barrier|lenticular\s+lens|integral\s+imaging|multi[-\s]view\s+display)\b/gi,
  /\b(?:head\s+tracking|eye\s+tracking|gaze\s+tracking|motion\s+parallax)\b/gi,
  
  // Computer Vision & AI
  /\b(?:diffusion\s+model[s]?|neural\s+rendering|NeRF|Gaussian\s+splatting)\b/gi,
  /\b(?:view\s+synthesis|multi[-\s]view\s+stereo|photogrammetry|3D\s+reconstruction)\b/gi,
  /\b(?:depth\s+estimation|stereo\s+vision|SLAM|structure\s+from\s+motion)\b/gi,
  /\b(?:machine\s+learning|deep\s+learning|neural\s+network|artificial\s+intelligence|AI)\b/gi,
  
  // Display & Optics Technology  
  /\b(?:LCD|OLED|MicroLED|quantum\s+dot|E-ink|EPD)\b/gi,
  /\b(?:polarization|birefringence|refractive\s+index|optical\s+waveguide)\b/gi,
];

const PRODUCT_PATTERNS = [
  // Specific 3D Display Products
  /\b(?:Leia\s+Lume\s+Pad|Looking\s+Glass|HoloPlayer|zSpace)\b/gi,
  /\b(?:Nintendo\s+3DS|HTC\s+EVO\s+3D|LG\s+Optimus\s+3D)\b/gi,
  
  // Software/Frameworks
  /\b(?:Unity(?:\s+3D)?|Unreal\s+Engine|Blender|Three\.js|WebXR|OpenXR)\b/gi,
  /\b(?:OpenCV|PyTorch3D|Kornia|MediaPipe|ARCore|ARKit)\b/gi,
  
  // Hardware Platforms
  /\b(?:iPhone|iPad|Android|Meta\s+Quest|HoloLens|Magic\s+Leap)\b/gi,
];

const COMPONENT_PATTERNS = [
  // Hardware Components
  /\b(?:CMOS\s+sensor|image\s+sensor|depth\s+camera|stereo\s+camera|IMU)\b/gi,
  /\b(?:GPU|CPU|DSP|FPGA|microcontroller|SoC)\b/gi,
  /\b(?:lens\s+array|microlens|diffractive\s+element|holographic\s+element)\b/gi,
  
  // Software Components
  /\b(?:rendering\s+engine|graphics\s+pipeline|shader|API|SDK|framework)\b/gi,
  /\b(?:algorithm|neural\s+network\s+model|pre[-\s]trained\s+model)\b/gi,
];

const DATASET_PATTERNS = [
  // Common CV/3D datasets
  /\b(?:ImageNet|COCO|Places365|ScanNet|ShapeNet|ModelNet)\b/gi,
  /\b(?:KITTI|Cityscapes|NYU\s+Depth|RGB[-\s]D\s+dataset)\b/gi,
  /\b(?:synthetic\s+dataset|training\s+data|test\s+set|validation\s+set)\b/gi,
];

// =======================
// Domain-Specific Entity Extractor
// =======================

export class DomainEntityExtractor {
  
  /**
   * Extract entities from document using domain-specific patterns
   */
  async extractFromDocument(
    metadata: DocumentMetadata, 
    chunks: DocumentChunk[]
  ): Promise<{
    entities: Partial<Entity>[];
    aliases: Partial<EntityAlias>[];
    relationships: Array<any>;
  }> {
    console.log(`🔍 Extracting domain entities from: ${metadata.title}`);
    
    const entities: Partial<Entity>[] = [];
    const aliases: Partial<EntityAlias>[] = [];
    const relationships: Array<any> = [];
    
    // Combine all content for analysis
    const fullContent = chunks.map(chunk => chunk.content).join('\n\n');
    
    // 1. Extract from metadata (structured data first)
    const metadataEntities = this.extractFromMetadata(metadata);
    entities.push(...metadataEntities.entities);
    relationships.push(...metadataEntities.relationships);
    
    // 2. Extract from content using domain patterns
    const contentEntities = this.extractFromContent(fullContent, metadata.title);
    entities.push(...contentEntities.entities);
    aliases.push(...contentEntities.aliases);
    
    // 3. Quality filtering and deduplication
    const filteredEntities = this.filterAndDeduplicate(entities);
    
    console.log(`✅ Extracted ${filteredEntities.length} domain-specific entities`);
    
    return {
      entities: filteredEntities,
      aliases,
      relationships
    };
  }
  
  /**
   * Extract entities from structured metadata
   */
  private extractFromMetadata(metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];
    
    // Extract patent inventors
    if (metadata.docType === 'patent' && metadata.patentNo) {
      // Patent documents are their own entity
      entities.push({
        name: metadata.title,
        kind: 'document' as EntityKind,
        description: `Patent document: ${metadata.patentNo}`,
        authorityScore: 0.9,
        mentionCount: 1
      });
    }
    
    // Extract paper/document title as document entity
    if (metadata.docType === 'paper' || metadata.docType === 'pdf') {
      entities.push({
        name: metadata.title,
        kind: 'document' as EntityKind,
        description: `Research paper`,
        authorityScore: 0.8,
        mentionCount: 1
      });
    }
    
    return { entities, relationships };
  }
  
  /**
   * Extract entities from content using domain patterns
   */
  private extractFromContent(content: string, title: string): {
    entities: Partial<Entity>[];
    aliases: Partial<EntityAlias>[];
  } {
    const entities: Partial<Entity>[] = [];
    const aliases: Partial<EntityAlias>[] = [];
    
    // Extract persons
    entities.push(...this.extractPatternEntities(content, PERSON_PATTERNS, 'person', 0.7));
    
    // Extract organizations  
    entities.push(...this.extractPatternEntities(content, ORGANIZATION_PATTERNS, 'organization', 0.8));
    
    // Extract technologies
    entities.push(...this.extractPatternEntities(content, TECHNOLOGY_PATTERNS, 'technology', 0.7));
    
    // Extract products
    entities.push(...this.extractPatternEntities(content, PRODUCT_PATTERNS, 'product', 0.8));
    
    // Extract components
    entities.push(...this.extractPatternEntities(content, COMPONENT_PATTERNS, 'component', 0.6));
    
    // Extract datasets
    entities.push(...this.extractPatternEntities(content, DATASET_PATTERNS, 'dataset', 0.7));
    
    return { entities, aliases };
  }
  
  /**
   * Extract entities using regex patterns
   */
  private extractPatternEntities(
    content: string, 
    patterns: RegExp[], 
    kind: EntityKind,
    baseScore: number
  ): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const name = match.trim();
          const normalized = name.toLowerCase();
          
          // Quality filtering
          if (this.isHighQualityEntity(name, kind) && !found.has(normalized)) {
            found.add(normalized);
            
            const mentionCount = (content.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            
            entities.push({
              name,
              kind,
              description: `${this.getKindDescription(kind)} extracted from document content`,
              authorityScore: Math.min(baseScore + (mentionCount * 0.05), 0.95),
              mentionCount
            });
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Quality filtering for entity names
   */
  private isHighQualityEntity(name: string, kind: EntityKind): boolean {
    // Basic length check
    if (name.length < 2 || name.length > 50) return false;
    
    // Avoid common words and fragments
    const commonWords = ['the', 'and', 'of', 'to', 'in', 'for', 'with', 'as', 'by', 'on', 'at', 'be', 'or', 'an', 'are', 'this', 'that'];
    if (commonWords.includes(name.toLowerCase())) return false;
    
    // Avoid partial matches and fragments
    if (name.includes('...') || name.includes('etc') || name.includes('e.g.')) return false;
    
    // Specific checks by entity type
    switch (kind) {
      case 'person':
        // Should have at least first and last name
        return /^[A-Z][a-z]+(\s+[A-Z]\.?\s*)*[A-Z][a-z]+$/.test(name);
      
      case 'organization':
        // Should be properly capitalized
        return /^[A-Z]/.test(name);
        
      case 'technology':
      case 'product':
      case 'component':
        // Should not be just common adjectives
        return !['additional', 'recent', 'new', 'old', 'current', 'existing'].includes(name.toLowerCase());
        
      default:
        return true;
    }
  }
  
  /**
   * Filter and deduplicate entities
   */
  private filterAndDeduplicate(entities: Partial<Entity>[]): Partial<Entity>[] {
    const seen = new Map<string, Partial<Entity>>();
    
    entities.forEach(entity => {
      if (!entity.name) return;
      
      const key = `${entity.kind}:${entity.name.toLowerCase()}`;
      const existing = seen.get(key);
      
      if (!existing) {
        seen.set(key, entity);
      } else {
        // Merge mention counts and use higher authority score
        existing.mentionCount = (existing.mentionCount || 0) + (entity.mentionCount || 0);
        existing.authorityScore = Math.max(existing.authorityScore || 0, entity.authorityScore || 0);
      }
    });
    
    return Array.from(seen.values()).filter(e => (e.mentionCount || 0) >= 1);
  }
  
  private getKindDescription(kind: EntityKind): string {
    const descriptions = {
      person: 'Person',
      organization: 'Organization', 
      product: 'Product',
      technology: 'Technology',
      component: 'Component',
      document: 'Document',
      dataset: 'Dataset'
    };
    return descriptions[kind] || 'Entity';
  }
}

// Export singleton instance
export const domainEntityExtractor = new DomainEntityExtractor();

/**
 * Process document entities using domain-specific extraction
 */
export async function processDocumentEntitiesDomain(documentId: string): Promise<void> {
  console.log(`🚀 Starting domain entity extraction for document: ${documentId}`);
  
  try {
    // Get document metadata
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, title, doc_type, patent_no, doi, arxiv_id, iso_date')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // Get document chunks
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId);

    if (chunksError || !chunks) {
      throw new Error(`Document chunks not found: ${chunksError?.message}`);
    }

    // Transform to expected format
    const metadata: DocumentMetadata = {
      title: document.title,
      docType: document.doc_type,
      patentNo: document.patent_no,
      doi: document.doi,
      arxivId: document.arxiv_id,
      date: document.iso_date
    };

    const documentChunks: DocumentChunk[] = chunks.map(chunk => ({ content: chunk.content }));

    // Extract entities
    const result = await domainEntityExtractor.extractFromDocument(metadata, documentChunks);
    
    if (result.entities.length === 0) {
      console.log('✅ No entities extracted from this document');
      return;
    }

    console.log(`💾 Saving ${result.entities.length} entities to database...`);

    // Save entities to database
    for (const entity of result.entities) {
      const { error: entityError } = await supabaseAdmin
        .from('entities')
        .insert({
          name: entity.name!,
          kind: entity.kind!,
          description: entity.description,
          authority_score: entity.authorityScore,
          mention_count: entity.mentionCount
        });

      if (entityError) {
        // Check if it's a duplicate key error, if so just update mention count
        if (entityError.code === '23505') {
          const { error: updateError } = await supabaseAdmin
            .from('entities')
            .update({
              mention_count: entity.mentionCount,
              authority_score: Math.max(entity.authorityScore || 0, 0.5)
            })
            .eq('name', entity.name!)
            .eq('kind', entity.kind!);
            
          if (updateError) {
            console.error(`Error updating entity ${entity.name}:`, updateError);
          }
        } else {
          console.error(`Error saving entity ${entity.name}:`, entityError);
        }
      }
    }

    console.log('✅ Domain entities saved successfully');
    console.log(`✅ Domain entity extraction completed for document: ${document.title}`);

  } catch (error) {
    console.error('❌ Error in domain entity extraction:', error);
    throw error;
  }
}