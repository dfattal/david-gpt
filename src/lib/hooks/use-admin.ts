'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'

export function useAdmin() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) {
        setIsAdmin(false)
        setIsLoading(false)
        return
      }

      try {
        // Simple client-side check against admin emails
        // In production, this should be verified server-side
        const adminEmails = ['dfattal@gmail.com']
        const userIsAdmin = adminEmails.includes(user.email)
        
        setIsAdmin(userIsAdmin)
      } catch (error) {
        console.error('Failed to check admin status:', error)
        setIsAdmin(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAdminStatus()
  }, [user?.email])

  return { isAdmin, isLoading }
}