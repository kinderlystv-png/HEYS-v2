// filepath: packages/auth/src/contexts/AuthContext.tsx

import React, { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  ReactNode,
  useMemo,
  useCallback 
} from 'react';

import { AuthService } from '../services/AuthService';
import { User, AuthSession, LoginCredentials, SignupData } from '../types/auth.types';

/**
 * Интерфейс для состояния аутентификации
 */
export interface AuthState {
  /** Текущий пользователь */
  user: User | null;
  /** Текущая сессия */
  session: AuthSession | null;
  /** Статус аутентификации */
  isAuthenticated: boolean;
  /** Статус загрузки */
  isLoading: boolean;
  /** Ошибка аутентификации */
  error: string | null;
  /** Статус инициализации */
  isInitialized: boolean;
}

/**
 * Интерфейс для действий аутентификации
 */
export interface AuthActions {
  /** Вход в систему */
  login: (credentials: LoginCredentials) => Promise<User>;
  /** Выход из системы */
  logout: () => Promise<void>;
  /** Регистрация */
  signup: (data: SignupData) => Promise<User>;
  /** Обновление токена */
  refreshToken: () => Promise<AuthSession>;
  /** Сброс ошибки */
  clearError: () => void;
  /** Проверка разрешения */
  hasPermission: (permission: string) => boolean;
  /** Проверка роли */
  hasRole: (role: string) => boolean;
  /** Обновление профиля пользователя */
  updateProfile: (data: Partial<User>) => Promise<User>;
  /** Инициализация контекста */
  initialize: () => Promise<void>;
}

/**
 * Интерфейс контекста аутентификации
 */
export interface AuthContextValue extends AuthState, AuthActions {}

/**
 * Начальное состояние аутентификации
 */
const initialState: AuthState = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  isInitialized: false,
};

/**
 * Контекст аутентификации
 */
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Props для провайдера аутентификации
 */
export interface AuthProviderProps {
  /** Дочерние элементы */
  children: ReactNode;
  /** Экземпляр сервиса аутентификации */
  authService?: AuthService;
  /** Автоматически инициализировать при монтировании */
  autoInitialize?: boolean;
  /** Обработчик ошибок */
  onError?: (error: Error) => void;
  /** Обработчик успешной аутентификации */
  onAuthSuccess?: (user: User) => void;
  /** Обработчик выхода из системы */
  onLogout?: () => void;
}

