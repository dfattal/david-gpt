/**
 * Sequential RAG Implementation
 *
 * This approach solves the AI SDK v5 + tools + streaming incompatibility by:
 * 1. Determining if RAG is needed based on query analysis
 * 2. Calling RAG tools separately (non-streaming) if needed
 * 3. Injecting RAG results into the system prompt
 * 4. Streaming the final response without tools enabled
 */

import { createClient } from '@/lib/supabase/server';
import { ragSearchTools, classifyQueryIntent } from './search-tools';
import { shouldUseRAGForQuery } from './query-classifier';
import { detectMetadataQuery, executeMetadataSearch } from './metadata-search';
import {
  ConversationContextManager,
  createContextManager,
  extractAndStoreFactSummaries,
  getCompactedContextMemory,
  formatFactsForContext,
  type TurnAnalysis,
  type ContextCarryOverResult,
  type FactSummary,
  type ContextMemory,
} from './context-management';
import {
  processSearchContext,
  type ProcessedContext,
  type CitationRelevanceMetrics,
} from './context-post-processing';
import {
  createCitationManager,
  persistSearchResultCitations,
  type CitationBatch,
  type EnhancedCitation,
} from './citation-persistence';
import type {
  TurnType,
  ResponseMode,
  SearchResult,
  ConversationSource,
} from './types';

export interface RAGContext {
  hasRAGResults: boolean;
  ragResults: string;
  citations: string;
  toolsUsed: string[];
  executionTime: number;
  // Enhanced context information
  contextUsed: boolean;
  turnAnalysis?: TurnAnalysis;
  carryOverResult?: ContextCarryOverResult;
  freshResults: number;
  carryOverResults: number;
  // Fact summarization context
  contextMemory?: ContextMemory;
  factSummaries?: FactSummary[];
  memoryUsed: boolean;
  // Citation persistence context
  citationBatch?: CitationBatch;
  enhancedCitations?: EnhancedCitation[];
  citationsPersisted: boolean;
  // Metadata query context
  isMetadataQuery: boolean;
  // Citation relevance tracking
  citationRelevance?: CitationRelevanceMetrics;
  processedContext?: ProcessedContext;
}

/**
 * Determine if a query needs RAG support
 * Now uses persona-aware classification to intelligently route queries
 */
export function shouldUseRAG(query: string): boolean {
  // Use the new persona-aware query classifier
  return shouldUseRAGForQuery(query);

  /* LEGACY KEYWORD-BASED APPROACH (disabled):
  const normalizedQuery = query.toLowerCase();

  // Keywords that suggest RAG is needed
  const ragKeywords = [
    'difference between',
    'compare',
    'what is',
    'tell me about',
    'explain',
    'definition of',
    'how does',
    'research',
    'paper',
    'study',
    'patent',
    'citation',
    'source',
    'document',
    'spatial ai',
    'physical ai',
    'machine learning',
    'artificial intelligence',
    'david fattal',
    // Patent-specific keywords
    'claims',
    'main claims',
    'patent claims',
    'inventors',
    'assignee',
    'filed',
    'granted',
    'abstract',
    'specification',
    'embodiment',
    'prior art',
    // Context-aware keywords
    'this patent',
    'the patent',
    'that document',
    'this document',
    'about',
    'details',
    'more information',
    'specifics',
  ];

  // Simple heuristic: if query contains RAG keywords, use RAG
  return ragKeywords.some(keyword => normalizedQuery.includes(keyword));
  */
}

/**
 * Execute RAG tools sequentially with context management
 */
