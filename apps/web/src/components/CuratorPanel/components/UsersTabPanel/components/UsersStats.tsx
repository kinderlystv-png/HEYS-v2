// components/UsersTabPanel/components/UsersStats.tsx - Статистика пользователей

import React, { memo } from 'react';

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  byRole: Record<string, number>;
}

interface UsersStatsProps {
  stats: UserStats;
  isLoading?: boolean;
  className?: string;
}

const UsersStats: React.FC<UsersStatsProps> = ({ 
  stats, 
  isLoading = false,
  className = ''
}) => {
  if (isLoading) {
    return (
      <div className={`users-stats loading ${className}`}>
        <div className="stats-placeholder" aria-label="Загрузка статистики">
          ⟳ Загрузка статистики...
        </div>
      </div>
    );
  }

  const roleEntries = Object.entries(stats.byRole);

  return (
    <div className={`users-stats ${className}`}>
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Всего пользователей</div>
        </div>
        
        <div className="stat-card success">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Активные</div>
        </div>
        
        <div className="stat-card warning">
          <div className="stat-value">{stats.inactive}</div>
          <div className="stat-label">Неактивные</div>
        </div>
        
        <div className="stat-card danger">
          <div className="stat-value">{stats.suspended}</div>
          <div className="stat-label">Заблокированные</div>
        </div>
      </div>
      
      {roleEntries.length > 0 && (
        <div className="roles-breakdown">
          <h4>По ролям:</h4>
          <div className="roles-list">
            {roleEntries.map(([role, count]) => (
              <div key={role} className="role-stat">
                <span className="role-name">{role}</span>
                <span className="role-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(UsersStats);
