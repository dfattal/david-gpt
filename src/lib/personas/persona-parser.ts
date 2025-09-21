/**
 * Persona Parser Service
 *
 * Parses structured markdown persona files into enhanced persona configurations
 * for use in both document ingestion and chat response generation.
 */

import { readFileSync, statSync } from 'fs';
import type { EnhancedPersonaConfig, Persona, DocumentType } from '@/lib/rag/types';

export interface PersonaParseResult {
  success: boolean;
  config?: EnhancedPersonaConfig;
  errors: string[];
  warnings: string[];
}

export class PersonaParser {

  /**
   * Parse a persona markdown file into an enhanced configuration
   */
  static parsePersonaFile(filePath: string, personaId: Persona): PersonaParseResult {
    const result: PersonaParseResult = {
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // Read and parse the markdown file
      const content = readFileSync(filePath, 'utf-8');
      const stats = statSync(filePath);

      const sections = this.parseMarkdownSections(content);

      // Validate required sections
      const requiredSections = ['Core Identity', 'Personality & Tone', 'Expertise'];
      for (const section of requiredSections) {
        if (!sections[section]) {
          result.errors.push(`Missing required section: ${section}`);
        }
      }

      if (result.errors.length > 0) {
        return result;
      }

      // Extract structured data from sections
      const config = this.buildPersonaConfig(sections, personaId, filePath, stats.mtime);

      // Validate the resulting configuration
      const validation = this.validatePersonaConfig(config);
      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);

      if (result.errors.length === 0) {
        result.success = true;
        result.config = config;
      }

    } catch (error) {
      result.errors.push(`Failed to parse persona file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Parse markdown content into sections
   */
  private static parseMarkdownSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');

    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Check for section headers (## Section Name)
      const headerMatch = line.match(/^## (.+)$/);
      if (headerMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }

        // Start new section
        currentSection = headerMatch[1];
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save final section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Build enhanced persona configuration from parsed sections
   */
  private static buildPersonaConfig(
    sections: Record<string, string>,
    personaId: Persona,
    filePath: string,
    lastModified: Date
  ): EnhancedPersonaConfig {

    // Extract core identity
    const coreIdentity = sections['Core Identity'] || '';

    // Parse personality & tone
    const personalitySection = sections['Personality & Tone'] || '';
    const communicationStyle = this.parsePersonalitySection(personalitySection);

    // Parse expertise domains
    const expertiseSection = sections['Expertise'] || '';
    const expertise = this.parseExpertiseSection(expertiseSection);

    // Extract values
    const valuesSection = sections['Core Values'] || '';
    const coreValues = this.parseValuesList(valuesSection);

    // Extract chat guidelines
    const chatSection = sections['How a Chatbot Should Speak "as David"'] ||
                       sections['How a Chatbot Should Speak "as ' + personaId + '"'] || '';
    const chatGuidelines = this.parseChatGuidelines(chatSection);

    // Generate document types and metadata based on persona
    const { documentTypes, searchBoosts, metadataTemplates } = this.inferDocumentPreferences(expertise, personaId);

    // Build the enhanced configuration
    const config: EnhancedPersonaConfig = {
      // Base PersonaConfig fields
      name: this.extractName(sections) || `${personaId} Expert`,
      description: coreIdentity.split('\n')[0] || `${personaId} domain expert`,
      documentTypes,
      defaultType: this.inferDefaultDocType(personaId),
      requiredFields: this.getRequiredFields(),
      optionalFields: this.getOptionalFields(personaId),
      searchBoosts,
      citationFormat: this.inferCitationFormat(personaId),
      metadataTemplates,

      // Enhanced fields
      identity: {
        coreIdentity,
        background: this.extractBackground(sections),
        narrative: this.extractNarrative(sections)
      },

      communicationStyle,

      expertise,

      coreValues,

      chat: {
        systemPrompt: this.generateSystemPrompt(coreIdentity, communicationStyle, expertise, chatGuidelines),
        responseStyle: this.inferResponseStyle(communicationStyle),
        citationPreference: 'inline-with-context',
        domainBoosts: this.extractDomainBoosts(expertise)
      },

      source: {
        filePath,
        lastModified,
        version: '1.0'
      }
    };

    return config;
  }

  /**
   * Parse personality and tone section
   */
  private static parsePersonalitySection(content: string) {
    const lines = content.split('\n').filter(line => line.trim());

    let tone = '';
    let style = '';
    let presence = '';
    const characteristics: string[] = [];

    for (const line of lines) {
      if (line.includes('Tone of Voice:')) {
        tone = line.replace(/.*Tone of Voice:\s*/, '').replace(/^\*\*|\*\*$/g, '');
      } else if (line.includes('Style:')) {
        style = line.replace(/.*Style:\s*/, '').replace(/^\*\*|\*\*$/g, '');
      } else if (line.includes('Presence:')) {
        presence = line.replace(/.*Presence:\s*/, '').replace(/^\*\*|\*\*$/g, '');
      } else if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
        const characteristic = line.replace(/^[\s\*\-]+/, '').trim();
        if (characteristic) characteristics.push(characteristic);
      }
    }

    return {
      tone,
      style,
      presence,
      voiceCharacteristics: characteristics,
      responseGuidelines: [] // Will be populated from chat section
    };
  }

  /**
   * Parse expertise section into structured domains
   */
  private static parseExpertiseSection(content: string) {
    const domains: Array<{name: string, description: string, keywords: string[], concepts: string[]}> = [];
    const achievements: string[] = [];
    const specializations: string[] = [];

    const sections = content.split(/###\s+\d+\.\s+/);

    for (const section of sections) {
      if (section.trim()) {
        const lines = section.split('\n');
        const domainName = lines[0]?.trim() || 'Unknown Domain';

        const keywords: string[] = [];
        const concepts: string[] = [];
        let description = '';

        for (const line of lines.slice(1)) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('*') || cleanLine.startsWith('-')) {
            const item = cleanLine.replace(/^[\s\*\-]+/, '').trim();
            if (item.toLowerCase().includes('patent') || item.toLowerCase().includes('invention')) {
              achievements.push(item);
            } else {
              concepts.push(item);
              // Extract keywords from the item
              const itemKeywords = this.extractKeywords(item);
              keywords.push(...itemKeywords);
            }
          } else if (cleanLine && !cleanLine.startsWith('#')) {
            description += cleanLine + ' ';
          }
        }

        if (domainName !== 'Unknown Domain') {
          domains.push({
            name: domainName,
            description: description.trim(),
            keywords: [...new Set(keywords)], // Remove duplicates
            concepts
          });
        }
      }
    }

    return {
      domains,
      achievements,
      specializations
    };
  }

  /**
   * Extract keywords from text
   */
  private static extractKeywords(text: string): string[] {
    const keywords: string[] = [];

    // Technical terms and acronyms
    const technicalTerms = text.match(/[A-Z]{2,}|[A-Z][a-z]*(?:[A-Z][a-z]*)+/g);
    if (technicalTerms) {
      keywords.push(...technicalTerms);
    }

    // Important nouns and concepts
    const concepts = text.match(/\b(?:technology|system|method|display|optical|quantum|AI|algorithm|patent|invention)\w*/gi);
    if (concepts) {
      keywords.push(...concepts.map(c => c.toLowerCase()));
    }

    return keywords;
  }

  /**
   * Parse core values list
   */
  private static parseValuesList(content: string): string[] {
    const values: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
        const value = line.replace(/^[\s\*\-]+/, '').replace(/\*\*/g, '').trim();
        if (value) values.push(value);
      }
    }

    return values;
  }

  /**
   * Parse chat guidelines
   */
  private static parseChatGuidelines(content: string): string[] {
    const guidelines: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
        const guideline = line.replace(/^[\s\*\-]+/, '').trim();
        if (guideline) guidelines.push(guideline);
      }
    }

    return guidelines;
  }

  /**
   * Generate system prompt from persona components
   */
  private static generateSystemPrompt(
    coreIdentity: string,
    communicationStyle: any,
    expertise: any,
    chatGuidelines: string[]
  ): string {
    const prompt = `You are an AI assistant that responds in the voice and style of this expert persona.

CORE IDENTITY:
${coreIdentity}

COMMUNICATION STYLE:
- Tone: ${communicationStyle.tone}
- Style: ${communicationStyle.style}
- Presence: ${communicationStyle.presence}

EXPERTISE DOMAINS:
${expertise.domains.map((d: any) => `- ${d.name}: ${d.description}`).join('\n')}

RESPONSE GUIDELINES:
${chatGuidelines.map((g: string) => `- ${g}`).join('\n')}

When responding:
1. Maintain the authentic voice and expertise of this persona
2. Draw upon their specific domain knowledge and experience
3. Follow their communication style and preferences
4. Provide accurate, well-sourced information with proper citations
5. Balance technical depth with clarity based on the audience

Always be helpful, accurate, and maintain the persona's authentic voice while providing valuable insights from their unique perspective and expertise.`;

    return prompt;
  }

  /**
   * Helper methods for configuration inference
   */
  private static extractName(sections: Record<string, string>): string | null {
    const title = Object.keys(sections)[0];
    const match = title?.match(/^(.+?)\s+Persona/);
    return match?.[1] || null;
  }

  private static extractBackground(sections: Record<string, string>): string {
    return sections['Background'] || sections['Early Career'] || '';
  }

  private static extractNarrative(sections: Record<string, string>): string[] {
    const narrativeSection = sections['Narrative Arc'] || sections['Career Journey'] || '';
    return narrativeSection.split('\n').filter(line =>
      line.trim().startsWith('*') || line.trim().startsWith('-')
    ).map(line => line.replace(/^[\s\*\-]+/, '').trim()).filter(Boolean);
  }

  private static inferDocumentPreferences(expertise: any, personaId: Persona) {
    const baseTypes: DocumentType[] = ['paper', 'book', 'url', 'note'];
    let documentTypes: DocumentType[] = [...baseTypes];
    let searchBoosts: Record<string, number> = {};
    let metadataTemplates: string[] = ['paper', 'book', 'url'];

    switch (personaId) {
      case 'david':
        documentTypes.push('patent', 'press-article');
        metadataTemplates.push('patent', 'press-article');
        searchBoosts = {
          patentNo: 1.5,
          inventors: 1.2,
          oem: 1.3,
          leiaFeature: 1.4
        };
        break;
      case 'legal':
        documentTypes.push('legal-doc', 'case-law', 'statute', 'legal-brief');
        metadataTemplates.push('legal', 'case-law', 'statute');
        searchBoosts = {
          precedential: 1.8,
          courtLevel: 1.5,
          legalCitation: 1.3,
          caseNumber: 1.4
        };
        break;
      case 'medical':
        documentTypes.push('medical-paper', 'clinical-trial', 'medical-guideline', 'case-report');
        metadataTemplates.push('medical', 'clinical-trial', 'medical-guideline');
        searchBoosts = {
          clinicalTrialId: 1.6,
          studyType: 1.4,
          fdaApproval: 1.5,
          meshTerms: 1.3
        };
        break;
    }

    return { documentTypes, searchBoosts, metadataTemplates };
  }

  private static inferDefaultDocType(personaId: Persona): DocumentType {
    switch (personaId) {
      case 'david': return 'url';
      case 'legal': return 'legal-doc';
      case 'medical': return 'medical-paper';
      default: return 'url';
    }
  }

  private static inferCitationFormat(personaId: Persona): string {
    switch (personaId) {
      case 'david': return 'technical';
      case 'legal': return 'legal';
      case 'medical': return 'medical';
      default: return 'academic';
    }
  }

  private static inferResponseStyle(communicationStyle: any): 'conversational' | 'technical' | 'balanced' {
    const tone = communicationStyle.tone.toLowerCase();
    if (tone.includes('conversational') || tone.includes('approachable')) return 'conversational';
    if (tone.includes('technical') || tone.includes('rigorous')) return 'technical';
    return 'balanced';
  }

  private static extractDomainBoosts(expertise: any): Record<string, number> {
    const boosts: Record<string, number> = {};

    expertise.domains.forEach((domain: any, index: number) => {
      // Boost based on domain importance (first domains are more important)
      const boost = 1.5 - (index * 0.1);
      domain.keywords.forEach((keyword: string) => {
        boosts[keyword.toLowerCase()] = Math.max(boost, 1.1);
      });
    });

    return boosts;
  }

  private static getRequiredFields() {
    return {
      title: { type: 'string' as const, required: true },
      docType: { type: 'string' as const, required: true }
    };
  }

  private static getOptionalFields(personaId: Persona) {
    const base = {
      url: { type: 'string' as const },
      doi: { type: 'string' as const, pattern: /^10\.\d+\/[^\s]+$/ },
      authors: { type: 'array' as const }
    };

    // Add persona-specific fields based on personaId
    return base;
  }

  /**
   * Validate the resulting persona configuration
   */
  private static validatePersonaConfig(config: EnhancedPersonaConfig): { errors: string[], warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!config.name) errors.push('Persona name is required');
    if (!config.identity.coreIdentity) errors.push('Core identity is required');
    if (config.expertise.domains.length === 0) warnings.push('No expertise domains found');
    if (config.communicationStyle.voiceCharacteristics.length === 0) warnings.push('No voice characteristics found');

    // Validate chat configuration
    if (!config.chat.systemPrompt) errors.push('System prompt generation failed');
    if (config.chat.systemPrompt.length < 100) warnings.push('System prompt seems too short');

    return { errors, warnings };
  }
}

// Export convenience functions
export const parsePersonaFile = PersonaParser.parsePersonaFile.bind(PersonaParser);