import { ChatLayout } from '@/components/chat/chat-layout'
import { AuthGuard } from '@/components/auth/auth-guard'

export default function Home() {
  return (
    <AuthGuard>
      <ChatLayout />
    </AuthGuard>
  )
}
