// API route for manual knowledge graph extraction
// POST /api/admin/kg-extract - Trigger KG extraction for specific document or all documents

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildKnowledgeGraphForDocument } from '@/lib/rag/knowledge-graph'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { document_id, extract_all } = body

    console.log(`Manual KG extraction triggered by ${user.email}`)
    
    if (extract_all) {
      // Extract KG for all completed documents
      console.log('Extracting KG for all documents...')
      
      const { data: documents, error: docsError } = await supabase
        .from('rag_documents')
        .select('id, title, owner')
        .eq('owner', user.id)
        .not('labels->>processing_status', 'is', null)
        .eq('labels->>processing_status', 'completed')

      if (docsError) {
        throw new Error(`Failed to fetch documents: ${docsError.message}`)
      }

      if (!documents || documents.length === 0) {
        return Response.json({
          success: true,
          message: 'No completed documents found',
          results: []
        })
      }

      const results = []
      let totalEntities = 0
      let totalRelations = 0

      for (const doc of documents) {
        console.log(`Processing KG for: ${doc.title}`)
        
        try {
          const result = await buildKnowledgeGraphForDocument(doc.id, doc.owner)
          
          results.push({
            document_id: doc.id,
            title: doc.title,
            success: result.success,
            entities_extracted: result.entitiesExtracted,
            relations_extracted: result.relationsExtracted,
            chunks_processed: result.chunksProcessed,
            error: result.error
          })

          if (result.success) {
            totalEntities += result.entitiesExtracted
            totalRelations += result.relationsExtracted
          }

          // Small delay between documents
          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          console.error(`KG extraction failed for ${doc.title}:`, error)
          results.push({
            document_id: doc.id,
            title: doc.title,
            success: false,
            entities_extracted: 0,
            relations_extracted: 0,
            chunks_processed: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return Response.json({
        success: true,
        message: `KG extraction completed for ${documents.length} documents`,
        summary: {
          documents_processed: documents.length,
          total_entities_extracted: totalEntities,
          total_relations_extracted: totalRelations,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        },
        results
      })

    } else if (document_id) {
      // Extract KG for specific document
      console.log(`Extracting KG for document: ${document_id}`)
      
      const { data: document, error: docError } = await supabase
        .from('rag_documents')
        .select('id, title, owner')
        .eq('id', document_id)
        .single()

      if (docError || !document) {
        return Response.json(
          { error: 'Document not found' },
          { status: 404 }
        )
      }

      if (document.owner !== user.id) {
        return Response.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }

      const result = await buildKnowledgeGraphForDocument(document_id, document.owner)

      return Response.json({
        success: result.success,
        message: result.success 
          ? `KG extraction completed for "${document.title}"` 
          : `KG extraction failed for "${document.title}"`,
        document_id,
        title: document.title,
        extraction: {
          entities_extracted: result.entitiesExtracted,
          relations_extracted: result.relationsExtracted,
          chunks_processed: result.chunksProcessed
        },
        error: result.error
      })

    } else {
      return Response.json(
        { error: 'Either document_id or extract_all=true must be specified' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Manual KG extraction API error:', error)
    
    return Response.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return Response.json(
    { error: 'Method not allowed. Use POST to trigger extraction.' },
    { status: 405 }
  )
}