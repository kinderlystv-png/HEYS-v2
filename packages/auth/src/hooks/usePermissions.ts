// filepath: packages/auth/src/hooks/usePermissions.ts

/**
 * HEYS EAP 3.0 - Permission Management Hook
 * 
 * Purpose: React hook for permission checking and management
 * Features: Real-time permission updates, caching, type safety
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { permissionService, type PermissionCheck, type UserPermissions } from '../services/PermissionService'
import { useAuth } from './useAuth'
import type { PermissionName } from '../utils/permissions'

export interface UsePermissionsResult {
  // Permission checking
  hasPermission: (permission: PermissionName) => boolean
  hasAnyPermission: (permissions: PermissionName[]) => boolean
  hasAllPermissions: (permissions: PermissionName[]) => boolean
  checkPermission: (permission: PermissionName) => Promise<PermissionCheck>
  
  // Permission data
  permissions: UserPermissions | null
  effectivePermissions: PermissionName[]
  roles: string[]
  
  // Loading states
  isLoading: boolean
  isError: boolean
  error: Error | null
  
  // Actions
  refresh: () => Promise<void>
  invalidateCache: () => void
}

export interface UsePermissionCheckResult extends PermissionCheck {
  isLoading: boolean
  isError: boolean
  error: Error | null
}

/**
 * Main permissions hook
 */
export function usePermissions(): UsePermissionsResult {
  const { user, isAuthenticated } = useAuth()
  const [permissions, setPermissions] = useState<UserPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load user permissions
  const loadPermissions = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setPermissions(null)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      const userPermissions = await permissionService.getUserPermissions(user.id)
      setPermissions(userPermissions)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load permissions')
      setError(error)
      console.error('Failed to load user permissions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id])

  // Load permissions on mount and when user changes
  useEffect(() => {
    loadPermissions()
  }, [loadPermissions])

  // Subscribe to permission changes
  useEffect(() => {
    if (!user?.id) return

    const unsubscribe = permissionService.onPermissionChange(user.id, (updatedPermissions) => {
      setPermissions(updatedPermissions)
    })

    return unsubscribe
  }, [user?.id])

  // Permission checking functions
  const hasPermission = useCallback((permission: PermissionName): boolean => {
    if (!permissions) return false
    return permissions.effectivePermissions.some(p => p.name === permission)
  }, [permissions])

  const hasAnyPermission = useCallback((permissionList: PermissionName[]): boolean => {
    if (!permissions) return false
    return permissionList.some(permission => 
      permissions.effectivePermissions.some(p => p.name === permission)
    )
  }, [permissions])

  const hasAllPermissions = useCallback((permissionList: PermissionName[]): boolean => {
    if (!permissions) return false
    return permissionList.every(permission =>
      permissions.effectivePermissions.some(p => p.name === permission)
    )
  }, [permissions])

  const checkPermission = useCallback(async (permission: PermissionName): Promise<PermissionCheck> => {
    if (!user?.id) {
      return {
        hasPermission: false,
        reason: 'User not authenticated'
      }
    }

    return await permissionService.hasPermission(user.id, permission)
  }, [user?.id])

  const refresh = useCallback(async () => {
    await loadPermissions()
  }, [loadPermissions])

  const invalidateCache = useCallback(() => {
    if (user?.id) {
      permissionService.invalidateUserCache(user.id)
    }
  }, [user?.id])

  // Memoized computed values
  const effectivePermissions = useMemo(() => {
    return permissions?.effectivePermissions.map(p => p.name as PermissionName) || []
  }, [permissions])

  const roles = useMemo(() => {
    return permissions?.roles.map(r => r.name) || []
  }, [permissions])

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkPermission,
    permissions,
    effectivePermissions,
    roles,
    isLoading,
    isError: !!error,
    error,
    refresh,
    invalidateCache,
  }
}

/**
 * Hook for checking a single permission
 */
export function usePermissionCheck(permission: PermissionName): UsePermissionCheckResult {
  const { user, isAuthenticated } = useAuth()
  const [result, setResult] = useState<PermissionCheck>({
    hasPermission: false,
    reason: 'Not checked'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const checkPermission = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setResult({
        hasPermission: false,
        reason: 'User not authenticated'
      })
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      const check = await permissionService.hasPermission(user.id, permission)
      setResult(check)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Permission check failed')
      setError(error)
      setResult({
        hasPermission: false,
        reason: 'Permission check error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id, permission])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  return {
    ...result,
    isLoading,
    isError: !!error,
    error,
  }
}

/**
 * Hook for checking multiple permissions
 */
export function usePermissionChecks(permissions: PermissionName[]): Record<PermissionName, UsePermissionCheckResult> {
  const { user, isAuthenticated } = useAuth()
  const [results, setResults] = useState<Record<PermissionName, PermissionCheck>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const checkPermissions = useCallback(async () => {
    if (!isAuthenticated || !user?.id || permissions.length === 0) {
      const emptyResults: Record<PermissionName, PermissionCheck> = {}
      permissions.forEach(permission => {
        emptyResults[permission] = {
          hasPermission: false,
          reason: 'User not authenticated'
        }
      })
      setResults(emptyResults)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      const checks = await permissionService.hasPermissions(user.id, permissions)
      setResults(checks)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Permission checks failed')
      setError(error)
      
      const errorResults: Record<PermissionName, PermissionCheck> = {}
      permissions.forEach(permission => {
        errorResults[permission] = {
          hasPermission: false,
          reason: 'Permission check error'
        }
      })
      setResults(errorResults)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id, permissions])

  useEffect(() => {
    checkPermissions()
  }, [checkPermissions])

  // Transform results to include loading/error states
  const transformedResults: Record<PermissionName, UsePermissionCheckResult> = {}
  permissions.forEach(permission => {
    const result = results[permission] || { hasPermission: false, reason: 'Not checked' }
    transformedResults[permission] = {
      ...result,
      isLoading,
      isError: !!error,
      error,
    }
  })

  return transformedResults
}

/**
 * Hook for resource-based permission checking
 */
export function useResourcePermission(
  resource: string,
  action: string,
  resourceId?: string
) {
  const { user, isAuthenticated } = useAuth()
  const [result, setResult] = useState<PermissionCheck>({
    hasPermission: false,
    reason: 'Not checked'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const checkResourcePermission = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setResult({
        hasPermission: false,
        reason: 'User not authenticated'
      })
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      const check = await permissionService.canAccessResource(
        user.id,
        resource,
        action,
        resourceId
      )
      setResult(check)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Resource permission check failed')
      setError(error)
      setResult({
        hasPermission: false,
        reason: 'Resource permission check error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id, resource, action, resourceId])

  useEffect(() => {
    checkResourcePermission()
  }, [checkResourcePermission])

  return {
    ...result,
    isLoading,
    isError: !!error,
    error,
    refresh: checkResourcePermission,
  }
}

/**
 * Hook for admin-level permission checking
 */
export function useAdminPermissions() {
  const { hasPermission, hasAnyPermission } = usePermissions()
  
  return {
    isAdmin: hasAnyPermission(['users:admin', 'system:admin']),
    isSuperAdmin: hasPermission('system:admin'),
    canManageUsers: hasPermission('users:admin'),
    canManageRoles: hasPermission('roles:admin'),
    canAccessAudit: hasPermission('audit:read'),
    canManageSystem: hasPermission('system:admin'),
  }
}

export default usePermissions
