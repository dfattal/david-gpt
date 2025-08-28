// Admin Access Control System
// Phase 10: Admin panel authentication and authorization

import { createClient } from '@/lib/supabase/server'
import { User } from '@supabase/supabase-js'

export interface AdminUser {
  id: string
  email: string
  role: 'super_admin' | 'admin' | 'moderator'
  permissions: string[]
  created_at: string
  last_active?: string
}

export interface AdminPermissions {
  documents: {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    bulk_operations: boolean
  }
  users: {
    view: boolean
    manage: boolean
  }
  knowledge_graph: {
    view: boolean
    edit: boolean
    manage: boolean
  }
  system: {
    monitor: boolean
    configure: boolean
  }
}

// Hardcoded admin emails for initial setup
// In production, this would be stored in database or environment config
const ADMIN_EMAILS = [
  'dfattal@gmail.com'
]

const ROLE_PERMISSIONS: Record<string, AdminPermissions> = {
  super_admin: {
    documents: { view: true, create: true, edit: true, delete: true, bulk_operations: true },
    users: { view: true, manage: true },
    knowledge_graph: { view: true, edit: true, manage: true },
    system: { monitor: true, configure: true }
  },
  admin: {
    documents: { view: true, create: true, edit: true, delete: true, bulk_operations: true },
    users: { view: true, manage: false },
    knowledge_graph: { view: true, edit: true, manage: false },
    system: { monitor: true, configure: false }
  },
  moderator: {
    documents: { view: true, create: true, edit: true, delete: false, bulk_operations: false },
    users: { view: false, manage: false },
    knowledge_graph: { view: true, edit: false, manage: false },
    system: { monitor: false, configure: false }
  }
}

/**
 * Check if a user is an admin
 */
export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * Get admin role for a user
 */
export function getAdminRole(email: string): 'super_admin' | 'admin' | 'moderator' | null {
  const normalizedEmail = email.toLowerCase()
  
  if (normalizedEmail === 'dfattal@gmail.com') {
    return 'super_admin'
  }
  
  if (ADMIN_EMAILS.includes(normalizedEmail)) {
    return 'admin'
  }
  
  return null
}

/**
 * Get admin permissions for a user
 */
export function getAdminPermissions(email: string): AdminPermissions | null {
  const role = getAdminRole(email)
  if (!role) return null
  
  return ROLE_PERMISSIONS[role]
}

/**
 * Middleware to check admin access
 */
export async function requireAdmin(request?: Request): Promise<{
  user: User
  adminUser: AdminUser
  permissions: AdminPermissions
} | { error: string, status: number }> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || !user.email) {
      return { error: 'Authentication required', status: 401 }
    }

    // Check admin status
    if (!isAdmin(user.email)) {
      return { error: 'Admin access required', status: 403 }
    }

    const role = getAdminRole(user.email)
    const permissions = getAdminPermissions(user.email)

    if (!role || !permissions) {
      return { error: 'Invalid admin configuration', status: 403 }
    }

    const adminUser: AdminUser = {
      id: user.id,
      email: user.email,
      role,
      permissions: Object.keys(permissions).flatMap(category => 
        Object.entries(permissions[category as keyof AdminPermissions])
          .filter(([_, allowed]) => allowed)
          .map(([permission, _]) => `${category}.${permission}`)
      ),
      created_at: user.created_at,
      last_active: new Date().toISOString()
    }

    // TODO: Log admin access for auditing
    console.log(`Admin access: ${user.email} (${role})`)

    return { user, adminUser, permissions }
  } catch (error) {
    console.error('Admin access check failed:', error)
    return { error: 'Internal server error', status: 500 }
  }
}

/**
 * Check specific admin permission
 */
export function hasPermission(
  permissions: AdminPermissions,
  category: keyof AdminPermissions,
  action: string
): boolean {
  const categoryPermissions = permissions[category] as Record<string, boolean>
  return categoryPermissions[action] === true
}

/**
 * Admin access middleware for API routes
 */
