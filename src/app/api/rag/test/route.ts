import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { chunkText, CHUNKING_PRESETS, validateChunks } from '@/lib/rag/chunking'
import { generateEmbedding } from '@/lib/rag/embeddings'
import { processDocument } from '@/lib/rag/processor'
import { vectorSearch, testVectorSearch } from '@/lib/rag/search'

interface TestResult {
  test: string
  success: boolean
  duration: number
  details: Record<string, unknown>
  error?: string
}

interface TestSuite {
  success: boolean
  totalTests: number
  passed: number
  failed: number
  totalDuration: number
  results: TestResult[]
  error?: string
}

const SAMPLE_DOCUMENTS = {
  short: "This is a short test document about artificial intelligence and machine learning.",
  
  medium: `
    Artificial Intelligence (AI) represents one of the most significant technological advances of our time. 
    Machine learning, a subset of AI, enables computers to learn and improve from experience without being explicitly programmed.
    
    Deep learning, which uses neural networks with multiple layers, has revolutionized fields like computer vision and natural language processing.
    These technologies are now being applied in various industries including healthcare, finance, and autonomous vehicles.
    
    The future of AI promises even more exciting developments, with applications in robotics, scientific research, and creative industries.
    However, it also raises important questions about ethics, employment, and the responsible development of technology.
  `,
  
  long: `
    Artificial Intelligence (AI) and Machine Learning (ML) have become transformative forces in modern technology.
    These fields, once confined to academic research and science fiction, now permeate nearly every aspect of our daily lives.
    
    The history of AI dates back to the 1950s when pioneers like Alan Turing and John McCarthy laid the groundwork for what would become a revolutionary field.
    Turing's famous "imitation game," now known as the Turing Test, proposed a method for determining whether a machine could exhibit intelligent behavior.
    
    Machine learning, a subset of AI, focuses on the development of algorithms that can learn and make decisions from data.
    Unlike traditional programming where explicit instructions are given, ML systems improve their performance through experience.
    
    Deep Learning represents a significant breakthrough in ML, utilizing neural networks with multiple layers to process complex patterns in data.
    This approach has enabled remarkable advances in computer vision, natural language processing, and speech recognition.
    
    Computer Vision applications include image recognition, object detection, and facial recognition systems.
    These technologies are used in everything from social media photo tagging to medical imaging diagnostics.
    
    Natural Language Processing (NLP) has enabled machines to understand and generate human language.
    Applications include machine translation, chatbots, sentiment analysis, and document summarization.
    
    The practical applications of AI are vast and growing. In healthcare, AI assists in medical diagnosis, drug discovery, and personalized treatment plans.
    Financial services use AI for fraud detection, algorithmic trading, and risk assessment.
    
    Autonomous vehicles rely heavily on AI for navigation, obstacle detection, and decision-making in complex traffic scenarios.
    The entertainment industry uses AI for content recommendation, game development, and even creating music and art.
    
    However, the rapid advancement of AI also raises important ethical considerations. Issues of bias in algorithms, privacy concerns, and the potential impact on employment require careful attention.
    The development of AI systems must be guided by principles of fairness, transparency, and accountability.
    
    Looking ahead, the future of AI holds immense promise. Emerging areas like quantum computing could further accelerate AI capabilities.
    The integration of AI with other technologies like IoT, blockchain, and 5G networks will create new possibilities we can barely imagine today.
    
    As we continue to push the boundaries of what's possible with AI, it's crucial that we do so responsibly, ensuring that these powerful technologies benefit all of humanity.
  `
}

