import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tagCategorizationService } from '@/lib/rag/tag-categorization'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { content, existingTags = [], options = {} } = body

    if (!content || content.trim().length < 50) {
      return NextResponse.json({ 
        error: 'Content must be at least 50 characters long for tag suggestion' 
      }, { status: 400 })
    }

    const result = await tagCategorizationService.categorizeAndSuggestTags(
      content,
      existingTags,
      {
        maxSuggestions: options.maxSuggestions || 6,
        includePredefined: options.includePredefined !== false,
        confidenceThreshold: options.confidenceThreshold || 0.6
      }
    )

    return NextResponse.json({
      success: true,
      ...result,
      message: `Generated ${result.suggestedTags.length} tag suggestions in ${Math.round(result.processingTime)}ms`
    })

  } catch (error) {
    console.error('Tag suggestion error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate tag suggestions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}