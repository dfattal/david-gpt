/**
 * Multi-Turn Context Management
 * 
 * Handles intelligent context carry-over between conversation turns
 * with decay scoring and selective source retention.
 */

import { supabase } from '@/lib/supabase';
import type { 
  TurnType, 
  ResponseMode, 
  SearchResult, 
  ConversationSource,
  ConversationContext 
} from './types';

// =======================
// Context Management
// =======================

export interface ContextCarryOverResult {
  relevantSources: ConversationSource[];
  decayedSources: ConversationSource[];
  expiredSources: string[];
  totalSourcesCarried: number;
}

export interface TurnAnalysis {
  turnType: TurnType;
  responseMode: ResponseMode;
  confidence: number;
  reasoning: string;
  suggestedSources?: string[];
}

/**
 * Context Manager for multi-turn conversations
 */
export class ConversationContextManager {
  private conversationId: string;
  private maxCarryOverSources: number;
  private decayFactor: number;
  private turnTTL: number;

  constructor(
    conversationId: string, 
    options: {
      maxCarryOverSources?: number;
      decayFactor?: number;
      turnTTL?: number;
    } = {}
  ) {
    this.conversationId = conversationId;
    this.maxCarryOverSources = options.maxCarryOverSources || 5;
    this.decayFactor = options.decayFactor || 0.7;
    this.turnTTL = options.turnTTL || 3;
  }

  /**
   * Classify the turn type and response mode based on query and conversation history
   */
  async classifyTurn(
    currentQuery: string, 
    previousMessages: string[] = []
  ): Promise<TurnAnalysis> {
    const normalizedQuery = currentQuery.toLowerCase().trim();
    
    // Get conversation history for context
    const conversationHistory = await this.getConversationHistory();
    
    // Analyze turn type
    const turnType = this.analyzeTurnType(normalizedQuery, conversationHistory);
    
    // Analyze response mode
    const responseMode = this.analyzeResponseMode(normalizedQuery, conversationHistory);
    
    // Calculate confidence based on pattern matching strength
    const confidence = this.calculateClassificationConfidence(normalizedQuery, turnType, responseMode);
    
    // Generate reasoning
    const reasoning = this.generateClassificationReasoning(normalizedQuery, turnType, responseMode);

    return {
      turnType,
      responseMode,
      confidence,
      reasoning,
      suggestedSources: await this.getSuggestedSources(turnType, normalizedQuery)
    };
  }

  /**
   * Manage context carry-over for a new turn
   */
  async manageContextCarryOver(
    turnType: TurnType,
    newSearchResults: SearchResult[] = []
  ): Promise<ContextCarryOverResult> {
    // Get current conversation sources
    const { data: currentSources, error } = await supabase
      .from('conversation_sources')
      .select('*')
      .eq('conversation_id', this.conversationId)
      .order('last_used_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversation sources:', error);
      throw error;
    }

    const sources = currentSources || [];
    
    // Apply decay and filter logic
    const result = this.processSourcesForCarryOver(sources, turnType);
    
    // Add new sources from search results
    if (newSearchResults.length > 0) {
      await this.addNewSources(newSearchResults);
    }
    
    // Update existing sources with new scores and activity
    await this.updateSourceScores(result.relevantSources);
    
    // Remove expired sources
    if (result.expiredSources.length > 0) {
      await this.removeExpiredSources(result.expiredSources);
    }

