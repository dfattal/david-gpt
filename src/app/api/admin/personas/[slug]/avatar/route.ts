/**
 * POST /api/admin/personas/[slug]/avatar
 * Upload persona avatar image to Supabase storage
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(
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
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 2MB' },
        { status: 400 }
      );
    }

    // Get file extension
    const fileExt = file.name.split('.').pop();
    const fileName = `${slug}-${Date.now()}.${fileExt}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('persona-avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading avatar:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('persona-avatars')
      .getPublicUrl(fileName);

    // Update persona with new avatar URL
    const { error: updateError } = await supabase
      .from('personas')
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug);

    if (updateError) {
      console.error('Error updating persona avatar:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      avatar_url: publicUrl,
    });
  } catch (error) {
    console.error('Error in avatar upload:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to upload avatar',
      },
      { status: 500 }
    );
  }
}
