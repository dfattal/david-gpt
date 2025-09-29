/**
 * Canonical Entity Definitions and Semantic Consolidation
 *
 * Defines canonical technology and component entities with their aliases
 * and semantic relationships for the David-GPT knowledge graph.
 *
 * Enhanced with robust canonical normalization to prevent entity drift.
 */

import type { EntityKind } from './types';
import {
  normalizeEntity,
  normalizeCanonical,
  findSimilarCanonical,
  type NormalizationResult
} from './canonical-normalizer';

// =======================
// Canonical Entity Definitions
// =======================

export interface CanonicalEntity {
  canonicalName: string;
  kind: EntityKind;
  description: string;
  aliases: string[];
  priority: number; // Higher priority entities take precedence during consolidation
  domain: string; // e.g., 'spatial_computing', 'display_technology'
}

export interface SemanticRelationship {
  fromCanonical: string;
  relation: string;
  toCanonical: string;
  confidence: number;
  context?: string;
}

// =======================
// Leia Technology Ecosystem - Canonical Entities
// =======================

export const CANONICAL_TECHNOLOGIES: CanonicalEntity[] = [
  {
    canonicalName: "Switchable 2D/3D Display Technology",
    kind: "technology",
    description: "Display technology that can switch between 2D and 3D modes, enabling both high-resolution 2D viewing and autostereoscopic 3D viewing",
    aliases: [
      "switchable autostereoscopic display",
      "switchable lightfield display", 
      "switchable 3D display",
      "switchable 2D3D display",
      "switchable multi-view display",
      "autostereoscopic display",
      "lenticular display",
      "multi-view display"
    ],
    priority: 10,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Eye-Tracked Stereoscopic Display Technology", 
    kind: "technology",
    description: "Advanced display technology combining eye-tracking with pixel mapping to project precise stereoscopic views to viewer eyes",
    aliases: [
      "eye-tracked stereoscopic display",
      "eye-tracked 3D display", 
      "gaze-tracked display",
      "pixel mapping display",
      "viewer-tracked display"
    ],
    priority: 9,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Diffractive Lightfield Backlight Technology",
    kind: "technology", 
    description: "Leia's original lightfield display approach using diffractive optical elements in the backlight (2013-2020)",
    aliases: [
      "diffractive lightfield backlight",
      "DLB technology",
      "diffractive backlight technology",
      "lightfield backlight"
    ],
    priority: 8,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Parallax Barrier Technology",
    kind: "technology",
    description: "3D display technology using a physical barrier with precisely positioned slits to direct different images to left and right eyes",
    aliases: [
      "parallax barrier",
      "barrier strip technology", 
      "slit barrier display"
    ],
    priority: 7,
    domain: "spatial_computing"
  }
];

export const CANONICAL_COMPONENTS: CanonicalEntity[] = [
  {
    canonicalName: "Switchable LC Component",
    kind: "component",
    description: "Liquid crystal component that can be electrically switched to enable or disable lenticular focusing",
    aliases: [
      "switchable lenticular",
      "LC lens", 
      "electro-optic material",
      "switchable 3D cell",
      "birefringent electro-optic material",
      "switchable liquid crystal",
      "LC cell",
      "liquid crystal cell",
      "switchable lenticular element"
    ],
    priority: 10,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Diffractive Backlight Component",
    kind: "component", 
    description: "Diffractive optical element integrated into the backlight to create directional light fields",
    aliases: [
      "diffractive backlight",
      "DLB",
      "diffractive optical element",
      "DOE backlight",
      "lightfield backlight unit"
    ],
    priority: 9,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Parallax Barrier Component",
    kind: "component",
    description: "Physical barrier with precise apertures that enables autostereoscopic viewing",
    aliases: [
      "parallax barrier",
      "barrier strip",
      "slit barrier",
      "aperture barrier"
    ],
    priority: 8,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Lenticular Lens Array",
    kind: "component",
    description: "Array of cylindrical lenses that direct light to create multiple viewing zones",
    aliases: [
      "lenticular array",
      "lenticular sheet", 
      "lenticular lens",
      "lenticular element",
      "lens array",
      "cylindrical lens array"
    ],
    priority: 8,
    domain: "spatial_computing"
  },
  {
    canonicalName: "Eye Tracking Sensor",
    kind: "component",
    description: "Sensor system that tracks viewer eye position for gaze-aware displays",
    aliases: [
      "eye tracker",
      "gaze tracker", 
      "eye tracking camera",
      "pupil tracker",
      "viewer position sensor"
    ],
    priority: 7,
    domain: "spatial_computing"
  }
];

