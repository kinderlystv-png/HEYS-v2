// filepath: apps/web/src/lib/supabase/rls-policies.ts
/**
 * TypeScript типы и интерфейсы для работы с RLS политиками Supabase
 * Обеспечивает type-safe доступ к профилям пользователей и сессиям
 *
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

// Базовые типы для таблиц
export interface UserProfile {
  id: string;
  user_id: string;

  // Базовая информация
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  bio?: string;

  // Контактная информация (может быть зашифрована)
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    country?: string;
    postal_code?: string;
  };

  // Настройки профиля
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'auto';

  // Роли и разрешения
  role: 'user' | 'curator' | 'admin' | 'super_admin';
  permissions: string[];
  access_level: number;

  // Безопасность
  two_factor_enabled: boolean;
  two_factor_secret?: string | null;
  backup_codes?: string[] | null;
  security_questions?: Record<string, string>;

  // Активность
  last_login_at?: string;
  last_activity_at?: string;
  login_count: number;

  // Статус
  is_active: boolean;
  is_verified: boolean;
  is_suspended: boolean;
  suspension_reason?: string | null;
  suspension_until?: string | null;

  // Метаданные
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserPreference {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: unknown;
  description?: string;
  is_encrypted: boolean;
  is_sensitive: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;

  // Информация о сессии
  session_token: string;
  refresh_token?: string;
  device_id?: string;

  // Технические детали
  ip_address?: string;
  user_agent?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
  os?: string;

  // Геолокация
  country?: string;
  city?: string;
  coordinates?: [number, number]; // [lat, lng]

  // Статус и безопасность
  is_active: boolean;
  is_suspicious: boolean;
  security_flags: string[];

  // Временные метки
  created_at: string;
  last_activity_at: string;
  expires_at?: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  session_id?: string;

  // Действие
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout';
  resource_type: string;
  resource_id?: string | null;

  // Изменения
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;

  // Контекст
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;

  // Результат
  success: boolean;
  error_message?: string | null;
  response_time_ms?: number | null;

  created_at: string;
}

// Типы для создания и обновления
export type CreateUserProfile = Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>;
export type UpdateUserProfile = Partial<
  Omit<UserProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

export type CreateUserPreference = Omit<UserPreference, 'id' | 'created_at' | 'updated_at'>;
export type UpdateUserPreference = Partial<
  Omit<UserPreference, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

export type CreateUserSession = Omit<UserSession, 'id' | 'created_at' | 'last_activity_at'>;
export type UpdateUserSession = Partial<Omit<UserSession, 'id' | 'user_id' | 'created_at'>>;

// Enum для ролей и разрешений
export enum UserRole {
  USER = 'user',
  CURATOR = 'curator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum Permission {
  // Управление профилями
  MANAGE_PROFILES = 'manage_profiles',
  VIEW_ALL_PROFILES = 'view_all_profiles',

  // Управление сессиями
  MANAGE_SESSIONS = 'manage_sessions',
  VIEW_ALL_SESSIONS = 'view_all_sessions',

  // Безопасность
  VIEW_SECURITY_EVENTS = 'view_security_events',
  CREATE_SECURITY_EVENTS = 'create_security_events',
  MANAGE_SECURITY_EVENTS = 'manage_security_events',

  // Аудит
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  CREATE_AUDIT_LOGS = 'create_audit_logs',

  // Администрирование
  MANAGE_USERS = 'manage_users',
  SYSTEM_ADMIN = 'system_admin',
}

// Utility типы для проверки ролей
export type RolePermissions = {
  [UserRole.USER]: Permission[];
  [UserRole.CURATOR]: Permission[];
  [UserRole.ADMIN]: Permission[];
  [UserRole.SUPER_ADMIN]: Permission[];
};

// Стандартные разрешения для ролей
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  [UserRole.USER]: [],
  [UserRole.CURATOR]: [Permission.VIEW_ALL_PROFILES, Permission.MANAGE_SESSIONS],
  [UserRole.ADMIN]: [
    Permission.MANAGE_PROFILES,
    Permission.VIEW_ALL_PROFILES,
    Permission.MANAGE_SESSIONS,
    Permission.VIEW_ALL_SESSIONS,
    Permission.VIEW_SECURITY_EVENTS,
    Permission.CREATE_SECURITY_EVENTS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_USERS,
  ],
  [UserRole.SUPER_ADMIN]: Object.values(Permission),
};

// Типы для RLS функций
export interface RLSContext {
  user_id?: string;
  role?: UserRole;
  permissions?: Permission[];
  is_admin?: boolean;
}

// Database response типы
export interface DatabaseResponse<T> {
  data: T | null;
  error: Error | null;
  count?: number;
}

export interface DatabaseListResponse<T> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}

// Filter типы для запросов
export interface ProfileFilter {
  role?: UserRole;
  is_active?: boolean;
  is_verified?: boolean;
  is_suspended?: boolean;
  created_after?: string;
  created_before?: string;
  last_activity_after?: string;
  search?: string; // поиск по имени, email
}

export interface SessionFilter {
  user_id?: string;
  is_active?: boolean;
  is_suspicious?: boolean;
  device_type?: string;
  created_after?: string;
  expires_before?: string;
}

export interface AuditLogFilter {
  user_id?: string;
  action?: string;
  resource_type?: string;
  success?: boolean;
  created_after?: string;
  created_before?: string;
}

// Error типы
export class RLSError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RLSError';
  }
}

export class PermissionError extends RLSError {
  constructor(required_permission: Permission, current_role?: UserRole) {
    super(`Недостаточно прав доступа. Требуется: ${required_permission}`, 'PERMISSION_DENIED', {
      required_permission,
      current_role,
    });
    this.name = 'PermissionError';
  }
}

export class RoleError extends RLSError {
  constructor(required_role: UserRole, current_role?: UserRole) {
    super(`Недостаточный уровень роли. Требуется: ${required_role}`, 'ROLE_INSUFFICIENT', {
      required_role,
      current_role,
    });
    this.name = 'RoleError';
  }
}
