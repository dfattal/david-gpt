/**
 * GET /api/admin/personas/[slug]
 * Fetch a specific persona's configuration
 *
 * PATCH /api/admin/personas/[slug]
 * Update a specific persona's configuration
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * GET - Fetch persona configuration
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = await createClient();
  const { slug } = await context.params;

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch persona config
    const { data: persona, error } = await supabase
      .from('personas')
      .select('slug, name, expertise, config_json, updated_at')
      .eq('slug', slug)
      .single();

    if (error) {
      throw error;
    }

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Parse config_json if it's a string
    const configJson = typeof persona.config_json === 'string'
      ? JSON.parse(persona.config_json)
      : (persona.config_json || {});

    // Build form-compatible config object
    const config = {
      slug: persona.slug,
      display_name: persona.name || '',
      expertise: persona.expertise || '',
      version: configJson.version || '1.0.0',
      last_updated: configJson.last_updated || persona.updated_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      topics: configJson.topics || [],
      search: {
        vector_threshold: configJson.search?.vector_threshold ?? configJson.router?.vector_threshold ?? 0.35,
      },
    };

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error fetching persona config:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch persona config',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update persona configuration
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = await createClient();
  const { slug } = await context.params;

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.slug || !body.display_name) {
      return NextResponse.json(
        { error: 'Missing required fields: slug, display_name' },
        { status: 400 }
      );
    }

    // Ensure slug matches URL parameter
    if (body.slug !== slug) {
      return NextResponse.json(
        { error: 'Slug in body must match URL parameter' },
        { status: 400 }
      );
    }

    // Validate router config
    if (!body.router || typeof body.router !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid router configuration' },
        { status: 400 }
      );
    }

    // Validate topics
    if (!Array.isArray(body.topics)) {
      return NextResponse.json(
        { error: 'Topics must be an array' },
        { status: 400 }
      );
    }

    // Build config_json from body (excluding DB-level fields)
    const configJson = {
      slug: body.slug,
      display_name: body.display_name,
      version: body.version,
      last_updated: body.last_updated,
      topics: body.topics,
      search: body.search,
    };

    // Update persona config in database
    const { data: updatedPersona, error: updateError } = await supabase
      .from('personas')
      .update({
        name: body.display_name,
        expertise: body.expertise || null,
        config_json: configJson,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      persona: updatedPersona,
    });
  } catch (error) {
    console.error('Error updating persona config:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update persona config',
      },
      { status: 500 }
    );
  }
}
