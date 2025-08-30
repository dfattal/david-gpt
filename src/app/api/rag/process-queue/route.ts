import { NextRequest } from 'next/server'
import { documentProcessingQueue } from '@/lib/rag/processing-queue'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    console.log('Manual queue processing triggered')
    
    // Get next pending job and process it
    const job = await documentProcessingQueue.getNextPendingJob()
    
    if (!job) {
      return Response.json({
        success: true,
        message: 'No pending jobs found'
      })
    }
    
    console.log(`Processing job: ${job.id}, type: ${job.job_type}, document: ${job.document_id}`)
    
    if (job.job_type === 'full_document_processing') {
      console.log(`About to call processDocument for: ${job.document_id}`)
      const result = await documentProcessingQueue.processDocument(job.document_id, job.id)
      console.log(`processDocument result:`, result)
      
      return Response.json({
        success: true,
        job_id: job.id,
        document_id: job.document_id,
        result: result
      })
    } else {
      return Response.json({
        success: false,
        error: `Unknown job type: ${job.job_type}`
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Manual queue processing failed:', error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const stats = await documentProcessingQueue.getQueueStats()
    return Response.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('Failed to get queue stats:', error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}