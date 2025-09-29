import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check user role - only admin can generate titles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { content, metaTitle } = await req.json();
    
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Generate title using OpenAI
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: `You are an expert at generating concise, descriptive titles for documents that will be used in academic citations. 
          Generate a clear, informative title (max 80 characters) that captures the main topic or purpose of the provided content.
          
          ${metaTitle ? `You have access to an extracted metadata title: "${metaTitle}". Use this as context but improve it to be more human-readable and descriptive.` : ''}
          
          Rules:
          - Keep it under 80 characters
          - Make it descriptive and specific for citation purposes
          - Avoid generic words like "document", "text", "content"
          - Use title case
          - For academic papers, include key concepts and methods
          - For patents, focus on the specific invention or technology
          - For URLs, describe the main content or purpose
          - Prioritize clarity and searchability for researchers
          
          Return only the title, no quotes or additional text.`
        },
        {
          role: 'user',
          content: `Generate a title for this content:\n\n${content.substring(0, 2000)}`
        }
      ],
      maxTokens: 50,
      temperature: 0.3
    });

    // Extract the title from the stream
    let title = '';
    for await (const chunk of result.textStream) {
      title += chunk;
    }

    // Clean up the title
    title = title.trim().replace(/^["']|["']$/g, '');
    
    // Fallback if generation fails
    if (!title || title.length < 3) {
      title = content.split('\n')[0]?.trim()?.substring(0, 80) || 'Untitled Document';
    }

    return NextResponse.json({ title });

  } catch (error) {
    console.error('Title generation error:', error);
    
    // Fallback title generation
    const fallbackTitle = 'Generated Document Title';
    return NextResponse.json({ title: fallbackTitle });
  }
}