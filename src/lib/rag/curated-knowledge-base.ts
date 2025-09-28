/**
 * Curated Knowledge Base for Core Technology Relationships
 *
 * Maintains authoritative technology definitions, relationships, and evolution timelines
 * specifically for David's spatial computing/3D display domain expertise.
 */

import type { EntityKind } from './types';

// =======================
// Core Technology Definitions
// =======================

export interface TechnologyDefinition {
  id: string;
  name: string;
  category: 'display_technology' | 'component' | 'algorithm' | 'system';
  description: string;
  keyInnovations: string[];
  limitations?: string[];
  applications: string[];
  patents: string[];
  authorityLevel: 'canonical' | 'established' | 'emerging';
}

export interface ComponentDefinition {
  id: string;
  name: string;
  type: 'optical' | 'electrical' | 'mechanical' | 'software';
  description: string;
  function: string;
  compatibleTechnologies: string[];
  patents: string[];
  authorityLevel: 'canonical' | 'established' | 'emerging';
}

// =======================
// David's Spatial Computing Domain Knowledge
// =======================

export const CORE_TECHNOLOGIES: TechnologyDefinition[] = [
  {
    id: 'switchable-2d3d-display',
    name: 'Switchable 2D/3D Display Technology',
    category: 'display_technology',
    description:
      'Display technology that can dynamically switch between high-resolution 2D mode and autostereoscopic 3D mode, addressing the resolution trade-off in traditional 3D displays.',
    keyInnovations: [
      'Dynamic mode switching eliminates 3D resolution penalty when not needed',
      'Maintains full display resolution in 2D mode',
      'Enables same hardware for both 2D and 3D content',
    ],
    limitations: [
      'Requires switching mechanism (adds complexity)',
      'May have transition time between modes',
      'Component cost higher than fixed displays',
    ],
    applications: [
      'Mobile devices (phones, tablets)',
      'Automotive displays',
      'Digital signage',
      'Gaming displays',
    ],
    patents: ['US11281020B2', 'WO2012038876A1'],
    authorityLevel: 'canonical',
  },
  {
    id: 'eye-tracked-stereoscopic',
    name: 'Eye-Tracked Stereoscopic Display Technology',
    category: 'display_technology',
    description:
      'Advanced 3D display technology that tracks viewer eye position and dynamically adjusts rendered views for precise stereoscopic projection to each eye.',
    keyInnovations: [
      'Real-time eye position tracking',
      'Dynamic view synthesis and pixel mapping',
      'Precise binocular disparity control',
      'Viewer-adaptive 3D rendering',
    ],
    limitations: [
      'Requires eye tracking hardware',
      'Computational overhead for real-time rendering',
      'Limited to single viewer in optimal range',
    ],
    applications: [
      'Premium mobile displays',
      'Professional 3D workstations',
      'Medical imaging displays',
      'Design visualization systems',
    ],
    patents: ['WO2024145265A1'],
    authorityLevel: 'canonical',
  },
  {
    id: 'diffractive-lightfield-backlight',
    name: 'Diffractive Lightfield Backlight Technology',
    category: 'display_technology',
    description:
      "Leia's original lightfield display approach using diffractive optical elements integrated into the backlight to create directional light fields for autostereoscopic viewing.",
    keyInnovations: [
      'Diffractive optical elements in backlight',
      'Directional light field generation',
      'No front-of-screen optics required',
      'Scalable to large displays',
    ],
    limitations: [
      'Complex backlight design',
      'Manufacturing precision requirements',
      'Power consumption considerations',
      'Fixed viewing zones',
    ],
    applications: [
      'Tablets and laptops',
      'Digital signage',
      'Automotive displays',
      'Professional displays',
    ],
    patents: ['US10830939B2', 'US10838134B2'],
    authorityLevel: 'established',
  },
  {
    id: 'parallax-barrier',
    name: 'Parallax Barrier Technology',
    category: 'display_technology',
    description:
      'Traditional autostereoscopic technology using a physical barrier with precise apertures to separate left and right eye views.',
    keyInnovations: [
      'Simple optical principle',
      'No backlight modification needed',
      'Established manufacturing processes',
    ],
    limitations: [
      'Significant resolution loss',
      'Fixed viewing distance',
      'Reduced brightness',
      'Limited viewing angles',
    ],
    applications: [
      'Early 3D mobile devices',
      'Low-cost 3D displays',
      'Specialty applications',
    ],
    patents: [],
    authorityLevel: 'established',
  },
];

