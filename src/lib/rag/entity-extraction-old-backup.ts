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
import { pressArticleEntityExtractor } from './press-article-entity-extractor';
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
  
  // Markdown and document formatting fragments
  /\|.*\|/,  // Contains pipe characters (markdown tables)
  /\\n|\\t|\\r/,  // Contains escape sequences
  /\[.*?\]\(.*$/,  // Contains incomplete markdown links
  /https?:\/\/[^\s]*$/,  // Ends with incomplete URLs
  /^.*\]\([^)]*$/,  // Incomplete markdown link ending
  /^.*patents\.google/i,  // Patent URL fragments
  /^.*scholar\./i,  // Google Scholar fragments
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

// =======================
// Section-Aware Authority Scoring
// =======================

// Document section types with associated authority modifiers
enum DocumentSection {
  TITLE = 'title',
  ABSTRACT = 'abstract', 
  CLAIMS = 'claims',
  DESCRIPTION = 'description',
  BACKGROUND = 'background',
  CITATIONS = 'citations',
  REFERENCES = 'references',
  UNKNOWN = 'unknown'
}

// Authority score modifiers based on document section
const SECTION_AUTHORITY_MODIFIERS = {
  [DocumentSection.TITLE]: 1.0,        // Highest priority
  [DocumentSection.ABSTRACT]: 0.9,     // Very high priority
  [DocumentSection.CLAIMS]: 0.85,      // High priority for patents
  [DocumentSection.DESCRIPTION]: 0.7,  // Medium priority
  [DocumentSection.BACKGROUND]: 0.4,   // Low priority
  [DocumentSection.CITATIONS]: 0.2,    // Very low priority
  [DocumentSection.REFERENCES]: 0.2,   // Very low priority
  [DocumentSection.UNKNOWN]: 0.5       // Default
};

// Base authority scores for different entity types and sources
const BASE_AUTHORITY_SCORES = {
  // Structured metadata (highest authority)
  structured: {
    person: 0.95,      // Patent inventors, paper authors
    organization: 0.9, // Patent assignees, institutions
    technology: 0.8,   // Extracted from structured fields
    product: 0.8,      // From structured product info
    component: 0.7     // From structured specs
  },
  // Content extraction (varies by section)
  content: {
    person: 0.6,       // Modified by section
    organization: 0.6, // Modified by section  
    technology: 0.7,   // Modified by section
    product: 0.6,      // Modified by section
    component: 0.5     // Modified by section
  }
};

// Patent section detection patterns
const PATENT_SECTION_PATTERNS = {
  [DocumentSection.TITLE]: [
    /^(.+?)(?:\n|BACKGROUND|SUMMARY|FIELD|TECHNICAL)/i,
    /^title:\s*(.+?)(?:\n|$)/im
  ],
  [DocumentSection.ABSTRACT]: [
    /(?:^|\n)\s*(?:ABSTRACT|Abstract)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:BACKGROUND|FIELD|CLAIMS|DESCRIPTION|SUMMARY))/im,
    /(?:^|\n)\s*(?:SUMMARY|Summary)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:BACKGROUND|CLAIMS|DESCRIPTION))/im
  ],
  [DocumentSection.CLAIMS]: [
    /(?:^|\n)\s*(?:CLAIMS?|Claims?)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:DESCRIPTION|BACKGROUND|REFERENCES|$))/im,
    /(?:^|\n)\s*(?:What is claimed|I claim)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:DESCRIPTION|BACKGROUND|REFERENCES|$))/im
  ],
  [DocumentSection.BACKGROUND]: [
    /(?:^|\n)\s*(?:BACKGROUND|Background|PRIOR ART|Prior Art)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:SUMMARY|DESCRIPTION|CLAIMS|FIELD))/im,
    /(?:^|\n)\s*(?:FIELD OF|Field of)\s*(?:THE\s+)?(?:INVENTION|Invention)\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:BACKGROUND|SUMMARY|DESCRIPTION))/im
  ],
  [DocumentSection.CITATIONS]: [
    /(?:^|\n)\s*(?:REFERENCES|References|CITATIONS|Citations|BIBLIOGRAPHY|Bibliography)\s*:?\s*\n([\s\S]*?)(?:\n\s*$)/im,
    /\[(\d+)\]\s+[A-Z]/gm, // Citation patterns like [1] Author
    /et\s+al\./gi // "et al." patterns
  ]
};

/**
 * Detect which section of a document contains a given text
 */
