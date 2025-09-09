// filepath: packages/auth/src/components/AuthGuard.tsx

import React, { ReactNode, useEffect } from 'react';

import { useAuth } from '../hooks/useAuth';

/**
 * Router interface for dependency injection
 */
export interface Router {
  push: (url: string) => Promise<boolean> | void;
}

/**
 * Props для компонента AuthGuard
 */
export interface AuthGuardProps {
  /** Дочерние элементы для рендера */
  children: ReactNode;
  /** Router instance (optional) */
  router?: Router | undefined;
  /** Маршрут для редиректа неавторизованных пользователей */
  loginRoute?: string | undefined;
  /** Маршрут для редиректа авторизованных пользователей */
  homeRoute?: string | undefined;
  /** Компонент загрузки во время проверки аутентификации */
  fallback?: ReactNode;
  /** Инвертировать логику (Guard для гостей) */
  inverse?: boolean;
  /** Включить автоматический редирект */
  autoRedirect?: boolean;
}

/**
 * Простой guard для проверки состояния аутентификации
 * 
 * @example
 * ```tsx
 * // Защита страницы для авторизованных пользователей
 * <AuthGuard>
 *   <Dashboard />
 * </AuthGuard>
 * 
 * // Защита страницы для неавторизованных пользователей
 * <AuthGuard inverse>
 *   <LoginForm />
 * </AuthGuard>
 * 
 * // Без автоматического редиректа
 * <AuthGuard autoRedirect={false} fallback={<AccessDenied />}>
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  router,
  loginRoute = '/login',
  homeRoute = '/',
  fallback = <div>Loading...</div>,
  inverse = false,
  autoRedirect = true,
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  /**
   * Эффект для обработки редиректов
   */
  useEffect(() => {
    if (isLoading || !autoRedirect || !router) {
      return; // Ждем загрузки или если автоматический редирект отключен или нет router
    }

    const shouldRedirect = inverse ? isAuthenticated : !isAuthenticated;
    const targetRoute = inverse ? homeRoute : loginRoute;

    if (shouldRedirect && targetRoute) {
      router.push(targetRoute);
    }
  }, [
    isLoading,
    isAuthenticated,
    inverse,
    autoRedirect,
    router,
    loginRoute,
    homeRoute,
  ]);

  /**
   * Показать fallback во время загрузки
   */
  if (isLoading) {
    return <>{fallback}</>;
  }

  /**
   * Логика отображения
   */
  const shouldRender = inverse ? !isAuthenticated : isAuthenticated;

  if (shouldRender) {
    return <>{children}</>;
  }

  /**
   * Если автоматический редирект отключен, показать fallback
   */
  if (!autoRedirect) {
    return <>{fallback}</>;
  }

  /**
   * Показать fallback во время редиректа
   */
  return <>{fallback}</>;
};

/**
 * Высокоуровневые компоненты для частых случаев использования
 */

/**
 * Guard для защиты контента от неавторизованных пользователей
 */
export const ProtectedGuard: React.FC<{
  children: ReactNode;
  router?: Router;
  loginRoute?: string | undefined;
  fallback?: ReactNode;
}> = ({ children, router, loginRoute, fallback }) => (
  <AuthGuard
    router={router}
    loginRoute={loginRoute}
    fallback={fallback}
  >
    {children}
  </AuthGuard>
);

/**
 * Guard для отображения контента только неавторизованным пользователям
 */
export const GuestGuard: React.FC<{
  children: ReactNode;
  router?: Router;
  homeRoute?: string | undefined;
  fallback?: ReactNode;
}> = ({ children, router, homeRoute, fallback }) => (
  <AuthGuard
    router={router}
    inverse
    homeRoute={homeRoute}
    fallback={fallback}
  >
    {children}
  </AuthGuard>
);

/**
 * Guard без автоматического редиректа
 */
export const ConditionalGuard: React.FC<{
  children: ReactNode;
  inverse?: boolean;
  fallback?: ReactNode;
}> = ({ children, inverse = false, fallback }) => (
  <AuthGuard
    inverse={inverse}
    autoRedirect={false}
    fallback={fallback}
  >
    {children}
  </AuthGuard>
);

export default AuthGuard;
