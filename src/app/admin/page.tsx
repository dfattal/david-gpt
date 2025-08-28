'use client'

import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { AuthGuard } from '@/components/auth/auth-guard'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const router = useRouter()

  const handleNavigateToDocuments = () => {
    router.push('/admin/documents')
  }

  const handleNavigateToKnowledgeGraph = () => {
    router.push('/admin/knowledge-graph')
  }

  const handleNavigateToJobs = () => {
    // TODO: Implement when Jobs page is created
    console.log('Navigate to Jobs')
  }

  return (
    <AuthGuard>
      <AdminDashboard 
        onNavigateToDocuments={handleNavigateToDocuments}
        onNavigateToKnowledgeGraph={handleNavigateToKnowledgeGraph}
        onNavigateToJobs={handleNavigateToJobs}
      />
    </AuthGuard>
  )
}