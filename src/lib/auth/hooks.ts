'use client'

import { useAuth } from './auth-provider'

// Re-export the main hook for convenience
export { useAuth }

// Additional auth-related hooks can be added here
export function useUser() {
  const { user } = useAuth()
  return user
}

export function useAuthActions() {
  const { signInWithGoogle, signOut } = useAuth()
  return { signInWithGoogle, signOut }
}