// filepath: packages/auth/src/components/RoleGate.tsx

import React, { ReactNode } from 'react';

import { useAuth } from '../hooks/useAuth';
import { Role } from '../types/auth.types';

/**
 * Props для компонента RoleGate
 */
export interface RoleGateProps {
  /** Дочерние элементы для рендера */
  children: ReactNode;
  /** Требуемые роли (все должны быть выполнены) */
  roles?: Role[];
  /** Требуемые роли (любая может быть выполнена) */
  anyRoles?: Role[];
  /** Компонент для отображения при отсутствии ролей */
  fallback?: ReactNode;
  /** Инвертировать логику (показать если ролей НЕТ) */
  inverse?: boolean;
  /** Показать компонент загрузки во время проверки */
  showLoading?: boolean;
  /** Компонент загрузки */
  loadingComponent?: ReactNode;
}

/**
 * Компонент для условного рендеринга на основе ролей пользователя
 * 
 * @example
 * ```tsx
 * // Показать только администраторам
 * <RoleGate roles={['admin']}>
 *   <AdminPanel />
 * </RoleGate>
 * 
 * // Показать администраторам или модераторам
 * <RoleGate anyRoles={['admin', 'moderator']}>
 *   <ModerationTools />
 * </RoleGate>
 * 
 * // Показать всем кроме гостей
 * <RoleGate roles={['guest']} inverse>
 *   <UserContent />
 * </RoleGate>
 * 
 * // С кастомным fallback
 * <RoleGate 
 *   roles={['premium']}
 *   fallback={<UpgradePrompt />}
 * >
 *   <PremiumFeature />
 * </RoleGate>
 * ```
 */
export const RoleGate: React.FC<RoleGateProps> = ({
  children,
  roles = [],
  anyRoles = [],
  fallback = null,
  inverse = false,
  showLoading = false,
  loadingComponent = <div>Loading...</div>,
}) => {
  const { hasRole, isLoading, isAuthenticated } = useAuth();

  /**
   * Показать компонент загрузки если требуется
   */
  if (showLoading && isLoading) {
    return <>{loadingComponent}</>;
  }

  /**
   * Если пользователь не авторизован, показать fallback
   */
  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  /**
   * Проверка ролей
   */
  let hasRequiredRoles = true;

  // Проверка что все роли есть
  if (roles.length > 0) {
    hasRequiredRoles = roles.every(role => hasRole(role.name || role.toString()));
  }

  // Проверка что есть хотя бы одна из ролей
  if (anyRoles.length > 0) {
    const hasAnyRole = anyRoles.some(role => hasRole(role.name || role.toString()));
    hasRequiredRoles = hasRequiredRoles && hasAnyRole;
  }

  /**
   * Применение логики inverse
   */
  const shouldRender = inverse ? !hasRequiredRoles : hasRequiredRoles;

  return shouldRender ? <>{children}</> : <>{fallback}</>;
};

/**
 * Высокоуровневые компоненты для частых случаев использования
 */

/**
 * Компонент для отображения только при наличии ALL указанных ролей
 */
export const RequireAllRoles: React.FC<{
  children: ReactNode;
  roles: Role[];
  fallback?: ReactNode;
}> = ({ children, roles, fallback }) => (
  <RoleGate roles={roles} fallback={fallback}>
    {children}
  </RoleGate>
);

/**
 * Компонент для отображения при наличии ANY из указанных ролей
 */
export const RequireAnyRole: React.FC<{
  children: ReactNode;
  roles: Role[];
  fallback?: ReactNode;
}> = ({ children, roles, fallback }) => (
  <RoleGate anyRoles={roles} fallback={fallback}>
    {children}
  </RoleGate>
);

/**
 * Компонент для отображения при ОТСУТСТВИИ ролей
 */
export const HideIfRoles: React.FC<{
  children: ReactNode;
  roles: Role[];
  fallback?: ReactNode;
}> = ({ children, roles, fallback }) => (
  <RoleGate roles={roles} inverse fallback={fallback}>
    {children}
  </RoleGate>
);

/**
 * Админ gate - специальный компонент для администраторов
 */
export const AdminGate: React.FC<{
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}> = ({ children, fallback, showLoading = true }) => (
  <RoleGate 
    anyRoles={[{ name: 'admin' } as Role]} 
    fallback={fallback}
    showLoading={showLoading}
  >
    {children}
  </RoleGate>
);

/**
 * Модератор gate
 */
export const ModeratorGate: React.FC<{
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}> = ({ children, fallback, showLoading = true }) => (
  <RoleGate 
    anyRoles={[
      { name: 'admin' } as Role, 
      { name: 'moderator' } as Role
    ]} 
    fallback={fallback}
    showLoading={showLoading}
  >
    {children}
  </RoleGate>
);

/**
 * Пользователь gate (исключает гостей)
 */
export const UserGate: React.FC<{
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}> = ({ children, fallback, showLoading = true }) => (
  <RoleGate 
    roles={[{ name: 'guest' } as Role]} 
    inverse 
    fallback={fallback}
    showLoading={showLoading}
  >
    {children}
  </RoleGate>
);

export default RoleGate;
