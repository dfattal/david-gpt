'use client'

import { useAuth } from '@/lib/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

interface SignOutButtonProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg'
}

export function SignOutButton({ variant = 'ghost', size = 'sm' }: SignOutButtonProps) {
  const { signOut } = useAuth()

  return (
    <Button
      variant={variant}
      size={size}
      onClick={signOut}
      className="gap-2"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </Button>
  )
}