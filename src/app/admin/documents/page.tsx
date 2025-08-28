import { AuthGuard } from '@/components/auth/auth-guard'
import { DocumentManagement } from '@/components/admin/document-management'

export default function AdminDocumentsPage() {
  return (
    <AuthGuard>
      <DocumentManagement />
    </AuthGuard>
  )
}