import { documentProcessingFactory } from '@/lib/rag/document-processors'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { test_type = 'text', content, url, file_data } = await request.json()

    console.log(`Starting multi-format processing test: ${test_type}`)
    
    const testResults: any[] = []

    switch (test_type) {
      case 'text':
        testResults.push(await testTextProcessing(content))
        break
      case 'url':
        testResults.push(await testURLProcessing(url))
        break
      case 'pdf':
        testResults.push(await testPDFProcessing(file_data))
        break
      case 'docx':
        testResults.push(await testDOCXProcessing(file_data))
        break
      case 'all':
        const testCases = [
          { type: 'text', content: 'Sample text document content for testing.' },
          { type: 'url', url: 'https://example.com' }
        ]
        
        for (const testCase of testCases) {
          try {
            if (testCase.type === 'text') {
              testResults.push(await testTextProcessing(testCase.content))
            } else if (testCase.type === 'url') {
              testResults.push(await testURLProcessing(testCase.url))
            }
          } catch (error) {
            testResults.push({
              test: testCase.type,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timing: 0
            })
          }
        }
        break
      default:
        return Response.json({ error: 'Invalid test_type. Use: text, url, pdf, docx, or all' }, { status: 400 })
    }

    return Response.json({
      message: `Multi-format processing test completed`,
      test_type,
      results: testResults,
      summary: {
        total_tests: testResults.length,
        successful: testResults.filter(r => r.success).length,
        failed: testResults.filter(r => !r.success).length
      }
    })

  } catch (error) {
    console.error('Multi-format processing test failed:', error)
    return Response.json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function testTextProcessing(content?: string): Promise<any> {
  const startTime = performance.now()
  
  const testContent = content || `
# Sample Document

This is a test document for the multi-format processing system.

## Features
- Text extraction
- Metadata extraction
- Section parsing

The system should process this content and extract meaningful information.
`
  
  try {
    const result = await documentProcessingFactory.processDocument(testContent, 'text/plain', {
      extractMetadata: true,
      preserveFormatting: true
    })
    
    return {
      test: 'text_processing',
      success: true,
      timing: performance.now() - startTime,
      processor: 'TextProcessor',
      metadata: {
        title: result.metadata.title,
        format: result.metadata.format,
        word_count: result.metadata.wordCount,
        language: result.metadata.language
      },
      content_preview: result.content.substring(0, 100) + '...',
      sections_found: result.sections?.length || 0,
      processing_stats: result.processingStats
    }
  } catch (error) {
    return {
      test: 'text_processing',
      success: false,
      timing: performance.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testURLProcessing(url?: string): Promise<any> {
  const startTime = performance.now()
  const testUrl = url || 'https://httpbin.org/html' // Simple HTML endpoint for testing
  
  try {
    const result = await documentProcessingFactory.processDocument(testUrl, undefined, {
      extractMetadata: true,
      preserveFormatting: true,
      timeout: 10000 // Short timeout for testing
    })
    
    return {
      test: 'url_processing',
      success: true,
      timing: performance.now() - startTime,
      processor: 'URLProcessor',
      url: testUrl,
      metadata: {
        title: result.metadata.title,
        format: result.metadata.format,
        domain: result.metadata.domain,
        word_count: result.metadata.wordCount,
        language: result.metadata.language
      },
      content_preview: result.content.substring(0, 100) + '...',
      sections_found: result.sections?.length || 0,
      processing_stats: result.processingStats
    }
  } catch (error) {
    return {
      test: 'url_processing',
      success: false,
      timing: performance.now() - startTime,
      url: testUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testPDFProcessing(fileData?: string): Promise<any> {
  const startTime = performance.now()
  
  if (!fileData) {
    return {
      test: 'pdf_processing',
      success: false,
      timing: performance.now() - startTime,
      error: 'No PDF file data provided for testing'
    }
  }
  
  try {
    // Parse base64 file data
    const [header, base64Data] = fileData.split(',')
    const buffer = Buffer.from(base64Data, 'base64')
    
    const result = await documentProcessingFactory.processDocument(buffer, 'application/pdf', {
      extractMetadata: true,
      preserveFormatting: true,
      maxPages: 10 // Limit for testing
    })
    
    return {
      test: 'pdf_processing',
      success: true,
      timing: performance.now() - startTime,
      processor: 'PDFProcessor',
      metadata: {
        title: result.metadata.title,
        format: result.metadata.format,
        page_count: result.metadata.pageCount,
        word_count: result.metadata.wordCount,
        author: result.metadata.author,
        creation_date: result.metadata.creationDate
      },
      content_preview: result.content.substring(0, 100) + '...',
      processing_stats: result.processingStats
    }
  } catch (error) {
    return {
      test: 'pdf_processing',
      success: false,
      timing: performance.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testDOCXProcessing(fileData?: string): Promise<any> {
  const startTime = performance.now()
  
  if (!fileData) {
    return {
      test: 'docx_processing',
      success: false,
      timing: performance.now() - startTime,
      error: 'No DOCX file data provided for testing'
    }
  }
  
  try {
    // Parse base64 file data
    const [header, base64Data] = fileData.split(',')
    const buffer = Buffer.from(base64Data, 'base64')
    
    const result = await documentProcessingFactory.processDocument(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', {
      extractMetadata: true,
      preserveFormatting: true
    })
    
    return {
      test: 'docx_processing',
      success: true,
      timing: performance.now() - startTime,
      processor: 'DOCXProcessor',
      metadata: {
        title: result.metadata.title,
        format: result.metadata.format,
        word_count: result.metadata.wordCount,
        creator: result.metadata.creator
      },
      content_preview: result.content.substring(0, 100) + '...',
      processing_stats: result.processingStats
    }
  } catch (error) {
    return {
      test: 'docx_processing',
      success: false,
      timing: performance.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    message: 'Multi-format document processing test endpoint',
    endpoints: {
      POST: 'Run processing tests with different document formats',
    },
    parameters: {
      test_type: 'Type of test: text, url, pdf, docx, or all',
      content: 'Text content for text processing test',
      url: 'URL for web scraping test',
      file_data: 'Base64 encoded file data for PDF/DOCX tests'
    },
    supported_formats: documentProcessingFactory.getSupportedFormats()
  })
}