function detectEntityDocumentSection(content: string, entityText: string, docType: string): DocumentSection {
  if (docType !== 'patent') {
    return DocumentSection.UNKNOWN;
  }

  // Find the position of the entity in the document
  const entityIndex = content.toLowerCase().indexOf(entityText.toLowerCase());
  if (entityIndex === -1) {
    return DocumentSection.UNKNOWN;
  }

  // Check each section to see which one contains this entity
  for (const [section, patterns] of Object.entries(PATENT_SECTION_PATTERNS)) {
    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const sectionStart = match.index || 0;
        const sectionEnd = sectionStart + match[0].length;
        
        // Check if entity is within this section
        if (entityIndex >= sectionStart && entityIndex <= sectionEnd) {
          return section as DocumentSection;
        }
      }
    }
  }

  return DocumentSection.UNKNOWN;
}

/**
 * Calculate contextual authority score based on entity type, source, and document section
 */
function calculateEntityAuthorityScore(
  entityKind: EntityKind, 
  isStructured: boolean,
  section: DocumentSection = DocumentSection.UNKNOWN,
  mentionCount: number = 1
): number {
  // Get base score
  const baseScores = isStructured ? BASE_AUTHORITY_SCORES.structured : BASE_AUTHORITY_SCORES.content;
  const baseScore = baseScores[entityKind] || 0.5;
  
  // Apply section modifier (only for content extraction)
  const sectionModifier = isStructured ? 1.0 : SECTION_AUTHORITY_MODIFIERS[section];
  
  // Apply mention count boost (diminishing returns)
  const mentionBoost = Math.min(0.2, (mentionCount - 1) * 0.05);
  
  // Calculate final score (capped at 1.0)
  const finalScore = Math.min(1.0, baseScore * sectionModifier + mentionBoost);
  
  return Math.round(finalScore * 100) / 100; // Round to 2 decimal places
}

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
// Relationship Extraction Patterns
// =======================

