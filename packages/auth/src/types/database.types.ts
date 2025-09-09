// filepath: packages/auth/src/types/database.types.ts

/**
 * HEYS EAP 3.0 - Database Type Definitions
 * 
 * Purpose: Type-safe database schema definitions for Supabase
 * Generated from: Database schema in packages/auth/database/
 */

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile
        Insert: UserProfileInsert
        Update: UserProfileUpdate
      }
      roles: {
        Row: Role
        Insert: RoleInsert
        Update: RoleUpdate
      }
      permissions: {
        Row: Permission
        Insert: PermissionInsert
        Update: PermissionUpdate
      }
      role_permissions: {
        Row: RolePermission
        Insert: RolePermissionInsert
        Update: RolePermissionUpdate
      }
      user_roles: {
        Row: UserRole
        Insert: UserRoleInsert
        Update: UserRoleUpdate
      }
      user_permissions: {
        Row: UserPermission
        Insert: UserPermissionInsert
        Update: UserPermissionUpdate
      }
      user_sessions: {
        Row: UserSession
        Insert: UserSessionInsert
        Update: UserSessionUpdate
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { user_uuid?: string }
        Returns: string[]
      }
      user_has_permission: {
        Args: { permission_name: string; user_uuid?: string }
        Returns: boolean
      }
      user_has_role: {
        Args: { role_names: string[]; user_uuid?: string }
        Returns: boolean
      }
      is_admin: {
        Args: { user_uuid?: string }
        Returns: boolean
      }
      check_resource_access: {
        Args: {
          resource_name: string
          action_name: string
          resource_id?: string
          user_uuid?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      user_status: 'active' | 'inactive' | 'suspended' | 'pending_verification'
      security_level: 'basic' | 'elevated' | 'high' | 'maximum'
      session_status: 'active' | 'expired' | 'revoked'
    }
  }
}

// =====================================================================
// TABLE TYPE DEFINITIONS
// =====================================================================

export interface UserProfile {
  id: string // UUID
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  preferences: Record<string, unknown> | null // JSONB
  last_seen_at: string | null // timestamp
  status: Database['public']['Enums']['user_status']
  security_level: Database['public']['Enums']['security_level']
  email_verified: boolean
  phone_verified: boolean
  two_factor_enabled: boolean
  last_password_change: string | null // timestamp
  failed_login_attempts: number
  locked_until: string | null // timestamp
  created_at: string // timestamp
  updated_at: string // timestamp
}

export interface UserProfileInsert {
  id: string // Must match auth.users.id
  email: string
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  preferences?: Record<string, unknown> | null
  last_seen_at?: string | null
  status?: Database['public']['Enums']['user_status']
  security_level?: Database['public']['Enums']['security_level']
  email_verified?: boolean
  phone_verified?: boolean
  two_factor_enabled?: boolean
  last_password_change?: string | null
  failed_login_attempts?: number
  locked_until?: string | null
}

export interface UserProfileUpdate {
  email?: string
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  preferences?: Record<string, unknown> | null
  last_seen_at?: string | null
  status?: Database['public']['Enums']['user_status']
  security_level?: Database['public']['Enums']['security_level']
  email_verified?: boolean
  phone_verified?: boolean
  two_factor_enabled?: boolean
  last_password_change?: string | null
  failed_login_attempts?: number
  locked_until?: string | null
  updated_at?: string
}

export interface Role {
  id: string // UUID
  name: string
  description: string | null
  level: number
  is_system_role: boolean
  permissions_cache: Record<string, unknown> | null // JSONB
  created_at: string
  updated_at: string
}

export interface RoleInsert {
  id?: string
  name: string
  description?: string | null
  level: number
  is_system_role?: boolean
  permissions_cache?: Record<string, unknown> | null
}

export interface RoleUpdate {
  name?: string
  description?: string | null
  level?: number
  is_system_role?: boolean
  permissions_cache?: Record<string, unknown> | null
  updated_at?: string
}

