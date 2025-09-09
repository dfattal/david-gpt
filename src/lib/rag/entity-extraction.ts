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

// RAG-optimized entity patterns focusing on meaningful, searchable terms

// Technology patterns - spatial/AR/VR/3D/AI/Quantum ecosystem techniques and methods
const TECHNOLOGY_PATTERNS = [
  // Spatial Display Technologies
  /\b(?:switchable 2D\/3D display|autostereoscopic display|light field display|holographic display)\b/gi,
  /\b(?:lenticular display|parallax barrier|switchable lens|neural depth estimation)\b/gi,
  /\b(?:depth sensing|stereo vision|multi-view rendering|volumetric display)\b/gi,
  
  // AR/VR Technologies
  /\b(?:inside-out tracking|outside-in tracking|SLAM|simultaneous localization|hand tracking)\b/gi,
  /\b(?:eye tracking|gaze tracking|foveated rendering|spatial mapping|occlusion handling)\b/gi,
  /\b(?:6DOF tracking|pose estimation|markerless tracking|optical see-through)\b/gi,
  
  // AI/Computer Vision for Spatial Computing
  /\b(?:stable diffusion|2D\/3D conversion|depth estimation|neural rendering)\b/gi,
  /\b(?:monocular depth|stereo matching|view synthesis|novel view generation)\b/gi,
  /\b(?:computer vision|neural radiance fields?|NeRF|gaussian splatting)\b/gi,
  
  // Quantum Computing
  /\b(?:fault-tolerant quantum computing|quantum error correction|quantum supremacy)\b/gi,
  /\b(?:quantum entanglement|quantum teleportation|quantum cryptography)\b/gi,
  
  // Core Spatial/3D Technologies
  /\b(?:real-time ray tracing|volumetric capture|photogrammetry|3D reconstruction)\b/gi,
  /\b(?:spatial audio|binaural audio|HRTF|3D audio rendering)\b/gi,
];

// Component patterns - spatial computing specific parts, datasets, and building blocks
const COMPONENT_PATTERNS = [
  // Spatial Display Components
  /\b(?:switchable 3D cell|lenticular overlay|diffractive backlight|micro-lens array)\b/gi,
  /\b(?:LC cell|liquid crystal cell|parallax barrier sheet|optical switching layer)\b/gi,
  /\b(?:holographic optical element|HOE|waveguide combiner|light field sensor)\b/gi,
  
  // AR/VR Hardware Components
  /\b(?:IMU sensor|depth camera|time-of-flight sensor|ToF camera)\b/gi,
  /\b(?:OLED microdisplay|waveguide display|birdbath optics|pancake lens)\b/gi,
  /\b(?:tracking camera|inside-out camera|hand tracking sensor)\b/gi,
  
  // AI/ML Datasets and Models
  /\b(?:Holopix 50k dataset|KITTI dataset|ImageNet|COCO dataset)\b/gi,
  /\b(?:NYU Depth dataset|ScanNet|Matterport3D|BlendedMVS)\b/gi,
  /\b(?:transformer model|vision transformer|ViT|neural network architecture)\b/gi,
  
  // Quantum Computing Components
  /\b(?:stabilizer code|surface code|quantum gate|qubit|quantum circuit)\b/gi,
  /\b(?:quantum processor|quantum register|quantum memory|error correction code)\b/gi,
  
  // Specialized Spatial Computing Parts
  /\b(?:depth sensor array|stereo camera rig|lightfield camera|plenoptic camera)\b/gi,
  /\b(?:spatial processing unit|SPU|neural processing unit|NPU|tensor processing unit|TPU)\b/gi,
];