// =======================
// Canonical Relationships
// =======================

export const CANONICAL_RELATIONSHIPS: SemanticRelationship[] = [
  // Alternative implementation relationships
  {
    fromCanonical: "Switchable 2D/3D Display Technology",
    relation: "can_use",
    toCanonical: "Switchable LC Component", 
    confidence: 0.95,
    context: "Modern implementation (2024+)"
  },
  {
    fromCanonical: "Switchable 2D/3D Display Technology",
    relation: "can_use", 
    toCanonical: "Diffractive Backlight Component",
    confidence: 0.9,
    context: "Leia's original approach (2013-2023)"
  },
  {
    fromCanonical: "Switchable 2D/3D Display Technology",
    relation: "can_use",
    toCanonical: "Parallax Barrier Component",
    confidence: 0.8,
    context: "Alternative implementation"
  },
  
  // Enhancement relationships
  {
    fromCanonical: "Eye-Tracked Stereoscopic Display Technology",
    relation: "enhances",
    toCanonical: "Switchable 2D/3D Display Technology",
    confidence: 0.95,
    context: "Adds precise view positioning"
  },
  
  // Evolution relationships
  {
    fromCanonical: "Diffractive Lightfield Backlight Technology", 
    relation: "evolved_to",
    toCanonical: "Eye-Tracked Stereoscopic Display Technology",
    confidence: 0.9,
    context: "Leia's technology evolution 2020-2023"
  },
  
  // Alternative relationships
  {
    fromCanonical: "Switchable LC Component",
    relation: "alternative_to", 
    toCanonical: "Diffractive Backlight Component",
    confidence: 0.85,
    context: "Different approaches to switchable 3D"
  },
  {
    fromCanonical: "Parallax Barrier Component",
    relation: "alternative_to",
    toCanonical: "Diffractive Backlight Component", 
    confidence: 0.8,
    context: "Different approaches to autostereoscopic display"
  }
];

// =======================
// Consolidation Functions
// =======================

/**
 * Find canonical entity for a given name with robust normalization
 */
export function findCanonicalEntity(entityName: string, entityKind: EntityKind): CanonicalEntity | null {
  // Use robust canonical normalization
  const normalizedInput = normalizeCanonical(entityName);

  // Search in appropriate canonical entity list
  const entities = entityKind === 'technology' ? CANONICAL_TECHNOLOGIES :
                  entityKind === 'component' ? CANONICAL_COMPONENTS : [];

  for (const canonical of entities.sort((a, b) => b.priority - a.priority)) {
    // Check canonical name with robust normalization
    const normalizedCanonical = normalizeCanonical(canonical.canonicalName);
    if (normalizedCanonical === normalizedInput) {
      return canonical;
    }

    // Check aliases with robust normalization
    for (const alias of canonical.aliases) {
      const normalizedAlias = normalizeCanonical(alias);
      if (normalizedAlias === normalizedInput) {
        return canonical;
      }
    }

    // Check partial matches for compound terms
    if (isPartialMatch(normalizedInput, canonical)) {
      return canonical;
    }
  }

  // Fuzzy matching as fallback for similar entities
  const canonicalNames = entities.map(e => normalizeCanonical(e.canonicalName));
  const similarCanonical = findSimilarCanonical(entityName, canonicalNames, 0.85);

  if (similarCanonical) {
    const matchedEntity = entities.find(e =>
      normalizeCanonical(e.canonicalName) === similarCanonical
    );
    if (matchedEntity) {
      console.log(`🔄 Fuzzy match: "${entityName}" → "${matchedEntity.canonicalName}"`);
      return matchedEntity;
    }
  }

  return null;
}

