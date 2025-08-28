// Multi-Format Document Processors
// Phase 9: PDF, DOCX, URL, and text processing with metadata extraction

import type { RAGDocument } from './types'

export interface DocumentProcessingOptions {
  extractMetadata?: boolean
  preserveFormatting?: boolean
  includeImages?: boolean
  maxPages?: number
  timeout?: number
  userAgent?: string
}

export interface ProcessedDocument {
  content: string
  metadata: {
    title?: string
    author?: string
    creator?: string
    subject?: string
    keywords?: string[]
    creationDate?: string
    modificationDate?: string
    pageCount?: number
    wordCount?: number
    language?: string
    format: 'pdf' | 'docx' | 'url' | 'text'
    source: string
    processingDate: string
    fileSize?: number
    url?: string
    domain?: string
    contentType?: string
    encoding?: string
  }
  sections?: Array<{
    title?: string
    content: string
    pageNumber?: number
    sectionType?: 'header' | 'paragraph' | 'list' | 'table' | 'image'
  }>
  images?: Array<{
    description?: string
    pageNumber?: number
    position?: { x: number, y: number }
  }>
  processingStats: {
    processingTimeMs: number
    extractedCharacters: number
    sectionsFound: number
    imagesFound: number
    tablesFound: number
    errors: string[]
  }
}

export interface DocumentProcessor {
  name: string
  supportedFormats: string[]
  canProcess(input: string | Buffer, contentType?: string): boolean
  process(input: string | Buffer, options?: DocumentProcessingOptions): Promise<ProcessedDocument>
}

const DEFAULT_PROCESSING_OPTIONS: Required<DocumentProcessingOptions> = {
  extractMetadata: true,
  preserveFormatting: false,
  includeImages: false,
  maxPages: 1000,
  timeout: 30000, // 30 seconds
  userAgent: 'RAG Document Processor 1.0'
}

/**
 * PDF Document Processor using pdf-parse
 */
export class PDFProcessor implements DocumentProcessor {
  name = 'PDF Processor'
  supportedFormats = ['.pdf', 'application/pdf']

  canProcess(input: string | Buffer, contentType?: string): boolean {
    if (contentType) {
      return contentType.includes('pdf')
    }
    
    if (typeof input === 'string') {
      return input.toLowerCase().includes('.pdf') || input.startsWith('%PDF')
    }
    
    // Check PDF magic bytes
    return Buffer.isBuffer(input) && input.subarray(0, 4).toString() === '%PDF'
  }

