/**
 * Domain-Specific Entity Extraction Configurations
 *
 * Pre-configured extraction setups for different domains and use cases.
 * Makes it easy to adapt the unified LLM extractor for different knowledge graphs.
 */

import type { LLMEntityExtractionConfig } from './unified-llm-entity-extractor';
import type { EntityKind } from './types';

// =======================
// David-GPT Leia Technology Configuration
// =======================

export const DAVID_GPT_LEIA_CONFIG: LLMEntityExtractionConfig = {
  systemPrompt: `You are an expert knowledge-graph curator for David Fattal's research corpus.

Your task is to read the supplied document text and extract entities AND relationships in a single pass.

Extract entities from these five categories:
person, organization, technology, product, component.

Focus on content related to:
• Quantum technologies: quantum computing, qubits, quantum gates, error correction, quantum algorithms, quantum physics
• Nanophotonics: nanoscale photonic devices, metamaterials, plasmonics, optical nanostructures, photonic crystals
• Spatial/3D/AR/VR: 3D displays, autostereoscopic displays, lightfield displays, AR/VR technologies, spatial computing, immersive experiences
• Leia Technologies: Leia Inc. products, switchable displays, diffractive backlight, liquid crystal components, eye tracking

Ignore generic terms (e.g. "research", "team", "project", "method", "system") unless they clearly denote a specific named entity.

You will also receive an existing entity list with names/aliases.
Do not duplicate entities already in that list—check both lexical (exact match, case-insensitive) and semantic similarity (different wording, same concept).

For entities, include:
• name: the canonical name as written in the text
• type: one of person | organization | technology | product | component
• aliases: other names or abbreviations found in the text (if any)
• evidence: short snippet (≤40 words) from the text that supports this entity
• confidence: 0–1 estimate of extraction confidence
• temp_id: unique identifier (e1, e2, e3, etc.) for linking to edges

For relationships, extract edges using ONLY these types:
• affiliated_with: person → organization (person works at/for organization)
• made_by: product → organization (organization creates/manufactures product)
• created_by: technology → person (person created/invented technology)
• developed_by: technology → organization (organization developed technology)
• authored_by: technology → person (person authored/researched technology)
• implements: technology → product (product implements/uses technology)
• uses_component: product → component (product contains/uses component)
• supplied_by: component → organization (organization supplies/making component)
• related_to: technology → technology (technologies are related/similar)
• based_on: technology → technology (technology builds upon another)

For edges, include:
• src_temp_id: temp_id of source entity
• dst_temp_id: temp_id of destination entity
• relation: one of the types above
• evidence: short snippet (≤40 words) supporting this relationship
• confidence: 0–1 estimate of relationship confidence

Only extract edges that follow the strict type constraints:
- affiliated_with: person → organization
- made_by: product → organization
- created_by: technology → person
- developed_by: technology → organization
- authored_by: technology → person
- implements: technology → product
- uses_component: product → component
- supplied_by: component → organization
- related_to: technology → technology
- based_on: technology → technology

Return JSON with "entities" and "edges" arrays. No prose.`,

  focusDomains: ['quantum', 'nanophotonics', 'spatial_computing', 'leia_technology'],
  entityTypes: ['person', 'organization', 'technology', 'product', 'component'],
  maxEntitiesPerDocument: 30,
  confidenceThreshold: 0.4,
  includeDomainDescription: true
};

// =======================
// Generic Technology Research Configuration
// =======================