/**
 * Check if entity name partially matches canonical entity (uses normalized input)
 */
function isPartialMatch(normalizedEntityName: string, canonical: CanonicalEntity): boolean {
  const entityWords = normalizedEntityName.split(/\s+/);
  const canonicalWords = normalizeCanonical(canonical.canonicalName).split(/\s+/);
  
  // For complex technical terms, require substantial overlap
  if (entityWords.length >= 2 && canonicalWords.length >= 2) {
    const commonWords = entityWords.filter(word => 
      canonicalWords.some(canonWord => 
        canonWord.includes(word) || word.includes(canonWord)
      )
    );
    
    // Require at least 50% word overlap for technologies
    if (canonical.kind === 'technology' && commonWords.length >= Math.min(2, entityWords.length * 0.5)) {
      return true;
    }
    
    // More lenient for components
    if (canonical.kind === 'component' && commonWords.length >= 1) {
      // Check for key component indicators
      const componentKeywords = ['cell', 'lens', 'element', 'component', 'material', 'layer', 'barrier'];
      const hasComponentKeyword = entityWords.some(word => componentKeywords.includes(word));
      
      if (hasComponentKeyword) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get all canonical relationships involving an entity
 */
export function getCanonicalRelationships(canonicalName: string): SemanticRelationship[] {
  return CANONICAL_RELATIONSHIPS.filter(rel => 
    rel.fromCanonical === canonicalName || rel.toCanonical === canonicalName
  );
}

/**
 * Consolidate extracted entity name to canonical form with enhanced normalization
 */
export function consolidateEntityName(entityName: string, entityKind: EntityKind): {
  canonicalName: string;
  wasConsolidated: boolean;
  matchedCanonical?: CanonicalEntity;
  normalizationResult?: NormalizationResult;
} {
  // First try exact canonical matching
  const canonical = findCanonicalEntity(entityName, entityKind);

  if (canonical) {
    return {
      canonicalName: canonical.canonicalName,
      wasConsolidated: true,
      matchedCanonical: canonical
    };
  }

  // If no canonical match, apply entity-specific normalization
  const normalizationResult = normalizeEntity(entityName, entityKind);

  // Return normalized name as canonical, preserving original for display
  return {
    canonicalName: normalizationResult.original, // Keep original for display
    wasConsolidated: false,
    normalizationResult
  };
}

/**
 * Enhanced consolidation that includes cross-entity duplicate detection
 */
export function consolidateEntityWithDuplicateDetection(
  entityName: string,
  entityKind: EntityKind,
  existingEntityNames: string[]
): {
  canonicalName: string;
  wasConsolidated: boolean;
  isDuplicate: boolean;
  duplicateOf?: string;
  matchedCanonical?: CanonicalEntity;
  generatedAliases: string[];
} {
  // First try canonical consolidation
  const consolidationResult = consolidateEntityName(entityName, entityKind);

  if (consolidationResult.wasConsolidated) {
    return {
      ...consolidationResult,
      isDuplicate: false,
      generatedAliases: []
    };
  }

  // Check for duplicates among existing entities using normalization
  const normResult = normalizeEntity(entityName, entityKind);
  const candidateCanonical = normResult.canonical;

  // Find potential duplicates
  const existingCanonicals = existingEntityNames.map(name => normalizeCanonical(name));
  const duplicateCanonical = findSimilarCanonical(entityName, existingCanonicals, 0.9);

  if (duplicateCanonical) {
    // Find the original name that corresponds to this canonical
    const duplicateIndex = existingCanonicals.indexOf(duplicateCanonical);
    const duplicateOriginalName = existingEntityNames[duplicateIndex];

    console.log(`🔄 Duplicate detected: "${entityName}" → "${duplicateOriginalName}"`);

    return {
      canonicalName: duplicateOriginalName,
      wasConsolidated: true,
      isDuplicate: true,
      duplicateOf: duplicateOriginalName,
      generatedAliases: [entityName, ...normResult.aliases]
    };
  }

  // No duplicate found, return with normalization
  return {
    canonicalName: normResult.original,
    wasConsolidated: false,
    isDuplicate: false,
    generatedAliases: normResult.aliases
  };
}