  async process(input: string | Buffer, options: DocumentProcessingOptions = {}): Promise<ProcessedDocument> {
    const config = { ...DEFAULT_PROCESSING_OPTIONS, ...options }
    const startTime = performance.now()
    
    try {
      // Dynamic import to avoid bundling issues
      const pdf = await import('pdf-parse')
      
      let pdfBuffer: Buffer
      
      if (typeof input === 'string') {
        // If input is a file path or URL, we'd need to read/fetch it
        // For now, assume it's base64 encoded PDF content
        if (input.startsWith('data:application/pdf;base64,')) {
          pdfBuffer = Buffer.from(input.split(',')[1], 'base64')
        } else {
          throw new Error('PDF processor requires Buffer input or base64 data URL')
        }
      } else {
        pdfBuffer = input
      }

      // Parse PDF
      const pdfData = await pdf.default(pdfBuffer, {
        max: config.maxPages,
        version: 'v1.10.88'
      })

      const processingTime = performance.now() - startTime
      
      // Extract sections if formatting is preserved
      const sections = config.preserveFormatting ? 
        this.extractSections(pdfData.text) : 
        [{ content: pdfData.text, sectionType: 'paragraph' as const }]

      const metadata = {
        title: pdfData.info?.Title || undefined,
        author: pdfData.info?.Author || undefined,
        creator: pdfData.info?.Creator || undefined,
        subject: pdfData.info?.Subject || undefined,
        keywords: pdfData.info?.Keywords ? pdfData.info.Keywords.split(',').map((k: string) => k.trim()) : undefined,
        creationDate: pdfData.info?.CreationDate ? this.parsePDFDate(pdfData.info.CreationDate) : undefined,
        modificationDate: pdfData.info?.ModDate ? this.parsePDFDate(pdfData.info.ModDate) : undefined,
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).length,
        language: undefined, // PDF doesn't easily provide language
        format: 'pdf' as const,
        source: 'pdf-upload',
        processingDate: new Date().toISOString(),
        fileSize: pdfBuffer.length,
        contentType: 'application/pdf'
      }

      return {
        content: pdfData.text,
        metadata,
        sections,
        processingStats: {
          processingTimeMs: processingTime,
          extractedCharacters: pdfData.text.length,
          sectionsFound: sections.length,
          imagesFound: 0, // pdf-parse doesn't extract images easily
          tablesFound: 0, // Would need more sophisticated parsing
          errors: []
        }
      }

    } catch (error) {
      console.error('PDF processing failed:', error)
      
      return {
        content: '',
        metadata: {
          format: 'pdf' as const,
          source: 'pdf-upload',
          processingDate: new Date().toISOString(),
          fileSize: Buffer.isBuffer(input) ? input.length : 0
        },
        processingStats: {
          processingTimeMs: performance.now() - startTime,
          extractedCharacters: 0,
          sectionsFound: 0,
          imagesFound: 0,
          tablesFound: 0,
          errors: [error instanceof Error ? error.message : 'Unknown PDF processing error']
        }
      }
    }
  }

  private extractSections(text: string): Array<{ content: string, sectionType: 'header' | 'paragraph' | 'list' }> {
    const sections = []
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Simple heuristics for section detection
      if (line.length < 100 && line.match(/^[A-Z][A-Za-z\s\d]+$/)) {
        // Potential header
        sections.push({
          content: line,
          sectionType: 'header' as const
        })
      } else if (line.match(/^\s*[\-\*\+•]\s/)) {
        // List item
        sections.push({
          content: line,
          sectionType: 'list' as const
        })
      } else {
        // Regular paragraph
        sections.push({
          content: line,
          sectionType: 'paragraph' as const
        })
      }
    }
    
    return sections
  }

  private parsePDFDate(pdfDate: string): string {
    // PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm
    const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
    }
    return pdfDate
  }
}

/**
 * DOCX Document Processor using mammoth
 */
export class DOCXProcessor implements DocumentProcessor {
  name = 'DOCX Processor'
  supportedFormats = ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

  canProcess(input: string | Buffer, contentType?: string): boolean {
    if (contentType) {
      return contentType.includes('wordprocessingml') || contentType.includes('docx')
    }
    
    if (typeof input === 'string') {
      return input.toLowerCase().includes('.docx')
    }
    
    // Check DOCX magic bytes (ZIP file with specific structure)
    return Buffer.isBuffer(input) && input.subarray(0, 2).toString() === 'PK'
  }

  async process(input: string | Buffer, options: DocumentProcessingOptions = {}): Promise<ProcessedDocument> {
    const config = { ...DEFAULT_PROCESSING_OPTIONS, ...options }
    const startTime = performance.now()
    
    try {
      // Dynamic import to avoid bundling issues
      const mammoth = await import('mammoth')
      
      let docxBuffer: Buffer
      
      if (typeof input === 'string') {
        if (input.startsWith('data:application/')) {
          const base64Data = input.split(',')[1]
          docxBuffer = Buffer.from(base64Data, 'base64')
        } else {
          throw new Error('DOCX processor requires Buffer input or base64 data URL')
        }
      } else {
        docxBuffer = input
      }

      // Convert DOCX to HTML for better structure preservation
      const result = await mammoth.convertToHtml({ buffer: docxBuffer })
      const textResult = await mammoth.extractRawText({ buffer: docxBuffer })

      const processingTime = performance.now() - startTime
      
      // Extract metadata from document properties
      // Note: mammoth doesn't easily extract metadata, so we'll infer what we can
      const wordCount = textResult.value.split(/\s+/).filter(word => word.length > 0).length
      
      const sections = config.preserveFormatting ? 
        this.extractSectionsFromHTML(result.value) : 
        [{ content: textResult.value, sectionType: 'paragraph' as const }]

      const metadata = {
        title: undefined, // Would need more sophisticated DOCX parsing
        author: undefined,
        creator: 'Microsoft Word',
        subject: undefined,
        keywords: undefined,
        creationDate: undefined,
        modificationDate: undefined,
        pageCount: undefined,
        wordCount,
        language: undefined,
        format: 'docx' as const,
        source: 'docx-upload',
        processingDate: new Date().toISOString(),
        fileSize: docxBuffer.length,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }

      return {
        content: textResult.value,
        metadata,
        sections,
        processingStats: {
          processingTimeMs: processingTime,
          extractedCharacters: textResult.value.length,
          sectionsFound: sections.length,
          imagesFound: 0, // mammoth can extract images but we're not handling them here
          tablesFound: (result.value.match(/<table/g) || []).length,
          errors: result.messages.map(msg => msg.message)
        }
      }

    } catch (error) {
      console.error('DOCX processing failed:', error)
      
      return {
        content: '',
        metadata: {
          format: 'docx' as const,
          source: 'docx-upload',
          processingDate: new Date().toISOString(),
          fileSize: Buffer.isBuffer(input) ? input.length : 0
        },
        processingStats: {
          processingTimeMs: performance.now() - startTime,
          extractedCharacters: 0,
          sectionsFound: 0,
          imagesFound: 0,
          tablesFound: 0,
          errors: [error instanceof Error ? error.message : 'Unknown DOCX processing error']
        }
      }
    }
  }

