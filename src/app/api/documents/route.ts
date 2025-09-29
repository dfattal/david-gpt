import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AppError, handleApiError } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new AppError('Authentication required', 401)
    }

    // Check user role - only admin can manage documents
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      throw new AppError('Admin access required', 403)
    }

    // Get query parameters
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')
    const docType = searchParams.get('type')

    let query = supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (docType) {
      query = query.eq('doc_type', docType)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('Failed to fetch documents:', error)
      throw new AppError('Failed to fetch documents', 500)
    }

    return NextResponse.json({ documents })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new AppError('Authentication required', 401)
    }

    // Check user role - only admin can upload documents
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      throw new AppError('Admin access required', 403)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const docType = formData.get('docType') as string
    const doi = formData.get('doi') as string
    const url = formData.get('url') as string

    if (!file && !url) {
      throw new AppError('Either file or URL is required', 400)
    }

    if (!title?.trim()) {
      throw new AppError('Title is required', 400)
    }

    if (!docType) {
      throw new AppError('Document type is required', 400)
    }

    const filePath: string | null = null
    let fileSize: number | null = null
    const fileHash: string | null = null

    // Handle file upload to Supabase Storage
    if (file) {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `documents/${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) {
        console.error('File upload error:', uploadError)
        throw new AppError('Failed to upload file', 500)
      }

      fileSize = file.size
      // TODO: Generate file hash for deduplication
    }

    // Create document record
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        title: title.trim(),
        doc_type: docType,
        file_path: filePath,
        file_size: fileSize,
        file_hash: fileHash,
        doi: doi || null,
        url: url || null,
        processing_status: 'pending',
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create document:', error)
      throw new AppError('Failed to create document', 500)
    }

    // TODO: Integration point for RAG specialist - trigger document processing
    // This is where the document would be queued for:
    // - Text extraction (PDF parsing, OCR if needed)
    // - Chunking and embedding generation
    // - Metadata extraction (authors, dates, citations)
    // - Knowledge graph entity extraction

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}