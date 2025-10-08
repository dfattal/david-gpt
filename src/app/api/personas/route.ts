import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: personas, error } = await supabase
      .from('personas')
      .select('id, slug, name, expertise, example_questions, metadata, is_active, updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch personas' },
        { status: 500 }
      );
    }

    return NextResponse.json({ personas });
  } catch (error) {
    console.error('Failed to list personas:', error);
    return NextResponse.json(
      { error: 'Failed to list personas' },
      { status: 500 }
    );
  }
}