// Spatial computing relationship patterns for high-quality edge extraction
const RELATIONSHIP_PATTERNS = {
  // Technology/Component relationships - "uses", "implements", "enables"
  uses_component: [
    /([A-Z][A-Za-z\s]+(?:display|technology|system|device))\s+(?:uses?|utilizing?|employs?|incorporates?)\s+([A-Z][A-Za-z\s]+(?:cell|layer|component|lens|barrier|material))/gi,
    /([A-Z][A-Za-z\s]+(?:display|screen|system))\s+(?:with|having|featuring)\s+([A-Z][A-Za-z\s]+(?:cell|component|element|layer))/gi,
  ],
  
  // Alternative implementation relationships - "can use", "may employ"
  can_use: [
    /([A-Z][A-Za-z\s]+(?:display|technology|system))\s+(?:can|may|might)\s+(?:use|employ|utilize|incorporate)\s+([A-Z][A-Za-z\s]+(?:cell|layer|component|lens|barrier|material|element))/gi,
    /([A-Z][A-Za-z\s]+(?:display|system))\s+(?:alternatively|optionally)\s+(?:uses?|employs?)\s+([A-Z][A-Za-z\s]+(?:component|element|technology))/gi,
    /(?:either|both)\s+([A-Z][A-Za-z\s]+(?:barrier|lens|component))\s+(?:or|and)\s+([A-Z][A-Za-z\s]+(?:barrier|lens|component))\s+(?:can|may)\s+(?:be used|enable)/gi,
  ],
  
  // Enhancement relationships - "enhances", "improves", "adds to"
  enhances: [
    /([A-Z][A-Za-z\s]+(?:tracking|technology|system))\s+(?:enhances?|improves?|augments?)\s+([A-Z][A-Za-z\s]+(?:display|technology|viewing))/gi,
    /([A-Z][A-Za-z\s]+(?:technology|system))\s+(?:adds?|provides?)\s+(?:enhanced|improved)\s+([A-Z][A-Za-z\s]+(?:viewing|experience|capability))/gi,
    /(?:enhanced|improved)\s+([A-Z][A-Za-z\s]+(?:display|viewing))\s+(?:using|with|via)\s+([A-Z][A-Za-z\s]+(?:tracking|technology))/gi,
  ],
  
  // Evolution relationships - "evolved to", "replaced by"  
  evolved_to: [
    /([A-Z][A-Za-z\s]+(?:technology|approach))\s+(?:evolved|developed|progressed)\s+(?:to|into)\s+([A-Z][A-Za-z\s]+(?:technology|approach))/gi,
    /([A-Z][A-Za-z\s]+(?:technology|system))\s+(?:was|were)\s+(?:replaced|superseded)\s+by\s+([A-Z][A-Za-z\s]+(?:technology|system))/gi,
  ],
  
  // Alternative technology relationships
  alternative_to: [
    /([A-Z][A-Za-z\s]+(?:barrier|component|technology))\s+(?:as an alternative to|instead of|rather than)\s+([A-Z][A-Za-z\s]+(?:barrier|component|technology))/gi,
    /(?:alternative|competing)\s+(?:approaches?|technologies?)\s+(?:include|are)\s+([A-Z][A-Za-z\s]+)\s+(?:and|or|versus)\s+([A-Z][A-Za-z\s]+)/gi,
  ],
  
  enables_3d: [
    /([A-Z][A-Za-z\s]+(?:lens|barrier|technology|system))\s+(?:enables?|allows?|provides?|creates?)\s+(?:3D|three-dimensional|autostereoscopic|stereoscopic)\s+([A-Za-z\s]+(?:display|viewing|effect|experience))/gi,
    /(?:3D|three-dimensional|autostereoscopic)\s+([A-Za-z\s]+(?:display|viewing))\s+(?:using|via|through|by means of)\s+([A-Z][A-Za-z\s]+(?:technology|lens|barrier|system))/gi,
  ],
  
  implements: [
    /([A-Z][A-Za-z\s]+(?:system|device|technology))\s+(?:implements?|employs?|utilizes?)\s+([A-Z][A-Za-z\s]+(?:algorithm|method|technique|approach))/gi,
    /(?:implementation|use) of\s+([A-Z][A-Za-z\s]+(?:algorithm|method|technique))\s+in\s+([A-Z][A-Za-z\s]+(?:system|device|display))/gi,
  ],
  
  integrates_with: [
    /([A-Z][A-Za-z\s]+(?:platform|system|sdk|runtime))\s+(?:integrates?|works?)\s+with\s+([A-Z][A-Za-z\s]+(?:device|system|platform|hardware))/gi,
    /([A-Z][A-Za-z\s]+(?:device|system))\s+(?:compatible|integrated)\s+with\s+([A-Z][A-Za-z\s]+(?:platform|system|software))/gi,
  ],
  
  similar_to: [
    /([A-Z][A-Za-z\s]+(?:technology|method|approach))\s+(?:similar to|like|comparable to|analogous to)\s+([A-Z][A-Za-z\s]+(?:technology|method|approach))/gi,
    /(?:both|either)\s+([A-Z][A-Za-z\s]+)\s+and\s+([A-Z][A-Za-z\s]+)\s+(?:provide|offer|enable)\s+(?:similar|comparable)/gi,
  ],
  
  competing_with: [
    /([A-Z][A-Za-z\s]+(?:product|device|system|platform))\s+(?:competes?|rivals?|alternatives?)\s+(?:with|to)\s+([A-Z][A-Za-z\s]+(?:product|device|system|platform))/gi,
    /(?:compared to|versus|vs\.?)\s+([A-Z][A-Za-z\s]+(?:device|system|platform)),\s+([A-Z][A-Za-z\s]+(?:device|system|platform))/gi,
  ]
};

