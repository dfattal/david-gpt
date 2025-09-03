'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-provider'

export function LoginPage() {
  const { signInWithGoogle, loading } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      console.error('Sign in error:', error)
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">David-GPT</h1>
          <p className="text-muted-foreground mt-2">
            Technology entrepreneur and Spatial AI enthusiast
          </p>
        </div>
        
        <div className="space-y-4">
          <Button 
            onClick={handleGoogleSignIn}
            disabled={loading || isSigningIn}
            className="w-full"
            size="lg"
          >
            {isSigningIn ? 'Signing in...' : 'Continue with Google'}
          </Button>
          
          <p className="text-sm text-muted-foreground text-center">
            Sign in to save and manage your conversations
          </p>
        </div>
      </div>
    </div>
  )
}