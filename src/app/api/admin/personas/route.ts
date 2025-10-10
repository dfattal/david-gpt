/**
 * GET /api/admin/personas
 * Fetch all personas from database
 */

import { createOptimizedAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  // Use service role client to bypass RLS and auth checks
  // Personas list is public info (just slug + name)
  const supabase = createOptimizedAdminClient();

  try {
    // Fetch all personas with all necessary fields for admin management
    const { data: personas, error } = await supabase
      .from('personas')
      .select('id, slug, name, persona_type, expertise, example_questions, metadata, is_active, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      personas: personas || [],
    });
  } catch (error) {
    console.error('Error fetching personas:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch personas',
      },
      { status: 500 }
    );
  }
}