export const CORE_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'switchable-lc-cell',
    name: 'Switchable LC Component',
    type: 'optical',
    description:
      'Liquid crystal cell that can be electrically switched to enable or disable lenticular focusing, enabling dynamic 2D/3D mode switching.',
    function:
      'Electrically controllable optical switching between transparent and lenticular states',
    compatibleTechnologies: [
      'switchable-2d3d-display',
      'eye-tracked-stereoscopic',
    ],
    patents: ['US11281020B2'],
    authorityLevel: 'canonical',
  },
  {
    id: 'diffractive-backlight',
    name: 'Diffractive Backlight Component',
    type: 'optical',
    description:
      'Backlight unit with integrated diffractive optical elements that create directional light fields for autostereoscopic displays.',
    function:
      'Generate multiple directional light cones for different viewing zones',
    compatibleTechnologies: ['diffractive-lightfield-backlight'],
    patents: ['US10830939B2', 'US10838134B2'],
    authorityLevel: 'established',
  },
  {
    id: 'eye-tracking-sensor',
    name: 'Eye Tracking Sensor',
    type: 'electrical',
    description:
      'Camera-based sensor system that tracks viewer eye position in real-time for gaze-aware displays.',
    function:
      'Real-time detection and tracking of viewer eye positions and gaze direction',
    compatibleTechnologies: ['eye-tracked-stereoscopic'],
    patents: ['WO2024145265A1'],
    authorityLevel: 'canonical',
  },
  {
    id: 'parallax-barrier-layer',
    name: 'Parallax Barrier Component',
    type: 'optical',
    description:
      'Physical barrier layer with precisely positioned apertures for traditional autostereoscopic displays.',
    function:
      'Spatial separation of left and right eye images through occlusion',
    compatibleTechnologies: ['parallax-barrier'],
    patents: [],
    authorityLevel: 'established',
  },
];

// =======================
// Technology Evolution Timeline
// =======================

export interface TechnologyEvolution {
  fromTech: string;
  toTech: string;
  evolutionType: 'enhancement' | 'replacement' | 'component_substitution';
  timeframe: string;
  drivingFactors: string[];
  keyInnovations: string[];
}

export const TECHNOLOGY_EVOLUTION_TIMELINE: TechnologyEvolution[] = [
  {
    fromTech: 'parallax-barrier',
    toTech: 'diffractive-lightfield-backlight',
    evolutionType: 'replacement',
    timeframe: '2010-2013',
    drivingFactors: [
      'Need for better brightness',
      'Desire for larger viewing angles',
      'Manufacturing scalability',
    ],
    keyInnovations: [
      'Moved optics from front to backlight',
      'Improved light efficiency',
      'Scalable manufacturing process',
    ],
  },
  {
    fromTech: 'diffractive-lightfield-backlight',
    toTech: 'eye-tracked-stereoscopic',
    evolutionType: 'enhancement',
    timeframe: '2020-2023',
    drivingFactors: [
      'Need for viewer-specific optimization',
      'Better 3D experience quality',
      'Computational power availability',
    ],
    keyInnovations: [
      'Real-time eye tracking',
      'Dynamic view synthesis',
      'Viewer-adaptive rendering',
    ],
  },
  {
    fromTech: 'eye-tracked-stereoscopic',
    toTech: 'switchable-2d3d-display',
    evolutionType: 'component_substitution',
    timeframe: '2024+',
    drivingFactors: [
      'Cost reduction needs',
      'Simpler manufacturing',
      'Power efficiency improvements',
    ],
    keyInnovations: [
      'Switchable LC technology',
      'Dynamic mode selection',
      'Simplified system architecture',
    ],
  },
];

