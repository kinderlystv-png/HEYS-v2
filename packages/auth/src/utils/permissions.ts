// filepath: packages/auth/src/utils/permissions.ts

/**
 * HEYS EAP 3.0 - Permission Constants & Utilities
 * 
 * Purpose: Centralized permission definitions and helper functions
 * Features: Type-safe permission constants, resource helpers
 */

// =====================================================================
// PERMISSION CONSTANTS
// =====================================================================

export const PERMISSIONS = {
  // User Management
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write', 
  USERS_DELETE: 'users:delete',
  USERS_ADMIN: 'users:admin',

  // Role Management  
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_ASSIGN: 'roles:assign',
  ROLES_ADMIN: 'roles:admin',

  // Content Management
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_DELETE: 'content:delete',
  CONTENT_PUBLISH: 'content:publish',
  CONTENT_MODERATE: 'content:moderate',

  // Reports & Analytics
  REPORTS_READ: 'reports:read',
  REPORTS_WRITE: 'reports:write',
  REPORTS_ADMIN: 'reports:admin',

  // Dashboard Access
  DASHBOARD_READ: 'dashboard:read',
  DASHBOARD_WRITE: 'dashboard:write',
  DASHBOARD_ADMIN: 'dashboard:admin',

  // System Administration
  SYSTEM_READ: 'system:read',
  SYSTEM_WRITE: 'system:write',
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_BACKUP: 'system:backup',
  SYSTEM_RESTORE: 'system:restore',

  // Audit & Security
  AUDIT_READ: 'audit:read',
  AUDIT_WRITE: 'audit:write',
  AUDIT_ADMIN: 'audit:admin',

  // API Access
  API_READ: 'api:read',
  API_WRITE: 'api:write',
  API_ADMIN: 'api:admin',
} as const

export type PermissionName = typeof PERMISSIONS[keyof typeof PERMISSIONS]

// =====================================================================
// RESOURCE DEFINITIONS
// =====================================================================

export const RESOURCES = {
  USERS: 'users',
  ROLES: 'roles', 
  CONTENT: 'content',
  REPORTS: 'reports',
  DASHBOARD: 'dashboard',
  SYSTEM: 'system',
  AUDIT: 'audit',
  API: 'api',
} as const

export type ResourceName = typeof RESOURCES[keyof typeof RESOURCES]

// =====================================================================
// ACTION DEFINITIONS
// =====================================================================

export const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ADMIN: 'admin',
  ASSIGN: 'assign',
  PUBLISH: 'publish',
  MODERATE: 'moderate',
  BACKUP: 'backup',
  RESTORE: 'restore',
} as const

export type ActionName = typeof ACTIONS[keyof typeof ACTIONS]

// =====================================================================
// PERMISSION GROUPS
// =====================================================================

export const PERMISSION_GROUPS = {
  USER_MANAGEMENT: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_ADMIN,
  ],

  ROLE_MANAGEMENT: [
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_WRITE, 
    PERMISSIONS.ROLES_ASSIGN,
    PERMISSIONS.ROLES_ADMIN,
  ],

  CONTENT_MANAGEMENT: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.CONTENT_DELETE,
    PERMISSIONS.CONTENT_PUBLISH,
    PERMISSIONS.CONTENT_MODERATE,
  ],

  ANALYTICS: [
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_WRITE,
    PERMISSIONS.REPORTS_ADMIN,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.DASHBOARD_WRITE,
    PERMISSIONS.DASHBOARD_ADMIN,
  ],

  SYSTEM_ADMIN: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.SYSTEM_WRITE,
    PERMISSIONS.SYSTEM_ADMIN,
    PERMISSIONS.SYSTEM_BACKUP,
    PERMISSIONS.SYSTEM_RESTORE,
  ],

  SECURITY: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_WRITE,
    PERMISSIONS.AUDIT_ADMIN,
  ],

  API_ACCESS: [
    PERMISSIONS.API_READ,
    PERMISSIONS.API_WRITE,
    PERMISSIONS.API_ADMIN,
  ],
} as const

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Build permission name from resource and action
 */
export function buildPermission(resource: ResourceName, action: ActionName): PermissionName {
  return `${resource}:${action}` as PermissionName
}

/**
 * Parse permission name into resource and action
 */
export function parsePermission(permission: PermissionName): {
  resource: ResourceName
  action: ActionName
} {
  const [resource, action] = permission.split(':') as [ResourceName, ActionName]
  return { resource, action }
}

/**
 * Check if permission matches pattern
 */
export function matchesPermissionPattern(
  permission: PermissionName,
  pattern: string
): boolean {
  // Support wildcards like "users:*" or "*:read"
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*') + '$'
  )
  return regex.test(permission)
}

/**
 * Get all permissions for a resource
 */
export function getResourcePermissions(resource: ResourceName): PermissionName[] {
  return Object.values(PERMISSIONS).filter(permission => 
    permission.startsWith(`${resource}:`)
  )
}

/**
 * Get all permissions for an action across resources
 */
export function getActionPermissions(action: ActionName): PermissionName[] {
  return Object.values(PERMISSIONS).filter(permission => 
    permission.endsWith(`:${action}`)
  )
}

/**
 * Check if permission is admin-level
 */
