// filepath: packages/auth/src/hooks/useAuth.ts

/**
 * React hooks for authentication state management
 * Modern hooks-based approach for EAP 3.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import { AuthService } from '../services/AuthService';
import type {
  User,
  AuthSession,
  LoginCredentials,
  SignupData,
  PasswordResetRequest,
  PasswordResetConfirm,
  AuthConfig,
  LoginResponse,
  AuthApiResponse,
  RefreshResponse,
  Permission,
  Role,
} from '../types/auth.types';

export interface UseAuthReturn {
  // State
  user: User | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: (reason?: string) => Promise<void>;
  signup: (data: SignupData) => Promise<AuthApiResponse<{ user: User }>>;
  requestPasswordReset: (request: PasswordResetRequest) => Promise<AuthApiResponse>;
  confirmPasswordReset: (confirm: PasswordResetConfirm) => Promise<AuthApiResponse>;
  refreshToken: () => Promise<RefreshResponse>;
  clearError: () => void;

  // Utilities
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  getDisplayName: () => string;
}

export interface UseAuthOptions {
  autoRefresh?: boolean;
  onLogin?: (user: User, session: AuthSession) => void;
  onLogout?: (userId: string, reason: string) => void;
  onError?: (error: string) => void;
  onSessionExpired?: (userId: string) => void;
}

let authServiceInstance: AuthService | null = null;

/**
 * Initialize auth service with configuration
 */
export function initializeAuth(config: AuthConfig): void {
  if (authServiceInstance) {
    authServiceInstance.destroy();
  }
  authServiceInstance = new AuthService(config);
}

/**
 * Get the current auth service instance
 */
export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    throw new Error('Auth service not initialized. Call initializeAuth() first.');
  }
  return authServiceInstance;
}

