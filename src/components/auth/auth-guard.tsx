'use client'

import { useAuth } from '@/lib/auth/auth-provider'
import { Card, CardContent } from '@/components/ui/card'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span>Loading...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    // The middleware should handle the redirect, but this is a fallback
    return null
  }

  return <>{children}</>
}