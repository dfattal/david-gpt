/**
 * Persona Management Service
 *
 * Orchestrates loading, caching, and access to enhanced persona configurations
 * from markdown files and integrates with the existing type registry system.
 */

import { existsSync } from 'fs';
import { PersonaParser, type PersonaParseResult } from './persona-parser';
import { typeRegistry } from '@/lib/rag/type-registry';
import type { EnhancedPersonaConfig, Persona } from '@/lib/rag/types';

export interface PersonaLoadResult {
  success: boolean;
  persona?: EnhancedPersonaConfig;
  errors: string[];
  warnings: string[];
}

export class PersonaManager {
  private static instance: PersonaManager;
  private enhancedPersonas = new Map<Persona, EnhancedPersonaConfig>();
  private personaFilePaths = new Map<Persona, string>();

  private constructor() {
    this.initializeDefaultPaths();
  }

  static getInstance(): PersonaManager {
    if (!PersonaManager.instance) {
      PersonaManager.instance = new PersonaManager();
    }
    return PersonaManager.instance;
  }

  /**
   * Initialize default persona file paths
   */
  private initializeDefaultPaths() {
    this.personaFilePaths.set('david', '/Users/david.fattal/Documents/GitHub/david-gpt/DOCS/Persona.md');
    // Add more default paths as needed
  }

  /**
   * Register a persona file path
   */
  registerPersonaFile(persona: Persona, filePath: string): void {
    this.personaFilePaths.set(persona, filePath);
  }

  /**
   * Load a persona from its markdown file
   */
  async loadPersonaFromMarkdown(persona: Persona, filePath?: string): Promise<PersonaLoadResult> {
    const result: PersonaLoadResult = {
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // Use provided path or default path
      const personaFilePath = filePath || this.personaFilePaths.get(persona);

      if (!personaFilePath) {
        result.errors.push(`No file path configured for persona: ${persona}`);
        return result;
      }

      if (!existsSync(personaFilePath)) {
        result.errors.push(`Persona file not found: ${personaFilePath}`);
        return result;
      }

      // Parse the persona file
      const parseResult = PersonaParser.parsePersonaFile(personaFilePath, persona);

      if (!parseResult.success || !parseResult.config) {
        result.errors.push(...parseResult.errors);
        result.warnings.push(...parseResult.warnings);
        return result;
      }

      // Cache the enhanced persona
      this.enhancedPersonas.set(persona, parseResult.config);

      // Update the type registry with the enhanced configuration
      typeRegistry.registerPersona(persona, parseResult.config);

      result.success = true;
      result.persona = parseResult.config;
      result.warnings.push(...parseResult.warnings);

      console.log(`✅ Successfully loaded enhanced persona: ${persona}`);

    } catch (error) {
      result.errors.push(`Failed to load persona ${persona}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Get enhanced persona configuration
   */
  getEnhancedPersona(persona: Persona): EnhancedPersonaConfig | undefined {
    return this.enhancedPersonas.get(persona);
  }

  /**
   * Get all enhanced personas
   */
  getAllEnhancedPersonas(): Map<Persona, EnhancedPersonaConfig> {
    return new Map(this.enhancedPersonas);
  }

  /**
   * Generate dynamic system prompt for chat
   */
  generateSystemPrompt(persona: Persona, ragContext?: any): string {
    const enhancedPersona = this.enhancedPersonas.get(persona);

    if (enhancedPersona) {
      // Use the rich system prompt from the enhanced persona
      let systemPrompt = enhancedPersona.chat.systemPrompt;

      // Enhance with RAG context if provided
      if (ragContext && ragContext.results && ragContext.results.length > 0) {
        systemPrompt += `\n\nRELEVANT CONTEXT:\nYou have access to the following relevant information from the document corpus:\n\n`;

        ragContext.results.forEach((result: any, index: number) => {
          systemPrompt += `[${index + 1}] ${result.title}\n${result.content}\n\n`;
        });

        systemPrompt += `Use this context to provide accurate, well-sourced responses with appropriate citations [1], [2], etc.`;
      }

      return systemPrompt;
    }

    // Fallback to basic persona configuration
    const basicPersona = typeRegistry.getPersonaConfig(persona);
    if (basicPersona) {
      return this.generateBasicSystemPrompt(basicPersona, ragContext);
    }

    // Ultimate fallback
    return this.getDefaultSystemPrompt(persona, ragContext);
  }

  /**
   * Generate basic system prompt for non-enhanced personas
   */
  private generateBasicSystemPrompt(persona: any, ragContext?: any): string {
    let prompt = `You are an AI assistant specialized in ${persona.name}.

EXPERTISE: ${persona.description}

COMMUNICATION STYLE:
- Maintain professional and knowledgeable tone
- Provide accurate information with proper citations
- Focus on ${persona.name.toLowerCase()} domain expertise

When responding:
1. Draw upon specialized knowledge in your domain
2. Provide well-sourced information with citations
3. Maintain accuracy and professional tone
4. Help users understand complex concepts clearly`;

    if (ragContext && ragContext.results && ragContext.results.length > 0) {
      prompt += `\n\nRELEVANT CONTEXT:\n`;
      ragContext.results.forEach((result: any, index: number) => {
        prompt += `[${index + 1}] ${result.title}\n${result.content}\n\n`;
      });
    }

    return prompt;
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(persona: Persona, ragContext?: any): string {
    const prompts = {
      david: `You are David-GPT, an AI assistant that answers in David Fattal's voice and style. David is a technology entrepreneur and Spatial AI enthusiast.

Key aspects of David's communication style:
- Direct and technical when appropriate
- Enthusiastic about emerging technologies, especially AI and spatial computing
- Business-minded with deep technical knowledge

Always provide accurate, helpful responses with transparent sourcing. Be engaging, knowledgeable, and maintain David's entrepreneurial and technical perspective.`,

      legal: `You are a Legal Expert AI assistant. You provide accurate legal information and analysis while maintaining professional standards.

Communication guidelines:
- Use precise legal terminology
- Cite relevant cases and statutes
- Maintain objectivity and accuracy
- Clarify when providing general information vs. legal advice`,

      medical: `You are a Medical Expert AI assistant. You provide evidence-based medical information and research insights.

Communication guidelines:
- Use appropriate medical terminology
- Cite peer-reviewed sources
- Emphasize evidence-based medicine
- Clarify limitations of general medical information`
    };

    let prompt = prompts[persona] || prompts.david;

    if (ragContext && ragContext.results && ragContext.results.length > 0) {
      prompt += `\n\nRELEVANT CONTEXT:\n`;
      ragContext.results.forEach((result: any, index: number) => {
        prompt += `[${index + 1}] ${result.title}\n${result.content}\n\n`;
      });
    }

    return prompt;
  }

  /**
   * Get persona domain boosts for search
   */
  getPersonaDomainBoosts(persona: Persona): Record<string, number> {
    const enhancedPersona = this.enhancedPersonas.get(persona);
    if (enhancedPersona) {
      return enhancedPersona.chat.domainBoosts;
    }

    // Fallback to basic search boosts
    const basicPersona = typeRegistry.getPersonaConfig(persona);
    return basicPersona?.searchBoosts || {};
  }

  /**
   * Update persona configuration
   */
  updatePersonaConfig(persona: Persona, config: EnhancedPersonaConfig): void {
    this.enhancedPersonas.set(persona, config);
    typeRegistry.registerPersona(persona, config);
  }

  /**
   * Check if persona is enhanced
   */
  isEnhanced(persona: Persona): boolean {
    return this.enhancedPersonas.has(persona);
  }

  /**
   * Get persona expertise domains
   */
  getPersonaExpertise(persona: Persona): Array<{name: string, keywords: string[]}> {
    const enhancedPersona = this.enhancedPersonas.get(persona);
    if (enhancedPersona) {
      return enhancedPersona.expertise.domains.map(domain => ({
        name: domain.name,
        keywords: domain.keywords
      }));
    }
    return [];
  }

  /**
   * Get communication style for persona
   */
  getCommunicationStyle(persona: Persona): any {
    const enhancedPersona = this.enhancedPersonas.get(persona);
    return enhancedPersona?.communicationStyle || null;
  }

  /**
   * Initialize all configured personas
   */
  async initializeAllPersonas(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.personaFilePaths.keys()).map(persona =>
        this.loadPersonaFromMarkdown(persona)
      )
    );

