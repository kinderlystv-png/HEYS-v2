// filepath: packages/auth/src/utils/roles.ts

/**
 * HEYS EAP 3.0 - Role Constants & Utilities
 * 
 * Purpose: Centralized role definitions and helper functions
 * Features: Type-safe role constants, hierarchy management
 */

import { PERMISSIONS, getSuggestedPermissions, type PermissionName } from './permissions'

// =====================================================================
// ROLE CONSTANTS
// =====================================================================

export const ROLES = {
  GUEST: 'guest',
  USER: 'user', 
  VERIFIED_USER: 'verified_user',
  CONTENT_CREATOR: 'content_creator',
  MODERATOR: 'moderator',
  CURATOR: 'curator',
  ANALYST: 'analyst',
  EDITOR: 'editor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const

export type RoleName = typeof ROLES[keyof typeof ROLES]

// =====================================================================
// ROLE HIERARCHY DEFINITIONS
// =====================================================================

export interface RoleDefinition {
  name: RoleName
  level: number
  displayName: string
  description: string
  color: string
  icon: string
  isSystemRole: boolean
  defaultPermissions: PermissionName[]
  inheritsFrom?: RoleName[]
}

export const ROLE_DEFINITIONS: Record<RoleName, RoleDefinition> = {
  [ROLES.GUEST]: {
    name: ROLES.GUEST,
    level: 0,
    displayName: 'Guest',
    description: 'Unauthenticated user with basic read access',
    color: '#6B7280',
    icon: 'UserIcon',
    isSystemRole: true,
    defaultPermissions: [
      PERMISSIONS.CONTENT_READ,
    ],
  },

  [ROLES.USER]: {
    name: ROLES.USER,
    level: 10,
    displayName: 'User',
    description: 'Standard authenticated user',
    color: '#10B981',
    icon: 'UserIcon',
    isSystemRole: true,
    defaultPermissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.CONTENT_READ,
    ],
    inheritsFrom: [ROLES.GUEST],
  },

  [ROLES.VERIFIED_USER]: {
    name: ROLES.VERIFIED_USER,
    level: 20,
    displayName: 'Verified User',
    description: 'Email-verified user with enhanced access',
    color: '#3B82F6',
    icon: 'CheckBadgeIcon',
    isSystemRole: true,
    defaultPermissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.CONTENT_READ,
      PERMISSIONS.REPORTS_READ,
    ],
    inheritsFrom: [ROLES.USER],
  },

  [ROLES.CONTENT_CREATOR]: {
    name: ROLES.CONTENT_CREATOR,
    level: 30,
    displayName: 'Content Creator',
    description: 'User with content creation privileges',
    color: '#8B5CF6',
    icon: 'PencilIcon',
    isSystemRole: false,
    defaultPermissions: [
      PERMISSIONS.CONTENT_WRITE,
    ],
    inheritsFrom: [ROLES.VERIFIED_USER],
  },

  [ROLES.MODERATOR]: {
    name: ROLES.MODERATOR,
    level: 40,
    displayName: 'Moderator',
    description: 'Content moderation and user management',
    color: '#F59E0B',
    icon: 'ShieldCheckIcon',
    isSystemRole: false,
    defaultPermissions: [
      PERMISSIONS.CONTENT_MODERATE,
      PERMISSIONS.USERS_READ,
    ],
    inheritsFrom: [ROLES.CONTENT_CREATOR],
  },

  [ROLES.CURATOR]: {
    name: ROLES.CURATOR,
    level: 50,
    displayName: 'Curator',
    description: 'Content curation and publishing rights',
    color: '#EF4444',
    icon: 'CursorArrowRaysIcon',
    isSystemRole: false,
    defaultPermissions: [
      PERMISSIONS.CONTENT_DELETE,
      PERMISSIONS.CONTENT_PUBLISH,
    ],
    inheritsFrom: [ROLES.MODERATOR],
  },

  [ROLES.ANALYST]: {
    name: ROLES.ANALYST,
    level: 60,
    displayName: 'Analyst',
    description: 'Analytics and reporting access',
    color: '#06B6D4',
    icon: 'ChartBarIcon',
    isSystemRole: false,
    defaultPermissions: [
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_WRITE,
      PERMISSIONS.DASHBOARD_WRITE,
    ],
    inheritsFrom: [ROLES.VERIFIED_USER],
  },

  [ROLES.EDITOR]: {
    name: ROLES.EDITOR,
    level: 70,
    displayName: 'Editor',
    description: 'Editorial control and user management',
    color: '#DC2626',
    icon: 'DocumentTextIcon',
    isSystemRole: false,
    defaultPermissions: [
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.ROLES_READ,
    ],
    inheritsFrom: [ROLES.CURATOR, ROLES.ANALYST],
  },

  [ROLES.ADMIN]: {
    name: ROLES.ADMIN,
    level: 80,
    displayName: 'Administrator',
    description: 'System administration and user management',
    color: '#7C2D12',
    icon: 'CogIcon',
    isSystemRole: true,
    defaultPermissions: [
      PERMISSIONS.USERS_ADMIN,
      PERMISSIONS.ROLES_WRITE,
      PERMISSIONS.ROLES_ASSIGN,
      PERMISSIONS.REPORTS_ADMIN,
      PERMISSIONS.DASHBOARD_ADMIN,
      PERMISSIONS.AUDIT_READ,
    ],
    inheritsFrom: [ROLES.EDITOR],
  },

  [ROLES.SUPER_ADMIN]: {
    name: ROLES.SUPER_ADMIN,
    level: 90,
    displayName: 'Super Administrator',
    description: 'Full system access and control',
    color: '#1F2937',
    icon: 'CommandLineIcon',
    isSystemRole: true,
    defaultPermissions: [
      PERMISSIONS.SYSTEM_READ,
      PERMISSIONS.SYSTEM_WRITE,
      PERMISSIONS.SYSTEM_ADMIN,
      PERMISSIONS.AUDIT_WRITE,
      PERMISSIONS.AUDIT_ADMIN,
      PERMISSIONS.API_ADMIN,
    ],
    inheritsFrom: [ROLES.ADMIN],
  },
}

