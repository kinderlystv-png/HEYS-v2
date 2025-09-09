// filepath: packages/auth/src/components/RouterProtectedRoute.tsx

import React, { ReactNode, useEffect, useState } from 'react';

import { useAuth } from '../hooks/useAuth';
import { Permission, Role } from '../types/auth.types';

/**
 * Router interface for dependency injection
 */
export interface Router {
  push: (url: string) => Promise<boolean> | void;
}

/**
 * Props для компонента RouterProtectedRoute
 */
export interface RouterProtectedRouteProps {
  /** Дочерние элементы для рендера */
  children: ReactNode;
  /** Router instance (Next.js router, React Router, etc.) */
  router?: Router;
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
 * Компонент для защиты маршрутов с инъекцией router зависимости
 * Совместим с любым router (Next.js, React Router, etc.)
 */
export const RouterProtectedRoute: React.FC<RouterProtectedRouteProps> = ({
  children,
  router,
  requiredPermissions = [],
  requiredRoles = [],
  fallbackRoute = '/login',
  loadingComponent = <div>Loading...</div>,
  unauthorizedComponent = <div>Access Denied</div>,
  requireAuth = false,
  inverse = false,
}) => {
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

        // Редирект если нет доступа и есть router
        if (!accessGranted && !inverse && router && fallbackRoute) {
          await router.push(fallbackRoute);
        }
      } catch (error) {
        // TODO: Implement proper error logging
        setHasAccess(false);
        
        if (!inverse && router && fallbackRoute) {
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

export default RouterProtectedRoute;