export async function executeRAGWithContext(
  query: string,
  conversationId?: string,
  messageHistory?: Array<{ role: string; content: string }>
): Promise<RAGContext> {
  const startTime = Date.now();

  try {
    console.log(
      `🔍 Sequential RAG execution with context for query: "${query}"`
    );

    // Get authenticated user for RAG tools
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log('❌ Sequential RAG: No authenticated user');
      return {
        hasRAGResults: false,
        ragResults: '',
        citations: '',
        toolsUsed: [],
        executionTime: Date.now() - startTime,
        contextUsed: false,
        freshResults: 0,
        carryOverResults: 0,
        memoryUsed: false,
        citationsPersisted: false,
        isMetadataQuery: false,
        citationRelevance: undefined,
        processedContext: undefined,
      };
    }

    // Initialize context manager
    let contextManager: ConversationContextManager | null = null;
    let turnAnalysis: TurnAnalysis | null = null;
    let carryOverResult: ContextCarryOverResult | null = null;

    if (conversationId && conversationId !== 'temp') {
      contextManager = createContextManager(conversationId);

      // Classify the turn based on query and conversation history
      const previousQueries =
        messageHistory
          ?.filter(m => m.role === 'user')
          .map(m => m.content)
          .slice(-3) || [];

      turnAnalysis = await contextManager.classifyTurn(query, previousQueries);
      console.log(
        `🎯 Turn classified as: ${turnAnalysis.turnType} (confidence: ${turnAnalysis.confidence})`
      );
      console.log(`📋 Response mode: ${turnAnalysis.responseMode}`);

      // Manage context carry-over
      carryOverResult = await contextManager.manageContextCarryOver(
        turnAnalysis.turnType
      );
      console.log(
        `🔄 Context carry-over: ${carryOverResult.totalSourcesCarried} sources carried`
      );
    }

    // Classify query intent to determine best tool
    const queryIntent = classifyQueryIntent(query);
    console.log(
      `🎯 Query classified as: ${queryIntent.primaryTool} (confidence: ${queryIntent.confidence})`
    );

    // Check for metadata queries first - these have priority over regular search
    console.log('--->>> ABOUT TO CALL detectMetadataQuery');
    const metadataDetection = detectMetadataQuery(query);
    if (metadataDetection.isMetadata) {
      console.log(`🏷️ Metadata query detected: ${metadataDetection.type} type`);

      try {
        const metadataResult = await executeMetadataSearch(
          query,
          conversationId,
          supabase
        );
        if (
          metadataResult.isMetadataQuery &&
          metadataResult.structuredResponse
        ) {
          console.log(
            '✅ Metadata search successful, returning structured response'
          );
          return {
            hasRAGResults: true,
            ragResults: metadataResult.structuredResponse,
            citations: '', // Metadata queries use document metadata, not chunk citations
            toolsUsed: ['metadata_search'],
            executionTime: Date.now() - startTime,
            contextUsed: false,
            freshResults: 1,
            carryOverResults: 0,
            memoryUsed: false,
            citationsPersisted: false,
            isMetadataQuery: true,
            citationRelevance: undefined,
            processedContext: undefined,
          };
        }
      } catch (error) {
        console.warn(
          '❌ Metadata search failed, falling back to regular search:',
          error
        );
      }
    }

    console.log('--->>> ABOUT TO EXECUTE a tool');

    let ragResults = '';
    let citations = '';
    const toolsUsed: string[] = [];
    let freshResults = 0;
    const carryOverResults = carryOverResult?.totalSourcesCarried || 0;

    // Initialize fact summarization context
    let contextMemory: ContextMemory | undefined;
    let factSummaries: FactSummary[] = [];
    let memoryUsed = false;

    // Initialize citation persistence context
    let citationBatch: CitationBatch | undefined;
    let enhancedCitations: EnhancedCitation[] = [];
    const citationsPersisted = false;

    // Initialize metadata query context
    let isMetadataQuery = false;

    // Initialize citation relevance tracking
    let processedContext: ProcessedContext | undefined;
    let citationRelevance: CitationRelevanceMetrics | undefined;

    // Build context memory for existing conversations
    if (contextManager && conversationId && conversationId !== 'temp') {
      try {
        contextMemory = await getCompactedContextMemory(conversationId, 1500); // Limit to 1500 tokens
        if (contextMemory.activeFacts.length > 0) {
          memoryUsed = true;
          console.log(
            `🧠 Context memory loaded: ${contextMemory.activeFacts.length} facts, ${contextMemory.memorySize} tokens`
          );
        }
      } catch (error) {
        console.warn('Failed to load context memory:', error);
      }
    }

    // Determine response mode from context analysis
    const responseMode = turnAnalysis?.responseMode || 'EXPLAIN';

    // Extract document context for context-aware search
    const documentContext = await extractDocumentContext(messageHistory, query);
    if (documentContext.length > 0) {
      console.log(
        `🎯 Document context extracted: ${documentContext.length} document(s) for context-aware search`
      );
    }

    // Execute the primary tool with context awareness
    switch (queryIntent.primaryTool) {
      case 'search_corpus': {
        const tool = ragSearchTools.search_corpus;

        // Enhanced limit based on context - always do fresh search
        const searchLimit = turnAnalysis?.turnType === 'new-topic' ? 8 : 5;

        const result = await tool.execute({
          query,
          limit: searchLimit,
          responseMode,
          documentIds: documentContext.length > 0 ? documentContext : undefined,
        });

        if (
          (result.success && result.results && result.results.length > 0) ||
          (result.success && result.metadataQuery && result.message)
        ) {
          // Handle metadata queries separately
          if (result.metadataQuery && result.message) {
            ragResults = formatMetadataResults(result);
            citations = ''; // Metadata queries don't have traditional citations
            enhancedCitations = [];
            toolsUsed.push('search_corpus');
            freshResults = 1; // Indicate we have results
            isMetadataQuery = true; // Mark as metadata query for citation handling
            break;
          }

          freshResults = result.results.length;

          // Store new sources for context management and apply hybrid retrieval
          if (contextManager && result.results && carryOverResult) {
            const searchResults: SearchResult[] = result.results.map(
              (r: any) => ({
                documentId: r.documentId || '',
                chunkId: r.chunkId || undefined,
                score: r.score || 0.5,
                content: r.content,
                title: r.title,
                docType: (r.docType as any) || 'paper',
                pageRange: r.pageRange,
                metadata: {} as any,
              })
            );

            // Extract fact summaries from fresh search results
            try {
              factSummaries = await extractAndStoreFactSummaries(
                conversationId,
                searchResults
              );
              console.log(
                `📝 Extracted ${factSummaries.length} fact summaries from search results`
              );
            } catch (error) {
              console.warn('Failed to extract fact summaries:', error);
            }

            // Apply hybrid retrieval strategy: merge fresh results with carried sources
            const hybridResults = await applyHybridRetrievalStrategy(
              searchResults,
              carryOverResult.relevantSources,
              turnAnalysis!.turnType
            );

            // Use hybrid results instead of just fresh results with citation filtering
            if (hybridResults.length > 0) {
              try {
                // Apply advanced context processing with citation relevance filtering
                const contextProcessingResult = await processSearchContext(
                  query,
                  hybridResults,
                  queryIntent,
                  4000 // Max tokens for system prompt
                );

                console.log(`🔍 Citation relevance filtering applied:`);
                console.log(
                  `   Total citations: ${contextProcessingResult.citationRelevance.totalCitations}`
                );
                console.log(
                  `   Relevant citations: ${contextProcessingResult.citationRelevance.relevantCitations}`
                );
                console.log(
                  `   Average relevance: ${contextProcessingResult.citationRelevance.averageRelevance.toFixed(3)}`
                );
                console.log(
                  `   Confidence score: ${contextProcessingResult.citationRelevance.confidenceScore.toFixed(3)}`
                );

                // Use processed context with filtered citations
                ragResults = contextProcessingResult.content;
                citations = formatProcessedCitations(
                  contextProcessingResult.citations
                );

                // Store processing results for return
                processedContext = contextProcessingResult;
                citationRelevance = contextProcessingResult.citationRelevance;

                // Create enhanced citations from processed results
                enhancedCitations = contextProcessingResult.citations.map(
                  (citation, index) => ({
                    documentId: citation.id || 'unknown',
                    chunkId: citation.chunkIndex?.toString(),
                    marker: citation.id,
                    factSummary: citation.extractedContent,
                    pageRange: undefined,
                    relevanceScore: citation.relevanceScore,
                    citationOrder: index + 1,
                    title: citation.title,
                    documentType: citation.docType,
                  })
                );
              } catch (error) {
                console.warn(
                  'Citation relevance filtering failed, falling back to standard formatting:',
                  error
                );
                ragResults = formatSearchResultsWithHybridSources(
                  hybridResults,
                  carryOverResult
                );
                citations = formatCitationsWithHybridSources(
                  hybridResults,
                  carryOverResult
                );
                enhancedCitations = createEnhancedCitationsFromHybridResults(
                  hybridResults,
                  carryOverResult
                );
              }
            }

            // Update context with new search results
            await contextManager.manageContextCarryOver(
              turnAnalysis!.turnType,
              searchResults
            );
          } else {
            ragResults = formatSearchResultsWithContext(
              result,
              carryOverResult
            );
            citations = formatCitationsWithContext(result, carryOverResult);

            // Create enhanced citations from context-aware results
            enhancedCitations = createEnhancedCitationsFromContextResults(
              result,
              carryOverResult
            );
          }

          toolsUsed.push('search_corpus');
        }
        break;
      }

      case 'lookup_facts': {
        // Extract entity name from query
        const entityName = extractEntityName(query);
        if (entityName) {
          const tool = ragSearchTools.lookup_facts;
          const result = await tool.execute({
            entityName,
            entityType: 'technology',
            factType: 'basic_info',
          });

          if (result.success && result.facts && result.facts.length > 0) {
            freshResults = result.facts.length;
            ragResults = formatFactResults(result);
            citations = formatFactCitations(result);
            toolsUsed.push('lookup_facts');
          }
        }
        break;
      }

      case 'get_timeline': {
        const tool = ragSearchTools.get_timeline;
        const result = await tool.execute({
          topic: query,
        });

        if (result.success && result.events && result.events.length > 0) {
          freshResults = result.events.length;
          ragResults = formatTimelineResults(result);
          citations = formatTimelineCitations(result);
          toolsUsed.push('get_timeline');
        }
        break;
      }
    }

    // If primary tool failed or returned no results, try search_corpus as fallback
    if (!ragResults && queryIntent.primaryTool !== 'search_corpus') {
      console.log('🔄 Primary tool failed, falling back to search_corpus');
      const tool = ragSearchTools.search_corpus;
      const result = await tool.execute({
        query,
        limit: 5,
        responseMode,
        documentIds: documentContext.length > 0 ? documentContext : undefined,
      });

      if (result.success && result.results && result.results.length > 0) {
        freshResults = result.results.length;
        ragResults = formatSearchResults(result);
        citations = formatCitations(result);
        toolsUsed.push('search_corpus');

        // Create enhanced citations for persistence
        enhancedCitations = createEnhancedCitationsFromResults(result);
      }
    }

    // Persist citations if we have results and this is not a temporary conversation
    if (
      ragResults &&
      conversationId &&
      conversationId !== 'temp' &&
      factSummaries.length > 0
    ) {
      try {
        // We'll need the messageId from the chat API, so we'll do citation persistence post-response
        // For now, just prepare the citation data
        console.log(
          `💾 Prepared citation data for persistence: ${factSummaries.length} fact summaries`
        );
      } catch (error) {
        console.warn('Failed to prepare citation persistence:', error);
      }
    }

    const executionTime = Date.now() - startTime;

    // RELEVANCE THRESHOLD FILTERING:
    // Apply minimum relevance threshold to determine if RAG results should be used
    const RELEVANCE_THRESHOLD = 0.3; // Minimum average relevance score (0.0-1.0)
    const MIN_RELEVANT_CITATIONS = 1; // Minimum number of relevant citations required

    let filteredRAGResults = ragResults;
    let filteredCitations = citations;
    let filteredEnhancedCitations = enhancedCitations;
    let hasRAGResults = ragResults.length > 0;

    // Apply relevance filtering if we have citation relevance metrics
    if (citationRelevance && ragResults.length > 0 && !isMetadataQuery) {
      const meetsRelevanceThreshold =
        citationRelevance.averageRelevance >= RELEVANCE_THRESHOLD &&
        citationRelevance.relevantCitations >= MIN_RELEVANT_CITATIONS;

      if (!meetsRelevanceThreshold) {
        console.log(`🔍 RAG results filtered out due to low relevance:`);
        console.log(
          `   Average relevance: ${citationRelevance.averageRelevance.toFixed(3)} < ${RELEVANCE_THRESHOLD}`
        );
        console.log(
          `   Relevant citations: ${citationRelevance.relevantCitations} < ${MIN_RELEVANT_CITATIONS}`
        );

        // Clear results that don't meet threshold
        filteredRAGResults = '';
        filteredCitations = '';
        filteredEnhancedCitations = [];
        hasRAGResults = false;
      } else {
        console.log(`✅ RAG results passed relevance filtering:`);
        console.log(
          `   Average relevance: ${citationRelevance.averageRelevance.toFixed(3)} >= ${RELEVANCE_THRESHOLD}`
        );
        console.log(
          `   Relevant citations: ${citationRelevance.relevantCitations} >= ${MIN_RELEVANT_CITATIONS}`
        );
      }
    } else if (ragResults.length > 0) {
      // For metadata queries or results without relevance metrics, keep as-is
      console.log(
        `📋 RAG results preserved (metadata query or no relevance metrics available)`
      );
    }

    console.log(`✅ Sequential RAG completed in ${executionTime}ms`);
    console.log(`📊 Tools used: ${toolsUsed.join(', ')}`);
    console.log(
      `📝 RAG results length: ${filteredRAGResults.length} characters`
    );
    console.log(
      `🔄 Context: ${freshResults} fresh + ${carryOverResults} carry-over results`
    );

    return {
      hasRAGResults,
      ragResults: filteredRAGResults,
      citations: filteredCitations,
      toolsUsed,
      executionTime,
      contextUsed: !!contextManager,
      turnAnalysis: turnAnalysis || undefined,
      carryOverResult: carryOverResult || undefined,
      freshResults,
      carryOverResults,
      contextMemory,
      factSummaries: factSummaries.length > 0 ? factSummaries : undefined,
      memoryUsed,
      citationBatch,
      enhancedCitations:
        filteredEnhancedCitations.length > 0
          ? filteredEnhancedCitations
          : undefined,
      citationsPersisted,
      isMetadataQuery,
      citationRelevance,
      processedContext,
    };
  } catch (error) {
    console.error('❌ Sequential RAG execution failed:', error);
    return {
      hasRAGResults: false,
      ragResults: '',
      citations: '',
      toolsUsed: [],
      executionTime: Date.now() - startTime,
      contextUsed: false,
      freshResults: 0,
      carryOverResults: 0,
      memoryUsed: false,
      citationsPersisted: false,
      isMetadataQuery: false,
      citationRelevance: undefined,
      processedContext: undefined,
    };
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function executeRAG(query: string): Promise<RAGContext> {
  return executeRAGWithContext(query);
}

/**
 * Format search corpus results for injection into system prompt
 */
function formatSearchResults(result: {
  results?: Array<{
    title: string;
    docType: string;
    content: string;
    citation: string;
  }>;
}): string {
  const results = result.results || [];

  // Group results by document title to avoid redundant citations
  const groupedByDocument = new Map<
    string,
    { results: typeof results; docType: string }
  >();

  results.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, { results: [], docType: r.docType });
    }
    groupedByDocument.get(r.title)!.results.push(r);
  });

  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  return documents
    .map(
      ([title, { results: docResults, docType }], docIndex: number) =>
        `**Source ${docIndex + 1}:** ${title} (${docType})
${docResults.map(r => r.content).join('\n\n')}
Citation: [${docIndex + 1}]`
    )
    .join('\n\n');
}

