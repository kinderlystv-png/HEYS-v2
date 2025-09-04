// components/UsersTabPanel/components/UsersList.tsx - Список пользователей

import React, { memo } from 'react';

import { CuratorUser, CuratorUserRole } from '../../../types/curator.types';

interface UsersListProps {
  users: CuratorUser[];
  selectedUserId: string | null;
  onUserSelect: (userId: string) => void;
  _onRoleUpdate: (userId: string, newRole: CuratorUserRole) => Promise<{ success: boolean; error?: string }>;
  className?: string;
}

const UsersList: React.FC<UsersListProps> = ({
  users,
  selectedUserId,
  onUserSelect,
  _onRoleUpdate,
  className = ''
}) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: { text: 'Активен', className: 'status-active' },
      inactive: { text: 'Неактивен', className: 'status-inactive' },
      suspended: { text: 'Заблокирован', className: 'status-suspended' }
    };
    return badges[status as keyof typeof badges] || { text: status, className: 'status-unknown' };
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      admin: { text: 'Администратор', className: 'role-admin' },
      curator: { text: 'Куратор', className: 'role-curator' },
      moderator: { text: 'Модератор', className: 'role-moderator' },
      user: { text: 'Пользователь', className: 'role-user' }
    };
    return badges[role as keyof typeof badges] || { text: role, className: 'role-unknown' };
  };

  if (users.length === 0) {
    return (
      <div className={`users-list empty ${className}`}>
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">👥</div>
          <h3>Пользователи не найдены</h3>
          <p>Попробуйте изменить критерии поиска или фильтры</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`users-list ${className}`}>
      <div className="list-header">
        <h3>Пользователи ({users.length})</h3>
      </div>
      
      <div className="users-grid">
        {users.map((user) => {
          const statusBadge = getStatusBadge(user.status);
          const roleBadge = getRoleBadge(user.role);
          const isSelected = selectedUserId === user.id;
          
          return (
            <div
              key={user.id}
              className={`user-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onUserSelect(user.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onUserSelect(user.id);
                }
              }}
              aria-pressed={isSelected}
            >
              <div className="user-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt={`Аватар ${user.name}`} />
                ) : (
                  <div className="avatar-placeholder">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-email">{user.email}</div>
                
                <div className="user-badges">
                  <span className={`badge ${roleBadge.className}`}>
                    {roleBadge.text}
                  </span>
                  <span className={`badge ${statusBadge.className}`}>
                    {statusBadge.text}
                  </span>
                </div>
                
                <div className="user-dates">
                  {user.lastActivity && (
                    <div className="last-activity">
                      Последняя активность: {formatDate(user.lastActivity)}
                    </div>
                  )}
                  <div className="created-at">
                    Создан: {formatDate(user.createdAt)}
                  </div>
                </div>
              </div>
              
              <div className="user-actions">
                <button
                  type="button"
                  className="action-button edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUserSelect(user.id);
                  }}
                  title="Редактировать пользователя"
                  aria-label={`Редактировать пользователя ${user.name}`}
                >
                  ✏️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(UsersList);