export const GENERIC_TECH_CONFIG: LLMEntityExtractionConfig = {
  systemPrompt: `You are an expert knowledge-graph curator.

Your task is to read the supplied document text and extract entities AND relationships in a single pass.

Extract entities from these five categories:
person, organization, technology, product, component.

Focus on technology and research content. Extract entities that are:
• People: researchers, inventors, authors, executives
• Organizations: companies, universities, research institutions, labs
• Technologies: algorithms, methods, techniques, scientific concepts
• Products: branded products, tools, platforms, software, hardware
• Components: parts, materials, modules, datasets, models

Ignore generic terms unless they clearly denote a specific named entity.

You will receive an existing entity list. Do not duplicate entities already in that list.

For entities, include:
• name: the canonical name as written in the text
• type: one of person | organization | technology | product | component
• aliases: other names or abbreviations found in the text (if any)
• evidence: short snippet (≤40 words) from the text that supports this entity
• confidence: 0–1 estimate of extraction confidence
• temp_id: unique identifier (e1, e2, e3, etc.) for linking to edges

For relationships, extract edges using ONLY these types:
• affiliated_with: person → organization (person works at/for organization)
• made_by: product → organization (organization creates/manufactures product)
• created_by: technology → person (person created/invented technology)
• developed_by: technology → organization (organization developed technology)
• authored_by: technology → person (person authored/researched technology)
• implements: technology → product (product implements/uses technology)
• uses_component: product → component (product contains/uses component)
• supplied_by: component → organization (organization supplies/making component)
• related_to: technology → technology (technologies are related/similar)
• based_on: technology → technology (technology builds upon another)

For edges, include:
• src_temp_id: temp_id of source entity
• dst_temp_id: temp_id of destination entity
• relation: one of the types above
• evidence: short snippet (≤40 words) supporting this relationship
• confidence: 0–1 estimate of relationship confidence

Only extract edges that follow the strict type constraints:
- affiliated_with: person → organization
- made_by: product → organization
- created_by: technology → person
- developed_by: technology → organization
- authored_by: technology → person
- implements: technology → product
- uses_component: product → component
- supplied_by: component → organization
- related_to: technology → technology
- based_on: technology → technology

Return JSON with "entities" and "edges" arrays. No prose.`,

  focusDomains: ['technology', 'research'],
  entityTypes: ['person', 'organization', 'technology', 'product', 'component'],
  maxEntitiesPerDocument: 25,
  confidenceThreshold: 0.5,
  includeDomainDescription: false
};

// =======================
// Computer Vision Research Configuration
// =======================

export const COMPUTER_VISION_CONFIG: LLMEntityExtractionConfig = {
  systemPrompt: `You are an expert knowledge-graph curator specializing in computer vision and machine learning research.

Your task is to extract entities AND relationships from computer vision research documents in a single pass.

Categories:
• person: researchers, authors, professors, industry leaders
• organization: universities, companies, research labs, conferences
• technology: algorithms, architectures, techniques, methods
• product: software frameworks, tools, platforms, hardware
• component: datasets, models, metrics, benchmarks

Focus on computer vision, machine learning, and related AI domains.

You will receive an existing entity list. Avoid duplicates.

For entities include:
• name: canonical name from the text
• type: entity category
• aliases: alternative names/abbreviations
• evidence: supporting text snippet (≤40 words)
• confidence: 0–1 extraction confidence
• temp_id: unique identifier (e1, e2, e3, etc.) for linking to edges

For relationships, extract edges using ONLY these five types:
• affiliated_with: person → organization
• made_by: product → organization
• implements: technology → product
• uses_component: product → component
• supplied_by: component → organization

For edges, include:
• src_temp_id: temp_id of source entity
• dst_temp_id: temp_id of destination entity
• relation: one of the types above
• evidence: short snippet (≤40 words) supporting this relationship
• confidence: 0–1 estimate of relationship confidence

Return JSON with "entities" and "edges" arrays only.`,

  focusDomains: ['computer_vision', 'machine_learning'],
  entityTypes: ['person', 'organization', 'technology', 'product', 'component'],
  maxEntitiesPerDocument: 20,
  confidenceThreshold: 0.6,
  includeDomainDescription: true
};

// =======================
// Business/Press Article Configuration
// =======================

export const BUSINESS_PRESS_CONFIG: LLMEntityExtractionConfig = {
  systemPrompt: `You are an expert knowledge-graph curator for business and press content.

Your task is to extract entities AND relationships from business articles, press releases, and news content in a single pass.

Categories:
• person: executives, journalists, analysts, industry figures
• organization: companies, institutions, agencies, news outlets
• technology: business technologies, platforms, solutions
• product: commercial products, services, brands, offerings
• component: market segments, business units, product features

Focus on business-relevant entities that provide market intelligence and competitive insights.

Avoid generic business terms. Extract specific named entities only.

You will receive an existing entity list. Avoid duplicates.

For entities include:
• name: canonical name from the text
• type: entity category
• aliases: alternative names/variations
• evidence: supporting text snippet (≤40 words)
• confidence: 0–1 extraction confidence
• temp_id: unique identifier (e1, e2, e3, etc.) for linking to edges

For relationships, extract edges using ONLY these five types:
• affiliated_with: person → organization
• made_by: product → organization
• implements: technology → product
• uses_component: product → component
• supplied_by: component → organization

For edges, include:
• src_temp_id: temp_id of source entity
• dst_temp_id: temp_id of destination entity
• relation: one of the types above
• evidence: short snippet (≤40 words) supporting this relationship
• confidence: 0–1 estimate of relationship confidence

Return JSON with "entities" and "edges" arrays only.`,

  focusDomains: ['business', 'technology', 'markets'],
  entityTypes: ['person', 'organization', 'technology', 'product', 'component'],
  maxEntitiesPerDocument: 15,
  confidenceThreshold: 0.5,
  includeDomainDescription: false
};

