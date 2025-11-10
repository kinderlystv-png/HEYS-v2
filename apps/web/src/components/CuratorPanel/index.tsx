// index.tsx - Основная точка входа для компонента панели куратора

import React from 'react';

import CuratorPanelContainer from './CuratorPanelContainer';

/**
 * Панель куратора - основной компонент для управления пользователями и задачами
 *
 * Особенности:
 * - Lazy loading для оптимизации производительности
 * - Мемоизация компонентов для предотвращения лишних ререндеров
 * - Типизированные данные и состояния
 * - Контекст для управления общими данными
 * - Раздельные хуки для каждой вкладки
 */
const CuratorPanel: React.FC = () => {
  return <CuratorPanelContainer />;
};

export default CuratorPanel;