/**
 * Format metadata search results (structured responses from personal queries)
 */
function formatMetadataResults(result: {
  message?: string;
  queryType?: string;
}): string {
  if (!result.message) {
    return '';
  }

  // Metadata responses are already formatted and ready to use
  return result.message;
}

/**
 * Format citations for search results - grouped by document
 */
function formatCitations(result: {
  citations?: Array<{
    marker: string;
    title: string;
    factSummary: string;
    documentType: string;
  }>;
}): string {
  const citations = result.citations || [];

  // Group citations by document title
  const groupedByDocument = new Map<
    string,
    { documentType: string; factSummary: string }
  >();

  citations.forEach(c => {
    if (!groupedByDocument.has(c.title)) {
      groupedByDocument.set(c.title, {
        documentType: c.documentType,
        factSummary: c.factSummary,
      });
    }
  });

  // Create clean numbered citations
  const documents = Array.from(groupedByDocument.entries());
  return documents
    .map(
      ([title, { documentType }], index: number) => `[${index + 1}]: ${title}`
    )
    .join('\n');
}

/**
 * Format fact lookup results
 */
function formatFactResults(result: {
  facts?: Array<{
    source: string;
    docType: string;
    content: string;
    citation: string;
  }>;
}): string {
  const facts = result.facts || [];

  // Group facts by source document to avoid redundant citations
  const groupedBySource = new Map<
    string,
    { facts: typeof facts; docType: string }
  >();

  facts.forEach(f => {
    if (!groupedBySource.has(f.source)) {
      groupedBySource.set(f.source, { facts: [], docType: f.docType });
    }
    groupedBySource.get(f.source)!.facts.push(f);
  });

  // Create numbered citations for each unique source
  const sources = Array.from(groupedBySource.entries());
  return sources
    .map(
      ([source, { facts: sourceFacts, docType }], sourceIndex: number) =>
        `**Source ${sourceIndex + 1}:** ${source} (${docType})
${sourceFacts.map(f => f.content).join('\n\n')}
Citation: [${sourceIndex + 1}]`
    )
    .join('\n\n');
}

