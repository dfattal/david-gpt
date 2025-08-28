import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { createClient } from '@/lib/supabase/server'
import { trackDatabaseQuery } from '@/lib/performance'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Get specific document with details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const supabase = await createClient()

    try {
      const startTime = performance.now()
      
      // Get document with chunks and processing status
      const { data: document, error } = await supabase
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
          rag_chunks (
            id,
            chunk_index,
            content,
            embedding_status,
            created_at,
            processing_status,
            chunk_hash,
            chunk_date
          )
        `)
        .eq('id', id)
        .single()

      trackDatabaseQuery('admin_document_detail', startTime)

      if (error) {
        if (error.code === 'PGRST116') {
          return Response.json({ error: 'Document not found' }, { status: 404 })
        }
        console.error('Failed to fetch document:', error)
        return Response.json({ error: 'Failed to fetch document' }, { status: 500 })
      }

      // Get user info for owner
      const { data: ownerInfo, error: userError } = await supabase.auth.admin.getUserById(document.owner)
      
      const enhancedDocument = {
        ...document,
        owner_email: ownerInfo?.user?.email || 'Unknown',
        chunk_count: document.rag_chunks?.length || 0,
        processing_status: getDocumentProcessingStatus(document.rag_chunks),
        content_preview: document.rag_chunks?.[0]?.content?.substring(0, 200) + '...' || null,
        extracted_metadata: document.labels?.extracted_metadata || null,
        processing_stats: document.labels?.extracted_metadata?.processing_stats || null
      }

      await logAdminAction(adminUser.id, 'view_document', 'documents', id)

      return Response.json({
        document: enhancedDocument
      })

    } catch (error) {
      console.error('Admin document fetch failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}

// Update document
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'edit')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const supabase = await createClient()

    try {
      const body = await request.json()
      const { title, tags, labels, doc_date } = body

      const updateData: any = {}
      if (title !== undefined) updateData.title = title
      if (tags !== undefined) updateData.tags = tags
      if (labels !== undefined) updateData.labels = labels
      if (doc_date !== undefined) updateData.doc_date = doc_date

      const startTime = performance.now()
      const { data: updatedDoc, error } = await supabase
        .from('rag_documents')
        .update(updateData)
        .eq('id', id)
        .select('id, title, tags, labels, doc_date, updated_at')
        .single()

      trackDatabaseQuery('admin_document_update', startTime)

      if (error) {
        if (error.code === 'PGRST116') {
          return Response.json({ error: 'Document not found' }, { status: 404 })
        }
        console.error('Failed to update document:', error)
        return Response.json({ error: 'Failed to update document' }, { status: 500 })
      }

      await logAdminAction(adminUser.id, 'update_document', 'documents', id, {
        updated_fields: Object.keys(updateData)
      })

      return Response.json({
        message: 'Document updated successfully',
        document: updatedDoc
      })

    } catch (error) {
      console.error('Admin document update failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}

// Delete document
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'delete')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const supabase = await createClient()

    try {
      const startTime = performance.now()
      
      // First get document info for logging
      const { data: docInfo, error: fetchError } = await supabase
        .from('rag_documents')
        .select('id, title, source_type')
        .eq('id', id)
        .single()

      if (fetchError || !docInfo) {
        return Response.json({ error: 'Document not found' }, { status: 404 })
      }

      // Delete chunks first (foreign key constraint)
      const { error: chunkError } = await supabase
        .from('rag_chunks')
        .delete()
        .eq('doc_id', id)

      if (chunkError) {
        console.error('Failed to delete chunks:', chunkError)
        return Response.json({ error: 'Failed to delete document chunks' }, { status: 500 })
      }

      // Delete entities and relations related to this document
      const { data: chunkIds } = await supabase
        .from('rag_chunks')
        .select('id')
        .eq('doc_id', id)
      
      if (chunkIds && chunkIds.length > 0) {
        await supabase.from('rag_chunk_entities').delete().in(
          'chunk_id',
          chunkIds.map(chunk => chunk.id)
        )
      }

      // Delete document
      const { error: deleteError } = await supabase
        .from('rag_documents')
        .delete()
        .eq('id', id)

      trackDatabaseQuery('admin_document_delete', startTime)

      if (deleteError) {
        console.error('Failed to delete document:', deleteError)
        return Response.json({ error: 'Failed to delete document' }, { status: 500 })
      }

      await logAdminAction(adminUser.id, 'delete_document', 'documents', id, {
        title: docInfo.title,
        source_type: docInfo.source_type
      })

      return Response.json({
        message: 'Document and all related data deleted successfully'
      })

    } catch (error) {
      console.error('Admin document deletion failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}

// Reprocess document (trigger re-chunking and embedding)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'edit')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const supabase = await createClient()

    try {
      const body = await request.json()
      const { action } = body

      if (action === 'reprocess') {
        // Mark document for reprocessing by deleting existing chunks
        const startTime = performance.now()
        
        const { error: chunkError } = await supabase
          .from('rag_chunks')
          .delete()
          .eq('doc_id', id)

        if (chunkError) {
          console.error('Failed to clear chunks for reprocessing:', chunkError)
          return Response.json({ error: 'Failed to prepare document for reprocessing' }, { status: 500 })
        }

        // Update document to trigger reprocessing
        const { data: updatedDoc, error: updateError } = await supabase
          .from('rag_documents')
          .update({ 
            updated_at: new Date().toISOString(),
            labels: { 
              ...{}, // Would preserve existing labels
              reprocessing: true,
              reprocessed_by: adminUser.email,
              reprocessed_at: new Date().toISOString()
            }
          })
          .eq('id', id)
          .select()
          .single()

        trackDatabaseQuery('admin_document_reprocess', startTime)

        if (updateError) {
          console.error('Failed to mark document for reprocessing:', updateError)
          return Response.json({ error: 'Failed to initiate reprocessing' }, { status: 500 })
        }

        await logAdminAction(adminUser.id, 'reprocess_document', 'documents', id)

        return Response.json({
          message: 'Document marked for reprocessing. Chunking and embedding will be triggered by the next processing job.',
          document: updatedDoc
        })
      }

      return Response.json({ error: 'Invalid action' }, { status: 400 })

    } catch (error) {
      console.error('Admin document reprocessing failed:', error)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }, request)
}

function getDocumentProcessingStatus(chunks: any[]): string {
  if (!chunks || chunks.length === 0) return 'pending'
  
  const embedStatusCounts = chunks.reduce((acc, chunk) => {
    const status = chunk.embedding_status || 'pending'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  if (embedStatusCounts.completed === chunks.length) return 'completed'
  if (embedStatusCounts.failed > 0) return 'failed'
  if (embedStatusCounts.processing > 0) return 'processing'
  
  return 'pending'
}