/**
 * Main authentication hook
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    autoRefresh = true,
    onLogin,
    onLogout,
    onError,
    onSessionExpired,
  } = options;

  // State
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for stable callbacks
  const onLoginRef = useRef(onLogin);
  const onLogoutRef = useRef(onLogout);
  const onErrorRef = useRef(onError);
  const onSessionExpiredRef = useRef(onSessionExpired);

  // Update refs when callbacks change
  useEffect(() => {
    onLoginRef.current = onLogin;
    onLogoutRef.current = onLogout;
    onErrorRef.current = onError;
    onSessionExpiredRef.current = onSessionExpired;
  }, [onLogin, onLogout, onError, onSessionExpired]);

  // Get auth service
  const authService = getAuthService();

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuthState = async () => {
      try {
        setIsLoading(true);
        
        // Try to restore existing session
        const currentUser = await authService.getCurrentUser();
        const currentSession = await authService.getCurrentSession();

        if (mounted) {
          setUser(currentUser);
          setSession(currentSession);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize auth';
          setError(errorMessage);
          setIsLoading(false);
          onErrorRef.current?.(errorMessage);
        }
      }
    };

    initializeAuthState();

    return () => {
      mounted = false;
    };
  }, [authService]);

  // Set up event listeners
  useEffect(() => {
    const handleLogin = (...args: unknown[]) => {
      const data = args[0] as { user: User; session: AuthSession };
      setUser(data.user);
      setSession(data.session);
      setError(null);
      onLoginRef.current?.(data.user, data.session);
    };

    const handleLogout = (...args: unknown[]) => {
      const data = args[0] as { userId: string; reason: string };
      setUser(null);
      setSession(null);
      setError(null);
      onLogoutRef.current?.(data.userId, data.reason);
    };

    const handleRefresh = (...args: unknown[]) => {
      const data = args[0] as { session: AuthSession };
      setSession(data.session);
      setUser(data.session.user);
    };

    const handleError = (...args: unknown[]) => {
      const data = args[0] as { error: { message: string } };
      const errorMessage = data.error.message;
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
    };

    const handleSessionExpired = (...args: unknown[]) => {
      const data = args[0] as { userId: string };
      setUser(null);
      setSession(null);
      onSessionExpiredRef.current?.(data.userId);
    };

    // Register event listeners
    authService.on('auth:login', handleLogin);
    authService.on('auth:logout', handleLogout);
    authService.on('auth:refresh', handleRefresh);
    authService.on('auth:error', handleError);
    authService.on('auth:session-expired', handleSessionExpired);

    return () => {
      // Cleanup event listeners
      authService.off('auth:login', handleLogin);
      authService.off('auth:logout', handleLogout);
      authService.off('auth:refresh', handleRefresh);
      authService.off('auth:error', handleError);
      authService.off('auth:session-expired', handleSessionExpired);
    };
  }, [authService]);

  // Auto refresh token
  useEffect(() => {
    if (!autoRefresh || !session) return;

    const refreshTime = session.expiresAt - Date.now() - (15 * 60 * 1000); // 15 minutes before expiry
    
    if (refreshTime <= 0) return;

    const refreshTimer = setTimeout(async () => {
      try {
        await authService.refreshToken();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to refresh token';
        setError(errorMessage);
        onErrorRef.current?.(errorMessage);
      }
    }, refreshTime);

    return () => clearTimeout(refreshTimer);
  }, [authService, session, autoRefresh]);

  // Actions
  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResponse> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.login(credentials);
      
      if (!result.success && result.error) {
        setError(result.error.message);
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      setIsLoading(false);
      
      return {
        success: false,
        error: {
          code: 'login_error',
          message: errorMessage,
        },
      };
    }
  }, [authService]);

  const logout = useCallback(async (reason: string = 'user_action'): Promise<void> => {
    try {
      setIsLoading(true);
      await authService.logout(reason);
      setIsLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      setError(errorMessage);
      setIsLoading(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [authService]);

  const signup = useCallback(async (data: SignupData): Promise<AuthApiResponse<{ user: User }>> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.signup(data);
      
      if (!result.success && result.error) {
        setError(result.error.message);
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      setError(errorMessage);
      setIsLoading(false);
      
      return {
        success: false,
        error: {
          code: 'signup_error',
          message: errorMessage,
        },
      };
    }
  }, [authService]);

  const requestPasswordReset = useCallback(async (request: PasswordResetRequest): Promise<AuthApiResponse> => {
    try {
      setError(null);
      const result = await authService.requestPasswordReset(request);
      
      if (!result.success && result.error) {
        setError(result.error.message);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Password reset request failed';
      setError(errorMessage);
      
      return {
        success: false,
        error: {
          code: 'password_reset_error',
          message: errorMessage,
        },
      };
    }
  }, [authService]);

  const confirmPasswordReset = useCallback(async (confirm: PasswordResetConfirm): Promise<AuthApiResponse> => {
    try {
      setError(null);
      const result = await authService.confirmPasswordReset(confirm);
      
      if (!result.success && result.error) {
        setError(result.error.message);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Password reset failed';
      setError(errorMessage);
      
      return {
        success: false,
        error: {
          code: 'password_reset_confirm_error',
          message: errorMessage,
        },
      };
    }
  }, [authService]);

  const refreshToken = useCallback(async (): Promise<RefreshResponse> => {
    try {
      const result = await authService.refreshToken();
      
      if (!result.success && result.error) {
        setError(result.error.message);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Token refresh failed';
      setError(errorMessage);
      
      return {
        success: false,
        error: {
          code: 'refresh_error',
          message: errorMessage,
        },
      };
    }
  }, [authService]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Utilities
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.some((p: Permission) => p.name === permission);
  }, [user]);

  const hasRole = useCallback((role: string): boolean => {
    if (!user || !user.roles) return false;
    return user.roles.some((r: Role) => r.name === role);
  }, [user]);

  const getDisplayName = useCallback((): string => {
    if (!user) return 'Guest';
    return user.fullName || user.username || user.email.split('@')[0] || 'User';
  }, [user]);

  return {
    // State
    user,
    session,
    isAuthenticated: !!user && !!session,
    isLoading,
    error,

    // Actions
    login,
    logout,
    signup,
    requestPasswordReset,
    confirmPasswordReset,
    refreshToken,
    clearError,

    // Utilities
    hasPermission,
    hasRole,
    getDisplayName,
  };
}

/**
 * Hook for checking if user has specific permission
 */
export function usePermission(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

/**
 * Hook for checking if user has specific role
 */
export function useRole(role: string): boolean {
  const { hasRole } = useAuth();
  return hasRole(role);
}

/**
 * Hook for getting current user's display name
 */
export function useDisplayName(): string {
  const { getDisplayName } = useAuth();
  return getDisplayName();
}

/**
 * Hook for authentication loading state
 */
export function useAuthLoading(): boolean {
  const { isLoading } = useAuth();
  return isLoading;
}

/**
 * Hook for authentication error state
 */
export function useAuthError(): { error: string | null; clearError: () => void } {
  const { error, clearError } = useAuth();
  return { error, clearError };
}
