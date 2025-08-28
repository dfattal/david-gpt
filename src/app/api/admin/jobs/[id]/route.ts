import { NextRequest } from 'next/server'
import { withAdminAuth, validateAdminPermission, logAdminAction } from '@/lib/admin/access-control'
import { getJobDetails } from '@/lib/admin/job-monitoring'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  return withAdminAuth(async ({ adminUser, permissions }) => {
    if (!validateAdminPermission(permissions, 'documents', 'view')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    try {
      const job = await getJobDetails(id)

      if (!job) {
        return Response.json({ error: 'Job not found' }, { status: 404 })
      }

      await logAdminAction(adminUser.id, 'view_job_details', 'jobs', id)

      return Response.json({
        job,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Failed to fetch job details:', error)
      return Response.json({ 
        error: 'Failed to fetch job details',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }, request)
}