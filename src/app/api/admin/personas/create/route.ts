/**
 * POST /api/admin/personas/create
 * Creates a new persona from uploaded persona.md file
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import matter from 'gray-matter';

interface PersonaFrontmatter {
  slug: string;
  name: string;
  persona_type: 'real_person' | 'fictional_character';
  expertise: string;
  version?: string;
  example_questions?: string[];
}

interface Topic {
  id: string;
  aliases: string[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    // Parse frontmatter and content
    const parsed = matter(content);
    const frontmatter = parsed.data as PersonaFrontmatter;
    const markdown = parsed.content;

    // Validate required frontmatter
    if (!frontmatter.slug || !frontmatter.name || !frontmatter.persona_type) {
      return NextResponse.json(
        { error: 'Missing required frontmatter fields (slug, name, persona_type)' },
        { status: 400 }
      );
    }

    // Check if persona already exists
    const { data: existing } = await supabase
      .from('personas')
      .select('slug')
      .eq('slug', frontmatter.slug)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `Persona with slug "${frontmatter.slug}" already exists` },
        { status: 409 }
      );
    }

    // Extract topics and aliases from markdown
    const topics = extractTopicsFromMarkdown(markdown);

    // Process system prompt sections
    const systemPrompt = processSystemPrompt(markdown, frontmatter);

    // Build config_json
    const configJson = {
      slug: frontmatter.slug,
      display_name: frontmatter.name,
      expertise: frontmatter.expertise || '',
      version: frontmatter.version || '1.0.0',
      last_updated: new Date().toISOString().split('T')[0],
      topics,
      search: {
        vector_threshold: 0.35, // Default
      },
    };

    // Insert into database
    const { data: persona, error } = await supabase
      .from('personas')
      .insert({
        slug: frontmatter.slug,
        name: frontmatter.name,
        persona_type: frontmatter.persona_type,
        expertise: frontmatter.expertise || '',
        content: systemPrompt,
        example_questions: frontmatter.example_questions || [],
        config_json: configJson,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create persona in database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      slug: persona.slug,
      message: 'Persona created successfully',
    });
  } catch (error) {
    console.error('Create persona error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Extract topics and aliases from markdown content
 */
function extractTopicsFromMarkdown(markdown: string): Topic[] {
  const topics: Topic[] = [];

  // Find the "Search Topics & Aliases" section
  const topicsSectionMatch = markdown.match(/## Search Topics & Aliases([\s\S]*?)(?=\n##|\n---|$)/);

  if (!topicsSectionMatch) {
    return topics;
  }

  const topicsSection = topicsSectionMatch[1];

  // Extract individual topics (### Topic N: [topic-id])
  const topicMatches = topicsSection.matchAll(/### Topic \d+: (.+?)\n\*\*Aliases\*\*: (.+?)\n/g);

  for (const match of topicMatches) {
    const topicId = match[1].trim();
    const aliasesStr = match[2].trim();

    // Parse aliases (handle quoted multi-word aliases)
    const aliases: string[] = [];
    const aliasMatches = aliasesStr.matchAll(/(?:"([^"]+)"|([^,\s]+))/g);

    for (const aliasMatch of aliasMatches) {
      const alias = (aliasMatch[1] || aliasMatch[2]).trim();
      if (alias) {
        aliases.push(alias);
      }
    }

    if (topicId && aliases.length > 0) {
      topics.push({
        id: topicId,
        aliases,
      });
    }
  }

  return topics;
}

/**
 * Process markdown content into system prompt
 */
function processSystemPrompt(markdown: string, frontmatter: PersonaFrontmatter): string {
  const sections: string[] = [];

  // Extract Core Identity
  const coreIdentityMatch = markdown.match(/## Core Identity([\s\S]*?)(?=\n##|\n---|$)/);
  if (coreIdentityMatch) {
    sections.push('# Core Identity\n' + coreIdentityMatch[1].trim());
  }

  // Extract Personality & Tone
  const personalityMatch = markdown.match(/## Personality & Tone([\s\S]*?)(?=\n##|\n---|$)/);
  if (personalityMatch) {
    sections.push('# Personality & Tone\n' + personalityMatch[1].trim());
  }

  // Extract Expertise
  const expertiseMatch = markdown.match(/## Expertise([\s\S]*?)(?=\n##|\n---|$)/);
  if (expertiseMatch) {
    sections.push('# Expertise\n' + expertiseMatch[1].trim());
  }

  // Extract LLM System Prompt Instructions (most important!)
  const llmInstructionsMatch = markdown.match(/## LLM System Prompt Instructions([\s\S]*?)(?=\n##|\n---|$)/);
  if (llmInstructionsMatch) {
    sections.push('# Response Instructions\n' + llmInstructionsMatch[1].trim());
  }

  // Extract Balance section if exists
  const balanceMatch = markdown.match(/## Balance:.*?\n([\s\S]*?)(?=\n##|\n---|$)/);
  if (balanceMatch) {
    sections.push('# Balance\n' + balanceMatch[1].trim());
  }

  // Extract Core Values if exists
  const valuesMatch = markdown.match(/## Core Values([\s\S]*?)(?=\n##|\n---|$)/);
  if (valuesMatch) {
    sections.push('# Core Values\n' + valuesMatch[1].trim());
  }

  // Add persona type instructions
  const personaTypeInstructions = frontmatter.persona_type === 'real_person'
    ? '\n\n# Identity Context\nYou are representing a real person. Use first-person perspective naturally (e.g., "I invented...", "My work on..."). Reference actual accomplishments, papers, and patents from your knowledge base. Be honest about the limits of your knowledge beyond documented expertise.'
    : '\n\n# Identity Context\nYou are an AI assistant with specialized knowledge. Explain your expertise areas and specializations clearly. Be transparent about being an AI assistant. Do not claim to be a real person or falsely attribute work.';

  sections.push(personaTypeInstructions);

  // Combine all sections
  return sections.join('\n\n---\n\n');
}