// Product patterns - branded products in spatial/AR/VR/3D/AI/Quantum ecosystem
const PRODUCT_PATTERNS = [
  // Mobile Devices with Spatial Capabilities
  /\b(?:iPhone|iPad|Pixel phone|Galaxy S\d+|OnePlus \d+|Xiaomi \d+)\b/gi,
  /\b(?:iPhone \d+|iPad Pro|Google Pixel|Samsung Galaxy|Huawei P\d+)\b/gi,
  
  // VR/AR Hardware Products
  /\b(?:Meta Quest|Oculus Quest|HoloLens|Magic Leap|Apple Vision Pro)\b/gi,
  /\b(?:Varjo Aero|Pico 4|PlayStation VR|PSVR|Valve Index|HTC Vive)\b/gi,
  /\b(?:Nreal Air|Rokid Air|TCL NXTWEAR|Vuzix Blade|Microsoft HoloLens)\b/gi,
  
  // Spatial Computing Software/Platforms
  /\b(?:LeiaSR Runtime|Immersity Mobile|Unity|Unreal Engine|ARCore|ARKit)\b/gi,
  /\b(?:Snapchat Lens Studio|Spark AR|8th Wall|Niantic Lightship|Vuforia)\b/gi,
  /\b(?:OpenXR|WebXR|SteamVR|Oculus SDK|Windows Mixed Reality)\b/gi,
  
  // AI/ML Products and Platforms
  /\b(?:Stable Diffusion|DALL-E|GPT-4|ChatGPT|Claude|Midjourney)\b/gi,
  /\b(?:TensorFlow|PyTorch|Hugging Face|OpenAI API|Anthropic API)\b/gi,
  /\b(?:NVIDIA Omniverse|Unity MARS|Varjo Reality Cloud|Hologram)\b/gi,
  
  // Quantum Computing Products
  /\b(?:IBM Quantum|Google Quantum AI|IonQ|Rigetti|D-Wave|Azure Quantum)\b/gi,
  /\b(?:Qiskit|Cirq|PennyLane|Amazon Braket|Microsoft Q#)\b/gi,
  
  // Specialized Spatial Hardware
  /\b(?:Intel RealSense|Leap Motion|Ultraleap|Tobii Eye Tracker|SteamVR Base Station)\b/gi,
  /\b(?:ZED Camera|OAK Camera|DepthAI|Luxonis|Structure Sensor)\b/gi,
];

// Organization patterns - companies, universities, OEMs, suppliers, internal teams
const ORGANIZATION_PATTERNS = [
  // Academic institutions
  /\b(?:University of \w+|MIT|Stanford University|Harvard University|UC Berkeley|Caltech|Carnegie Mellon)\b/gi,
  /\b(?:Max Planck Institute|CERN|NASA|NIH|NSF)\b/gi,
  
  // Tech companies & OEMs
  /\b(?:Google LLC|Microsoft Corporation|Apple Inc|Amazon|Meta Platforms)\b/gi,
  /\b(?:Samsung|LG|Sony|Panasonic|Sharp|BOE)\b/gi,
  /\b(?:NVIDIA|Intel|AMD|Qualcomm|Broadcom|Taiwan Semiconductor|TSMC)\b/gi,
  /\b(?:Leia Inc|Koninklijke Philips|Royal Philips|Philips Electronics)\b/gi,
  
  // Patent assignees (common patterns)
  /\b([A-Z][a-zA-Z\s]+(?:Inc|Corp|Corporation|Ltd|Limited|LLC|GmbH|SA|AB))\b/gi,
];

// Entity quality filters
const JUNK_PATTERNS = [
  // Technical fragments and connector phrases
  /^(?:such as|the same as|state of|with the|for the|of the|in the|on the|at the)\b/i,
  /^(?:but a|is fabricated|causes the|act as if|due to the|then the|preferably the)\b/i,
  /\b(?:method|technique|approach|system|device|apparatus)\s*$/i, // Ends with generic terms
  /^[a-z]/,  // Starts with lowercase (likely fragment)
  /\b(?:this|that|these|those|they|it|its|their|them)\b/i, // Contains pronouns
];

// Minimum quality thresholds
const MIN_ENTITY_LENGTH = 3;
const MAX_ENTITY_LENGTH = 80;
const MIN_MEANINGFUL_WORDS = 1; // At least one meaningful word for compound terms

// Common technical stopwords that shouldn't be entities by themselves
const TECHNICAL_STOPWORDS = new Set([
  'system', 'device', 'method', 'apparatus', 'technique', 'approach', 'process',
  'structure', 'element', 'component', 'part', 'section', 'portion', 'area',
  'region', 'layer', 'surface', 'material', 'substance', 'composition',
  'configuration', 'arrangement', 'mechanism', 'operation', 'function',
  'application', 'implementation', 'embodiment', 'invention', 'technology',
  'pixel', 'transistor', 'semiconductor', 'electrode', 'substrate'
]);

// Spatial computing domain keywords that indicate relevance
const SPATIAL_COMPUTING_DOMAINS = new Set([
  'spatial', 'ar', 'vr', '3d', 'augmented', 'virtual', 'mixed', 'reality',
  'holographic', 'stereoscopic', 'depth', 'volumetric', 'immersive',
  'tracking', 'slam', 'pose', 'eye', 'hand', 'gaze', 'foveated',
  'neural', 'ai', 'ml', 'computer vision', 'deep learning',
  'quantum', 'qubit', 'entanglement', 'superposition', 'coherence'
]);

// Domain-specific valid entity indicators for spatial computing ecosystem
const VALID_ENTITY_INDICATORS = {
  organization: [
    /\b(?:corp|corporation|inc|incorporated|ltd|limited|llc|company|co|gmbh)\b/i,
    /\b(?:university|institute|laboratory|lab|research|center|centre)\b/i,
    /\b(?:technologies|systems|solutions|industries|electronics|semiconductors)\b/i
  ],
  technology: [
    // Spatial/AR/VR/3D Technologies
    /\b(?:tracking|slam|mapping|depth|stereo|neural|holographic|lenticular)\b/i,
    /\b(?:switchable|autostereoscopic|parallax|volumetric|immersive|foveated)\b/i,
    /\b(?:pose|eye|hand|gaze|spatial|augmented|virtual|mixed|reality)\b/i,
    // AI/ML Technologies
    /\b(?:learning|vision|diffusion|rendering|synthesis|estimation|recognition)\b/i,
    /\b(?:transformer|nerf|gaussian|splatting|photogrammetry|reconstruction)\b/i,
    // Quantum Technologies
    /\b(?:quantum|fault-tolerant|error correction|entanglement|superposition)\b/i
  ],
  component: [
    // Spatial Computing Hardware Components  
    /\b(?:cell|overlay|backlight|sensor|camera|display|lens|waveguide)\b/i,
    /\b(?:imu|tof|oled|microdisplay|combiner|processor|unit|array)\b/i,
    // AI/ML Components
    /\b(?:dataset|model|architecture|transformer|network|holopix|kitti)\b/i,
    /\b(?:imagenet|coco|scannet|matterport|nyu|blended)\b/i,
    // Quantum Components
    /\b(?:code|stabilizer|surface|gate|qubit|circuit|register|memory)\b/i
  ],
  product: [
    // Branded Spatial Computing Products
    /\b(?:iphone|ipad|pixel|galaxy|quest|hololens|magic leap|vision pro)\b/i,
    /\b(?:varjo|vive|index|pico|nreal|rokid|realsense|leap motion)\b/i,
    // Software Platforms/Products
    /\b(?:runtime|sdk|unity|unreal|arcore|arkit|tensorflow|pytorch)\b/i,
    /\b(?:diffusion|dall-e|gpt|claude|qiskit|cirq|omniverse)\b/i
  ]
};

// =======================
// Entity Validation Functions
// =======================

/**
 * Comprehensive entity validation with multiple quality checks
 */
function isValidEntity(name: string, entityType?: EntityKind): boolean {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // 1. Basic length and character validation
  if (trimmed.length < MIN_ENTITY_LENGTH || trimmed.length > MAX_ENTITY_LENGTH) {
    return false;
  }
  
  // 2. Check for junk patterns (fragments, connectors, etc.)
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.log(`❌ Rejected junk pattern: "${trimmed}" (matched: ${pattern})`);
      return false;
    }
  }
  
  // 3. Reject pure technical stopwords without context
  const lowercased = trimmed.toLowerCase();
  if (TECHNICAL_STOPWORDS.has(lowercased)) {
    console.log(`❌ Rejected technical stopword: "${trimmed}"`);
    return false;
  }
  
  // 4. Reject entities that are mostly punctuation or numbers
  const alphanumericChars = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
  if (alphanumericChars < trimmed.length * 0.6) {
    console.log(`❌ Rejected low alphanumeric content: "${trimmed}"`);
    return false;
  }
  
  // 5. Reject very generic or meaningless combinations
  if (/^(?:the|a|an)\s+/i.test(trimmed) && trimmed.split(' ').length < 3) {
    console.log(`❌ Rejected generic article phrase: "${trimmed}"`);
    return false;
  }
  
  // 6. Check for minimum meaningful content (not just common words)
  const words = trimmed.toLowerCase().split(/\s+/);
  const meaningfulWords = words.filter(word => 
    word.length >= 3 && 
    !['the', 'and', 'for', 'with', 'that', 'this', 'such', 'from', 'into', 'onto'].includes(word)
  );
  
  if (meaningfulWords.length < MIN_MEANINGFUL_WORDS) {
    console.log(`❌ Rejected insufficient meaningful words: "${trimmed}" (only ${meaningfulWords.length})`);
    return false;
  }
  
  // 7. Domain-specific validation for entity types
  if (entityType && VALID_ENTITY_INDICATORS[entityType]) {
    const indicators = VALID_ENTITY_INDICATORS[entityType];
    const hasIndicator = indicators.some(pattern => pattern.test(trimmed));
    
    // For technical domains, require some domain-specific indicators
    if (['technology', 'component'].includes(entityType) && !hasIndicator && words.length < 2) {
      console.log(`❌ Rejected ${entityType} without domain indicators: "${trimmed}"`);
      return false;
    }
  }
  
  // 8. Person name validation
  if (entityType === 'person') {
    return isValidPersonName(trimmed);
  }
  
  // 9. Organization name validation  
  if (entityType === 'organization') {
    return isValidOrganizationName(trimmed);
  }
  
  console.log(`✅ Valid entity: "${trimmed}" (type: ${entityType || 'unknown'})`);
  return true;
}