/**
 * Format fact citations - grouped by source
 */
function formatFactCitations(result: {
  facts?: Array<{ citation: string; source: string }>;
}): string {
  const facts = result.facts || [];

  // Group citations by source
  const groupedBySource = new Map<string, boolean>();

  facts.forEach(f => {
    groupedBySource.set(f.source, true);
  });

  // Create clean numbered citations
  const sources = Array.from(groupedBySource.keys());
  return sources
    .map((source, index: number) => `[${index + 1}]: ${source}`)
    .join('\n');
}

/**
 * Format timeline results
 */
function formatTimelineResults(result: {
  events?: Array<{
    date: string;
    description: string;
    document: string;
    documentType: string;
    citation: string;
  }>;
}): string {
  const events = result.events || [];

  // Group events by document to avoid redundant citations
  const groupedByDocument = new Map<
    string,
    { events: typeof events; documentType: string }
  >();

  events.forEach(e => {
    if (!groupedByDocument.has(e.document)) {
      groupedByDocument.set(e.document, {
        events: [],
        documentType: e.documentType,
      });
    }
    groupedByDocument.get(e.document)!.events.push(e);
  });

  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  return documents
    .map(
      ([document, { events: docEvents, documentType }], docIndex: number) =>
        `**Source ${docIndex + 1}:** ${document} (${documentType})
${docEvents.map(e => `${e.date} - ${e.description}`).join('\n')}
Citation: [${docIndex + 1}]`
    )
    .join('\n\n');
}

/**
 * Format timeline citations - grouped by document
 */
