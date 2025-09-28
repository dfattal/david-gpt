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
  ConversationContext,
  ConversationMessage,
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

export interface FactSummary {
  sourceId: string;
  citationId: string;
  bullets: string[];
  extractedDate?: string;
  authorityScore: number;
  lastUpdated: Date;
}

export interface ContextMemory {
  conversationId: string;
  activeFacts: FactSummary[];
  totalSources: number;
  memorySize: number; // in tokens
  lastCompacted: Date;
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
    const responseMode = this.analyzeResponseMode(
      normalizedQuery,
      conversationHistory
    );

    // Calculate confidence based on pattern matching strength
    const confidence = this.calculateClassificationConfidence(
      normalizedQuery,
      turnType,
      responseMode
    );

    // Generate reasoning
    const reasoning = this.generateClassificationReasoning(
      normalizedQuery,
      turnType,
      responseMode
    );

    return {
      turnType,
      responseMode,
      confidence,
      reasoning,
      suggestedSources: await this.getSuggestedSources(
        turnType,
        normalizedQuery
      ),
    };
  }

  /**
   * Manage context carry-over for a new turn with evidence ID boosting
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

    // Get evidence IDs from recent assistant messages for boosting
    const evidenceIDs = await this.getRecentEvidenceIDs();

    // Apply decay and filter logic with evidence boosting
    const result = this.processSourcesForCarryOverWithBoosting(
      sources,
      turnType,
      evidenceIDs
    );

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
   * Get evidence IDs from the last 2 assistant messages for boosting
   */
  private async getRecentEvidenceIDs(): Promise<string[]> {
    if (
      this.conversationId === 'temp' ||
      !this.isValidUUID(this.conversationId)
    ) {
      return [];
    }

    // Get last 2 assistant messages
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', this.conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(2);

    if (error || !messages || messages.length === 0) {
      return [];
    }

    // Get citations from these messages
    const messageIds = messages.map(m => m.id);
    const { data: citations, error: citationError } = await supabase
      .from('message_citations')
      .select('document_id')
      .in('message_id', messageIds);

    if (citationError || !citations) {
      return [];
    }

    // Return unique document IDs
    return [...new Set(citations.map(c => c.document_id))];
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
      let newScore = source.carryScore;

      switch (turnType) {
        case 'drill-down':
          // Keep score high for drill-down queries
          newScore = Math.max(source.carryScore * 0.9, 0.3);
          break;

        case 'same-sources':
          // Boost score for same-source queries
          newScore = Math.min(source.carryScore * 1.1, 1.0);
          break;

        case 'compare':
          // Moderate decay for comparison queries
          newScore = source.carryScore * 0.8;
          break;

        case 'new-topic':
        default:
          // Standard decay for new topics
          newScore = source.carryScore * this.decayFactor;
          break;
      }

      // Increment inactive turns if not used recently
      const updatedSource = {
        ...source,
        carryScore: newScore,
        turnsInactive: source.turns_inactive + 1,
      };

      if (newScore > 0.1) {
        relevantSources.push(updatedSource);
      } else {
        decayedSources.push(updatedSource);
        expiredSources.push(source.document_id);
      }
    }

    // Sort by carry score and limit to max sources
    relevantSources.sort((a, b) => b.carryScore - a.carryScore);
    const limitedSources = relevantSources.slice(0, this.maxCarryOverSources);

    return {
      relevantSources: limitedSources,
      decayedSources,
      expiredSources,
      totalSourcesCarried: limitedSources.length,
    };
  }

  /**
   * Process sources for carry-over with evidence ID boosting
   */
  private processSourcesForCarryOverWithBoosting(
    sources: ConversationSource[],
    turnType: TurnType,
    evidenceIDs: string[]
  ): ContextCarryOverResult {
    const relevantSources: ConversationSource[] = [];
    const decayedSources: ConversationSource[] = [];
    const expiredSources: string[] = [];

    console.log(
      `🎯 Evidence ID boosting: ${evidenceIDs.length} sources from recent citations`
    );

    for (const source of sources) {
      // Check if source has exceeded TTL
      if (source.turns_inactive >= this.turnTTL && !source.pinned) {
        expiredSources.push(source.document_id);
        continue;
      }

      // Apply decay based on turn type
      let newScore = source.carryScore;

      switch (turnType) {
        case 'drill-down':
          // Keep score high for drill-down queries
          newScore = Math.max(source.carryScore * 0.9, 0.3);
          break;

        case 'same-sources':
          // Boost score for same-source queries
          newScore = Math.min(source.carryScore * 1.1, 1.0);
          break;

        case 'compare':
          // Moderate decay for comparison queries
          newScore = source.carryScore * 0.8;
          break;

        case 'new-topic':
        default:
          // Standard decay for new topics
          newScore = source.carryScore * this.decayFactor;
          break;
      }

      // Apply evidence ID boosting - boost sources cited in recent assistant messages
      if (evidenceIDs.includes(source.document_id)) {
        newScore = Math.min(newScore * 1.3, 1.0); // 30% boost, capped at 1.0
        console.log(
          `📈 Evidence boost applied to source: ${source.documentId}`
        );
      }

      // Reset inactive turns if source was recently cited
      const turnsInactive = evidenceIDs.includes(source.document_id)
        ? 0
        : source.turns_inactive + 1;

      // Increment inactive turns if not used recently
      const updatedSource = {
        ...source,
        carryScore: newScore,
        turnsInactive: turnsInactive,
      };

      if (newScore > 0.1) {
        relevantSources.push(updatedSource);
      } else {
        decayedSources.push(updatedSource);
        expiredSources.push(source.document_id);
      }
    }

    // Sort by carry score (evidence-boosted sources will be higher) and limit to max sources
    relevantSources.sort((a, b) => b.carryScore - a.carryScore);
    const limitedSources = relevantSources.slice(0, this.maxCarryOverSources);

    console.log(
      `🔄 Context carry-over result: ${limitedSources.length} sources, ${evidenceIDs.length} evidence-boosted`
    );

    return {
      relevantSources: limitedSources,
      decayedSources,
      expiredSources,
      totalSourcesCarried: limitedSources.length,
    };
  }

  /**
   * Analyze turn type from query patterns and conversation history
   */
  private analyzeTurnType(
    query: string,
    history: ConversationMessage[]
  ): TurnType {
    // Drill-down patterns
    const drillDownPatterns = [
      /tell me more/i,
      /more about/i,
      /elaborate/i,
      /expand on/i,
      /details?/i,
      /specifically/i,
      /in particular/i,
      /dig deeper/i,
      /further/i,
    ];

    // Compare patterns
    const comparePatterns = [
      /compar/i,
      /versus/i,
      /\bvs\b/i,
      /different/i,
      /contrast/i,
      /alternative/i,
      /instead/i,
      /how.*differ/i,
      /what.*difference/i,
    ];

    // Same-source patterns
    const sameSrcPatterns = [
      /also/i,
      /additionally/i,
      /furthermore/i,
      /what else/i,
      /other/i,
      /another/i,
      /similar/i,
      /related/i,
    ];

    // New topic patterns
    const newTopicPatterns = [
      /now\s+(about|tell|explain)/i,
      /let['']?s talk about/i,
      /switch to/i,
      /changing topics?/i,
      /moving on/i,
    ];

    // Check for explicit new topic indicators first
    if (newTopicPatterns.some(pattern => pattern.test(query))) {
      return 'new-topic';
    }

    // Analyze history context (last 3 messages)
    const recentMessages = history.slice(0, 3);
    const lastUserMessage =
      recentMessages.find(m => m.role === 'user')?.content || '';
    const lastAssistantMessage =
      recentMessages.find(m => m.role === 'assistant')?.content || '';

    // Enhanced pattern matching with context
    if (comparePatterns.some(pattern => pattern.test(query))) {
      return 'compare';
    }

    // Check for drill-down with context
    if (drillDownPatterns.some(pattern => pattern.test(query))) {
      return 'drill-down';
    }

    // Check if query refers to topics from recent conversation
    if (this.hasTopicContinuity(query, lastUserMessage, lastAssistantMessage)) {
      if (sameSrcPatterns.some(pattern => pattern.test(query))) {
        return 'same-sources';
      } else {
        return 'drill-down';
      }
    }

    // Check for topic similarity with recent messages
    if (this.hasSemanticSimilarity(query, recentMessages)) {
      return 'same-sources';
    }

    // Default to new topic if no patterns match
    return 'new-topic';
  }

  /**
   * Check if current query continues topics from recent messages
   */
  private hasTopicContinuity(
    query: string,
    lastUserMessage: string,
    lastAssistantMessage: string
  ): boolean {
    const normalizedQuery = query.toLowerCase();
    const recentContent = (
      lastUserMessage +
      ' ' +
      lastAssistantMessage
    ).toLowerCase();

    // Extract key terms (simple word-based approach)
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 3);
    const recentWords = recentContent.split(/\s+/).filter(w => w.length > 3);

    // Check for word overlap (at least 2 significant words)
    const overlapCount = queryWords.filter(word =>
      recentWords.includes(word)
    ).length;
    return overlapCount >= 2;
  }

  /**
   * Check for semantic similarity with recent messages (simplified)
   */
  private hasSemanticSimilarity(
    query: string,
    recentMessages: ConversationMessage[]
  ): boolean {
    if (recentMessages.length === 0) return false;

    const normalizedQuery = query.toLowerCase();
    const recentContent = recentMessages
      .map(m => m.content.toLowerCase())
      .join(' ');

    // Simple keyword-based similarity check
    const queryKeywords = this.extractKeywords(normalizedQuery);
    const recentKeywords = this.extractKeywords(recentContent);

    const commonKeywords = queryKeywords.filter(k =>
      recentKeywords.includes(k)
    );
    return commonKeywords.length >= 1 && queryKeywords.length > 0;
  }

  /**
   * Extract relevant keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set([
      'the',
      'is',
      'are',
      'was',
      'were',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'up',
      'down',
      'out',
      'off',
      'over',
      'under',
      'again',
      'further',
      'then',
      'once',
    ]);

    return text
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10); // Limit to top 10 keywords
  }

  /**
   * Analyze response mode from query patterns and conversation context
   */
  private analyzeResponseMode(
    query: string,
    history: ConversationMessage[]
  ): ResponseMode {
    // FACT mode patterns - seeking specific information
    const factPatterns = [
      /\bfact/i,
      /exactly/i,
      /specifically/i,
      /precise/i,
      /what is\b/i,
      /who is\b/i,
      /when did/i,
      /when was/i,
      /how much/i,
      /how many/i,
      /definition/i,
      /define/i,
      /\d+/, // Contains numbers - often factual queries
    ];

    // CONFLICTS mode patterns - comparing or seeking alternative views
    const conflictPatterns = [
      /conflict/i,
      /disagree/i,
      /different view/i,
      /alternative/i,
      /debate/i,
      /controversy/i,
      /argue/i,
      /disputed/i,
      /challenge/i,
      /counter/i,
    ];

    // EXPLAIN mode patterns - seeking understanding
    const explainPatterns = [
      /explain/i,
      /how does/i,
      /how to/i,
      /why/i,
      /because/i,
      /understand/i,
      /concept/i,
      /process/i,
      /mechanism/i,
      /work/i,
    ];

    // Check history for context clues
    const recentMessages = history.slice(0, 3);
    const hasRecentFactualQueries = recentMessages.some(
      m => m.role === 'user' && factPatterns.some(p => p.test(m.content))
    );

    // Enhanced pattern matching with context
    if (factPatterns.some(pattern => pattern.test(query))) {
      return 'FACT';
    }

    if (conflictPatterns.some(pattern => pattern.test(query))) {
      return 'CONFLICTS';
    }

    // If previous queries were factual and this seems like a follow-up
    if (hasRecentFactualQueries && query.length < 50) {
      return 'FACT';
    }

    // Default to EXPLAIN mode for comprehensive responses
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
      compare: /versus|compare|different/i,
      'same-sources': /also|additionally|what else/i,
      'new-topic': /new|different topic|change subject/i,
    };

    const modePatterns = {
      FACT: /exactly|specifically|what is|who is/i,
      EXPLAIN: /explain|how|why|describe/i,
      CONFLICTS: /conflict|disagree|debate/i,
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
      compare: 'Query requests comparison between alternatives',
      'same-sources': 'Query asks for additional information from same domain',
      'new-topic': 'Query appears to introduce a new topic',
    };

    const modeReasons = {
      FACT: 'Query seeks specific factual information',
      EXPLAIN: 'Query requests detailed explanation or context',
      CONFLICTS: 'Query involves potentially conflicting information',
    };

    return `${turnReasons[turnType]}. ${modeReasons[responseMode]}.`;
  }

  /**
   * Get conversation history for analysis
   */
  private async getConversationHistory(): Promise<ConversationMessage[]> {
    // Skip database query for temporary conversation IDs
    if (
      this.conversationId === 'temp' ||
      !this.isValidUUID(this.conversationId)
    ) {
      return [];
    }

    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, conversation_id, role, content, turn_type, response_mode, processing_time, sources_used, created_at'
      )
      .eq('conversation_id', this.conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('Could not fetch conversation history:', error);
      return [];
    }

    return (data || []).map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      turnType: msg.turn_type as TurnType | undefined,
      responseMode: msg.response_mode as ResponseMode | undefined,
      processingTime: msg.processing_time || undefined,
      sourcesUsed: msg.sources_used || undefined,
      createdAt: new Date(msg.created_at),
    }));
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Get suggested sources based on turn type and query
   */
  private async getSuggestedSources(
    turnType: TurnType,
    query: string
  ): Promise<string[]> {
    // Skip database query for temporary conversation IDs
    if (
      this.conversationId === 'temp' ||
      !this.isValidUUID(this.conversationId)
    ) {
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
      turns_inactive: 0,
    }));

    const { error } = await supabase
      .from('conversation_sources')
      .upsert(newSources, {
        onConflict: 'conversation_id,document_id',
      });

    if (error) {
      console.warn('Could not add new sources:', error);
    }
  }

  /**
   * Update source scores after processing
   */
  private async updateSourceScores(
    sources: ConversationSource[]
  ): Promise<void> {
    for (const source of sources) {
      const { error } = await supabase
        .from('conversation_sources')
        .update({
          carry_score: source.carryScore,
          turns_inactive: source.turnsInactive,
          last_used_at: new Date().toISOString(),
        })
        .eq('conversation_id', this.conversationId)
        .eq('document_id', source.document_id);

      if (error) {
        console.warn(`Could not update source ${source.documentId}:`, error);
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

  // =======================
  // Fact Summarization Methods
  // =======================

  /**
   * Extract key facts from search results for context memory
   */
  async extractFactSummaries(
    searchResults: SearchResult[]
  ): Promise<FactSummary[]> {
    const summaries: FactSummary[] = [];

    for (const result of searchResults.slice(0, 5)) {
      // Limit to top 5 sources
      try {
        const bullets = await this.extractKeyBullets(
          result.content,
          result.title
        );
        const citationId = this.generateStableCitationId(
          result.documentId,
          result.docType
        );
        const extractedDate = this.extractDateFromResult(result);

        summaries.push({
          sourceId: result.documentId,
          citationId,
          bullets,
          extractedDate,
          authorityScore: this.calculateAuthorityScore(result),
          lastUpdated: new Date(),
        });
      } catch (error) {
        console.warn(
          `Failed to extract facts from source ${result.documentId}:`,
          error
        );
      }
    }

    console.log(`📝 Extracted fact summaries from ${summaries.length} sources`);
    return summaries;
  }

  /**
   * Extract 2 key bullet points from source content
   */
  private async extractKeyBullets(
    content: string,
    title: string
  ): Promise<string[]> {
    // Simple extraction algorithm - can be enhanced with LLM later
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);

    // Score sentences by information density
    const scoredSentences = sentences.map(sentence => ({
      text: sentence.trim(),
      score: this.scoreSentenceInformation(sentence, title),
    }));

    // Sort by score and take top 2
    scoredSentences.sort((a, b) => b.score - a.score);

    return scoredSentences
      .slice(0, 2)
      .map(s => s.text)
      .filter(text => text.length > 10);
  }

  /**
   * Score sentence for information density
   */
  private scoreSentenceInformation(sentence: string, title: string): number {
    let score = 0;

    // Longer sentences often have more information
    score += Math.min(sentence.length / 100, 2);

    // Sentences with numbers are often factual
    if (/\d+/.test(sentence)) score += 1;

    // Sentences with title keywords are relevant
    const titleWords = title.toLowerCase().split(/\s+/);
    const sentenceWords = sentence.toLowerCase().split(/\s+/);
    const titleOverlap = titleWords.filter(word =>
      sentenceWords.includes(word)
    ).length;
    score += titleOverlap * 0.5;

    // Sentences with certain keywords are informative
    const infoKeywords = [
      'method',
      'process',
      'result',
      'finding',
      'conclude',
      'demonstrate',
      'show',
      'reveal',
      'discover',
    ];
    const keywordMatches = infoKeywords.filter(keyword =>
      sentence.toLowerCase().includes(keyword)
    ).length;
    score += keywordMatches * 0.8;

    // Avoid very short or very long sentences
    if (sentence.length < 30 || sentence.length > 300) score *= 0.5;

    return score;
  }

  /**
   * Generate stable citation ID for consistent referencing
   */
  private generateStableCitationId(
    documentId: string,
    docType: string
  ): string {
    // Create predictable citation IDs based on document type
    const typePrefix =
      {
        paper: 'P',
        patent: 'T',
        note: 'N',
        url: 'U',
        book: 'B',
        pdf: 'D',
      }[docType] || 'X';

    // Use first 8 characters of document ID for stability
    const shortId = documentId.substring(0, 8).replace(/-/g, '').toUpperCase();
    return `${typePrefix}${shortId}`;
  }

  /**
   * Extract date information from search result
   */
  private extractDateFromResult(result: SearchResult): string | undefined {
    const metadata = result.metadata;

    // Try different date fields
    if (metadata.publishedDate) {
      return metadata.publishedDate.toISOString().split('T')[0];
    }
    if (metadata.grantedDate) {
      return metadata.grantedDate.toISOString().split('T')[0];
    }
    if (metadata.filedDate) {
      return metadata.filedDate.toISOString().split('T')[0];
    }
    if (metadata.isoDate) {
      return metadata.isoDate.toISOString().split('T')[0];
    }

    return undefined;
  }

  /**
   * Calculate authority score for source ranking
   */
  private calculateAuthorityScore(result: SearchResult): number {
    let score = 0.5; // Base score

    // Higher relevance score increases authority
    score += Math.min(result.score, 0.3);

    // Document type influences authority
    const typeAuthority =
      {
        patent: 0.9,
        paper: 0.8,
        book: 0.7,
        pdf: 0.6,
        note: 0.4,
        url: 0.3,
      }[result.docType] || 0.5;

    score = score * 0.7 + typeAuthority * 0.3;

    // Published/granted documents have higher authority
    if (result.metadata.publishedDate || result.metadata.grantedDate) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Build context memory from active sources
   */
  async buildContextMemory(): Promise<ContextMemory> {
    if (
      this.conversationId === 'temp' ||
      !this.isValidUUID(this.conversationId)
    ) {
      return {
        conversationId: this.conversationId,
        activeFacts: [],
        totalSources: 0,
        memorySize: 0,
        lastCompacted: new Date(),
      };
    }

    // Get active conversation sources
    const { data: sources, error } = await supabase
      .from('conversation_sources')
      .select(
        `
        document_id,
        carry_score,
        last_used_at,
        documents (
          title,
          doc_type,
          published_date,
          granted_date
        )
      `
      )
      .eq('conversation_id', this.conversationId)
      .gte('carry_score', 0.1)
      .order('carry_score', { ascending: false });

    if (error || !sources || sources.length === 0) {
      return {
        conversationId: this.conversationId,
        activeFacts: [],
        totalSources: 0,
        memorySize: 0,
        lastCompacted: new Date(),
      };
    }

    // Build fact summaries from stored citation data
    const activeFacts: FactSummary[] = [];

    for (const source of sources.slice(0, 10)) {
      // Limit to top 10 sources
      const docData = source.documents;
      if (!docData) continue;

      // Get stored citations for this source
      const { data: citations } = await supabase
        .from('message_citations')
        .select('fact_summary, marker, page_range')
        .eq('document_id', source.document_id)
        .limit(3); // Get recent citations

      const bullets = citations?.map(c => c.fact_summary).filter(Boolean) || [
        `Key information from ${docData.title}`,
      ];

      const citationId = this.generateStableCitationId(
        source.document_id,
        docData.doc_type
      );
      const extractedDate = docData.published_date || docData.granted_date;

      activeFacts.push({
        sourceId: source.document_id,
        citationId,
        bullets: bullets.slice(0, 2), // Limit to 2 bullets
        extractedDate: extractedDate
          ? new Date(extractedDate).toISOString().split('T')[0]
          : undefined,
        authorityScore: source.carry_score,
        lastUpdated: new Date(source.last_used_at),
      });
    }

    // Calculate memory size (rough token estimate)
    const memorySize = activeFacts.reduce((total, fact) => {
      return total + fact.bullets.join(' ').length / 4; // ~4 chars per token
    }, 0);

    return {
      conversationId: this.conversationId,
      activeFacts,
      totalSources: sources.length,
      memorySize: Math.round(memorySize),
      lastCompacted: new Date(),
    };
  }

  /**
   * Compact context memory by removing low-value facts
   */
  async compactContextMemory(maxTokens: number = 2000): Promise<ContextMemory> {
    const memory = await this.buildContextMemory();

    if (memory.memorySize <= maxTokens) {
      return memory;
    }

    // Sort facts by authority score and recency
    memory.activeFacts.sort((a, b) => {
      const scoreA =
        a.authorityScore * 0.7 + this.getRecencyScore(a.lastUpdated) * 0.3;
      const scoreB =
        b.authorityScore * 0.7 + this.getRecencyScore(b.lastUpdated) * 0.3;
      return scoreB - scoreA;
    });

    // Keep facts until we hit the token limit
    let currentTokens = 0;
    const compactedFacts: FactSummary[] = [];

    for (const fact of memory.activeFacts) {
      const factTokens = fact.bullets.join(' ').length / 4;
      if (currentTokens + factTokens <= maxTokens) {
        compactedFacts.push(fact);
        currentTokens += factTokens;
      }
    }

    return {
      ...memory,
      activeFacts: compactedFacts,
      memorySize: Math.round(currentTokens),
      lastCompacted: new Date(),
    };
  }

  /**
   * Get recency score for fact ranking
   */
  private getRecencyScore(lastUpdated: Date): number {
    const now = new Date();
    const hoursSinceUpdate =
      (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

    // Decay over 24 hours
    return Math.max(0, 1 - hoursSinceUpdate / 24);
  }
}

// =======================
// Convenience Functions
// =======================

/**
 * Create a new conversation context manager
 */
export function createContextManager(
  conversationId: string
): ConversationContextManager {
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
      .limit(1),
  ]);

  const sources = sourcesResult.data || [];
  const messages = messagesResult.data || [];

  return {
    activeSources: sources.length,
    totalTurns: messages.length,
    lastActivity: messages[0]?.created_at || 'Never',
    topSources: sources
      .slice(0, 3)
      .map(s => s.documents?.title)
      .filter(Boolean) as string[],
  };
}

/**
 * Extract facts from search results and persist for context memory
 */
export async function extractAndStoreFactSummaries(
  conversationId: string,
  searchResults: SearchResult[]
): Promise<FactSummary[]> {
  const contextManager = new ConversationContextManager(conversationId);
  return contextManager.extractFactSummaries(searchResults);
}

/**
 * Get compacted context memory for conversation
 */
export async function getCompactedContextMemory(
  conversationId: string,
  maxTokens: number = 2000
): Promise<ContextMemory> {
  const contextManager = new ConversationContextManager(conversationId);
  return contextManager.compactContextMemory(maxTokens);
}

/**
 * Format facts as citation context for prompts
 */
export function formatFactsForContext(facts: FactSummary[]): string {
  if (facts.length === 0) return '';

  const formattedFacts = facts
    .map(fact => {
      const bullets = fact.bullets.map(bullet => `  • ${bullet}`).join('\n');
      const dateStr = fact.extractedDate ? ` (${fact.extractedDate})` : '';
      return `[${fact.citationId}]${dateStr}:\n${bullets}`;
    })
    .join('\n\n');

  return `## Context Memory\n\n${formattedFacts}\n`;
}

/**
 * Update fact summaries with new citation information
 */
export async function updateFactSummaries(
  conversationId: string,
  messageId: string,
  citations: { documentId: string; factSummary?: string; marker: string }[]
): Promise<void> {
  // Store fact summaries in message citations for future reference
  for (const citation of citations) {
    if (citation.factSummary) {
      const { error } = await supabase
        .from('message_citations')
        .update({
          fact_summary: citation.factSummary,
        })
        .eq('message_id', messageId)
        .eq('document_id', citation.documentId)
        .eq('marker', citation.marker);

      if (error) {
        console.warn(
          `Failed to update fact summary for ${citation.marker}:`,
          error
        );
      }
    }
  }
}
