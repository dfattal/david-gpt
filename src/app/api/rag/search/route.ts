import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { performSearch } from '@/lib/rag/search';

/**
 * POST /api/rag/search
 * Perform hybrid RAG search for a query
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const {
      query,
      personaSlug,
      limit = 12,
      vectorLimit = 20,
      bm25Limit = 20,
      vectorThreshold,
      bm25MinScore,
      tagBoostMultiplier = 1.075,
      maxChunksPerDoc = 3,
    } = body;

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!personaSlug || typeof personaSlug !== 'string') {
      return NextResponse.json(
        { error: 'personaSlug is required and must be a string' },
        { status: 400 }
      );
    }

    // Create authenticated Supabase client
    const supabase = await createClient();

    // Check authentication (optional for MVP, but recommended)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify persona exists
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('slug, name')
      .eq('slug', personaSlug)
      .eq('is_active', true)
      .single();

    if (personaError || !persona) {
      return NextResponse.json(
        { error: `Persona not found: ${personaSlug}` },
        { status: 404 }
      );
    }

    // Perform search
    const results = await performSearch(query, {
      personaSlug,
      limit,
      vectorLimit,
      bm25Limit,
      vectorThreshold,
      bm25MinScore,
      tagBoostMultiplier,
      maxChunksPerDoc,
    }, supabase);

    // Format response
    return NextResponse.json({
      query,
      personaSlug,
      personaName: persona.name,
      results: results.map(r => ({
        chunkId: r.chunkId,
        docId: r.docId,
        sectionPath: r.sectionPath,
        text: r.text,
        score: r.score,
        vectorScore: r.vectorScore,
        bm25Score: r.bm25Score,
        tagBoostApplied: r.tagBoostApplied,
        docTitle: r.docTitle,
        docType: r.docType,
        sourceUrl: r.sourceUrl,
      })),
      meta: {
        resultCount: results.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('RAG search API error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rag/search
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    service: 'RAG Search API',
    status: 'healthy',
    version: '1.0.0',
    features: [
      'Vector search (pgvector cosine similarity)',
      'BM25 lexical search (PostgreSQL full-text)',
      'RRF fusion',
      'Tag boosting',
      'Document deduplication',
    ],
  });
}