function formatTimelineCitations(result: {
  events?: Array<{ citation: string; document: string; date: string }>;
}): string {
  const events = result.events || [];

  // Group citations by document
  const groupedByDocument = new Map<string, boolean>();

  events.forEach(e => {
    groupedByDocument.set(e.document, true);
  });

  // Create clean numbered citations
  const documents = Array.from(groupedByDocument.keys());
  return documents
    .map((document, index: number) => `[${index + 1}]: ${document}`)
    .join('\n');
}

/**
 * Extract entity name from query for fact lookup
 */
function extractEntityName(query: string): string | null {
  // Simple entity extraction patterns
  const patterns = [
    /(?:what is|tell me about|define|explain)\s+(.+?)(?:\?|$)/i,
    /(?:who is|about)\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract document references from conversation history for context-aware search
 */
async function extractDocumentContext(
  messageHistory: Array<{ role: string; content: string }> = [],
  currentQuery: string
): Promise<string[]> {
  const supabase = await createClient();
  const documentIds: string[] = [];

  // Combine recent messages and current query for context analysis
  const recentMessages = messageHistory.slice(-4); // Last 4 messages for context
  const contextText = [
    ...recentMessages.map(m => m.content),
    currentQuery,
  ].join(' ');

  // Extract patent numbers from context
  const patentMatches = contextText.match(/US\d+[A-Z]*\d*/gi) || [];

  // Extract document titles or references
  const titlePatterns = [
    /(?:patent|document|paper)\s+(?:titled|called|named)\s+"([^"]+)"/gi,
    /(?:the|this|that)\s+(patent|document|paper)\s+"([^"]+)"/gi,
    /"([^"]+)"\s+(?:patent|document|paper)/gi,
  ];

  const titleMatches: string[] = [];
  for (const pattern of titlePatterns) {
    let match;
    while ((match = pattern.exec(contextText)) !== null) {
      titleMatches.push(match[1] || match[2]);
    }
  }

  try {
    // Look up document IDs by patent numbers
    if (patentMatches.length > 0) {
      const { data: patentDocs } = await supabase
        .from('documents')
        .select('id, title, patent_no')
        .in(
          'patent_no',
          patentMatches.map(p => p.toUpperCase())
        );

      if (patentDocs) {
        documentIds.push(...patentDocs.map((doc: any) => doc.id));
        console.log(
          `🎯 Found ${patentDocs.length} documents by patent number: ${patentDocs.map((d: any) => d.patent_no).join(', ')}`
        );
      }
    }

    // Look up document IDs by titles
    if (titleMatches.length > 0) {
      const { data: titleDocs } = await supabase
        .from('documents')
        .select('id, title')
        .ilike('title', `%${titleMatches[0]}%`); // Use first title match

      if (titleDocs && titleDocs.length > 0) {
        const newIds = titleDocs
          .map((doc: any) => doc.id)
          .filter((id: any) => !documentIds.includes(id));
        documentIds.push(...newIds);
        console.log(
          `🎯 Found ${newIds.length} additional documents by title match`
        );
      }
    }

    // Analyze context for follow-up queries that should use previously mentioned documents
    const isFollowUpQuery =
      /(?:what|how|why|explain|describe|tell me|show me).*(?:about|of|in|from)?\s*(?:this|that|the|its?|their?)?\s*(?:patent|document|paper|claims?|details?|information)?/i.test(
        currentQuery
      );
    const isContextualQuery =
      /(?:main|primary|key|important|specific)\s+(?:claims?|details?|features?|aspects?)/i.test(
        currentQuery
      );

    // Enhanced follow-up query patterns for metadata and authorship questions
    const isMetadataQuery =
      /(?:who|what|when|where)\s+(?:are|is|were|was)?\s*(?:the)?\s*(?:authors?|inventors?|assignees?|companies?|organizations?|published?|filed?|granted?)/i.test(
        currentQuery
      );
    const isAuthorshipQuery =
      /(?:who)\s+(?:wrote|authored|invented|created|developed|filed|published)\s*(?:this|that|it)?/i.test(
        currentQuery
      );
    const isPronounReferenceQuery =
      /(?:who|what|when|where|how)\s+(?:are|is|were|was)\s+(?:they|it|this|that)/i.test(
        currentQuery
      );
    const isImplicitReferenceQuery =
      /^(?:who|what|when|where|how)\s+(?:are|is|were|was)\s+(?:the|its?|their?)\s+/i.test(
        currentQuery
      );

    // Debug logging for context pattern matching
    if (
      isMetadataQuery ||
      isAuthorshipQuery ||
      isPronounReferenceQuery ||
      isImplicitReferenceQuery
    ) {
      console.log(
        `🔍 Enhanced context pattern detected for query: "${currentQuery}"`
      );
      console.log(`   Metadata query: ${isMetadataQuery}`);
      console.log(`   Authorship query: ${isAuthorshipQuery}`);
      console.log(`   Pronoun reference: ${isPronounReferenceQuery}`);
      console.log(`   Implicit reference: ${isImplicitReferenceQuery}`);
    }

    // If this seems like a follow-up query and we haven't found documents yet, try to extract from context
    if (
      (isFollowUpQuery ||
        isContextualQuery ||
        isMetadataQuery ||
        isAuthorshipQuery ||
        isPronounReferenceQuery ||
        isImplicitReferenceQuery) &&
      documentIds.length === 0 &&
      recentMessages.length > 0
    ) {
      // Try to extract document context from recent assistant responses (which may contain citations)
      const recentAssistantMessages = recentMessages.filter(
        m => m.role === 'assistant'
      );
      for (const message of recentAssistantMessages) {
        // Look for citation patterns like [1]: Multi-view display with head tracking
        const citationMatches =
          message.content.match(/\[\d+\]:\s*([^\n]+)/g) || [];
        for (const citation of citationMatches) {
          const titleMatch = citation.match(/\[\d+\]:\s*([^\n]+)/);
          if (titleMatch) {
            const title = titleMatch[1].trim();
            const { data: citedDocs } = await supabase
              .from('documents')
              .select('id, title')
              .ilike('title', `%${title}%`);

            if (citedDocs && citedDocs.length > 0) {
              const newIds = citedDocs
                .map((doc: any) => doc.id)
                .filter((id: any) => !documentIds.includes(id));
              documentIds.push(...newIds);
              console.log(
                `🎯 Found ${newIds.length} documents from recent citations: ${title}`
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error extracting document context:', error);
  }

  return [...new Set(documentIds)]; // Remove duplicates
}

/**
 * Format search results with context information
 */
function formatSearchResultsWithContext(
  result: {
    results?: Array<{
      title: string;
      docType: string;
      content: string;
      citation: string;
    }>;
  },
  carryOverResult: ContextCarryOverResult | null
): string {
  const results = result.results || [];

  // Group results by document title to avoid redundant citations
  const groupedByDocument = new Map<
    string,
    { results: typeof results; docType: string }
  >();

  results.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, { results: [], docType: r.docType });
    }
    groupedByDocument.get(r.title)!.results.push(r);
  });

  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  let contextInfo = '';

  if (carryOverResult && carryOverResult.totalSourcesCarried > 0) {
    contextInfo = `\n**Context Notice:** This response incorporates ${carryOverResult.totalSourcesCarried} relevant sources from our ongoing conversation context.\n\n`;
  }

  return (
    contextInfo +
    documents
      .map(
        ([title, { results: docResults, docType }], docIndex: number) =>
          `**Source ${docIndex + 1}:** ${title} (${docType})
${docResults.map(r => r.content).join('\n\n')}
Citation: [${docIndex + 1}]`
      )
      .join('\n\n')
  );
}

/**
 * Format citations with context information
 */
function formatCitationsWithContext(
  result: {
    citations?: Array<{
      marker: string;
      title: string;
      factSummary: string;
      documentType: string;
    }>;
  },
  carryOverResult: ContextCarryOverResult | null
): string {
  const citations = result.citations || [];

  // Group citations by document title
  const groupedByDocument = new Map<
    string,
    { documentType: string; factSummary: string }
  >();

  citations.forEach(c => {
    if (!groupedByDocument.has(c.title)) {
      groupedByDocument.set(c.title, {
        documentType: c.documentType,
        factSummary: c.factSummary,
      });
    }
  });

  // Create clean numbered citations
  const documents = Array.from(groupedByDocument.entries());
  let contextNote = '';

  if (carryOverResult && carryOverResult.totalSourcesCarried > 0) {
    contextNote = `\n<!-- Context: ${carryOverResult.totalSourcesCarried} carried sources integrated -->\n`;
  }

  return (
    contextNote +
    documents
      .map(
        ([title, { documentType }], index: number) => `[${index + 1}]: ${title}`
      )
      .join('\n')
  );
}

/**
 * Create enhanced system prompt with RAG context
 */
export function createRAGEnhancedPrompt(
  basePrompt: string,
  ragContext: RAGContext
): string {
  if (!ragContext.hasRAGResults) {
    // When RAG fails or returns no results, explicitly inform the model
    const noRAGSection = `

## IMPORTANT: LIMITED ACCESS TO DOCUMENT CORPUS

You currently do not have access to David Fattal's document corpus or the RAG search returned no relevant results.

## CRITICAL INSTRUCTIONS FOR THIS RESPONSE:

- DO NOT fabricate or guess information about specific patents, papers, people, or technical details
- If asked about specific patents, papers, or documents, clearly state: "I cannot find information about [topic] in the available corpus. For accurate details about patents, papers, or technical documents, I'd recommend checking the original sources directly."
- DO NOT make up patent numbers, inventor names, publication dates, or technical specifications
- You can provide general knowledge about topics, but clearly distinguish between general knowledge and specific factual claims
- Be honest about limitations rather than providing potentially incorrect information
- Suggest alternative ways the user could find the information (USPTO database, Google Patents, original paper sources, etc.)

REMEMBER: It's better to admit uncertainty than to provide incorrect information that could mislead the user.`;

    return basePrompt + noRAGSection;
  }

  let contextualInfo = '';

  if (ragContext.contextUsed && ragContext.turnAnalysis) {
    contextualInfo = `

## CONVERSATION CONTEXT ANALYSIS

**Turn Type**: ${ragContext.turnAnalysis.turnType}
**Response Mode**: ${ragContext.turnAnalysis.responseMode}
**Context Confidence**: ${ragContext.turnAnalysis.confidence}

**Context Strategy Applied**: ${ragContext.turnAnalysis.reasoning}

**Sources Integration**: ${ragContext.freshResults} fresh results + ${ragContext.carryOverResults} contextual sources
`;
  }

  // Add context memory section if available
  let contextMemorySection = '';
  if (ragContext.memoryUsed && ragContext.contextMemory?.activeFacts) {
    contextMemorySection = `

## CONTEXT MEMORY

Previous conversation facts for reference:
${formatFactsForContext(ragContext.contextMemory.activeFacts)}
*Memory size: ${ragContext.contextMemory.memorySize} tokens, updated: ${ragContext.contextMemory.lastCompacted.toISOString().split('T')[0]}*
`;
  }

  const ragSection = `

## DOCUMENT CORPUS CONTEXT
${contextualInfo}${contextMemorySection}
You have access to the following relevant information from David Fattal's document corpus:

${ragContext.ragResults}

## CITATIONS

${ragContext.citations}

## INSTRUCTIONS

- Use the above context to provide accurate, well-cited responses
- Reference sources using clean numbered citations (e.g., [1], [2], [3])
- ${ragContext.contextUsed ? 'This response benefits from conversation context - build on previous insights where relevant' : 'This is a fresh query with no prior context'}
- If the context doesn't contain relevant information, say so clearly
- Always prioritize accuracy over completeness
- Include sources at the end using this sleek format with visual separation:
  
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280;">
  [1]: Document Title One<br>
  [2]: Document Title Two
  </div>`;

  const finalPrompt = basePrompt + ragSection;

  // Debug logging to investigate citation issues
  console.log('🔍 SYSTEM PROMPT DEBUG - RAG Context Present:');
  console.log(
    '📊 RAG Results Length:',
    ragContext.ragResults.length,
    'characters'
  );
  console.log(
    '📚 Citations Length:',
    ragContext.citations.length,
    'characters'
  );
  console.log('🔹 RAG Results Preview (first 500 chars):');
  console.log(ragContext.ragResults.substring(0, 500) + '...');
  console.log('🔹 Citations Preview:');
  console.log(ragContext.citations);
  console.log('📝 Final Prompt Length:', finalPrompt.length, 'characters');
  console.log('📝 Complete System Prompt:');
  console.log('='.repeat(80));
  console.log(finalPrompt);
  console.log('='.repeat(80));

  return finalPrompt;
}

// =======================
// Hybrid Retrieval Strategy
// =======================

/**
 * Apply hybrid retrieval strategy: merge fresh results with carried sources
 */
async function applyHybridRetrievalStrategy(
  freshResults: SearchResult[],
  carriedSources: ConversationSource[],
  turnType: TurnType
): Promise<HybridSearchResult[]> {
  console.log(
    `🔀 Applying hybrid retrieval: ${freshResults.length} fresh + ${carriedSources.length} carried`
  );

  // Convert carried sources to search result format (simplified)
  const carriedResults: HybridSearchResult[] = carriedSources.map(source => ({
    documentId: source.document_id,
    chunkId: undefined,
    score: source.carryScore,
    rerankedScore: source.carryScore,
    content: `[Carried context from previous conversation turns]`,
    title: `Document ${source.document_id.slice(-8)}`,
    docType: 'paper' as any,
    pageRange: undefined,
    sectionTitle: undefined,
    metadata: {} as any,
    isCarriedOver: true,
    turnsInactive: source.turns_inactive,
  }));

  // Convert fresh results to hybrid format
  const freshHybridResults: HybridSearchResult[] = freshResults.map(result => ({
    ...result,
    rerankedScore: result.score,
    isCarriedOver: false,
    turnsInactive: 0,
  }));

  // Merge and deduplicate by document ID
  const resultMap = new Map<string, HybridSearchResult>();

  // Add fresh results first (they take priority)
  freshHybridResults.forEach(result => {
    if (result.documentId) {
      resultMap.set(result.documentId, result);
    }
  });

  // Add carried results only if not already present from fresh results
  carriedResults.forEach(result => {
    if (!resultMap.has(result.documentId)) {
      resultMap.set(result.documentId, result);
    } else {
      // Boost the fresh result with carried context score
      const existingResult = resultMap.get(result.documentId)!;
      existingResult.rerankedScore = Math.min(existingResult.score * 1.2, 1.0);
      existingResult.hasCarriedContext = true;
    }
  });

  // Apply turn-specific weighting
  const weightedResults = Array.from(resultMap.values()).map(result => {
    let finalScore = result.rerankedScore || result.score;

    switch (turnType) {
      case 'drill-down':
        // Boost carried sources for drill-down
        if (result.isCarriedOver) {
          finalScore *= 1.3;
        }
        break;
      case 'same-sources':
        // Significantly boost carried sources
        if (result.isCarriedOver) {
          finalScore *= 1.5;
        }
        break;
      case 'new-topic':
        // Reduce weight of carried sources
        if (result.isCarriedOver) {
          finalScore *= 0.7;
        }
        break;
      case 'compare':
        // Balanced approach
        if (result.isCarriedOver) {
          finalScore *= 1.1;
        }
        break;
    }

    return {
      ...result,
      rerankedScore: Math.min(finalScore, 1.0),
    };
  });

  // Sort by final score and return top results
  return weightedResults
    .sort((a, b) => (b.rerankedScore || b.score) - (a.rerankedScore || a.score))
    .slice(0, 8);
}

/**
 * Extended search result interface for hybrid retrieval
 */
interface HybridSearchResult extends SearchResult {
  rerankedScore?: number;
  isCarriedOver?: boolean;
  turnsInactive?: number;
  hasCarriedContext?: boolean;
}

/**
 * Format hybrid search results for system prompt
 */
function formatSearchResultsWithHybridSources(
  results: HybridSearchResult[],
  carryOverResult: ContextCarryOverResult | null
): string {
  // Group results by document title to avoid redundant citations
  const groupedByDocument = new Map<
    string,
    { results: HybridSearchResult[]; docType: string }
  >();

  results.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, { results: [], docType: r.docType });
    }
    groupedByDocument.get(r.title)!.results.push(r);
  });

  // Create numbered citations for each unique document
  const documents = Array.from(groupedByDocument.entries());
  let contextInfo = '';

  const carriedCount = results.filter(r => r.isCarriedOver).length;
  const freshCount = results.length - carriedCount;

  if (carryOverResult && carryOverResult.totalSourcesCarried > 0) {
    contextInfo = `\n**Hybrid Retrieval Applied**: ${freshCount} fresh sources + ${carriedCount} contextual sources from conversation history.\n\n`;
  }

  return (
    contextInfo +
    documents
      .map(([title, { results: docResults, docType }], docIndex: number) => {
        const isCarriedDoc = docResults[0].isCarriedOver;
        const contextMarker = isCarriedDoc ? ' [Contextual]' : ' [Fresh]';

        return `**Source ${docIndex + 1}:** ${title} (${docType})${contextMarker}
${docResults.map(r => r.content).join('\n\n')}
Citation: [${docIndex + 1}]`;
      })
      .join('\n\n')
  );
}

