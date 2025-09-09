// filepath: packages/auth/src/hooks/useRoles.ts

/**
 * HEYS EAP 3.0 - Role Management Hook
 * 
 * Purpose: React hook for role management and hierarchy operations
 * Features: Role checking, hierarchy validation, role assignments
 */

import { useState, useEffect, useCallback, useMemo } from 'react'

import { permissionService } from '../services/PermissionService'
import { useAuth } from './useAuth'
import { 
  ROLE_DEFINITIONS, 
  type RoleName, 
  type RoleLevel,
  getRoleLevel,
  compareRoles,
  canAssignRole,
  getHighestRole,
  getRoleHierarchy
} from '../utils/roles'
import type { UserRole, UserPermissions } from '../services/PermissionService'

export interface UseRolesResult {
  // Current user roles
  userRoles: string[]
  userRoleObjects: UserRole[]
  highestRole: RoleName | null
  roleLevel: RoleLevel
  
  // Role checking
  hasRole: (role: RoleName) => boolean
  hasAnyRole: (roles: RoleName[]) => boolean
  hasRoleLevel: (minLevel: RoleLevel) => boolean
  canAssign: (targetRole: RoleName) => boolean
  
  // Role data
  availableRoles: RoleName[]
  roleHierarchy: RoleName[]
  
  // Loading states
  isLoading: boolean
  isError: boolean
  error: Error | null
  
  // Actions
  refresh: () => Promise<void>
}

export interface UseRoleAssignmentResult {
  // Assignment operations
  assignRole: (userId: string, role: RoleName) => Promise<boolean>
  removeRole: (userId: string, role: RoleName) => Promise<boolean>
  updateUserRoles: (userId: string, roles: RoleName[]) => Promise<boolean>
  
  // Assignment states
  isAssigning: boolean
  isRemoving: boolean
  isUpdating: boolean
  assignmentError: Error | null
  
  // Validation
  canAssignRole: (role: RoleName) => boolean
  getAssignableRoles: () => RoleName[]
}

/**
 * Main roles hook
 */
export function useRoles(): UseRolesResult {
  const { user, isAuthenticated } = useAuth()
  const [permissions, setPermissions] = useState<UserPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load user permissions (which include roles)
  const loadUserData = useCallback(async () => {
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
      const error = err instanceof Error ? err : new Error('Failed to load user roles')
      setError(error)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id])

  // Load data on mount and when user changes
  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // Subscribe to permission/role changes
  useEffect(() => {
    if (!user?.id) return

    const unsubscribe = permissionService.onPermissionChange(user.id, (updatedPermissions) => {
      setPermissions(updatedPermissions)
    })

    return unsubscribe
  }, [user?.id])

  // Computed values
  const userRoles = useMemo(() => {
    return permissions?.roles.map(r => r.name) || []
  }, [permissions])

  const userRoleObjects = useMemo(() => {
    return permissions?.roles || []
  }, [permissions])

  const highestRole = useMemo(() => {
    if (userRoles.length === 0) return null
    return getHighestRole(userRoles as RoleName[])
  }, [userRoles])

  const roleLevel = useMemo(() => {
    if (!highestRole) return 0
    return getRoleLevel(highestRole)
  }, [highestRole])

  // Role checking functions
  const hasRole = useCallback((role: RoleName): boolean => {
    return userRoles.includes(role)
  }, [userRoles])

  const hasAnyRole = useCallback((roles: RoleName[]): boolean => {
    return roles.some(role => userRoles.includes(role))
  }, [userRoles])

  const hasRoleLevel = useCallback((minLevel: RoleLevel): boolean => {
    return roleLevel >= minLevel
  }, [roleLevel])

  const canAssign = useCallback((targetRole: RoleName): boolean => {
    if (!highestRole) return false
    return canAssignRole(highestRole, targetRole)
  }, [highestRole])

  // Available roles for current user
  const availableRoles = useMemo(() => {
    return Object.keys(ROLE_DEFINITIONS) as RoleName[]
  }, [])

  const roleHierarchy = useMemo(() => {
    return getRoleHierarchy()
  }, [])

  const refresh = useCallback(async () => {
    await loadUserData()
  }, [loadUserData])

  return {
    userRoles,
    userRoleObjects,
    highestRole,
    roleLevel,
    hasRole,
    hasAnyRole,
    hasRoleLevel,
    canAssign,
    availableRoles,
    roleHierarchy,
    isLoading,
    isError: !!error,
    error,
    refresh,
  }
}

/**
 * Hook for role assignment operations (admin functionality)
 */