/**
 * Провайдер контекста аутентификации
 * 
 * @example
 * ```tsx
 * // Базовое использование
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * 
 * // С кастомным сервисом и обработчиками
 * <AuthProvider
 *   authService={customAuthService}
 *   onError={handleAuthError}
 *   onAuthSuccess={handleAuthSuccess}
 * >
 *   <App />
 * </AuthProvider>
 * ```
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  authService: providedAuthService,
  autoInitialize = true,
  onError,
  onAuthSuccess,
  onLogout,
}) => {
  // State
  const [state, setState] = useState<AuthState>(initialState);

  // Auth service instance
  const authService = useMemo(() => {
    const defaultConfig = {
      apiEndpoint: '/api/auth',
      tokenStorage: 'localStorage' as const,
      refreshThreshold: 5, // 5 minutes
      sessionTimeout: 1440, // 24 hours
      maxLoginAttempts: 5,
      lockoutDuration: 30, // 30 minutes
      passwordRequirements: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        prohibitCommonPasswords: true,
        prohibitPersonalInfo: true,
      },
      mfaRequired: false,
      rememberMeEnabled: true,
      maxSessions: 3,
    };
    return providedAuthService || new AuthService(defaultConfig);
  }, [providedAuthService]);

  /**
   * Обновление состояния
   */
  const updateState = useCallback((updates: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Обработка ошибок
   */
  const handleError = useCallback((error: Error | string) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    updateState({ error: errorMessage, isLoading: false });
    
    if (onError && typeof error !== 'string') {
      onError(error);
    }
  }, [onError, updateState]);

  /**
   * Инициализация контекста
   */
  const initialize = useCallback(async () => {
    if (state.isInitialized) return;

    try {
      updateState({ isLoading: true, error: null });

      const session = await authService.getCurrentSession();
      
      if (session) {
        updateState({
          user: session.user,
          session,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        updateState({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      handleError(error as Error);
      updateState({ isInitialized: true });
    }
  }, [authService, handleError, updateState, state.isInitialized]);

  /**
   * Вход в систему
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    try {
      updateState({ isLoading: true, error: null });

      const loginResponse = await authService.login(credentials);
      
      if (!loginResponse.success || !loginResponse.data) {
        throw new Error(loginResponse.error?.message || 'Login failed');
      }

      const { user, session } = loginResponse.data;

      updateState({
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
      });

      if (onAuthSuccess) {
        onAuthSuccess(user);
      }

      return user;
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [authService, handleError, updateState, onAuthSuccess]);

  /**
   * Выход из системы
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });

      await authService.logout();

      updateState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      });

      if (onLogout) {
        onLogout();
      }
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [authService, handleError, updateState, onLogout]);

  /**
   * Регистрация
   */
  const signup = useCallback(async (data: SignupData): Promise<User> => {
    try {
      updateState({ isLoading: true, error: null });

      const signupResponse = await authService.signup(data);
      
      if (!signupResponse.success || !signupResponse.data) {
        throw new Error(signupResponse.error?.message || 'Signup failed');
      }

      const { user } = signupResponse.data;
      const session = await authService.getCurrentSession();

      updateState({
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
      });

      if (onAuthSuccess) {
        onAuthSuccess(user);
      }

      return user;
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [authService, handleError, updateState, onAuthSuccess]);

  /**
   * Обновление токена
   */
  const refreshToken = useCallback(async (): Promise<AuthSession> => {
    try {
      const refreshResponse = await authService.refreshToken();
      
      if (!refreshResponse.success || !refreshResponse.data) {
        throw new Error(refreshResponse.error?.message || 'Token refresh failed');
      }

      const { session } = refreshResponse.data;
      
      updateState({
        session,
        user: session.user,
      });

      return session;
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [authService, handleError, updateState]);

  /**
   * Сброс ошибки
   */
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  /**
   * Проверка разрешения
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!state.user?.permissions) return false;
    return state.user.permissions.some(p => p.name === permission);
  }, [state.user]);

  /**
   * Проверка роли
   */
  const hasRole = useCallback((role: string): boolean => {
    if (!state.user?.roles) return false;
    return state.user.roles.some(r => r.name === role);
  }, [state.user]);

  /**
   * Обновление профиля пользователя
   */
  const updateProfile = useCallback(async (data: Partial<User>): Promise<User> => {
    if (!state.user) {
      throw new Error('User not authenticated');
    }

    try {
      updateState({ isLoading: true, error: null });

      // TODO: Implement user profile update when available in AuthService
      const updatedUser = { ...state.user, ...data };
      
      updateState({
        user: updatedUser,
        isLoading: false,
      });

      return updatedUser;
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [handleError, updateState, state.user]);

  /**
   * Значение контекста
   */
  const contextValue = useMemo<AuthContextValue>(() => ({
    // State
    ...state,
    // Actions
    login,
    logout,
    signup,
    refreshToken,
    clearError,
    hasPermission,
    hasRole,
    updateProfile,
    initialize,
  }), [
    state,
    login,
    logout,
    signup,
    refreshToken,
    clearError,
    hasPermission,
    hasRole,
    updateProfile,
    initialize,
  ]);

  /**
   * Автоматическая инициализация
   */
  useEffect(() => {
    if (autoInitialize && !state.isInitialized) {
      initialize();
    }
  }, [autoInitialize, initialize, state.isInitialized]);

  /**
   * Подписка на события сервиса аутентификации
   */
  useEffect(() => {
    const handleAuthStateChange = (...args: unknown[]) => {
      const user = args[0] as User | null;
      updateState({
        user,
        isAuthenticated: !!user,
      });
    };

    const handleTokenExpired = () => {
      updateState({
        user: null,
        session: null,
        isAuthenticated: false,
        error: 'Session expired',
      });
    };

    // Подписка на события
    authService.on('authStateChange', handleAuthStateChange);
    authService.on('tokenExpired', handleTokenExpired);

    // Отписка при размонтировании
    return () => {
      authService.off('authStateChange', handleAuthStateChange);
      authService.off('tokenExpired', handleTokenExpired);
    };
  }, [authService, updateState]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Хук для использования контекста аутентификации
 * 
 * @example
 * ```tsx
 * const { user, login, logout, isLoading } = useAuthContext();
 * 
 * if (isLoading) return <div>Loading...</div>;
 * 
 * return (
 *   <div>
 *     {user ? (
 *       <button onClick={logout}>Logout {user.email}</button>
 *     ) : (
 *       <button onClick={() => login(credentials)}>Login</button>
 *     )}
 *   </div>
 * );
 * ```
 */
export const useAuthContext = (): AuthContextValue => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthContext;