/**
 * Format citations for hybrid sources
 */
function formatCitationsWithHybridSources(
  results: HybridSearchResult[],
  carryOverResult: ContextCarryOverResult | null
): string {
  // Group citations by document title
  const groupedByDocument = new Map<
    string,
    { documentType: string; isCarried: boolean }
  >();

  results.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, {
        documentType: r.docType,
        isCarried: r.isCarriedOver || false,
      });
    }
  });

  // Create clean numbered citations with context indicators
  const documents = Array.from(groupedByDocument.entries());
  let contextNote = '';

  const carriedCount = results.filter(r => r.isCarriedOver).length;
  if (carriedCount > 0) {
    contextNote = `\n<!-- Hybrid retrieval: ${carriedCount} contextual + ${results.length - carriedCount} fresh sources -->\n`;
  }

  return (
    contextNote +
    documents
      .map(([title, { documentType, isCarried }], index: number) => {
        const marker = isCarried ? ' (contextual)' : '';
        return `[${index + 1}]: ${title}${marker}`;
      })
      .join('\n')
  );
}

/**
 * Create enhanced citations from search corpus results for database persistence
 */
function createEnhancedCitationsFromResults(result: {
  results?: Array<{
    title: string;
    docType: string;
    content: string;
    citation: string;
    documentId?: string;
    chunkId?: string;
    score?: number;
    pageRange?: string;
  }>;
  citations?: Array<{
    marker: string;
    title: string;
    factSummary: string;
    documentType: string;
  }>;
}): EnhancedCitation[] {
  const results = result.results || [];
  const citations = result.citations || [];

  // Group citations by document title and extract relevant information
  const groupedByDocument = new Map<
    string,
    {
      documentType: string;
      factSummary: string;
      documentId?: string;
      chunkId?: string;
      score?: number;
      pageRange?: string;
    }
  >();

  // First, process citations to get fact summaries
  citations.forEach(c => {
    if (!groupedByDocument.has(c.title)) {
      groupedByDocument.set(c.title, {
        documentType: c.documentType,
        factSummary: c.factSummary,
      });
    }
  });

  // Then, enrich with search result data (documentId, chunkId, etc.)
  results.forEach(r => {
    if (groupedByDocument.has(r.title)) {
      const existing = groupedByDocument.get(r.title)!;
      existing.documentId = r.documentId;
      existing.chunkId = r.chunkId;
      existing.score = r.score;
      existing.pageRange = r.pageRange;
    } else {
      // If we have a search result but no citation, create one with empty fact summary
      groupedByDocument.set(r.title, {
        documentType: r.docType,
        factSummary: '',
        documentId: r.documentId,
        chunkId: r.chunkId,
        score: r.score,
        pageRange: r.pageRange,
      });
    }
  });

  // Convert to enhanced citations with proper numbering
  const documents = Array.from(groupedByDocument.entries());
  return documents.map(([title, data], index: number) => ({
    documentId:
      data.documentId || `unknown-${title.replace(/\s+/g, '-').toLowerCase()}`,
    chunkId: data.chunkId,
    marker: `[${index + 1}]`,
    factSummary: data.factSummary,
    pageRange: data.pageRange,
    relevanceScore: data.score || 1.0,
    citationOrder: index + 1,
    title,
    documentType: data.documentType,
  }));
}