// =======================
// Configuration Selection Helper
// =======================

export function getExtractionConfig(configName: string): LLMEntityExtractionConfig {
  const configs: Record<string, LLMEntityExtractionConfig> = {
    'david-gpt-leia': DAVID_GPT_LEIA_CONFIG,
    'generic-tech': GENERIC_TECH_CONFIG,
    'computer-vision': COMPUTER_VISION_CONFIG,
    'business-press': BUSINESS_PRESS_CONFIG
  };

  const config = configs[configName];
  if (!config) {
    throw new Error(`Unknown extraction configuration: ${configName}`);
  }

  return config;
}

/**
 * Get configuration based on document type and content analysis
 */
export function selectConfigForDocument(
  docType: string,
  title: string,
  content?: string
): LLMEntityExtractionConfig {
  const titleLower = title.toLowerCase();
  const contentLower = content?.toLowerCase() || '';

  // Check for David-GPT specific domains
  const davidGptKeywords = [
    'leia', 'quantum', 'nanophotonic', 'lightfield', 'autostereoscopic',
    '3d display', 'ar', 'vr', 'spatial computing'
  ];

  if (davidGptKeywords.some(keyword =>
    titleLower.includes(keyword) || contentLower.includes(keyword)
  )) {
    return DAVID_GPT_LEIA_CONFIG;
  }

  // Check for computer vision research
  const cvKeywords = [
    'computer vision', 'machine learning', 'neural network', 'deep learning',
    'cnn', 'transformer', 'dataset', 'benchmark', 'nerf', 'gaussian splatting'
  ];

  if (cvKeywords.some(keyword =>
    titleLower.includes(keyword) || contentLower.includes(keyword)
  )) {
    return COMPUTER_VISION_CONFIG;
  }

  // Check for business/press content
  if (docType === 'press-article' ||
      titleLower.includes('announces') ||
      titleLower.includes('launches') ||
      titleLower.includes('partnership') ||
      contentLower.includes('market') ||
      contentLower.includes('revenue') ||
      contentLower.includes('samsung electronics')) {
    return BUSINESS_PRESS_CONFIG;
  }

  // Default to generic tech configuration
  return GENERIC_TECH_CONFIG;
}

// =======================
// Custom Configuration Builder
// =======================

export class ExtractionConfigBuilder {
  private config: Partial<LLMEntityExtractionConfig> = {};

  static create(): ExtractionConfigBuilder {
    return new ExtractionConfigBuilder();
  }

  systemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt;
    return this;
  }

  focusDomains(domains: string[]): this {
    this.config.focusDomains = domains;
    return this;
  }

  entityTypes(types: EntityKind[]): this {
    this.config.entityTypes = types;
    return this;
  }

  maxEntities(max: number): this {
    this.config.maxEntitiesPerDocument = max;
    return this;
  }

  confidenceThreshold(threshold: number): this {
    this.config.confidenceThreshold = threshold;
    return this;
  }

  includeDomainDescription(include: boolean = true): this {
    this.config.includeDomainDescription = include;
    return this;
  }

  build(): LLMEntityExtractionConfig {
    // Validate required fields
    if (!this.config.systemPrompt) {
      throw new Error('systemPrompt is required');
    }

    return {
      systemPrompt: this.config.systemPrompt,
      focusDomains: this.config.focusDomains || ['technology'],
      entityTypes: this.config.entityTypes || ['person', 'organization', 'technology', 'product', 'component'],
      maxEntitiesPerDocument: this.config.maxEntitiesPerDocument || 20,
      confidenceThreshold: this.config.confidenceThreshold || 0.5,
      includeDomainDescription: this.config.includeDomainDescription || false
    };
  }
}

// =======================
// Example Usage
// =======================

/*
// Using predefined configurations
const config = getExtractionConfig('david-gpt-leia');

// Auto-selecting configuration
const autoConfig = selectConfigForDocument('paper', 'Quantum Computing with Leia Displays');

// Building custom configuration
const customConfig = ExtractionConfigBuilder
  .create()
  .systemPrompt('Extract biotech entities...')
  .focusDomains(['biotechnology', 'pharmaceuticals'])
  .entityTypes(['person', 'organization', 'product'])
  .maxEntities(15)
  .confidenceThreshold(0.7)
  .build();
*/