'use client'

import { useAuth } from '@/lib/auth/auth-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SignOutButton } from './sign-out-button'

export function UserProfile() {
  const { user } = useAuth()

  if (!user) return null

  const userInitials = user.user_metadata?.full_name
    ?.split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarImage 
            src={user.user_metadata?.avatar_url} 
            alt={user.user_metadata?.full_name || user.email || ''}
          />
          <AvatarFallback className="text-xs">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <div className="text-xs font-medium truncate">
            {user.user_metadata?.full_name || 'User'}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {user.email}
          </div>
        </div>
      </div>
      <SignOutButton />
    </div>
  )
}