export function isAdminPermission(permission: PermissionName): boolean {
  return permission.endsWith(':admin') || 
         permission.includes('system:') ||
         permission.includes('audit:')
}

/**
 * Check if permission is read-only
 */
export function isReadOnlyPermission(permission: PermissionName): boolean {
  return permission.endsWith(':read')
}

/**
 * Get permission hierarchy level (0-10, higher = more privileged)
 */
export function getPermissionLevel(permission: PermissionName): number {
  const { action } = parsePermission(permission)
  
  switch (action) {
    case ACTIONS.READ: return 1
    case ACTIONS.WRITE: return 3
    case ACTIONS.DELETE: return 5
    case ACTIONS.PUBLISH: return 4
    case ACTIONS.MODERATE: return 4
    case ACTIONS.ASSIGN: return 6
    case ACTIONS.BACKUP: return 7
    case ACTIONS.RESTORE: return 8
    case ACTIONS.ADMIN: return 10
    default: return 0
  }
}

/**
 * Sort permissions by hierarchy level
 */
export function sortPermissionsByLevel(permissions: PermissionName[]): PermissionName[] {
  return permissions.sort((a, b) => getPermissionLevel(a) - getPermissionLevel(b))
}

/**
 * Get human-readable permission description
 */
export function getPermissionDescription(permission: PermissionName): string {
  const { resource, action } = parsePermission(permission)
  
  const resourceLabels: Record<ResourceName, string> = {
    users: 'User Management',
    roles: 'Role Management',
    content: 'Content Management', 
    reports: 'Reports & Analytics',
    dashboard: 'Dashboard',
    system: 'System Administration',
    audit: 'Security & Audit',
    api: 'API Access',
  }

  const actionLabels: Record<ActionName, string> = {
    read: 'View',
    write: 'Create/Edit',
    delete: 'Delete',
    admin: 'Full Administration',
    assign: 'Assign/Manage',
    publish: 'Publish',
    moderate: 'Moderate',
    backup: 'Backup',
    restore: 'Restore',
  }

  const resourceLabel = resourceLabels[resource] || resource
  const actionLabel = actionLabels[action] || action

  return `${resourceLabel}: ${actionLabel}`
}

/**
 * Get suggested permissions for role level
 */
export function getSuggestedPermissions(roleLevel: number): PermissionName[] {
  const suggestions: PermissionName[] = []

  // Basic read permissions for all authenticated users (level 10+)
  if (roleLevel >= 10) {
    suggestions.push(
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.CONTENT_READ
    )
  }

  // Content creation permissions (level 30+)
  if (roleLevel >= 30) {
    suggestions.push(
      PERMISSIONS.CONTENT_WRITE
    )
  }

  // Moderation permissions (level 40+) 
  if (roleLevel >= 40) {
    suggestions.push(
      PERMISSIONS.CONTENT_MODERATE,
      PERMISSIONS.USERS_READ
    )
  }

  // Content management permissions (level 50+)
  if (roleLevel >= 50) {
    suggestions.push(
      PERMISSIONS.CONTENT_DELETE,
      PERMISSIONS.CONTENT_PUBLISH
    )
  }

  // Analytics permissions (level 60+)
  if (roleLevel >= 60) {
    suggestions.push(
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.DASHBOARD_WRITE
    )
  }

  // User management permissions (level 70+)
  if (roleLevel >= 70) {
    suggestions.push(
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.REPORTS_WRITE
    )
  }

  // Administrative permissions (level 80+)
  if (roleLevel >= 80) {
    suggestions.push(
      PERMISSIONS.USERS_ADMIN,
      PERMISSIONS.ROLES_WRITE,
      PERMISSIONS.ROLES_ASSIGN,
      PERMISSIONS.REPORTS_ADMIN,
      PERMISSIONS.DASHBOARD_ADMIN,
      PERMISSIONS.AUDIT_READ
    )
  }

  // System administration permissions (level 90+)
  if (roleLevel >= 90) {
    suggestions.push(
      PERMISSIONS.SYSTEM_READ,
      PERMISSIONS.SYSTEM_WRITE,
      PERMISSIONS.SYSTEM_ADMIN,
      PERMISSIONS.AUDIT_WRITE,
      PERMISSIONS.AUDIT_ADMIN,
      PERMISSIONS.API_ADMIN
    )
  }

  return suggestions
}

/**
 * Validate permission name format
 */
export function isValidPermission(permission: string): permission is PermissionName {
  return Object.values(PERMISSIONS).includes(permission as PermissionName)
}

/**
 * Get all available permissions
 */
export function getAllPermissions(): PermissionName[] {
  return Object.values(PERMISSIONS)
}

/**
 * Get permissions by group
 */
export function getPermissionsByGroup(group: keyof typeof PERMISSION_GROUPS): PermissionName[] {
  return PERMISSION_GROUPS[group]
}

export default {
  PERMISSIONS,
  RESOURCES,
  ACTIONS,
  PERMISSION_GROUPS,
  buildPermission,
  parsePermission,
  matchesPermissionPattern,
  getResourcePermissions,
  getActionPermissions,
  isAdminPermission,
  isReadOnlyPermission,
  getPermissionLevel,
  sortPermissionsByLevel,
  getPermissionDescription,
  getSuggestedPermissions,
  isValidPermission,
  getAllPermissions,
  getPermissionsByGroup,
}
