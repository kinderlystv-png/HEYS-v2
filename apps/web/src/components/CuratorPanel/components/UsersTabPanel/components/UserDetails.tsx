// components/UsersTabPanel/components/UserDetails.tsx - Детали пользователя

import React, { memo, useState } from 'react';

import { CuratorUser, CuratorUserRole } from '../../../types/curator.types';

interface UserDetailsProps {
  user: CuratorUser;
  onRoleUpdate: (userId: string, newRole: CuratorUserRole) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
  className?: string;
}

const UserDetails: React.FC<UserDetailsProps> = ({
  user,
  onRoleUpdate,
  onClose,
  className = ''
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleRoleChange = async (newRole: CuratorUserRole) => {
    if (newRole === user.role) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const result = await onRoleUpdate(user.id, newRole);
      if (!result.success) {
        setUpdateError(result.error || 'Ошибка обновления роли');
      }
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsUpdating(false);
    }
  };

  const roleOptions: Array<{ value: CuratorUserRole; label: string; description: string }> = [
    { value: 'admin', label: 'Администратор', description: 'Полный доступ ко всем функциям' },
    { value: 'curator', label: 'Куратор', description: 'Управление пользователями и контентом' },
    { value: 'moderator', label: 'Модератор', description: 'Модерация контента' },
    { value: 'user', label: 'Пользователь', description: 'Базовые права пользователя' }
  ];

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'green',
      inactive: 'orange',
      suspended: 'red'
    };
    return colors[status as keyof typeof colors] || 'gray';
  };

  return (
    <div className={`user-details ${className}`}>
      <div className="details-header">
        <h3>Детали пользователя</h3>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          title="Закрыть"
          aria-label="Закрыть панель деталей"
        >
          ✕
        </button>
      </div>

      <div className="details-content">
        <div className="user-profile">
          <div className="profile-avatar">
            {user.avatar ? (
              <img src={user.avatar} alt={`Аватар ${user.name}`} />
            ) : (
              <div className="avatar-placeholder large">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          <div className="profile-info">
            <h4 className="profile-name">{user.name}</h4>
            <p className="profile-email">{user.email}</p>
            <div className={`profile-status status-${user.status}`}>
              <span 
                className="status-indicator" 
                style={{ backgroundColor: getStatusColor(user.status) }}
                aria-hidden="true"
              ></span>
              {user.status === 'active' ? 'Активен' : 
               user.status === 'inactive' ? 'Неактивен' : 'Заблокирован'}
            </div>
          </div>
        </div>

        <div className="details-section">
          <h5>Роль пользователя</h5>
          {updateError && (
            <div className="error-message" role="alert">
              ❌ {updateError}
            </div>
          )}
          <div className="role-selector">
            {roleOptions.map((option) => (
              <label key={option.value} className="role-option">
                <input
                  type="radio"
                  name="user-role"
                  value={option.value}
                  checked={user.role === option.value}
                  onChange={() => handleRoleChange(option.value)}
                  disabled={isUpdating}
                />
                <div className="role-content">
                  <div className="role-label">{option.label}</div>
                  <div className="role-description">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
          {isUpdating && (
            <div className="updating-indicator" aria-live="polite">
              ⟳ Обновление роли...
            </div>
          )}
        </div>

        <div className="details-section">
          <h5>Права доступа</h5>
          <div className="permissions-list">
            {user.permissions.map((permission) => (
              <span key={permission} className="permission-badge">
                {permission}
              </span>
            ))}
            {user.permissions.length === 0 && (
              <p className="no-permissions">Права доступа не назначены</p>
            )}
          </div>
        </div>

        <div className="details-section">
          <h5>Информация об учетной записи</h5>
          <div className="account-info">
            <div className="info-row">
              <span className="info-label">ID пользователя:</span>
              <span className="info-value">{user.id}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Дата создания:</span>
              <span className="info-value">{formatDate(user.createdAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Последнее обновление:</span>
              <span className="info-value">{formatDate(user.updatedAt)}</span>
            </div>
            {user.lastActivity && (
              <div className="info-row">
                <span className="info-label">Последняя активность:</span>
                <span className="info-value">{formatDate(user.lastActivity)}</span>
              </div>
            )}
          </div>
        </div>

        {user.metadata && Object.keys(user.metadata).length > 0 && (
          <div className="details-section">
            <h5>Дополнительная информация</h5>
            <div className="metadata-info">
              {Object.entries(user.metadata).map(([key, value]) => (
                <div key={key} className="info-row">
                  <span className="info-label">{key}:</span>
                  <span className="info-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UserDetails);