export async function withAdminAuth<T>(
  handler: (params: {
    user: User
    adminUser: AdminUser
    permissions: AdminPermissions
    request: Request
  }) => Promise<T>,
  request: Request
): Promise<T | Response> {
  const authResult = await requireAdmin(request)
  
  if ('error' in authResult) {
    return Response.json({ error: authResult.error }, { status: authResult.status })
  }

  return handler({
    ...authResult,
    request
  })
}

/**
 * Create admin audit log entry
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient()
    
    // For now, just log to console
    // In production, you'd store this in an admin_audit_log table
    console.log('Admin Action:', {
      admin_id: adminUserId,
      action,
      resource,
      resource_id: resourceId,
      details,
      timestamp: new Date().toISOString()
    })

    // TODO: Store in database
    // await supabase.from('admin_audit_log').insert({
    //   admin_id: adminUserId,
    //   action,
    //   resource,
    //   resource_id: resourceId,
    //   details,
    //   timestamp: new Date().toISOString()
    // })
  } catch (error) {
    console.error('Failed to log admin action:', error)
  }
}

/**
 * Get admin dashboard stats
 */
export async function getAdminStats(): Promise<{
  documents: {
    total: number
    by_format: Record<string, number>
    recent_uploads: number
  }
  chunks: {
    total: number
    processing_status: Record<string, number>
  }
  knowledge_graph: {
    entities: number
    relations: number
  }
  users: {
    total: number
    active_today: number
  }
  system: {
    uptime: string
    last_backup: string | null
  }
}> {
  const supabase = await createClient()
  const startTime = performance.now()

  try {
    // Get document stats
    const { data: documents, error: docError } = await supabase
      .from('rag_documents')
      .select('source_type, created_at')

    if (docError) throw docError

    const documentStats = {
      total: documents?.length || 0,
      by_format: documents?.reduce((acc, doc) => {
        acc[doc.source_type] = (acc[doc.source_type] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {},
      recent_uploads: documents?.filter(doc => 
        new Date(doc.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length || 0
    }

    // Get chunk stats
    const { count: chunkCount, error: chunkError } = await supabase
      .from('rag_chunks')
      .select('id', { count: 'exact', head: true })

    if (chunkError) throw chunkError

    const chunkStats = {
      total: chunkCount || 0,
      processing_status: { 'completed': chunkCount || 0 }
    }

    // Get knowledge graph stats
    const { count: entitiesCount, error: entityError } = await supabase
      .from('rag_entities')
      .select('id', { count: 'exact', head: true })

    const { count: relationsCount, error: relationError } = await supabase
      .from('rag_relations')
      .select('id', { count: 'exact', head: true })

    const kgStats = {
      entities: entitiesCount || 0,
      relations: relationsCount || 0
    }

    // Mock user stats (would come from auth.users in production)
    const userStats = {
      total: 1, // Placeholder
      active_today: 1 // Placeholder
    }

    const systemStats = {
      uptime: process.uptime ? `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m` : 'Unknown',
      last_backup: null // Would be implemented with backup system
    }

    console.log(`Admin stats collected in ${performance.now() - startTime}ms`)

    return {
      documents: documentStats,
      chunks: chunkStats,
      knowledge_graph: kgStats,
      users: userStats,
      system: systemStats
    }

  } catch (error) {
    console.error('Failed to get admin stats:', error)
    throw new Error('Failed to retrieve admin statistics')
  }
}

/**
 * Validate admin permissions for API endpoints
 */
export function validateAdminPermission(
  permissions: AdminPermissions,
  requiredCategory: keyof AdminPermissions,
  requiredAction: string
): boolean {
  return hasPermission(permissions, requiredCategory, requiredAction)
}

/**
 * Simple admin access check for API routes - returns user or null
 */
export async function checkAdminAccess(): Promise<{
  id: string
  email: string
  role: string
} | null> {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || !user.email) {
      return null
    }

    // Check admin status
    if (!isAdmin(user.email)) {
      return null
    }

    const role = getAdminRole(user.email)
    if (!role) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      role
    }
  } catch (error) {
    console.error('Admin access check failed:', error)
    return null
  }
}