// =====================================================================
// ROLE GROUPS
// =====================================================================

export const ROLE_GROUPS = {
  BASIC: [ROLES.GUEST, ROLES.USER, ROLES.VERIFIED_USER],
  CONTENT: [ROLES.CONTENT_CREATOR, ROLES.MODERATOR, ROLES.CURATOR, ROLES.EDITOR],
  ANALYTICS: [ROLES.ANALYST],
  ADMINISTRATIVE: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  SYSTEM: [ROLES.GUEST, ROLES.USER, ROLES.VERIFIED_USER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
} as const

// =====================================================================
// UTILITY FUNCTIONS  
// =====================================================================

/**
 * Get role definition by name
 */
export function getRoleDefinition(roleName: RoleName): RoleDefinition {
  return ROLE_DEFINITIONS[roleName]
}

/**
 * Check if role exists
 */
export function isValidRole(roleName: string): roleName is RoleName {
  return Object.values(ROLES).includes(roleName as RoleName)
}

/**
 * Get roles sorted by hierarchy level
 */
export function getRolesByLevel(): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS).sort((a, b) => a.level - b.level)
}

/**
 * Get roles at or below specified level
 */
export function getRolesAtOrBelowLevel(maxLevel: number): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS)
    .filter(role => role.level <= maxLevel)
    .sort((a, b) => a.level - b.level)
}

/**
 * Get roles at or above specified level
 */
export function getRolesAtOrAboveLevel(minLevel: number): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS)
    .filter(role => role.level >= minLevel)
    .sort((a, b) => a.level - b.level)
}

/**
 * Get role level by name
 */
export function getRoleLevel(roleName: RoleName): number {
  return ROLE_DEFINITIONS[roleName].level
}

/**
 * Get role hierarchy as sorted array
 */
export function getRoleHierarchy(): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS).sort((a, b) => a.level - b.level)
}

/**
 * Check if user role can assign target role
 */
export function canAssignRole(userRoleLevel: number, targetRoleLevel: number): boolean {
  // Users can only assign roles at lower levels than their own
  // Exception: Super admins can assign any role
  return userRoleLevel >= 90 || userRoleLevel > targetRoleLevel
}

/**
 * Check if role A has higher privilege than role B
 */
export function isHigherRole(roleA: RoleName, roleB: RoleName): boolean {
  const levelA = ROLE_DEFINITIONS[roleA].level
  const levelB = ROLE_DEFINITIONS[roleB].level
  return levelA > levelB
}

/**
 * Check if role A has equal or higher privilege than role B
 */
export function isEqualOrHigherRole(roleA: RoleName, roleB: RoleName): boolean {
  const levelA = ROLE_DEFINITIONS[roleA].level
  const levelB = ROLE_DEFINITIONS[roleB].level
  return levelA >= levelB
}

/**
 * Get the highest role from a list of roles
 */
export function getHighestRole(roles: RoleName[]): RoleName | null {
  if (roles.length === 0) return null
  
  return roles.reduce((highest, current) => {
    return isHigherRole(current, highest) ? current : highest
  })
}

/**
 * Get inherited permissions for role (including from parent roles)
 */
