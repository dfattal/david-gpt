import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Tag analytics and suggestions API
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20')
    const type = searchParams.get('type') || 'suggestions'

    if (type === 'suggestions') {
      // Get tag suggestions based on query and popularity
      const { data: documents, error } = await supabase
        .from('rag_documents')
        .select('tags')
        .eq('owner', user.id)

      if (error) {
        console.error('Error fetching documents for tag suggestions:', error)
        return NextResponse.json({ error: 'Failed to fetch tag suggestions' }, { status: 500 })
      }

      // Extract and count all tags
      const tagCounts = new Map<string, number>()
      documents.forEach(doc => {
        doc.tags?.forEach((tag: string) => {
          const normalizedTag = tag.toLowerCase().trim()
          tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1)
        })
      })

      // Convert to array and sort by frequency
      let suggestions = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)

      // Filter by query if provided
      if (query) {
        const queryLower = query.toLowerCase()
        suggestions = suggestions.filter(({ tag }) => 
          tag.includes(queryLower)
        )
      }

      // Limit results
      suggestions = suggestions.slice(0, limit)

      return NextResponse.json({
        suggestions: suggestions.map(s => s.tag),
        analytics: suggestions
      })

    } else if (type === 'analytics') {
      // Get comprehensive tag analytics
      const { data: documents, error } = await supabase
        .from('rag_documents')
        .select('tags, created_at')
        .eq('owner', user.id)

      if (error) {
        console.error('Error fetching documents for tag analytics:', error)
        return NextResponse.json({ error: 'Failed to fetch tag analytics' }, { status: 500 })
      }

      const tagStats = new Map<string, { count: number, lastUsed: string, variants: Set<string> }>()

      documents.forEach(doc => {
        doc.tags?.forEach((tag: string) => {
          const normalizedTag = tag.toLowerCase().trim()
          const stats = tagStats.get(normalizedTag) || { count: 0, lastUsed: doc.created_at, variants: new Set() }
          
          stats.count++
          stats.variants.add(tag) // Track original casing
          if (doc.created_at > stats.lastUsed) {
            stats.lastUsed = doc.created_at
          }
          
          tagStats.set(normalizedTag, stats)
        })
      })

      const analytics = Array.from(tagStats.entries()).map(([normalizedTag, stats]) => ({
        tag: normalizedTag,
        count: stats.count,
        lastUsed: stats.lastUsed,
        variants: Array.from(stats.variants),
        needsNormalization: stats.variants.size > 1
      })).sort((a, b) => b.count - a.count)

      return NextResponse.json({ analytics })

    } else {
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
    }

  } catch (error) {
    console.error('Tags API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Tag management operations
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { action, tags, newTag } = body

    if (action === 'normalize') {
      // Normalize similar tags to a standard form
      const { oldTags, standardTag } = tags

      // Get all documents with the old tags
      const { data: documents, error: fetchError } = await supabase
        .from('rag_documents')
        .select('id, tags')
        .eq('owner', user.id)

      if (fetchError) {
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      const updates: { id: string, tags: string[] }[] = []

      documents.forEach(doc => {
        const normalizedTags = doc.tags.map((tag: string) => {
          const normalizedTag = tag.toLowerCase().trim()
          return oldTags.map((t: string) => t.toLowerCase().trim()).includes(normalizedTag) ? standardTag : tag
        })

        // Remove duplicates
        const uniqueTags: string[] = Array.from(new Set(normalizedTags))
        
        if (JSON.stringify(uniqueTags.sort()) !== JSON.stringify(doc.tags.sort())) {
          updates.push({ id: doc.id, tags: uniqueTags })
        }
      })

      // Batch update documents
      const results = await Promise.allSettled(
        updates.map(({ id, tags }) =>
          supabase
            .from('rag_documents')
            .update({ tags, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('owner', user.id)
        )
      )

      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      return NextResponse.json({
        success: true,
        message: `Normalized tags in ${successful} documents`,
        updated: successful,
        failed
      })

    } else if (action === 'merge') {
      // Merge multiple tags into one
      const { sourceTags, targetTag } = tags

      const { data: documents, error: fetchError } = await supabase
        .from('rag_documents')
        .select('id, tags')
        .eq('owner', user.id)

      if (fetchError) {
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      const updates: { id: string, tags: string[] }[] = []

      documents.forEach(doc => {
        const updatedTags = doc.tags.filter((tag: string) => 
          !sourceTags.map((t: string) => t.toLowerCase().trim()).includes(tag.toLowerCase().trim())
        )

        // Add target tag if any source tags were present
        const hasSourceTag = doc.tags.some((tag: string) => 
          sourceTags.map((t: string) => t.toLowerCase().trim()).includes(tag.toLowerCase().trim())
        )

        if (hasSourceTag && !updatedTags.map((t: string) => t.toLowerCase().trim()).includes(targetTag.toLowerCase().trim())) {
          updatedTags.push(targetTag)
        }

        if (JSON.stringify(updatedTags.sort()) !== JSON.stringify(doc.tags.sort())) {
          updates.push({ id: doc.id, tags: updatedTags })
        }
      })

      // Batch update
      const results = await Promise.allSettled(
        updates.map(({ id, tags }) =>
          supabase
            .from('rag_documents')
            .update({ tags, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('owner', user.id)
        )
      )

      const successful = results.filter(r => r.status === 'fulfilled').length

      return NextResponse.json({
        success: true,
        message: `Merged tags in ${successful} documents`,
        updated: successful
      })

    } else if (action === 'rename') {
      // Rename a tag across all documents
      const { oldTag, newTag } = tags

      const { data: documents, error: fetchError } = await supabase
        .from('rag_documents')
        .select('id, tags')
        .eq('owner', user.id)

      if (fetchError) {
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      const updates: { id: string, tags: string[] }[] = []

      documents.forEach(doc => {
        const updatedTags = doc.tags.map((tag: string) => 
          tag.toLowerCase().trim() === oldTag.toLowerCase().trim() ? newTag : tag
        )

        if (JSON.stringify(updatedTags.sort()) !== JSON.stringify(doc.tags.sort())) {
          updates.push({ id: doc.id, tags: updatedTags })
        }
      })

      // Batch update
      const results = await Promise.allSettled(
        updates.map(({ id, tags }) =>
          supabase
            .from('rag_documents')
            .update({ tags, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('owner', user.id)
        )
      )

      const successful = results.filter(r => r.status === 'fulfilled').length

      return NextResponse.json({
        success: true,
        message: `Renamed tag in ${successful} documents`,
        updated: successful
      })

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Tag management error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}