export function useRoleAssignment(): UseRoleAssignmentResult {
  const { user } = useAuth()
  const { highestRole, canAssign } = useRoles()
  const [isAssigning, setIsAssigning] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [assignmentError, setAssignmentError] = useState<Error | null>(null)

  const assignRole = useCallback(async (userId: string, role: RoleName): Promise<boolean> => {
    if (!user?.id || !canAssign(role)) {
      setAssignmentError(new Error('Insufficient permissions to assign this role'))
      return false
    }

    try {
      setIsAssigning(true)
      setAssignmentError(null)
      
      const success = await permissionService.assignRole(userId, role, user.id)
      return success
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to assign role')
      setAssignmentError(error)
      return false
    } finally {
      setIsAssigning(false)
    }
  }, [user?.id, canAssign])

  const removeRole = useCallback(async (userId: string, role: RoleName): Promise<boolean> => {
    if (!user?.id || !canAssign(role)) {
      setAssignmentError(new Error('Insufficient permissions to remove this role'))
      return false
    }

    try {
      setIsRemoving(true)
      setAssignmentError(null)
      
      const success = await permissionService.removeRole(userId, role, user.id)
      return success
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to remove role')
      setAssignmentError(error)
      return false
    } finally {
      setIsRemoving(false)
    }
  }, [user?.id, canAssign])

  const updateUserRoles = useCallback(async (userId: string, roles: RoleName[]): Promise<boolean> => {
    if (!user?.id) {
      setAssignmentError(new Error('Not authenticated'))
      return false
    }

    // Check if user can assign all requested roles
    const canAssignAll = roles.every(role => canAssign(role))
    if (!canAssignAll) {
      setAssignmentError(new Error('Insufficient permissions to assign some roles'))
      return false
    }

    try {
      setIsUpdating(true)
      setAssignmentError(null)
      
      const success = await permissionService.updateUserRoles(userId, roles, user.id)
      return success
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update user roles')
      setAssignmentError(error)
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [user?.id, canAssign])

  const canAssignRole = useCallback((role: RoleName): boolean => {
    return canAssign(role)
  }, [canAssign])

  const getAssignableRoles = useCallback((): RoleName[] => {
    if (!highestRole) return []
    
    return Object.keys(ROLE_DEFINITIONS).filter(role => 
      canAssign(role as RoleName)
    ) as RoleName[]
  }, [highestRole, canAssign])

  return {
    assignRole,
    removeRole,
    updateUserRoles,
    isAssigning,
    isRemoving,
    isUpdating,
    assignmentError,
    canAssignRole,
    getAssignableRoles,
  }
}

/**
 * Hook for checking specific role combinations
 */
export function useRoleChecks() {
  const { hasRole, hasAnyRole, hasRoleLevel } = useRoles()
  
  return {
    // Admin checks
    isAdmin: hasAnyRole(['admin', 'super_admin']),
    isSuperAdmin: hasRole('super_admin'),
    isSystemAdmin: hasRole('super_admin'),
    
    // Management checks
    isManager: hasAnyRole(['manager', 'admin', 'super_admin']),
    isSeniorManager: hasAnyRole(['senior_manager', 'admin', 'super_admin']),
    
    // Staff checks
    isStaff: hasRoleLevel(10), // staff level and above
    isSeniorStaff: hasRoleLevel(20), // senior_staff level and above
    
    // Content checks
    isContentManager: hasAnyRole(['content_manager', 'admin', 'super_admin']),
    isEditor: hasAnyRole(['editor', 'content_manager', 'admin', 'super_admin']),
    
    // User management
    canManageUsers: hasAnyRole(['admin', 'super_admin']),
    canManageContent: hasAnyRole(['content_manager', 'admin', 'super_admin']),
    canModerate: hasAnyRole(['moderator', 'content_manager', 'admin', 'super_admin']),
    
    // Level-based checks
    hasBasicAccess: hasRoleLevel(5), // user level and above
    hasAdvancedAccess: hasRoleLevel(15), // lead level and above
    hasFullAccess: hasRoleLevel(50), // admin level and above
  }
}

/**
 * Hook for role hierarchy information
 */
export function useRoleHierarchy() {
  const { roleLevel, highestRole } = useRoles()
  
  const getSubordinateRoles = useCallback((): RoleName[] => {
    if (!highestRole) return []
    
    return Object.entries(ROLE_DEFINITIONS)
      .filter(([_, def]) => def.level < roleLevel)
      .map(([roleName, _]) => roleName as RoleName)
  }, [highestRole, roleLevel])

  const getSuperiorRoles = useCallback((): RoleName[] => {
    if (!highestRole) return []
    
    return Object.entries(ROLE_DEFINITIONS)
      .filter(([_, def]) => def.level > roleLevel)
      .map(([roleName, _]) => roleName as RoleName)
  }, [highestRole, roleLevel])

  const getEqualRoles = useCallback((): RoleName[] => {
    if (!highestRole) return []
    
    return Object.entries(ROLE_DEFINITIONS)
      .filter(([_, def]) => def.level === roleLevel)
      .map(([roleName, _]) => roleName as RoleName)
  }, [highestRole, roleLevel])

  const canManageRole = useCallback((targetRole: RoleName): boolean => {
    if (!highestRole) return false
    const targetLevel = getRoleLevel(targetRole)
    return roleLevel > targetLevel
  }, [highestRole, roleLevel])

  return {
    currentLevel: roleLevel,
    getSubordinateRoles,
    getSuperiorRoles,
    getEqualRoles,
    canManageRole,
  }
}

export default useRoles
