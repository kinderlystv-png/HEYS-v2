// filepath: packages/web/src/components/dashboard/widgets/PermissionWidget.tsx

/**
 * HEYS EAP 3.0 - Permission Status Widget
 * 
 * Purpose: Display current user's permission status and role information
 * Features: Real-time permission updates, role hierarchy display, visual indicators
 */

'use client'

import React, { useState, useEffect } from 'react'
import { usePermissions, useRoles, PermissionGate } from '@heys/auth'
import type { PermissionName } from '@heys/auth'

interface PermissionWidgetProps {
  className?: string
  showDetails?: boolean
  maxPermissions?: number
}

interface PermissionGroup {
  name: string
  permissions: PermissionName[]
  color: string
  icon: React.ReactNode
}

/**
 * Permission groups for organized display
 */
const permissionGroups: PermissionGroup[] = [
  {
    name: 'Users',
    permissions: ['users:read', 'users:write', 'users:delete', 'users:admin'],
    color: 'blue',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    )
  },
  {
    name: 'Content',
    permissions: ['content:read', 'content:write', 'content:delete', 'content:publish'],
    color: 'green',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15" />
      </svg>
    )
  },
  {
    name: 'System',
    permissions: ['system:read', 'system:admin', 'audit:read'],
    color: 'red',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
]

/**
 * Permission status indicator component
 */
interface PermissionIndicatorProps {
  hasPermission: boolean
  permissionName: string
  size?: 'sm' | 'md'
}

function PermissionIndicator({ 
  hasPermission, 
  permissionName, 
  size = 'sm' 
}: PermissionIndicatorProps): React.ReactElement {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
  
  return (
    <div className="flex items-center space-x-2">
      <div 
        className={`${sizeClasses} rounded-full ${
          hasPermission ? 'bg-green-400' : 'bg-gray-300'
        }`}
        title={`${permissionName}: ${hasPermission ? 'Granted' : 'Denied'}`}
      />
      {size === 'md' && (
        <span className={`text-xs ${
          hasPermission ? 'text-green-700' : 'text-gray-500'
        }`}>
          {permissionName.split(':')[1]}
        </span>
      )}
    </div>
  )
}

/**
 * Role badge component
 */
interface RoleBadgeProps {
  roleName: string
  roleLevel: number
}

function RoleBadge({ roleName, roleLevel }: RoleBadgeProps): React.ReactElement {
  const getColorClass = (level: number) => {
    if (level >= 80) return 'bg-red-100 text-red-800 border-red-200'
    if (level >= 50) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (level >= 20) return 'bg-blue-100 text-blue-800 border-blue-200'
    return 'bg-green-100 text-green-800 border-green-200'
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getColorClass(roleLevel)}`}>
      {roleName}
      <span className="ml-1 text-xs opacity-75">L{roleLevel}</span>
    </span>
  )
}

/**
 * Main permission widget component
 */
export function PermissionWidget({
  className = '',
  showDetails = true,
  maxPermissions = 12
}: PermissionWidgetProps): React.ReactElement {
  const {
    effectivePermissions,
    roles,
    hasPermission,
    isLoading,
    isError,
    error
  } = usePermissions()
  
  const { 
    highestRole, 
    roleLevel,
    userRoleObjects 
  } = useRoles()

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Calculate permission statistics
  const permissionStats = {
    total: effectivePermissions.length,
    byGroup: permissionGroups.map(group => ({
      name: group.name,
      granted: group.permissions.filter(p => hasPermission(p)).length,
      total: group.permissions.length,
      color: group.color,
      icon: group.icon
    }))
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroup(expandedGroup === groupName ? null : groupName)
  }

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="text-center">
          <div className="text-red-500 mb-2">
            <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Failed to load permissions</p>
          {error && (
            <p className="text-xs text-gray-500 mt-1">{error.message}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">
            {permissionStats.total} active
          </span>
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        </div>
      </div>

      {/* Current roles */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Roles</h4>
        <div className="flex flex-wrap gap-2">
          {userRoleObjects.length > 0 ? (
            userRoleObjects.map((role) => (
              <RoleBadge
                key={role.id}
                roleName={role.name}
                roleLevel={roleLevel}
              />
            ))
          ) : (
            <span className="text-sm text-gray-500">No roles assigned</span>
          )}
        </div>
      </div>

      {/* Permission groups overview */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Permission Groups</h4>
        
        {permissionStats.byGroup.map((group) => {
          const percentage = group.total > 0 ? (group.granted / group.total) * 100 : 0
          const isExpanded = expandedGroup === group.name
          
          return (
            <div key={group.name} className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => toggleGroup(group.name)}
                className="w-full p-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`text-${group.color}-600`}>
                      {group.icon}
                    </div>
                    <span className="font-medium text-gray-900">{group.name}</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">
                      {group.granted}/{group.total}
                    </span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className={`bg-${group.color}-500 h-2 rounded-full transition-all duration-300`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded permission details */}
              {isExpanded && showDetails && (
                <div className="px-3 pb-3 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {permissionGroups
                      .find(g => g.name === group.name)
                      ?.permissions.map((permission) => (
                      <PermissionIndicator
                        key={permission}
                        hasPermission={hasPermission(permission)}
                        permissionName={permission}
                        size="md"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Admin quick actions */}
      <PermissionGate permission="users:admin">
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            onClick={() => window.location.href = '/dashboard/users/roles'}
          >
            Manage User Permissions →
          </button>
        </div>
      </PermissionGate>
    </div>
  )
}

export default PermissionWidget
