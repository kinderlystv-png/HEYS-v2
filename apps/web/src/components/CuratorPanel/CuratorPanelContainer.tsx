// CuratorPanelContainer.tsx - Основной контейнер с роутингом вкладок

import React, { lazy, Suspense } from 'react';

import TabNavigation from './components/TabNavigation';
import { CuratorProvider, useCuratorContext } from './context/CuratorContext';

// Используем lazy loading для вкладок для оптимизации производительности
const UsersTabPanel = lazy(() => import('./components/UsersTabPanel'));
// TODO: Создать остальные компоненты вкладок
// const TasksTabPanel = lazy(() => import('./components/TasksTabPanel'));
// const StatsTabPanel = lazy(() => import('./components/StatsTabPanel'));
// const SettingsTabPanel = lazy(() => import('./components/SettingsTabPanel'));

const LoadingFallback: React.FC = () => (
  <div className="tab-loading" role="status" aria-live="polite">
    <div className="loading-spinner">
      <div className="spinner-circle" aria-hidden="true">⟳</div>
      <span>Загрузка вкладки...</span>
    </div>
  </div>
);

const PlaceholderTab: React.FC<{ tabName: string }> = ({ tabName }) => (
  <div className="placeholder-tab">
    <h2>Вкладка "{tabName}"</h2>
    <p>Компонент в разработке...</p>
  </div>
);

const CuratorPanelContent: React.FC = () => {
  const { activeTab, curatorData } = useCuratorContext();
  
  return (
    <div className="curator-panel">
      <header className="panel-header">
        <h1>Панель куратора</h1>
        <div className="header-info">
          {curatorData.error && (
            <div className="header-error" role="alert">
              ⚠️ Ошибка загрузки данных
            </div>
          )}
        </div>
      </header>
      
      <TabNavigation />
      
      <main className="panel-main">
        <div className="tab-content">
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === 'users' && <UsersTabPanel />}
            {activeTab === 'tasks' && <PlaceholderTab tabName="Задачи" />}
            {activeTab === 'statistics' && <PlaceholderTab tabName="Статистика" />}
            {activeTab === 'settings' && <PlaceholderTab tabName="Настройки" />}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

const CuratorPanelContainer: React.FC = () => {
  return (
    <CuratorProvider>
      <CuratorPanelContent />
    </CuratorProvider>
  );
};

export default CuratorPanelContainer;
