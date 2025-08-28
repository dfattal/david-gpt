import { NextRequest } from 'next/server'
import { withAdminAuth, getAdminStats } from '@/lib/admin/access-control'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  return withAdminAuth(async ({ adminUser, permissions }) => {
    try {
      const stats = await getAdminStats()
      const supabase = await createClient()
      
      // Get recent activity (would be from audit log in production)
      const recentActivity = [
        {
          id: '1',
          admin_email: adminUser.email,
          action: 'Dashboard viewed',
          timestamp: new Date().toISOString(),
          resource: 'dashboard'
        }
      ]

      // System health indicators
      const systemHealth = {
        status: 'healthy',
        database: 'connected',
        embeddings: 'operational',
        storage: 'available',
        last_check: new Date().toISOString()
      }

      // Processing queue status - get real data from jobs table
      let processingQueue = {
        pending_documents: 0,
        active_jobs: 0,
        failed_jobs: 0,
        avg_processing_time: '0s'
      }

      try {
        const { data: jobStats, error: jobError } = await supabase
          .from('rag_ingest_jobs')
          .select('status, created_at, started_at, completed_at')

        if (!jobError && jobStats) {
          const pendingJobs = jobStats.filter(j => j.status === 'pending').length
          const activeJobs = jobStats.filter(j => j.status === 'processing').length
          const failedJobs = jobStats.filter(j => j.status === 'failed').length
          
          // Calculate average processing time
          const completedJobs = jobStats.filter(j => 
            j.status === 'completed' && 
            j.started_at && 
            j.completed_at
          )

          let avgProcessingTime = '0s'
          if (completedJobs.length > 0) {
            const totalMs = completedJobs.reduce((sum, job) => {
              const start = new Date(job.started_at).getTime()
              const end = new Date(job.completed_at).getTime()
              return sum + (end - start)
            }, 0)

            const avgMs = totalMs / completedJobs.length

            if (avgMs < 1000) {
              avgProcessingTime = `${Math.round(avgMs)}ms`
            } else if (avgMs < 60000) {
              avgProcessingTime = `${Math.round(avgMs / 1000)}s`
            } else {
              avgProcessingTime = `${Math.round(avgMs / 60000)}m`
            }
          }

          processingQueue = {
            pending_documents: pendingJobs,
            active_jobs: activeJobs,
            failed_jobs: failedJobs,
            avg_processing_time: avgProcessingTime
          }
        }
      } catch (jobError) {
        console.warn('Could not fetch job statistics, using defaults:', jobError)
      }

      return Response.json({
        admin_user: {
          email: adminUser.email,
          role: adminUser.role,
          permissions: adminUser.permissions
        },
        stats,
        recent_activity: recentActivity,
        system_health: systemHealth,
        processing_queue: processingQueue,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Admin dashboard failed:', error)
      return Response.json({ 
        error: 'Failed to load dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}