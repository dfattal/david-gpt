'use client'

import { useAuth } from '@/lib/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to David-GPT</CardTitle>
          <CardDescription>
            Chat with David Fattal AI - Technology entrepreneur and startup advisor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Loading...' : 'Continue with Google'}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}