// components/TabNavigation.tsx - Навигация между вкладками панели куратора

import React, { memo } from 'react';

import { useCuratorContext } from '../context/CuratorContext';
import { TabId } from '../types/curator.types';

interface TabNavigationProps {
  className?: string;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ className = '' }) => {
  const { activeTab, setActiveTab, curatorData } = useCuratorContext();
  const { isLoading } = curatorData;

  const tabs: Array<{ id: TabId; label: string; icon: string; badge?: number }> = [
    { 
      id: 'users', 
      label: 'Пользователи', 
      icon: '👥',
      ...(curatorData.stats.totalUsers > 0 && { badge: curatorData.stats.totalUsers })
    },
    { 
      id: 'tasks', 
      label: 'Задачи', 
      icon: '📋',
      ...(curatorData.stats.pendingTasks > 0 && { badge: curatorData.stats.pendingTasks })
    },
    { 
      id: 'statistics', 
      label: 'Статистика', 
      icon: '📊' 
    },
    { 
      id: 'settings', 
      label: 'Настройки', 
      icon: '⚙️' 
    },
  ];

  const handleTabClick = (tabId: TabId) => {
    if (!isLoading) {
      setActiveTab(tabId);
    }
  };

  return (
    <nav className={`curator-tab-navigation ${className}`}>
      <div className="tab-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''} ${isLoading ? 'disabled' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            disabled={isLoading}
            title={tab.label}
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="tab-label">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge" aria-label={`${tab.badge} элементов`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {isLoading && (
        <div className="loading-indicator" aria-live="polite">
          <span className="loading-text">Загрузка данных...</span>
          <div className="loading-spinner" aria-hidden="true">⟳</div>
        </div>
      )}
    </nav>
  );
};

export default memo(TabNavigation);