  private extractSectionsFromHTML(html: string): Array<{ content: string, sectionType: 'header' | 'paragraph' | 'list' | 'table' }> {
    const sections = []
    
    // Simple HTML parsing to extract structured content
    const headerRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi
    const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi
    const listRegex = /<li[^>]*>(.*?)<\/li>/gi
    const tableRegex = /<table[^>]*>(.*?)<\/table>/gi
    
    let match
    
    // Extract headers
    while ((match = headerRegex.exec(html)) !== null) {
      sections.push({
        content: match[1].replace(/<[^>]*>/g, ''), // Strip remaining HTML
        sectionType: 'header' as const
      })
    }
    
    // Extract paragraphs
    while ((match = paragraphRegex.exec(html)) !== null) {
      const content = match[1].replace(/<[^>]*>/g, '').trim()
      if (content) {
        sections.push({
          content,
          sectionType: 'paragraph' as const
        })
      }
    }
    
    // Extract list items
    while ((match = listRegex.exec(html)) !== null) {
      sections.push({
        content: match[1].replace(/<[^>]*>/g, ''),
        sectionType: 'list' as const
      })
    }
    
    // Extract tables
    while ((match = tableRegex.exec(html)) !== null) {
      const tableContent = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      if (tableContent) {
        sections.push({
          content: tableContent,
          sectionType: 'table' as const
        })
      }
    }
    
    return sections
  }
}

/**
 * URL/Web Content Processor using cheerio
 */
export class URLProcessor implements DocumentProcessor {
  name = 'URL Processor'
  supportedFormats = ['http://', 'https://']

  canProcess(input: string | Buffer, contentType?: string): boolean {
    if (typeof input === 'string') {
      return input.startsWith('http://') || input.startsWith('https://')
    }
    return false
  }

  async process(input: string | Buffer, options: DocumentProcessingOptions = {}): Promise<ProcessedDocument> {
    const config = { ...DEFAULT_PROCESSING_OPTIONS, ...options }
    const startTime = performance.now()
    
    if (typeof input !== 'string') {
      throw new Error('URL processor requires string URL input')
    }

    try {
      // Fetch the webpage
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout)
      
      const response = await fetch(input, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const contentType = response.headers.get('content-type') || ''
      
      // Parse HTML with cheerio
      const cheerio = await import('cheerio')
      const $ = cheerio.load(html)
      
      // Extract metadata
      const title = $('title').text() || $('h1').first().text() || new URL(input).hostname
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content')
      const author = $('meta[name="author"]').attr('content') || 
                    $('meta[property="og:site_name"]').attr('content')
      const keywords = $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim())
      const publishDate = $('meta[name="date"]').attr('content') || 
                         $('meta[property="article:published_time"]').attr('content') ||
                         $('time[datetime]').attr('datetime')
      const modifiedDate = $('meta[property="article:modified_time"]').attr('content')
      const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content')

      // Extract main content
      let mainContent = ''
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.article-content',
        '.post-content',
        '#content'
      ]

