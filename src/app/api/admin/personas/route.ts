/**
 * GET /api/admin/personas
 * Fetch all personas from database
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all personas
    const { data: personas, error } = await supabase
      .from('personas')
      .select('slug, name')
      .order('name');

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
