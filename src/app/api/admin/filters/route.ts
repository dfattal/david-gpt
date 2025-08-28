import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAccess } from '@/lib/admin/access-control'
import { filterEngine, FilterBuilder, FilterPresets, FilterUtils } from '@/lib/filtering/advanced-filters'

// GET /api/admin/filters - Apply advanced filters to content
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminAccess()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filterType = searchParams.get('type') || 'documents' // documents, entities, chunks
    const preset = searchParams.get('preset') // Predefined filter sets
    
    // Parse filter criteria from query params
    const criteria = parseFilterCriteria(searchParams)
    
    // Apply preset if specified
    let finalCriteria = criteria
    if (preset && preset in FilterPresets) {
      const presetFilters = FilterPresets[preset as keyof typeof FilterPresets]
      finalCriteria = FilterUtils.combineFilters([presetFilters, criteria])
    }

    // Validate filters
    const validation = FilterUtils.validateFilters(finalCriteria)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid filter criteria', details: validation.errors },
        { status: 400 }
      )
    }

    // Parse pagination and sorting options
    const options = {
      limit: Math.min(parseInt(searchParams.get('limit') || '50'), 100),
      offset: parseInt(searchParams.get('offset') || '0'),
      sortBy: searchParams.get('sortBy') || 'updated_at',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      includeFacets: searchParams.get('includeFacets') !== 'false'
    }

    await filterEngine.init()

    let result
    switch (filterType) {
      case 'entities':
        result = await filterEngine.filterEntities(finalCriteria, options)
        break
      case 'chunks':
        result = await filterEngine.filterChunks(finalCriteria, options)
        break
      default:
        result = await filterEngine.filterDocuments(finalCriteria, options)
    }

    return NextResponse.json({
      ...result,
      filterType,
      preset,
      validation,
      serializedFilters: FilterUtils.serializeFilters(finalCriteria)
    })

  } catch (error: any) {
    console.error('[Admin Filters] Error:', error)
    return NextResponse.json(
      { error: 'Failed to apply filters', details: error.message },
      { status: 500 }
    )
  }
}

// POST /api/admin/filters - Save custom filter preset
export async function POST(request: NextRequest) {
  try {
    const user = await checkAdminAccess()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, criteria, description, isPublic = false } = body

    if (!name || !criteria) {
      return NextResponse.json(
        { error: 'Name and criteria are required' },
        { status: 400 }
      )
    }

    // Validate the filter criteria
    const validation = FilterUtils.validateFilters(criteria)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid filter criteria', details: validation.errors },
        { status: 400 }
      )
    }

    // In a production system, this would save to database
    // For now, we'll return the formatted preset
    const preset = {
      id: `custom_${Date.now()}`,
      name,
      description,
      criteria,
      isPublic,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      serialized: FilterUtils.serializeFilters(criteria)
    }

    return NextResponse.json({
      message: 'Filter preset created successfully',
      preset
    })

  } catch (error: any) {
    console.error('[Admin Filters] Save error:', error)
    return NextResponse.json(
      { error: 'Failed to save filter preset', details: error.message },
      { status: 500 }
    )
  }
}

// Helper function to parse filter criteria from URL search params
function parseFilterCriteria(searchParams: URLSearchParams): any {
  const criteria: any = {}

  // Array filters
  const arrayFilters = [
    'products', 'partners', 'teams', 'status', 'contentTypes', 
    'tags', 'sources', 'entityTypes', 'relationTypes', 'languages', 'priority'
  ]
  
  arrayFilters.forEach(filter => {
    const value = searchParams.get(filter)
    if (value) {
      criteria[filter] = value.split(',').map(v => v.trim())
    }
  })

  // Date range
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (startDate && endDate) {
    criteria.dateRange = {
      start: new Date(startDate),
      end: new Date(endDate)
    }
  }

  // Confidence range
  const minConfidence = searchParams.get('minConfidence')
  const maxConfidence = searchParams.get('maxConfidence')
  if (minConfidence || maxConfidence) {
    criteria.confidence = {
      min: minConfidence ? parseFloat(minConfidence) : 0,
      max: maxConfidence ? parseFloat(maxConfidence) : 1
    }
  }

  // Single value filters
  const singleFilters = ['userId', 'searchQuery']
  singleFilters.forEach(filter => {
    const value = searchParams.get(filter)
    if (value) {
      criteria[filter] = value
    }
  })

  // Metadata (JSON string)
  const metadata = searchParams.get('metadata')
  if (metadata) {
    try {
      criteria.metadata = JSON.parse(metadata)
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Serialized filters (base64 encoded full criteria)
  const serialized = searchParams.get('serialized')
  if (serialized) {
    try {
      const deserializedCriteria = FilterUtils.deserializeFilters(serialized)
      return FilterUtils.combineFilters([criteria, deserializedCriteria])
    } catch {
      // Invalid serialized data, use parsed criteria
    }
  }

  return criteria
}