      for (const selector of contentSelectors) {
        const content = $(selector).first()
        if (content.length > 0) {
          // Remove script, style, nav, footer, sidebar elements
          content.find('script, style, nav, footer, aside, .sidebar, .navigation').remove()
          mainContent = content.text()
          break
        }
      }

      // Fallback: extract all text from body
      if (!mainContent) {
        $('script, style, nav, footer, aside, .sidebar, .navigation, .menu').remove()
        mainContent = $('body').text()
      }

      // Clean up text
      mainContent = mainContent.replace(/\s+/g, ' ').trim()

      // Extract sections if formatting is preserved
      const sections = config.preserveFormatting ? 
        this.extractWebSections($) : 
        [{ content: mainContent, sectionType: 'paragraph' as const }]

      const url = new URL(input)
      const processingTime = performance.now() - startTime

      const metadata = {
        title: title.trim(),
        author,
        creator: undefined,
        subject: description,
        keywords,
        creationDate: publishDate ? this.parseWebDate(publishDate) : undefined,
        modificationDate: modifiedDate ? this.parseWebDate(modifiedDate) : undefined,
        pageCount: 1,
        wordCount: mainContent.split(/\s+/).filter(word => word.length > 0).length,
        language,
        format: 'url' as const,
        source: input,
        processingDate: new Date().toISOString(),
        url: input,
        domain: url.hostname,
        contentType,
        encoding: 'utf-8'
      }

      return {
        content: mainContent,
        metadata,
        sections,
        processingStats: {
          processingTimeMs: processingTime,
          extractedCharacters: mainContent.length,
          sectionsFound: sections.length,
          imagesFound: $('img').length,
          tablesFound: $('table').length,
          errors: []
        }
      }

    } catch (error) {
      console.error('URL processing failed:', error)
      
      return {
        content: '',
        metadata: {
          format: 'url' as const,
          source: input,
          processingDate: new Date().toISOString(),
          url: input,
          domain: typeof input === 'string' ? new URL(input).hostname : undefined
        },
        processingStats: {
          processingTimeMs: performance.now() - startTime,
          extractedCharacters: 0,
          sectionsFound: 0,
          imagesFound: 0,
          tablesFound: 0,
          errors: [error instanceof Error ? error.message : 'Unknown URL processing error']
        }
      }
    }
  }

  private extractWebSections($: any): Array<{ content: string, sectionType: 'header' | 'paragraph' | 'list' | 'table' }> {
    const sections: Array<{ content: string, sectionType: 'header' | 'paragraph' | 'list' | 'table' }> = []
    
    // Extract headers
    $('h1, h2, h3, h4, h5, h6').each((i: number, elem: any) => {
      const content = $(elem).text().trim()
      if (content) {
        sections.push({
          content,
          sectionType: 'header' as const
        })
      }
    })
    
    // Extract paragraphs
    $('p').each((i: number, elem: any) => {
      const content = $(elem).text().trim()
      if (content && content.length > 20) { // Filter out very short paragraphs
        sections.push({
          content,
          sectionType: 'paragraph' as const
        })
      }
    })
    
    // Extract list items
    $('li').each((i: number, elem: any) => {
      const content = $(elem).text().trim()
      if (content) {
        sections.push({
          content,
          sectionType: 'list' as const
        })
      }
    })
    
    // Extract tables
    $('table').each((i: number, elem: any) => {
      const content = $(elem).text().replace(/\s+/g, ' ').trim()
      if (content) {
        sections.push({
          content,
          sectionType: 'table' as const
        })
      }
    })
    
    return sections
  }

  private parseWebDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      return date.toISOString()
    } catch {
      return dateString
    }
  }
}

/**
 * Plain Text Processor for .txt files and other text formats
 */
export class TextProcessor implements DocumentProcessor {
  name = 'Text Processor'
  supportedFormats = ['.txt', '.md', '.rst', 'text/plain', 'text/markdown']

  canProcess(input: string | Buffer, contentType?: string): boolean {
    if (contentType) {
      return contentType.startsWith('text/') || contentType.includes('markdown')
    }
    
    if (typeof input === 'string') {
      return input.includes('.txt') || input.includes('.md') || input.includes('.rst')
    }
    
    // For buffers, assume it's text if it's valid UTF-8
    if (Buffer.isBuffer(input)) {
      try {
        input.toString('utf8')
        return true
      } catch {
        return false
      }
    }
    
    return true // Default to text processor for unknown formats
  }