/**
 * Create enhanced citations from hybrid search results for database persistence
 */
function createEnhancedCitationsFromHybridResults(
  hybridResults: Array<{
    title: string;
    docType: string;
    score: number;
    isCarriedOver?: boolean;
    documentId?: string;
    chunkId?: string;
    pageRange?: string;
  }>,
  carryOverResult: ContextCarryOverResult | null
): EnhancedCitation[] {
  // Group by document title to avoid duplicates
  const groupedByDocument = new Map<
    string,
    {
      documentType: string;
      isCarriedOver: boolean;
      documentId?: string;
      chunkId?: string;
      score: number;
      pageRange?: string;
    }
  >();

  hybridResults.forEach(r => {
    if (!groupedByDocument.has(r.title)) {
      groupedByDocument.set(r.title, {
        documentType: r.docType,
        isCarriedOver: r.isCarriedOver || false,
        documentId: r.documentId,
        chunkId: r.chunkId,
        score: r.score,
        pageRange: r.pageRange,
      });
    }
  });

  // Convert to enhanced citations with proper numbering
  const documents = Array.from(groupedByDocument.entries());
  return documents.map(([title, data], index: number) => ({
    documentId:
      data.documentId || `unknown-${title.replace(/\s+/g, '-').toLowerCase()}`,
    chunkId: data.chunkId,
    marker: `[${index + 1}]`,
    factSummary: '', // Hybrid results don't have fact summaries by default
    pageRange: data.pageRange,
    relevanceScore: data.score,
    citationOrder: index + 1,
    title,
    documentType: data.documentType,
  }));
}

/**
 * Create enhanced citations from context-aware search results for database persistence
 */
function createEnhancedCitationsFromContextResults(
  result: {
    results?: Array<{
      title: string;
      docType: string;
      content: string;
      citation: string;
      documentId?: string;
      chunkId?: string;
      score?: number;
      pageRange?: string;
    }>;
    citations?: Array<{
      marker: string;
      title: string;
      factSummary: string;
      documentType: string;
    }>;
  },
  carryOverResult: ContextCarryOverResult | null
): EnhancedCitation[] {
  // Reuse the base function for standard result processing
  return createEnhancedCitationsFromResults(result);
}

/**
 * Format processed citations from context post-processing
 */
function formatProcessedCitations(
  citations: Array<{
    id: string;
    title: string;
    docType: string;
    relevanceScore: number;
    chunkIndex: number;
    extractedContent: string;
    url?: string;
    authors?: string[];
    publishedDate?: string;
  }>
): string {
  return citations
    .filter(citation => citation.relevanceScore >= 0.6) // Only include relevant citations
    .map((citation, index) => `[${index + 1}]: ${citation.title}`)
    .join('\n');
}