    results.forEach((result, index) => {
      const persona = Array.from(this.personaFilePaths.keys())[index];
      if (result.status === 'fulfilled' && result.value.success) {
        console.log(`✅ Initialized enhanced persona: ${persona}`);
      } else if (result.status === 'fulfilled') {
        console.warn(`⚠️ Failed to initialize persona ${persona}:`, result.value.errors);
      } else {
        console.error(`❌ Error initializing persona ${persona}:`, result.reason);
      }
    });
  }

  /**
   * Refresh a persona from its source file
   */
  async refreshPersona(persona: Persona): Promise<PersonaLoadResult> {
    const filePath = this.personaFilePaths.get(persona);
    return this.loadPersonaFromMarkdown(persona, filePath);
  }

  /**
   * Get persona statistics
   */
  getPersonaStats(persona: Persona): any {
    const enhancedPersona = this.enhancedPersonas.get(persona);
    if (!enhancedPersona) return null;

    return {
      name: enhancedPersona.name,
      domains: enhancedPersona.expertise.domains.length,
      keywords: enhancedPersona.expertise.domains.reduce((sum, d) => sum + d.keywords.length, 0),
      concepts: enhancedPersona.expertise.domains.reduce((sum, d) => sum + d.concepts.length, 0),
      achievements: enhancedPersona.expertise.achievements.length,
      values: enhancedPersona.coreValues.length,
      lastModified: enhancedPersona.source?.lastModified,
      sourceFile: enhancedPersona.source?.filePath
    };
  }
}

// Export singleton instance
export const personaManager = PersonaManager.getInstance();

// Export convenience functions
export const {
  loadPersonaFromMarkdown,
  generateSystemPrompt,
  getPersonaDomainBoosts,
  getEnhancedPersona,
  isEnhanced
} = {
  loadPersonaFromMarkdown: (persona: Persona, filePath?: string) => personaManager.loadPersonaFromMarkdown(persona, filePath),
  generateSystemPrompt: (persona: Persona, ragContext?: any) => personaManager.generateSystemPrompt(persona, ragContext),
  getPersonaDomainBoosts: (persona: Persona) => personaManager.getPersonaDomainBoosts(persona),
  getEnhancedPersona: (persona: Persona) => personaManager.getEnhancedPersona(persona),
  isEnhanced: (persona: Persona) => personaManager.isEnhanced(persona)
};