  async process(input: string | Buffer, options: DocumentProcessingOptions = {}): Promise<ProcessedDocument> {
    const startTime = performance.now()
    
    let content: string
    let fileSize = 0
    
    if (typeof input === 'string') {
      content = input
      fileSize = Buffer.byteLength(content, 'utf8')
    } else {
      content = input.toString('utf8')
      fileSize = input.length
    }

    const sections = this.extractTextSections(content)
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

    const metadata = {
      title: this.inferTitle(content),
      author: undefined,
      creator: undefined,
      subject: undefined,
      keywords: undefined,
      creationDate: undefined,
      modificationDate: undefined,
      pageCount: 1,
      wordCount,
      language: this.detectLanguage(content),
      format: 'text' as const,
      source: 'text-upload',
      processingDate: new Date().toISOString(),
      fileSize,
      contentType: 'text/plain',
      encoding: 'utf-8'
    }

    return {
      content,
      metadata,
      sections,
      processingStats: {
        processingTimeMs: performance.now() - startTime,
        extractedCharacters: content.length,
        sectionsFound: sections.length,
        imagesFound: 0,
        tablesFound: 0,
        errors: []
      }
    }
  }

  private extractTextSections(text: string): Array<{ content: string, sectionType: 'header' | 'paragraph' | 'list' }> {
    const sections = []
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      // Markdown-style headers
      if (trimmed.match(/^#+\s/)) {
        sections.push({
          content: trimmed.replace(/^#+\s/, ''),
          sectionType: 'header' as const
        })
      }
      // List items
      else if (trimmed.match(/^\s*[\-\*\+•]\s/) || trimmed.match(/^\s*\d+\.\s/)) {
        sections.push({
          content: trimmed,
          sectionType: 'list' as const
        })
      }
      // Regular paragraphs
      else {
        sections.push({
          content: trimmed,
          sectionType: 'paragraph' as const
        })
      }
    }
    
    return sections
  }

  private inferTitle(content: string): string {
    // Look for the first line that looks like a title
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length > 0) {
      const firstLine = lines[0].trim()
      
      // Markdown header
      if (firstLine.match(/^#+\s/)) {
        return firstLine.replace(/^#+\s/, '')
      }
      
      // Short first line could be a title
      if (firstLine.length < 100 && firstLine.length > 5) {
        return firstLine
      }
    }
    
    return 'Untitled Document'
  }

  private detectLanguage(content: string): string {
    // Simple language detection based on common words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were']
    const words = content.toLowerCase().split(/\s+/).slice(0, 100) // Check first 100 words
    
    const englishMatches = words.filter(word => englishWords.includes(word)).length
    const ratio = englishMatches / Math.min(words.length, 100)
    
    return ratio > 0.1 ? 'en' : 'unknown'
  }
}

/**
 * Document Processing Factory
 */
export class DocumentProcessingFactory {
  private processors: DocumentProcessor[] = [
    new PDFProcessor(),
    new DOCXProcessor(),
    new URLProcessor(),
    new TextProcessor() // Keep as fallback
  ]

  /**
   * Get appropriate processor for input
   */
  getProcessor(input: string | Buffer, contentType?: string): DocumentProcessor {
    for (const processor of this.processors) {
      if (processor.canProcess(input, contentType)) {
        return processor
      }
    }
    
    // Default to text processor
    return new TextProcessor()
  }

  /**
   * Process document with appropriate processor
   */
  async processDocument(
    input: string | Buffer, 
    contentType?: string, 
    options?: DocumentProcessingOptions
  ): Promise<ProcessedDocument> {
    const processor = this.getProcessor(input, contentType)
    console.log(`Processing document with ${processor.name}`)
    
    return processor.process(input, options)
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): string[] {
    const formats = new Set<string>()
    for (const processor of this.processors) {
      processor.supportedFormats.forEach(format => formats.add(format))
    }
    return Array.from(formats)
  }
}

// Export factory instance
export const documentProcessingFactory = new DocumentProcessingFactory()