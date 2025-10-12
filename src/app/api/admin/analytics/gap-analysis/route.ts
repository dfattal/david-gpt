/**
 * Gap Analysis API
 * Uses Gemini 2.5 Pro to analyze failed queries and suggest document ingestion priorities
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Helper function to detect off-topic queries
function isOffTopic(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // Math questions
  if (/what is \d+[\+\-\*\/]\d+/.test(lowerQuery)) return true;
  if (/solve|calculate|compute \d+/.test(lowerQuery)) return true;

  // Greetings/personal
  if (/^(hello|hi|hey|who are you|what's your name|how are you)/.test(lowerQuery)) return true;

  // Generic personal questions
  if (/(favorite|favourite|like to|do you (enjoy|like)) (color|food|person|physicist|research|topic)/.test(lowerQuery)) return true;
  if (/^(why do you|what do you think|do you believe)/.test(lowerQuery)) return true;

  // Very short queries (likely incomplete or too vague)
  if (query.trim().length < 10) return true;

  // Generic small talk
  if (/^(thanks|thank you|ok|okay|sure|yes|no|maybe)$/i.test(lowerQuery)) return true;

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { persona_slug, failed_conversations } = body;

    if (!persona_slug || !failed_conversations) {
      return NextResponse.json(
        { success: false, error: 'persona_slug and failed_conversations are required' },
        { status: 400 }
      );
    }

    // Get persona data
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('slug, name, expertise, content, config_json')
      .eq('slug', persona_slug)
      .single();

    if (personaError || !persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Get document statistics
    const { data: docs } = await supabase
      .from('docs')
      .select('id, type')
      .contains('personas', [persona_slug]);

    const documentStats = {
      count: docs?.length || 0,
      types: [...new Set(docs?.map((d: any) => d.type) || [])],
    };

    // Extract failed user queries from conversations
    const allQueries = failed_conversations.flatMap((conv: any) =>
      (conv.messages || [])
        .filter((m: any) => m.role === 'user')
        .map((m: any) => ({
          content: m.content,
          rag_weight: conv.avg_rag_weight,
          conversation_id: conv.id,
        }))
    );

    // Filter out off-topic queries
    const relevantQueries = allQueries.filter((q: any) => !isOffTopic(q.content));
    const offTopicCount = allQueries.length - relevantQueries.length;

    if (relevantQueries.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          gaps: [],
          overall_assessment: 'No relevant failed queries to analyze. All queries were either off-topic or too vague.',
          off_topic_query_count: offTopicCount,
          total_queries_analyzed: allQueries.length,
        },
      });
    }

    // Build dynamic prompt with persona context
    const personaContent = persona.content || `Persona: ${persona.name}\nExpertise: ${persona.expertise || 'General knowledge'}`;
    const topics = persona.config_json?.topics || [];
    const topicsStr = topics.length > 0
      ? JSON.stringify(topics, null, 2)
      : 'No specific topics configured';

    const queriesStr = relevantQueries
      .slice(0, 50) // Limit to 50 queries to avoid token limits
      .map((q: any, i: number) => `${i + 1}. "${q.content}" (RAG weight: ${q.rag_weight?.toFixed(2) || 'N/A'})`)
      .join('\n');

    const prompt = `You are analyzing failed queries for a RAG-based AI assistant to identify knowledge gaps.

PERSONA INFORMATION (use this to understand scope and expertise):
${personaContent}

CURRENT KNOWLEDGE BASE COVERAGE:
Topics: ${topicsStr}
Document Count: ${documentStats.count}
Document Types: ${documentStats.types.join(', ') || 'None'}

FAILED QUERIES (low RAG weight < 0.4, indicating knowledge gaps):
${queriesStr}

TASK:
Analyze these failed queries in the context of this persona's expertise. Identify 3-5 major knowledge gaps causing these failures.

For each gap, suggest specific document types to ingest:
- Research papers (specify topics/keywords for search)
- Technical documentation
- Patents
- Blog posts/articles

Prioritize gaps by impact:
- High: Critical missing knowledge, many queries affected
- Medium: Important but less frequently asked
- Low: Nice to have, few queries affected

IMPORTANT:
- Only suggest documents relevant to the persona's domain
- Be specific about search keywords for document discovery
- Ignore any remaining off-topic queries

Return ONLY valid JSON (no markdown, no extra text):
{
  "gaps": [
    {
      "topic": "string",
      "description": "string (explain what's missing)",
      "failed_query_count": number,
      "priority": "high" | "medium" | "low",
      "suggested_documents": [
        {
          "type": "paper" | "patent" | "blog" | "technical_doc",
          "keywords": ["keyword1", "keyword2", "keyword3"],
          "rationale": "string (why this document type)"
        }
      ]
    }
  ],
  "overall_assessment": "string (summary of analysis)",
  "off_topic_query_count": ${offTopicCount}
}`;

    // Call Gemini API
    console.log('Calling Gemini API for gap analysis...');

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Gemini API not configured' },
        { status: 500 }
      );
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to analyze gaps with Gemini API' },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.error('No response from Gemini API');
      return NextResponse.json(
        { success: false, error: 'No response from Gemini API' },
        { status: 500 }
      );
    }

    // Parse JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', responseText);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON response from Gemini' },
        { status: 500 }
      );
    }

    // Add metadata
    analysisResult.total_queries_analyzed = allQueries.length;
    analysisResult.relevant_queries_count = relevantQueries.length;

    return NextResponse.json({
      success: true,
      data: analysisResult,
    });
  } catch (error) {
    console.error('Error in gap analysis API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
