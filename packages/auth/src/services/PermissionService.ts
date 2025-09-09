// filepath: packages/auth/src/services/PermissionService.ts

/**
 * HEYS EAP 3.0 - Permission Management Service
 * 
 * Purpose: Centralized permission checking and management
 * Features: Real-time permissions, caching, role-based access control
 */

import { supabase, handleSupabaseError } from '../lib/supabase'
import type { 
  Database,
  UserProfile,
  Permission,
  Role,
  UserRole,
  UserPermission,
  RoleWithPermissions,
  UserWithPermissions
} from '../types/database.types'

export interface PermissionCheck {
  hasPermission: boolean
  reason?: string
  grantedBy?: 'role' | 'direct' | 'system'
  expiresAt?: Date
}

export interface UserPermissions {
  userId: string
  roles: Role[]
  directPermissions: Permission[]
  effectivePermissions: Permission[]
  lastUpdated: Date
}

export class PermissionService {
  private permissionCache = new Map<string, UserPermissions>()
  private cacheExpiry = 5 * 60 * 1000 // 5 minutes
  private permissionCallbacks = new Map<string, Set<(permissions: UserPermissions) => void>>()

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string, 
    permissionName: string,
    resourceId?: string
  ): Promise<PermissionCheck> {
    try {
      // Try cache first
      const cached = this.getCachedPermissions(userId)
      if (cached) {
        return this.checkPermissionFromCache(cached, permissionName)
      }

      // Use database function for real-time check
      const { data, error } = await supabase.rpc('user_has_permission', {
        permission_name: permissionName,
        user_uuid: userId
      })

      if (error) {
        console.error('Permission check failed:', error)
        return {
          hasPermission: false,
          reason: 'Permission check error'
        }
      }

      // Get detailed permission info
      const permissionDetails = await this.getPermissionDetails(userId, permissionName)

      return {
        hasPermission: data,
        ...permissionDetails
      }
    } catch (error) {
      console.error('Permission service error:', error)
      return {
        hasPermission: false,
        reason: 'Service error'
      }
    }
  }

  /**
   * Check multiple permissions at once
   */
  async hasPermissions(
    userId: string, 
    permissionNames: string[]
  ): Promise<Record<string, PermissionCheck>> {
    const results: Record<string, PermissionCheck> = {}

    // Check permissions in parallel
    const checks = permissionNames.map(async (permission) => {
      const result = await this.hasPermission(userId, permission)
      return { permission, result }
    })

    const resolvedChecks = await Promise.all(checks)
    
    resolvedChecks.forEach(({ permission, result }) => {
      results[permission] = result
    })

    return results
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string, 
    permissionNames: string[]
  ): Promise<PermissionCheck> {
    const checks = await this.hasPermissions(userId, permissionNames)
    
    for (const [permission, check] of Object.entries(checks)) {
      if (check.hasPermission) {
        return {
          hasPermission: true,
          reason: `Granted via permission: ${permission}`,
          grantedBy: check.grantedBy
        }
      }
    }

    return {
      hasPermission: false,
      reason: 'No matching permissions found'
    }
  }

  /**
   * Get user's complete permission set
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      // Check cache first
      const cached = this.getCachedPermissions(userId)
      if (cached) {
        return cached
      }

      // Load from database
      const permissions = await this.loadUserPermissions(userId)
      
      // Cache the result
      this.cacheUserPermissions(userId, permissions)
      
      // Notify listeners
      this.notifyPermissionChange(userId, permissions)

      return permissions
    } catch (error) {
      console.error('Failed to get user permissions:', error)
      throw error
    }
  }

  /**
   * Load user permissions from database
   */
  private async loadUserPermissions(userId: string): Promise<UserPermissions> {
    // Get user with roles and permissions
    const { data: userWithData, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        user_roles!inner (
          *,
          roles!inner (
            *,
            role_permissions!inner (
              *,
              permissions!inner (*)
            )
          )
        ),
        user_permissions!inner (
          *,
          permissions!inner (*)
        )
      `)
      .eq('id', userId)
      .eq('user_roles.is_active', true)
      .or('user_roles.expires_at.is.null,user_roles.expires_at.gt.now()')
      .or('user_permissions.expires_at.is.null,user_permissions.expires_at.gt.now()')
      .single()

    if (error && error.code !== 'PGRST116') {
      throw handleSupabaseError(error)
    }

    if (!userWithData) {
      // User exists but has no roles/permissions
      return {
        userId,
        roles: [],
        directPermissions: [],
        effectivePermissions: [],
        lastUpdated: new Date()
      }
    }

    // Extract roles and their permissions
    const roles: Role[] = []
    const rolePermissions: Permission[] = []
    
    if (userWithData.user_roles) {
      for (const userRole of userWithData.user_roles) {
        if (userRole.roles) {
          roles.push(userRole.roles)
          
          if (userRole.roles.role_permissions) {
            for (const rolePermission of userRole.roles.role_permissions) {
              if (rolePermission.permissions) {
                rolePermissions.push(rolePermission.permissions)
              }
            }
          }
        }
      }
    }

    // Extract direct permissions
    const directPermissions: Permission[] = []
    if (userWithData.user_permissions) {
      for (const userPermission of userWithData.user_permissions) {
        if (userPermission.granted && userPermission.permissions) {
          directPermissions.push(userPermission.permissions)
        }
      }
    }

    // Combine all permissions (deduplicate by permission name)
    const allPermissions = [...rolePermissions, ...directPermissions]
    const uniquePermissions = allPermissions.filter((permission, index, array) => 
      array.findIndex(p => p.name === permission.name) === index
    )

    return {
      userId,
      roles,
      directPermissions,
      effectivePermissions: uniquePermissions,
      lastUpdated: new Date()
    }
  }

  /**
   * Get permission details for specific permission
   */
  private async getPermissionDetails(
    userId: string, 
    permissionName: string
  ): Promise<Pick<PermissionCheck, 'grantedBy' | 'expiresAt' | 'reason'>> {
    // Check if granted through direct permission
    const { data: directPermission } = await supabase
      .from('user_permissions')
      .select(`
        *,
        permissions!inner (name)
      `)
      .eq('user_id', userId)
      .eq('permissions.name', permissionName)
      .eq('granted', true)
      .or('expires_at.is.null,expires_at.gt.now()')
      .single()

    if (directPermission) {
      return {
        grantedBy: 'direct',
        expiresAt: directPermission.expires_at ? new Date(directPermission.expires_at) : undefined,
        reason: 'Direct permission grant'
      }
    }

    // Check if granted through role
    const { data: rolePermission } = await supabase
      .from('user_roles')
      .select(`
        *,
        roles!inner (
          *,
          role_permissions!inner (
            *,
            permissions!inner (name)
          )
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('roles.role_permissions.permissions.name', permissionName)
      .or('expires_at.is.null,expires_at.gt.now()')
      .single()

    if (rolePermission) {
      return {
        grantedBy: 'role',
        expiresAt: rolePermission.expires_at ? new Date(rolePermission.expires_at) : undefined,
        reason: `Granted through role: ${rolePermission.roles?.name}`
      }
    }

    return {
      reason: 'Permission not found'
    }
  }

  /**
   * Check permission from cached data
   */
  private checkPermissionFromCache(
    cached: UserPermissions, 
    permissionName: string
  ): PermissionCheck {
    const hasPermission = cached.effectivePermissions.some(p => p.name === permissionName)
    
    if (!hasPermission) {
      return {
        hasPermission: false,
        reason: 'Permission not in effective permissions'
      }
    }

    // Check if it's a direct permission or role permission
    const isDirect = cached.directPermissions.some(p => p.name === permissionName)
    
    return {
      hasPermission: true,
      grantedBy: isDirect ? 'direct' : 'role',
      reason: isDirect ? 'Direct permission' : 'Role-based permission'
    }
  }

  /**
   * Cache management
   */
  private getCachedPermissions(userId: string): UserPermissions | null {
    const cached = this.permissionCache.get(userId)
    
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheExpiry) {
      return cached
    }

    // Remove expired cache
    if (cached) {
      this.permissionCache.delete(userId)
    }

    return null
  }

  private cacheUserPermissions(userId: string, permissions: UserPermissions): void {
    this.permissionCache.set(userId, permissions)
  }

  /**
   * Subscribe to permission changes
   */
  onPermissionChange(
    userId: string, 
    callback: (permissions: UserPermissions) => void
  ): () => void {
    if (!this.permissionCallbacks.has(userId)) {
      this.permissionCallbacks.set(userId, new Set())
    }
    
    const callbacks = this.permissionCallbacks.get(userId)!
    callbacks.add(callback)

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.permissionCallbacks.delete(userId)
      }
    }
  }

  /**
   * Notify listeners of permission changes
   */
  private notifyPermissionChange(userId: string, permissions: UserPermissions): void {
    const callbacks = this.permissionCallbacks.get(userId)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(permissions)
        } catch (error) {
          console.error('Error in permission change callback:', error)
        }
      })
    }
  }

  /**
   * Invalidate cache for user
   */
  invalidateUserCache(userId: string): void {
    this.permissionCache.delete(userId)
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.permissionCache.clear()
  }

  /**
   * Resource-based permission checking
   */
  async canAccessResource(
    userId: string,
    resource: string,
    action: string,
    resourceId?: string
  ): Promise<PermissionCheck> {
    const permissionName = `${resource}:${action}`
    
    // Use database function for complex resource access checking
    const { data, error } = await supabase.rpc('check_resource_access', {
      resource_name: resource,
      action_name: action,
      resource_id: resourceId,
      user_uuid: userId
    })

    if (error) {
      console.error('Resource access check failed:', error)
      return {
        hasPermission: false,
        reason: 'Resource access check error'
      }
    }

    return {
      hasPermission: data,
      reason: data ? 'Resource access granted' : 'Resource access denied',
      grantedBy: 'system'
    }
  }

  /**
   * Get effective permissions for debugging
   */
  async debugUserPermissions(userId: string): Promise<{
    user: UserProfile | null
    roles: Role[]
    directPermissions: Permission[]
    effectivePermissions: Permission[]
    permissionSources: Record<string, string[]>
  }> {
    const permissions = await this.getUserPermissions(userId)
    
    // Get user profile
    const { data: user } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Build permission sources map
    const permissionSources: Record<string, string[]> = {}
    
    permissions.effectivePermissions.forEach(permission => {
      const sources: string[] = []
      
      // Check if from direct permission
      if (permissions.directPermissions.some(p => p.name === permission.name)) {
        sources.push('direct')
      }
      
      // Check which roles provide this permission
      permissions.roles.forEach(role => {
        // This would need to be checked against role permissions
        // For now, just indicate if user has the role
        sources.push(`role:${role.name}`)
      })
      
      permissionSources[permission.name] = sources
    })

    return {
      user,
      roles: permissions.roles,
      directPermissions: permissions.directPermissions,
      effectivePermissions: permissions.effectivePermissions,
      permissionSources
    }
  }
}

// Export singleton instance
export const permissionService = new PermissionService()
export default permissionService
