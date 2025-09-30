/**
 * Query Reformulation for Multi-Turn Conversations
 *
 * Enhances follow-up queries by incorporating conversation context,
 * resolving pronouns, and making implicit references explicit.
 *
 * Cost: ~$0.0001 per query (GPT-4o-mini, ~100 tokens)
 */

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReformulationResult {
  originalQuery: string;
  reformulatedQuery: string;
  needsReformulation: boolean;
  contextUsed: boolean;
  reasoning?: string;
}

/**
 * Detect if a query likely needs reformulation based on simple heuristics
 */
function needsReformulation(query: string, hasHistory: boolean): boolean {
  if (!hasHistory) return false;

  const normalizedQuery = query.toLowerCase();

  // Pronouns that suggest reference to previous context
  const pronounPatterns = [
    /\b(it|its|that|this|these|those|them|they)\b/i,
    /\b(he|she|his|her)\b/i,
  ];

  // Question words without explicit subjects
  const incompleteQuestions = [
    /^(how|why|what|when|where)\s+(does|is|are|was|were|do)\b/i,
    /^(tell me|explain|describe|compare)\s+(more|that|this|it)\b/i,
  ];

  // Follow-up indicators
  const followUpPatterns = [
    /\b(also|additionally|furthermore|moreover)\b/i,
    /^(and|but|or|so)\s/i,
    /\b(what about|how about)\b/i,
  ];

  // Check for any matching patterns
  const hasPronouns = pronounPatterns.some(pattern => pattern.test(normalizedQuery));
  const hasIncompleteQuestion = incompleteQuestions.some(pattern => pattern.test(normalizedQuery));
  const hasFollowUpIndicator = followUpPatterns.some(pattern => pattern.test(normalizedQuery));

  return hasPronouns || hasIncompleteQuestion || hasFollowUpIndicator;
}

/**
 * Reformulate a user query using conversation history for context
 *
 * @param currentQuery - The user's current query
 * @param conversationHistory - Recent messages (last 2-4 turns recommended)
 * @returns Reformulated query with context incorporated
 */
export async function reformulateQuery(
  currentQuery: string,
  conversationHistory: Message[]
): Promise<ReformulationResult> {
  const startTime = Date.now();

  // Early exit if no conversation history
  if (conversationHistory.length === 0) {
    return {
      originalQuery: currentQuery,
      reformulatedQuery: currentQuery,
      needsReformulation: false,
      contextUsed: false,
    };
  }

  // Check if reformulation is needed
  if (!needsReformulation(currentQuery, conversationHistory.length > 0)) {
    console.log('📝 Query reformulation skipped (no pronouns/follow-ups detected)');
    return {
      originalQuery: currentQuery,
      reformulatedQuery: currentQuery,
      needsReformulation: false,
      contextUsed: false,
    };
  }

  console.log(`📝 Reformulating query with ${conversationHistory.length} messages of context...`);

  try {
    // Build conversation context (last 3 messages max)
    const recentHistory = conversationHistory.slice(-3);
    const conversationContext = recentHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const prompt = `You are a query reformulation assistant. Your task is to rewrite the user's current query to be self-contained by incorporating relevant context from the conversation history.

# Instructions
1. Replace pronouns (it, that, this, them, etc.) with the actual entities they refer to
2. Add explicit context for incomplete questions
3. Maintain the user's original intent and question style
4. Keep the reformulated query concise and natural
5. If the query is already clear and self-contained, return it unchanged

# Conversation History
${conversationContext}

# Current Query
${currentQuery}

# Task
Reformulate the current query to be self-contained. Output ONLY the reformulated query, nothing else.`;

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      temperature: 0.3, // Low temperature for consistent reformulation
      maxTokens: 150,
    });

    const reformulatedQuery = result.text.trim();
    const duration = Date.now() - startTime;

    console.log(`✓ Query reformulated in ${duration}ms`);
    console.log(`  Original: "${currentQuery}"`);
    console.log(`  Reformulated: "${reformulatedQuery}"`);

    return {
      originalQuery: currentQuery,
      reformulatedQuery,
      needsReformulation: true,
      contextUsed: true,
      reasoning: `Used ${recentHistory.length} messages of context`,
    };

  } catch (error) {
    console.error('❌ Query reformulation failed:', error);

    // Fallback: return original query
    return {
      originalQuery: currentQuery,
      reformulatedQuery: currentQuery,
      needsReformulation: false,
      contextUsed: false,
      reasoning: 'Reformulation failed, using original query',
    };
  }
}

/**
 * Simplified reformulation for testing/debugging
 * Returns original query without LLM call
 */
export function skipReformulation(query: string): ReformulationResult {
  return {
    originalQuery: query,
    reformulatedQuery: query,
    needsReformulation: false,
    contextUsed: false,
    reasoning: 'Reformulation disabled',
  };
}
