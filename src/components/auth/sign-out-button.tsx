'use client'

import { useAuth } from '@/lib/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

interface SignOutButtonProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function SignOutButton({ variant = 'ghost', size = 'sm' }: SignOutButtonProps) {
  const { signOut } = useAuth()

  return (
    <Button
      variant={variant}
      size={size}
      onClick={signOut}
      className="gap-1.5 flex-shrink-0 touch-manipulation"
      style={{ minHeight: '32px', minWidth: '32px' }}
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline text-xs">Sign Out</span>
      <span className="sm:hidden sr-only">Sign Out</span>
    </Button>
  )
}