export interface Permission {
  id: string // UUID
  name: string
  description: string | null
  resource: string
  action: string
  is_system_permission: boolean
  created_at: string
  updated_at: string
}

export interface PermissionInsert {
  id?: string
  name: string
  description?: string | null
  resource: string
  action: string
  is_system_permission?: boolean
}

export interface PermissionUpdate {
  name?: string
  description?: string | null
  resource?: string
  action?: string
  is_system_permission?: boolean
  updated_at?: string
}

export interface RolePermission {
  id: string // UUID
  role_id: string
  permission_id: string
  granted_at: string
  granted_by: string | null
}

export interface RolePermissionInsert {
  id?: string
  role_id: string
  permission_id: string
  granted_by?: string | null
}

export interface RolePermissionUpdate {
  role_id?: string
  permission_id?: string
  granted_by?: string | null
}

export interface UserRole {
  id: string // UUID
  user_id: string
  role_id: string
  is_active: boolean
  granted_at: string
  granted_by: string | null
  expires_at: string | null
}

export interface UserRoleInsert {
  id?: string
  user_id: string
  role_id: string
  is_active?: boolean
  granted_by?: string | null
  expires_at?: string | null
}

export interface UserRoleUpdate {
  user_id?: string
  role_id?: string
  is_active?: boolean
  granted_by?: string | null
  expires_at?: string | null
}

export interface UserPermission {
  id: string // UUID
  user_id: string
  permission_id: string
  granted: boolean
  granted_at: string
  granted_by: string | null
  expires_at: string | null
  reason: string | null
}

export interface UserPermissionInsert {
  id?: string
  user_id: string
  permission_id: string
  granted?: boolean
  granted_by?: string | null
  expires_at?: string | null
  reason?: string | null
}

export interface UserPermissionUpdate {
  user_id?: string
  permission_id?: string
  granted?: boolean
  granted_by?: string | null
  expires_at?: string | null
  reason?: string | null
}

export interface UserSession {
  id: string // UUID
  user_id: string
  session_token: string | null
  refresh_token: string | null
  device_info: Record<string, unknown> | null // JSONB
  ip_address: string | null
  user_agent: string | null
  status: Database['public']['Enums']['session_status']
  last_activity_at: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface UserSessionInsert {
  id?: string
  user_id: string
  session_token?: string | null
  refresh_token?: string | null
  device_info?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
  status?: Database['public']['Enums']['session_status']
  last_activity_at?: string
  expires_at?: string | null
}

export interface UserSessionUpdate {
  user_id?: string
  session_token?: string | null
  refresh_token?: string | null
  device_info?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
  status?: Database['public']['Enums']['session_status']
  last_activity_at?: string
  expires_at?: string | null
  updated_at?: string
}

// =====================================================================
// UTILITY TYPES
// =====================================================================

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

// Permission and role related types
export type PermissionName = string // Format: "resource:action"
export type RoleName = 'guest' | 'user' | 'verified_user' | 'content_creator' | 'moderator' | 'curator' | 'analyst' | 'editor' | 'admin' | 'super_admin'

// Helper types for common queries
export interface UserWithRoles extends UserProfile {
  user_roles: (UserRole & {
    roles: Role
  })[]
}

export interface UserWithPermissions extends UserProfile {
  user_permissions: (UserPermission & {
    permissions: Permission
  })[]
  user_roles: (UserRole & {
    roles: Role & {
      role_permissions: (RolePermission & {
        permissions: Permission
      })[]
    }
  })[]
}

export interface RoleWithPermissions extends Role {
  role_permissions: (RolePermission & {
    permissions: Permission
  })[]
}

// Real-time subscription payload types
export interface RealtimePayload<T = any> {
  commit_timestamp: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T | null
  old: T | null
  schema: string
  table: string
}

export type UserProfilePayload = RealtimePayload<UserProfile>
export type UserSessionPayload = RealtimePayload<UserSession>
export type UserRolePayload = RealtimePayload<UserRole>