// =======================
// Knowledge Retrieval Functions
// =======================

/**
 * Get comprehensive technology information
 */
export function getTechnologyInfo(
  technologyId: string
): TechnologyDefinition | null {
  return CORE_TECHNOLOGIES.find(tech => tech.id === technologyId) || null;
}

/**
 * Get comprehensive component information
 */
export function getComponentInfo(
  componentId: string
): ComponentDefinition | null {
  return CORE_COMPONENTS.find(comp => comp.id === componentId) || null;
}

/**
 * Find technology by name (fuzzy matching)
 */
export function findTechnologyByName(
  name: string
): TechnologyDefinition | null {
  const normalizedName = name.toLowerCase().trim();

  return (
    CORE_TECHNOLOGIES.find(tech => {
      const techName = tech.name.toLowerCase();
      return (
        techName.includes(normalizedName) ||
        normalizedName.includes(techName) ||
        // Check for key terms
        (normalizedName.includes('switchable') &&
          techName.includes('switchable')) ||
        (normalizedName.includes('eye') &&
          normalizedName.includes('track') &&
          techName.includes('eye-tracked')) ||
        (normalizedName.includes('diffractive') &&
          techName.includes('diffractive')) ||
        (normalizedName.includes('parallax') && techName.includes('parallax'))
      );
    }) || null
  );
}

/**
 * Find component by name (fuzzy matching)
 */
export function findComponentByName(name: string): ComponentDefinition | null {
  const normalizedName = name.toLowerCase().trim();

  return (
    CORE_COMPONENTS.find(comp => {
      const compName = comp.name.toLowerCase();
      return (
        compName.includes(normalizedName) ||
        normalizedName.includes(compName) ||
        // Check for key terms
        (normalizedName.includes('lc') && compName.includes('lc')) ||
        (normalizedName.includes('liquid crystal') &&
          compName.includes('lc')) ||
        (normalizedName.includes('eye') &&
          normalizedName.includes('track') &&
          compName.includes('eye')) ||
        (normalizedName.includes('diffractive') &&
          compName.includes('diffractive')) ||
        (normalizedName.includes('parallax') && compName.includes('parallax'))
      );
    }) || null
  );
}

/**
 * Get technology evolution path
 */
export function getTechnologyEvolution(technologyId: string): {
  predecessors: TechnologyEvolution[];
  successors: TechnologyEvolution[];
} {
  const predecessors = TECHNOLOGY_EVOLUTION_TIMELINE.filter(
    evo => evo.toTech === technologyId
  );
  const successors = TECHNOLOGY_EVOLUTION_TIMELINE.filter(
    evo => evo.fromTech === technologyId
  );

  return { predecessors, successors };
}

/**
 * Get compatible technologies for a component
 */
export function getCompatibleTechnologies(
  componentId: string
): TechnologyDefinition[] {
  const component = getComponentInfo(componentId);
  if (!component) return [];

  return component.compatibleTechnologies
    .map(techId => getTechnologyInfo(techId))
    .filter(tech => tech !== null) as TechnologyDefinition[];
}

/**
 * Get components used by a technology
 */
export function getTechnologyComponents(
  technologyId: string
): ComponentDefinition[] {
  return CORE_COMPONENTS.filter(comp =>
    comp.compatibleTechnologies.includes(technologyId)
  );
}

/**
 * Generate relationship summary for entity pair
 */