// Metadata-based relationship patterns (high confidence)
const METADATA_RELATIONSHIPS = {
  // Patent inventor → document
  inventor_of: (inventors: string[], documentId: string) => 
    inventors.map(inventor => ({
      srcName: inventor.trim(),
      srcType: 'person' as EntityKind,
      relation: 'inventor_of',
      dstName: documentId,
      dstType: 'document' as EntityKind,
      confidence: 0.95,
      evidenceText: 'Patent metadata'
    })),
    
  // Patent assignee → document  
  assignee_of: (assignees: string[], documentId: string) =>
    assignees.map(assignee => ({
      srcName: assignee.trim(), 
      srcType: 'organization' as EntityKind,
      relation: 'assignee_of',
      dstName: documentId,
      dstType: 'document' as EntityKind,
      confidence: 0.95,
      evidenceText: 'Patent metadata'
    }))
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
  
  // =======================
  // Relationship Extraction Methods
  // =======================
  
  /**
   * Extract metadata-based relationships (high confidence)
   */
  private extractMetadataRelationships(metadata: DocumentMetadata & any): Array<{
    srcName: string;
    srcType: EntityKind;
    relation: string;
    dstName: string;
    dstType: EntityKind;
    confidence: number;
    evidenceText: string;
  }> {
    const relationships: Array<any> = [];
    
    if (metadata.docType === 'patent') {
      const documentTitle = metadata.title || metadata.patentNo || 'Patent Document';
      
      // Extract inventor_of relationships
      if (metadata.inventors && Array.isArray(metadata.inventors)) {
        const inventorRelationships = METADATA_RELATIONSHIPS.inventor_of(
          metadata.inventors, 
          documentTitle
        );
        relationships.push(...inventorRelationships);
      }
      
      // Extract assignee_of relationships
      if (metadata.assignees && Array.isArray(metadata.assignees)) {
        const assigneeRelationships = METADATA_RELATIONSHIPS.assignee_of(
          metadata.assignees, 
          documentTitle
        );
        relationships.push(...assigneeRelationships);
      }
      
      // Handle single assignee strings
      if (metadata.original_assignee && typeof metadata.original_assignee === 'string') {
        const assigneeRelationships = METADATA_RELATIONSHIPS.assignee_of(
          [metadata.original_assignee], 
          documentTitle
        );
        relationships.push(...assigneeRelationships);
      }
    }
    
    return relationships;
  }
  
  /**
   * Determine whether to keep an entity based on type, authority score, and context
   */
  private shouldKeepEntity(
    entityKind: EntityKind,
    authorityScore: number, 
    section: DocumentSection,
    mentionCount: number
  ): boolean {
    // Define minimum authority thresholds by entity type
    const MIN_AUTHORITY_THRESHOLDS = {
      person: 0.4,       // Higher threshold to filter citation noise
      organization: 0.3, // Lower threshold, organizations are generally valuable
      technology: 0.25,  // Technical terms are valuable even at lower authority
      product: 0.3,      // Products need medium authority
      component: 0.2     // Components can be valuable even at low authority
    };
    
    const minThreshold = MIN_AUTHORITY_THRESHOLDS[entityKind] || 0.3;
    
    // Basic authority check
    if (authorityScore < minThreshold) {
      return false;
    }
    
    // Special rules for different entity types
    switch (entityKind) {
      case 'person':
        // For persons, be more strict about citations section
        if (section === DocumentSection.CITATIONS || section === DocumentSection.REFERENCES) {
          return authorityScore >= 0.6 || mentionCount >= 3; // Very high bar for citations
        }
        // For other sections, standard threshold applies
        return authorityScore >= minThreshold;
        
      case 'organization':
        // Organizations are generally valuable, keep most of them
        return authorityScore >= minThreshold;
        
      case 'technology':
        // Technology terms are valuable for search, keep them even at lower authority
        return authorityScore >= minThreshold;
        
      case 'product': 
        // Products need decent authority to avoid junk
        return authorityScore >= minThreshold;
        
      case 'component':
        // Components are technical building blocks, valuable for search
        return authorityScore >= minThreshold;
        
      default:
        return authorityScore >= 0.3;
    }
  }
  
  /**
   * Extract content-based relationships using pattern matching
   */
  private extractContentRelationships(content: string): Array<{
    srcName: string;
    srcType: EntityKind;
    relation: string; 
    dstName: string;
    dstType: EntityKind;
    confidence: number;
    evidenceText: string;
  }> {
    const relationships: Array<any> = [];
    
    // Extract spatial computing relationships
    for (const [relationType, patterns] of Object.entries(RELATIONSHIP_PATTERNS)) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const srcEntity = match[1]?.trim();
          const dstEntity = match[2]?.trim();
          const evidenceText = match[0];
          
          // Validate both entities
          if (srcEntity && dstEntity && 
              isValidEntity(srcEntity) && isValidEntity(dstEntity) &&
              srcEntity !== dstEntity) {
            
            // Determine entity types based on relation context
            const { srcType, dstType } = this.inferEntityTypes(relationType, srcEntity, dstEntity);
            
            relationships.push({
              srcName: srcEntity,
              srcType,
              relation: relationType,
              dstName: dstEntity, 
              dstType,
              confidence: 0.7, // Medium confidence for content-based extraction
              evidenceText: evidenceText.substring(0, 200) // Limit evidence text
            });
          }
        }
      }
    }
    
    return relationships;
  }
  
  /**
   * Infer entity types based on relationship context and entity names
   */
  private inferEntityTypes(relation: string, srcEntity: string, dstEntity: string): {
    srcType: EntityKind;
    dstType: EntityKind;
  } {
    // Default types based on relation semantics
    const relationMappings: Record<string, { srcType: EntityKind; dstType: EntityKind }> = {
      uses_component: { srcType: 'technology', dstType: 'component' },
      can_use: { srcType: 'technology', dstType: 'component' },
      enhances: { srcType: 'technology', dstType: 'technology' },
      evolved_to: { srcType: 'technology', dstType: 'technology' },
      alternative_to: { srcType: 'component', dstType: 'component' },
      enables_3d: { srcType: 'technology', dstType: 'technology' },
      implements: { srcType: 'product', dstType: 'technology' },
      integrates_with: { srcType: 'product', dstType: 'product' },
      similar_to: { srcType: 'technology', dstType: 'technology' },
      competing_with: { srcType: 'product', dstType: 'product' }
    };
    
    const defaultTypes = relationMappings[relation] || { srcType: 'technology', dstType: 'technology' };
    
    // Refine types based on entity name patterns
    const srcType = this.inferEntityTypeFromName(srcEntity) || defaultTypes.srcType;
    const dstType = this.inferEntityTypeFromName(dstEntity) || defaultTypes.dstType;
    
    return { srcType, dstType };
  }
  
  /**
   * Infer entity type from name patterns
   */
  private inferEntityTypeFromName(entityName: string): EntityKind | null {
    const name = entityName.toLowerCase();
    
    // Component patterns
    if (/\b(cell|layer|component|element|material|lens|barrier)\b/.test(name)) {
      return 'component';
    }
    
    // Product patterns  
    if (/\b(iphone|ipad|quest|vision pro|unity|sdk|runtime|platform)\b/.test(name)) {
      return 'product';
    }
    
    // Technology patterns
    if (/\b(display|technology|algorithm|method|technique|system)\b/.test(name)) {
      return 'technology';
    }
    
    // Person patterns
    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(entityName.trim())) {
      return 'person';
    }
    
    return null;
  }
  
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
    if (!chunks || !Array.isArray(chunks)) {
      console.error('❌ Chunks parameter is undefined or not an array:', chunks);
      return { entities, aliases, relationships };
    }
    const fullContent = chunks.map(chunk => chunk.content).join('\n\n');
    const contentEntities = this.extractFromContent(fullContent, metadata.docType);
    entities.push(...contentEntities.entities);
    aliases.push(...contentEntities.aliases);
    
    // 3. Extract document-specific patterns
    if (metadata.docType === 'patent') {
      const patentEntities = await this.extractFromPatentContent(fullContent, metadata);
      entities.push(...patentEntities.entities);
      relationships.push(...patentEntities.relationships);
    } else if (metadata.docType === 'paper' || metadata.docType === 'pdf') {
      const paperEntities = this.extractFromPaperContent(fullContent, metadata);
      entities.push(...paperEntities.entities);
      relationships.push(...paperEntities.relationships);
    } else if (metadata.docType === 'press-article') {
      const pressEntities = this.extractFromPressArticleContent(fullContent, metadata);
      entities.push(...pressEntities.entities);
      relationships.push(...pressEntities.relationships);
    }
    
    // 4. Extract content-based relationships using pattern matching
    const contentRelationships = this.extractContentRelationships(fullContent);
    relationships.push(...contentRelationships);
    
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
    
    console.log(`🔍 Extracting from metadata for ${metadata.docType} document: ${metadata.title}`);
    
    // For patents: extract inventors (persons) and assignees (organizations) 
    if (metadata.docType === 'patent') {
      // Extract inventors as person entities
      let inventors = metadata.inventors;
      // Handle case where inventors might be stored as JSON string in database
      if (typeof inventors === 'string') {
        try {
          inventors = JSON.parse(inventors);
        } catch (e) {
          console.warn('Failed to parse inventors JSON:', e);
          inventors = [];
        }
      }
      
      if (inventors && Array.isArray(inventors)) {
        console.log(`📋 Patent has ${inventors.length} inventors:`, inventors);
        inventors.forEach((inventor: string) => {
          console.log(`👤 Processing inventor: "${inventor}"`);
          if (inventor && isValidEntity(inventor.trim(), 'person')) {
            console.log(`✅ Valid inventor entity: "${inventor.trim()}"`);
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
      let assignees = metadata.assignees;
      // Handle case where assignees might be stored as JSON string in database
      if (typeof assignees === 'string') {
        try {
          assignees = JSON.parse(assignees);
        } catch (e) {
          console.warn('Failed to parse assignees JSON:', e);
          assignees = [];
        }
      }
      
      if (assignees && Array.isArray(assignees)) {
        assignees.forEach((assignee: string) => {
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
          // Parse assignees array from JSON if needed
          let assignees = metadata.assignees;
          if (typeof assignees === 'string') {
            try {
              assignees = JSON.parse(assignees);
            } catch (e) {
              console.warn('Failed to parse assignees JSON:', e);
              assignees = [];
            }
          }
          
          // Check if not already included in assignees array
          const alreadyIncluded = assignees?.some((assignee: string) => 
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
    
    // Extract metadata-based relationships (high confidence)
    const metadataRelationships = this.extractMetadataRelationships(metadata);
    relationships.push(...metadataRelationships);
    
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
    const techEntities = this.extractTechnologies(content, docType);
    entities.push(...techEntities);
    
    // Extract product entities
    const productEntities = this.extractProducts(content, docType);
    entities.push(...productEntities);
    
    // Extract organization entities (supplement to NER)
    const orgEntities = this.extractOrganizations(content);
    entities.push(...orgEntities);
    
    // Extract person entities (basic pattern matching)
    const personEntities = this.extractPersons(content, docType);
    entities.push(...personEntities);
    
    // Extract component entities (physical/electrical/optical parts)
    const componentEntities = this.extractComponents(content, docType);
    entities.push(...componentEntities);
    
    return { entities, aliases };
  }
  
  /**
   * Extract technology and algorithm entities with section-aware authority scoring
   */
  private extractTechnologies(content: string, docType: string = 'unknown'): Partial<Entity>[] {
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
            
            // Detect section and calculate mention count
            const section = detectEntityDocumentSection(content, trimmedMatch, docType);
            const mentionCount = (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            
            // Calculate contextual authority score
            const authorityScore = calculateEntityAuthorityScore('technology', false, section, mentionCount);
            
            // Apply filtering based on authority score and section
            const shouldKeep = this.shouldKeepEntity('technology', authorityScore, section, mentionCount);
            
            if (shouldKeep) {
              entities.push({
                name: trimmedMatch,
                kind: 'technology' as EntityKind,
                description: `Technology extracted from document content (${section} section)`,
                authorityScore,
                mentionCount
              });
              
              console.log(`🔧 Technology entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} | Mentions: ${mentionCount}`);
            } else {
              console.log(`❌ Filtered technology entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} (too low)`);
            }
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract product entities
   */
  private extractProducts(content: string, docType: string = 'unknown'): Partial<Entity>[] {
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
            
            // Detect section and calculate mention count
            const section = detectEntityDocumentSection(content, trimmedMatch, docType);
            const mentionCount = (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            
            // Calculate contextual authority score
            const authorityScore = calculateEntityAuthorityScore('product', false, section, mentionCount);
            
            // Apply filtering based on authority score and section
            const shouldKeep = this.shouldKeepEntity('product', authorityScore, section, mentionCount);
            
            if (shouldKeep) {
              entities.push({
                name: trimmedMatch,
                kind: 'product' as EntityKind,
                description: `Product extracted from document content (${section} section)`,
                authorityScore,
                mentionCount
              });
              
              console.log(`📱 Product entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} | Mentions: ${mentionCount}`);
            } else {
              console.log(`❌ Filtered product entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} (too low)`);
            }
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
   * Extract person entities using basic patterns with section-aware authority scoring
   */
  private extractPersons(content: string, docType: string = 'unknown'): Partial<Entity>[] {
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
          
          // Detect section and calculate mention count
          const section = detectEntityDocumentSection(content, name, docType);
          const mentionCount = (content.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
          
          // Calculate contextual authority score
          const authorityScore = calculateEntityAuthorityScore('person', false, section, mentionCount);
          
          // Apply filtering based on authority score and section
          const shouldKeep = this.shouldKeepEntity('person', authorityScore, section, mentionCount);
          
          if (shouldKeep) {
            entities.push({
              name,
              kind: 'person' as EntityKind,
              description: `Person extracted from document content (${section} section)`,
              authorityScore,
              mentionCount
            });
            
            console.log(`👤 Person entity: "${name}" | Section: ${section} | Authority: ${authorityScore} | Mentions: ${mentionCount}`);
          } else {
            console.log(`❌ Filtered person entity: "${name}" | Section: ${section} | Authority: ${authorityScore} (too low)`);
          }
        }
      }
    });
    
    return entities;
  }
  
  /**
   * Extract component entities (physical/electrical/optical parts and materials)
   */
  private extractComponents(content: string, docType: string = 'unknown'): Partial<Entity>[] {
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
            
            // Detect section and calculate mention count
            const section = detectEntityDocumentSection(content, trimmedMatch, docType);
            const mentionCount = (content.match(new RegExp(trimmedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            
            // Calculate contextual authority score
            const authorityScore = calculateEntityAuthorityScore('component', false, section, mentionCount);
            
            // Apply filtering based on authority score and section
            const shouldKeep = this.shouldKeepEntity('component', authorityScore, section, mentionCount);
            
            if (shouldKeep) {
              entities.push({
                name: trimmedMatch,
                kind: 'component' as EntityKind,
                description: `Component extracted from document content (${section} section)`,
                authorityScore,
                mentionCount
              });
              
              console.log(`🔧 Component entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} | Mentions: ${mentionCount}`);
            } else {
              console.log(`❌ Filtered component entity: "${trimmedMatch}" | Section: ${section} | Authority: ${authorityScore} (too low)`);
            }
          }
        });
      }
    });
    
    return entities;
  }
  
  /**
   * Extract patent-specific entities
   */
  private async extractFromPatentContent(content: string, metadata: DocumentMetadata): Promise<{
    entities: Partial<Entity>[];
    relationships: Array<any>;
  }> {
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
    
    // Extract technology evolution relationships for patents
    if (metadata.patentNo) {
      try {
        const { extractPatentEvolutionRelationships } = await import('./patent-evolution-extractor');
        const evolutionRelationships = await extractPatentEvolutionRelationships(
          metadata.patentNo,
          content,
          metadata
        );
        relationships.push(...evolutionRelationships);
        console.log(`🔄 Extracted ${evolutionRelationships.length} evolution relationships for patent ${metadata.patentNo}`);
      } catch (error) {
        console.warn('Failed to extract patent evolution relationships:', error);
      }
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
        if (invention.length > 10 && invention.length < 80 && isValidEntity(invention, 'product')) {
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
          if (isValidEntity(datasetName)) {
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
        if (isValidEntity(method) && 
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
   * Extract press article-specific entities and relationships
   */
  private extractFromPressArticleContent(content: string, metadata: DocumentMetadata): {
    entities: Partial<Entity>[];
    relationships: Array<any>;
  } {
    console.log(`📰 Extracting press article entities for: ${metadata.title}`);
    
    // Use specialized press article extractor
    const pressResult = pressArticleEntityExtractor.extractFromPressArticle(
      metadata.title || 'Untitled Press Article',
      content,
      metadata
    );
    
    // Convert relationship format to match expected structure
    const formattedRelationships = pressResult.relationships.map(rel => ({
      srcName: rel.srcName,
      srcType: rel.srcType,
      relation: rel.relation,
      dstName: rel.dstName,
      dstType: rel.dstType,
      confidence: rel.confidence,
      evidenceText: rel.evidenceText
    }));
    
    console.log(`📰 Press article extraction: ${pressResult.entities.length} entities, ${formattedRelationships.length} relationships`);
    
    return {
      entities: pressResult.entities,
      relationships: formattedRelationships
    };
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
   * Save entities to database with canonical consolidation
   */
  async saveEntities(
    documentId: string,
    entities: Partial<Entity>[],
    aliases: Partial<EntityAlias>[],
    relationships: Array<any>
  ): Promise<void> {
    console.log(`💾 Saving ${entities.length} entities to database with canonical consolidation...`);
    
    try {
      // Import consolidators
      const { entityConsolidator } = await import('./entity-consolidator');
      const { consolidateEntityName, getCanonicalRelationships } = await import('./canonical-entities');
      
      let reusedCount = 0;
      let newCount = 0;
      let canonicalConsolidationCount = 0;
      const consolidatedEntities = new Map<string, string>(); // original name -> canonical name
      
      // First pass: Apply canonical consolidation
      for (const entity of entities) {
        if (!entity.name || !entity.kind) continue;
        
        // Apply canonical consolidation
        const canonicalResult = consolidateEntityName(entity.name, entity.kind);
        
        if (canonicalResult.wasConsolidated) {
          canonicalConsolidationCount++;
          consolidatedEntities.set(entity.name, canonicalResult.canonicalName);
          console.log(`🔄 Canonical consolidation: "${entity.name}" → "${canonicalResult.canonicalName}"`);
          
          // Update entity name to canonical form
          entity.name = canonicalResult.canonicalName;
          if (canonicalResult.matchedCanonical) {
            entity.description = canonicalResult.matchedCanonical.description;
            entity.authorityScore = Math.max(entity.authorityScore || 0, 0.9); // High authority for canonical entities
          }
        }
      }
      
      // Second pass: Save entities with existing consolidation
      for (const entity of entities) {
        if (!entity.name || !entity.kind) continue;
        
        // Use existing consolidator to check for database entities and reuse them
        const consolidationResult = await entityConsolidator.consolidateEntityOnIngestion(
          entity.name,
          entity.kind,
          entity.description
        );
        
        if (consolidationResult.wasReused) {
          reusedCount++;
          console.log(`🔗 Reused existing entity: ${entity.name}`);
        } else {
          newCount++;
          console.log(`🆕 Created new entity: ${entity.name}`);
        }
      }
      
      console.log(`✅ Entities saved: ${canonicalConsolidationCount} canonically consolidated, ${reusedCount} reused, ${newCount} new`);
      
      // Update relationship entity names to use canonical forms
      const updatedRelationships = relationships.map(rel => {
        const updatedRel = { ...rel };
        if (consolidatedEntities.has(rel.srcName)) {
          updatedRel.srcName = consolidatedEntities.get(rel.srcName);
          console.log(`🔄 Updated relationship source: ${rel.srcName} → ${updatedRel.srcName}`);
        }
        if (consolidatedEntities.has(rel.dstName)) {
          updatedRel.dstName = consolidatedEntities.get(rel.dstName);
          console.log(`🔄 Updated relationship destination: ${rel.dstName} → ${updatedRel.dstName}`);
        }
        return updatedRel;
      });
      
      // Add canonical relationships for newly extracted entities
      const canonicalRelationships = [];
      for (const [originalName, canonicalName] of consolidatedEntities.entries()) {
        const relations = getCanonicalRelationships(canonicalName);
        for (const relation of relations) {
          canonicalRelationships.push({
            srcName: relation.fromCanonical,
            srcType: 'technology' as EntityKind, // Will be inferred properly
            relation: relation.relation,
            dstName: relation.toCanonical,
            dstType: 'component' as EntityKind, // Will be inferred properly
            confidence: relation.confidence,
            evidenceText: `Canonical relationship: ${relation.context || ''}`
          });
        }
      }
      
      // Save all relationships
      const allRelationships = [...updatedRelationships, ...canonicalRelationships];
      await this.saveRelationships(allRelationships, documentId);
      console.log(`🔗 Saved ${allRelationships.length} relationships (${canonicalRelationships.length} canonical) to database`);
      
    } catch (error) {
      console.error('Error in saveEntities:', error);
      throw error;
    }
  }
  
  /**
   * Save relationships to database with entity name resolution
   */
  private async saveRelationships(
    relationships: Array<{
      srcName: string;
      srcType: EntityKind;
      relation: string;
      dstName: string;
      dstType: EntityKind;
      confidence: number;
      evidenceText: string;
    }>,
    documentId: string
  ): Promise<void> {
    if (!relationships || relationships.length === 0) {
      return;
    }
    
    try {
      // Resolve entity names to IDs and save relationships
      for (const rel of relationships) {
        // Find source entity ID
        const { data: srcEntity } = await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('name', rel.srcName)
          .eq('kind', rel.srcType)
          .single();
          
        // Find destination entity ID (could be entity or document)
        let dstId = null;
        let dstType: 'entity' | 'document' = 'entity';
        
        if (rel.dstType === 'document') {
          // For document relationships, use the document ID
          dstId = documentId;
          dstType = 'document';
        } else {
          // For entity relationships, find the entity ID
          const { data: dstEntity } = await supabaseAdmin
            .from('entities')
            .select('id')
            .eq('name', rel.dstName)
            .eq('kind', rel.dstType)
            .single();
            
          if (dstEntity) {
            dstId = dstEntity.id;
          }
        }
        
        // Create relationship if both entities exist
        if (srcEntity && dstId) {
          // Use UPSERT to handle unique constraint gracefully
          const { error } = await supabaseAdmin
            .from('edges')
            .upsert({
              src_id: srcEntity.id,
              src_type: 'entity',
              rel: rel.relation,
              dst_id: dstId,
              dst_type: dstType,
              weight: rel.confidence,
              evidence_text: rel.evidenceText,
              evidence_doc_id: documentId
            }, {
              onConflict: 'src_id,src_type,rel,dst_id,dst_type',
              ignoreDuplicates: false  // Update existing relationships
            });
            
          if (error) {
            console.warn(`Failed to save relationship ${rel.srcName} → ${rel.dstName}:`, error.message);
          } else {
            console.log(`✅ Saved relationship: ${rel.srcName} ${rel.relation} ${rel.dstName}`);
          }
        } else {
          console.warn(`⚠️ Missing entities for relationship: ${rel.srcName} → ${rel.dstName}`);
        }
      }
    } catch (error) {
      console.error('Error saving relationships:', error);
      // Don't throw - relationships are non-critical
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
    
    // Map database fields to DocumentMetadata interface
    const documentMetadata: DocumentMetadata = {
      ...document,
      docType: document.doc_type, // Map database field to TypeScript interface
      processingStatus: document.processing_status,
      createdAt: new Date(document.created_at),
      updatedAt: new Date(document.updated_at),
    } as DocumentMetadata;
    
    // Extract entities
    const { entities, aliases, relationships } = await entityExtractor.extractFromDocument(
      documentId,
      documentMetadata,
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