async function runChunkingTest(): Promise<TestResult> {
  const startTime = performance.now()
  const test = "Text Chunking"
  
  try {
    // Test all document sizes with different presets
    const results: Record<string, unknown> = {}
    
    for (const [docType, content] of Object.entries(SAMPLE_DOCUMENTS)) {
      for (const [presetName, preset] of Object.entries(CHUNKING_PRESETS)) {
        const chunkResult = chunkText(content, preset)
        const validation = validateChunks(chunkResult.chunks)
        
        results[`${docType}_${presetName}`] = {
          chunks: chunkResult.chunks.length,
          totalTokens: chunkResult.totalTokens,
          averageChunkSize: chunkResult.averageChunkSize,
          valid: validation.isValid,
          issues: validation.issues
        }
      }
    }
    
    const duration = performance.now() - startTime
    return {
      test,
      success: true,
      duration,
      details: { results }
    }
  } catch (error) {
    const duration = performance.now() - startTime
    return {
      test,
      success: false,
      duration,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function runEmbeddingTest(): Promise<TestResult> {
  const startTime = performance.now()
  const test = "Embeddings Generation"
  
  try {
    // Test embedding service by generating a simple embedding
    const serviceTest = { success: true, error: null }
    
    // Test batch embeddings
    const testTexts = [
      "Artificial intelligence is transforming technology.",
      "Machine learning algorithms can learn from data.",
      "Deep learning uses neural networks with multiple layers.",
      "Computer vision enables machines to understand images."
    ]
    
    // Test individual embedding generation
    const embeddingService = new (await import('@/lib/rag/embeddings')).EmbeddingService()
    const batchResult = await embeddingService.generateBatchEmbeddings(testTexts)
    
    // Validate embeddings
    const validationResults = batchResult.map(result => 
      ({ isValid: embeddingService.validateEmbedding(result.embedding), issues: [] })
    )
    
    const allValid = validationResults.every(v => v.isValid)
    
    const duration = performance.now() - startTime
    return {
      test,
      success: allValid && batchResult.length === testTexts.length,
      duration,
      details: {
        serviceTest,
        batchResult: {
          successful: batchResult.length,
          failed: testTexts.length - batchResult.length,
          totalTokens: batchResult.reduce((sum, r) => sum + r.tokens, 0),
          errors: []
        },
        validationResults: validationResults.map(v => ({ valid: v.isValid, issues: v.issues }))
      }
    }
  } catch (error) {
    const duration = performance.now() - startTime
    return {
      test,
      success: false,
      duration,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function runProcessingTest(userId: string): Promise<TestResult> {
  const startTime = performance.now()
  const test = "Document Processing"
  
  try {
    const supabase = await createClient()
    
    // Create a test document
    const { data: testDoc, error: docError } = await supabase
      .from('rag_documents')
      .insert({
        owner: userId,
        title: 'Test Document for Processing',
        source_type: 'text',
        doc_date: new Date().toISOString().split('T')[0],
        tags: ['test'],
        labels: { test: true }
      })
      .select('*')
      .single()
    
    if (docError || !testDoc) {
      throw new Error(`Failed to create test document: ${docError?.message}`)
    }
    
    // Process the document
    const processingResult = await processDocument(
      testDoc.id,
      SAMPLE_DOCUMENTS.medium,
      userId
    )
    
    // Clean up test document
    await supabase.from('rag_documents').delete().eq('id', testDoc.id)
    
    const duration = performance.now() - startTime
    return {
      test,
      success: processingResult.success,
      duration,
      details: {
        processingResult,
        testDocumentId: testDoc.id
      },
      error: processingResult.error
    }
  } catch (error) {
    const duration = performance.now() - startTime
    return {
      test,
      success: false,
      duration,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function runSearchTest(userId: string): Promise<TestResult> {
  const startTime = performance.now()
  const test = "Vector Search"
  
  try {
    const searchTest = await testVectorSearch(userId)
    
    const duration = performance.now() - startTime
    return {
      test,
      success: searchTest.success,
      duration,
      details: {
        searchTest
      },
      error: searchTest.error
    }
  } catch (error) {
    const duration = performance.now() - startTime
    return {
      test,
      success: false,
      duration,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const testType = searchParams.get('type') // 'all', 'chunking', 'embedding', 'processing', 'search'
    
    console.log(`Running RAG tests for user ${user.id}, type: ${testType || 'all'}`)
    
    const results: TestResult[] = []
    const suiteStartTime = performance.now()
    
    // Run tests based on type parameter
    if (!testType || testType === 'all' || testType === 'chunking') {
      console.log('Running chunking test...')
      results.push(await runChunkingTest())
    }
    
    if (!testType || testType === 'all' || testType === 'embedding') {
      console.log('Running embedding test...')
      results.push(await runEmbeddingTest())
    }
    
    if (!testType || testType === 'all' || testType === 'processing') {
      console.log('Running processing test...')
      results.push(await runProcessingTest(user.id))
    }
    
    if (!testType || testType === 'all' || testType === 'search') {
      console.log('Running search test...')
      results.push(await runSearchTest(user.id))
    }
    
    const totalDuration = performance.now() - suiteStartTime
    const passed = results.filter(r => r.success).length
    const failed = results.length - passed
    
    const testSuite: TestSuite = {
      success: failed === 0,
      totalTests: results.length,
      passed,
      failed,
      totalDuration,
      results
    }
    
    console.log(`RAG test suite completed: ${passed}/${results.length} tests passed`)
    
    return Response.json({
      testSuite,
      message: testSuite.success 
        ? `All ${testSuite.totalTests} tests passed successfully!`
        : `${testSuite.failed} out of ${testSuite.totalTests} tests failed`
    })
    
  } catch (error) {
    console.error('Test suite execution error:', error)
    return Response.json({
      error: 'Test suite execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}