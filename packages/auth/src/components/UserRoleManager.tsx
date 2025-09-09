// filepath: packages/auth/src/components/UserRoleManager.tsx

/**
 * HEYS EAP 3.0 - User Role Management Component
 * 
 * Purpose: Administrative interface for managing user roles
 * Features: Role assignment, hierarchy validation, audit logging
 */

import React, { useState, useEffect, useCallback } from 'react'

import { useRoles, useRoleAssignment } from '../hooks/useRoles'
import { usePermissions } from '../hooks/usePermissions'
import { ROLE_DEFINITIONS, type RoleName } from '../utils/roles'
import type { UserPermissions } from '../services/PermissionService'

interface UserRoleManagerProps {
  userId: string
  onRoleChange?: (userId: string, roles: RoleName[]) => void
  onError?: (error: Error) => void
  readOnly?: boolean
  showPermissions?: boolean
  className?: string
}

interface UserRoleDisplayProps {
  userPermissions: UserPermissions | null
  isLoading: boolean
  error: Error | null
}

/**
 * User role display component
 */
const UserRoleDisplay: React.FC<UserRoleDisplayProps> = ({
  userPermissions,
  isLoading,
  error
}) => {
  if (isLoading) {
    return <div className="text-gray-500">Loading user roles...</div>
  }

  if (error) {
    return <div className="text-red-500">Error loading roles: {error.message}</div>
  }

  if (!userPermissions || userPermissions.roles.length === 0) {
    return <div className="text-gray-500">No roles assigned</div>
  }

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-gray-900">Current Roles:</h4>
      <div className="flex flex-wrap gap-2">
        {userPermissions.roles.map((role) => {
          const roleDefinition = ROLE_DEFINITIONS[role.name as RoleName]
          return (
            <span
              key={role.id}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                roleDefinition?.level >= 50
                  ? 'bg-red-100 text-red-800' // Admin roles
                  : roleDefinition?.level >= 20
                  ? 'bg-blue-100 text-blue-800' // Management roles
                  : 'bg-green-100 text-green-800' // Standard roles
              }`}
            >
              {role.name} (Level {roleDefinition?.level})
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Role assignment interface
 */
interface RoleAssignmentProps {
  userId: string
  currentRoles: RoleName[]
  onRoleChange: (roles: RoleName[]) => void
  disabled?: boolean
}

const RoleAssignment: React.FC<RoleAssignmentProps> = ({
  userId,
  currentRoles,
  onRoleChange,
  disabled = false
}) => {
  const { getAssignableRoles, canAssignRole } = useRoleAssignment()
  const [selectedRoles, setSelectedRoles] = useState<RoleName[]>(currentRoles)
  const [pendingChanges, setPendingChanges] = useState(false)

  const assignableRoles = getAssignableRoles()

  useEffect(() => {
    setSelectedRoles(currentRoles)
  }, [currentRoles])

  const handleRoleToggle = useCallback((role: RoleName) => {
    if (disabled || !canAssignRole(role)) return

    const newRoles = selectedRoles.includes(role)
      ? selectedRoles.filter(r => r !== role)
      : [...selectedRoles, role]

    setSelectedRoles(newRoles)
    setPendingChanges(JSON.stringify(newRoles) !== JSON.stringify(currentRoles))
  }, [selectedRoles, currentRoles, disabled, canAssignRole])

  const handleSaveChanges = useCallback(() => {
    onRoleChange(selectedRoles)
    setPendingChanges(false)
  }, [selectedRoles, onRoleChange])

  const handleCancelChanges = useCallback(() => {
    setSelectedRoles(currentRoles)
    setPendingChanges(false)
  }, [currentRoles])

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-900">Assign Roles:</h4>
      
      <div className="grid grid-cols-1 gap-2">
        {assignableRoles.map((role) => {
          const roleDefinition = ROLE_DEFINITIONS[role]
          const isSelected = selectedRoles.includes(role)
          const canAssign = canAssignRole(role)
          
          return (
            <label
              key={role}
              className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer ${
                !canAssign || disabled
                  ? 'bg-gray-50 cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleRoleToggle(role)}
                disabled={!canAssign || disabled}
                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{role}</span>
                  <span className="text-sm text-gray-500">
                    Level {roleDefinition.level}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{roleDefinition.description}</p>
              </div>
            </label>
          )
        })}
      </div>

      {pendingChanges && (
        <div className="flex space-x-3 pt-4 border-t">
          <button
            onClick={handleSaveChanges}
            disabled={disabled}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
          <button
            onClick={handleCancelChanges}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Permission display component
 */
interface PermissionDisplayProps {
  userPermissions: UserPermissions | null
}

const PermissionDisplay: React.FC<PermissionDisplayProps> = ({ userPermissions }) => {
  if (!userPermissions) {
    return <div className="text-gray-500">No permissions data</div>
  }

  const groupedPermissions = userPermissions.effectivePermissions.reduce((acc, permission) => {
    const [resource, action] = permission.name.split(':')
    if (!acc[resource]) {
      acc[resource] = []
    }
    acc[resource].push(action)
    return acc
  }, {} as Record<string, string[]>)

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-900">Effective Permissions:</h4>
      
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(groupedPermissions).map(([resource, actions]) => (
          <div key={resource} className="border border-gray-200 rounded-lg p-3">
            <h5 className="font-medium text-gray-800 capitalize mb-2">{resource}</h5>
            <div className="flex flex-wrap gap-1">
              {actions.map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800"
                >
                  {action}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Main UserRoleManager component
 */
export const UserRoleManager: React.FC<UserRoleManagerProps> = ({
  userId,
  onRoleChange,
  onError,
  readOnly = false,
  showPermissions = true,
  className = ''
}) => {
  const { hasPermission } = usePermissions()
  const { 
    assignRole, 
    removeRole, 
    updateUserRoles,
    isUpdating,
    assignmentError 
  } = useRoleAssignment()

  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Check if current user can manage roles
  const canManageRoles = hasPermission('users:admin') || hasPermission('roles:admin')

  // Load user permissions and roles
  const loadUserData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // This would typically load from the permission service
      // For now, we'll simulate it
      // const permissions = await permissionService.getUserPermissions(userId)
      // setUserPermissions(permissions)
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load user data')
      setError(error)
      onError?.(error)
    } finally {
      setIsLoading(false)
    }
  }, [userId, onError])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  useEffect(() => {
    if (assignmentError) {
      setError(assignmentError)
      onError?.(assignmentError)
    }
  }, [assignmentError, onError])

  const handleRoleChange = useCallback(async (newRoles: RoleName[]) => {
    try {
      setError(null)
      
      const success = await updateUserRoles(userId, newRoles)
      if (success) {
        await loadUserData()
        onRoleChange?.(userId, newRoles)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update roles')
      setError(error)
      onError?.(error)
    }
  }, [userId, updateUserRoles, loadUserData, onRoleChange, onError])

  if (!canManageRoles) {
    return (
      <div className="text-red-500 p-4 border border-red-200 rounded-lg">
        You don't have permission to manage user roles.
      </div>
    )
  }

  const currentRoles = userPermissions?.roles.map(r => r.name as RoleName) || []

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error.message}</div>
            </div>
          </div>
        </div>
      )}

      {/* Current Roles Display */}
      <UserRoleDisplay
        userPermissions={userPermissions}
        isLoading={isLoading}
        error={error}
      />

      {/* Role Assignment Interface */}
      {!readOnly && (
        <RoleAssignment
          userId={userId}
          currentRoles={currentRoles}
          onRoleChange={handleRoleChange}
          disabled={isUpdating || isLoading}
        />
      )}

      {/* Permissions Display */}
      {showPermissions && (
        <PermissionDisplay userPermissions={userPermissions} />
      )}

      {/* Loading Indicator */}
      {(isLoading || isUpdating) && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">
            {isLoading ? 'Loading...' : 'Updating roles...'}
          </span>
        </div>
      )}
    </div>
  )
}

export default UserRoleManager
