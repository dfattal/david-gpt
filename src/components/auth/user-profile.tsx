'use client'

import * as React from 'react'
import { Settings, LogOut, ChevronUp } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function UserProfile() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const userInitials = user.user_metadata?.full_name
    ?.split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const handleSettings = () => {
    // TODO: Implement settings dialog/page
    console.log('Settings clicked')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full h-auto p-2 justify-start gap-3 hover:bg-accent/50 transition-colors min-h-[44px]"
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage 
              src={user.user_metadata?.avatar_url} 
              alt={user.user_metadata?.full_name || user.email || ''}
            />
            <AvatarFallback className="text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1 text-left">
            <div className="text-sm font-medium truncate max-w-full">
              {user.user_metadata?.full_name || 'User'}
            </div>
          </div>
          <ChevronUp className="h-4 w-4 flex-shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-64 mb-2"
        sideOffset={8}
      >
        <div className="px-2 py-1.5 text-sm text-muted-foreground border-b">
          {user.email}
        </div>
        <DropdownMenuItem onClick={handleSettings} className="gap-2 cursor-pointer">
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}