// filepath: packages/auth/src/index.ts

/**
 * HEYS Authentication Package - EAP 3.0
 * Modern authentication and authorization system with real Supabase integration
 */

// Types
export * from './types/auth.types'

// Core Services
export { AuthService, default as AuthServiceDefault } from './services/AuthService'
export { RealAuthService } from './services/RealAuthService'
export { permissionService, PermissionService } from './services/PermissionService'

// React Hooks
export * from './hooks/useAuth'
export { usePermissions, usePermissionCheck, usePermissionChecks, useResourcePermission, useAdminPermissions } from './hooks/usePermissions'
export { useRoles, useRoleAssignment, useRoleChecks, useRoleHierarchy } from './hooks/useRoles'

// React Components - Route Protection
export {
  RouterProtectedRoute as ProtectedRoute,
  type RouterProtectedRouteProps as ProtectedRouteProps,
} from './components/RouterProtectedRoute'

// React Components - Guards
export {
  AuthGuard,
  ProtectedGuard,
  GuestGuard,
  ConditionalGuard,
} from './components/AuthGuard'

// React Components - Permission & Role Gates
export {
  PermissionGate,
  RequireAllPermissions,
  RequireAnyPermission,
  HideIfPermissions,
  PermissionCheck,
  withPermission,
  PermissionRender,
} from './components/PermissionGate'

export {
  RoleGate,
  RequireAllRoles,
  RequireAnyRole,
  HideIfRoles,
  AdminGate,
  ModeratorGate,
  UserGate,
} from './components/RoleGate'

// User Management Components
export { UserRoleManager } from './components/UserRoleManager'

// React Context
export {
  AuthProvider,
  useAuthContext,
  type AuthProviderProps,
  type AuthContextValue,
  type AuthState,
  type AuthActions,
} from './contexts/AuthContext'

// Utilities and Constants
export { PERMISSIONS, PERMISSION_GROUPS, type PermissionName } from './utils/permissions'
export { ROLE_DEFINITIONS, canAssignRole, getHighestRole, type RoleName } from './utils/roles'

// Permission Service Types
export type { PermissionCheck, UserPermissions, UserRole } from './services/PermissionService'

// Re-export commonly used types for convenience
export type {
  User,
  AuthSession,
  LoginCredentials,
  SignupData,
  AuthConfig,
  AuthError,
  LoginResponse,
  AuthApiResponse,
} from './types/auth.types'

// Import for internal use
import type { AuthConfig } from './types/auth.types'

// Default configuration
export const defaultAuthConfig: Partial<AuthConfig> = {
  tokenStorage: 'localStorage',
  refreshThreshold: 15, // 15 minutes before expiry
  sessionTimeout: 24 * 60, // 24 hours
  maxLoginAttempts: 5,
  lockoutDuration: 30, // 30 minutes
  passwordRequirements: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    maxLength: 128,
    prohibitCommonPasswords: true,
    prohibitPersonalInfo: true,
  },
  mfaRequired: false,
  rememberMeEnabled: true,
  maxSessions: 5,
}

// Version
export const version = '1.0.0'
