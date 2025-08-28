import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chunkText } from '@/lib/rag/chunking'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { document_id } = body

    if (!document_id) {
      return NextResponse.json(
        { error: 'document_id is required' },
        { status: 400 }
      )
    }

    // Get the document
    const { data: document, error: docError } = await supabase
      .from('rag_documents')
      .select('*')
      .eq('id', document_id)
      .eq('owner', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    console.log('Found document:', document.title)

    // Get content from labels (where it's stored temporarily)
    const content = document.labels?.raw_content
    if (!content) {
      return NextResponse.json(
        { error: 'Document has no content' },
        { status: 400 }
      )
    }

    // Test chunking
    const chunkingResult = chunkText(content, {
      chunkSize: 400,
      overlap: 50,
      preserveParagraphs: true,
      preserveSentences: true
    })

    // Store chunks in database
    const chunksToStore = chunkingResult.chunks.map((chunk, index) => ({
      doc_id: document_id,
      chunk_index: index,
      content: chunk.content,
      labels: {
        token_count: chunk.tokenCount,
        char_count: chunk.content.length,
        chunk_type: 'text'
      }
    }))

    const { data: insertedChunks, error: chunksError } = await supabase
      .from('rag_chunks')
      .insert(chunksToStore)
      .select('*')

    if (chunksError) {
      console.error('Failed to store chunks:', chunksError)
      return NextResponse.json(
        { error: 'Failed to store chunks: ' + chunksError.message },
        { status: 500 }
      )
    }

    // Update document status
    await supabase
      .from('rag_documents')
      .update({
        labels: {
          ...document.labels,
          processing_status: 'completed',
          chunk_count: chunksToStore.length,
          processed_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id)

    return NextResponse.json({
      success: true,
      message: 'Document processed successfully',
      document: {
        id: document.id,
        title: document.title
      },
      results: {
        chunks_created: chunksToStore.length,
        total_tokens: chunkingResult.totalTokens,
        average_chunk_size: chunkingResult.averageChunkSize,
        chunks: insertedChunks
      }
    })

  } catch (error) {
    console.error('Test processing failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to process document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}