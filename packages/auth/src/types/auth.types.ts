// filepath: packages/auth/src/types/auth.types.ts

/**
 * Authentication and Authorization Types for EAP 3.0
 * Provides comprehensive type definitions for user management
 */

export interface User {
  id: string;
  email: string;
  username?: string;
  fullName?: string;
  avatar?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  
  // Profile information
  profile?: UserProfile;
  
  // Role and permissions
  roles: Role[];
  permissions: Permission[];
  
  // Security settings
  mfaEnabled: boolean;
  securityLevel: SecurityLevel;
}

export interface UserProfile {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  department?: string;
  position?: string;
  timezone: string;
  locale: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  notifications: NotificationSettings;
  dashboard: DashboardSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
  types: {
    security: boolean;
    system: boolean;
    reports: boolean;
    mentions: boolean;
  };
}

export interface DashboardSettings {
  layout: 'grid' | 'list';
  widgets: string[];
  refreshInterval: number;
  autoRefresh: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  level: number;
  permissions: Permission[];
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte';
  value: any;
}

export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
  sessionId: string;
  deviceInfo?: DeviceInfo;
}

export interface DeviceInfo {
  userAgent: string;
  ip: string;
  location?: {
    country: string;
    city: string;
    timezone: string;
  };
  isTrusted: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
  mfaCode?: string;
}

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  username?: string;
  acceptTerms: boolean;
  inviteCode?: string;
}

export interface PasswordResetRequest {
  email: string;
  captcha?: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface MfaSetupData {
  method: 'totp' | 'sms' | 'email';
  secret?: string;
  phoneNumber?: string;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryAfter?: number;
}

export interface AuthState {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AuthError | null;
  lastActivity: number;
}

// Events for auth system
export interface AuthEvents {
  'auth:login': { user: User; session: AuthSession };
  'auth:logout': { userId: string; reason: string };
  'auth:refresh': { session: AuthSession };
  'auth:error': { error: AuthError };
  'auth:session-expired': { userId: string };
  'auth:permission-denied': { userId: string; resource: string; action: string };
}

// Configuration types
export interface AuthConfig {
  apiEndpoint: string;
  tokenStorage: 'localStorage' | 'sessionStorage' | 'memory' | 'secure';
  refreshThreshold: number; // Minutes before expiry to refresh
  sessionTimeout: number; // Minutes of inactivity before logout
  maxLoginAttempts: number;
  lockoutDuration: number; // Minutes
  passwordRequirements: PasswordRequirements;
  mfaRequired: boolean;
  rememberMeEnabled: boolean;
  maxSessions: number;
}

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxLength?: number;
  prohibitCommonPasswords: boolean;
  prohibitPersonalInfo: boolean;
}

// API Response types
export interface AuthApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: AuthError;
  meta?: {
    timestamp: string;
    requestId: string;
    rateLimitRemaining?: number;
  };
}

export interface LoginResponse extends AuthApiResponse<{
  user: User;
  session: AuthSession;
  requiresMfa: boolean;
  mfaMethods?: string[];
}> {}

export interface RefreshResponse extends AuthApiResponse<{
  session: AuthSession;
}> {}

export interface UserResponse extends AuthApiResponse<{
  user: User;
}> {}

export interface RolesResponse extends AuthApiResponse<{
  roles: Role[];
  total: number;
}> {}

export interface PermissionsResponse extends AuthApiResponse<{
  permissions: Permission[];
  total: number;
}> {}

// Utility types
export type AuthAction = 
  | 'create'
  | 'read' 
  | 'update'
  | 'delete'
  | 'execute'
  | 'admin';

export type AuthResource = 
  | 'user'
  | 'role'
  | 'permission'
  | 'report'
  | 'dashboard'
  | 'analytics'
  | 'system'
  | 'audit';

export type UserStatus = 
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'pending'
  | 'locked';

// Type guards
export const isUser = (obj: any): obj is User => {
  return obj && typeof obj.id === 'string' && typeof obj.email === 'string';
};

export const isAuthError = (obj: any): obj is AuthError => {
  return obj && typeof obj.code === 'string' && typeof obj.message === 'string';
};

export const isValidSession = (session: AuthSession | null): session is AuthSession => {
  return session !== null && 
         session.expiresAt > Date.now() &&
         !!session.accessToken &&
         !!session.user;
};

// Permission checking utilities
export const hasPermission = (
  user: User | null, 
  resource: AuthResource, 
  action: AuthAction
): boolean => {
  if (!user) return false;
  
  return user.permissions.some(permission => 
    permission.resource === resource && 
    permission.action === action
  );
};

export const hasRole = (user: User | null, roleName: string): boolean => {
  if (!user) return false;
  
  return user.roles.some(role => role.name === roleName);
};

export const getHighestSecurityLevel = (user: User | null): SecurityLevel => {
  if (!user) return 'low';
  
  const levels: SecurityLevel[] = ['low', 'medium', 'high', 'critical'];
  const userLevel = user.securityLevel;
  const roleLevel = Math.max(...user.roles.map(role => role.level));
  
  return levels[Math.min(levels.indexOf(userLevel), roleLevel)] || 'low';
};

export default {
  isUser,
  isAuthError,
  isValidSession,
  hasPermission,
  hasRole,
  getHighestSecurityLevel,
};