    return result;
  }

  /**
   * Process sources for carry-over based on turn type and decay rules
   */
  private processSourcesForCarryOver(
    sources: ConversationSource[],
    turnType: TurnType
  ): ContextCarryOverResult {
    const relevantSources: ConversationSource[] = [];
    const decayedSources: ConversationSource[] = [];
    const expiredSources: string[] = [];

    for (const source of sources) {
      // Check if source has exceeded TTL
      if (source.turns_inactive >= this.turnTTL && !source.pinned) {
        expiredSources.push(source.document_id);
        continue;
      }

      // Apply decay based on turn type
      let newScore = source.carry_score;
      
      switch (turnType) {
        case 'drill-down':
          // Keep score high for drill-down queries
          newScore = Math.max(source.carry_score * 0.9, 0.3);
          break;
          
        case 'same-sources':
          // Boost score for same-source queries
          newScore = Math.min(source.carry_score * 1.1, 1.0);
          break;
          
        case 'compare':
          // Moderate decay for comparison queries
          newScore = source.carry_score * 0.8;
          break;
          
        case 'new-topic':
        default:
          // Standard decay for new topics
          newScore = source.carry_score * this.decayFactor;
          break;
      }

      // Increment inactive turns if not used recently
      const updatedSource = {
        ...source,
        carry_score: newScore,
        turns_inactive: source.turns_inactive + 1
      };

      if (newScore > 0.1) {
        relevantSources.push(updatedSource);
      } else {
        decayedSources.push(updatedSource);
        expiredSources.push(source.document_id);
      }
    }

    // Sort by carry score and limit to max sources
    relevantSources.sort((a, b) => b.carry_score - a.carry_score);
    const limitedSources = relevantSources.slice(0, this.maxCarryOverSources);

    return {
      relevantSources: limitedSources,
      decayedSources,
      expiredSources,
      totalSourcesCarried: limitedSources.length
    };
  }

  /**
   * Analyze turn type from query patterns
   */
  private analyzeTurnType(query: string, history: any[]): TurnType {
    // Drill-down patterns
    const drillDownPatterns = [
      /tell me more/i,
      /more about/i,
      /elaborate/i,
      /expand on/i,
      /details?/i,
      /specifically/i,
      /in particular/i
    ];

    // Compare patterns  
    const comparePatterns = [
      /compar/i,
      /versus/i,
      /\bvs\b/i,
      /different/i,
      /contrast/i,
      /alternative/i,
      /instead/i
    ];

    // Same-source patterns
    const sameSrcPatterns = [
      /also/i,
      /additionally/i,
      /furthermore/i,
      /what else/i,
      /other/i,
      /another/i
    ];

    // Check patterns in order of specificity
    if (comparePatterns.some(pattern => pattern.test(query))) {
      return 'compare';
    }
    
    if (drillDownPatterns.some(pattern => pattern.test(query))) {
      return 'drill-down';
    }
    
    if (sameSrcPatterns.some(pattern => pattern.test(query))) {
      return 'same-sources';
    }

    // Default to new topic if no patterns match
    return 'new-topic';
  }

  /**
   * Analyze response mode from query patterns
   */
  private analyzeResponseMode(query: string, history: any[]): ResponseMode {
    // FACT mode patterns
    const factPatterns = [
      /\bfact/i,
      /exactly/i,
      /specifically/i,
      /precise/i,
      /what is\b/i,
      /who is\b/i,
      /when did/i,
      /how much/i,
      /how many/i
    ];

    // CONFLICTS mode patterns
    const conflictPatterns = [
      /conflict/i,
      /disagree/i,
      /different view/i,
      /alternative/i,
      /debate/i,
      /controversy/i,
      /argue/i
    ];

    if (factPatterns.some(pattern => pattern.test(query))) {
      return 'FACT';
    }
    
    if (conflictPatterns.some(pattern => pattern.test(query))) {
      return 'CONFLICTS';
    }

    // Default to EXPLAIN mode
    return 'EXPLAIN';
  }

  /**
   * Calculate confidence score for classification
   */
  private calculateClassificationConfidence(
    query: string, 
    turnType: TurnType, 
    responseMode: ResponseMode
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on strong pattern matches
    const strongPatterns = {
      'drill-down': /tell me more|elaborate|expand on/i,
      'compare': /versus|compare|different/i,
      'same-sources': /also|additionally|what else/i,
      'new-topic': /new|different topic|change subject/i
    };

    const modePatterns = {
      'FACT': /exactly|specifically|what is|who is/i,
      'EXPLAIN': /explain|how|why|describe/i,
      'CONFLICTS': /conflict|disagree|debate/i
    };

    if (strongPatterns[turnType]?.test(query)) {
      confidence += 0.3;
    }

    if (modePatterns[responseMode]?.test(query)) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate human-readable reasoning for classification
   */
  private generateClassificationReasoning(
    query: string,
    turnType: TurnType,
    responseMode: ResponseMode
  ): string {
    const turnReasons = {
      'drill-down': 'Query asks for more detail about previous topic',
      'compare': 'Query requests comparison between alternatives',
      'same-sources': 'Query asks for additional information from same domain',
      'new-topic': 'Query appears to introduce a new topic'
    };

    const modeReasons = {
      'FACT': 'Query seeks specific factual information',
      'EXPLAIN': 'Query requests detailed explanation or context',
      'CONFLICTS': 'Query involves potentially conflicting information'
    };

    return `${turnReasons[turnType]}. ${modeReasons[responseMode]}.`;
  }

  /**
   * Get conversation history for analysis
   */
  private async getConversationHistory(): Promise<any[]> {
    // Skip database query for temporary conversation IDs
    if (this.conversationId === 'temp' || !this.isValidUUID(this.conversationId)) {
      return [];
    }

    const { data, error } = await supabase
      .from('messages')
      .select('role, content, turn_type, response_mode, created_at')
      .eq('conversation_id', this.conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('Could not fetch conversation history:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Get suggested sources based on turn type and query
   */
  private async getSuggestedSources(turnType: TurnType, query: string): Promise<string[]> {
    // Skip database query for temporary conversation IDs
    if (this.conversationId === 'temp' || !this.isValidUUID(this.conversationId)) {
      return [];
    }

    // For drill-down queries, suggest sources from recent context
    if (turnType === 'drill-down' || turnType === 'same-sources') {
      const { data } = await supabase
        .from('conversation_sources')
        .select('document_id, documents(title)')
        .eq('conversation_id', this.conversationId)
        .order('carry_score', { ascending: false })
        .limit(3);

      return data?.map(s => s.documents?.title).filter(Boolean) || [];
    }

    return [];
  }

  /**
   * Add new sources from search results
   */
  private async addNewSources(results: SearchResult[]): Promise<void> {
    const newSources = results.slice(0, 5).map((result, index) => ({
      conversation_id: this.conversationId,
      document_id: result.documentId,
      last_used_at: new Date().toISOString(),
      carry_score: Math.max(result.score, 0.5), // Ensure minimum score
      pinned: false,
      turns_inactive: 0
    }));

    const { error } = await supabase
      .from('conversation_sources')
      .upsert(newSources, { 
        onConflict: 'conversation_id,document_id' 
      });

    if (error) {
      console.warn('Could not add new sources:', error);
    }
  }

  /**
   * Update source scores after processing
   */
  private async updateSourceScores(sources: ConversationSource[]): Promise<void> {
    for (const source of sources) {
      const { error } = await supabase
        .from('conversation_sources')
        .update({
          carry_score: source.carry_score,
          turns_inactive: source.turns_inactive,
          last_used_at: new Date().toISOString()
        })
        .eq('conversation_id', this.conversationId)
        .eq('document_id', source.document_id);

      if (error) {
        console.warn(`Could not update source ${source.document_id}:`, error);
      }
    }
  }

  /**
   * Remove expired sources from conversation
   */
  private async removeExpiredSources(documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;

    const { error } = await supabase
      .from('conversation_sources')
      .delete()
      .eq('conversation_id', this.conversationId)
      .in('document_id', documentIds);

    if (error) {
      console.warn('Could not remove expired sources:', error);
    }
  }
}

// =======================
// Convenience Functions
// =======================

/**
 * Create a new conversation context manager
 */
export function createContextManager(conversationId: string): ConversationContextManager {
  return new ConversationContextManager(conversationId);
}

/**
 * Quick turn classification without full context management
 */
export async function classifyTurnSimple(
  query: string,
  previousQueries: string[] = []
): Promise<TurnAnalysis> {
  const tempManager = new ConversationContextManager('temp');
  return tempManager.classifyTurn(query, previousQueries);
}

/**
 * Get context summary for conversation
 */
export async function getContextSummary(conversationId: string): Promise<{
  activeSources: number;
  totalTurns: number;
  lastActivity: string;
  topSources: string[];
}> {
  const [sourcesResult, messagesResult] = await Promise.all([
    supabase
      .from('conversation_sources')
      .select('document_id, carry_score, documents(title)')
      .eq('conversation_id', conversationId)
      .gte('carry_score', 0.1)
      .order('carry_score', { ascending: false }),
    
    supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
  ]);

  const sources = sourcesResult.data || [];
  const messages = messagesResult.data || [];

  return {
    activeSources: sources.length,
    totalTurns: messages.length,
    lastActivity: messages[0]?.created_at || 'Never',
    topSources: sources.slice(0, 3).map(s => s.documents?.title).filter(Boolean) as string[]
  };
}