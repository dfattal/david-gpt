import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { createClient } from '@/lib/supabase/server'
import { trackDatabaseQuery } from '@/lib/performance'

// Admin document management endpoints
export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const search = searchParams.get('search')
    const format = searchParams.get('format')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'

    const offset = (page - 1) * limit

    try {
      let query = supabase
        .from('rag_documents')
        .select(`
          id,
          title,
          source_type,
          source_uri,
          doc_date,
          tags,
          labels,
          created_at,
          updated_at,
          owner,
          rag_chunks!inner(count)
        `)

      // Apply filters
      if (search) {
        query = query.or(`title.ilike.%${search}%,tags.cs.{${search}},labels->>author.ilike.%${search}%`)
      }

      if (format) {
        query = query.eq('source_type', format)
      }

      if (dateFrom) {
        query = query.gte('doc_date', dateFrom)
      }

      if (dateTo) {
        query = query.lte('doc_date', dateTo)
      }

      // Apply sorting
      const ascending = sortOrder === 'asc'
      query = query.order(sortBy, { ascending })

      // Apply pagination
      query = query.range(offset, offset + limit - 1)

      const startTime = performance.now()
      const { data: documents, error, count } = await query
      trackDatabaseQuery('admin_documents_list', startTime)

      if (error) {
        console.error('Admin documents query failed:', error)
        return Response.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      // Get total count for pagination
      const { count: totalCount, error: countError } = await supabase
        .from('rag_documents')
        .select('*', { count: 'exact', head: true })

      const enhancedDocuments = documents?.map(doc => ({
        ...doc,
        chunk_count: doc.rag_chunks?.[0]?.count || 0,
        processing_status: doc.rag_chunks?.length > 0 ? 'processed' : 'pending',
        extracted_metadata: doc.labels?.extracted_metadata || null
      })) || []

      await logAdminAction(adminUser.id, 'list_documents', 'documents', undefined, {
        filters: { search, format, dateFrom, dateTo },
        results_count: enhancedDocuments.length
      })

      return Response.json({
        documents: enhancedDocuments,
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          total_pages: Math.ceil((totalCount || 0) / limit)
        },
        filters: {
          search,
          format,
          date_from: dateFrom,
          date_to: dateTo,
          sort_by: sortBy,
          sort_order: sortOrder
        }
      })

    } catch (error) {
      console.error('Admin documents fetch failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'create')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { action, document_ids, bulk_data } = body

      const supabase = await createClient()

      switch (action) {
        case 'bulk_delete':
          if (!validateAdminPermission(permissions, 'documents', 'delete') ||
              !validateAdminPermission(permissions, 'documents', 'bulk_operations')) {
            return Response.json({ error: 'Insufficient permissions for bulk delete' }, { status: 403 })
          }

          if (!document_ids || !Array.isArray(document_ids)) {
            return Response.json({ error: 'document_ids array required' }, { status: 400 })
          }

          const startTime = performance.now()
          
          // Delete chunks first (foreign key constraint)
          const { error: chunkError } = await supabase
            .from('rag_chunks')
            .delete()
            .in('doc_id', document_ids)

          if (chunkError) {
            console.error('Failed to delete chunks:', chunkError)
            return Response.json({ error: 'Failed to delete document chunks' }, { status: 500 })
          }

          // Delete documents
          const { data: deletedDocs, error: docError } = await supabase
            .from('rag_documents')
            .delete()
            .in('id', document_ids)
            .select('id, title')

          trackDatabaseQuery('admin_bulk_delete', startTime)

          if (docError) {
            console.error('Failed to delete documents:', docError)
            return Response.json({ error: 'Failed to delete documents' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'bulk_delete', 'documents', undefined, {
            document_ids,
            deleted_count: deletedDocs?.length || 0
          })

          return Response.json({
            message: `Successfully deleted ${deletedDocs?.length || 0} documents`,
            deleted_documents: deletedDocs
          })

        case 'bulk_update':
          if (!validateAdminPermission(permissions, 'documents', 'edit') ||
              !validateAdminPermission(permissions, 'documents', 'bulk_operations')) {
            return Response.json({ error: 'Insufficient permissions for bulk update' }, { status: 403 })
          }

          if (!document_ids || !bulk_data) {
            return Response.json({ error: 'document_ids and bulk_data required' }, { status: 400 })
          }

          const { tags, labels } = bulk_data
          const updateData: any = {}
          
          if (tags) updateData.tags = tags
          if (labels) updateData.labels = labels

          const { data: updatedDocs, error: updateError } = await supabase
            .from('rag_documents')
            .update(updateData)
            .in('id', document_ids)
            .select('id, title, tags, labels')

          if (updateError) {
            console.error('Failed to update documents:', updateError)
            return Response.json({ error: 'Failed to update documents' }, { status: 500 })
          }

          await logAdminAction(adminUser.id, 'bulk_update', 'documents', undefined, {
            document_ids,
            updated_fields: Object.keys(updateData),
            updated_count: updatedDocs?.length || 0
          })

          return Response.json({
            message: `Successfully updated ${updatedDocs?.length || 0} documents`,
            updated_documents: updatedDocs
          })

        default:
          return Response.json({ error: 'Invalid action' }, { status: 400 })
      }

    } catch (error) {
      console.error('Admin bulk operation failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}