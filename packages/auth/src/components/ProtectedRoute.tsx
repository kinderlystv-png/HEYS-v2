// filepath: packages/auth/src/components/ProtectedRoute.tsx

// This component requires Next.js - use RouterProtectedRoute for framework-agnostic version
import React, { ReactNode, useEffect, useState } from 'react';

import { useAuth } from '../hooks/useAuth';
import { Permission, Role } from '../types/auth.types';

// Type-only import to avoid runtime dependency
type Router = {
  push: (url: string) => Promise<boolean>;
};

// Mock useRouter for when Next.js is not available
const mockUseRouter = (): Router => ({
  push: async (url: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
    return true;
  },
});

// Conditional import of Next.js router
let useRouter: () => Router;
try {
  // Try to import Next.js router
  const nextRouter = require('next/router');
  useRouter = nextRouter.useRouter;
} catch {
  // Fallback to mock router
  useRouter = mockUseRouter;
}

/**
 * Props для компонента ProtectedRoute
 */
export interface ProtectedRouteProps {
  /** Дочерние элементы для рендера */
  children: ReactNode;
  /** Требуемые разрешения для доступа */
  requiredPermissions?: Permission[];
  /** Требуемые роли для доступа */
  requiredRoles?: Role[];
  /** Маршрут для редиректа при отсутствии доступа */
  fallbackRoute?: string | undefined;
  /** Компонент загрузки */
  loadingComponent?: ReactNode;
  /** Компонент для неавторизованных пользователей */
  unauthorizedComponent?: ReactNode;
  /** Проверять только аутентификацию без разрешений */
  requireAuth?: boolean;
  /** Инвертировать логику (только для неавторизованных) */
  inverse?: boolean;
}

/**
 * Компонент для защиты маршрутов с проверкой аутентификации и авторизации
 * 
 * @example
 * ```tsx
 * // Защита только аутентификацией
 * <ProtectedRoute requireAuth>
 *   <Dashboard />
 * </ProtectedRoute>
 * 
 * // Защита с проверкой разрешений
 * <ProtectedRoute requiredPermissions={['read:posts', 'write:posts']}>
 *   <PostEditor />
 * </ProtectedRoute>
 * 
 * // Защита с проверкой ролей
 * <ProtectedRoute requiredRoles={['admin', 'moderator']}>
 *   <AdminPanel />
 * </ProtectedRoute>
 * ```
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  fallbackRoute = '/login',
  loadingComponent = <div>Loading...</div>,
  unauthorizedComponent = <div>Access Denied</div>,
  requireAuth = false,
  inverse = false,
}) => {
  const router = useRouter();
  const { user, isAuthenticated, hasPermission, hasRole, isLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  /**
   * Проверка доступа пользователя
   */
  const checkAccess = React.useCallback(async (): Promise<boolean> => {
    // Если инвертированная логика - проверяем что пользователь НЕ авторизован
    if (inverse) {
      return !isAuthenticated;
    }

    // Базовая проверка аутентификации
    if (requireAuth || requiredPermissions.length > 0 || requiredRoles.length > 0) {
      if (!isAuthenticated || !user) {
        return false;
      }
    }

    // Проверка разрешений
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission => 
        hasPermission(permission.name || permission.toString())
      );
      if (!hasAllPermissions) {
        return false;
      }
    }

    // Проверка ролей
    if (requiredRoles.length > 0) {
      const hasAnyRole = requiredRoles.some(role => hasRole(role.name || role.toString()));
      if (!hasAnyRole) {
        return false;
      }
    }

    return true;
  }, [
    isAuthenticated,
    user,
    requiredPermissions,
    requiredRoles,
    requireAuth,
    inverse,
    hasPermission,
    hasRole,
  ]);

  /**
   * Эффект для проверки доступа при изменении зависимостей
   */
  useEffect(() => {
    const performAccessCheck = async () => {
      if (isLoading) {
        return; // Ждем загрузки данных пользователя
      }

      setIsChecking(true);
      
      try {
        const accessGranted = await checkAccess();
        setHasAccess(accessGranted);

        // Редирект если нет доступа
        if (!accessGranted && !inverse) {
          await router.push(fallbackRoute);
        }
      } catch (error) {
        // TODO: Implement proper error logging
        setHasAccess(false);
        
        if (!inverse) {
          await router.push(fallbackRoute);
        }
      } finally {
        setIsChecking(false);
      }
    };

    performAccessCheck();
  }, [
    isLoading,
    checkAccess,
    router,
    fallbackRoute,
    inverse,
  ]);

  /**
   * Показать компонент загрузки
   */
  if (isLoading || isChecking) {
    return <>{loadingComponent}</>;
  }

  /**
   * Для инвертированной логики - показать детей если НЕ авторизован
   */
  if (inverse) {
    return hasAccess ? <>{children}</> : <>{unauthorizedComponent}</>;
  }

  /**
   * Обычная логика - показать детей если есть доступ
   */
  if (hasAccess) {
    return <>{children}</>;
  }

  /**
   * Показать компонент отказа в доступе
   */
  return <>{unauthorizedComponent}</>;
};

/**
 * Высокоуровневые компоненты для частых случаев использования
 */

/**
 * Компонент для защиты только аутентификацией
 */
export const RequireAuth: React.FC<{
  children: ReactNode;
  fallbackRoute?: string | undefined;
  loadingComponent?: ReactNode;
}> = ({ children, fallbackRoute, loadingComponent }) => (
  <ProtectedRoute
    requireAuth
    fallbackRoute={fallbackRoute}
    loadingComponent={loadingComponent}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Компонент для отображения только неавторизованным пользователям
 */
export const RequireGuest: React.FC<{
  children: ReactNode;
  fallbackRoute?: string | undefined;
}> = ({ children, fallbackRoute = '/' }) => (
  <ProtectedRoute
    inverse
    fallbackRoute={fallbackRoute}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Компонент для проверки конкретных разрешений
 */
export const RequirePermissions: React.FC<{
  children: ReactNode;
  permissions: Permission[];
  fallbackRoute?: string | undefined;
  unauthorizedComponent?: ReactNode;
}> = ({ children, permissions, fallbackRoute, unauthorizedComponent }) => (
  <ProtectedRoute
    requiredPermissions={permissions}
    fallbackRoute={fallbackRoute}
    unauthorizedComponent={unauthorizedComponent}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Компонент для проверки конкретных ролей
 */
export const RequireRoles: React.FC<{
  children: ReactNode;
  roles: Role[];
  fallbackRoute?: string | undefined;
  unauthorizedComponent?: ReactNode;
}> = ({ children, roles, fallbackRoute, unauthorizedComponent }) => (
  <ProtectedRoute
    requiredRoles={roles}
    fallbackRoute={fallbackRoute}
    unauthorizedComponent={unauthorizedComponent}
  >
    {children}
  </ProtectedRoute>
);

export default ProtectedRoute;