/**
 * Validate person names specifically
 */
function isValidPersonName(name: string): boolean {
  const trimmed = name.trim();
  
  // Must have at least first and last name, or single well-formed name
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  
  // Each word should be properly capitalized and contain only letters, hyphens, apostrophes
  for (const word of words) {
    if (!/^[A-Z][a-z'-]*$/.test(word) && !/^[A-Z]\.?$/.test(word)) {
      return false;
    }
  }
  
  // Reject common non-person patterns
  if (/\b(?:inc|corp|ltd|llc|co|university|institute|lab)\b/i.test(trimmed)) {
    return false;
  }
  
  return true;
}

/**
 * Validate organization names specifically  
 */
function isValidOrganizationName(name: string): boolean {
  const trimmed = name.trim();
  
  // Organization names should have some substance
  if (trimmed.split(/\s+/).length < 1) return false;
  
  // Should contain at least one meaningful word (not just articles/prepositions)
  const meaningfulWords = trimmed.toLowerCase().split(/\s+/).filter(word =>
    word.length >= 3 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(word)
  );
  
  if (meaningfulWords.length < 1) return false;
  
  // Reject obviously non-organizational terms
  if (/^(?:method|process|system|device|apparatus|technique)$/i.test(trimmed)) {
    return false;
  }
  
  return true;
}

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
   * ONLY extracts organizations from structured metadata to avoid citation noise
   */
  private extractFromMetadata(metadata: DocumentMetadata & any): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    const entities: Partial<Entity>[] = [];
    const relationships: Array<any> = [];
    
    // For patents: extract inventors (persons) and assignees (organizations) 
    if (metadata.docType === 'patent') {
      // Extract inventors as person entities
      if (metadata.inventors && Array.isArray(metadata.inventors)) {
        metadata.inventors.forEach((inventor: string) => {
          if (inventor && isValidEntity(inventor.trim(), 'person')) {
            entities.push({
              name: inventor.trim(),
              kind: 'person' as EntityKind,
              description: `Inventor of patent ${metadata.patentNo || metadata.title}`,
              authorityScore: 0.9, // High authority for structured patent data
              mentionCount: 1
            });
            
            // Create inventor relationship
            relationships.push({
              srcName: inventor.trim(),
              srcType: 'person',
              relation: 'inventor_of',
              dstName: metadata.title,
              dstType: 'document',
              evidenceText: `Listed as inventor in patent ${metadata.patentNo || 'metadata'}`
            });
          }
        });
      }
      
      // Extract assignees as organization entities
      if (metadata.assignees && Array.isArray(metadata.assignees)) {
        metadata.assignees.forEach((assignee: string) => {
          if (assignee && isValidEntity(assignee.trim(), 'organization')) {
            entities.push({
              name: assignee.trim(),
              kind: 'organization' as EntityKind,
              description: `Patent assignee for ${metadata.patentNo || metadata.title}`,
              authorityScore: 0.95, // Very high authority for patent assignees
              mentionCount: 1
            });
            
            // Create assignee relationship
            relationships.push({
              srcName: assignee.trim(),
              srcType: 'organization',
              relation: 'assignee_of',
              dstName: metadata.title,
              dstType: 'document',
              evidenceText: `Listed as assignee in patent ${metadata.patentNo || 'metadata'}`
            });
          }
        });
      }
      
      // Extract original assignee if different from current assignees
      if (metadata.original_assignee && typeof metadata.original_assignee === 'string') {
        const originalAssignee = metadata.original_assignee.trim();
        if (isValidEntity(originalAssignee, 'organization')) {
          // Check if not already included in assignees array
          const alreadyIncluded = metadata.assignees?.some((assignee: string) => 
            assignee.trim().toLowerCase() === originalAssignee.toLowerCase()
          );
          
          if (!alreadyIncluded) {
            entities.push({
              name: originalAssignee,
              kind: 'organization' as EntityKind,
              description: `Original patent assignee for ${metadata.patentNo || metadata.title}`,
              authorityScore: 0.9, // High authority for structured patent data
              mentionCount: 1
            });
            
            relationships.push({
              srcName: originalAssignee,
              srcType: 'organization',
              relation: 'assignee_of',
              dstName: metadata.title,
              dstType: 'document',
              evidenceText: `Listed as original assignee in patent ${metadata.patentNo || 'metadata'}`
            });
          }
        }
      }
    }
    
    // For papers: extract author affiliations from structured metadata
    // TODO: When we have paper author affiliation data, extract organizations here
    if (metadata.doi && metadata.docType === 'paper') {
      // Future: Extract author affiliations from parsed paper metadata
      // This would come from CrossRef, PubMed, or arXiv API responses
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
    
    // Extract component entities (physical/electrical/optical parts)
    const componentEntities = this.extractComponents(content);
    entities.push(...componentEntities);
    
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
          const trimmedMatch = match.trim();
          const normalized = trimmedMatch.toLowerCase();
          
          if (!found.has(normalized) && isValidEntity(trimmedMatch, 'technology')) {
            found.add(normalized);
            entities.push({
              name: trimmedMatch,
              kind: 'technology' as EntityKind,
              description: `Technology extracted from document content`,
              authorityScore: 0.6,
              mentionCount: (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
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
          const trimmedMatch = match.trim();
          const normalized = trimmedMatch.toLowerCase();
          
          if (!found.has(normalized) && isValidEntity(trimmedMatch, 'product')) {
            found.add(normalized);
            entities.push({
              name: trimmedMatch,
              kind: 'product' as EntityKind,
              description: `Product extracted from document content`,
              authorityScore: 0.7,
              mentionCount: (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
            });
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract organization entities - ONLY from structured metadata (assignees/affiliations)
   * NOT from general content to avoid picking up citations and prior art references
   */
  private extractOrganizations(content: string): Partial<Entity>[] {
    // Organizations are now ONLY extracted from structured metadata in extractFromMetadata()
    // This method is kept for API compatibility but returns empty to avoid citation noise
    return [];
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
   * Extract component entities (physical/electrical/optical parts and materials)
   */
  private extractComponents(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const found = new Set<string>();
    
    COMPONENT_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const trimmedMatch = match.trim();
          const normalized = trimmedMatch.toLowerCase();
          
          if (!found.has(normalized) && isValidEntity(trimmedMatch, 'component')) {
            found.add(normalized);
            entities.push({
              name: trimmedMatch,
              kind: 'component' as EntityKind,
              description: `Component extracted from document content`,
              authorityScore: 0.5,
              mentionCount: (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
            });
          }
        });
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
        kind: 'component' as EntityKind, // Classification codes are component identifiers
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
          if (this.isValidEntity(datasetName)) {
            entities.push({
              name: datasetName,
              kind: 'component' as EntityKind, // Datasets are data components
              description: `Dataset mentioned in research paper`,
              authorityScore: 0.7,
              mentionCount: 1
            });
          }
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
        if (this.isValidEntity(method) && 
            !/\b(?:new|novel|improved|enhanced|proposed)\b/i.test(method)) {
          entities.push({
            name: method,
            kind: 'technology' as EntityKind, // Research methods are technologies
            description: `Research methodology/technology`,
            authorityScore: 0.6,
            mentionCount: 1
          });
        }
      }
    });
    
    return { entities, relationships };
  }
  
  /**
   * Enhanced deduplication with semantic similarity and abbreviation matching
   */
  private deduplicateEntities(entities: Partial<Entity>[]): Partial<Entity>[] {
    const deduped = new Map<string, Partial<Entity>>();
    
    // Common abbreviation patterns for technical terms
    const abbreviations = new Map([
      ['liquid crystal', 'lc'],
      ['liquid crystal display', 'lcd'],
      ['organic light emitting diode', 'oled'],
      ['semiconductor', 'semi'],
      ['artificial intelligence', 'ai'],
      ['machine learning', 'ml'],
      ['deep learning', 'dl'],
      ['computer vision', 'cv'],
      ['natural language processing', 'nlp'],
      ['integrated circuit', 'ic'],
      ['field effect transistor', 'fet'],
      ['thin film transistor', 'tft'],
    ]);
    
    // Process entities with advanced deduplication
    entities.forEach(entity => {
      if (!entity.name || !entity.kind) return;
      
      const normalizedName = entity.name.toLowerCase().trim();
      let matchedKey = null;
      let bestMatch = null;
      
      // 1. Check for exact canonical form matches
      const canonical = this.getCanonicalForm(entity.name, abbreviations);
      const canonicalKey = canonical.toLowerCase();
      
      if (deduped.has(canonicalKey)) {
        matchedKey = canonicalKey;
        bestMatch = deduped.get(canonicalKey);
      }
      
      // 2. For organizations, check fuzzy matches for company name variations
      if (!matchedKey && entity.kind === 'organization') {
        for (const [key, existing] of deduped.entries()) {
          if (existing.kind === 'organization' && this.isOrganizationVariant(entity.name, existing.name!)) {
            matchedKey = key;
            bestMatch = existing;
            console.log(`🔗 Organization variant matched: "${entity.name}" → "${existing.name}"`);
            break;
          }
        }
      }
      
      // 3. For technology/components, check semantic similarity  
      if (!matchedKey && (entity.kind === 'technology' || entity.kind === 'component')) {
        for (const [key, existing] of deduped.entries()) {
          if (existing.kind === entity.kind && this.isSemanticallyEquivalent(entity.name, existing.name!, entity.kind)) {
            matchedKey = key;
            bestMatch = existing;
            console.log(`🔗 Semantic match: "${entity.name}" → "${existing.name}"`);
            break;
          }
        }
      }
      
      if (bestMatch) {
        // Merge with existing entity
        bestMatch.mentionCount = (bestMatch.mentionCount || 0) + (entity.mentionCount || 0);
        bestMatch.authorityScore = Math.max(bestMatch.authorityScore || 0, entity.authorityScore || 0);
        
        // Prefer the longer, more descriptive name
        if (entity.name && entity.name.length > (bestMatch.name?.length || 0)) {
          bestMatch.name = entity.name;
          // Update the map key if name changed significantly
          if (matchedKey !== canonicalKey) {
            deduped.delete(matchedKey!);
            deduped.set(canonicalKey, bestMatch);
          }
        }
      } else {
        // Add as new entity
        deduped.set(canonicalKey, { ...entity });
      }
    });
    
    const result = Array.from(deduped.values());
    console.log(`🔀 Deduplication: ${entities.length} → ${result.length} entities`);
    return result;
  }
  
  /**
   * Check if two organization names are variations of the same entity
   */
  private isOrganizationVariant(name1: string, name2: string): boolean {
    const normalize = (name: string) => name
      .toLowerCase()
      .replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company|gmbh|technologies|tech|systems|solutions|industries|electronics|semiconductors)\b\.?/g, '')
      .replace(/[.,\s]+/g, ' ')
      .trim();
    
    const norm1 = normalize(name1);
    const norm2 = normalize(name2);
    
    // Check if core names match
    if (norm1 === norm2) return true;
    
    // Check if one is contained in the other (e.g. "Samsung" vs "Samsung Electronics")
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = norm1.length < norm2.length ? norm1 : norm2;
      const longer = norm1.length < norm2.length ? norm2 : norm1;
      // Only match if the shorter name is substantial (not just "Corp", "Inc", etc.)
      return shorter.length >= 3 && longer.startsWith(shorter);
    }
    
    return false;
  }
  
  /**
   * Check if two technical terms are semantically equivalent
   */
  private isSemanticallyEquivalent(name1: string, name2: string, entityType: EntityKind): boolean {
    const norm1 = name1.toLowerCase().trim();
    const norm2 = name2.toLowerCase().trim();
    
    // Exact match
    if (norm1 === norm2) return true;
    
    // Check for common technical variations
    const variations: { [key: string]: string[] } = {
      'liquid crystal display': ['lcd', 'liquid crystal screen', 'lc display'],
      'organic light emitting diode': ['oled', 'organic led', 'o-led'],
      'light emitting diode': ['led', 'light-emitting diode'],
      'thin film transistor': ['tft', 'thin-film transistor'],
      'field effect transistor': ['fet', 'field-effect transistor'],
      'liquid crystal': ['lc', 'liquid crystals'],
      'neural network': ['neural net', 'artificial neural network', 'ann'],
      'machine learning': ['ml', 'machine-learning'],
      'artificial intelligence': ['ai', 'artificial-intelligence'],
      'integrated circuit': ['ic', 'chip', 'microchip']
    };
    
    // Check if either name has known variations
    for (const [canonical, variants] of Object.entries(variations)) {
      if ((norm1 === canonical && variants.includes(norm2)) || 
          (norm2 === canonical && variants.includes(norm1)) ||
          (variants.includes(norm1) && variants.includes(norm2))) {
        return true;
      }
    }
    
    // For components: check if they refer to the same physical entity
    if (entityType === 'component') {
      // Check for word-order variations (e.g., "crystal liquid" vs "liquid crystal")
      const words1 = norm1.split(/\s+/).sort();
      const words2 = norm2.split(/\s+/).sort();
      if (words1.length === words2.length && words1.every((w, i) => w === words2[i])) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get canonical form for entity name (resolve abbreviations)
   */
  private getCanonicalForm(name: string, abbreviations: Map<string, string>): string {
    // Check for exact matches first
    for (const [fullForm, abbrev] of abbreviations.entries()) {
      if (name === abbrev) {
        return fullForm;
      }
    }
    
    // Check for partial matches (e.g., "LC display" -> "liquid crystal display")
    for (const [fullForm, abbrev] of abbreviations.entries()) {
      if (name.includes(abbrev) && !name.includes(fullForm)) {
        return name.replace(abbrev, fullForm);
      }
    }
    
    return name;
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