export function generateRelationshipSummary(
  entity1: string,
  entity2: string,
  relationshipType: string
): string | null {
  const tech1 = findTechnologyByName(entity1);
  const tech2 = findTechnologyByName(entity2);
  const comp1 = findComponentByName(entity1);
  const comp2 = findComponentByName(entity2);

  // Technology evolution relationships
  if (tech1 && tech2 && relationshipType === 'evolved_to') {
    const evolution = TECHNOLOGY_EVOLUTION_TIMELINE.find(
      evo => evo.fromTech === tech1.id && evo.toTech === tech2.id
    );
    if (evolution) {
      return (
        `${tech1.name} evolved to ${tech2.name} during ${evolution.timeframe}. ` +
        `Key innovations: ${evolution.keyInnovations.join(', ')}. ` +
        `Driving factors: ${evolution.drivingFactors.join(', ')}.`
      );
    }
  }

  // Technology-component relationships
  if (tech1 && comp2 && relationshipType === 'can_use') {
    if (comp2.compatibleTechnologies.includes(tech1.id)) {
      return (
        `${tech1.name} can use ${comp2.name}. ${comp2.description}. ` +
        `Function: ${comp2.function}.`
      );
    }
  }

  // Component alternatives
  if (comp1 && comp2 && relationshipType === 'alternative_to') {
    const commonTechs = comp1.compatibleTechnologies.filter(tech =>
      comp2.compatibleTechnologies.includes(tech)
    );
    if (commonTechs.length > 0) {
      return (
        `${comp1.name} and ${comp2.name} are alternative components for ` +
        `implementing similar display technologies. Both can be used in systems ` +
        `that require switchable or directional display capabilities.`
      );
    }
  }

  return null;
}

/**
 * Get curated knowledge context for a query
 */
export function getCuratedKnowledgeContext(query: string): {
  relevantTechnologies: TechnologyDefinition[];
  relevantComponents: ComponentDefinition[];
  suggestedRelationships: string[];
} {
  const queryLower = query.toLowerCase();

  // Find relevant technologies with fuzzy matching
  const relevantTechnologies = CORE_TECHNOLOGIES.filter(tech => {
    const techNameLower = tech.name.toLowerCase();

    // Direct name matches
    if (
      queryLower.includes(techNameLower) ||
      techNameLower.includes(queryLower)
    ) {
      return true;
    }

    // Key term matches
    const queryTerms = queryLower.split(/\s+/);
    const techTerms = techNameLower.split(/\s+/);

    // Check for significant term overlap
    const commonTerms = queryTerms.filter(qTerm =>
      techTerms.some(tTerm => tTerm.includes(qTerm) || qTerm.includes(tTerm))
    );

    if (commonTerms.length >= Math.min(2, queryTerms.length * 0.5)) {
      return true;
    }

    // Check key innovations and applications
    return (
      tech.keyInnovations.some(innovation =>
        queryTerms.some(term => innovation.toLowerCase().includes(term))
      ) ||
      tech.applications.some(app =>
        queryTerms.some(term => app.toLowerCase().includes(term))
      )
    );
  });

  // Find relevant components with fuzzy matching
  const relevantComponents = CORE_COMPONENTS.filter(comp => {
    const compNameLower = comp.name.toLowerCase();

    // Direct name matches
    if (
      queryLower.includes(compNameLower) ||
      compNameLower.includes(queryLower)
    ) {
      return true;
    }

    // Key term matches
    const queryTerms = queryLower.split(/\s+/);
    const compTerms = compNameLower.split(/\s+/);

    const commonTerms = queryTerms.filter(qTerm =>
      compTerms.some(cTerm => cTerm.includes(qTerm) || qTerm.includes(cTerm))
    );

    if (commonTerms.length >= Math.min(1, queryTerms.length * 0.3)) {
      return true;
    }

    // Check function description
    return queryTerms.some(term => comp.function.toLowerCase().includes(term));
  });

  // Generate suggested relationships
  const suggestedRelationships: string[] = [];

  for (const tech of relevantTechnologies) {
    const components = getTechnologyComponents(tech.id);
    components.forEach(comp => {
      suggestedRelationships.push(`${tech.name} CAN_USE ${comp.name}`);
    });

    const evolution = getTechnologyEvolution(tech.id);
    evolution.successors.forEach(evo => {
      const successorTech = getTechnologyInfo(evo.toTech);
      if (successorTech) {
        suggestedRelationships.push(
          `${tech.name} EVOLVED_TO ${successorTech.name}`
        );
      }
    });
  }

  return {
    relevantTechnologies,
    relevantComponents,
    suggestedRelationships,
  };
}