export function getInheritedPermissions(roleName: RoleName): PermissionName[] {
  const role = ROLE_DEFINITIONS[roleName]
  const allPermissions = new Set<PermissionName>(role.defaultPermissions)

  // Recursively add permissions from inherited roles
  function addInheritedPermissions(currentRole: RoleDefinition) {
    if (currentRole.inheritsFrom) {
      for (const parentRoleName of currentRole.inheritsFrom) {
        const parentRole = ROLE_DEFINITIONS[parentRoleName]
        
        // Add parent's direct permissions
        parentRole.defaultPermissions.forEach(permission => {
          allPermissions.add(permission)
        })
        
        // Recursively add parent's inherited permissions
        addInheritedPermissions(parentRole)
      }
    }
  }

  addInheritedPermissions(role)
  return Array.from(allPermissions)
}

/**
 * Get effective permissions for role (including suggested based on level)
 */
export function getEffectivePermissions(roleName: RoleName): PermissionName[] {
  const inherited = getInheritedPermissions(roleName)
  const suggested = getSuggestedPermissions(ROLE_DEFINITIONS[roleName].level)
  
  // Combine and deduplicate
  const allPermissions = new Set([...inherited, ...suggested])
  return Array.from(allPermissions)
}

/**
 * Check if role is a system role
 */
export function isSystemRole(roleName: RoleName): boolean {
  return ROLE_DEFINITIONS[roleName].isSystemRole
}

/**
 * Get assignable roles for user (roles they can assign to others)
 */
export function getAssignableRoles(userRoleLevel: number): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS).filter(role => 
    canAssignRole(userRoleLevel, role.level)
  )
}

/**
 * Get role upgrade path (next possible roles)
 */
export function getUpgradePath(currentRoleName: RoleName): RoleDefinition[] {
  const currentLevel = ROLE_DEFINITIONS[currentRoleName].level
  
  return Object.values(ROLE_DEFINITIONS)
    .filter(role => role.level > currentLevel && role.level <= currentLevel + 20)
    .sort((a, b) => a.level - b.level)
}

/**
 * Get role downgrade options
 */
export function getDowngradeOptions(currentRoleName: RoleName): RoleDefinition[] {
  const currentLevel = ROLE_DEFINITIONS[currentRoleName].level
  
  return Object.values(ROLE_DEFINITIONS)
    .filter(role => role.level < currentLevel)
    .sort((a, b) => b.level - a.level)
}

/**
 * Get role color for UI display
 */
export function getRoleColor(roleName: RoleName): string {
  return ROLE_DEFINITIONS[roleName].color
}

/**
 * Get role icon for UI display
 */
export function getRoleIcon(roleName: RoleName): string {
  return ROLE_DEFINITIONS[roleName].icon
}

/**
 * Get human-readable role description
 */
export function getRoleDescription(roleName: RoleName): string {
  return ROLE_DEFINITIONS[roleName].description
}

/**
 * Get role display name
 */
export function getRoleDisplayName(roleName: RoleName): string {
  return ROLE_DEFINITIONS[roleName].displayName
}

/**
 * Check if role requires verification
 */
export function requiresVerification(roleName: RoleName): boolean {
  return ROLE_DEFINITIONS[roleName].level >= 20
}

/**
 * Get minimum role for permission
 */
export function getMinimumRoleForPermission(permission: PermissionName): RoleName | null {
  const rolesWithPermission = Object.values(ROLE_DEFINITIONS)
    .filter(role => getEffectivePermissions(role.name).includes(permission))
    .sort((a, b) => a.level - b.level)
  
  return rolesWithPermission.length > 0 ? rolesWithPermission[0].name : null
}

/**
 * Get all available roles
 */
export function getAllRoles(): RoleName[] {
  return Object.values(ROLES)
}

/**
 * Get roles by group
 */
export function getRolesByGroup(group: keyof typeof ROLE_GROUPS): RoleName[] {
  return [...ROLE_GROUPS[group]]
}

/**
 * Format role for display
 */
export function formatRoleForDisplay(roleName: RoleName): {
  name: RoleName
  displayName: string
  level: number
  color: string
  icon: string
  description: string
} {
  const role = ROLE_DEFINITIONS[roleName]
  return {
    name: role.name,
    displayName: role.displayName,
    level: role.level,
    color: role.color,
    icon: role.icon,
    description: role.description,
  }
}

export default {
  ROLES,
  ROLE_DEFINITIONS,
  ROLE_GROUPS,
  getRoleDefinition,
  isValidRole,
  getRolesByLevel,
  getRolesAtOrBelowLevel,
  getRolesAtOrAboveLevel,
  canAssignRole,
  isHigherRole,
  isEqualOrHigherRole,
  getHighestRole,
  getInheritedPermissions,
  getEffectivePermissions,
  isSystemRole,
  getAssignableRoles,
  getUpgradePath,
  getDowngradeOptions,
  getRoleColor,
  getRoleIcon,
  getRoleDescription,
  getRoleDisplayName,
  requiresVerification,
  getMinimumRoleForPermission,
  getAllRoles,
  getRolesByGroup,
  formatRoleForDisplay,
}
